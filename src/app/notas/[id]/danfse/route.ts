import { z } from "zod";
import { obterOuGerarDanfsePdf } from "@/lib/fiscal/notas";
import { getContexto } from "@/lib/oficina";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/notas/[id]/danfse">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Não encontrado", { status: 404 });

  const { oficina, pode } = await getContexto();
  if (!pode("fiscal")) return new Response("Sem permissão", { status: 403 });

  const pdf = await obterOuGerarDanfsePdf(oficina.id, id);
  if (!pdf) return new Response("Nota não encontrada", { status: 404 });

  const baixar = new URL(req.url).searchParams.has("baixar");
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${baixar ? "attachment" : "inline"}; filename="${pdf.nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
