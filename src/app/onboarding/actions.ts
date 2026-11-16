"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { currentUser } from "@clerk/nextjs/server";
import { exigirLogin, membroAtivo } from "@/lib/oficina";
import { cnpjValido, normalizarCnpj } from "@/lib/utils";

const empresaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa"),
  cnpj: z
    .string()
    .transform(normalizarCnpj)
    .refine((v) => v === "" || cnpjValido(v), "CNPJ inválido"),
  tipo: z.enum(["mecanica", "eletrica", "outra"]),
});

const formSchema = z.object({
  nomeOficina: z.string().trim().min(2, "Informe o nome da oficina"),
  empresas: z.array(empresaSchema).min(1),
});

export type OnboardingState = { erro?: string } | undefined;

export async function criarOficina(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const userId = await exigirLogin();

  const empresas = [0, 1]
    .map((i) => ({
      nome: String(form.get(`empresa_${i}_nome`) ?? ""),
      cnpj: String(form.get(`empresa_${i}_cnpj`) ?? ""),
      tipo: String(form.get(`empresa_${i}_tipo`) ?? "outra"),
    }))
    .filter((e) => e.nome.trim() !== "");

  const parsed = formSchema.safeParse({
    nomeOficina: form.get("nomeOficina"),
    empresas,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const db = await getDb();
  if (await membroAtivo(userId)) redirect("/inicio");
  const usuario = await currentUser();

  await db.transaction(async (tx) => {
    const [oficina] = await tx
      .insert(schema.oficinas)
      // clerk_org_id: identificador legado (a oficina não depende mais de Organization do Clerk)
      .values({ clerkOrgId: `oficina_${crypto.randomUUID()}`, nome: parsed.data.nomeOficina })
      .returning();
    await tx
      .insert(schema.empresas)
      .values(parsed.data.empresas.map((e) => ({ oficinaId: oficina.id, nome: e.nome, cnpj: e.cnpj || null, tipo: e.tipo })));
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
