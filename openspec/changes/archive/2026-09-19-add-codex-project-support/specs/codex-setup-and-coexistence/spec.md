## ADDED Requirements

### Requirement: Preservação integral do Claude

A migração SHALL preservar conteúdo e existência de `.claude/**`, dos três `CLAUDE.md`, de `.mcp.json`, `.mcp.json.example`, `skills-lock.json` e `_claude-sessions/**`, incluindo arquivos locais não versionados. A comparação SHALL usar o estado inicial do workspace.

#### Scenario: Arquivos OpenSpec do Claude ainda não versionados
- **WHEN** a migração termina em um workspace que já possuía esses arquivos
- **THEN** seus hashes e caminhos permanecem iguais ao baseline e nenhum novo arquivo foi inserido no conjunto protegido

### Requirement: Configuração de integrações independente

O projeto SHALL fornecer guia Codex e exemplo TOML para integrações utilizadas pelos fluxos, incluindo Context7, Figma e PostgreSQL. Configuração opcional SHALL permanecer inativa e sem credenciais reais; a migração SHALL NOT alterar configuração pessoal ou importar automaticamente `.mcp.json`.

#### Scenario: Usuário configura integrações
- **WHEN** o usuário segue o guia Codex
- **THEN** encontra requisitos, exemplos e procedimentos de verificação sem precisar modificar a configuração Claude

#### Scenario: Figma indisponível
- **WHEN** uma etapa necessita de contexto e screenshot do Figma, mas não há ferramenta compatível disponível
- **THEN** o fluxo informa a dependência ausente, preserva trabalho independente e não declara validação visual realizada

#### Scenario: Context7 indisponível
- **WHEN** uma consulta de biblioteca exige documentação e Context7 não está disponível
- **THEN** a adaptação permite fonte oficial da versão instalada, registra a alternativa e não inventa resultado de ferramenta

### Requirement: Rastreabilidade e verificação

O projeto SHALL incluir inventário origem-destino e verificação de cobertura, metadados, TOML, links, destinos de geração e preservação do Claude. Evidências SHALL distinguir validação estática de descoberta e execução reais.

#### Scenario: Recurso auxiliar ausente
- **WHEN** uma referência obrigatória de uma skill não resolve
- **THEN** a validação falha com identificação do recurso e da skill afetada

#### Scenario: Verificação dinâmica indisponível
- **WHEN** autenticação ou capacidade da sessão impede verificar descoberta ou execução de um agente
- **THEN** o relatório registra o teste como não executado e não considera a aprovação estática prova de funcionamento dinâmico

### Requirement: Isolamento do produto e reversibilidade

A migração SHALL limitar alterações aos recursos de assistência Codex, guia, inventário, verificador e artefatos OpenSpec. O rollback SHALL remover apenas adições próprias e restaurar arquivos Codex alterados ao baseline, preservando trabalho anterior do usuário.

#### Scenario: Conferência do escopo
- **WHEN** o conjunto final de alterações é revisado
- **THEN** código de aplicação, manifests npm, Compose, contratos OpenAPI, README existente e documentos de decisões/progresso anteriores estão inalterados

#### Scenario: Destinos protegidos pelo ambiente
- **WHEN** o ambiente proíbe escrita nos diretórios necessários à configuração Codex
- **THEN** a implementação registra a restrição e exige workspace com acesso permitido, sem contornar a proteção nem declarar migração concluída
