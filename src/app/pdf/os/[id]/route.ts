import { getContexto } from "@/lib/oficina";
import { pdfOS } from "@/lib/pdf/carregar";
import { respostaPdf } from "@/lib/pdf/gerar";

const UUID = /^[0-9a-f-]{36}$/i;

/** PDF da OS (?via=cliente|oficina, ?baixar=1) */
export async function GET(req: Request, ctx: RouteContext<"/pdf/os/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Não encontrado", { status: 404 });
  const { oficina, pode } = await getContexto();
  const url = new URL(req.url);
  const via = url.searchParams.get("via") === "oficina" ? "oficina" : "cliente";
  const r = await pdfOS(oficina.id, id, { via, valores: pode("verValores") });
  if (!r) return new Response("Não encontrado", { status: 404 });
  return respostaPdf(r.doc, r.nome.replace(".pdf", via === "oficina" ? "-via-oficina.pdf" : ".pdf"), url.searchParams.has("baixar"));
}
