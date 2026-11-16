import { getContexto } from "@/lib/oficina";
import { salvarArquivo } from "@/lib/storage";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 8 * 1024 * 1024;
/** Pastas aceitas e o limite de cada uma */
const PASTAS: Record<string, { max: number }> = {
  checkins: { max: MAX },
  logos: { max: 2 * 1024 * 1024 },
  /** Fotos durante o serviço e assinatura de retirada */
  os: { max: MAX },
};

/**
 * Recebe uma foto por vez (já comprimida no celular) e devolve a chave no armazenamento.
 * Fotos de check-in abandonado ficam órfãs; uma limpeza periódica pode removê-las depois.
 */
export async function POST(req: Request) {
  const { oficina, admin } = await getContexto();
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  const pasta = String(form?.get("pasta") ?? "checkins");
  const regra = Object.hasOwn(PASTAS, pasta) ? PASTAS[pasta] : undefined;
  if (!regra) return Response.json({ erro: "Destino inválido" }, { status: 400 });
  if (pasta === "logos" && !admin) return Response.json({ erro: "Sem permissão" }, { status: 403 });
  if (!(arquivo instanceof File)) return Response.json({ erro: "Arquivo ausente" }, { status: 400 });
  if (!TIPOS.has(arquivo.type)) return Response.json({ erro: "Envie uma imagem JPG, PNG ou WebP" }, { status: 415 });
  if (arquivo.size > regra.max) {
    return Response.json({ erro: `Imagem maior que ${regra.max / 1024 / 1024} MB` }, { status: 413 });
  }

  const mes = new Date().toISOString().slice(0, 7);
  const key = `${oficina.id}/${pasta}/${mes}/${crypto.randomUUID()}`;
  await salvarArquivo(key, await arquivo.arrayBuffer(), arquivo.type);
  return Response.json({ key });
}
