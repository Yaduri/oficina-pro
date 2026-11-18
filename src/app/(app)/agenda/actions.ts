"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { gravarVeiculo, prepararVeiculo } from "@/lib/veiculo-form";
import { DIA_RE, dataHora, formatDuracao, horaSP, type StatusAgenda } from "@/lib/agenda-datas";

export type AgendaState = { erro?: string; conflito?: string } | undefined;

const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

const dadosSchema = z.object({
  dia: z.string().regex(DIA_RE, "Escolha a data"),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Escolha o horário"),
  duracao: z.coerce.number().int().min(15, "Duração inválida").max(600, "Duração inválida"),
  titulo: z.string().min(2, "Diga o que vai ser feito").max(200, "Texto muito longo"),
  detalhe: z
    .string()
    .max(1000, "Observação muito longa")
    .transform((v) => v || null),
  tecnicoId: z.string().transform((v) => v || null),
});

function revalidar() {
  revalidatePath("/agenda");
  revalidatePath("/inicio");
}

/** Cria (sem id) ou altera um agendamento. Avisa se o técnico já tem horário no mesmo período. */
export async function salvarAgendamento(id: string | null, _prev: AgendaState, form: FormData): Promise<AgendaState> {
  const ctx = await getContexto();
  if (!ctx.pode("abrirOS")) return { erro: "Seu usuário não tem permissão para isso" };
  const p = dadosSchema.safeParse({
    dia: f(form, "dia"),
    hora: f(form, "hora"),
    duracao: f(form, "duracao") || "60",
    titulo: f(form, "titulo"),
    detalhe: f(form, "detalhe"),
    tecnicoId: f(form, "tecnicoId"),
  });
  if (!p.success) return { erro: p.error.issues[0].message };
  const d = p.data;
  if (id && !z.uuid().safeParse(id).success) return { erro: "Agendamento não encontrado" };
  const inicio = dataHora(d.dia, d.hora);
  if (Number.isNaN(inicio.getTime())) return { erro: "Data ou horário inválido" };

  const db = await getDb();
  const ag = schema.agendamentos;
  if (d.tecnicoId) {
    const [t] = await db
      .select({ id: schema.tecnicos.id, nome: schema.tecnicos.nome })
      .from(schema.tecnicos)
      .where(and(eq(schema.tecnicos.id, d.tecnicoId), eq(schema.tecnicos.oficinaId, ctx.oficina.id)));
    if (!t) return { erro: "Técnico não encontrado" };

    // Mesmo técnico com outro horário que se sobrepõe
    if (f(form, "ignorarConflito") !== "1") {
      const fim = new Date(inicio.getTime() + d.duracao * 60_000);
      const cond = [
        eq(ag.oficinaId, ctx.oficina.id),
        eq(ag.tecnicoId, t.id),
        notInArray(ag.status, ["cancelado", "faltou"]),
        sql`${ag.inicio} < ${fim.toISOString()}::timestamptz`,
        sql`${ag.inicio} + (${ag.duracaoMin} * interval '1 minute') > ${inicio.toISOString()}::timestamptz`,
      ];
      if (id) cond.push(ne(ag.id, id));
      const [outro] = await db.select({ titulo: ag.titulo, inicio: ag.inicio, duracaoMin: ag.duracaoMin }).from(ag).where(and(...cond)).limit(1);
      if (outro) {
        return {
          conflito: `${t.nome} já tem “${outro.titulo}” às ${horaSP(outro.inicio)} (${formatDuracao(outro.duracaoMin)}).`,
        };
      }
    }
  }

  // Veículo: já cadastrado ou novo (cadastra cliente e veículo junto)
  const prep = await prepararVeiculo(ctx.oficina.id, form);
  if ("erro" in prep) return prep;

  const salvo = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DB;
    const { veiculoId, clienteId } = await gravarVeiculo(tx, ctx.oficina.id, prep.ok, null);
    const valores = {
      tecnicoId: d.tecnicoId,
      veiculoId,
      clienteId,
      titulo: d.titulo,
      detalhe: d.detalhe,
      inicio,
      duracaoMin: d.duracao,
    };
    if (id) {
      const r = await tx
        .update(ag)
        .set(valores)
        .where(and(eq(ag.id, id), eq(ag.oficinaId, ctx.oficina.id)))
        .returning({ id: ag.id });
      return r.length > 0;
    }
    await tx.insert(ag).values({ oficinaId: ctx.oficina.id, criadoPor: ctx.userId, ...valores });
    return true;
  });
  if (!salvo) return { erro: "Agendamento não encontrado" };

  revalidar();
  redirect(`/agenda?data=${d.dia}`);
}

const PERMITIDOS: StatusAgenda[] = ["agendado", "confirmado", "faltou", "cancelado"];

/** Confirmar, marcar falta, cancelar ou voltar para agendado */
export async function mudarStatusAgendamento(id: string, status: StatusAgenda): Promise<{ erro?: string } | undefined> {
  const ctx = await getContexto();
  if (!ctx.pode("abrirOS")) return { erro: "Seu usuário não tem permissão para isso" };
  if (!z.uuid().safeParse(id).success || !PERMITIDOS.includes(status)) return { erro: "Agendamento não encontrado" };
  const db = await getDb();
  const ag = schema.agendamentos;
  // Agendamento que já virou check-in não muda mais
  await db
    .update(ag)
    .set({ status })
    .where(and(eq(ag.id, id), eq(ag.oficinaId, ctx.oficina.id), ne(ag.status, "atendido")));
  revalidar();
}
