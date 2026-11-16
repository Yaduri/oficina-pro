import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pode, type Acao, type Papel } from "@/lib/permissoes";

export type Empresa = typeof schema.empresas.$inferSelect;
export type Oficina = typeof schema.oficinas.$inferSelect;
export type Membro = typeof schema.membros.$inferSelect;
export type { Papel };

export async function exigirLogin() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}

/** Participação ativa mais recente do usuário (um usuário pode estar em mais de uma oficina). */
export async function membroAtivo(userId: string) {
  const db = await getDb();
  const [m] = await db
    .select()
    .from(schema.membros)
    .where(and(eq(schema.membros.clerkUserId, userId), eq(schema.membros.ativo, true)))
    .orderBy(desc(schema.membros.criadoEm))
    .limit(1);
  return m ?? null;
}

/**
 * Contexto da requisição: oficina do usuário, papel e empresas (CNPJs) que ele pode acessar.
 * Sem participação: vai para o cadastro inicial; com acesso desativado: tela de aviso.
 */
export const getContexto = cache(async () => {
  const userId = await exigirLogin();
  const db = await getDb();

  const membro = await membroAtivo(userId);
  if (!membro) {
    const [inativo] = await db.select({ id: schema.membros.id }).from(schema.membros).where(eq(schema.membros.clerkUserId, userId)).limit(1);
    redirect(inativo ? "/sem-acesso" : "/onboarding");
  }

  const oficina = await db.query.oficinas.findFirst({
    where: eq(schema.oficinas.id, membro.oficinaId),
    with: { empresas: { orderBy: (e, { asc }) => [asc(e.criadoEm), asc(e.nome)] } },
  });
  if (!oficina) redirect("/onboarding");

  let empresas = oficina.empresas;
  if (!membro.todasEmpresas) {
    const vinculos = await db
      .select({ empresaId: schema.membroEmpresas.empresaId })
      .from(schema.membroEmpresas)
      .where(eq(schema.membroEmpresas.membroId, membro.id));
    const ids = new Set(vinculos.map((v) => v.empresaId));
    empresas = oficina.empresas.filter((e) => ids.has(e.id));
  }

  const papel = membro.papel;
  return {
    userId,
    membro,
    oficina,
    empresas,
    papel,
    admin: pode(papel, "configurar"),
    pode: (acao: Acao) => pode(papel, acao),
  };
});

/** Página que exige uma permissão: sem ela, volta para o início. */
export async function exigir(acao: Acao) {
  const ctx = await getContexto();
  if (!ctx.pode(acao)) redirect("/inicio");
  return ctx;
}

/** Telas e ações só para dono/gerente. */
export const exigirAdmin = () => exigir("configurar");

/** Resolve o filtro ?empresa=<id> para a lista de empresas a exibir. */
export async function empresasFiltradas(empresaParam?: string | string[]) {
  const ctx = await getContexto();
  const id = Array.isArray(empresaParam) ? empresaParam[0] : empresaParam;
  const selecionada = id ? ctx.empresas.find((e) => e.id === id) : undefined;
  return {
    ...ctx,
    selecionada,
    empresaIds: selecionada ? [selecionada.id] : ctx.empresas.map((e) => e.id),
  };
}
