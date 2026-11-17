import { pdfOrcamentoPorToken } from "@/lib/pdf/carregar";
import { respostaPdf } from "@/lib/pdf/gerar";

/** PDF do orçamento pelo link do cliente (o token é a autorização) */
export async function GET(req: Request, ctx: RouteContext<"/orcamento/[token]/pdf">) {
  const { token } = await ctx.params;
  const r = await pdfOrcamentoPorToken(token);
  if (!r) return new Response("Não encontrado", { status: 404 });
  return respostaPdf(r.doc, r.nome, new URL(req.url).searchParams.has("baixar"));
}
