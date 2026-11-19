// Aplica as migrações (pasta drizzle/) no banco de um ambiente: `node scripts/migrar.mjs homolog|prod`.
// A string de conexão fica em .env.migracao.<ambiente> (ignorado pelo git), linha DATABASE_URL=...
// Use a conexão "Session pooler" (porta 5432) do Supabase; veja docs/deploy.md.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const ambiente = process.argv[2];
const arquivo = `.env.migracao.${ambiente}`;
if (!["homolog", "prod"].includes(ambiente) || !existsSync(arquivo)) {
  console.error(`Uso: node scripts/migrar.mjs homolog|prod (precisa do arquivo ${arquivo} com DATABASE_URL=...)`);
  process.exit(1);
}
const { DATABASE_URL } = parse(readFileSync(arquivo));
if (!DATABASE_URL) {
  console.error(`${arquivo} sem DATABASE_URL`);
  process.exit(1);
}
console.log(`Migrando ${ambiente} (${new URL(DATABASE_URL).host})...`);
const r = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], { stdio: "inherit", env: { ...process.env, DATABASE_URL }, shell: true });
process.exit(r.status ?? 1);
