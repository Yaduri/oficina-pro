import "server-only";
import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/*
 * Resolução da oficina ativa por requisição.
 * O cookie `oficina_ativa` guarda apenas a preferência do usuário.
 * A cada requisição, `oficinaDaRequisicao()` lista os vínculos ativos em `membros`,
 * escolhe a oficina do cookie (ou faz fallback para a mais recente) e esse id resolvido
 * é propagado para `getDb()` como `app.oficina` no RLS.
 */

export const COOKIE_OFICINA = "oficina_ativa";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Vinculo = {
  membro: typeof schema.membros.$inferSelect;
  oficina: typeof schema.oficinas.$inferSelect;
};

/** Lê a preferência de oficina ativa no cookie; retorna null se ausente ou formato inválido */
export async function lerOficinaAtivaCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const valor = store.get(COOKIE_OFICINA)?.value?.trim() ?? "";
    return UUID_RE.test(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Grava a preferência de oficina ativa (chamar somente em Server Action ou Route Handler) */
export async function definirOficinaAtivaCookie(oficinaId: string): Promise<void> {
  if (!UUID_RE.test(oficinaId)) throw new Error("ID de oficina inválido");
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(COOKIE_OFICINA, oficinaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Função pura: escolhe na lista de vínculos ativos o que bate com o cookie,
 * ou faz fallback para o primeiro item (mais recente), ou null se a lista estiver vazia.
 */
export function resolverOficinaAtiva<T extends { oficina: { id: string } }>(lista: T[], cookieId: string | null): T | null {
  if (lista.length === 0) return null;
  if (cookieId) {
    const escolhido = lista.find((item) => item.oficina.id === cookieId);
    if (escolhido) return escolhido;
  }
  return lista[0];
}

/**
 * Resolve todos os vínculos ativos do usuário logado e a oficina ativa da requisição.
 * Memorizada com `cache()` do React: roda no máximo 1 vez por requisição.
 */
export const oficinaDaRequisicao = cache(async (): Promise<{ ativo: Vinculo | null; vinculos: Vinculo[] }> => {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return { ativo: null, vinculos: [] };

  const db = await getDb({ todasOficinas: true });
  const vinculos = await db
    .select({ membro: schema.membros, oficina: schema.oficinas })
    .from(schema.membros)
    .innerJoin(schema.oficinas, eq(schema.oficinas.id, schema.membros.oficinaId))
    .where(and(eq(schema.membros.clerkUserId, userId), eq(schema.membros.ativo, true)))
    .orderBy(desc(schema.membros.criadoEm));

  const cookieId = await lerOficinaAtivaCookie();
  const ativo = resolverOficinaAtiva(vinculos, cookieId);
  return { ativo, vinculos };
});
