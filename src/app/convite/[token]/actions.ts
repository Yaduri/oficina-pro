"use server";

import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, gt, isNull } from "drizzle-orm";
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

    // Só empresas que ainda existem na oficina
    const daOficina = await tx
      .select({ id: schema.empresas.id })
      .from(schema.empresas)
      .where(eq(schema.empresas.oficinaId, convite.oficinaId));
    const validas = convite.empresaIds.filter((id) => daOficina.some((e) => e.id === id));

    const dados = {
      papel: convite.papel,
      todasEmpresas: convite.todasEmpresas,
      ativo: true,
      nome: usuario?.fullName ?? null,
      email: usuario?.primaryEmailAddress?.emailAddress ?? null,
      // Mais recente = oficina que o usuário passa a ver ao entrar
      criadoEm: new Date(),
    };
    const [membro] = await tx
      .insert(schema.membros)
      .values({ oficinaId: convite.oficinaId, clerkUserId: userId, ...dados })
      .onConflictDoUpdate({ target: [schema.membros.oficinaId, schema.membros.clerkUserId], set: dados })
      .returning({ id: schema.membros.id });

    await tx.delete(schema.membroEmpresas).where(eq(schema.membroEmpresas.membroId, membro.id));
    if (!convite.todasEmpresas && validas.length > 0) {
      await tx.insert(schema.membroEmpresas).values(validas.map((empresaId) => ({ membroId: membro.id, empresaId })));
    }
    return true;
  });

  if (!ok) return { erro: "Este convite já foi usado, foi cancelado ou venceu. Peça um novo." };
  redirect("/inicio");
}
