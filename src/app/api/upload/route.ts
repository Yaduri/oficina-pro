import { getContexto } from "@/lib/oficina";
import { salvarArquivo } from "@/lib/storage";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 8 * 1024 * 1024;

/**
 * Recebe uma foto por vez (já comprimida no celular) e devolve a chave no armazenamento.
 * Fotos de check-in abandonado ficam órfãs; uma limpeza periódica pode removê-las depois.
 */
export async function POST(req: Request) {
  const { oficina } = await getContexto();
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) return Response.json({ erro: "Arquivo ausente" }, { status: 400 });
  if (!TIPOS.has(arquivo.type)) return Response.json({ erro: "Envie uma imagem JPG, PNG ou WebP" }, { status: 415 });
  if (arquivo.size > MAX) return Response.json({ erro: "Imagem maior que 8 MB" }, { status: 413 });

  const mes = new Date().toISOString().slice(0, 7);
  const key = `${oficina.id}/checkins/${mes}/${crypto.randomUUID()}`;
  await salvarArquivo(key, await arquivo.arrayBuffer(), arquivo.type);
  return Response.json({ key });
}
