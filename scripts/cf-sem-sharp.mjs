// Substitui o sharp no build do Cloudflare (scripts/cf-build.mjs): binário nativo não roda no Workers.
// src/lib/pdf/imagens.ts usa o binding IMAGES lá e nem chama o sharp.
export default function sharp() {
  throw new Error("sharp não está disponível no Cloudflare Workers.");
}
