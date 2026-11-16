"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { agrupar, ESTADOS, type EstadoChecklist } from "@/lib/checklist";
import { cn } from "@/lib/utils";

type ItemConfig = { id: string; grupo: string; descricao: string };
type Resposta = { estado: EstadoChecklist | null; obs: string };

const OPCOES: { v: EstadoChecklist; cor: string }[] = [
  { v: "ok", cor: "bg-ok text-white" },
  { v: "problema", cor: "bg-danger text-white" },
  { v: "nao_tem", cor: "bg-zinc-700 text-white" },
];

/** Checklist de entrada: cada item OK / com problema / não tem. Vai no formulário como JSON. */
export function ChecklistCampo({ itens }: { itens: ItemConfig[] }) {
  const [resp, setResp] = useState<Record<string, Resposta>>({});
  const grupos = agrupar(itens);
  const pendentes = itens.filter((i) => !resp[i.id]?.estado).length;

  const set = (id: string, r: Partial<Resposta>) =>
    setResp((s) => ({ ...s, [id]: { estado: s[id]?.estado ?? null, obs: s[id]?.obs ?? "", ...r } }));

  const valor = JSON.stringify(
    itens.filter((i) => resp[i.id]?.estado).map((i) => ({ id: i.id, estado: resp[i.id].estado, obs: resp[i.id].obs.trim() || null })),
  );

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="checklist" value={valor} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {pendentes === 0 ? "Todos os itens conferidos." : `${pendentes} de ${itens.length} sem marcar.`}
        </p>
        {pendentes > 0 && (
          <Button
            type="button"
            onClick={() =>
              setResp((s) => {
                const n = { ...s };
                for (const i of itens) if (!n[i.id]?.estado) n[i.id] = { estado: "ok", obs: n[i.id]?.obs ?? "" };
                return n;
              })
            }
          >
            <CheckCheck />
            Marcar os restantes como OK
          </Button>
        )}
      </div>

      {grupos.map((g) => (
        <fieldset key={g.grupo} className="flex flex-col">
          <legend className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">{g.grupo}</legend>
          <ul className="divide-y divide-border">
            {g.itens.map((i) => {
              const r = resp[i.id];
              return (
                <li key={i.id} className="flex flex-col gap-2 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span className="font-medium">{i.descricao}</span>
                    <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border-strong" role="radiogroup" aria-label={i.descricao}>
                      {OPCOES.map((o) => {
                        const ativo = r?.estado === o.v;
                        return (
                          <button
                            key={o.v}
                            type="button"
                            role="radio"
                            aria-checked={ativo}
                            onClick={() => set(i.id, { estado: ativo ? null : o.v })}
                            className={cn(
                              "h-10 min-w-[76px] border-l border-border-strong px-2.5 text-[13px] font-medium first:border-l-0",
                              ativo ? o.cor : "bg-white text-foreground-2 hover:bg-subtle",
                            )}
                          >
                            {ESTADOS[o.v].curto}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {r?.estado === "problema" && (
                    <Input
                      aria-label={`O que há com ${i.descricao}`}
                      placeholder="O que foi notado? (opcional)"
                      value={r.obs}
                      onChange={(e) => set(i.id, { obs: e.target.value })}
                      maxLength={200}
                      className="h-10"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
