import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, getDbSistema, schema, type DB } from "@/db";
import type { TipoLinkPublico } from "@/db/schema";
import { novoToken } from "@/lib/orcamento";

/*
 * Links públicos (tabela links_documento): PDF da OS, termo de entrada, DANFSe, portal do cliente
 * e acompanhamento da OS. Um link por documento, reaproveitado; o token é o segredo.
 * Sem dependência do gerador de PDF, para poder ser usado em qualquer lugar (e nos testes).
 */

/** Token do link público do documento (cria na primeira vez) */
export async function linkPublico(oficinaId: string, tipo: TipoLinkPublico, refId: string, conexao?: DB) {
  const db = conexao ?? (await getDb());
  const t = schema.linksDocumento;
  const [existente] = await db.select({ token: t.token }).from(t).where(and(eq(t.tipo, tipo), eq(t.refId, refId), eq(t.oficinaId, oficinaId)));
  if (existente) return existente.token;
  const [novo] = await db
    .insert(t)
    .values({ oficinaId, tipo, refId, token: novoToken() })
    .onConflictDoNothing()
    .returning({ token: t.token });
  if (novo) return novo.token;
  const [outro] = await db.select({ token: t.token }).from(t).where(and(eq(t.tipo, tipo), eq(t.refId, refId), eq(t.oficinaId, oficinaId)));
  return outro?.token ?? null;
}

/**
 * Tokens de vários documentos do mesmo tipo de uma vez (cria os que faltam): 1 consulta para os
 * existentes e 1 insert para os novos, em vez de uma ida ao banco por documento.
 * Os ids precisam ser da oficina (quem chama já filtrou).
 */
export async function linksPublicosEmLote(oficinaId: string, tipo: TipoLinkPublico, refIds: string[], conexao?: DB) {
  const res = new Map<string, string>();
  const ids = [...new Set(refIds)];
  if (ids.length === 0) return res;
  const db = conexao ?? (await getDb());
  const t = schema.linksDocumento;
  const buscar = async (lista: string[]) => {
    const rows = await db
      .select({ refId: t.refId, token: t.token })
      .from(t)
      .where(and(eq(t.oficinaId, oficinaId), eq(t.tipo, tipo), inArray(t.refId, lista)));
    for (const r of rows) res.set(r.refId, r.token);
  };
  await buscar(ids);
  const faltam = ids.filter((id) => !res.has(id));
  if (faltam.length === 0) return res;
  const novos = await db
    .insert(t)
    .values(faltam.map((refId) => ({ oficinaId, tipo, refId, token: novoToken() })))
    .onConflictDoNothing()
    .returning({ refId: t.refId, token: t.token });
  for (const r of novos) res.set(r.refId, r.token);
  // Criado ao mesmo tempo por outra requisição
  const aindaFaltam = faltam.filter((id) => !res.has(id));
  if (aindaFaltam.length > 0) await buscar(aindaFaltam);
  return res;
}

/** Link público pelo token (sem login: conexão do sistema, filtrada pelo token) */
export async function documentoPorToken(token: string) {
  const db = await getDbSistema();
  const [l] = await db.select().from(schema.linksDocumento).where(eq(schema.linksDocumento.token, token));
  return l ?? null;
}
