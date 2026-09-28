## Context

O repositório possui três `CLAUDE.md`, 27 skills com recursos auxiliares, seis agentes somente de leitura, 17 regras com frontmatter `paths`, quatro comandos `opsx` e `.claude/settings.json` com um lembrete de skills e plugin Figma habilitado. `.mcp.json.example` exemplifica PostgreSQL e Figma; as instruções também dependem de Context7. O Codex possui quatro skills OpenSpec em `.codex/skills/`, ainda com referências a ferramentas do Claude.

O CLI local é `codex-cli 0.153.4`. A sessão expõe `.codex/skills`, mas a documentação oficial atual descreve descoberta em `.agents/skills`. Há arquivos não versionados nas configurações dos dois assistentes e em `openspec/`; preservação deve ser comparada com o estado inicial do workspace, não apenas com `HEAD`. Nesta sessão, `.codex` e `.agents` são protegidos contra escrita; a proposta pode ser produzida, mas a implementação precisa de um workspace que permita escrever nesses destinos, sem contornar a política do ambiente.

## Goals / Non-Goals

**Goals:**

- Disponibilizar no Codex os mesmos conhecimentos e contratos de trabalho existentes no Claude.
- Preservar escopo das regras, formatos de artefatos, gates de planejamento e decisões do usuário.
- Garantir descoberta verificável, caminhos válidos e independência operacional das cópias Codex.
- Manter intactos os arquivos do Claude e documentar diferenças de plataforma.

**Non-Goals:**

- Alterar aplicação, infraestrutura, contratos de API ou decisões de produto.
- Atualizar bibliotecas, baixar novas versões das skills vendorizadas ou instalar plugins automaticamente.
- Reescrever históricos, sincronizar continuamente os dois assistentes ou alterar configuração pessoal.
- Executar os fluxos de implementação do produto durante a migração.

## Decisions

### 1. Cópias independentes com inventário de origem

Criar `docs/codex/README.md` e um inventário legível por script em `docs/codex/migration-map.json`, contendo origem, destino, tipo, hash de origem e adaptação para cada recurso. Copiar também templates, referências, scripts, metadados e licenças. O inventário inclui arquivos locais não versionados e os quatro fluxos OpenSpec já existentes no Codex.

Não usar links apontando para `.claude` nem configurar `CLAUDE.md` como fallback de instruções: isso manteria dependência operacional do Claude e permitiria alterações acidentais por geradores. Duplicação deliberada exige revisão manual de futuras divergências, indicada pelo inventário.

### 2. Instruções hierárquicas e regras explicitamente roteadas

Criar `AGENTS.md`, `nestjs-project/AGENTS.md` e `next-frontend/AGENTS.md`. Manter os acordos técnicos: Docker, testes, TypeScript, BFF, contrato OpenAPI, tokens e Figma. Corrigir apenas na cópia Codex o frontend descrito como não inicializado e referências à ferramenta Bash/processos do Claude.

Replicar as 17 regras para `docs/codex/rules/`. Cada AGENTS inclui uma tabela `padrão de arquivo → documento obrigatório`, conservando a semântica de todos os `paths`. O AGENTS raiz manda ler as instruções do subprojeto antes de trabalhar nele, mesmo quando a sessão começou na raiz. Instruções de escopo limitado permanecem condicionais; por exemplo, as regras de autenticação não se tornam globais.

O diretório `.codex/rules` não será usado para essas regras Markdown: as regras nativas de execução do Codex têm outra finalidade. Não assumir que frontmatter `paths` produz carregamento automático. A cadeia raiz + subprojeto deve caber no limite de instruções, mantendo detalhes em documentos de leitura explícita.

### 3. Uma fonte física de skills com descoberta compatível

Usar `.codex/skills/<nome>/` como fonte das cópias adaptadas, preservando a localização já usada pelo OpenSpec. Disponibilizar cada skill na localização documentada `.agents/skills/<nome>` por link relativo para a cópia Codex. Links nunca apontam para o Claude. Validar a descoberta em sessão nova, na raiz e nos dois subprojetos, antes de considerar a integração concluída.

Se o cliente carregar as duas localizações e apresentar duplicidades, selecionar uma única localização ativa com mecanismo suportado e documentado; se não for possível, adotar `.agents/skills` como fonte canônica e ajustar as referências Codex. Esse ajuste de compatibilidade deve manter os mesmos contratos e ser registrado no inventário. Não usar `skills.config` como instalador de caminhos não descobertos nem criar cópias físicas divergentes.

Cobertura inicial:

- Planejamento e decisões: `research`, `decide`, `plan-pipeline`, `plan-context`, `plan-validate`, `plan-resolve`, `plan-build`, `plan-phase`, `plan-rule-author`, `plan-test-specs`.
- Implementação: `implement`, `implement-phase`, `generate-test-guide`, `testing-guide-nestjs-project`, `testing-guide-next-frontend`.
- Interface: `screen-inventory`, `figma-audit-tokens`, `figma-apply-tokens-tailwind-v4`.
- Referências técnicas: `nestjs-best-practices`, `next-best-practices`, `vercel-react-best-practices`, `typeorm`, `playwright-cli`.
- OpenSpec: `openspec-propose`, `openspec-explore`, `openspec-apply-change`, `openspec-archive-change`.

### 4. Portabilidade sem substituir palavras indiscriminadamente

Revisar também arquivos auxiliares, descrições, exemplos e templates. Preservar contratos de domínio e adaptar somente mecanismos do assistente:

| Origem | Adaptação Codex |
|---|---|
| `Read`, `Grep`, `Glob`, `Write`, `Edit`, `Bash` | Leitura, `rg`, edição e shell disponíveis na sessão; comandos relativos à raiz e diretório de execução explícito |
| `Skill` e `/nome` | Carregar a skill disponível; exemplos `$nome` e argumentos em texto; não inventar ferramenta `Skill` |
| `AskUserQuestion` | Pergunta suportada no modo atual ou conversa; preservar decisões pendentes e aceitar texto livre; não afirmar que há restrição a escolhas |
| `TodoWrite`, `TaskCreate`, `TaskUpdate` | Planejamento disponível e checklists persistidos nos artefatos já definidos |
| `Agent`, `Task`, `Explore` | Delegação suportada com instruções explícitas ou execução sequencial do mesmo contrato |
| `run_in_background` | Sessão de processo ou `docker compose exec -d`, conforme comando, com verificação de disponibilidade |
| `/opsx:*` | Skills OpenSpec correspondentes; preservar CLI e esquema de artefatos |
| Plugin `figma:*` | Ferramentas Figma disponíveis e procedimento equivalente documentado |

Não transportar afirmações sobre herança de prompt do Claude para o Codex. Passar aos leitores o contrato, escopo e caminhos necessários. O usuário continua escolhendo transições de estágio previstas no pipeline; autorização já dada não é solicitada novamente.

`generate-test-guide` escreve em skills/regras Codex. `plan-rule-author` e os consumidores de regras do pipeline usam `docs/codex/planning-rules/{plan-validate,plan-build,plan-resolve}/`, isolando regras futuras específicas do Codex. `docs/rules/` não existe atualmente; diretório ausente equivale a nenhuma regra customizada. Artefatos de trabalho em `docs/phases`, `docs/tasks`, `docs/decisions` e `openspec` mantêm seus formatos e destinos quando o usuário executar esses fluxos, mas não são reescritos pela migração.

### 5. Seis agentes leitores nativos e alternativa sequencial

Converter `plan-reader`, `decisions-reader`, `decisions-detail-reader`, `decisions-correlator`, `phases-reader` e `inventory-digest-reader` para `.codex/agents/*.toml` com nome, descrição, instruções e `sandbox_mode = "read-only"`, conforme suporte do CLI alvo. Preservar nomes ou registrar seu mapeamento nos chamadores. Não fixar modelo nem raciocínio: herdar a configuração do usuário.

Manter filtros, cardinalidades, seleção por slug/modo, ausência de resultados e `Filter Trace` onde exigido. A execução sequencial deve produzir a mesma estrutura e respeitar os mesmos limites de leitura. Ela não deve alegar isolamento por sandbox quando executada pela sessão principal. Delegar apenas nas etapas explicitamente previstas pelas skills e quando a sessão permitir.

### 6. Configuração opcional de integrações e guia independente

Adicionar exemplo TOML em `docs/codex/config.example.toml` para Context7, Figma e PostgreSQL, com campos suportados verificados na implementação. Endereços locais são exemplos; credenciais vêm do ambiente ou configuração local, sem copiar valores de `.mcp.json`. Separar ferramentas de desenvolvimento executadas no host dos comandos da aplicação executados em Docker.

O guia explica confiança no projeto, descoberta, invocação, reinício da sessão, requisitos e checagem de disponibilidade. Configurações opcionais permanecem inativas até o usuário configurá-las. Não tratar o plugin Figma do Claude como instalado no Codex. Na ausência de integração, declarar a capacidade faltante e preservar o trabalho independente; etapas que dependem de evidência Figma não inventam resultados. Consultas de documentação podem usar fontes oficiais compatíveis com a versão quando Context7 não estiver disponível.

O hook do Claude apenas relembra o uso de skills; seu efeito vira instrução no AGENTS raiz. Não copiar `.claude/settings.json`, listas de permissões ou nomes de plugins. O README existente permanece intacto; o AGENTS raiz aponta para o guia Codex.

### 7. Verificação estática e validação de uso separadas

Adicionar `scripts/validate-codex-setup.py` sem dependências de aplicação para verificar cobertura do inventário, frontmatter essencial, TOML, links internos, destinos de geração e ausência de dependência operacional do Claude. Diferenciar referências históricas/atribuição de comandos ativos incompatíveis. Os padrões originais de regras são dados de cobertura; amostras positivas e negativas conferem que o roteamento não ampliou nem reduziu escopos.

Capturar baseline de hashes antes de implementar e comparar todos os caminhos protegidos após concluir, incluindo adições e remoções. Não imprimir conteúdos sensíveis. Validar em sessões novas a descoberta de 27 skills únicas, instruções nos três diretórios, agentes e amostras dos leitores. Exercitar geração e planejamento em diretório temporário, preservando os documentos reais. Registrar verificações que dependem de autenticação ou capacidade indisponível como não executadas, sem equipará-las à validação estática.

## Risks / Trade-offs

- Diferença entre catálogo desta sessão e documentação de descoberta → testar o CLI alvo e registrar localização ativa, sem duplicar nomes.
- `.codex` e `.agents` protegidos neste ambiente → executar a implementação em workspace com acesso permitido; não usar chmod, symlinks ou outro caminho para contornar restrições.
- Cópias podem divergir → inventário com hashes de origem e procedimento de atualização manual, sem sincronização automática.
- Regras Markdown não carregadas automaticamente → roteamento explícito nos AGENTS e cenários por padrão, inclusive sessão iniciada na raiz.
- Limitações de agentes/MCP → contratos sequenciais e verificação prévia de disponibilidade, com limitações explícitas.
- Atualização do OpenSpec pode regenerar skills → documentar conferência das adaptações após atualização, preservando sempre o lado Claude.

## Migration Plan

1. Registrar baseline e inventário; verificar permissão dos destinos e suporte do CLI.
2. Adicionar instruções e regras Codex, depois skills completas e ponte de descoberta.
3. Converter agentes, chamadores e geradores; adicionar exemplo de configuração e guia.
4. Executar verificações estáticas e cenários em workspace temporário/sessões novas.
5. Confirmar hashes do Claude, ausência de mudanças no produto e registrar evidências.

Rollback: remover somente arquivos e links novos desta implementação e restaurar as quatro skills Codex ao baseline quando alteradas. Não usar limpeza ampla ou restaurar o workspace inteiro, pois já existem arquivos do usuário não versionados.

## Open Questions

Nenhuma decisão de produto pendente. A localização ativa de descoberta e o suporte a agentes TOML são verificações técnicas da primeira etapa; uma restrição persistente de escrita deve ser reportada antes de marcar a implementação como concluída.

## References

Consultadas em 2026-09-17:

- [Instruções AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Skills e descoberta local](https://learn.chatgpt.com/docs/build-skills)
- [Agentes personalizados](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Regras de execução](https://learn.chatgpt.com/docs/agent-configuration/rules)
- [Integrações MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Referência de configuração](https://learn.chatgpt.com/docs/config-file/config-reference)
