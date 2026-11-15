import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type Empresa = typeof schema.empresas.$inferSelect;

/** Chave da oficina: a Organization do Clerk ou, sem organização, o próprio usuário. */
export async function chaveOficina() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  return { userId, chave: orgId ?? `user_${userId}` };
}

/**
 * Contexto da requisição: oficina atual, empresas que o usuário pode acessar.
 * Redireciona para o login ou para o cadastro inicial quando necessário.
 */
export const getContexto = cache(async () => {
  const { userId, chave } = await chaveOficina();
  const db = await getDb();

  const oficina = await db.query.oficinas.findFirst({
    where: eq(schema.oficinas.clerkOrgId, chave),
    with: { empresas: { orderBy: (e, { asc }) => [asc(e.criadoEm), asc(e.nome)] } },
  });
  if (!oficina) redirect("/onboarding");

  const acessos = await db
    .select()
    .from(schema.usuarioAcessos)
    .where(and(eq(schema.usuarioAcessos.oficinaId, oficina.id), eq(schema.usuarioAcessos.clerkUserId, userId)));

  // Sem registro de acesso: quem está na organização vê tudo (ajustar quando houver gestão de usuários).
  const todas = acessos.length === 0 || acessos.some((a) => a.empresaId === null);
  const permitidas = todas
    ? oficina.empresas
    : oficina.empresas.filter((e) => acessos.some((a) => a.empresaId === e.id));

  return { userId, oficina, empresas: permitidas };
});

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
