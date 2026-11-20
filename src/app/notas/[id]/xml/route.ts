import { z } from "zod";
import { obterNotaDetalhe } from "@/lib/fiscal/notas";
import { getContexto } from "@/lib/oficina";
import { lerArquivo } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/notas/[id]/xml">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Não encontrado", { status: 404 });

  const { oficina, pode } = await getContexto();
  if (!pode("fiscal")) return new Response("Sem permissão", { status: 403 });

  const detalhe = await obterNotaDetalhe(oficina.id, id);
  if (!detalhe) return new Response("Nota não encontrada", { status: 404 });

  const tipo = new URL(req.url).searchParams.get("tipo") ?? "nfse";
  const key =
    tipo === "dps"
      ? detalhe.nota.xmlDpsKey
      : tipo === "cancelamento"
        ? detalhe.nota.xmlCancelamentoKey
        : detalhe.nota.xmlNotaKey ?? detalhe.nota.xmlDpsKey;

  if (!key) return new Response("XML não disponível", { status: 404 });
  const arq = await lerArquivo(key);
  if (!arq) return new Response("Arquivo XML não encontrado", { status: 404 });

  const idArq = detalhe.nota.numeroNota ?? `DPS-${detalhe.nota.numeroDps}`;
  const sufixo = tipo === "dps" ? "dps" : tipo === "cancelamento" ? "cancelamento" : "nfse";
  const corpo = Buffer.isBuffer(arq.body) ? new Uint8Array(arq.body) : arq.body;

  return new Response(corpo, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="NFSe-${idArq}-${sufixo}.xml"`,
      "cache-control": "private, no-store",
    },
  });
}
