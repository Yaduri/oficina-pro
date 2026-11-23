import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { oficinaDaRequisicao } from "@/lib/oficina-ativa";
import { pode, type Acao, type Papel } from "@/lib/permissoes";

export type Oficina = typeof schema.oficinas.$inferSelect;
export type Membro = typeof schema.membros.$inferSelect;
export type OficinaResumo = { id: string; nome: string; papel: Papel };
export type { Papel };

export async function exigirLogin() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}

/** Participação ativa do usuário (usado no onboarding e sem-acesso). */
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
 * Contexto da requisição: oficina ativa (um CNPJ), papel do usuário nela e lista de oficinas ativas.
 * Sem participação: vai para o cadastro inicial; com acesso desativado: tela de aviso.
 */
export const getContexto = cache(async () => {
  const userId = await exigirLogin();
  const { ativo, vinculos } = await oficinaDaRequisicao();

  if (!ativo) {
    const db = await getDb();
    const [inativo] = await db.select({ id: schema.membros.id }).from(schema.membros).where(eq(schema.membros.clerkUserId, userId)).limit(1);
    redirect(inativo ? "/sem-acesso" : "/onboarding");
  }

  const { membro, oficina } = ativo;
  const papel = membro.papel;
  const oficinas: OficinaResumo[] = vinculos
    .map((v) => ({
      id: v.oficina.id,
      nome: v.oficina.nomeFantasia || v.oficina.nome,
      papel: v.membro.papel,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    userId,
    membro,
    oficina,
    papel,
    admin: pode(papel, "configurar"),
    pode: (acao: Acao) => pode(papel, acao),
    oficinas,
  };
});

/** Página que exige uma permissão: sem ela, volta para a tela inicial do papel. */
export async function exigir(acao: Acao) {
  const ctx = await getContexto();
  if (!ctx.pode(acao)) redirect(ctx.papel === "contador" ? "/notas" : "/inicio");
  return ctx;
}

/** Telas e ações só para dono/gerente. */
export const exigirAdmin = () => exigir("configurar");
