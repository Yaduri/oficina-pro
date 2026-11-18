import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { centavos, FORMAS, hojeSP, listarCategorias, listarContas, somarDiasData, type TipoLancamento } from "@/lib/financeiro";

/*
 * Consultas das telas "A receber" e "A pagar" (lista, resumo, detalhe, recorrências)
 * e dos alertas de vencimento do sino.
 */

const { lancamentos: l, baixas, categoriasFinanceiras: cat, contasFinanceiras: contas, clientes, ordensServico: os, recorrencias } = schema;

export const FILTROS_STATUS = {
  abertas: "Em aberto",
  vencidas: "Vencidas",
  pagas: "Pagas",
  canceladas: "Canceladas",
  todas: "Todas",
} as const;
export type FiltroStatus = keyof typeof FILTROS_STATUS;
export const ehFiltroStatus = (v: string): v is FiltroStatus => Object.hasOwn(FILTROS_STATUS, v);

export type FiltrosLancamentos = {
  status: FiltroStatus;
  de?: string;
  ate?: string;
  categoriaId?: string;
  busca?: string;
};

const EM_ABERTO = ["aberto", "parcial"] as ("aberto" | "parcial")[];
/** Valor em aberto (principal) da linha */
const restante = sql<string>`(${l.valor} - ${l.valorPago})`;

export const LIMITE_LISTA = 300;

export async function listarLancamentos(oficinaId: string, tipo: TipoLancamento, f: FiltrosLancamentos) {
  const db = await getDb();
  const hoje = hojeSP();
  const filtros: SQL[] = [eq(l.oficinaId, oficinaId), eq(l.tipo, tipo)];
  if (f.status === "abertas") filtros.push(inArray(l.status, EM_ABERTO));
  if (f.status === "vencidas") filtros.push(inArray(l.status, EM_ABERTO), lt(l.vencimento, hoje));
  if (f.status === "pagas") filtros.push(eq(l.status, "pago"));
  if (f.status === "canceladas") filtros.push(eq(l.status, "cancelado"));
  if (f.de) filtros.push(gte(l.vencimento, f.de));
  if (f.ate) filtros.push(lte(l.vencimento, f.ate));
  if (f.categoriaId) filtros.push(eq(l.categoriaId, f.categoriaId));
  if (f.busca) {
    const termo = `%${f.busca.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    filtros.push(or(ilike(l.descricao, termo), ilike(l.fornecedor, termo), ilike(clientes.nome, termo))!);
  }

  return db
    .select({
      id: l.id,
      descricao: l.descricao,
      valor: l.valor,
      valorPago: l.valorPago,
      vencimento: l.vencimento,
      parcela: l.parcela,
      parcelas: l.parcelas,
      status: l.status,
      fornecedor: l.fornecedor,
      osId: l.osId,
      osNumero: os.numero,
      cliente: clientes.nome,
      categoria: cat.nome,
      anexoKey: l.anexoKey,
      recorrenciaId: l.recorrenciaId,
    })
    .from(l)
    .leftJoin(cat, eq(cat.id, l.categoriaId))
    .leftJoin(clientes, eq(clientes.id, l.clienteId))
    .leftJoin(os, eq(os.id, l.osId))
    .where(and(...filtros))
    .orderBy(f.status === "pagas" ? desc(l.vencimento) : asc(l.vencimento), asc(l.parcela), asc(l.criadoEm))
    .limit(LIMITE_LISTA);
}

/** Totais dos cartões do topo (centavos). "Pago" = baixas com data no período (padrão: mês atual). */
export async function resumoLancamentos(oficinaId: string, tipo: TipoLancamento, periodo: { de: string; ate: string }) {
  const db = await getDb();
  const hoje = hojeSP();
  const [r] = await db
    .select({
      aberto: sql<string>`coalesce(sum(${restante}), 0)`,
      qtdAberto: sql<number>`count(*)::int`,
      vencido: sql<string>`coalesce(sum(case when ${l.vencimento} < ${hoje} then ${restante} else 0 end), 0)`,
      qtdVencido: sql<number>`count(*) filter (where ${l.vencimento} < ${hoje})::int`,
      hoje: sql<string>`coalesce(sum(case when ${l.vencimento} = ${hoje} then ${restante} else 0 end), 0)`,
      qtdHoje: sql<number>`count(*) filter (where ${l.vencimento} = ${hoje})::int`,
    })
    .from(l)
    .where(and(eq(l.oficinaId, oficinaId), eq(l.tipo, tipo), inArray(l.status, EM_ABERTO)));

  const [p] = await db
    .select({ total: sql<string>`coalesce(sum(${baixas.valor}), 0)` })
    .from(baixas)
    .innerJoin(l, eq(l.id, baixas.lancamentoId))
    .where(
      and(
        eq(baixas.oficinaId, oficinaId),
        eq(l.tipo, tipo),
        isNull(baixas.estornadaEm),
        gte(baixas.data, periodo.de),
        lte(baixas.data, periodo.ate),
      ),
    );

  return {
    aberto: centavos(r?.aberto),
    qtdAberto: r?.qtdAberto ?? 0,
    vencido: centavos(r?.vencido),
    qtdVencido: r?.qtdVencido ?? 0,
    hoje: centavos(r?.hoje),
    qtdHoje: r?.qtdHoje ?? 0,
    pago: centavos(p?.total),
  };
}

/** Lançamento com nomes relacionados, baixas e as outras parcelas do grupo */
export async function detalheLancamento(oficinaId: string, id: string) {
  const db = await getDb();
  const [item] = await db
    .select({
      l,
      categoria: cat.nome,
      conta: contas.nome,
      cliente: clientes.nome,
      osNumero: os.numero,
      recorrencia: recorrencias,
    })
    .from(l)
    .leftJoin(cat, eq(cat.id, l.categoriaId))
    .leftJoin(contas, eq(contas.id, l.contaId))
    .leftJoin(clientes, eq(clientes.id, l.clienteId))
    .leftJoin(os, eq(os.id, l.osId))
    .leftJoin(recorrencias, eq(recorrencias.id, l.recorrenciaId))
    .where(and(eq(l.id, id), eq(l.oficinaId, oficinaId)));
  if (!item) return null;

  const listaBaixas = await db
    .select({ b: baixas, conta: contas.nome })
    .from(baixas)
    .leftJoin(contas, eq(contas.id, baixas.contaId))
    .where(and(eq(baixas.lancamentoId, id), eq(baixas.oficinaId, oficinaId)))
    .orderBy(asc(baixas.data), asc(baixas.criadoEm));

  const grupo =
    item.l.grupo && item.l.parcelas > 1
      ? await db
          .select({ id: l.id, parcela: l.parcela, parcelas: l.parcelas, valor: l.valor, vencimento: l.vencimento, status: l.status })
          .from(l)
          .where(and(eq(l.oficinaId, oficinaId), eq(l.grupo, item.l.grupo)))
          .orderBy(asc(l.parcela))
      : [];

  return { ...item, baixas: listaBaixas, grupo };
}

export async function listarRecorrencias(oficinaId: string, tipo: TipoLancamento) {
  const db = await getDb();
  const hoje = hojeSP();
  return db
    .select({ r: recorrencias, categoria: cat.nome })
    .from(recorrencias)
    .leftJoin(cat, eq(cat.id, recorrencias.categoriaId))
    .where(
      and(
        eq(recorrencias.oficinaId, oficinaId),
        eq(recorrencias.tipo, tipo),
        // Encerradas há tempo não aparecem
        or(isNull(recorrencias.fim), gte(recorrencias.fim, somarDiasData(hoje, -60))),
      ),
    )
    .orderBy(desc(recorrencias.ativo), asc(recorrencias.dia), asc(recorrencias.descricao));
}

/** Fornecedores e centros de custo já usados (sugestões nos campos de texto) */
export async function sugestoesTexto(oficinaId: string) {
  const db = await getDb();
  const [forn, cc] = await Promise.all([
    db
      .selectDistinct({ v: l.fornecedor })
      .from(l)
      .where(and(eq(l.oficinaId, oficinaId), sql`${l.fornecedor} is not null and ${l.fornecedor} <> ''`))
      .orderBy(asc(l.fornecedor))
      .limit(200),
    db
      .selectDistinct({ v: l.centroCusto })
      .from(l)
      .where(and(eq(l.oficinaId, oficinaId), sql`${l.centroCusto} is not null and ${l.centroCusto} <> ''`))
      .orderBy(asc(l.centroCusto))
      .limit(100),
  ]);
  return { fornecedores: forn.map((x) => x.v!), centrosCusto: cc.map((x) => x.v!) };
}

/** Clientes ativos (e o já escolhido no lançamento, mesmo arquivado) */
export async function listarClientesSelect(oficinaId: string, incluir?: string | null) {
  const db = await getDb();
  const ativos = isNull(clientes.arquivadoEm);
  return db
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(and(eq(clientes.oficinaId, oficinaId), incluir ? or(ativos, eq(clientes.id, incluir)) : ativos))
    .orderBy(asc(clientes.nome))
    .limit(1000);
}

/** Listas para os formulários de lançamento e de pagamento */
export async function opcoesFormulario(oficinaId: string, tipo: TipoLancamento, clienteAtual?: string | null) {
  const [categorias, contasLista, clientesLista, sug] = await Promise.all([
    listarCategorias(oficinaId, tipo === "receber" ? "receita" : "despesa"),
    listarContas(oficinaId),
    tipo === "receber" ? listarClientesSelect(oficinaId, clienteAtual) : Promise.resolve([]),
    sugestoesTexto(oficinaId),
  ]);
  return {
    hoje: hojeSP(),
    categorias: categorias.map((c) => ({ id: c.id, nome: c.nome })),
    contas: contasLista.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
    clientes: clientesLista,
    fornecedores: sug.fornecedores,
    centrosCusto: sug.centrosCusto,
    formas: Object.entries(FORMAS).map(([valor, label]) => ({ valor, label })),
  };
}

/** Contagens e totais (centavos) para os alertas de vencimento do sino */
export async function alertasVencimento(oficinaId: string) {
  const db = await getDb();
  const hoje = hojeSP();
  const amanha = somarDiasData(hoje, 1);
  const linhas = await db
    .select({
      tipo: l.tipo,
      quando: sql<"vencida" | "hoje" | "amanha">`case when ${l.vencimento} < ${hoje} then 'vencida' when ${l.vencimento} = ${hoje} then 'hoje' else 'amanha' end`,
      qtd: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${restante}), 0)`,
    })
    .from(l)
    .where(and(eq(l.oficinaId, oficinaId), inArray(l.status, EM_ABERTO), lte(l.vencimento, amanha)))
    .groupBy(l.tipo, sql`2`);
  const pegar = (tipo: TipoLancamento, quando: "vencida" | "hoje" | "amanha") => {
    const x = linhas.find((r) => r.tipo === tipo && r.quando === quando);
    return { qtd: x?.qtd ?? 0, total: centavos(x?.total) };
  };
  return {
    hoje,
    amanha,
    pagarHoje: pegar("pagar", "hoje"),
    pagarAmanha: pegar("pagar", "amanha"),
    pagarVencidas: pegar("pagar", "vencida"),
    receberVencidas: pegar("receber", "vencida"),
  };
}
