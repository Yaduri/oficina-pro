"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { calcularProxima } from "@/lib/relacionamento";
import { diaSP } from "@/lib/agenda-datas";
import { soDigitos } from "@/lib/utils";

export type RevisaoState = { erro?: string; ok?: boolean } | undefined;

const SEM_PERMISSAO = { erro: "Seu usuário não tem permissão para isso" };
const f = (form: FormData, k: string) => String(form.get(k) ?? "");
const inteiro = (v: string) => (soDigitos(v) ? Number(soDigitos(v)) : null);

const revisaoSchema = z
  .object({
    descricao: z.string().trim().min(2, "Informe o serviço").max(200, "Descrição muito longa"),
    meses: z
      .string()
      .transform(inteiro)
      .refine((n) => n === null || (n >= 1 && n <= 120), "Intervalo: de 1 a 120 meses"),
    km: z
      .string()
      .transform(inteiro)
      .refine((n) => n === null || (n >= 100 && n <= 500_000), "Intervalo: de 100 a 500.000 km"),
    ultimaData: z
      .string()
      .trim()
      .refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "Data inválida")
      .refine((v) => !v || v <= diaSP(new Date()), "A última vez não pode ser no futuro")
      .transform((v) => v || null),
    ultimoKm: z
      .string()
      .transform(inteiro)
      .refine((n) => n === null || n <= 3_000_000, "Km inválido"),
  })
  .refine((d) => d.meses || d.km, "Informe o intervalo em meses, em km ou os dois")
  .refine((d) => !d.meses || d.ultimaData, "Informe a data da última vez")
  .refine((d) => !d.km || d.ultimoKm !== null, "Informe o km da última vez");

async function contexto() {
  const ctx = await getContexto();
  return ctx.pode("cadastros") ? ctx : null;
}

/** Cria (sem id) ou edita um lembrete de revisão do veículo */
export async function salvarRevisao(veiculoId: string, id: string | null, _prev: RevisaoState, form: FormData): Promise<RevisaoState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!z.uuid().safeParse(veiculoId).success || (id && !z.uuid().safeParse(id).success)) return { erro: "Lembrete não encontrado" };
  const p = revisaoSchema.safeParse({
    descricao: f(form, "descricao"),
    meses: f(form, "meses"),
    km: f(form, "km"),
    ultimaData: f(form, "ultimaData"),
    ultimoKm: f(form, "ultimoKm"),
  });
  if (!p.success) return { erro: p.error.issues[0].message };
  const d = p.data;

  const db = await getDb();
  const [v] = await db
    .select({ id: schema.veiculos.id })
    .from(schema.veiculos)
    .where(and(eq(schema.veiculos.id, veiculoId), eq(schema.veiculos.oficinaId, ctx.oficina.id)));
  if (!v) return { erro: "Veículo não encontrado" };

  const proxima = calcularProxima({ ultimaData: d.ultimaData, ultimoKm: d.ultimoKm, meses: d.meses, km: d.km });
  const valores = {
    descricao: d.descricao,
    intervaloMeses: d.meses,
    intervaloKm: d.km,
    ultimaData: d.ultimaData,
    ultimoKm: d.ultimoKm,
    ...proxima,
  };
  const lr = schema.lembretesRevisao;
  if (id) {
    const [atual] = await db
      .select({ proximaData: lr.proximaData, proximoKm: lr.proximoKm })
      .from(lr)
      .where(and(eq(lr.id, id), eq(lr.veiculoId, veiculoId), eq(lr.oficinaId, ctx.oficina.id)));
    if (!atual) return { erro: "Lembrete não encontrado" };
    // Mudou a próxima revisão: volta a poder ser avisada
    const mudou = atual.proximaData !== proxima.proximaData || atual.proximoKm !== proxima.proximoKm;
    await db
      .update(lr)
      .set({ ...valores, ...(mudou ? { avisadoEm: null } : {}) })
      .where(eq(lr.id, id));
  } else {
    await db.insert(lr).values({ oficinaId: ctx.oficina.id, veiculoId, ...valores });
  }
  revalidatePath(`/veiculos/${veiculoId}`);
  return { ok: true };
}

/** Desativa (para de lembrar) ou reativa um lembrete */
export async function ativarRevisao(veiculoId: string, id: string, ativo: boolean): Promise<RevisaoState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!z.uuid().safeParse(veiculoId).success || !z.uuid().safeParse(id).success) return { erro: "Lembrete não encontrado" };
  const db = await getDb();
  const lr = schema.lembretesRevisao;
  await db
    .update(lr)
    .set({ ativo })
    .where(and(eq(lr.id, id), eq(lr.veiculoId, veiculoId), eq(lr.oficinaId, ctx.oficina.id)));
  revalidatePath(`/veiculos/${veiculoId}`);
  return { ok: true };
}

/** Remove um lembrete criado por engano */
export async function excluirRevisao(veiculoId: string, id: string): Promise<RevisaoState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!z.uuid().safeParse(veiculoId).success || !z.uuid().safeParse(id).success) return { erro: "Lembrete não encontrado" };
  const db = await getDb();
  const lr = schema.lembretesRevisao;
  await db.delete(lr).where(and(eq(lr.id, id), eq(lr.veiculoId, veiculoId), eq(lr.oficinaId, ctx.oficina.id)));
  revalidatePath(`/veiculos/${veiculoId}`);
  return { ok: true };
}
