import { Card, CardHeader } from "@/components/ui";
import { pesquisaDaOS } from "@/lib/relacionamento";
import { cn, formatEntrada } from "@/lib/utils";

/** Resposta da pesquisa de satisfação da OS entregue (some enquanto não houver resposta) */
export async function PesquisaOS({ oficinaId, osId }: { oficinaId: string; osId: string }) {
  const p = await pesquisaDaOS(oficinaId, osId);
  if (!p?.respondidoEm || p.nota == null) return null;
  const tom = p.nota >= 9 ? "text-ok" : p.nota >= 7 ? "text-foreground-2" : "text-danger";

  return (
    <Card>
      <CardHeader title="Pesquisa de satisfação" action={<span className="text-[13px] text-muted">{formatEntrada(p.respondidoEm)}</span>} />
      <div className="flex flex-col gap-2 px-5 py-4 text-[13px]">
        <p>
          Nota <span className={cn("text-[18px] font-semibold tabular-nums", tom)}>{p.nota}</span>
          <span className="text-muted"> de 10</span>
        </p>
        {p.comentario && <p className="whitespace-pre-line text-foreground-2">{p.comentario}</p>}
      </div>
    </Card>
  );
}
