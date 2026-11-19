"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { exigirAdmin } from "@/lib/oficina";
import { MODELOS } from "@/lib/mensagens";

export type MensagensConfigState = { erro?: string; ok?: boolean } | undefined;

/** Grava os modelos de mensagem (só o que difere do padrão) e o prazo do pós-venda */
export async function salvarModelosMensagem(_prev: MensagensConfigState, form: FormData): Promise<MensagensConfigState> {
  const { oficina } = await exigirAdmin();

  const dias = z.coerce
    .number({ error: "Prazo do pós-venda inválido" })
    .int("Use um número inteiro de dias")
    .min(1, "O pós-venda precisa de pelo menos 1 dia")
    .max(60, "Prazo máximo de 60 dias")
    .safeParse(String(form.get("posVendaDias") ?? ""));
  if (!dias.success) return { erro: dias.error.issues[0].message };

  const modelos: Record<string, string> = {};
  for (const m of MODELOS) {
    const texto = String(form.get(`modelo_${m.tipo}`) ?? "")
      .replace(/\r\n/g, "\n")
      .trim();
    if (texto.length > 1000) return { erro: `“${m.label}”: texto muito longo (máximo de 1000 caracteres)` };
    if (texto && texto !== m.padrao) modelos[m.tipo] = texto;
  }

  const db = await getDb();
  await db
    .update(schema.oficinas)
    .set({ modelosMensagem: Object.keys(modelos).length > 0 ? modelos : null, posVendaDias: dias.data })
    .where(eq(schema.oficinas.id, oficina.id));
  revalidatePath("/configuracoes/mensagens");
  revalidatePath("/mensagens");
  return { ok: true };
}
