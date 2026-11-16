import { getContexto } from "@/lib/oficina";
import { lerArquivo } from "@/lib/storage";

/** Entrega um arquivo só para usuários da oficina dona dele */
export async function GET(_req: Request, ctx: RouteContext<"/arquivos/[...key]">) {
  const { key: partes } = await ctx.params;
  const key = partes.join("/");
  const { oficina } = await getContexto();
  if (!key.startsWith(`${oficina.id}/`)) return new Response("Não encontrado", { status: 404 });

  const arquivo = await lerArquivo(key);
  if (!arquivo) return new Response("Não encontrado", { status: 404 });

  const body: BodyInit = Buffer.isBuffer(arquivo.body) ? new Uint8Array(arquivo.body) : arquivo.body;
  return new Response(body, {
    headers: {
      "content-type": arquivo.contentType,
      // Arquivos nunca mudam (chave nova a cada envio)
      "cache-control": "private, max-age=31536000, immutable",
      ...(arquivo.tamanho ? { "content-length": String(arquivo.tamanho) } : {}),
    },
  });
}
