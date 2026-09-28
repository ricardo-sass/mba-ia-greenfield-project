## Purpose

Ensure Codex support can coexist with the existing Claude setup, document optional integrations, verify migration coverage, and preserve product scope and rollback boundaries.

## Requirements

### Requirement: Preservacao integral do Claude

A migracao SHALL preservar conteudo e existencia de `.claude/**`, dos tres `CLAUDE.md`, de `.mcp.json`, `.mcp.json.example`, `skills-lock.json` e `_claude-sessions/**`, incluindo arquivos locais nao versionados. A comparacao SHALL usar o estado inicial do workspace.

#### Scenario: Arquivos OpenSpec do Claude ainda nao versionados
- **WHEN** a migracao termina em um workspace que ja possuia esses arquivos
- **THEN** seus hashes e caminhos permanecem iguais ao baseline e nenhum novo arquivo foi inserido no conjunto protegido

### Requirement: Configuracao de integracoes independente

O projeto SHALL fornecer guia Codex e exemplo TOML para integracoes utilizadas pelos fluxos, incluindo Context7, Figma e PostgreSQL. Configuracao opcional SHALL permanecer inativa e sem credenciais reais; a migracao SHALL NOT alterar configuracao pessoal ou importar automaticamente `.mcp.json`.

#### Scenario: Usuario configura integracoes
- **WHEN** o usuario segue o guia Codex
- **THEN** encontra requisitos, exemplos e procedimentos de verificacao sem precisar modificar a configuracao Claude

#### Scenario: Figma indisponivel
- **WHEN** uma etapa necessita de contexto e screenshot do Figma, mas nao ha ferramenta compativel disponivel
- **THEN** o fluxo informa a dependencia ausente, preserva trabalho independente e nao declara validacao visual realizada

#### Scenario: Context7 indisponivel
- **WHEN** uma consulta de biblioteca exige documentacao e Context7 nao esta disponivel
- **THEN** a adaptacao permite fonte oficial da versao instalada, registra a alternativa e nao inventa resultado de ferramenta

### Requirement: Rastreabilidade e verificacao

O projeto SHALL incluir inventario origem-destino e verificacao de cobertura, metadados, TOML, links, destinos de geracao e preservacao do Claude. Evidencias SHALL distinguir validacao estatica de descoberta e execucao reais.

#### Scenario: Recurso auxiliar ausente
- **WHEN** uma referencia obrigatoria de uma skill nao resolve
- **THEN** a validacao falha com identificacao do recurso e da skill afetada

#### Scenario: Verificacao dinamica indisponivel
- **WHEN** autenticacao ou capacidade da sessao impede verificar descoberta ou execucao de um agente
- **THEN** o relatorio registra o teste como nao executado e nao considera a aprovacao estatica prova de funcionamento dinamico

### Requirement: Isolamento do produto e reversibilidade

A migracao SHALL limitar alteracoes aos recursos de assistencia Codex, guia, inventario, verificador e artefatos OpenSpec. O rollback SHALL remover apenas adicoes proprias e restaurar arquivos Codex alterados ao baseline, preservando trabalho anterior do usuario.

#### Scenario: Conferencia do escopo
- **WHEN** o conjunto final de alteracoes e revisado
- **THEN** codigo de aplicacao, manifests npm, Compose, contratos OpenAPI, README existente e documentos de decisoes/progresso anteriores estao inalterados

#### Scenario: Destinos protegidos pelo ambiente
- **WHEN** o ambiente proibe escrita nos diretorios necessarios a configuracao Codex
- **THEN** a implementacao registra a restricao e exige workspace com acesso permitido, sem contornar a protecao nem declarar migracao concluida
