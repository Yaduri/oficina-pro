import { fotoDoAcompanhamento } from "@/lib/acompanhamento";
import { lerArquivo } from "@/lib/storage";
import { ipDaRequisicao, respostaMuitasTentativas, verificarLimite } from "@/lib/rate-limit";

/**
 * Foto do serviço para o link de acompanhamento: só se for da OS do token e a oficina tiver
 * marcado "Mostrar ao cliente". O token do link é a autorização.
 */
export async function GET(req: Request, ctx: RouteContext<"/acompanhamento/[token]/foto/[id]">) {
  const lim = await verificarLimite({ chave: `acomp-foto:${ipDaRequisicao(req.headers)}`, limite: 300, janelaSeg: 600 });
  if (!lim.permitido) return respostaMuitasTentativas(lim);

  const { token, id } = await ctx.params;
  const key = await fotoDoAcompanhamento(token, id);
  if (!key) return new Response("Não encontrado", { status: 404 });

  const arquivo = await lerArquivo(key);
  if (!arquivo || !arquivo.contentType.startsWith("image/")) return new Response("Não encontrado", { status: 404 });

  const body: BodyInit = Buffer.isBuffer(arquivo.body) ? new Uint8Array(arquivo.body) : arquivo.body;
  return new Response(body, {
    headers: {
      "content-type": arquivo.contentType,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      // A oficina pode deixar de mostrar a foto: cache curto e só no aparelho
      "cache-control": "private, max-age=300",
      ...(arquivo.tamanho ? { "content-length": String(arquivo.tamanho) } : {}),
    },
  });
}
