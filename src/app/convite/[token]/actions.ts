"use server";

import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { TOKEN_CONVITE_RE } from "@/lib/usuarios";

export type AceiteState = { erro?: string } | undefined;

/** Aceita o convite com a conta logada: cria (ou reativa) a participação na oficina */
export async function aceitarConvite(token: string): Promise<AceiteState> {
  if (!TOKEN_CONVITE_RE.test(token)) return { erro: "Convite inválido" };
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/convite/${token}`)}`);
  const usuario = await currentUser();
  const db = await getDb();

  // Cada login pertence a uma única oficina
  const [outra] = await db
    .select({ oficinaId: schema.membros.oficinaId })
    .from(schema.membros)
    .innerJoin(schema.convites, eq(schema.convites.token, token))
    .where(and(eq(schema.membros.clerkUserId, userId), eq(schema.membros.ativo, true), ne(schema.membros.oficinaId, schema.convites.oficinaId)))
    .limit(1);
  if (outra) {
    return { erro: "Este login já faz parte de outra oficina. Para entrar nesta, use outro e-mail ou peça para ser removido da outra." };
  }

  const ok = await db.transaction(async (tx) => {
    // Marca o convite como usado só se ainda estiver válido (evita uso duplo)
    const [convite] = await tx
      .update(schema.convites)
      .set({ aceitoEm: new Date(), aceitoPor: userId })
      .where(
        and(
          eq(schema.convites.token, token),
          isNull(schema.convites.aceitoEm),
          isNull(schema.convites.canceladoEm),
          gt(schema.convites.expiraEm, new Date()),
        ),
      )
      .returning();
    if (!convite) return false;

    const dados = {
      papel: convite.papel,
      ativo: true,
      nome: usuario?.fullName ?? null,
      email: usuario?.primaryEmailAddress?.emailAddress ?? null,
    };
    await tx
      .insert(schema.membros)
      .values({ oficinaId: convite.oficinaId, clerkUserId: userId, ...dados })
      .onConflictDoUpdate({ target: [schema.membros.oficinaId, schema.membros.clerkUserId], set: dados });
    return true;
  });

  if (!ok) return { erro: "Este convite já foi usado, foi cancelado ou venceu. Peça um novo." };
  redirect("/inicio");
}
