// IMPLEMENTACAO.md §6.6 — parcelamento: divide um total em N parcelas
// inteiras (centavos), o mais igual possível. Quando a divisão não é exata,
// o resto vai para a ÚLTIMA parcela (ex.: 2.500 centavos em 3x → 833/833/834),
// nunca na primeira — assim as parcelas já pagas/exibidas primeiro nunca
// mudam de valor se o total for recalculado.
//
// Compartilhado entre apps/api (fonte da verdade ao criar as N linhas de
// Transaction) e apps/web (pré-visualização da tabela editável no dialog de
// nova transação) para os dois lados nunca divergirem em arredondamento.
export function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? base + remainder : base,
  );
}
