// Teste automático de restauração de backup (Fase 6.3).
// Uso: node scripts/testar-restauracao.mjs [caminho-do-backup] [ambiente]
//
// 1. Lê o backup mais recente em .data/backups/<ambiente>/ (ou o caminho informado)
// 2. Decifra (se .enc), descompacta GZip e valida integridade SHA-256
// 3. Cria um Postgres PGlite limpo em pasta temporária e aplica todas as migrações Drizzle
// 4. Restaura TODAS as tabelas respeitando chaves estrangeiras e valida contagem exata + RLS

import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const arg1 = process.argv[2];
const ambiente = process.argv[3] ?? (arg1 && !existsSync(arg1) ? arg1 : "prod");

function carregarChave() {
  if (process.env.CHAVE_CRIPTOGRAFIA) return process.env.CHAVE_CRIPTOGRAFIA.trim();
  const arqSecrets = `.env.secrets.${ambiente}.json`;
  if (existsSync(arqSecrets)) {
    const json = JSON.parse(readFileSync(arqSecrets, "utf8"));
    if (json.CHAVE_CRIPTOGRAFIA) return String(json.CHAVE_CRIPTOGRAFIA).trim();
  }
  return null;
}

function decifrarBuffer(buf, chaveBase64) {
  const magic = buf.subarray(0, 6).toString("ascii");
  if (magic !== "OFBK01") throw new Error("Formato de backup cifrado inválido");
  if (!chaveBase64) throw new Error("CHAVE_CRIPTOGRAFIA necessária para decifrar o backup");
  const k = Buffer.from(chaveBase64, "base64");
  const iv = buf.subarray(6, 18);
  const tag = buf.subarray(18, 34);
  const dados = buf.subarray(34);
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(dados), decipher.final()]);
}

function localizarBackup() {
  if (arg1 && existsSync(arg1)) return path.resolve(arg1);
  const pasta = path.resolve(".data", "backups", ambiente);
  if (!existsSync(pasta)) {
    throw new Error(`Nenhum backup encontrado em ${pasta}. Rode "node scripts/backup.mjs ${ambiente}" primeiro.`);
  }
  const arquivos = readdirSync(pasta)
    .filter((f) => f.startsWith("backup-") && (f.endsWith(".json.gz") || f.endsWith(".json.gz.enc")))
    .sort()
    .reverse();
  if (arquivos.length === 0) throw new Error(`Nenhum arquivo backup-*.json.gz* em ${pasta}.`);
  return path.join(pasta, arquivos[0]);
}

async function main() {
  const arquivo = localizarBackup();
  console.log(`[test-restore] Testando restauração de: ${arquivo}`);

  let raw = readFileSync(arquivo);
  if (arquivo.endsWith(".enc")) {
    raw = decifrarBuffer(raw, carregarChave());
  }
  const envelope = JSON.parse(gunzipSync(raw).toString("utf8"));
  const { sha256, ...snapshot } = envelope;
  const calculado = createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex");
  if (sha256 !== calculado) {
    throw new Error(`Checksum SHA-256 divergente! Esperado ${sha256}, calculado ${calculado}`);
  }
  console.log(`[test-restore] Checksum SHA-256 íntegro (${sha256.slice(0, 12)}…).`);

  const tmp = mkdtempSync(path.join(os.tmpdir(), "oficina-restore-test-"));
  const pg = new PGlite(path.join(tmp, "pg"));
  try {
    const db = drizzle({ client: pg });
    await migrate(db, { migrationsFolder: path.resolve("drizzle") });

    // Desabilita triggers/FKs temporariamente durante a restauração lógica e revalida depois
    const nomes = Object.keys(snapshot.tabelas);
    let totalRestaurado = 0;

    // Descobre ordem de inserção: tabelas sem FKs pendentes primeiro (ordenação topológica)
    const fksRes = await pg.query(`
      SELECT tc.table_name AS filho, ccu.table_name AS pai
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `);
    const deps = new Map(nomes.map((n) => [n, new Set()]));
    for (const r of fksRes.rows) {
      if (r.filho !== r.pai && deps.has(r.filho) && deps.has(r.pai)) {
        deps.get(r.filho).add(r.pai);
      }
    }
    const ordenadas = [];
    const visitadas = new Set();
    while (ordenadas.length < nomes.length) {
      let avancou = false;
      for (const n of nomes) {
        if (visitadas.has(n)) continue;
        const ok = [...deps.get(n)].every((p) => visitadas.has(p));
        if (ok) {
          visitadas.add(n);
          ordenadas.push(n);
          avancou = true;
        }
      }
      if (!avancou) {
        for (const n of nomes) if (!visitadas.has(n)) { visitadas.add(n); ordenadas.push(n); }
      }
    }

    for (const tabela of ordenadas) {
      const linhas = snapshot.tabelas[tabela] ?? [];
      for (const linha of linhas) {
        const cols = Object.keys(linha);
        const vals = cols.map((c) => {
          const v = linha[c];
          if (v !== null && typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
          return v;
        });
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const colSql = cols.map((c) => `"${c}"`).join(", ");
        await pg.query(`INSERT INTO public."${tabela}" (${colSql}) VALUES (${placeholders})`, vals);
        totalRestaurado++;
      }
    }

    // Valida contagens exatas + RLS ativo em 100% das tabelas
    for (const tabela of ordenadas) {
      const r = await pg.query(`SELECT count(*)::int AS qtd FROM public."${tabela}"`);
      const esperado = snapshot.contagens[tabela] ?? 0;
      if (r.rows[0].qtd !== esperado) {
        throw new Error(`Divergência na tabela ${tabela}: esperado ${esperado}, restaurado ${r.rows[0].qtd}`);
      }
    }
    const semRls = await pg.query(`
      SELECT c.relname AS tabela FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND (NOT c.relrowsecurity OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
    `);
    if (semRls.rows.length > 0) {
      throw new Error(`Tabelas sem RLS após restauração: ${semRls.rows.map((x) => x.tabela).join(", ")}`);
    }

    console.log(`[test-restore] SUCESSO! ${ordenadas.length} tabelas (${totalRestaurado} registros) restauradas e conferidas com RLS ativo.`);
  } finally {
    await pg.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[test-restore] FALHA:", err);
  process.exit(1);
});
