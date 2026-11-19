import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cifra segredos guardados no banco (chave de API do gateway, certificado A1 no futuro).
 * AES-256-GCM com a chave CHAVE_CRIPTOGRAFIA (32 bytes em base64) do ambiente.
 * Formato: v1.<iv>.<tag>.<dados>, tudo em base64url.
 */
function chave() {
  const b64 = process.env.CHAVE_CRIPTOGRAFIA;
  if (!b64) throw new Error("CHAVE_CRIPTOGRAFIA não configurada");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("CHAVE_CRIPTOGRAFIA deve ter 32 bytes em base64");
  return k;
}

export function cifrar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(".");
}

export function decifrar(cifrado: string) {
  const [v, iv, tag, dados] = cifrado.split(".");
  if (v !== "v1" || !iv || !tag || !dados) throw new Error("Segredo em formato inválido");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}

/** Token aleatório (para webhooks) */
export const tokenAleatorio = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Comparação de segredos sem vazar tempo */
export function iguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
