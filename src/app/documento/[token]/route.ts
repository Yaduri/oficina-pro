import { getDbSistema } from "@/db";
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
  if (!link || link.tipo === "portal") return new Response("Não encontrado", { status: 404 });
  // Sem login: conexão do sistema; as consultas filtram pela oficina do link
  const db = await getDbSistema();
  const r =
    link.tipo === "os"
      ? await pdfOS(link.oficinaId, link.refId, { via: "cliente", valores: true, db })
      : await pdfTermo(link.oficinaId, link.refId, db);
  if (!r) return new Response("Não encontrado", { status: 404 });
  return respostaPdf(r.doc, r.nome, new URL(req.url).searchParams.has("baixar"));
}
