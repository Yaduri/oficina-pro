import { getContexto } from "@/lib/oficina";
import { pdfOrcamentoDaOS } from "@/lib/pdf/carregar";
import { respostaPdf } from "@/lib/pdf/gerar";

const UUID = /^[0-9a-f-]{36}$/i;

/** PDF do orçamento de uma OS (id da OS) */
export async function GET(req: Request, ctx: RouteContext<"/pdf/orcamento/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Não encontrado", { status: 404 });
  const { oficina, empresas, pode } = await getContexto();
  if (!pode("verValores")) return new Response("Sem permissão", { status: 403 });
  const r = await pdfOrcamentoDaOS(oficina.id, empresas.map((e) => e.id), id);
  if (!r) return new Response("Não encontrado", { status: 404 });
  return respostaPdf(r.doc, r.nome, new URL(req.url).searchParams.has("baixar"));
}
