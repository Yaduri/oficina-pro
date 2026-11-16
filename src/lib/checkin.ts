/** Posições das fotos do check-in, na ordem em que são pedidas */
export const POSICOES = ["frente", "traseira", "esquerda", "direita", "painel", "avaria", "outra"] as const;
export type Posicao = (typeof POSICOES)[number];

export const ROTULO_POSICAO: Record<Posicao, string> = {
  frente: "Frente",
  traseira: "Traseira",
  esquerda: "Lateral esquerda",
  direita: "Lateral direita",
  painel: "Painel (km e combustível)",
  avaria: "Avaria",
  outra: "Outra",
};

/** Fotos obrigatórias no check-in (uma de cada) */
export const FOTOS_PADRAO: Posicao[] = ["frente", "traseira", "esquerda", "direita", "painel"];

/** Combustível em oitavos: 0 = reserva, 4 = meio, 8 = cheio */
export function rotuloCombustivel(n: number | null | undefined) {
  if (n == null) return "—";
  const nomes: Record<number, string> = { 0: "Reserva", 2: "1/4", 4: "1/2", 6: "3/4", 8: "Cheio" };
  return nomes[n] ?? `${n}/8`;
}
