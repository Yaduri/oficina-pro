"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDbSistema, schema } from "@/db";
import { currentUser } from "@clerk/nextjs/server";
import { exigirLogin, membroAtivo } from "@/lib/oficina";
import { cnpjValido, normalizarCnpj } from "@/lib/utils";

const formSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da oficina").max(120, "Nome muito longo"),
  cnpj: z
    .string()
    .transform(normalizarCnpj)
    .refine((v) => v === "" || cnpjValido(v), "CNPJ inválido")
    .transform((v) => v || null),
});

export type OnboardingState = { erro?: string } | undefined;

/** Cria a oficina (um CNPJ) e torna o usuário dono dela */
export async function criarOficina(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const userId = await exigirLogin();
  const parsed = formSchema.safeParse({ nome: String(form.get("nome") ?? ""), cnpj: String(form.get("cnpj") ?? "") });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  // Ainda sem oficina: o RLS não deixaria criar nem conferir o CNPJ em outras contas
  const db = await getDbSistema();
  if (await membroAtivo(userId)) redirect("/inicio");
  if (parsed.data.cnpj) {
    const [existe] = await db.select({ id: schema.oficinas.id }).from(schema.oficinas).where(eq(schema.oficinas.cnpj, parsed.data.cnpj));
    if (existe) return { erro: "Este CNPJ já tem uma conta. Peça a quem administra para te convidar." };
  }
  const usuario = await currentUser();

  await db.transaction(async (tx) => {
    const [oficina] = await tx
      .insert(schema.oficinas)
      // clerk_org_id: identificador legado (a oficina não depende de Organization do Clerk)
      .values({ clerkOrgId: `oficina_${crypto.randomUUID()}`, nome: parsed.data.nome, cnpj: parsed.data.cnpj })
      .returning();
    await tx.insert(schema.membros).values({
      oficinaId: oficina.id,
      clerkUserId: userId,
      nome: usuario?.fullName ?? null,
      email: usuario?.primaryEmailAddress?.emailAddress ?? null,
      papel: "dono",
    });
  });

  redirect("/inicio");
}
