"use server";

import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDbSistema, schema } from "@/db";
import { definirOficinaAtivaCookie } from "@/lib/oficina-ativa";
import { TOKEN_CONVITE_RE } from "@/lib/usuarios";

export type AceiteState = { erro?: string } | undefined;

/** Aceita o convite com a conta logada: cria (ou reativa) a participação na oficina */
export async function aceitarConvite(token: string): Promise<AceiteState> {
  if (!TOKEN_CONVITE_RE.test(token)) return { erro: "Convite inválido" };
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/convite/${token}`)}`);
  const usuario = await currentUser();
  // Ainda não é membro da oficina do convite: conexão do sistema, filtrada pelo token e pelo login
  const db = await getDbSistema();

  const conviteAceito = await db.transaction(async (tx) => {
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
    if (!convite) return null;

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
    return convite;
  });

  if (!conviteAceito) return { erro: "Este convite já foi usado, foi cancelado ou venceu. Peça um novo." };
  await definirOficinaAtivaCookie(conviteAceito.oficinaId);
  redirect(conviteAceito.papel === "contador" ? "/notas" : "/inicio");
}
