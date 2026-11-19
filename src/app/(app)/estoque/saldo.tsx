import { qtdTexto } from "@/lib/estoque-formato";
import { cn } from "@/lib/utils";

/** Saldo da peça: negativo em vermelho, zerado ou no mínimo em amarelo */
export function Saldo({ saldo, minimo, unidade, className }: { saldo: number; minimo: number; unidade: string; className?: string }) {
  const tom = saldo < 0 ? "font-semibold text-danger" : saldo === 0 || (minimo > 0 && saldo <= minimo) ? "font-medium text-warn" : "";
  return (
    <span className={cn("tabular-nums", tom, className)}>
      {qtdTexto(saldo, unidade)}
      {saldo < 0 && <span className="sr-only"> (saldo negativo)</span>}
    </span>
  );
}

export const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
