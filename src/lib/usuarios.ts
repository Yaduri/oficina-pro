import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, getDbSistema, schema } from "@/db";

const { membros, convites, oficinas } = schema;

/** Membros da oficina (preenche nome/e-mail que faltarem pelo Clerk) */
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

  return lista;
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

/** Convite pelo token, com a oficina */
export async function conviteDoToken(token: string) {
  if (!TOKEN_CONVITE_RE.test(token)) return null;
  // Quem abre o convite ainda não é da oficina: conexão do sistema, filtrada pelo token
  const db = await getDbSistema();
  const [row] = await db
    .select({ convite: convites, oficina: oficinas })
    .from(convites)
    .innerJoin(oficinas, eq(oficinas.id, convites.oficinaId))
    .where(eq(convites.token, token));
  return row ?? null;
}

export type SituacaoConvite = "valido" | "aceito" | "cancelado" | "expirado";

export function situacaoConvite(c: typeof convites.$inferSelect): SituacaoConvite {
  if (c.aceitoEm) return "aceito";
  if (c.canceladoEm) return "cancelado";
  if (c.expiraEm < new Date()) return "expirado";
  return "valido";
}
