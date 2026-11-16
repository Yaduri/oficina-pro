"use client";

import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { COLUNAS, STATUS, type StatusOS } from "@/lib/os";
import { moverOS } from "./actions";

/** Menu para mudar o status da OS (no celular substitui o arrastar). */
export function MoverOS({
  osId,
  status,
  grande = false,
  podeFechar = true,
}: {
  osId: string;
  status: StatusOS;
  grande?: boolean;
  /** Pode entregar, cancelar e reabrir (técnico não pode) */
  podeFechar?: boolean;
}) {
  const [pending, start] = useTransition();
  // A entrega tem formulário próprio ("Entregar veículo"). Na tela da OS também dá para cancelar
  // e reabrir uma OS entregue/cancelada (escolhendo uma coluna do quadro).
  const fechada = status === "entregue" || status === "cancelada";
  const base: StatusOS[] = podeFechar && grande ? [...COLUNAS, "cancelada"] : COLUNAS;
  const opcoes: StatusOS[] = !podeFechar && fechada ? [status] : base.includes(status) ? base : [status, ...base];

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Mudar status da OS</span>
      <select
        value={status}
        disabled={pending || (!podeFechar && fechada)}
        onChange={(e) => {
          const novo = e.target.value;
          if (novo === "cancelada" && !confirm("Cancelar esta OS?")) return;
          start(async () => {
            await moverOS(osId, novo);
          });
        }}
        className={
          grande
            ? "h-9 cursor-pointer appearance-none rounded-md border border-border bg-card pl-3 pr-8 text-sm font-medium hover:bg-subtle disabled:opacity-60"
            : "h-7 cursor-pointer appearance-none rounded-md border border-border bg-card pl-2 pr-6 text-xs font-medium text-foreground-2 hover:bg-subtle disabled:opacity-60"
        }
      >
        {opcoes.map((s) => (
          <option key={s} value={s}>
            {s === status
              ? STATUS[s].label
              : s === "cancelada"
                ? "Cancelar OS"
                : fechada
                  ? `Reabrir em: ${STATUS[s].label}`
                  : `${grande ? "" : "Mover: "}${STATUS[s].label}`}
          </option>
        ))}
      </select>
      <ChevronDown className={grande ? "pointer-events-none absolute right-2.5 size-4 text-muted" : "pointer-events-none absolute right-1.5 size-3.5 text-muted"} />
    </label>
  );
}
