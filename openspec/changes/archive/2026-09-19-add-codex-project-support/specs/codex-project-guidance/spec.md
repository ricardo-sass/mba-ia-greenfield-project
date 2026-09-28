## ADDED Requirements

### Requirement: Instruções por escopo

O repositório SHALL fornecer `AGENTS.md` na raiz e nos dois subprojetos, preservando as convenções técnicas dos respectivos `CLAUDE.md` e adaptando os mecanismos específicos do assistente. A instrução raiz SHALL exigir a leitura do AGENTS do subprojeto antes de atuar nele.

#### Scenario: Sessão iniciada na raiz trabalha no frontend
- **WHEN** o Codex recebe uma tarefa em `next-frontend/` a partir da raiz
- **THEN** as instruções exigem carregar `next-frontend/AGENTS.md`, incluindo BFF, OpenAPI, tokens, Docker e a exceção de Playwright no host

#### Scenario: Sessão iniciada no backend
- **WHEN** o Codex inicia em `nestjs-project/`
- **THEN** a cadeia de instruções contém os acordos da raiz e do backend sem depender de `CLAUDE.md`

### Requirement: Cobertura e escopo das regras

O suporte Codex SHALL conter equivalentes das 17 regras originais e uma associação explícita entre todos os padrões de origem e documentos obrigatórios. Regras Markdown SHALL ser lidas por instrução explícita, sem pressupor descoberta nativa de frontmatter `paths`.

#### Scenario: Alteração de controlador
- **WHEN** uma tarefa altera `nestjs-project/src/videos/videos.controller.ts`
- **THEN** o roteamento exige as regras correspondentes de controlador, separação de camadas, convenções comuns e TypeScript
- **AND** não aplica a regra de autenticação por esse caminho isoladamente

#### Scenario: Alteração de mocks do frontend
- **WHEN** uma tarefa altera `next-frontend/mocks/handlers.ts`
- **THEN** o roteamento inclui regras de MSW e qualidade de código do frontend
- **AND** não aplica regras exclusivas de entidades NestJS

### Requirement: Contexto técnico atual e comandos equivalentes

As instruções Codex SHALL refletir os subprojetos presentes e preservar convenções de execução, verificação e arquitetura. Exemplos SHALL usar mecanismos disponíveis no Codex, mantendo a distinção entre iniciar container e iniciar servidor.

#### Scenario: Inicialização do ambiente frontend
- **WHEN** o usuário pede somente para iniciar o ambiente de desenvolvimento
- **THEN** as instruções orientam iniciar e verificar o container, sem iniciar automaticamente o servidor Next.js

#### Scenario: Consulta da estrutura do monorepo
- **WHEN** o Codex consulta o AGENTS raiz
- **THEN** `next-frontend/` é descrito como existente e as instruções direcionam ao guia Codex e ao escopo apropriado

### Requirement: Independência dos documentos Claude

As instruções e regras Codex SHALL ser cópias independentes. Referências ao Claude SHALL limitar-se a atribuição, inventário ou explicações de migração, sem exigir sua configuração como instrução operacional.

#### Scenario: Resolução de referências
- **WHEN** o validador percorre as instruções e regras Codex
- **THEN** todos os documentos necessários existem no lado Codex ou na documentação compartilhada do produto
- **AND** nenhum link operacional redireciona para `.claude` ou `CLAUDE.md`
