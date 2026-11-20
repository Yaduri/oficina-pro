import "server-only";
import path from "node:path";

/*
 * Armazenamento de arquivos (fotos do check-in, assinaturas).
 * - Com R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET: Cloudflare R2 (API S3).
 * - Sem essas variáveis (desenvolvimento): disco local em .data/arquivos.
 *
 * As chaves sempre começam com o id da oficina ("<oficinaId>/checkins/..."), e o acesso
 * passa pela rota /arquivos/..., que confere a oficina do usuário antes de entregar o arquivo.
 */

type Arquivo = { body: ReadableStream | Buffer; contentType: string; tamanho?: number };

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  };
}

async function clienteR2() {
  const cfg = r2();
  if (!cfg) return null;
  const { AwsClient } = await import("aws4fetch");
  return { cfg, aws: new AwsClient({ ...cfg, service: "s3", region: "auto" }) };
}

const pastaLocal = () => path.join(process.cwd(), ".data", "arquivos");

function caminhoLocal(key: string) {
  const destino = path.resolve(pastaLocal(), key);
  if (!destino.startsWith(path.resolve(pastaLocal()) + path.sep)) throw new Error("Chave inválida");
  return destino;
}

/** Só letras, números, -, _, . e / (sem "..") */
export function chaveValida(key: string) {
  return /^[\w\-./]+$/.test(key) && !key.includes("..") && !key.startsWith("/");
}

export async function salvarArquivo(key: string, dados: ArrayBuffer, contentType: string) {
  if (!chaveValida(key)) throw new Error("Chave inválida");
  const r = await clienteR2();
  if (r) {
    const res = await r.aws.fetch(`${r.cfg.endpoint}/${key}`, {
      method: "PUT",
      body: dados,
      headers: { "content-type": contentType },
    });
    if (!res.ok) throw new Error(`Falha ao enviar para o R2 (${res.status})`);
    return;
  }
  const { mkdir, writeFile } = await import("node:fs/promises");
  const destino = caminhoLocal(key);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, Buffer.from(dados));
  await writeFile(`${destino}.type`, contentType);
}

export async function lerArquivo(key: string): Promise<Arquivo | null> {
  if (!chaveValida(key)) return null;
  const r = await clienteR2();
  if (r) {
    const res = await r.aws.fetch(`${r.cfg.endpoint}/${key}`);
    if (res.status === 404) return null;
    if (!res.ok || !res.body) throw new Error(`Falha ao ler do R2 (${res.status})`);
    return {
      body: res.body,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      tamanho: Number(res.headers.get("content-length")) || undefined,
    };
  }
  const { readFile } = await import("node:fs/promises");
  try {
    const destino = caminhoLocal(key);
    const [body, tipo] = await Promise.all([readFile(destino), readFile(`${destino}.type`, "utf8").catch(() => "")]);
    return { body, contentType: tipo || "application/octet-stream", tamanho: body.length };
  } catch {
    return null;
  }
}

/** URL interna (autenticada) para exibir o arquivo */
export function urlArquivo(key: string) {
  return `/arquivos/${key}`;
}

export type ObjetoArmazenado = { key: string; modificadoEm: Date; tamanho: number };

/** Lista objetos no R2 (S3 ListObjectsV2) ou no disco local, para manutenção/limpeza de órfãos */
export async function listarArquivos(prefixo = ""): Promise<ObjetoArmazenado[]> {
  const r = await clienteR2();
  if (r) {
    const { XMLParser } = await import("fast-xml-parser");
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
    const resultado: ObjetoArmazenado[] = [];
    let token: string | undefined;

    do {
      const qs = new URLSearchParams({ "list-type": "2", "max-keys": "1000" });
      if (prefixo) qs.set("prefix", prefixo);
      if (token) qs.set("continuation-token", token);
      const res = await r.aws.fetch(`${r.cfg.endpoint}?${qs.toString()}`);
      if (!res.ok) throw new Error(`Falha ao listar R2 (${res.status})`);
      const xml = await res.text();
      const parsed = parser.parse(xml) as {
        ListBucketResult?: {
          IsTruncated?: string;
          NextContinuationToken?: string;
          Contents?: { Key: string; LastModified: string; Size: string } | { Key: string; LastModified: string; Size: string }[];
        };
      };
      const br = parsed.ListBucketResult;
      const itens = br?.Contents ? (Array.isArray(br.Contents) ? br.Contents : [br.Contents]) : [];
      for (const item of itens) {
        if (!item.Key) continue;
        resultado.push({
          key: item.Key,
          modificadoEm: new Date(item.LastModified),
          tamanho: Number(item.Size) || 0,
        });
      }
      token = br?.IsTruncated === "true" ? br.NextContinuationToken : undefined;
    } while (token);

    return resultado;
  }

  // Disco local (.data/arquivos)
  const { readdir, stat } = await import("node:fs/promises");
  const raiz = path.resolve(pastaLocal());
  const resultado: ObjetoArmazenado[] = [];
  async function caminhar(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) {
        await caminhar(completo);
      } else if (e.isFile() && !e.name.endsWith(".type")) {
        const rel = path.relative(raiz, completo).split(path.sep).join("/");
        if (prefixo && !rel.startsWith(prefixo)) continue;
        const st = await stat(completo);
        resultado.push({ key: rel, modificadoEm: st.mtime, tamanho: st.size });
      }
    }
  }
  await caminhar(raiz);
  return resultado;
}

/** Remove um arquivo do R2 ou do disco local */
export async function removerArquivo(key: string): Promise<void> {
  if (!chaveValida(key)) throw new Error("Chave inválida");
  const r = await clienteR2();
  if (r) {
    const res = await r.aws.fetch(`${r.cfg.endpoint}/${key}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Falha ao remover do R2 (${res.status})`);
    return;
  }
  const { rm } = await import("node:fs/promises");
  const destino = caminhoLocal(key);
  await rm(destino, { force: true });
  await rm(`${destino}.type`, { force: true });
}
