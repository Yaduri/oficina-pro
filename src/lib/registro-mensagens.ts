import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { nomeDoUsuario, registrarEvento } from "@/lib/os-acesso";
import { TEXTO_DISPENSADA, type TipoMensagem } from "@/lib/mensagens";
import { soDigitos } from "@/lib/utils";

/*
 * Registro das mensagens de WhatsApp abertas pelo sistema (tabela `mensagens`).
 * Usado pela action registrarMensagem (botões no navegador) e por actions do servidor que já
 * montam o link (ex.: envio de documentos).
 */

type Contexto = Awaited<ReturnType<typeof getContexto>>;

const TIPOS = [
  "orcamento",
  "orcamento_respondido",
  "pronto",
  "agendamento",
  "pos_venda",
  "revisao",
  "portal",
  "acompanhamento",
  "reativacao",
  "documento",
  "cobranca",
  "nota_fiscal",
  "livre",
] as const satisfies readonly TipoMensagem[];

const idOpcional = z.uuid().nullish();

export const registroSchema = z.object({
  tipo: z.enum(TIPOS),
  clienteId: idOpcional,
  veiculoId: idOpcional,
  osId: idOpcional,
  agendamentoId: idOpcional,
  refId: idOpcional,
  telefone: z
    .string()
    .nullish()
    .transform((v) => soDigitos(v).slice(0, 15) || null),
  texto: z.string().trim().min(1, "Mensagem vazia").max(4000, "Mensagem muito longa"),
});

export type DadosRegistro = z.input<typeof registroSchema>;
type Refs = { clienteId: string | null; veiculoId: string | null; osId: string | null; agendamentoId: string | null; refId: string | null };

/**
 * Confere que cada id é da oficina e completa o que dá para deduzir (cliente e veículo da OS,
 * do agendamento, da conta a receber ou do lembrete). Devolve null se algum id não for da oficina.
 */
async function resolverRefs(db: DB, oficinaId: string, tipo: TipoMensagem, d: Partial<Refs>): Promise<Refs | null> {
  const r: Refs = {
    clienteId: d.clienteId ?? null,
    veiculoId: d.veiculoId ?? null,
    osId: d.osId ?? null,
    agendamentoId: d.agendamentoId ?? null,
    refId: d.refId ?? null,
  };
  const { ordensServico: os, agendamentos: ag, lancamentos: l, lembretesRevisao: lr, orcamentos: orc, checkins: ck, veiculos: v, clientes: c } = schema;

  if (r.refId) {
    if (tipo === "cobranca") {
      const [x] = await db.select({ clienteId: l.clienteId, osId: l.osId }).from(l).where(and(eq(l.id, r.refId), eq(l.oficinaId, oficinaId)));
      if (!x) return null;
      r.clienteId ??= x.clienteId;
      r.osId ??= x.osId;
    } else if (tipo === "revisao") {
      const [x] = await db.select({ veiculoId: lr.veiculoId }).from(lr).where(and(eq(lr.id, r.refId), eq(lr.oficinaId, oficinaId)));
      if (!x) return null;
      r.veiculoId ??= x.veiculoId;
    } else if (tipo === "orcamento" || tipo === "orcamento_respondido") {
      const [x] = await db.select({ osId: orc.osId }).from(orc).where(and(eq(orc.id, r.refId), eq(orc.oficinaId, oficinaId)));
      if (!x) return null;
      r.osId ??= x.osId;
    } else if (tipo === "documento") {
      // Termo de entrada: refId = check-in
      const [x] = await db.select({ veiculoId: ck.veiculoId, clienteId: ck.clienteId }).from(ck).where(and(eq(ck.id, r.refId), eq(ck.oficinaId, oficinaId)));
      if (!x) return null;
      r.veiculoId ??= x.veiculoId;
      r.clienteId ??= x.clienteId;
    } else if (tipo === "nota_fiscal") {
      const [x] = await db
        .select({ osId: schema.notasFiscais.osId, clienteId: schema.notasFiscais.clienteId })
        .from(schema.notasFiscais)
        .where(and(eq(schema.notasFiscais.id, r.refId), eq(schema.notasFiscais.oficinaId, oficinaId)));
      if (!x) return null;
      r.osId ??= x.osId;
      r.clienteId ??= x.clienteId;
    } else {
      // Outros tipos não usam refId
      r.refId = null;
    }
  }

  if (r.osId) {
    const [x] = await db.select({ clienteId: os.clienteId, veiculoId: os.veiculoId }).from(os).where(and(eq(os.id, r.osId), eq(os.oficinaId, oficinaId)));
    if (!x) return null;
    r.clienteId ??= x.clienteId;
    r.veiculoId ??= x.veiculoId;
  }
  if (r.agendamentoId) {
    const [x] = await db.select({ clienteId: ag.clienteId, veiculoId: ag.veiculoId }).from(ag).where(and(eq(ag.id, r.agendamentoId), eq(ag.oficinaId, oficinaId)));
    if (!x) return null;
    r.clienteId ??= x.clienteId;
    r.veiculoId ??= x.veiculoId;
  }
  if (r.veiculoId) {
    const [x] = await db.select({ clienteId: v.clienteId }).from(v).where(and(eq(v.id, r.veiculoId), eq(v.oficinaId, oficinaId)));
    if (!x) return null;
    r.clienteId ??= x.clienteId;
  }
  if (r.clienteId) {
    const [x] = await db.select({ id: c.id }).from(c).where(and(eq(c.id, r.clienteId), eq(c.oficinaId, oficinaId)));
    if (!x) return null;
  }
  return r;
}

/**
 * Grava a mensagem (ou o item dispensado da fila) e aplica os efeitos do tipo:
 * "pronto" marca a OS como cliente avisado; "revisao" marca o lembrete como avisado
 * (também ao dispensar, para sair da fila até a próxima revisão).
 */
export async function gravarMensagem(
  ctx: Contexto,
  entrada: DadosRegistro,
  opcoes: { dispensada?: boolean } = {},
): Promise<{ ok?: boolean; erro?: string }> {
  if (!ctx.pode("mensagens")) return { erro: "Seu usuário não tem permissão para isso" };
  const parsed = registroSchema.safeParse(opcoes.dispensada ? { ...entrada, texto: TEXTO_DISPENSADA, telefone: null } : entrada);
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const d = parsed.data;
  const db = await getDb();
  const oficinaId = ctx.oficina.id;

  const refs = await resolverRefs(db, oficinaId, d.tipo, d);
  if (!refs) return { erro: "Registro não encontrado" };

  await db.insert(schema.mensagens).values({
    oficinaId,
    tipo: d.tipo,
    ...refs,
    telefone: d.telefone,
    texto: d.texto,
    enviadoPor: ctx.userId,
    enviadoPorNome: nomeDoUsuario(ctx),
  });

  if (d.tipo === "pronto" && refs.osId && !opcoes.dispensada) {
    await db.update(schema.ordensServico).set({ clienteAvisadoEm: new Date() }).where(eq(schema.ordensServico.id, refs.osId));
    await registrarEvento(db, oficinaId, refs.osId, "Avisou o cliente pelo WhatsApp que o veículo está pronto", ctx);
  }
  if (d.tipo === "revisao" && refs.refId) {
    await db
      .update(schema.lembretesRevisao)
      .set({ avisadoEm: new Date() })
      .where(and(eq(schema.lembretesRevisao.id, refs.refId), eq(schema.lembretesRevisao.oficinaId, oficinaId)));
  }

  revalidatePath("/mensagens");
  revalidatePath("/inicio");
  if (refs.osId) {
    revalidatePath(`/ordens-servico/${refs.osId}`);
    if (d.tipo === "pronto") revalidatePath("/ordens-servico");
  }
  if (refs.veiculoId && d.tipo === "revisao") revalidatePath(`/veiculos/${refs.veiculoId}`);
  return { ok: true };
}
