import { TOKEN_RE } from "@/lib/orcamento";
import { documentoPorToken, pdfOS, pdfTermo } from "@/lib/pdf/carregar";
import { respostaPdf } from "@/lib/pdf/gerar";

/**
 * Documento enviado ao cliente por link (OS na via do cliente ou termo de entrada).
 * O token é a autorização; a OS sai sempre com os dados atuais.
 */
export async function GET(req: Request, ctx: RouteContext<"/documento/[token]">) {
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return new Response("Não encontrado", { status: 404 });
  const link = await documentoPorToken(token);
  if (!link) return new Response("Não encontrado", { status: 404 });
  const r =
    link.tipo === "os"
      ? await pdfOS(link.oficinaId, null, link.refId, { via: "cliente", valores: true })
      : await pdfTermo(link.oficinaId, null, link.refId);
  if (!r) return new Response("Não encontrado", { status: 404 });
  return respostaPdf(r.doc, r.nome, new URL(req.url).searchParams.has("baixar"));
}
