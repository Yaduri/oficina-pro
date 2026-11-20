import { getContexto } from "@/lib/oficina";
import { lerArquivo } from "@/lib/storage";

/** Entrega um arquivo só para usuários da oficina dona dele */
export async function GET(_req: Request, ctx: RouteContext<"/arquivos/[...key]">) {
  const { key: partes } = await ctx.params;
  const key = partes.join("/");
  const { oficina, papel } = await getContexto();
  if (!key.startsWith(`${oficina.id}/`)) return new Response("Não encontrado", { status: 404 });
  // Contador só acessa arquivos fiscais e a logo da oficina
  if (papel === "contador" && !key.startsWith(`${oficina.id}/fiscal/`) && !key.startsWith(`${oficina.id}/logos/`)) {
    return new Response("Não encontrado", { status: 404 });
  }

  const arquivo = await lerArquivo(key);
  if (!arquivo) return new Response("Não encontrado", { status: 404 });

  const body: BodyInit = Buffer.isBuffer(arquivo.body) ? new Uint8Array(arquivo.body) : arquivo.body;
  return new Response(body, {
    headers: {
      "content-type": arquivo.contentType,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      // Arquivos nunca mudam (chave nova a cada envio)
      "cache-control": "private, max-age=31536000, immutable",
      ...(arquivo.tamanho ? { "content-length": String(arquivo.tamanho) } : {}),
    },
  });
}
