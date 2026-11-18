"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { GRUPOS_DRE, TIPOS_CONTA, hojeSP, reais } from "@/lib/financeiro";
import { DIA_RE } from "@/lib/agenda-datas";
import { parseValor } from "@/lib/utils";

export type ConfigState = { erro?: string; ok?: boolean } | undefined;

const { contasFinanceiras: contas, categoriasFinanceiras: categorias, baixas, transferencias, caixaSessoes, extratoItens, lancamentos, recorrencias, oficinas } =
  schema;
const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const uuid = (v: string) => z.uuid().safeParse(v).success;

async function ctxFin() {
  const ctx = await getContexto();
  return ctx.pode("financeiro") ? ctx : null;
}

function revalidar() {
  revalidatePath("/financeiro", "layout");
}

/* ---------- Contas ---------- */

export async function salvarConta(id: string | null, _prev: ConfigState, form: FormData): Promise<ConfigState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const nome = f(form, "nome");
  const tipo = f(form, "tipo");
  const saldoTxt = f(form, "saldoInicial");
  const saldo = saldoTxt ? parseValor(saldoTxt) : 0;
  const desde = f(form, "saldoInicialEm") || hojeSP();
  if (nome.length < 2 || nome.length > 60) return { erro: "Informe o nome da conta" };
  if (!Object.hasOwn(TIPOS_CONTA, tipo)) return { erro: "Escolha o tipo da conta" };
  if (!Number.isFinite(saldo) || Math.abs(saldo) >= 10_000_000) return { erro: "Saldo inicial inválido" };
  if (!DIA_RE.test(desde)) return { erro: "Data do saldo inicial inválida" };

  const db = await getDb();
  const filtros = [eq(contas.oficinaId, ctx.oficina.id), sql`lower(${contas.nome}) = lower(${nome})`];
  if (id) filtros.push(ne(contas.id, id));
  const [dup] = await db.select({ id: contas.id }).from(contas).where(and(...filtros));
  if (dup) return { erro: "Já existe uma conta com esse nome" };

  const valores = {
    nome,
    tipo: tipo as keyof typeof TIPOS_CONTA,
    saldoInicial: reais(Math.round(saldo * 100)),
    saldoInicialEm: desde,
  };
  if (id) {
    if (!uuid(id)) return { erro: "Conta não encontrada" };
    const res = await db
      .update(contas)
      .set(valores)
      .where(and(eq(contas.id, id), eq(contas.oficinaId, ctx.oficina.id)))
      .returning({ id: contas.id });
    if (res.length === 0) return { erro: "Conta não encontrada" };
  } else {
    await db.insert(contas).values({ oficinaId: ctx.oficina.id, ...valores });
  }
  revalidar();
  return { ok: true };
}

async function ativasRestantes(oficinaId: string, menos: string) {
  const db = await getDb();
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contas)
    .where(and(eq(contas.oficinaId, oficinaId), eq(contas.ativo, true), ne(contas.id, menos)));
  return Number(r?.n ?? 0);
}

export async function alternarConta(id: string, ativo: boolean): Promise<ConfigState> {
  const ctx = await ctxFin();
  if (!ctx || !uuid(id)) return { erro: "Sem permissão" };
  if (!ativo && (await ativasRestantes(ctx.oficina.id, id)) === 0) return { erro: "Mantenha pelo menos uma conta ativa" };
  const db = await getDb();
  await db.update(contas).set({ ativo }).where(and(eq(contas.id, id), eq(contas.oficinaId, ctx.oficina.id)));
  revalidar();
  return { ok: true };
}

/** Remove a conta; se já tem movimento, só desativa (o histórico continua) */
export async function removerConta(id: string): Promise<ConfigState & { desativada?: boolean }> {
  const ctx = await ctxFin();
  if (!ctx || !uuid(id)) return { erro: "Sem permissão" };
  if ((await ativasRestantes(ctx.oficina.id, id)) === 0) return { erro: "Mantenha pelo menos uma conta ativa" };
  const db = await getDb();
  const [c] = await db.select({ id: contas.id }).from(contas).where(and(eq(contas.id, id), eq(contas.oficinaId, ctx.oficina.id)));
  if (!c) return { erro: "Conta não encontrada" };

  const usos = await Promise.all([
    db.select({ id: baixas.id }).from(baixas).where(eq(baixas.contaId, id)).limit(1),
    db
      .select({ id: transferencias.id })
      .from(transferencias)
      .where(or(eq(transferencias.deContaId, id), eq(transferencias.paraContaId, id)))
      .limit(1),
    db.select({ id: caixaSessoes.id }).from(caixaSessoes).where(eq(caixaSessoes.contaId, id)).limit(1),
    db.select({ id: extratoItens.id }).from(extratoItens).where(eq(extratoItens.contaId, id)).limit(1),
  ]);
  if (usos.some((u) => u.length > 0)) {
    await db.update(contas).set({ ativo: false }).where(eq(contas.id, id));
    revalidar();
    return { ok: true, desativada: true };
  }
  await db.delete(contas).where(eq(contas.id, id));
  revalidar();
  return { ok: true };
}

/* ---------- Categorias ---------- */

export async function salvarCategoria(id: string | null, _prev: ConfigState, form: FormData): Promise<ConfigState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const nome = f(form, "nome");
  let tipo = f(form, "tipo");
  const grupoDre = f(form, "grupoDre");
  if (nome.length < 2 || nome.length > 60) return { erro: "Informe o nome da categoria" };

  const db = await getDb();
  if (id) {
    if (!uuid(id)) return { erro: "Categoria não encontrada" };
    const [atual] = await db.select().from(categorias).where(and(eq(categorias.id, id), eq(categorias.oficinaId, ctx.oficina.id)));
    if (!atual) return { erro: "Categoria não encontrada" };
    // O tipo não muda depois de criada (lançamentos já usam)
    tipo = atual.tipo;
  }
  if (tipo !== "receita" && tipo !== "despesa") return { erro: "Escolha receita ou despesa" };
  const grupo = Object.hasOwn(GRUPOS_DRE, grupoDre) ? GRUPOS_DRE[grupoDre as keyof typeof GRUPOS_DRE] : null;
  if (!grupo || grupo.tipo !== tipo) return { erro: "Escolha o grupo da DRE" };

  const filtros = [eq(categorias.oficinaId, ctx.oficina.id), eq(categorias.tipo, tipo), sql`lower(${categorias.nome}) = lower(${nome})`];
  if (id) filtros.push(ne(categorias.id, id));
  const [dup] = await db.select({ id: categorias.id }).from(categorias).where(and(...filtros));
  if (dup) return { erro: "Já existe uma categoria com esse nome" };

  if (id) {
    await db.update(categorias).set({ nome, grupoDre }).where(and(eq(categorias.id, id), eq(categorias.oficinaId, ctx.oficina.id)));
  } else {
    await db.insert(categorias).values({ oficinaId: ctx.oficina.id, tipo, nome, grupoDre });
  }
  revalidar();
  return { ok: true };
}

export async function alternarCategoria(id: string, ativo: boolean): Promise<ConfigState> {
  const ctx = await ctxFin();
  if (!ctx || !uuid(id)) return { erro: "Sem permissão" };
  const db = await getDb();
  const [c] = await db.select().from(categorias).where(and(eq(categorias.id, id), eq(categorias.oficinaId, ctx.oficina.id)));
  if (!c) return { erro: "Categoria não encontrada" };
  if (c.sistema && !ativo) return { erro: "Categoria usada automaticamente pelo sistema: não pode ser desativada" };
  await db.update(categorias).set({ ativo }).where(eq(categorias.id, id));
  revalidar();
  return { ok: true };
}

/** Remove a categoria; se já foi usada, só desativa (os relatórios continuam certos) */
export async function removerCategoria(id: string): Promise<ConfigState & { desativada?: boolean }> {
  const ctx = await ctxFin();
  if (!ctx || !uuid(id)) return { erro: "Sem permissão" };
  const db = await getDb();
  const [c] = await db.select().from(categorias).where(and(eq(categorias.id, id), eq(categorias.oficinaId, ctx.oficina.id)));
  if (!c) return { erro: "Categoria não encontrada" };
  if (c.sistema) return { erro: "Categoria usada automaticamente pelo sistema: não pode ser removida" };
  const [l] = await db.select({ id: lancamentos.id }).from(lancamentos).where(eq(lancamentos.categoriaId, id)).limit(1);
  const [r] = await db.select({ id: recorrencias.id }).from(recorrencias).where(eq(recorrencias.categoriaId, id)).limit(1);
  if (l || r) {
    await db.update(categorias).set({ ativo: false }).where(eq(categorias.id, id));
    revalidar();
    return { ok: true, desativada: true };
  }
  await db.delete(categorias).where(eq(categorias.id, id));
  revalidar();
  return { ok: true };
}

/* ---------- Taxas da maquininha ---------- */

export async function salvarTaxas(_prev: ConfigState, form: FormData): Promise<ConfigState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const ler = (k: string) => {
    const t = f(form, k).replace("%", "");
    const n = t ? parseValor(t) : 0;
    return Number.isFinite(n) && n >= 0 && n <= 30 ? Math.round(n * 100) / 100 : NaN;
  };
  const taxas = { debito: ler("debito"), credito: ler("credito"), creditoParcelado: ler("creditoParcelado") };
  if (Object.values(taxas).some((n) => Number.isNaN(n))) return { erro: "Informe as taxas em %, entre 0 e 30" };
  const db = await getDb();
  await db.update(oficinas).set({ taxasCartao: taxas }).where(eq(oficinas.id, ctx.oficina.id));
  revalidar();
  revalidatePath("/ordens-servico", "layout");
  return { ok: true };
}
