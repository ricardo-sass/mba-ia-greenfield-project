## 1. Inventário e compatibilidade

- [x] 1.1 Registrar baseline dos caminhos protegidos do Claude e dos arquivos Codex preexistentes, incluindo arquivos não versionados, sem expor credenciais.
- [x] 1.2 Verificar acesso permitido aos destinos `.codex` e `.agents`, versão do CLI, descoberta de skills e formato de agentes suportado; registrar restrições sem contorná-las.
- [x] 1.3 Criar `docs/codex/migration-map.json` com os três arquivos de instruções, 27 skills e auxiliares, seis agentes, 17 regras, quatro comandos OpenSpec e adaptações de settings/MCP.

## 2. Instruções e regras

- [x] 2.1 Criar AGENTS raiz com contexto atualizado do monorepo, convenções compartilhadas, leitura obrigatória dos AGENTS de subprojeto e link ao guia Codex.
- [x] 2.2 Criar `nestjs-project/AGENTS.md` preservando comandos Docker, arquitetura, testes e gates do backend.
- [x] 2.3 Criar `next-frontend/AGENTS.md` preservando BFF, OpenAPI, tokens, Figma, Docker, MSW e execução de Playwright no host.
- [x] 2.4 Replicar as 17 regras em `docs/codex/rules/` e incluir tabelas de roteamento com todos os padrões originais nos AGENTS apropriados.
- [x] 2.5 Conferir limites de tamanho das cadeias de instruções e cenários de roteamento positivos/negativos, incluindo sessões iniciadas na raiz.

## 3. Skills completas

- [x] 3.1 Copiar as 23 skills ainda ausentes e todos os auxiliares para a fonte Codex definida no design, preservando licenças e atribuições.
- [x] 3.2 Adaptar `research`, `decide`, `plan-pipeline`, `plan-context`, `plan-validate`, `plan-resolve` e `plan-phase`, mantendo gates, argumentos e contratos de artefatos.
- [x] 3.3 Adaptar `plan-build` e todos os seus templates, fases e referências; converter ferramentas, caminhos, perguntas e exemplos de invocação.
- [x] 3.4 Adaptar `implement`, `implement-phase` e `plan-test-specs`, incluindo processos persistentes e instruções para execução/verificação de testes.
- [x] 3.5 Adaptar `screen-inventory`, `figma-audit-tokens` e `figma-apply-tokens-tailwind-v4`, eliminando dependência obrigatória do plugin Claude e preservando requisitos de evidência Figma.
- [x] 3.6 Revisar os dois guias de testes e as cinco skills técnicas vendorizadas, inclusive auxiliares, corrigindo referências operacionais e preservando conteúdo técnico.
- [x] 3.7 Adaptar `generate-test-guide` para destinos Codex e `plan-rule-author` para `docs/codex/planning-rules/`; ajustar seus consumidores e o comportamento de diretório ausente.
- [x] 3.8 Adaptar as quatro skills OpenSpec já existentes, preservando CLI e esquema e substituindo referências a ferramentas e comandos exclusivos do Claude.
- [x] 3.9 Configurar descoberta em `.agents/skills` a partir da fonte Codex, verificar uma única entrada por nome e registrar a localização ativa escolhida.

## 4. Agentes e orquestração

- [x] 4.1 Converter `plan-reader`, `decisions-reader` e `decisions-detail-reader` para agentes Codex somente de leitura, preservando contratos e rastreamento.
- [x] 4.2 Converter `decisions-correlator`, `phases-reader` e `inventory-digest-reader`, preservando filtros, modos, limites de leitura e resultados vazios.
- [x] 4.3 Ajustar chamadores para nomes e instruções Codex; implementar alternativa sequencial equivalente quando delegação não estiver disponível, sem fixar modelo.
- [x] 4.4 Exercitar os seis contratos com documentos existentes ou fixtures temporárias, incluindo tarefa, fase, slice ambíguo, ausência de resultados e `Filter Trace` aplicável, sem modificar originais.

## 5. Integrações e documentação

- [x] 5.1 Criar `docs/codex/config.example.toml` com exemplos opcionais e válidos para Context7, Figma e PostgreSQL, sem credenciais reais ou ativação automática.
- [x] 5.2 Criar `docs/codex/README.md` com configuração, descoberta, confiança no projeto, invocações, exemplos OpenSpec, requisitos e verificação de disponibilidade.
- [x] 5.3 Documentar diferenças de ferramentas, efeito equivalente ao hook, alternativas para capacidades ausentes, atualização manual, regeneração OpenSpec e rollback delimitado.

## 6. Validação e encerramento

- [x] 6.1 Criar `scripts/validate-codex-setup.py` para cobertura, metadados, TOML, referências, destinos de geração e comparação com o baseline protegido.
- [x] 6.2 Executar validação estática e revisão semântica das adaptações, distinguindo atribuições históricas de referências operacionais ao Claude.
- [x] 6.3 Verificar em sessões novas da raiz e dos dois subprojetos a descoberta das 27 skills únicas, das instruções aplicáveis e dos agentes; registrar evidências e limitações.
- [x] 6.4 Exercitar em workspace temporário os fluxos de planejamento/OpenSpec e os geradores, conferindo gates, contratos e ausência de escrita no lado Claude.
- [x] 6.5 Confirmar integridade do conjunto protegido, ausência de alterações no produto e preservação dos arquivos anteriores do usuário; registrar resultados em `docs/codex/validation.md` sem declarar verificações não executadas como aprovadas.
- [x] 6.6 Executar `openspec validate add-codex-project-support --strict` e atualizar as tarefas somente conforme a implementação e verificação reais.

## 7. Ajustes de revisão

- [x] 7.1 Derivar a definição de E2E e os checklists do gerador de guias conforme o subprojeto, preservando Playwright no frontend e HTTP/Supertest no backend.
- [x] 7.2 Corrigir a referência inexistente de plan-test-specs e validar referências relativas de recursos entre backticks, com testes de regressão para arquivos presentes/ausentes e exemplos de geração.
- [x] 7.3 Executar as verificações pertinentes e atualizar o inventário e as evidências de validação sem modificar recursos Claude ou produto.
