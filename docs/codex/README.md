# Codex no StreamTube

Suporte independente para o monorepo: três arquivos AGENTS, 27 skills, seis leitores e 17 regras. Não modifica configurações do Claude nem ativa integrações. Consulte [validation.md](validation.md) para evidências executadas e limitações, [migration-map.json](migration-map.json) para origem/destino e [baseline.json](baseline.json) para integridade inicial.

## Requisitos e descoberta

- Codex CLI compatível com skills locais e agentes TOML; validado inicialmente com `codex-cli 0.153.4`.
- Python 3.11+ para `python3 scripts/validate-codex-setup.py` (somente biblioteca padrão).
- OpenSpec CLI para as quatro skills OpenSpec (`openspec --version`); Docker para executar comandos da aplicação conforme o AGENTS do subprojeto.
- CLI Codex, OpenSpec, validação Python e servidores MCP de desenvolvimento executam no host. Comandos Node/npm da aplicação seguem as regras Docker; Playwright E2E do frontend é a exceção no host.

A fonte física é `.codex/skills/<nome>/`. `.agents/skills/<nome>` contém links relativos para essa fonte. Não existem links para recursos Claude nem cópias físicas divergentes. O CLI testado resolve os links para o mesmo caminho canônico e retorna uma entrada por nome. Verifique novamente após atualizar o cliente; não use `skills.config` para instalar caminhos que não são descobertos.

As 16 skills originalmente explícitas preservam essa política via `agents/openai.yaml` (`allow_implicit_invocation: false`); as outras 11 podem ser selecionadas automaticamente. Portanto, o catálogo textual injetado pode mostrar 11, enquanto `skills/list` e a seleção explícita oferecem 27. Não confundir política de invocação com ausência de descoberta.

Abra uma nova sessão em cada diretório:

```bash
codex -C .
codex -C nestjs-project
codex -C next-frontend
```

Use a seleção de skills do cliente e confirme nomes únicos. O protocolo local `skills/list` permite conferir os três `cwds` com `forceReload: true` sem executar modelos ou conectar MCP. Os leitores ficam em `.codex/agents/*.toml`. Pergunte ao cliente quais agentes personalizados foram carregados; listar arquivos não comprova registro. Se o cliente não permitir delegação, os chamadores executam o mesmo contrato sequencialmente, sem afirmar isolamento de sandbox.

O Codex carrega a cadeia AGENTS da raiz ao diretório atual. Uma sessão na raiz deve ler explicitamente o AGENTS do subprojeto antes de atuar nele. As tabelas desses arquivos exigem leitura das regras correspondentes; frontmatter Markdown `paths` não ativa regras automaticamente. `.codex/rules` não é usado para estes documentos, pois regras nativas de execução têm outra finalidade.

Revise e confie no projeto pelo mecanismo do cliente antes de habilitar configurações locais. Não importe permissões de outro assistente. Instruções pessoais e `AGENTS.override.md` podem mudar a cadeia efetiva. O limite padrão documentado é 32 KiB; as duas cadeias deste projeto são verificadas pelo script. Reinicie a sessão se alterações não aparecerem.

## Uso

Invocações são mensagens ao Codex, não comandos do shell:

```text
$research phase 03
$decide "revisar a decisão de transporte do token"
$plan-context phase-02-auth-frontend
$plan-validate phase-02-auth-frontend
$plan-resolve phase-02-auth-frontend
$plan-build phase-02-auth-frontend
$plan-test-specs phase-02-auth-frontend
$implement phase-02-auth-frontend
$generate-test-guide next-frontend
$plan-rule-author
```

O usuário controla as transições do pipeline. Decisões pendentes permanecem pendentes até resposta; autorização anterior continua válida. `plan-phase` e `implement-phase` mantêm os pontos de entrada legados, formatos e gates; o pipeline moderno é descrito por `$plan-pipeline`. Slugs de decisões permanecem exatos; ao construir caminhos de fase, o prefixo `phase-NN-` não é duplicado. Números de fase com múltiplos slices exigem escolha explícita de slug.

Geradores de guias escrevem em `.codex/skills/testing-guide-<projeto>/` e expõem o link de descoberta correspondente. Regras de desenvolvimento ficam em `docs/codex/rules/`; regras customizadas do pipeline em `docs/codex/planning-rules/{plan-validate,plan-build,plan-resolve}/`. Diretório ausente significa nenhuma regra customizada. Artefatos de trabalho continuam em `docs/decisions`, `docs/phases`, `docs/tasks` e `openspec`, somente quando o fluxo é solicitado.

### OpenSpec

```text
$openspec-propose <descrição>
$openspec-explore <questão>
$openspec-apply-change <nome-da-change>
$openspec-archive-change <nome-da-change>
```

O CLI e o esquema continuam sendo a fonte do estado:

```bash
openspec status --change <nome> --json
openspec instructions apply --change <nome> --json
openspec validate <nome> --strict
```

Exploração não implementa produto. Proposta cria os artefatos exigidos; apply atualiza tarefas apenas após executá-las. Archive avalia sincronização das specs e confirma somente escolhas ainda pendentes; não exige uma skill de sincronização ausente.

## Integrações opcionais

[config.example.toml](config.example.toml) fornece três exemplos desabilitados. Copie apenas os blocos desejados para sua configuração local após revisar requisitos. A migração não altera `~/.codex/config.toml`, não lê credenciais de `.mcp.json`, não instala servidores e não efetua login.

- **Context7:** requer Node/npx no host e acesso ao servidor. Confira a versão da biblioteca no projeto antes da consulta. Sem Context7, use documentação oficial da versão instalada e registre a alternativa.
- **Figma:** o exemplo usa MCP do Figma Desktop no host, que precisa estar habilitado. A alternativa remota usa `https://mcp.figma.com/mcp` e autenticação suportada pelo servidor; `codex mcp login figma` inicia OAuth quando aplicável. Tokens ficam no ambiente/configuração local. Verifique as capacidades concretas: leitura de design/screenshot não implica execução JavaScript no documento. Siga [figma-workflow.md](figma-workflow.md); não declare auditoria ou paridade visual sem evidência.
- **PostgreSQL:** o exemplo reproduz o servidor do exemplo existente; requer Node/npx e `DATABASE_URL` no ambiente local. Não cole credenciais no repositório. Como o MCP roda no host, use a porta publicada do banco; comandos da aplicação dentro de Docker continuam usando o nome do serviço Compose.

Depois da configuração feita pelo usuário, `codex mcp list` mostra o registro. Uma ferramenta de leitura bem-sucedida comprova conexão; a listagem sozinha não comprova disponibilidade. Consulte `codex mcp --help` para comandos suportados. Nenhum teste desta migração precisa conectar Figma ou banco.

## Diferenças de execução

Read/Grep/Glob/Write/Edit/Bash nas cópias designam operações realizadas pelas ferramentas disponíveis (busca com `rg`, edição e shell). Regex com lookaround usa `rg --pcre2`. Carregar uma skill significa ler seu SKILL.md e somente os auxiliares pertinentes. Perguntas usam uma ferramenta disponível no modo atual ou conversa, com texto livre e limites reais de lote.

Checklists e `progress.md` substituem IDs de tarefas de uma ferramenta específica. Processos persistentes usam sessão com ID retido ou `docker compose exec -d`, sempre verificando prontidão. O lembrete antes fornecido por hook está no AGENTS raiz. Para delegar, passar contrato, escopo, argumentos e caminhos de instruções; não assumir herança de prompt. Os leitores não fixam modelo nem nível de raciocínio.

## Manutenção e rollback

Execute `python3 scripts/validate-codex-setup.py` após alterar estes recursos. A validação compara origens, cobertura, auxiliares, TOML, links, roteamento, geradores e baseline protegido; não substitui testes de comportamento. Referências relativas entre backticks são resolvidas no arquivo/skill de origem ou na skill explicitamente nomeada; blocos de exemplo, placeholders e saídas documentadas do gerador não são entradas obrigatórias. Execute as regressões do validador com `python3 -B -m unittest discover -s scripts -p 'test_validate_codex_setup.py'`. Alterações legítimas futuras nas origens devem receber revisão manual do diff e das adaptações antes de atualizar hashes. Não sobrescreva automaticamente o baseline inicial.

Atualizações do OpenSpec podem regenerar as quatro skills. Faça isso primeiro em workspace temporário, compare as cópias geradas com as adaptações Codex e reaplique somente mudanças revisadas. Não execute regeneração que sobrescreva recursos Claude no workspace real.

Rollback delimitado: confira o manifesto de [migration-map.json](migration-map.json) e o estado atual antes de remover somente as adições desta migração (AGENTS, regras/documentos Codex, 23 novas skills, seis agentes, links de descoberta e validador). As quatro skills Codex preexistentes têm cópias exatas em `rollback/<nome>/SKILL.md`; confira o SHA-256 no baseline antes de restaurar cada uma. Preserve `baseline.json`, o histórico de validação e mudanças posteriores do usuário. Não use limpeza ampla de arquivos não versionados ou restauração integral do workspace.

## Fontes de compatibilidade

Consultadas em 2026-09-17: [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [skills](https://learn.chatgpt.com/docs/build-skills), [agentes](https://learn.chatgpt.com/docs/agent-configuration/subagents), [MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) e [configuração](https://learn.chatgpt.com/docs/config-file/config-reference). O comportamento efetivamente observado no CLI local está separado em `validation.md`.
