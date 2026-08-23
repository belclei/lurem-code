# Issues to fix or features to develop

Nada pendente no momento — issues abaixo resolvidas nesta sessão (23/08):

## Timeline / Right Column (resolvido)
- "Ver Análise" quebra para nova linha (TimelineSummaryAside.tsx: wrapper trocado
  para flex-col).

## New Card (resolvido)
- Dia de fechamento/vencimento trava em 1-31 (min/max no input) e a flechinha de
  incremento agora dá wrap-around (31→1, 1→31) em vez de estourar o limite —
  helper `wrapDayOfMonth` em lib/day-of-month.ts, aplicado em NewCardDialog e
  EditCardDialog.

## Revisão da importação (resolvido)
- Placeholder de Tags trocado de "#tag" (parecia um chip real) para
  "Adicionar tag…" com opacidade reduzida — TagInput.tsx.
- Tags nunca exigiram "#" (não havia validação obrigando), mas normalize()
  agora tira qualquer "#" digitado, tanto no client (TagInput) quanto no
  server (tags/service.ts normalizeTagName) — "#uber" e "uber" convergem pro
  mesmo Tag. Script `strip-hash-prefix-from-tags.ts` criado para limpar tags
  já salvas com "#" (rodado local: nenhuma encontrada).
- PIX com o nome do próprio usuário no texto agora é sugerido como
  kind=transfer pelo extractor (prompt recebe o nome do usuário e a regra
  de PIX) — extractor.ts + routes.ts buscam User.name antes de extrair.
- Prompt do extractor agora diferencia fatura de cartão (nem tudo é
  "expense" — pagamento/estorno/crédito é "income") de extrato de conta.
- Linha extraída agora tem um seletor de Tipo (Débito/Crédito/Transferência)
  editável na revisão — StagingReviewRow.tsx + ImportReviewPage.tsx; backend
  já aceitava `kind` no PATCH da linha, só faltava a UI.

Próximo item de desenvolvimento: importação de faturas/extratos (PDF →
markitdown → LLM), ver `apps/api` — pipeline em produção, iterando em cima
dos pontos acima.
