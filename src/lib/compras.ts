import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import type { getContexto } from "@/lib/oficina";
import { registrarEvento } from "@/lib/os-acesso";
import { movimentar, proximoNumeroCompra, qtd } from "@/lib/estoque";
import { FORMAS, criarLancamentos, ehForma, hojeSP, listarContas, reais, registrarBaixa } from "@/lib/financeiro";
import { DIA_RE } from "@/lib/agenda-datas";

/*
 * Compras (Fase 4). Regras:
 * - Pedido: só registra o que foi pedido (não mexe em estoque nem no financeiro).
 * - Receber (pedido → recebida), numa transação só: acerta quantidades e valores, rateia frete,
 *   outras despesas e desconto no custo de cada item, dá entrada no estoque (custo médio),
 *   gera as contas a pagar (ou a conta já paga, com a baixa) e avisa no histórico da OS.
 * - Rateio: proporcional ao valor de cada item; na importação do XML, usa o custo de cada item
 *   da nota (vProd − vDesc + vFrete + vSeg + vOutro + vIPI + vICMSST).
 * - Estornar entrada (recebida → cancelada): tira do estoque o que entrou e cancela as contas
 *   a pagar; recusa se alguma já tem pagamento (estorne o pagamento antes).
 * Dinheiro em centavos nas contas; categoria e contas são lidas ANTES da transação
 * (no PGlite, uma consulta fora da transação aberta ficaria esperando por ela).
 */

const { compras, compraItens, fornecedores, catalogoItens: cat, lancamentos, baixas, estoqueMovimentos: mov, ordensServico } = schema;

export type Contexto = Awaited<ReturnType<typeof getContexto>>;
export type StatusCompra = "pedido" | "recebida" | "cancelada";

export const STATUS_COMPRA: Record<StatusCompra, { label: string; tom: "neutro" | "info" | "ok" | "warn" | "danger" }> = {
  pedido: { label: "Pedido", tom: "info" },
  recebida: { label: "Recebida", tom: "ok" },
  cancelada: { label: "Cancelada", tom: "neutro" },
};

/** Erro de validação dentro da transação (desfaz tudo) */
export class RecusaCompra extends Error {}

export const nomeFornecedor = (f: { nome: string; nomeFantasia: string | null } | null | undefined) => (f ? f.nomeFantasia || f.nome : null);

/** "AAAA-MM-DD" → "DD/MM/AAAA" */
export const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function diaValido(v: string) {
  if (!DIA_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "AAAA-MM-DD" → meio-dia em São Paulo (para colunas timestamp) */
export const meioDiaSP = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

/* ---------- Criar ---------- */

export type NovoItemCompra = {
  catalogoItemId: string | null;
  codigoFornecedor?: string | null;
  descricao: string;
  ncm?: string | null;
  gtin?: string | null;
  unidade?: string | null;
  /** Na unidade do catálogo */
  quantidade: number;
  /** Reais, na unidade do catálogo */
  valorUnitario: number;
};

export type NovaCompra = {
  fornecedorId: string | null;
  osId?: string | null;
  previsaoEm?: string | null;
  observacao?: string | null;
  itens: NovoItemCompra[];
  /** Centavos */
  frete: number;
  desconto: number;
  outros: number;
  notaNumero?: string | null;
  notaSerie?: string | null;
  notaChave?: string | null;
  notaEmissao?: string | null;
  xmlKey?: string | null;
};

const q3 = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3);
const c4 = (n: number) => (Math.round(n * 10000) / 10000).toFixed(4);
const valorItem = (quantidade: number, valorUnitario: number) => Math.round(quantidade * valorUnitario * 100);

/** Cria a compra como pedido (com os itens). Dentro de uma transação. */
export async function criarCompra(tx: DB, ctx: Contexto, c: NovaCompra) {
  const oficinaId = ctx.oficina.id;
  if (c.itens.length === 0) throw new RecusaCompra("Inclua ao menos um item");
  if (c.fornecedorId) {
    const [f] = await tx
      .select({ id: fornecedores.id })
      .from(fornecedores)
      .where(and(eq(fornecedores.id, c.fornecedorId), eq(fornecedores.oficinaId, oficinaId)));
    if (!f) throw new RecusaCompra("Fornecedor não encontrado");
  }
  if (c.osId) {
    const [o] = await tx
      .select({ id: ordensServico.id })
      .from(ordensServico)
      .where(and(eq(ordensServico.id, c.osId), eq(ordensServico.oficinaId, oficinaId)));
    if (!o) throw new RecusaCompra("OS não encontrada");
  }
  const ids = [...new Set(c.itens.map((i) => i.catalogoItemId).filter((x): x is string => !!x))];
  if (ids.length > 0) {
    const pecas = await tx
      .select({ id: cat.id })
      .from(cat)
      .where(and(eq(cat.oficinaId, oficinaId), inArray(cat.id, ids), eq(cat.tipo, "peca"), eq(cat.controlaEstoque, true)));
    if (pecas.length !== ids.length) throw new RecusaCompra("Alguma peça não foi encontrada ou não controla estoque");
  }
  for (const i of c.itens) {
    if (!(i.quantidade > 0)) throw new RecusaCompra(`Quantidade inválida em "${i.descricao}"`);
    if (!(i.valorUnitario >= 0)) throw new RecusaCompra(`Valor inválido em "${i.descricao}"`);
  }

  // Um número por vez por oficina
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`compras-numero:${oficinaId}`}))`);
  const numero = await proximoNumeroCompra(tx, oficinaId);
  const valorProdutos = c.itens.reduce((s, i) => s + valorItem(i.quantidade, i.valorUnitario), 0);
  const total = valorProdutos - c.desconto + c.frete + c.outros;
  const [nova] = await tx
    .insert(compras)
    .values({
      oficinaId,
      numero,
      status: "pedido",
      fornecedorId: c.fornecedorId,
      osId: c.osId ?? null,
      previsaoEm: c.previsaoEm ?? null,
      observacao: c.observacao ?? null,
      valorProdutos: reais(valorProdutos),
      frete: reais(c.frete),
      desconto: reais(c.desconto),
      outros: reais(c.outros),
      valorTotal: reais(Math.max(total, 0)),
      notaNumero: c.notaNumero ?? null,
      notaSerie: c.notaSerie ?? null,
      notaChave: c.notaChave ?? null,
      notaEmissao: c.notaEmissao ?? null,
      xmlKey: c.xmlKey ?? null,
      criadoPor: ctx.membro.nome || ctx.membro.email || null,
    })
    .returning({ id: compras.id, numero: compras.numero });
  const itens = await tx
    .insert(compraItens)
    .values(
      c.itens.map((i) => ({
        compraId: nova.id,
        catalogoItemId: i.catalogoItemId,
        codigoFornecedor: i.codigoFornecedor ?? null,
        descricao: i.descricao,
        ncm: i.ncm ?? null,
        gtin: i.gtin ?? null,
        unidade: i.unidade ?? null,
        quantidade: q3(i.quantidade),
        valorUnitario: c4(i.valorUnitario),
        custoUnitario: c4(i.valorUnitario),
      })),
    )
    .returning({ id: compraItens.id });
  return { id: nova.id, numero: nova.numero, itemIds: itens.map((i) => i.id) };
}

/* ---------- Receber ---------- */

export type ParcelaPagar = { valor: number; vencimento: string };

export type PagamentoCompra =
  /** Contas a pagar (parcelas em centavos) */
  | { modo: "prazo"; parcelas: ParcelaPagar[]; forma: string | null; contaId: string | null }
  /** Já paga: um lançamento quitado na data do recebimento */
  | { modo: "paga"; contaId: string; forma: string | null };

export type Recebimento = {
  /** Dia do recebimento (competência das contas a pagar) */
  data: string;
  notaNumero?: string | null;
  notaSerie?: string | null;
  notaEmissao?: string | null;
  /** Centavos */
  frete: number;
  desconto: number;
  outros: number;
  /** Ajustes por item (quantidade 0 = não veio; sai da compra) */
  itens?: { id: string; quantidade: number; valorUnitario: number }[];
  /** Custo total de cada item (centavos), quando vem do XML: substitui o rateio */
  custos?: Map<string, number>;
  /** Itens sem peça que não entram no estoque (importação: "ignorar") */
  semEstoque?: Set<string>;
  pagamento: PagamentoCompra;
  /** Categoria "Compra de peças" (ler antes da transação) */
  categoriaId: string | null;
};

/** Rateia `extra` (pode ser negativo) proporcionalmente aos valores; a sobra de centavos vai no maior */
export function ratear(valores: number[], extra: number) {
  const soma = valores.reduce((s, v) => s + v, 0);
  if (valores.length === 0) return [];
  const partes = valores.map((v) => (soma > 0 ? Math.round((extra * v) / soma) : Math.round(extra / valores.length)));
  const sobra = extra - partes.reduce((s, v) => s + v, 0);
  if (sobra !== 0) {
    const maior = valores.indexOf(Math.max(...valores));
    partes[maior] += sobra;
  }
  return partes;
}

/** Recebe a compra (ver regras no topo). Dentro de uma transação. */
export async function receberCompra(tx: DB, ctx: Contexto, compraId: string, r: Recebimento) {
  const oficinaId = ctx.oficina.id;
  const [c] = await tx
    .select()
    .from(compras)
    .where(and(eq(compras.id, compraId), eq(compras.oficinaId, oficinaId)))
    .for("update");
  if (!c) throw new RecusaCompra("Compra não encontrada");
  if (c.status !== "pedido") throw new RecusaCompra("Esta compra já foi recebida ou cancelada");
  if (!diaValido(r.data)) throw new RecusaCompra("Data de recebimento inválida");
  if (r.notaEmissao && !diaValido(r.notaEmissao)) throw new RecusaCompra("Data de emissão da nota inválida");
  if (r.frete < 0 || r.desconto < 0 || r.outros < 0) throw new RecusaCompra("Frete, desconto e outros não podem ser negativos");

  const atuais = await tx.select().from(compraItens).where(eq(compraItens.compraId, c.id)).orderBy(asc(compraItens.criadoEm));
  const ajustes = new Map((r.itens ?? []).map((i) => [i.id, i]));
  for (const id of ajustes.keys()) if (!atuais.some((a) => a.id === id)) throw new RecusaCompra("Item não encontrado na compra");

  const itens: { id: string; catalogoItemId: string | null; descricao: string; quantidade: number; valorUnitario: number }[] = [];
  for (const a of atuais) {
    const aj = ajustes.get(a.id);
    const quantidade = aj ? aj.quantidade : qtd(a.quantidade);
    const valorUnitario = aj ? aj.valorUnitario : Number(a.valorUnitario);
    if (!(quantidade >= 0) || !(valorUnitario >= 0)) throw new RecusaCompra(`Quantidade ou valor inválido em "${a.descricao}"`);
    if (quantidade === 0) {
      await tx.delete(compraItens).where(eq(compraItens.id, a.id));
      continue;
    }
    if (!a.catalogoItemId && !r.semEstoque?.has(a.id)) throw new RecusaCompra(`Escolha a peça do catálogo para "${a.descricao}"`);
    itens.push({ id: a.id, catalogoItemId: a.catalogoItemId, descricao: a.descricao, quantidade, valorUnitario });
  }
  if (itens.length === 0) throw new RecusaCompra("Nenhum item para receber");

  const valores = itens.map((i) => valorItem(i.quantidade, i.valorUnitario));
  const rateio = ratear(valores, r.frete + r.outros - r.desconto);
  const custos = itens.map((i, k) => Math.max(r.custos?.get(i.id) ?? valores[k] + rateio[k], 0));
  // Com o custo de cada item (XML), o total é a soma deles (bate com as duplicatas da nota)
  const total = r.custos ? custos.reduce((s, v) => s + v, 0) : valores.reduce((s, v) => s + v, 0) - r.desconto + r.frete + r.outros;
  const valorProdutos = total + r.desconto - r.frete - r.outros;
  if (total < 0) throw new RecusaCompra("O desconto passa do valor da compra");

  // Itens com os valores finais e o custo rateado
  for (const [k, i] of itens.entries()) {
    await tx
      .update(compraItens)
      .set({ quantidade: q3(i.quantidade), valorUnitario: c4(i.valorUnitario), custoUnitario: c4(custos[k] / 100 / i.quantidade) })
      .where(eq(compraItens.id, i.id));
  }

  const agora = new Date();
  const hoje = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  await tx
    .update(compras)
    .set({
      status: "recebida",
      recebidaEm: r.data === hoje ? agora : meioDiaSP(r.data),
      notaNumero: r.notaNumero !== undefined ? r.notaNumero : c.notaNumero,
      notaSerie: r.notaSerie !== undefined ? r.notaSerie : c.notaSerie,
      notaEmissao: r.notaEmissao !== undefined ? r.notaEmissao : c.notaEmissao,
      valorProdutos: reais(valorProdutos),
      frete: reais(r.frete),
      desconto: reais(r.desconto),
      outros: reais(r.outros),
      valorTotal: reais(total),
    })
    .where(eq(compras.id, c.id));

  // Estoque
  const por = ctx.membro.nome || ctx.membro.email || null;
  for (const [k, i] of itens.entries()) {
    if (!i.catalogoItemId) continue;
    const m = await movimentar(tx, {
      oficinaId,
      catalogoItemId: i.catalogoItemId,
      tipo: "entrada",
      quantidade: i.quantidade,
      custoUnitario: custos[k] / 100 / i.quantidade,
      compraId: c.id,
      motivo: null,
      criadoPor: por,
    });
    if (!m) throw new RecusaCompra(`A peça de "${i.descricao}" não controla estoque`);
  }

  // Financeiro
  const [forn] = c.fornecedorId
    ? await tx.select({ nome: fornecedores.nome, nomeFantasia: fornecedores.nomeFantasia }).from(fornecedores).where(eq(fornecedores.id, c.fornecedorId))
    : [];
  const fornecedor = nomeFornecedor(forn);
  const base = {
    oficinaId,
    tipo: "pagar" as const,
    descricao: fornecedor ? `Compra #${c.numero} · ${fornecedor}` : `Compra #${c.numero}`,
    categoriaId: r.categoriaId,
    fornecedor,
    osId: null,
    competencia: r.data,
    criadoPor: por,
  };
  const p = r.pagamento;
  const forma = p.forma && ehForma(p.forma) ? p.forma : null;
  let criados: { id: string }[] = [];
  if (total > 0) {
    if (p.modo === "prazo") {
      if (p.parcelas.length === 0 || p.parcelas.length > 60) throw new RecusaCompra("Informe as parcelas");
      for (const x of p.parcelas) {
        if (!(x.valor > 0)) throw new RecusaCompra("Cada parcela precisa de um valor");
        if (!diaValido(x.vencimento)) throw new RecusaCompra("Vencimento de parcela inválido");
      }
      const soma = p.parcelas.reduce((s, x) => s + x.valor, 0);
      if (soma !== total) {
        throw new RecusaCompra(`A soma das parcelas (R$ ${reais(soma).replace(".", ",")}) difere do total da compra (R$ ${reais(total).replace(".", ",")})`);
      }
      criados = await criarLancamentos(tx, { ...base, forma, contaId: p.contaId }, p.parcelas);
    } else {
      criados = await criarLancamentos(tx, { ...base, forma, contaId: p.contaId }, [{ valor: total, vencimento: r.data }]);
      const b = await registrarBaixa(tx, { oficinaId, lancamentoId: criados[0].id, contaId: p.contaId, data: r.data, valor: total, forma, criadoPor: por });
      if ("erro" in b) throw new RecusaCompra(b.erro);
    }
    await tx
      .update(lancamentos)
      .set({ fornecedorId: c.fornecedorId, compraId: c.id })
      .where(inArray(lancamentos.id, criados.map((x) => x.id)));
  }

  if (c.osId) await registrarEvento(tx, oficinaId, c.osId, `Peças do pedido #${c.numero} chegaram`, ctx);
  return { id: c.id, numero: c.numero, osId: c.osId };
}

/* ---------- Cancelar e estornar ---------- */

/** Pedido → cancelada (nada entrou no estoque nem no financeiro) */
export async function cancelarPedido(tx: DB, ctx: Contexto, compraId: string) {
  const [c] = await tx
    .select()
    .from(compras)
    .where(and(eq(compras.id, compraId), eq(compras.oficinaId, ctx.oficina.id)))
    .for("update");
  if (!c) throw new RecusaCompra("Compra não encontrada");
  if (c.status !== "pedido") throw new RecusaCompra("Só um pedido em aberto pode ser cancelado");
  await tx.update(compras).set({ status: "cancelada", canceladaEm: new Date() }).where(eq(compras.id, c.id));
  if (c.osId) await registrarEvento(tx, ctx.oficina.id, c.osId, `Pedido de compra #${c.numero} cancelado`, ctx);
  return c;
}

/** Recebida → cancelada: tira do estoque o que entrou e cancela as contas a pagar sem pagamento */
export async function estornarEntrada(tx: DB, ctx: Contexto, compraId: string) {
  const oficinaId = ctx.oficina.id;
  const [c] = await tx
    .select()
    .from(compras)
    .where(and(eq(compras.id, compraId), eq(compras.oficinaId, oficinaId)))
    .for("update");
  if (!c) throw new RecusaCompra("Compra não encontrada");
  if (c.status !== "recebida") throw new RecusaCompra("Só uma compra recebida pode ter a entrada estornada");

  const contas = await tx
    .select({ id: lancamentos.id, status: lancamentos.status })
    .from(lancamentos)
    .where(and(eq(lancamentos.compraId, c.id), eq(lancamentos.oficinaId, oficinaId)));
  if (contas.length > 0) {
    const [pagas] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(baixas)
      .where(and(inArray(baixas.lancamentoId, contas.map((x) => x.id)), isNull(baixas.estornadaEm)));
    if (Number(pagas?.n ?? 0) > 0) {
      throw new RecusaCompra("Esta compra já tem pagamento registrado. Estorne o pagamento nas contas a pagar antes de estornar a entrada.");
    }
    await tx
      .update(lancamentos)
      .set({ status: "cancelado" })
      .where(and(eq(lancamentos.compraId, c.id), eq(lancamentos.oficinaId, oficinaId), ne(lancamentos.status, "cancelado")));
  }

  // O que entrou (menos o que já foi estornado), por peça
  const saldos = await tx
    .select({
      catalogoItemId: mov.catalogoItemId,
      total: sql<string>`coalesce(sum(${mov.quantidade}), 0)`,
      custo: sql<string>`coalesce(sum(case when ${mov.tipo} = 'entrada' then ${mov.quantidade} * ${mov.custoUnitario} end) / nullif(sum(case when ${mov.tipo} = 'entrada' then ${mov.quantidade} end), 0), 0)`,
    })
    .from(mov)
    .where(and(eq(mov.compraId, c.id), inArray(mov.tipo, ["entrada", "estorno_compra"])))
    .groupBy(mov.catalogoItemId);
  const por = ctx.membro.nome || ctx.membro.email || null;
  for (const s of saldos) {
    const n = qtd(s.total);
    if (n <= 0) continue;
    await movimentar(tx, {
      oficinaId,
      catalogoItemId: s.catalogoItemId,
      tipo: "estorno_compra",
      quantidade: -n,
      custoUnitario: Number(s.custo),
      compraId: c.id,
      motivo: null,
      criadoPor: por,
    });
  }
  await tx.update(compras).set({ status: "cancelada", canceladaEm: new Date() }).where(eq(compras.id, c.id));
  if (c.osId) await registrarEvento(tx, oficinaId, c.osId, `Entrada da compra #${c.numero} estornada`, ctx);
  return c;
}

/* ---------- Consultas ---------- */

export const FILTROS_COMPRA = {
  abertos: "Pedidos em aberto",
  recebidas: "Recebidas",
  canceladas: "Canceladas",
  todas: "Todas",
} as const;
export type FiltroCompra = keyof typeof FILTROS_COMPRA;
export const ehFiltroCompra = (v: string): v is FiltroCompra => Object.hasOwn(FILTROS_COMPRA, v);

export async function listarCompras(oficinaId: string, filtro: { status: FiltroCompra; busca?: string; fornecedorId?: string }) {
  const db = await getDb();
  const w: SQL[] = [eq(compras.oficinaId, oficinaId)];
  if (filtro.status === "abertos") w.push(eq(compras.status, "pedido"));
  if (filtro.status === "recebidas") w.push(eq(compras.status, "recebida"));
  if (filtro.status === "canceladas") w.push(eq(compras.status, "cancelada"));
  if (filtro.fornecedorId) w.push(eq(compras.fornecedorId, filtro.fornecedorId));
  if (filtro.busca) {
    const t = `%${filtro.busca.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const n = Number(filtro.busca.replace(/^#/, ""));
    const ou = [ilike(fornecedores.nome, t), ilike(fornecedores.nomeFantasia, t), ilike(compras.notaNumero, t)];
    if (Number.isInteger(n) && n > 0) ou.push(eq(compras.numero, n));
    w.push(or(...ou)!);
  }
  return db
    .select({
      id: compras.id,
      numero: compras.numero,
      status: compras.status,
      fornecedor: fornecedores.nome,
      fornecedorFantasia: fornecedores.nomeFantasia,
      notaNumero: compras.notaNumero,
      criadoEm: compras.criadoEm,
      recebidaEm: compras.recebidaEm,
      previsaoEm: compras.previsaoEm,
      valorTotal: compras.valorTotal,
      osId: compras.osId,
      osNumero: ordensServico.numero,
    })
    .from(compras)
    .leftJoin(fornecedores, eq(fornecedores.id, compras.fornecedorId))
    .leftJoin(ordensServico, eq(ordensServico.id, compras.osId))
    .where(and(...w))
    .orderBy(desc(compras.numero))
    .limit(200);
}

export async function obterCompra(oficinaId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ c: compras, fornecedor: fornecedores, osNumero: ordensServico.numero, osStatus: ordensServico.status })
    .from(compras)
    .leftJoin(fornecedores, eq(fornecedores.id, compras.fornecedorId))
    .leftJoin(ordensServico, eq(ordensServico.id, compras.osId))
    .where(and(eq(compras.id, id), eq(compras.oficinaId, oficinaId)));
  if (!row) return null;
  const [itens, contas, movimentos] = await Promise.all([
    db
      .select({ i: compraItens, peca: cat.descricao, pecaCodigo: cat.codigo, unidade: cat.unidade })
      .from(compraItens)
      .leftJoin(cat, eq(cat.id, compraItens.catalogoItemId))
      .where(eq(compraItens.compraId, id))
      .orderBy(asc(compraItens.criadoEm)),
    db
      .select({
        id: lancamentos.id,
        descricao: lancamentos.descricao,
        valor: lancamentos.valor,
        valorPago: lancamentos.valorPago,
        vencimento: lancamentos.vencimento,
        status: lancamentos.status,
        parcela: lancamentos.parcela,
        parcelas: lancamentos.parcelas,
      })
      .from(lancamentos)
      .where(and(eq(lancamentos.compraId, id), eq(lancamentos.oficinaId, oficinaId)))
      .orderBy(asc(lancamentos.vencimento), asc(lancamentos.parcela)),
    db
      .select({ m: mov, peca: cat.descricao, unidade: cat.unidade })
      .from(mov)
      .innerJoin(cat, eq(cat.id, mov.catalogoItemId))
      .where(and(eq(mov.compraId, id), eq(mov.oficinaId, oficinaId)))
      .orderBy(asc(mov.criadoEm)),
  ]);
  return { ...row, itens, contas, movimentos };
}

/** Pedidos de compra ligados a uma OS (card da OS) */
export async function comprasDaOS(oficinaId: string, osId: string) {
  const db = await getDb();
  return db
    .select({
      id: compras.id,
      numero: compras.numero,
      status: compras.status,
      previsaoEm: compras.previsaoEm,
      recebidaEm: compras.recebidaEm,
      valorTotal: compras.valorTotal,
      fornecedor: fornecedores.nome,
      fornecedorFantasia: fornecedores.nomeFantasia,
    })
    .from(compras)
    .leftJoin(fornecedores, eq(fornecedores.id, compras.fornecedorId))
    .where(and(eq(compras.oficinaId, oficinaId), eq(compras.osId, osId)))
    .orderBy(desc(compras.numero));
}

export async function listarFornecedores(oficinaId: string, opcoes: { busca?: string; arquivados?: boolean } = {}) {
  const db = await getDb();
  const w: SQL[] = [eq(fornecedores.oficinaId, oficinaId), eq(fornecedores.ativo, !opcoes.arquivados)];
  if (opcoes.busca) {
    const t = `%${opcoes.busca.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const dig = opcoes.busca.replace(/\D/g, "");
    const ou = [ilike(fornecedores.nome, t), ilike(fornecedores.nomeFantasia, t), ilike(fornecedores.contato, t)];
    if (dig.length >= 3) ou.push(ilike(fornecedores.cpfCnpj, `%${dig}%`), ilike(fornecedores.telefone, `%${dig}%`));
    w.push(or(...ou)!);
  }
  return db
    .select()
    .from(fornecedores)
    .where(and(...w))
    .orderBy(asc(sql`coalesce(${fornecedores.nomeFantasia}, ${fornecedores.nome})`))
    .limit(300);
}

/** Opções de fornecedor para selects (ativos) */
export async function opcoesFornecedores(oficinaId: string) {
  const lista = await listarFornecedores(oficinaId);
  return lista.map((f) => ({ id: f.id, nome: nomeFornecedor(f)! }));
}

/** Peças que controlam estoque, para escolher nos itens da compra */
export async function pecasParaCompra(oficinaId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: cat.id,
      codigo: cat.codigo,
      descricao: cat.descricao,
      unidade: cat.unidade,
      custoMedio: cat.custoMedio,
      estoqueAtual: cat.estoqueAtual,
      gtin: cat.gtin,
    })
    .from(cat)
    .where(and(eq(cat.oficinaId, oficinaId), eq(cat.tipo, "peca"), eq(cat.controlaEstoque, true), eq(cat.ativo, true)))
    .orderBy(asc(cat.descricao));
  return rows.map((r) => ({ ...r, custoMedio: Number(r.custoMedio), estoqueAtual: qtd(r.estoqueAtual) }));
}
export type PecaCompra = Awaited<ReturnType<typeof pecasParaCompra>>[number];

/** OS em andamento (para ligar um pedido), mais recentes primeiro */
export async function osParaCompra(oficinaId: string, incluir?: string | null) {
  const db = await getDb();
  const v = schema.veiculos;
  const abertas = sql`${ordensServico.status} not in ('entregue', 'cancelada')`;
  return db
    .select({ id: ordensServico.id, numero: ordensServico.numero, placa: v.placa, modelo: v.modelo })
    .from(ordensServico)
    .innerJoin(v, eq(v.id, ordensServico.veiculoId))
    .where(and(eq(ordensServico.oficinaId, oficinaId), incluir ? or(abertas, eq(ordensServico.id, incluir)) : abertas))
    .orderBy(desc(ordensServico.numero))
    .limit(300);
}

/** Contas e formas para o pagamento da compra */
export async function opcoesPagamento(oficinaId: string) {
  const contas = await listarContas(oficinaId);
  return {
    contas: contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
    formas: Object.entries(FORMAS).map(([valor, label]) => ({ valor, label })),
    hoje: hojeSP(),
  };
}
