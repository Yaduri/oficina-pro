/** Totais da OS a partir dos itens (itens recusados pelo cliente ficam fora) */
export type ItemValor = { tipo: "peca" | "servico"; quantidade: number; valorUnitario: number; recusado?: boolean };

export function calcularTotais(itens: ItemValor[], desconto: { percentual: number | null; valor: number }) {
  const soma = (l: ItemValor[]) => l.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const validos = itens.filter((i) => !i.recusado);
  const bruto = soma(validos);
  const pecas = soma(validos.filter((i) => i.tipo === "peca"));
  const valorDesconto = Math.min(bruto, desconto.percentual != null ? (bruto * desconto.percentual) / 100 : desconto.valor);
  const arred = (n: number) => Math.round(n * 100) / 100;
  return {
    bruto: arred(bruto),
    pecas: arred(pecas),
    servicos: arred(bruto - pecas),
    desconto: arred(valorDesconto),
    total: arred(bruto - valorDesconto),
    recusado: arred(soma(itens.filter((i) => i.recusado))),
  };
}

/** Total de uma seleção de itens do orçamento com o desconto aplicado na mesma proporção */
export function totalSelecionado(
  itens: { id: string; quantidade: number; valorUnitario: number }[],
  selecionados: Set<string>,
  desconto: number,
) {
  const bruto = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const sel = itens.filter((i) => selecionados.has(i.id)).reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const desc = bruto > 0 ? Math.min(sel, (desconto * sel) / bruto) : 0;
  return { bruto: sel, desconto: Math.round(desc * 100) / 100, total: Math.round((sel - desc) * 100) / 100 };
}
