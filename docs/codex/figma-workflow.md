# Procedimento Figma no Codex

Este procedimento substitui a dependência operacional de plugins de outro assistente. Não presume que um plugin ou servidor esteja instalado.

1. Descobrir as ferramentas disponíveis e ler seus schemas. Identificar o arquivo/branch e o `node-id` exatos do inventário ou URL; não trocar branch pelo arquivo principal.
2. Obter `get_design_context` e `get_screenshot` (ou capacidades equivalentes com a mesma evidência) para o nó/variante. Se o payload for truncado, obter metadata e repetir a consulta para os nós relevantes.
3. Usar os assets retornados, inclusive URLs locais. Para auditoria de tokens, obter coleções, modos, valores, aliases e estilos completos. Os scripts de `figma-audit-tokens` exigem execução JavaScript dentro do documento (`use_figma` ou equivalente); MCP apenas de leitura não prova essa capacidade. Uma exportação fornecida pelo usuário só substitui a consulta se preservar os mesmos campos e proveniência. Não inferir modos ou valores ausentes.
4. No audit-SI, comparar componentes reutilizados aos arquivos locais e registrar o drift sem editar código. No SI-Xa, aplicar as decisões registradas e traduzir o design para tokens, componentes e SVGs locais conforme `next-frontend/AGENTS.md`. Handoff limitado a URL, Reused DS, nomes dos componentes conectados ao servidor e destinos; lógica de autenticação, validação e erros permanece no SI-Xb.
5. Comparar o resultado renderizado ao screenshot e estados interativos. Registrar evidência e limitações. Não declarar paridade visual sem essa comparação.

Se faltar uma capacidade, informar exatamente qual e pausar somente o trabalho dependente. Continuar trabalho independente autorizado. Não instalar plugins, conectar serviços ou marcar evidência ausente como aprovada. Trabalho manual concluído pelo usuário deve ser registrado como tal no `progress.md`, sem alegar execução pelo Codex.

Referência de configuração: [MCP no Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
