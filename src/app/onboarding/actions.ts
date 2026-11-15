"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { chaveOficina } from "@/lib/oficina";

const empresaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa"),
  cnpj: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 14, "CNPJ deve ter 14 dígitos"),
  tipo: z.enum(["mecanica", "eletrica", "outra"]),
});

const formSchema = z.object({
  nomeOficina: z.string().trim().min(2, "Informe o nome da oficina"),
  empresas: z.array(empresaSchema).min(1),
});

export type OnboardingState = { erro?: string } | undefined;

export async function criarOficina(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const { userId, chave } = await chaveOficina();

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
  const existente = await db.query.oficinas.findFirst({ where: eq(schema.oficinas.clerkOrgId, chave) });
  if (existente) redirect("/inicio");

  await db.transaction(async (tx) => {
    const [oficina] = await tx
      .insert(schema.oficinas)
      .values({ clerkOrgId: chave, nome: parsed.data.nomeOficina })
      .returning();
    await tx
      .insert(schema.empresas)
      .values(parsed.data.empresas.map((e) => ({ oficinaId: oficina.id, nome: e.nome, cnpj: e.cnpj || null, tipo: e.tipo })));
    await tx.insert(schema.usuarioAcessos).values({ oficinaId: oficina.id, clerkUserId: userId, empresaId: null, papel: "dono" });
  });

  redirect("/inicio");
}
