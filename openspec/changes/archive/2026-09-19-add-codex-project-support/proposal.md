## Why

O StreamTube concentra suas instruções, regras e fluxos de trabalho no Claude Code; o suporte ao Codex contém somente as quatro skills do OpenSpec. É necessário disponibilizar os mesmos recursos de desenvolvimento no Codex, com formatos e ferramentas compatíveis, preservando integralmente a configuração existente do Claude.

## What Changes

- Criar instruções `AGENTS.md` na raiz, em `nestjs-project/` e em `next-frontend/`, adaptando os três `CLAUDE.md` e corrigindo informações desatualizadas apenas nas versões Codex.
- Replicar e adaptar as 27 skills existentes, incluindo referências, templates, scripts e aliases; integrar as quatro skills OpenSpec já presentes sem duplicidade de descoberta.
- Disponibilizar os seis agentes leitores no formato do Codex, mantendo seus contratos de entrada/saída e comportamento somente de leitura, com execução sequencial equivalente quando delegação não estiver disponível.
- Replicar as 17 regras de desenvolvimento e mapear explicitamente seus padrões de arquivos a instruções carregadas pelo Codex.
- Adaptar chamadas de ferramentas, perguntas, acompanhamento de tarefas, comandos, processos persistentes e dependências de plugins/MCP. Geradores de regras e skills devem escrever exclusivamente na estrutura Codex.
- Adicionar documentação de uso e configuração de integrações para o Codex, inventário de equivalências e verificações de integridade, descoberta e preservação do Claude.
- Manter `.claude/**`, todos os `CLAUDE.md`, `.mcp.json`, `.mcp.json.example`, `skills-lock.json` e o histórico `_claude-sessions/**` intactos, inclusive arquivos locais ainda não versionados.

## Capabilities

### New Capabilities

- `codex-project-guidance`: instruções hierárquicas e regras por escopo equivalentes às existentes, isoladas da configuração do Claude.
- `codex-workflow-portability`: skills completas, agentes leitores e fluxos de planejamento, implementação e OpenSpec executáveis no Codex.
- `codex-setup-and-coexistence`: configuração e documentação de integrações, descoberta de recursos e validação da coexistência sem alterações no Claude.

### Modified Capabilities

Nenhuma. Não há especificações existentes em `openspec/specs/`.

## Impact

Afeta somente recursos de assistência ao desenvolvimento: novos `AGENTS.md`, recursos Codex, guia dedicado em `docs/`, verificações em `scripts/` e arquivos desta change. A localização de descoberta das skills será compatibilizada com o Codex instalado; `.codex/skills/` já existe, enquanto a documentação atual indica `.agents/skills/`.

Não altera código de aplicação, contratos REST/OpenAPI, banco de dados, dependências npm, Docker Compose ou documentos de decisões e progresso existentes. A implementação não exige instalar plugins, conectar serviços externos nem modificar a configuração pessoal do usuário. Não há mudança incompatível para usuários do Claude Code.
