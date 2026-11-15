import "server-only";
import path from "node:path";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/*
 * Banco de dados:
 * - Com DATABASE_URL definida (Supabase em produção): Postgres via postgres-js.
 * - Sem DATABASE_URL (desenvolvimento): PGlite, um Postgres embutido salvo em .data/pglite.
 *   As migrações da pasta drizzle/ são aplicadas automaticamente na primeira conexão.
 */

export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Promise<DB> };

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // prepare: false é exigido pelo pooler (transaction mode) do Supabase
    return drizzle(postgres(url, { prepare: false }), { schema });
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { mkdir } = await import("node:fs/promises");
  const dataDir = path.join(process.cwd(), ".data");
  // O PGlite não cria a pasta-mãe sozinho
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(path.join(dataDir, "pglite"));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!globalForDb.__db) {
    globalForDb.__db = connect().catch((err) => {
      globalForDb.__db = undefined;
      throw err;
    });
  }
  return globalForDb.__db;
}

export { schema };
