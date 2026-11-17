import "server-only";
import { lerArquivo } from "@/lib/storage";

/** Imagem pronta para o @react-pdf (só aceita JPEG e PNG) */
export type ImagemPdf = { data: Buffer; format: "jpg" | "png" };

/**
 * Lê um arquivo do armazenamento e prepara para o PDF: gira pela orientação da câmera,
 * reduz para `largura` px e converte (WebP vira JPEG/PNG). Fotos viram JPEG leve;
 * logos e assinaturas ficam PNG para manter a transparência.
 */
export async function imagemPdf(key: string | null | undefined, opcoes: { largura?: number; png?: boolean } = {}): Promise<ImagemPdf | null> {
  if (!key) return null;
  try {
    const arq = await lerArquivo(key);
    if (!arq) return null;
    const bruto = Buffer.isBuffer(arq.body) ? arq.body : Buffer.from(await new Response(arq.body).arrayBuffer());
    const { default: sharp } = await import("sharp");
    const lado = opcoes.largura ?? 900;
    const img = sharp(bruto).rotate().resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true });
    if (opcoes.png) return { data: await img.png({ compressionLevel: 9 }).toBuffer(), format: "png" };
    return { data: await img.flatten({ background: "#ffffff" }).jpeg({ quality: 70, mozjpeg: true }).toBuffer(), format: "jpg" };
  } catch (e) {
    console.error("PDF: falha ao preparar imagem", key, e);
    return null;
  }
}
