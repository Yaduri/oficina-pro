import "server-only";
import path from "node:path";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/*
 * Banco de dados:
 * - Com DATABASE_URL definida (Supabase em produção): Postgres via postgres-js.
 * - Sem DATABASE_URL (desenvolvimento): PGlite, um Postgres embutido salvo em .data/pglite.
 *   As migrações da pasta drizzle/ são aplicadas automaticamente na primeira conexão.
 *
 * Isolamento por oficina (Row Level Security, migração 0008_rls):
 * - getDb(): conexão do usuário logado. Cada consulta roda numa transação curta com o papel
 *   app_usuario e app.usuario = id do Clerk; as policies só deixam ver a oficina dele.
 *   Sem usuário logado, não enxerga nada.
 * - getDbSistema(): conexão do dono das tabelas, sem RLS. Só para o que não tem usuário logado
 *   ou ainda não tem oficina: páginas públicas por token, webhooks, cadastro inicial, convites.
 *   Nesses casos o código filtra a oficina na mão.
 */

export type DB = PostgresJsDatabase<typeof schema>;

type Base = { db: DB; doUsuario: (usuario: string, oficina: string) => DB };

const PREPARAR = "select set_config('app.usuario', $1, true), set_config('app.oficina', $2, true), set_config('role', 'app_usuario', true)";

const globalForDb = globalThis as unknown as { __db?: Promise<Base> };

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cliente postgres-js que roda cada consulta como o usuário (transação curta com o papel app_usuario).
 * Otimização (Fase 6.4): enfileira set_config e a query juntos em pipelining dentro da mesma
 * transação, reduzindo as voltas seriais ao banco de ~4 para 1–2 round-trips por consulta.
 */
function postgresDoUsuario(sql: any, usuario: string, oficina: string) {
  const preparar = (t: any) => t.unsafe(PREPARAR, [usuario, oficina]);
  return {
    options: sql.options,
    unsafe(query: string, params?: unknown[], opts?: unknown) {
      const run = (valores: boolean) =>
        sql.begin(async (t: any) => {
          const p = preparar(t);
          const q = t.unsafe(query, params, opts);
          const [, res] = await Promise.all([p, valores ? q.values() : q]);
          return res;
        });
      return { values: () => run(true), then: (ok: any, erro: any) => run(false).then(ok, erro) };
    },
    begin(fn: (t: any) => unknown) {
      return sql.begin(async (t: any) => {
        await preparar(t);
        return fn(t);
      });
    },
  };
}

/** O mesmo para o PGlite (desenvolvimento). */
function pgliteDoUsuario(pg: any, usuario: string, oficina: string) {
  return {
    query(query: string, params?: unknown[], opts?: unknown) {
      return pg.transaction(async (tx: any) => {
        await tx.query(PREPARAR, [usuario, oficina]);
        return tx.query(query, params, opts);
      });
    },
    transaction(fn: (tx: any) => unknown) {
      return pg.transaction(async (tx: any) => {
        await tx.query(PREPARAR, [usuario, oficina]);
        return fn(tx);
      });
    },
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Guarda as conexões por usuário + oficina (criar o drizzle processa o schema todo) */
function comCache(criar: (usuario: string, oficina: string) => DB) {
  const cache = new Map<string, DB>();
  return (usuario: string, oficina: string) => {
    const chave = `${usuario}:${oficina}`;
    let db = cache.get(chave);
    if (!db) {
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      db = criar(usuario, oficina);
      cache.set(chave, db);
    }
    return db;
  };
}

/** Em desenvolvimento: falha alto se alguma tabela ficou sem RLS ou sem policy */
async function conferirRls(db: DB) {
  const { sql } = await import("drizzle-orm");
  const r = await db.execute<{ tabela: string }>(sql`
    select c.relname as tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (not c.relrowsecurity or not exists (select 1 from pg_policy p where p.polrelid = c.oid))`);
  const rows = (Array.isArray(r) ? r : (r as unknown as { rows: { tabela: string }[] }).rows) as { tabela: string }[];
  if (rows.length) {
    throw new Error(
      `Tabelas sem Row Level Security ou sem policy: ${rows.map((x) => x.tabela).join(", ")}. ` +
        "Crie a policy na migração (veja drizzle/0008_rls.sql).",
    );
  }
}

async function connect(): Promise<Base> {
  const url = process.env.DATABASE_URL;
  if (url) return conectarPostgres(url, false);

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { mkdir } = await import("node:fs/promises");
  const dataDir = path.join(process.cwd(), ".data");
  // O PGlite não cria a pasta-mãe sozinho
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(path.join(dataDir, "pglite"));
  const db = drizzle({ client, schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await conferirRls(db);
  return {
    db,
    doUsuario: comCache((u, o) => drizzle({ client: pgliteDoUsuario(client, u, o) as never, schema }) as unknown as DB),
  };
}

/** Postgres (Supabase direto/pooler, ou Hyperdrive no Cloudflare). */
async function conectarPostgres(url: string, workers: boolean): Promise<Base> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  // prepare: false é exigido pelo pooler (transaction mode) do Supabase.
  // fetch_types: false economiza uma ida ao banco (o schema não usa arrays de tipos próprios).
  //
  // No Workers o cliente é de uma requisição só e o pool de verdade é o Hyperdrive, então o pool
  // daqui é mínimo (o portal travava com max 5: 6 consultas em paralelo abriam 5 sockets e a 6ª
  // ia em pipeline numa conexão já ocupada):
  // - max: 2. O Workers limita 6 conexões abertas por requisição (somando fetch para Clerk, R2,
  //   Asaas...) e o postgres-js mantém as dele abertas até o fim da requisição; 2 deixa folga.
  //   Não usamos 1 por dois motivos: getDb() roda cada consulta numa transação (sql.begin), que
  //   segura a conexão até o COMMIT, então com 1 as consultas em paralelo de uma tela viram uma
  //   fila; e se algum dia um db.transaction() chamar o `db` de fora (e não o `tx`), com 1 conexão
  //   isso trava para sempre. Hoje nenhum callback de transação faz isso (conferido em 23/11/2026).
  // - max_pipeline: 1. Consulta fora de transação nunca vai em pipeline numa conexão ocupada: espera
  //   a vez. Poolers em transaction mode (Hyperdrive, Supavisor) podem travar com pipeline.
  //   Dentro de sql.begin o pipeline continua (set_config + consulta de postgresDoUsuario).
  // - query_timeout: 20s (espera + execução). Se o banco ou o pooler parar de responder, a página
  //   dá erro em vez de ficar pendurada até o Cloudflare cortar.
  const client = postgres(
    url,
    workers ? { prepare: false, fetch_types: false, max: 2, max_pipeline: 1, query_timeout: 20 } : { prepare: false },
  );
  const db = drizzle({ client, schema });
  return { db, doUsuario: comCache((u, o) => drizzle({ client: postgresDoUsuario(client, u, o) as never, schema })) };
}

/** Rodando no Cloudflare Workers (deploy via OpenNext)? */
const emWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * No Workers uma conexão aberta numa requisição não pode ser usada por outra
 * ("Cannot perform I/O on behalf of a different request"). Então o cliente é criado por requisição,
 * guardado pelo ExecutionContext dela. O pool de verdade fica no Hyperdrive (binding HYPERDRIVE);
 * sem ele, usa DATABASE_URL.
 */
const porRequisicao = new WeakMap<object, Promise<Base>>();

async function baseDaRequisicao(): Promise<Base> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env, ctx } = getCloudflareContext();
  const chave = ctx as object;
  let b = porRequisicao.get(chave);
  if (!b) {
    const url = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Banco não configurado: defina o binding HYPERDRIVE ou DATABASE_URL.");
    b = conectarPostgres(url, true);
    porRequisicao.set(chave, b);
    b.catch(() => porRequisicao.delete(chave));
  }
  return b;
}

function base(): Promise<Base> {
  if (emWorkers()) return baseDaRequisicao();
  if (!globalForDb.__db) {
    globalForDb.__db = connect().catch((err) => {
      globalForDb.__db = undefined;
      throw err;
    });
  }
  return globalForDb.__db;
}

/**
 * Conexão do usuário logado (com RLS). Sem login, as consultas não enxergam nenhuma linha.
 * Por padrão restringe o RLS à oficina ativa da requisição (fail-closed).
 * `todasOficinas: true` é uso exclusivo de `oficinaDaRequisicao()` para listar os vínculos ativos.
 */
export async function getDb(opcoes?: { todasOficinas?: boolean }): Promise<DB> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  const b = await base();
  if (!userId) return b.doUsuario("", "");
  if (opcoes?.todasOficinas) return b.doUsuario(userId, "");
  const { oficinaDaRequisicao } = await import("@/lib/oficina-ativa");
  const { ativo } = await oficinaDaRequisicao();
  return b.doUsuario(userId, ativo?.oficina.id ?? "");
}

/** Conexão do sistema, sem RLS. Use só onde não há usuário logado com oficina (ver topo). */
export async function getDbSistema(): Promise<DB> {
  return (await base()).db;
}

export { schema };
