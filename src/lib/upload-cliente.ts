/** Envio de imagens pelo navegador para /api/upload */

/** Reduz a foto no próprio celular (máx. 1600 px, JPEG 80%) antes de enviar */
export async function comprimir(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
    if (blob) return blob;
  } catch {
    // formato que o navegador não decodifica: tenta enviar o original
  }
  return file;
}

/** Envia e devolve a chave do arquivo no armazenamento */
export async function enviarArquivo(blob: Blob, pasta: "checkins" | "logos" | "os"): Promise<string> {
  const form = new FormData();
  form.append("arquivo", blob, "foto");
  form.append("pasta", pasta);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as { key?: string; erro?: string };
  if (!res.ok || !json.key) throw new Error(json.erro ?? "Falha no envio");
  return json.key;
}
