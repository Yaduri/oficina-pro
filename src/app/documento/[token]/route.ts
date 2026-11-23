import { getDbSistema } from "@/db";
import { obterOuGerarDanfsePdf } from "@/lib/fiscal/notas";
import { TOKEN_RE } from "@/lib/orcamento";
import { documentoPorToken, pdfOS, pdfTermo } from "@/lib/pdf/carregar";
import { respostaPdf } from "@/lib/pdf/gerar";
import { ipDaRequisicao, respostaMuitasTentativas, verificarLimite } from "@/lib/rate-limit";

/**
 * Documento enviado ao cliente por link (OS na via do cliente, termo de entrada ou DANFSe).
 * O token é a autorização; a OS sai sempre com os dados atuais.
 */
export async function GET(req: Request, ctx: RouteContext<"/documento/[token]">) {
  const lim = await verificarLimite({ chave: `doc:${ipDaRequisicao(req.headers)}`, limite: 60, janelaSeg: 600 });
  if (!lim.permitido) return respostaMuitasTentativas(lim);

  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return new Response("Não encontrado", { status: 404 });
  const link = await documentoPorToken(token);
  if (!link || (link.tipo !== "os" && link.tipo !== "termo" && link.tipo !== "nota")) return new Response("Não encontrado", { status: 404 });
  // Sem login: conexão do sistema; as consultas filtram pela oficina do link
  const db = await getDbSistema();
  const baixar = new URL(req.url).searchParams.has("baixar");
  if (link.tipo === "nota") {
    const danfse = await obterOuGerarDanfsePdf(link.oficinaId, link.refId, db);
    if (!danfse) return new Response("Não encontrado", { status: 404 });
    return new Response(new Uint8Array(danfse.buffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${baixar ? "attachment" : "inline"}; filename="${danfse.nome}"`,
        "cache-control": "private, no-store",
      },
    });
  }
  const r =
    link.tipo === "os"
      ? await pdfOS(link.oficinaId, link.refId, { via: "cliente", valores: true, db })
      : await pdfTermo(link.oficinaId, link.refId, db);
  if (!r) return new Response("Não encontrado", { status: 404 });
  return respostaPdf(r.doc, r.nome, baixar);
}
