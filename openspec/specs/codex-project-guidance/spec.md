## Purpose

Provide Codex-facing project guidance, scoped rules, command expectations, and independence from Claude operational documents across the monorepo.

## Requirements

### Requirement: Instrucoes por escopo

O repositorio SHALL fornecer `AGENTS.md` na raiz e nos dois subprojetos, preservando as convencoes tecnicas dos respectivos `CLAUDE.md` e adaptando os mecanismos especificos do assistente. A instrucao raiz SHALL exigir a leitura do AGENTS do subprojeto antes de atuar nele.

#### Scenario: Sessao iniciada na raiz trabalha no frontend
- **WHEN** o Codex recebe uma tarefa em `next-frontend/` a partir da raiz
- **THEN** as instrucoes exigem carregar `next-frontend/AGENTS.md`, incluindo BFF, OpenAPI, tokens, Docker e a excecao de Playwright no host

#### Scenario: Sessao iniciada no backend
- **WHEN** o Codex inicia em `nestjs-project/`
- **THEN** a cadeia de instrucoes contem os acordos da raiz e do backend sem depender de `CLAUDE.md`

### Requirement: Cobertura e escopo das regras

O suporte Codex SHALL conter equivalentes das 17 regras originais e uma associacao explicita entre todos os padroes de origem e documentos obrigatorios. Regras Markdown SHALL ser lidas por instrucao explicita, sem pressupor descoberta nativa de frontmatter `paths`.

#### Scenario: Alteracao de controlador
- **WHEN** uma tarefa altera `nestjs-project/src/videos/videos.controller.ts`
- **THEN** o roteamento exige as regras correspondentes de controlador, separacao de camadas, convencoes comuns e TypeScript
- **AND** nao aplica a regra de autenticacao por esse caminho isoladamente

#### Scenario: Alteracao de mocks do frontend
- **WHEN** uma tarefa altera `next-frontend/mocks/handlers.ts`
- **THEN** o roteamento inclui regras de MSW e qualidade de codigo do frontend
- **AND** nao aplica regras exclusivas de entidades NestJS

### Requirement: Contexto tecnico atual e comandos equivalentes

As instrucoes Codex SHALL refletir os subprojetos presentes e preservar convencoes de execucao, verificacao e arquitetura. Exemplos SHALL usar mecanismos disponiveis no Codex, mantendo a distincao entre iniciar container e iniciar servidor.

#### Scenario: Inicializacao do ambiente frontend
- **WHEN** o usuario pede somente para iniciar o ambiente de desenvolvimento
- **THEN** as instrucoes orientam iniciar e verificar o container, sem iniciar automaticamente o servidor Next.js

#### Scenario: Consulta da estrutura do monorepo
- **WHEN** o Codex consulta o AGENTS raiz
- **THEN** `next-frontend/` e descrito como existente e as instrucoes direcionam ao guia Codex e ao escopo apropriado

### Requirement: Independencia dos documentos Claude

As instrucoes e regras Codex SHALL ser copias independentes. Referencias ao Claude SHALL limitar-se a atribuicao, inventario ou explicacoes de migracao, sem exigir sua configuracao como instrucao operacional.

#### Scenario: Resolucao de referencias
- **WHEN** o validador percorre as instrucoes e regras Codex
- **THEN** todos os documentos necessarios existem no lado Codex ou na documentacao compartilhada do produto
- **AND** nenhum link operacional redireciona para `.claude` ou `CLAUDE.md`
