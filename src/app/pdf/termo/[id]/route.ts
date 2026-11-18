import { getContexto } from "@/lib/oficina";
import { pdfTermo } from "@/lib/pdf/carregar";
import { respostaPdf } from "@/lib/pdf/gerar";

const UUID = /^[0-9a-f-]{36}$/i;

/** PDF do termo de entrada (id do check-in) */
export async function GET(req: Request, ctx: RouteContext<"/pdf/termo/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Não encontrado", { status: 404 });
  const { oficina } = await getContexto();
  const r = await pdfTermo(oficina.id, id);
  if (!r) return new Response("Não encontrado", { status: 404 });
  return respostaPdf(r.doc, r.nome, new URL(req.url).searchParams.has("baixar"));
}
