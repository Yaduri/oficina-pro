import { acompanhamentoPorToken } from "@/lib/acompanhamento";
import { lerArquivo } from "@/lib/storage";

/** Logo da oficina para o link de acompanhamento (o token do link é a autorização) */
export async function GET(_req: Request, ctx: RouteContext<"/acompanhamento/[token]/logo">) {
  const { token } = await ctx.params;
  const dados = await acompanhamentoPorToken(token);
  const key = dados?.oficina.logoKey;
  if (!key || !key.startsWith(`${dados.oficina.id}/`)) return new Response("Não encontrado", { status: 404 });

  const arquivo = await lerArquivo(key);
  if (!arquivo) return new Response("Não encontrado", { status: 404 });

  const body: BodyInit = Buffer.isBuffer(arquivo.body) ? new Uint8Array(arquivo.body) : arquivo.body;
  return new Response(body, {
    headers: {
      "content-type": arquivo.contentType,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
      ...(arquivo.tamanho ? { "content-length": String(arquivo.tamanho) } : {}),
    },
  });
}
