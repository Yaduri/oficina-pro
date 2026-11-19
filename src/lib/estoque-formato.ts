/*
 * Formatação de estoque usada no servidor e no navegador (lib/estoque.ts é só do servidor).
 */

/** Unidades de medida das peças */
export const UNIDADES = ["UN", "PC", "CX", "KG", "L", "M", "JG", "KIT"] as const;

/** 2.5 → "2,5"; com unidade diferente de UN: "2,5 L" */
export function qtdTexto(n: number, unidade?: string | null) {
  const s = (Math.round(n * 1000) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return unidade && unidade !== "UN" ? `${s} ${unidade}` : s;
}

/** Margem sobre o preço de venda, em %; null sem preço ou sem custo */
export function margem(venda: number, custo: number) {
  if (!(venda > 0) || !(custo > 0)) return null;
  return ((venda - custo) / venda) * 100;
}

/** "1.234,5" / "1234.5" / "-3" → número (NaN se inválido) */
export function lerQtd(v: string) {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}
