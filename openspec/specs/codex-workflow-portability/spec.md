## Purpose

Ensure the migrated Codex workflow preserves the discovered skills, reader agents, generator destinations, and OpenSpec planning/implementation flows without relying on Claude-specific tooling.

## Requirements

### Requirement: Catalogo completo e descoberto

O Codex SHALL disponibilizar equivalentes das 27 skills inventariadas, com nomes preservados, recursos auxiliares completos e uma unica entrada ativa por nome. As quatro skills OpenSpec existentes SHALL ser reconciliadas com esse catalogo.

#### Scenario: Descoberta em nova sessao
- **WHEN** uma sessao nova e iniciada na raiz ou em qualquer um dos dois subprojetos
- **THEN** as 27 skills do projeto ficam disponiveis sem nomes duplicados originados pela migracao

#### Scenario: Skill com templates e referencias
- **WHEN** `plan-build` ou um guia de testes carrega um recurso auxiliar
- **THEN** o arquivo correspondente existe no conjunto Codex e suas referencias internas resolvem sem leitura da configuracao Claude

### Requirement: Ferramentas e invocacoes compativeis

Skills SHALL expressar leitura, escrita, busca, perguntas, planejamento, execucao de processos e delegacao com capacidades disponiveis na sessao Codex ou alternativa explicita. Chamadas especificas do Claude SHALL NOT permanecer como acoes obrigatorias sem adaptacao.

#### Scenario: Pergunta necessaria fora do modo Plan
- **WHEN** uma skill precisa resolver uma decisao que ainda nao foi respondida
- **THEN** utiliza uma forma de pergunta disponivel no modo atual, registra o estado pendente e aguarda a resposta antes do trabalho dependente
- **AND** nao interpreta ausencia de resposta como aprovacao

#### Scenario: Retomada de trabalho
- **WHEN** uma skill e retomada em outra sessao
- **THEN** recupera progresso nos artefatos persistidos previstos pelo fluxo, sem depender de IDs de tarefas exclusivos do Claude

### Requirement: Equivalencia dos seis agentes leitores

O suporte SHALL disponibilizar os seis leitores identificados no design em formato compativel com o Codex. Seus contratos de entrada, filtros, cardinalidades, saida, erros e limites de leitura SHALL ser preservados, inclusive `Filter Trace` quando exigido na origem.

#### Scenario: Decisoes por tarefa
- **WHEN** `decisions-reader` recebe `mode=task` e um slug valido
- **THEN** retorna o indice da decisao correspondente e a estrutura de rastreamento exigida pelo contrato, sem modificar os documentos consultados

#### Scenario: Delegacao indisponivel
- **WHEN** uma etapa precisa de um leitor e a sessao nao permite subagentes
- **THEN** o fluxo executa sequencialmente o mesmo contrato somente de leitura e explicita a ausencia de isolamento por subagente

#### Scenario: Nome de fase ambiguo
- **WHEN** um leitor recebe o atalho numerico de uma fase com multiplos slices
- **THEN** preserva a exigencia de slug explicito e nao seleciona arbitrariamente um slice

### Requirement: Destinos seguros dos geradores

As skills Codex que geram instrucoes, regras ou skills SHALL escrever exclusivamente em destinos Codex. Artefatos de produto compartilhados SHALL manter seus contratos e destinos quando gerados por solicitacao do usuario.

#### Scenario: Geracao de guia de testes
- **WHEN** `generate-test-guide` gera uma skill e regras de testes
- **THEN** os arquivos sao criados nos destinos Codex documentados e nenhum arquivo e escrito em `.claude`

#### Scenario: Nova regra customizada do pipeline
- **WHEN** `plan-rule-author` cria uma regra de validacao para uso no Codex
- **THEN** ela e gravada em `docs/codex/planning-rules/plan-validate/` e descoberta pelo consumidor Codex correspondente
- **AND** o fluxo do Claude permanece sem alteracao

### Requirement: Continuidade dos fluxos existentes

As adaptacoes SHALL preservar os formatos e gates do pipeline de planejamento, os aliases `plan-phase` e `implement-phase`, e os quatro fluxos OpenSpec. Invocacoes recomendadas SHALL identificar a skill Codex correspondente.

#### Scenario: Proposta OpenSpec
- **WHEN** o usuario invoca `$openspec-propose` no Codex
- **THEN** o fluxo produz os artefatos exigidos pelo esquema e orienta o uso de `$openspec-apply-change` para implementacao

#### Scenario: Planejamento com validacao pendente
- **WHEN** `plan-build` recebe contexto cuja validacao bloqueia a geracao
- **THEN** preserva o bloqueio e o proximo passo definidos no contrato original, usando a invocacao Codex correspondente
