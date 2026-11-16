import type { EstadoChecklist } from "@/db/schema";

export type { EstadoChecklist };

export const ESTADOS: Record<EstadoChecklist, { label: string; curto: string }> = {
  ok: { label: "OK", curto: "OK" },
  problema: { label: "Com problema", curto: "Problema" },
  nao_tem: { label: "Não tem", curto: "Não tem" },
};

/** Sugestão inicial (a oficina adiciona com um clique e ajusta como quiser) */
export const SUGESTAO_CHECKLIST: { grupo: string; itens: string[] }[] = [
  { grupo: "Itens do veículo", itens: ["Estepe", "Macaco", "Chave de roda", "Triângulo", "Tapetes", "Documento do veículo"] },
  {
    grupo: "Painel e elétrica",
    itens: ["Luzes de alerta no painel", "Faróis e lanternas", "Setas e luz de freio", "Rádio / multimídia", "Ar-condicionado", "Vidros elétricos"],
  },
  { grupo: "Verificações", itens: ["Nível do óleo", "Nível da água do radiador", "Pneus"] },
];

/** Agrupa mantendo a ordem em que os grupos aparecem */
export function agrupar<T extends { grupo: string }>(itens: T[]) {
  const grupos = new Map<string, T[]>();
  for (const i of itens) {
    if (!grupos.has(i.grupo)) grupos.set(i.grupo, []);
    grupos.get(i.grupo)!.push(i);
  }
  return [...grupos.entries()].map(([grupo, lista]) => ({ grupo, itens: lista }));
}
