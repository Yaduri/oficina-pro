import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import type { Acao } from "@/lib/permissoes";

type Contexto = Awaited<ReturnType<typeof getContexto>>;

export const ehUuid = (v: string) => z.uuid().safeParse(v).success;

/** OS da oficina e de uma empresa que o usuário vê, conferindo a permissão pedida */
export async function osDaOficina(osId: string, acao?: Acao) {
  if (!ehUuid(osId)) return null;
  const ctx = await getContexto();
  if (acao && !ctx.pode(acao)) return null;
  const db = await getDb();
  const [os] = await db
    .select()
    .from(schema.ordensServico)
    .where(
      and(
        eq(schema.ordensServico.id, osId),
        eq(schema.ordensServico.oficinaId, ctx.oficina.id),
        inArray(schema.ordensServico.empresaId, ctx.empresas.map((e) => e.id)),
      ),
    );
  return os ? { db, ctx, os } : null;
}

export function nomeDoUsuario(ctx: Contexto) {
  return ctx.membro.nome || ctx.membro.email || "Usuário";
}

/** Registra uma linha no histórico da OS (ctx nulo = feito pelo cliente no link) */
export async function registrarEvento(db: DB, oficinaId: string, osId: string, descricao: string, ctx: Contexto | null) {
  await db.insert(schema.osEventos).values({
    oficinaId,
    osId,
    descricao,
    usuarioId: ctx?.userId ?? null,
    usuarioNome: ctx ? nomeDoUsuario(ctx) : "Cliente",
  });
}
