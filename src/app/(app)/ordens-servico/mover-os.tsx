"use client";

import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { COLUNAS, STATUS, type StatusOS } from "@/lib/os";
import { moverOS } from "./actions";

/** Menu para mudar o status da OS (no celular substitui o arrastar). */
export function MoverOS({ osId, status }: { osId: string; status: StatusOS }) {
  const [pending, start] = useTransition();
  const opcoes: StatusOS[] = [...COLUNAS, "entregue"];

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Mudar status da OS</span>
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const novo = e.target.value;
          start(async () => {
            await moverOS(osId, novo);
          });
        }}
        className="h-7 cursor-pointer appearance-none rounded-md border border-border bg-card pl-2 pr-6 text-xs font-medium text-foreground-2 hover:bg-subtle disabled:opacity-60"
      >
        {opcoes.map((s) => (
          <option key={s} value={s}>
            {s === status ? STATUS[s].label : s === "entregue" ? "Entregar ao cliente" : `Mover: ${STATUS[s].label}`}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5 text-muted" />
    </label>
  );
}
