import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { membros, membroEmpresas, convites, oficinas } = schema;

/** Membros da oficina com as empresas de cada um (preenche nome/e-mail que faltarem pelo Clerk) */
export async function listarMembros(oficinaId: string) {
  const db = await getDb();
  const lista = await db.select().from(membros).where(eq(membros.oficinaId, oficinaId)).orderBy(desc(membros.ativo), asc(membros.criadoEm));

  const semDados = lista.filter((m) => !m.email);
  if (semDados.length > 0) {
    try {
      const clerk = await clerkClient();
      const { data } = await clerk.users.getUserList({ userId: semDados.map((m) => m.clerkUserId), limit: 100 });
      for (const u of data) {
        const m = semDados.find((x) => x.clerkUserId === u.id);
        if (!m) continue;
        m.nome = u.fullName ?? m.nome;
        m.email = u.primaryEmailAddress?.emailAddress ?? m.email;
        await db.update(membros).set({ nome: m.nome, email: m.email }).where(eq(membros.id, m.id));
      }
    } catch {
      // Sem conexão com o Clerk: mostra o que houver
    }
  }

  const ids = lista.map((m) => m.id);
  const vinculos = ids.length
    ? await db.select().from(membroEmpresas).where(inArray(membroEmpresas.membroId, ids))
    : [];
  return lista.map((m) => ({
    ...m,
    empresaIds: vinculos.filter((v) => v.membroId === m.id).map((v) => v.empresaId),
  }));
}

export async function convitesPendentes(oficinaId: string) {
  const db = await getDb();
  return db
    .select()
    .from(convites)
    .where(
      and(
        eq(convites.oficinaId, oficinaId),
        isNull(convites.aceitoEm),
        isNull(convites.canceladoEm),
        gt(convites.expiraEm, new Date()),
      ),
    )
    .orderBy(desc(convites.criadoEm));
}

export const TOKEN_CONVITE_RE = /^[A-Za-z0-9_-]{32}$/;

/** Convite pelo token, com a oficina e as empresas */
export async function conviteDoToken(token: string) {
  if (!TOKEN_CONVITE_RE.test(token)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ convite: convites, oficina: oficinas })
    .from(convites)
    .innerJoin(oficinas, eq(oficinas.id, convites.oficinaId))
    .where(eq(convites.token, token));
  if (!row) return null;
  const empresas = await db
    .select({ id: schema.empresas.id, nome: schema.empresas.nome, tipo: schema.empresas.tipo })
    .from(schema.empresas)
    .where(eq(schema.empresas.oficinaId, row.oficina.id))
    .orderBy(asc(schema.empresas.criadoEm));
  return { ...row, empresas };
}

export type SituacaoConvite = "valido" | "aceito" | "cancelado" | "expirado";

export function situacaoConvite(c: typeof convites.$inferSelect): SituacaoConvite {
  if (c.aceitoEm) return "aceito";
  if (c.canceladoEm) return "cancelado";
  if (c.expiraEm < new Date()) return "expirado";
  return "valido";
}
