/*
 * Regras do recebimento da OS usadas no navegador e no servidor (sem acesso ao banco).
 * Os rótulos das formas ficam em FORMAS (src/lib/financeiro.ts).
 */

export type FormaPagamento = "dinheiro" | "pix" | "debito" | "credito" | "boleto" | "transferencia" | "a_prazo";
export const FORMAS_PAGAMENTO: FormaPagamento[] = ["pix", "dinheiro", "debito", "credito", "boleto", "transferencia", "a_prazo"];

/** Entra na hora: baixa automática no dia */
export const A_VISTA: FormaPagamento[] = ["dinheiro", "pix", "debito", "transferencia"];
/** Aceitam parcelas (1 a 12) */
export const PARCELAVEL: FormaPagamento[] = ["credito", "boleto", "a_prazo"];
/** O usuário escolhe o 1º vencimento (as demais parcelas vencem de mês em mês) */
export const COM_VENCIMENTO: FormaPagamento[] = ["boleto", "a_prazo"];
/** Têm taxa da maquininha */
export const COM_TAXA: FormaPagamento[] = ["debito", "credito"];

export type TaxasCartao = { debito: number; credito: number; creditoParcelado: number };

/** Taxa (%) sugerida pela configuração da oficina */
export function taxaPadrao(taxas: TaxasCartao | null | undefined, forma: string, parcelas: number) {
  if (!taxas) return 0;
  if (forma === "debito") return taxas.debito ?? 0;
  if (forma === "credito") return (parcelas > 1 ? taxas.creditoParcelado : taxas.credito) ?? 0;
  return 0;
}

/** Valor da taxa em centavos */
export const valorTaxa = (centavos: number, pct: number) => Math.round((centavos * pct) / 100);

/** Linha de pagamento enviada pelo formulário (valores em texto, como digitados) */
export type LinhaPagamentoForm = {
  forma: string;
  valor: string;
  parcelas: number;
  contaId: string;
  /** 1º vencimento (boleto e a prazo), AAAA-MM-DD */
  vencimento: string;
  /** Taxa da maquininha em % */
  taxa: string;
};
