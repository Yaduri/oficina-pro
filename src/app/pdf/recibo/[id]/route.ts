import { getContexto } from "@/lib/oficina";
import { respostaPdf } from "@/lib/pdf/gerar";
import { pdfRecibo } from "@/lib/pdf/recibo";

const UUID = /^[0-9a-f-]{36}$/i;

/** Recibo dos pagamentos da OS (?baixar=1). Só para quem vê valores. */
export async function GET(req: Request, ctx: RouteContext<"/pdf/recibo/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Não encontrado", { status: 404 });
  const { oficina, pode } = await getContexto();
  if (!pode("verValores")) return new Response("Sem permissão", { status: 403 });
  const r = await pdfRecibo(oficina.id, id);
  if (!r) return new Response("Não encontrado", { status: 404 });
  return respostaPdf(r.doc, r.nome, new URL(req.url).searchParams.has("baixar"));
}
