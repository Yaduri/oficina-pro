import "server-only";
import { lerArquivo } from "@/lib/storage";

/** Imagem pronta para o @react-pdf (só aceita JPEG e PNG) */
export type ImagemPdf = { data: Buffer; format: "jpg" | "png" };

type Opcoes = { largura?: number; png?: boolean };

/** Formato pelos primeiros bytes (o content-type salvo nem sempre é confiável) */
function formato(b: Buffer): "jpg" | "png" | "webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Rodando no Cloudflare Workers (deploy via OpenNext)? Lá o sharp (binário nativo) não existe. */
const emWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

type ImagesBinding = {
  input(s: ReadableStream): {
    transform(t: Record<string, unknown>): { output(o: Record<string, unknown>): Promise<{ response(): Response }> };
  };
};

/**
 * No Workers: usa o binding IMAGES (Cloudflare Images) para reduzir/converter.
 * Sem o binding ou se ele falhar (ex.: cota gratuita esgotada), JPEG e PNG vão como estão:
 * as fotos já chegam do celular em JPEG de até 1600 px, na orientação certa (upload-cliente.ts),
 * e logos/assinaturas já são PNG ou JPEG. Só um WebP sem conversão fica de fora do PDF.
 */
async function noWorkers(bruto: Buffer, lado: number, png: boolean): Promise<ImagemPdf | null> {
  const original = formato(bruto);
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const images = (getCloudflareContext().env as { IMAGES?: ImagesBinding }).IMAGES;
    if (images) {
      const res = (
        await images
          .input(new Blob([new Uint8Array(bruto)]).stream())
          .transform({ width: lado, height: lado, fit: "scale-down", ...(png ? {} : { background: "#ffffff" }) })
          .output({ format: png ? "image/png" : "image/jpeg", quality: 70 })
      ).response();
      if (res.ok) return { data: Buffer.from(await res.arrayBuffer()), format: png ? "png" : "jpg" };
    }
  } catch (e) {
    console.error("PDF: Cloudflare Images falhou, usando a imagem original", e);
  }
  return original === "jpg" || original === "png" ? { data: bruto, format: original } : null;
}

/** Em Node (desenvolvimento ou servidor comum): sharp gira pela câmera, reduz e converte */
async function comSharp(bruto: Buffer, lado: number, png: boolean): Promise<ImagemPdf> {
  // No build do Cloudflare o sharp é trocado por um stub (next.config.ts), e esta função nem é chamada
  const { default: sharp } = await import("sharp");
  const img = sharp(bruto).rotate().resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true });
  if (png) return { data: await img.png({ compressionLevel: 9 }).toBuffer(), format: "png" };
  return { data: await img.flatten({ background: "#ffffff" }).jpeg({ quality: 70, mozjpeg: true }).toBuffer(), format: "jpg" };
}

/**
 * Lê um arquivo do armazenamento e prepara para o PDF: gira pela orientação da câmera,
 * reduz para `largura` px e converte (WebP vira JPEG/PNG). Fotos viram JPEG leve;
 * logos e assinaturas ficam PNG para manter a transparência.
 */
export async function imagemPdf(key: string | null | undefined, opcoes: Opcoes = {}): Promise<ImagemPdf | null> {
  if (!key) return null;
  try {
    const arq = await lerArquivo(key);
    if (!arq) return null;
    const bruto = Buffer.isBuffer(arq.body) ? arq.body : Buffer.from(await new Response(arq.body).arrayBuffer());
    const lado = opcoes.largura ?? 900;
    const png = !!opcoes.png;
    return emWorkers() ? await noWorkers(bruto, lado, png) : await comSharp(bruto, lado, png);
  } catch (e) {
    console.error("PDF: falha ao preparar imagem", key, e);
    return null;
  }
}
