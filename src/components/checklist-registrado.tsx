import { Check, Minus, TriangleAlert, X } from "lucide-react";
import type { ItemChecklistRegistrado } from "@/db/schema";
import { agrupar, ESTADOS } from "@/lib/checklist";
import { cn } from "@/lib/utils";

const ICONE = {
  ok: <Check className="size-4 text-ok" aria-hidden />,
  problema: <TriangleAlert className="size-4 text-danger" aria-hidden />,
  nao_tem: <X className="size-4 text-foreground-2" aria-hidden />,
  null: <Minus className="size-4 text-muted" aria-hidden />,
};

/** Checklist completo, agrupado (termo de entrada) */
export function ChecklistRegistrado({ itens }: { itens: ItemChecklistRegistrado[] }) {
  return (
    <div className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2 print:grid-cols-2">
      {agrupar(itens).map((g) => (
        <div key={g.grupo} className="break-inside-avoid">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{g.grupo}</p>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {g.itens.map((i) => (
              <li key={i.descricao} className="flex items-start gap-2">
                <span className="mt-px">{ICONE[i.estado ?? "null"]}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn(i.estado === "problema" && "font-medium text-danger")}>{i.descricao}</span>
                  <span className="text-muted"> · {i.estado ? ESTADOS[i.estado].label : "Não verificado"}</span>
                  {i.obs && <span className="block text-foreground-2">{i.obs}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Só o que chama atenção (tela da OS) */
export function ChecklistResumo({ itens }: { itens: ItemChecklistRegistrado[] }) {
  const problemas = itens.filter((i) => i.estado === "problema");
  const ausentes = itens.filter((i) => i.estado === "nao_tem");
  const naoVerificados = itens.filter((i) => !i.estado).length;

  if (problemas.length === 0 && ausentes.length === 0) {
    return (
      <p className="flex items-center gap-2 px-5 py-4 text-[13px]">
        <Check className="size-4 text-ok" aria-hidden />
        {naoVerificados === 0 ? "Todos os itens conferidos e OK." : `Sem problemas apontados (${naoVerificados} não verificados).`}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5 px-5 py-4 text-[13px]">
      {problemas.map((i) => (
        <li key={`p-${i.grupo}-${i.descricao}`} className="flex items-start gap-2">
          <TriangleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden />
          <span>
            <span className="font-medium">{i.descricao}</span>
            {i.obs && <span className="text-foreground-2">: {i.obs}</span>}
          </span>
        </li>
      ))}
      {ausentes.length > 0 && (
        <li className="flex items-start gap-2 text-foreground-2">
          <X className="mt-px size-4 shrink-0" aria-hidden />
          <span>Não tem: {ausentes.map((i) => i.descricao.toLowerCase()).join(", ")}</span>
        </li>
      )}
    </ul>
  );
}
