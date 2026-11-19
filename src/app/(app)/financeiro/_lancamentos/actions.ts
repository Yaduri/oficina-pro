"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { ehUuid } from "@/lib/os-acesso";
import { chaveValida } from "@/lib/storage";
import { DIA_RE } from "@/lib/agenda-datas";
import {
  centavos,
  criarLancamentos,
  dividirParcelas,
  ehForma,
  estornarBaixa,
  gerarRecorrencias,
  hojeSP,
  reais,
  registrarBaixa,
  somarMeses,
  type TipoLancamento,
} from "@/lib/financeiro";
import { parseValor } from "@/lib/utils";
import { cancelarPendentesDoLancamento } from "@/lib/cobranca";

export type AcaoState = { erro?: string; ok?: boolean; id?: string } | undefined;

const { lancamentos: l, baixas, categoriasFinanceiras: cat, contasFinanceiras: contas, clientes, recorrencias } = schema;

const SEM_PERMISSAO = { erro: "Seu usuário não tem permissão para o financeiro" };
const NAO_ENCONTRADO = { erro: "Lançamento não encontrado" };
const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const MAX_PARCELAS = 60;

/** Erro de validação dentro da transação (desfaz tudo) */
class Recusa extends Error {}

async function contexto() {
  const ctx = await getContexto();
  if (!ctx.pode("financeiro")) return null;
  return { ctx, db: await getDb(), oficinaId: ctx.oficina.id };
}

function revalidar() {
  revalidatePath("/financeiro", "layout");
}

/** Conta a receber cancelada ou quitada por aqui: cobranças online pendentes deixam de valer (fora da transação) */
async function encerrarCobrancas(db: DB, oficinaId: string, id: string) {
  const [x] = await db
    .select({ tipo: l.tipo, status: l.status, valor: l.valor, valorPago: l.valorPago })
    .from(l)
    .where(and(eq(l.id, id), eq(l.oficinaId, oficinaId)));
  if (x?.tipo !== "receber") return;
  // Quitada, cancelada, ou o valor em aberto mudou (baixa parcial/edição): a cobrança antiga não serve mais
  const aberto = x.status === "pago" || x.status === "cancelado" ? null : centavos(x.valor) - centavos(x.valorPago);
  await cancelarPendentesDoLancamento(oficinaId, id, aberto).catch(() => undefined);
}

function dataValida(v: string) {
  if (!DIA_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Valor em reais do formulário → centavos (NaN se inválido) */
function valorCentavos(v: string, opcional = false) {
  if (!v) return opcional ? 0 : NaN;
  const n = parseValor(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/* ---------- Campos comuns (novo e edição) ---------- */

type Campos = {
  descricao: string;
  valor: number;
  categoriaId: string | null;
  clienteId: string | null;
  fornecedor: string | null;
  contaId: string | null;
  forma: string | null;
  vencimento: string;
  competencia: string | null;
  centroCusto: string | null;
  observacao: string | null;
  anexoKey: string | null;
};

async function lerCampos(db: DB, oficinaId: string, tipo: TipoLancamento, form: FormData): Promise<{ erro: string } | { ok: Campos }> {
  const descricao = f(form, "descricao").slice(0, 200);
  if (descricao.length < 2) return { erro: "Informe a descrição" };
  const valor = valorCentavos(f(form, "valor"));
  if (!Number.isFinite(valor) || valor <= 0) return { erro: "Informe um valor maior que zero" };
  if (valor > 100_000_000_00) return { erro: "Valor muito alto" };

  const categoriaId = f(form, "categoriaId");
  if (!ehUuid(categoriaId)) return { erro: "Escolha a categoria" };
  const [c] = await db
    .select({ id: cat.id })
    .from(cat)
    .where(and(eq(cat.id, categoriaId), eq(cat.oficinaId, oficinaId), eq(cat.tipo, tipo === "receber" ? "receita" : "despesa")));
  if (!c) return { erro: "Categoria inválida" };

  let clienteId: string | null = null;
  let fornecedor: string | null = null;
  if (tipo === "receber") {
    const cid = f(form, "clienteId");
    if (cid) {
      if (!ehUuid(cid)) return { erro: "Cliente inválido" };
      const [cli] = await db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, cid), eq(clientes.oficinaId, oficinaId)));
      if (!cli) return { erro: "Cliente não encontrado" };
      clienteId = cli.id;
    }
  } else {
    fornecedor = f(form, "fornecedor").slice(0, 120) || null;
  }

  let contaId: string | null = null;
  const contaTxt = f(form, "contaId");
  if (contaTxt) {
    if (!ehUuid(contaTxt)) return { erro: "Conta inválida" };
    const [ct] = await db.select({ id: contas.id }).from(contas).where(and(eq(contas.id, contaTxt), eq(contas.oficinaId, oficinaId)));
    if (!ct) return { erro: "Conta não encontrada" };
    contaId = ct.id;
  }

  const formaTxt = f(form, "forma");
  if (formaTxt && !ehForma(formaTxt)) return { erro: "Forma de pagamento inválida" };

  const vencimento = f(form, "vencimento");
  if (!dataValida(vencimento)) return { erro: "Informe a data de vencimento" };
  const competencia = f(form, "competencia");
  if (competencia && !dataValida(competencia)) return { erro: "Data de competência inválida" };

  const anexoKey = f(form, "anexoKey");
  if (anexoKey && (!chaveValida(anexoKey) || !anexoKey.startsWith(`${oficinaId}/financeiro/`))) return { erro: "Anexo inválido" };

  return {
    ok: {
      descricao,
      valor,
      categoriaId: c.id,
      clienteId,
      fornecedor,
      contaId,
      forma: formaTxt || null,
      vencimento,
      competencia: competencia || null,
      centroCusto: f(form, "centroCusto").slice(0, 80) || null,
      observacao: f(form, "observacao").slice(0, 1000) || null,
      anexoKey: anexoKey || null,
    },
  };
}

/* ---------- Novo lançamento ---------- */

export async function criarLancamento(tipo: TipoLancamento, _prev: AcaoState, form: FormData): Promise<AcaoState> {
  const c = await contexto();
  if (!c) return SEM_PERMISSAO;
  const { ctx, db, oficinaId } = c;
  if (tipo !== "receber" && tipo !== "pagar") return { erro: "Tipo inválido" };

  const lido = await lerCampos(db, oficinaId, tipo, form);
  if ("erro" in lido) return lido;
  const d = lido.ok;

  const modo = f(form, "modo");
  if (modo !== "unica" && modo !== "parcelada" && modo !== "recorrente") return { erro: "Escolha como é o lançamento" };
  const jaPago = form.get("jaPago") === "on";
  if (jaPago && !d.contaId) return { erro: "Escolha a conta em que o pagamento foi feito" };

  const base = {
    oficinaId,
    tipo,
    descricao: d.descricao,
    categoriaId: d.categoriaId,
    contaId: d.contaId,
    clienteId: d.clienteId,
    fornecedor: d.fornecedor,
    centroCusto: d.centroCusto,
    forma: d.forma,
    observacao: d.observacao,
    criadoPor: ctx.userId,
  };

  /* Recorrente: grava a regra e gera os meses (até o fim do mês que vem) */
  if (modo === "recorrente") {
    const fim = f(form, "recFim");
    if (fim && !dataValida(fim)) return { erro: "Data final da recorrência inválida" };
    if (fim && fim < d.vencimento) return { erro: "A data final deve ser depois do primeiro vencimento" };
    const [r] = await db
      .insert(recorrencias)
      .values({
        oficinaId,
        tipo,
        descricao: d.descricao,
        categoriaId: d.categoriaId,
        contaId: d.contaId,
        fornecedor: d.fornecedor,
        clienteId: d.clienteId,
        forma: d.forma,
        centroCusto: d.centroCusto,
        observacao: d.observacao,
        valor: reais(d.valor),
        dia: Number(d.vencimento.slice(8, 10)),
        inicio: d.vencimento,
        fim: fim || null,
      })
      .returning({ id: recorrencias.id });
    await gerarRecorrencias(oficinaId);

    // A regra já leva cliente, forma, centro de custo e observação; aqui só autor, anexo e competência do 1º mês
    const gerados = await db
      .select({ id: l.id, vencimento: l.vencimento })
      .from(l)
      .where(and(eq(l.oficinaId, oficinaId), eq(l.recorrenciaId, r.id)))
      .orderBy(l.vencimento);
    if (gerados.length) {
      await db
        .update(l)
        .set({ criadoPor: ctx.userId })
        .where(and(eq(l.oficinaId, oficinaId), eq(l.recorrenciaId, r.id)));
      const primeiro = gerados[0];
      await db
        .update(l)
        .set({ anexoKey: d.anexoKey, ...(d.competencia ? { competencia: d.competencia } : {}) })
        .where(eq(l.id, primeiro.id));
      if (jaPago) {
        const erro = await db.transaction(async (txRaw) => {
          const tx = txRaw as unknown as DB;
          const res = await registrarBaixa(tx, {
            oficinaId,
            lancamentoId: primeiro.id,
            contaId: d.contaId!,
            data: hojeSP(),
            valor: d.valor,
            forma: d.forma,
            criadoPor: ctx.userId,
          });
          return "erro" in res ? res.erro : null;
        });
        if (erro) return { erro: `Conta recorrente criada, mas não foi possível registrar o pagamento: ${erro}` };
      }
    }
    revalidar();
    return { ok: true, id: gerados[0]?.id };
  }

  /* Única ou parcelada */
  let n = 1;
  if (modo === "parcelada") {
    n = Number(f(form, "parcelas"));
    if (!Number.isInteger(n) || n < 2 || n > MAX_PARCELAS) return { erro: `Parcelas: de 2 a ${MAX_PARCELAS}` };
  }
  const valores = dividirParcelas(d.valor, n);
  const dia = Number(d.vencimento.slice(8, 10));
  const parcelas = valores.map((valor, i) => ({ valor, vencimento: i === 0 ? d.vencimento : somarMeses(d.vencimento, i, dia) }));

  try {
    const id = await db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as DB;
      const criados = await criarLancamentos(tx, { ...base, competencia: d.competencia ?? undefined }, parcelas);
      // Anexo (boleto/nota) vai em todas as parcelas
      if (d.anexoKey) {
        await tx.update(l).set({ anexoKey: d.anexoKey }).where(inArray(l.id, criados.map((x) => x.id)));
      }
      if (jaPago) {
        const res = await registrarBaixa(tx, {
          oficinaId,
          lancamentoId: criados[0].id,
          contaId: d.contaId!,
          data: hojeSP(),
          valor: valores[0],
          forma: d.forma,
          criadoPor: ctx.userId,
        });
        if ("erro" in res) throw new Recusa(res.erro);
      }
      return criados[0].id;
    });
    revalidar();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof Recusa) return { erro: e.message };
    throw e;
  }
}

/* ---------- Edição ---------- */

export async function editarLancamento(id: string, _prev: AcaoState, form: FormData): Promise<AcaoState> {
  const c = await contexto();
  if (!c) return SEM_PERMISSAO;
  const { db, oficinaId } = c;
  if (!ehUuid(id)) return NAO_ENCONTRADO;
  const [atual] = await db.select().from(l).where(and(eq(l.id, id), eq(l.oficinaId, oficinaId)));
  if (!atual) return NAO_ENCONTRADO;
  if (atual.status === "pago" || atual.status === "cancelado") return { erro: "Só é possível editar lançamentos em aberto" };

  const lido = await lerCampos(db, oficinaId, atual.tipo, form);
  if ("erro" in lido) return lido;
  const d = lido.ok;
  const pago = centavos(atual.valorPago);
  if (d.valor < pago) return { erro: "O valor não pode ficar menor que o já pago. Estorne um pagamento antes." };

  await db
    .update(l)
    .set({
      descricao: d.descricao,
      valor: reais(d.valor),
      categoriaId: d.categoriaId,
      clienteId: d.clienteId,
      fornecedor: d.fornecedor,
      contaId: d.contaId,
      forma: d.forma,
      vencimento: d.vencimento,
      competencia: d.competencia ?? d.vencimento,
      centroCusto: d.centroCusto,
      observacao: d.observacao,
      anexoKey: d.anexoKey,
      status: pago === 0 ? "aberto" : pago >= d.valor ? "pago" : "parcial",
    })
    .where(eq(l.id, id));
  await encerrarCobrancas(db, oficinaId, id);
  revalidar();
  return { ok: true, id };
}

/* ---------- Cancelar / reabrir ---------- */

export async function cancelarLancamento(id: string): Promise<AcaoState> {
  const c = await contexto();
  if (!c) return SEM_PERMISSAO;
  const { db, oficinaId } = c;
  if (!ehUuid(id)) return NAO_ENCONTRADO;
  const [atual] = await db.select().from(l).where(and(eq(l.id, id), eq(l.oficinaId, oficinaId)));
  if (!atual) return NAO_ENCONTRADO;
  if (atual.status === "cancelado") return { ok: true };
  const [ativa] = await db
    .select({ id: baixas.id })
    .from(baixas)
    .where(and(eq(baixas.lancamentoId, id), isNull(baixas.estornadaEm)))
    .limit(1);
  if (ativa || centavos(atual.valorPago) > 0) return { erro: "Este lançamento tem pagamentos. Estorne-os antes de cancelar." };
  await db.update(l).set({ status: "cancelado" }).where(eq(l.id, id));
  await encerrarCobrancas(db, oficinaId, id);
  revalidar();
  return { ok: true };
}

export async function reabrirLancamento(id: string): Promise<AcaoState> {
  const c = await contexto();
  if (!c) return SEM_PERMISSAO;
  const { db, oficinaId } = c;
  if (!ehUuid(id)) return NAO_ENCONTRADO;
  const [atual] = await db.select().from(l).where(and(eq(l.id, id), eq(l.oficinaId, oficinaId)));
  if (!atual) return NAO_ENCONTRADO;
  if (atual.status !== "cancelado") return { ok: true };
  const pago = centavos(atual.valorPago);
  await db
    .update(l)
    .set({ status: pago === 0 ? "aberto" : pago >= centavos(atual.valor) ? "pago" : "parcial" })
    .where(eq(l.id, id));
  revalidar();
  return { ok: true };
}

/* ---------- Baixa (pagamento) e estorno ---------- */

export async function baixarLancamento(id: string, _prev: AcaoState, form: FormData): Promise<AcaoState> {
  const c = await contexto();
  if (!c) return SEM_PERMISSAO;
  const { ctx, db, oficinaId } = c;
  if (!ehUuid(id)) return NAO_ENCONTRADO;
  const [atual] = await db.select({ tipo: l.tipo }).from(l).where(and(eq(l.id, id), eq(l.oficinaId, oficinaId)));
  if (!atual) return NAO_ENCONTRADO;

  const data = f(form, "data");
  if (!dataValida(data)) return { erro: "Informe a data do pagamento" };
  if (data > hojeSP()) return { erro: "A data do pagamento não pode ser no futuro" };
  const contaId = f(form, "contaId");
  if (!ehUuid(contaId)) return { erro: "Escolha a conta" };
  const forma = f(form, "forma");
  if (forma && !ehForma(forma)) return { erro: "Forma de pagamento inválida" };

  const valor = valorCentavos(f(form, "valor"));
  const juros = valorCentavos(f(form, "juros"), true);
  const multa = valorCentavos(f(form, "multa"), true);
  const desconto = valorCentavos(f(form, "desconto"), true);
  const taxa = atual.tipo === "receber" ? valorCentavos(f(form, "taxa"), true) : 0;
  if (!Number.isFinite(valor) || valor <= 0) return { erro: "Informe o valor pago" };
  if ([juros, multa, desconto, taxa].some((v) => !Number.isFinite(v) || v < 0)) return { erro: "Juros, multa, desconto e taxa não podem ser negativos" };
  if (desconto + taxa > valor + juros + multa) return { erro: "Desconto e taxa passam do valor pago" };

  try {
    await db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as DB;
      const res = await registrarBaixa(tx, {
        oficinaId,
        lancamentoId: id,
        contaId,
        data,
        valor,
        juros,
        multa,
        desconto,
        taxa,
        forma: forma || null,
        observacao: f(form, "observacao").slice(0, 500) || null,
        criadoPor: ctx.userId,
      });
      if ("erro" in res) throw new Recusa(res.erro);
    });
  } catch (e) {
    if (e instanceof Recusa) return { erro: e.message };
    throw e;
  }
  await encerrarCobrancas(db, oficinaId, id);
  revalidar();
  return { ok: true };
}

export async function estornarPagamento(baixaId: string): Promise<AcaoState> {
  const c = await contexto();
  if (!c) return SEM_PERMISSAO;
  const { ctx, db, oficinaId } = c;
  if (!ehUuid(baixaId)) return { erro: "Pagamento não encontrado" };
  const res = await db.transaction(async (txRaw) => estornarBaixa(txRaw as unknown as DB, oficinaId, baixaId, ctx.userId));
  if ("erro" in res) return { erro: res.erro };
  revalidar();
  return { ok: true };
}

/* ---------- Recorrências ---------- */

export async function alterarRecorrencia(id: string, acao: "pausar" | "retomar" | "encerrar"): Promise<AcaoState> {
  const c = await contexto();
  if (!c) return SEM_PERMISSAO;
  const { db, oficinaId } = c;
  if (!ehUuid(id)) return { erro: "Recorrência não encontrada" };
  const [r] = await db.select().from(recorrencias).where(and(eq(recorrencias.id, id), eq(recorrencias.oficinaId, oficinaId)));
  if (!r) return { erro: "Recorrência não encontrada" };
  const hoje = hojeSP();

  if (acao === "pausar") {
    await db.update(recorrencias).set({ ativo: false }).where(eq(recorrencias.id, id));
  } else if (acao === "retomar") {
    if (r.fim && r.fim < hoje) return { erro: "Esta recorrência já foi encerrada" };
    // Não gera os meses em que ficou pausada: recomeça no mês atual
    const mesPassado = somarMeses(`${hoje.slice(0, 7)}-01`, -1, 1);
    await db
      .update(recorrencias)
      .set({ ativo: true, geradoAte: !r.geradoAte || r.geradoAte < mesPassado ? mesPassado : r.geradoAte })
      .where(eq(recorrencias.id, id));
    await gerarRecorrencias(oficinaId);
  } else {
    await db.update(recorrencias).set({ ativo: false, fim: hoje }).where(eq(recorrencias.id, id));
    // Meses futuros já gerados e sem pagamento são cancelados
    const cancelados = await db
      .update(l)
      .set({ status: "cancelado" })
      .where(
        and(
          eq(l.oficinaId, oficinaId),
          eq(l.recorrenciaId, id),
          eq(l.status, "aberto"),
          gt(l.vencimento, hoje),
          sql`${l.valorPago} = 0`,
        ),
      )
      .returning({ id: l.id });
    if (r.tipo === "receber") for (const x of cancelados) await cancelarPendentesDoLancamento(oficinaId, x.id).catch(() => undefined);
  }
  revalidar();
  return { ok: true };
}
