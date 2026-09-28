# Validação da migração Codex

Estado atual: implementação e verificações previstas concluídas em 2026-09-18; 33/33 tarefas concluídas (30 da implementação inicial e três de revisão). Change `add-codex-project-support`, esquema `spec-driven`. Recursos da aplicação não foram alterados. As evidências abaixo substituem o bloqueio de acesso da sessão anterior, preservado ao final deste documento.

## Revisão P2/P3 — 2026-09-18

- Corrigida a definição de E2E do gerador, incluindo Feature Implementation Checklist, terminologia e checklist de qualidade: frontend usa navegador/Playwright no host e MSW no servidor; backend usa HTTP/Supertest no container. A revisão semântica confrontou esses trechos com os AGENTS e guias existentes; não foi regenerado um guia nem executado produto nesta revisão.
- Removida a referência inexistente `playwright-cli/VENDOR.md`, substituída por `implement/SKILL.md`, seção 3a. Referências auxiliares de implement e screen-inventory agora identificam suas skills de origem.
- O validador verifica recursos relativos entre backticks: caminhos de outra skill, `./`/`../` e diretórios de recursos da própria skill. Resolve arquivos aninhados sem aceitar um homônimo de outra skill como substituto. Exclui exemplos fenced, placeholders e cinco saídas literais documentadas de generate-test-guide; essas exclusões são delimitadas ao documento gerador. Não trata scripts do produto como auxiliares de skills.
- `python3 -B -m unittest discover -s scripts -p 'test_validate_codex_setup.py' -v`: **9 testes passaram**. Incluem recursos existentes/removidos, inexistentes, resolução relativa, exemplos e injeção em memória da referência VENDOR original através do validador completo, que agora a rejeita identificando documento e destino.
- `python3 -B scripts/validate-codex-setup.py`: **2.407 verificações, zero falhas**, incluindo integridade do conjunto protegido.
- `openspec validate add-codex-project-support --strict`: aprovado após os ajustes.
- Alterações desta revisão limitadas a skills Codex, validador/testes, documentação/inventário e tarefas da change. O index staged preexistente não foi alterado.

## Ambiente e integridade da implementação inicial

- Sessão retomada em 2026-09-17 (America/Sao_Paulo), com política permitindo escrita nos destinos. Probes temporários em `.codex` e `.agents` passaram e foram removidos, sem alterar permissões.
- `codex-cli 0.153.4`; OpenSpec `1.3.1`; Python 3.12 no ambiente de validação (validador requer 3.11+).
- Antes da implementação, todas as entradas do baseline protegido e Codex preexistente conferiam. Depois, as 327 entradas protegidas continuam idênticas, incluindo caminhos/tipos, hashes, arquivos não versionados e ausência de adições/remoções.
- As quatro skills Codex preexistentes foram adaptadas; suas cópias exatas em `rollback/` conferem com o baseline. `baseline.json` permaneceu inalterado.
- `git diff --exit-code` confirma ausência de alterações em arquivos previamente versionados. A revisão de `git status --short` limitou adições próprias a AGENTS, `.codex`, `.agents`, `docs/codex` e validador; somente `tasks.md` desta change foi atualizado em OpenSpec. Os arquivos Claude/OpenSpec não versionados anteriores foram preservados.

## Validação estática da implementação inicial

`python3 scripts/validate-codex-setup.py`: **2.158 verificações, zero falhas**.

Cobertura do inventário: três instruções, 27 skills, 209 auxiliares, seis agentes, 17 regras, quatro comandos OpenSpec e adaptações de settings/MCP. O script verifica auxiliares obrigatórios, referências concretas e links locais (excluindo exemplos de código), TOML, metadados essenciais, destinos de geradores, links de descoberta, hashes e conjunto protegido. A regra opcional `design-system.md` é explicitamente ignorada pelo consumidor quando ausente, como na origem.

- Cadeias raiz + backend: 17.852 bytes; raiz + frontend: 28.109 bytes. Ambas abaixo do limite padrão de 32 KiB.
- Todos os padrões originais de regras estão preservados e roteados nos AGENTS; amostras positivas (incluindo zero diretórios intermediários) e negativas por padrão passaram.
- `nestjs-project/src/videos/videos.controller.ts` recebe exatamente controller, layer-separation, common-conventions e TypeScript; não recebe auth-jwt.
- `next-frontend/mocks/handlers.ts` recebe MSW e frontend-code-quality; não recebe regras de entidades backend.
- Fixtures negativas isoladas: nome duplicado/incompatível, MCP habilitado, alteração protegida, dependência operacional Claude e auxiliar removido foram detectados.
- `skill-creator/scripts/quick_validate.py`: 27/27 passaram. Placeholders em descrições usam texto simples; a declaração de compatibilidade OpenSpec foi preservada dentro de `metadata` para compatibilidade com esse validador.
- Doctests do auxiliar `figma-apply-tokens-tailwind-v4/scripts/apply.py` passaram; nenhum CSS real foi alterado.
- Os três exemplos MCP foram parseados pelo CLI com overrides transitórios e listados como desabilitados. `codex mcp` rejeita `--strict-config`; essa opção não foi apresentada como aprovada. Não houve conexão, instalação nem alteração de configuração pessoal.

## Descoberta e sessões novas

Um novo processo `codex app-server --stdio`, via `skills/list` com `forceReload: true`, retornou **27 skills de escopo repo, 27 nomes únicos, zero erros** em cada cwd: raiz, `nestjs-project` e `next-frontend`. O caminho canônico ativo é `.codex/skills`; links `.agents/skills` não duplicaram entradas.

As 16 skills originalmente explícitas mantêm `allow_implicit_invocation: false`; por isso o catálogo de prompt pode expor somente as 11 implicitamente selecionáveis. A descoberta das 27 foi verificada pela API local, separadamente da contagem feita pelo modelo.

Três sessões CLI novas, efêmeras e somente de leitura relataram os seis leitores carregados. A raiz recebeu suas instruções e referências aos subprojetos; o backend identificou a cadeia raiz/backend e execução Docker serial dos testes; o frontend identificou sua política Docker, exceção Playwright no host e distinção entre iniciar container e servidor. As respostas do modelo não substituem inspeção de todas as instruções internas do cliente.

Uma sessão adicional recebeu solicitação explícita de delegação ao `plan-reader` para a fase 02 e retornou as oito capacidades existentes e vizinhos. O relatório usa esse resultado como smoke de chamada via CLI; a saída agregada do cliente não fornece um transcript completo do papel filho nem prova todas as restrições internas do sandbox. Os contratos dos seis leitores foram exercitados separadamente pelo procedimento sequencial abaixo.

## Contratos dos leitores

Teste independente de leitura delimitada, sem editar originais, executado com documentos existentes e fixtures temporárias:

- `plan-reader`: H3 real da fase 02, linhas 48–66, oito capacidades verbatim e vizinhos. H2 continua aceito.
- `decisions-reader`: sete candidatos; fase `phase-02-auth` mantém um arquivo e dez TDs; tarefa `openapi-docs-nestjs` mantém um arquivo e três decisões A/C/B. Filter Trace enumera os sete caminhos.
- `decisions-detail-reader`: mesmos conjuntos; dez recomendações de fase e três de tarefa; prefixos de opção removidos, ênfase comum preservada, Libraries ausente vira `—`. A exceção de tarefa sem documento está explícita nos dois pontos de contrato.
- `decisions-correlator`: pool de fase com quatro documentos ad-hoc globais; pool da tarefa com seis candidatos, excluindo ela própria. Ausência de candidatos mantém placeholder, sem inventar Filter Trace.
- `phases-reader`: última fase concluída 02 agrega dois slices, 17 TDs próprios e cinco linhas deferred; âncora exata evita duplicar Inherited Decisions Detail.
- `inventory-digest-reader`: inventário validado existente com três telas, três linhas de join, seis componentes conectados e oito perguntas; componentes planejados viram `new`.
- Fixture de membership aceita `[2]`, `[1, 2]`, `[1, 2, 3]` e rejeita `[12]`, `[21]`, `[]`. Número 2 com dois slices exige slug explícito. Árvores vazias retornam placeholders previstos.
- Rechecks: slug com/sem prefixo de fase resolve o mesmo caminho exato; sibling sem progress exclui a fase inteira da seleção de concluídas. Nenhuma leitura foi tratada como aprovação do usuário.

Correções de compatibilidade registradas no inventário, somente no lado Codex: H3 de fases; prefixo de fase não duplicado em paths (identificador de decisões permanece exato); heading Phase NN no digest; exceção missing-task do detail-reader; enumerar diretórios antes de conferir progress. Estas resolvem divergências entre contratos e documentos já existentes.

## Fluxos em workspaces temporários

Execução sequencial manual das instruções adaptadas, com asserts de filesystem; não equivale a uma execução autônoma integral de todas as ramificações:

- OpenSpec: `init --tools codex`, criação de change fixture e instruções CLI de cada artefato; estado `blocked` sem artefatos, `ready` com uma tarefa, `all_done` após criar/verificar nota e marcar tarefa. Change e specs principais passaram validação estrita. Sync e archive preservaram `.openspec.yaml`; nenhuma pasta `.claude` foi criada.
- Planejamento: contexto de tarefa com TD pending produziu validation dirty/OQ-1, sem MD espúrio; plan-build parou no Gate 6 sem criar plano. Resolve preparou pergunta e manteve decisão/context/validation byte-identical sem resposta. Estados partial-awaiting-inventory e fonte com mtime avançado dois segundos abortaram nos gates esperados. Não foi simulada aprovação desse TD.
- `plan-rule-author`: preview e decisões previamente fornecidas na fixture; regra com cinco seções; predicado em fixture detectou artefato ausente, aceitou presente e respeitou suppression. Destino: `docs/codex/planning-rules/plan-validate/`.
- `generate-test-guide`: guia fixture de 52 linhas, dois artefatos, quatro referências e um link relativo de descoberta; nenhum teste de aplicação criado. Pesquisa usou documentação oficial Node 22.12 como fallback de Context7. Decisões da fixture foram explícitas; não houve instalação de dependências.

Limites: não executados todos os branches dos geradores, snippets gerados de aplicação, pipeline completo até implementar produto, integrações MCP reais, captura Figma ou comparação visual. Predicados do gerador de regras foram exercitados em adapter Python de fixture, não no host completo plan-validate. Esses itens não são declarados aprovados. Testes do produto não foram executados porque a migração não alterou produto nem dependências.

`openspec validate add-codex-project-support --strict`: aprovado. A aprovação valida os artefatos da change; a implementação é sustentada pelas evidências separadas acima.

---

# Registro da sessão anterior

Estado naquela sessão: implementação interrompida na verificação inicial de acesso (tarefa 1.2).

## Evidências desta sessão — 2026-09-17

- `baseline.json` registra caminhos, tipos e SHA-256 dos arquivos protegidos e recursos Codex preexistentes, incluindo arquivos não versionados. Nenhum conteúdo de credencial foi copiado.
- A comparação imediatamente após a captura confirmou igualdade das 327 entradas protegidas e das nove entradas Codex preexistentes.
- CLI instalado: `codex-cli 0.153.4`. A consulta de versão também informou que não pôde criar aliases de PATH por sistema de arquivos somente de leitura.
- A política de filesystem fornecida à sessão concede somente leitura a `.codex` e `.agents`. Não foi tentada escrita nesses destinos nem alteração de permissões.
- O catálogo desta sessão expõe as quatro skills OpenSpec em `.codex/skills`; isso não comprova descoberta em novas sessões ou suporte aos agentes TOML.
- `openspec validate add-codex-project-support --strict`: aprovado para os artefatos da mudança; não representa validação da implementação.

## Pendências

Somente a tarefa 1.1 foi concluída. A tarefa 1.2 permanece pendente porque descoberta e formato de agentes ainda não foram verificados. As tarefas de implementação e validação final permanecem abertas, inclusive 6.6, cuja conclusão exige atualizar as tarefas conforme os resultados finais.

Não foram executados: descoberta em novas sessões, contratos dos seis agentes, fluxos e geradores em workspace temporário, validação estática da migração ou integrações MCP. Nenhuma aprovação é inferida para essas verificações.

## Condição para retomada

Retomar em sessão/workspace cuja política permita escrever nos destinos `.codex` e `.agents`, como exigem o design e a especificação `codex-setup-and-coexistence`. A sessão atual não permite solicitar elevação de acesso. Não usar links alternativos, mudanças de permissão ou cópias em outros destinos para contornar a restrição.

Antes de retomar, comparar o workspace com o baseline existente e preservar eventuais mudanças posteriores do usuário. O baseline deve permanecer como evidência inicial, sem sobrescrita automática.
