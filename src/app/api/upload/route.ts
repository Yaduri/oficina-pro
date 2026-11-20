import { getContexto } from "@/lib/oficina";
import { respostaMuitasTentativas, verificarLimite } from "@/lib/rate-limit";
import { salvarArquivo } from "@/lib/storage";
import { tipoRealDoArquivo } from "@/lib/upload-validacao";

const IMAGENS = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGENS_E_PDF = new Set([...IMAGENS, "application/pdf"]);
const MAX = 8 * 1024 * 1024;
/** Pastas aceitas, o limite e os tipos de arquivo de cada uma */
const PASTAS: Record<string, { max: number; tipos: Set<string>; erroTipo: string }> = {
  checkins: { max: MAX, tipos: IMAGENS, erroTipo: "Envie uma imagem JPG, PNG ou WebP" },
  logos: { max: 2 * 1024 * 1024, tipos: IMAGENS, erroTipo: "Envie uma imagem JPG, PNG ou WebP" },
  /** Fotos durante o serviço e assinatura de retirada */
  os: { max: MAX, tipos: IMAGENS, erroTipo: "Envie uma imagem JPG, PNG ou WebP" },
  /** Anexos de contas a pagar/receber (boleto, nota): imagem ou PDF */
  financeiro: { max: MAX, tipos: IMAGENS_E_PDF, erroTipo: "Envie um PDF ou uma imagem JPG, PNG ou WebP" },
};

/**
 * Recebe um arquivo por vez (fotos já comprimidas no celular) e devolve a chave no armazenamento.
 * Aplica limite de envios por usuário e valida assinatura binária (magic bytes) do arquivo.
 */
export async function POST(req: Request) {
  const { oficina, userId, admin, pode } = await getContexto();
  if (!pode("checkin")) return Response.json({ erro: "Sem permissão" }, { status: 403 });

  // Limite de tentativas: até 60 envios a cada 10 minutos por usuário
  const lim = await verificarLimite({ chave: `upload:${oficina.id}:${userId}`, limite: 60, janelaSeg: 600 });
  if (!lim.permitido) return respostaMuitasTentativas(lim);

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  const pasta = String(form?.get("pasta") ?? "checkins");
  const regra = Object.hasOwn(PASTAS, pasta) ? PASTAS[pasta] : undefined;
  if (!regra) return Response.json({ erro: "Destino inválido" }, { status: 400 });
  if (pasta === "logos" && !admin) return Response.json({ erro: "Sem permissão" }, { status: 403 });
  if (pasta === "financeiro" && !pode("financeiro")) return Response.json({ erro: "Sem permissão" }, { status: 403 });
  if (!(arquivo instanceof File)) return Response.json({ erro: "Arquivo ausente" }, { status: 400 });
  if (arquivo.size > regra.max) {
    return Response.json({ erro: `Arquivo maior que ${regra.max / 1024 / 1024} MB` }, { status: 413 });
  }

  const dados = await arquivo.arrayBuffer();
  // Confere assinatura real do arquivo (impede HTML/SVG disfarçado de imagem)
  const tipoReal = tipoRealDoArquivo(new Uint8Array(dados));
  if (!tipoReal || !regra.tipos.has(tipoReal)) {
    return Response.json({ erro: regra.erroTipo }, { status: 415 });
  }

  const mes = new Date().toISOString().slice(0, 7);
  const key = `${oficina.id}/${pasta}/${mes}/${crypto.randomUUID()}`;
  await salvarArquivo(key, dados, tipoReal);
  return Response.json({ key });
}
