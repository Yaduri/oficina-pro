/** Opções de combustível do veículo (valor gravado → rótulo) */
export const COMBUSTIVEIS = [
  { valor: "flex", label: "Flex" },
  { valor: "gasolina", label: "Gasolina" },
  { valor: "etanol", label: "Etanol" },
  { valor: "diesel", label: "Diesel" },
  { valor: "gnv", label: "GNV" },
  { valor: "eletrico", label: "Elétrico" },
  { valor: "hibrido", label: "Híbrido" },
] as const;

export const nomeCombustivel = (v: string | null | undefined) => COMBUSTIVEIS.find((c) => c.valor === v)?.label ?? null;
