"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { registrarEvento } from "@/lib/os-acesso";
import { TERMO_PADRAO } from "@/lib/textos";
import { listarChecklist } from "@/lib/checklist-dados";
import type { ItemChecklistRegistrado } from "@/db/schema";
import { gravarVeiculo, prepararVeiculo, proximoNumeroOS } from "@/lib/veiculo-form";
import { soDigitos } from "@/lib/utils";
import { POSICOES } from "@/lib/checkin";

export type CheckinState = { erro?: string } | undefined;

const texto = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => v || null);

const checkinSchema = z.object({
  empresaIds: z.array(z.uuid()).min(1, "Escolha pelo menos uma empresa (gera uma OS para cada)"),
  km: z
    .string()
    .transform(soDigitos)
    .transform((v) => (v ? Number(v) : null)),
  combustivel: z
    .string()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 8), "Nível de combustível inválido"),
  relato: z.string().trim().min(3, "Descreva o que o cliente relatou"),
  avarias: texto,
  objetos: texto,
  fotos: z
    .array(z.object({ posicao: z.enum(POSICOES), key: z.string().min(1) }))
    .max(30, "Máximo de 30 fotos"),
  assinaturaKey: z.string(),
  checklist: z
    .array(z.object({ id: z.uuid(), estado: z.enum(["ok", "problema", "nao_tem"]), obs: z.string().trim().max(200).nullable() }))
    .max(200),
});

const f = (form: FormData, k: string) => String(form.get(k) ?? "");

export async function criarCheckin(_prev: CheckinState, form: FormData): Promise<CheckinState> {
  const ctx = await getContexto();
  const { oficina, empresas, userId } = ctx;

  let fotos: unknown = [];
  let checklist: unknown = [];
  try {
    fotos = JSON.parse(f(form, "fotos") || "[]");
    checklist = JSON.parse(f(form, "checklist") || "[]");
  } catch {
    return { erro: "Dados do formulário inválidos" };
  }
  const parsed = checkinSchema.safeParse({
    empresaIds: form.getAll("empresaIds").map(String),
    km: f(form, "km"),
    combustivel: f(form, "combustivel"),
    relato: f(form, "relato"),
    avarias: f(form, "avarias"),
    objetos: f(form, "objetos"),
    fotos,
    assinaturaKey: f(form, "assinaturaKey"),
    checklist,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.empresaIds.some((id) => !empresas.some((e) => e.id === id))) return { erro: "Empresa não permitida" };
  // Só aceita arquivos enviados para esta oficina
  const prefixo = `${oficina.id}/checkins/`;
  if (d.fotos.some((ft) => !ft.key.startsWith(prefixo)) || (d.assinaturaKey && !d.assinaturaKey.startsWith(prefixo))) {
    return { erro: "Arquivo inválido" };
  }

  // Cópia do checklist: todos os itens ativos, com a resposta dada (ou não verificado)
  const config = await listarChecklist(oficina.id, true);
  const respostas = new Map(d.checklist.map((r) => [r.id, r]));
  const checklistRegistrado: ItemChecklistRegistrado[] | null =
    config.length === 0
      ? null
      : config.map((i) => ({
          grupo: i.grupo,
          descricao: i.descricao,
          estado: respostas.get(i.id)?.estado ?? null,
          obs: respostas.get(i.id)?.estado === "problema" ? (respostas.get(i.id)?.obs || null) : null,
        }));

  const prep = await prepararVeiculo(oficina.id, form);
  if ("erro" in prep) return prep;

  const db = await getDb();
  const checkinId = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DB;
    const { veiculoId, clienteId } = await gravarVeiculo(tx, oficina.id, prep.ok, d.km);

    const [checkin] = await tx
      .insert(schema.checkins)
      .values({
        oficinaId: oficina.id,
        veiculoId,
        clienteId,
        km: d.km,
        combustivel: d.combustivel,
        relato: d.relato,
        avarias: d.avarias,
        objetos: d.objetos,
        assinaturaKey: d.assinaturaKey || null,
        termo: d.assinaturaKey ? (oficina.textoTermoCheckin ?? TERMO_PADRAO) : null,
        checklist: checklistRegistrado,
        criadoPor: userId,
      })
      .returning({ id: schema.checkins.id });

    if (d.fotos.length > 0) {
      await tx
        .insert(schema.checkinFotos)
        .values(d.fotos.map((ft, i) => ({ checkinId: checkin.id, posicao: ft.posicao, key: ft.key, ordem: i })));
    }

    // Uma OS por empresa escolhida, já ligada ao check-in
    let numero = await proximoNumeroOS(tx, oficina.id);
    for (const empresaId of d.empresaIds) {
      const [nova] = await tx
        .insert(schema.ordensServico)
        .values({
          oficinaId: oficina.id,
          empresaId,
          numero: numero++,
          checkinId: checkin.id,
          veiculoId,
          clienteId,
          descricao: d.relato,
          kmEntrada: d.km,
        })
        .returning({ id: schema.ordensServico.id });
      await registrarEvento(tx, oficina.id, nova.id, "Abriu a OS pelo check-in", ctx);
    }
    // Agendamento que virou este check-in
    const agendamentoId = f(form, "agendamentoId");
    if (agendamentoId && /^[0-9a-f-]{36}$/i.test(agendamentoId)) {
      await tx
        .update(schema.agendamentos)
        .set({ status: "atendido", checkinId: checkin.id })
        .where(and(eq(schema.agendamentos.id, agendamentoId), eq(schema.agendamentos.oficinaId, oficina.id)));
    }
    return checkin.id;
  });

  revalidatePath("/check-in");
  revalidatePath("/ordens-servico");
  revalidatePath("/inicio");
  revalidatePath("/agenda");
  revalidatePath("/clientes");
  redirect(`/check-in/${checkinId}`);
}
