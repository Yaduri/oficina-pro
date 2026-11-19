import { portalPorToken } from "@/lib/relacionamento";
import { lerArquivo } from "@/lib/storage";

/** Logo da oficina para o portal do cliente (o token do link é a autorização) */
export async function GET(_req: Request, ctx: RouteContext<"/portal/[token]/logo">) {
  const { token } = await ctx.params;
  const dados = await portalPorToken(token);
  const key = dados?.oficina.logoKey;
  if (!key) return new Response("Não encontrado", { status: 404 });

  const arquivo = await lerArquivo(key);
  if (!arquivo) return new Response("Não encontrado", { status: 404 });

  const body: BodyInit = Buffer.isBuffer(arquivo.body) ? new Uint8Array(arquivo.body) : arquivo.body;
  return new Response(body, {
    headers: {
      "content-type": arquivo.contentType,
      "cache-control": "private, max-age=3600",
      ...(arquivo.tamanho ? { "content-length": String(arquivo.tamanho) } : {}),
    },
  });
}
