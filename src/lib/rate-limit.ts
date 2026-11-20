import "server-only";
import { headers } from "next/headers";
import { lt, sql } from "drizzle-orm";
import { getDbSistema, schema, type DB } from "@/db";

/*
 * Limite de tentativas distribuído (Fase 6.2) persistido em Postgres (tabela `rate_limits`).
 * Funciona tanto em Cloudflare Workers (múltiplos isolados) quanto em Node.js / PGlite.
 * Janela fixa atômica em 1 única query (INSERT ... ON CONFLICT DO UPDATE).
 */

export type ResultadoRateLimit = {
  permitido: boolean;
  restantes: number;
  tentativas: number;
  /** Segundos até a janela reiniciar (para cabeçalho Retry-After) */
  retryAfterSeg: number;
};

let ultimaLimpeza = 0;

/** Extrai o IP do cliente considerando Cloudflare (cf-connecting-ip) e proxies padrão */
export function ipDaRequisicao(h: { get(name: string): string | null }): string {
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 64);
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff.slice(0, 64);
  const real = h.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "desconhecido";
}

/** IP da requisição atual em Server Components / Server Actions */
export async function ipAtual(): Promise<string> {
  try {
    return ipDaRequisicao(await headers());
  } catch {
    return "desconhecido";
  }
}

/**
 * Consome 1 tentativa na chave fornecida dentro da janela especificada.
 * Ex.: `verificarLimite({ chave: "upload:user_123", limite: 40, janelaSeg: 600 })`
 */
export async function verificarLimite(p: {
  chave: string;
  limite: number;
  janelaSeg: number;
  db?: DB;
}): Promise<ResultadoRateLimit> {
  const db = p.db ?? (await getDbSistema());
  const agora = Date.now();
  const expira = new Date(agora + p.janelaSeg * 1000);
  const chave = p.chave.slice(0, 160);

  const [row] = await db
    .insert(schema.rateLimits)
    .values({ chave, contagem: 1, expiraEm: expira })
    .onConflictDoUpdate({
      target: schema.rateLimits.chave,
      set: {
        contagem: sql`CASE WHEN ${schema.rateLimits.expiraEm} <= now() THEN 1 ELSE ${schema.rateLimits.contagem} + 1 END`,
        expiraEm: sql`CASE WHEN ${schema.rateLimits.expiraEm} <= now() THEN ${expira.toISOString()}::timestamptz ELSE ${schema.rateLimits.expiraEm} END`,
      },
    })
    .returning({ contagem: schema.rateLimits.contagem, expiraEm: schema.rateLimits.expiraEm });

  // Limpeza oportunista de entradas expiradas (no máximo 1x a cada 5 minutos)
  if (agora - ultimaLimpeza > 300_000) {
    ultimaLimpeza = agora;
    void db.delete(schema.rateLimits).where(lt(schema.rateLimits.expiraEm, new Date(agora))).catch(() => undefined);
  }

  const retryAfterSeg = Math.max(1, Math.ceil((row.expiraEm.getTime() - agora) / 1000));
  const permitido = row.contagem <= p.limite;
  return {
    permitido,
    tentativas: row.contagem,
    restantes: Math.max(0, p.limite - row.contagem),
    retryAfterSeg,
  };
}

/** Resposta HTTP 429 padronizada para Route Handlers */
export function respostaMuitasTentativas(r: ResultadoRateLimit) {
  return Response.json(
    { erro: `Muitas tentativas. Aguarde ${r.retryAfterSeg} segundos e tente novamente.` },
    { status: 429, headers: { "retry-after": String(r.retryAfterSeg) } },
  );
}
