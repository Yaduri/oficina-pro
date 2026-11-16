"use client";

import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { COLUNAS, STATUS, type StatusOS } from "@/lib/os";
import { moverOS } from "./actions";

/** Menu para mudar o status da OS (no celular substitui o arrastar). */
export function MoverOS({ osId, status, grande = false }: { osId: string; status: StatusOS; grande?: boolean }) {
  const [pending, start] = useTransition();
  // Na tela da OS também é possível cancelar e reabrir uma OS entregue/cancelada
  const opcoes: StatusOS[] = grande ? [...COLUNAS, "entregue", "cancelada"] : [...COLUNAS, "entregue"];

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Mudar status da OS</span>
      <select
        value={status}
        disabled={pending}
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
              : s === "entregue"
                ? "Entregar ao cliente"
                : s === "cancelada"
                  ? "Cancelar OS"
                  : `${grande ? "" : "Mover: "}${STATUS[s].label}`}
          </option>
        ))}
      </select>
      <ChevronDown className={grande ? "pointer-events-none absolute right-2.5 size-4 text-muted" : "pointer-events-none absolute right-1.5 size-3.5 text-muted"} />
    </label>
  );
}
