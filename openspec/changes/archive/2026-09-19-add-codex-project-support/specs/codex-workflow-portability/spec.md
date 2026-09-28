## ADDED Requirements

### Requirement: Catálogo completo e descoberto

O Codex SHALL disponibilizar equivalentes das 27 skills inventariadas, com nomes preservados, recursos auxiliares completos e uma única entrada ativa por nome. As quatro skills OpenSpec existentes SHALL ser reconciliadas com esse catálogo.

#### Scenario: Descoberta em nova sessão
- **WHEN** uma sessão nova é iniciada na raiz ou em qualquer um dos dois subprojetos
- **THEN** as 27 skills do projeto ficam disponíveis sem nomes duplicados originados pela migração

#### Scenario: Skill com templates e referências
- **WHEN** `plan-build` ou um guia de testes carrega um recurso auxiliar
- **THEN** o arquivo correspondente existe no conjunto Codex e suas referências internas resolvem sem leitura da configuração Claude

### Requirement: Ferramentas e invocações compatíveis

Skills SHALL expressar leitura, escrita, busca, perguntas, planejamento, execução de processos e delegação com capacidades disponíveis na sessão Codex ou alternativa explícita. Chamadas específicas do Claude SHALL NOT permanecer como ações obrigatórias sem adaptação.

#### Scenario: Pergunta necessária fora do modo Plan
- **WHEN** uma skill precisa resolver uma decisão que ainda não foi respondida
- **THEN** utiliza uma forma de pergunta disponível no modo atual, registra o estado pendente e aguarda a resposta antes do trabalho dependente
- **AND** não interpreta ausência de resposta como aprovação

#### Scenario: Retomada de trabalho
- **WHEN** uma skill é retomada em outra sessão
- **THEN** recupera progresso nos artefatos persistidos previstos pelo fluxo, sem depender de IDs de tarefas exclusivos do Claude

### Requirement: Equivalência dos seis agentes leitores

O suporte SHALL disponibilizar os seis leitores identificados no design em formato compatível com o Codex. Seus contratos de entrada, filtros, cardinalidades, saída, erros e limites de leitura SHALL ser preservados, inclusive `Filter Trace` quando exigido na origem.

#### Scenario: Decisões por tarefa
- **WHEN** `decisions-reader` recebe `mode=task` e um slug válido
- **THEN** retorna o índice da decisão correspondente e a estrutura de rastreamento exigida pelo contrato, sem modificar os documentos consultados

#### Scenario: Delegação indisponível
- **WHEN** uma etapa precisa de um leitor e a sessão não permite subagentes
- **THEN** o fluxo executa sequencialmente o mesmo contrato somente de leitura e explicita a ausência de isolamento por subagente

#### Scenario: Nome de fase ambíguo
- **WHEN** um leitor recebe o atalho numérico de uma fase com múltiplos slices
- **THEN** preserva a exigência de slug explícito e não seleciona arbitrariamente um slice

### Requirement: Destinos seguros dos geradores

As skills Codex que geram instruções, regras ou skills SHALL escrever exclusivamente em destinos Codex. Artefatos de produto compartilhados SHALL manter seus contratos e destinos quando gerados por solicitação do usuário.

#### Scenario: Geração de guia de testes
- **WHEN** `generate-test-guide` gera uma skill e regras de testes
- **THEN** os arquivos são criados nos destinos Codex documentados e nenhum arquivo é escrito em `.claude`

#### Scenario: Nova regra customizada do pipeline
- **WHEN** `plan-rule-author` cria uma regra de validação para uso no Codex
- **THEN** ela é gravada em `docs/codex/planning-rules/plan-validate/` e descoberta pelo consumidor Codex correspondente
- **AND** o fluxo do Claude permanece sem alteração

### Requirement: Continuidade dos fluxos existentes

As adaptações SHALL preservar os formatos e gates do pipeline de planejamento, os aliases `plan-phase` e `implement-phase`, e os quatro fluxos OpenSpec. Invocações recomendadas SHALL identificar a skill Codex correspondente.

#### Scenario: Proposta OpenSpec
- **WHEN** o usuário invoca `$openspec-propose` no Codex
- **THEN** o fluxo produz os artefatos exigidos pelo esquema e orienta o uso de `$openspec-apply-change` para implementação

#### Scenario: Planejamento com validação pendente
- **WHEN** `plan-build` recebe contexto cuja validação bloqueia a geração
- **THEN** preserva o bloqueio e o próximo passo definidos no contrato original, usando a invocação Codex correspondente
