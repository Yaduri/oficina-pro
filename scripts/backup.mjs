// Backup diário do banco Postgres (Supabase) para Cloudflare R2 (ou disco local).
// Uso:
//   node scripts/backup.mjs homolog|prod [--local]
//
// Lê DATABASE_URL de .env.migracao.<ambiente> (ou variável de ambiente DATABASE_URL)
// e credenciais R2 de .env.secrets.<ambiente>.json (ou variáveis R2_* / CHAVE_CRIPTOGRAFIA).
// Não depende de pg_dump instalado: exporta todas as tabelas de `public` numa transação
// REPEATABLE READ, compacta com GZip, assina com SHA-256 e cifra com AES-256-GCM.

import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { AwsClient } from "aws4fetch";
import { parse as parseEnv } from "dotenv";
import postgres from "postgres";

const ambiente = process.argv[2] ?? "local";
const soLocal = process.argv.includes("--local");

function carregarEnv() {
  const env = { ...process.env };
  const arqMigracao = `.env.migracao.${ambiente}`;
  if (existsSync(arqMigracao)) {
    Object.assign(env, parseEnv(readFileSync(arqMigracao)));
  }
  const arqSecrets = `.env.secrets.${ambiente}.json`;
  if (existsSync(arqSecrets)) {
    const json = JSON.parse(readFileSync(arqSecrets, "utf8"));
    for (const [k, v] of Object.entries(json)) {
      if (!env[k] && typeof v === "string") env[k] = v;
    }
  }
  return env;
}

function cifrarBuffer(buf, chaveBase64) {
  const k = Buffer.from(chaveBase64, "base64");
  if (k.length !== 32) throw new Error("CHAVE_CRIPTOGRAFIA deve ter 32 bytes em base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Cabeçalho mágico "OFBK01" (6 bytes) + iv (12) + tag (16) + dados
  return Buffer.concat([Buffer.from("OFBK01", "ascii"), iv, tag, enc]);
}

async function enviarR2(env, key, dados) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return false;
  }
  const aws = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;
  const res = await aws.fetch(`${endpoint}/${key}`, {
    method: "PUT",
    body: dados,
    headers: { "content-type": "application/octet-stream" },
  });
  if (!res.ok) throw new Error(`Falha ao enviar backup para o R2 (${res.status}): ${await res.text()}`);
  return true;
}

async function main() {
  const env = carregarEnv();
  const url = env.DATABASE_URL;
  if (!url) {
    console.error(`DATABASE_URL não definida (nem encontrada em .env.migracao.${ambiente}).`);
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const agora = new Date();
    const dia = agora.toISOString().slice(0, 10);
    console.log(`[backup] Iniciando backup consistente (${ambiente}) em ${agora.toISOString()}...`);

    const snapshot = await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
      const tabelas = await tx`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'rate_limits'
        ORDER BY tablename
      `;
      const dados = {};
      const contagens = {};
      for (const { tablename } of tabelas) {
        const rows = await tx.unsafe(`SELECT * FROM public."${tablename}"`);
        dados[tablename] = rows;
        contagens[tablename] = rows.length;
      }
      return {
        versao: 1,
        ambiente,
        criadoEm: agora.toISOString(),
        contagens,
        tabelas: dados,
      };
    });

    const jsonStr = JSON.stringify(snapshot);
    const sha256 = createHash("sha256").update(jsonStr, "utf8").digest("hex");
    const envelope = JSON.stringify({ sha256, ...snapshot });
    const gz = gzipSync(Buffer.from(envelope, "utf8"), { level: 9 });

    const cifrado = !!(env.CHAVE_CRIPTOGRAFIA && env.CHAVE_CRIPTOGRAFIA.trim());
    const payload = cifrado ? cifrarBuffer(gz, env.CHAVE_CRIPTOGRAFIA.trim()) : gz;
    const ext = cifrado ? "json.gz.enc" : "json.gz";
    const nome = `backup-${dia}.${ext}`;
    const r2Key = `backups/${ambiente}/${nome}`;

    // Sempre grava cópia local temporária para permitir teste imediato de restauração
    const pasta = path.resolve(".data", "backups", ambiente);
    mkdirSync(pasta, { recursive: true });
    const caminhoLocal = path.join(pasta, nome);
    writeFileSync(caminhoLocal, payload);

    const totalLinhas = Object.values(snapshot.contagens).reduce((s, n) => s + n, 0);
    console.log(`[backup] ${Object.keys(snapshot.contagens).length} tabelas, ${totalLinhas} linhas, ${(payload.length / 1024).toFixed(1)} KB (${cifrado ? "cifrado AES-256-GCM" : "sem cifra"}).`);
    console.log(`[backup] SHA-256: ${sha256}`);
    console.log(`[backup] Salvo em: ${caminhoLocal}`);

    if (!soLocal) {
      const enviou = await enviarR2(env, r2Key, payload);
      if (enviou) {
        console.log(`[backup] Enviado ao Cloudflare R2: ${r2Key}`);
      } else {
        console.log("[backup] Credenciais R2 não configuradas; mantido apenas localmente.");
      }
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[backup] ERRO:", err);
  process.exit(1);
});
