import "server-only";
import type { CertificadoDescriptografado } from "./tipos";

/*
 * Transporte HTTPS com mTLS (autenticação mútua por certificado A1) para a SEFIN Nacional.
 *
 * Estratégia em 3 camadas para funcionar tanto em desenvolvimento/Node quanto em Cloudflare Workers:
 * 1. Proxy mTLS (NFSE_MTLS_PROXY_URL + NFSE_MTLS_PROXY_SECRET): envia a requisição + cert/key
 *    sobre canal autenticado para um micro-proxy Node/VPS que executa o mTLS dinâmico por oficina.
 * 2. Binding mTLS nativo do Cloudflare Workers (env.MTLS_NFSE): quando rodando no Workers sem proxy,
 *    usa o binding configurado via `wrangler mtls-certificate upload` + `wrangler.jsonc`.
 * 3. Node.js nativo (`node:https`): usado em `next dev`, `next start` e servidores Node tradicionais,
 *    com certificado dinâmico por oficina direto na conexão TLS 1.2+.
 */

export type RespostaMtls = {
  status: number;
  contentType: string;
  bodyBuffer: Buffer;
  bodyText: string;
};

export type RequisicaoMtls = {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  certificado: CertificadoDescriptografado;
  timeoutMs?: number;
};

const emWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

async function viaProxy(req: RequisicaoMtls, proxyUrl: string): Promise<RespostaMtls> {
  const segredo = process.env.NFSE_MTLS_PROXY_SECRET ?? "";
  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(segredo ? { "x-proxy-secret": segredo } : {}),
    },
    body: JSON.stringify({
      url: req.url,
      method: req.method,
      headers: req.headers ?? {},
      body: req.body ?? null,
      certPem: req.certificado.certPem,
      keyPem: req.certificado.keyPem,
    }),
    signal: AbortSignal.timeout(req.timeoutMs ?? 25_000),
  });

  if (!res.ok && res.headers.get("x-mtls-proxy-error")) {
    throw new Error(`Proxy mTLS recusou a chamada (${res.status}): ${await res.text()}`);
  }

  const upstreamStatus = Number(res.headers.get("x-upstream-status")) || res.status;
  const contentType = res.headers.get("x-upstream-content-type") || res.headers.get("content-type") || "application/json";
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: upstreamStatus, contentType, bodyBuffer: buf, bodyText: buf.toString("utf8") };
}

async function viaCloudflareBinding(req: RequisicaoMtls): Promise<RespostaMtls> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = getCloudflareContext();
  const binding = (env as { MTLS_NFSE?: { fetch: typeof fetch } }).MTLS_NFSE;
  if (!binding) {
    throw new Error(
      "Conexão mTLS com a NFS-e Nacional não configurada no Cloudflare Workers. " +
        "Configure um binding MTLS_NFSE no wrangler.jsonc (via wrangler mtls-certificate upload) " +
        "ou defina NFSE_MTLS_PROXY_URL para certificados dinâmicos.",
    );
  }
  const res = await binding.fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    signal: AbortSignal.timeout(req.timeoutMs ?? 25_000),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "application/json",
    bodyBuffer: buf,
    bodyText: buf.toString("utf8"),
  };
}

async function viaNodeHttps(req: RequisicaoMtls): Promise<RespostaMtls> {
  const https = await import("node:https");
  const parsed = new URL(req.url);

  return new Promise<RespostaMtls>((resolve, reject) => {
    const bodyBuf = req.body ? Buffer.from(req.body, "utf8") : null;
    const headers: Record<string, string> = {
      ...(req.headers ?? {}),
      ...(bodyBuf ? { "content-length": String(bodyBuf.byteLength) } : {}),
    };

    const request = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: req.method,
        headers,
        cert: req.certificado.certPem,
        key: req.certificado.keyPem,
        minVersion: "TLSv1.2",
        timeout: req.timeoutMs ?? 25_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            contentType: String(res.headers["content-type"] ?? "application/json"),
            bodyBuffer: buf,
            bodyText: buf.toString("utf8"),
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Tempo esgotado ao aguardar resposta da SEFIN Nacional."));
    });
    request.on("error", reject);
    if (bodyBuf) request.write(bodyBuf);
    request.end();
  });
}

export async function requisicaoMtls(req: RequisicaoMtls): Promise<RespostaMtls> {
  const proxyUrl = process.env.NFSE_MTLS_PROXY_URL?.trim();
  if (proxyUrl) return viaProxy(req, proxyUrl);
  if (emWorkers()) return viaCloudflareBinding(req);
  return viaNodeHttps(req);
}
