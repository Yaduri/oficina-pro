import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DIA_RE, diaSP, inicioDoDia } from "@/lib/agenda-datas";
import { GRUPOS_DRE, centavos, hojeSP, saldosDasContas, somarDiasData, somarMeses, type GrupoDre } from "@/lib/financeiro";
import { calcularTotais } from "@/lib/os-total";

/*
 * Relatórios do financeiro (2.4): fluxo de caixa, DRE simplificada e faturamento.
 * Valores sempre em centavos.
 */

const { lancamentos, baixas, categoriasFinanceiras: categorias, ordensServico: os, osItens, tecnicos, veiculos, clientes } = schema;

/* ---------- Período ---------- */

export const PRESETS = {
  mes: "Este mês",
  mes_passado: "Mês passado",
  "3meses": "Últimos 3 meses",
  ano: "Este ano",
  personalizado: "Personalizado",
} as const;
export type Preset = keyof typeof PRESETS;
export type Periodo = { preset: Preset; de: string; ate: string };

const fimDoMes = (inicio: string) => somarDiasData(somarMeses(inicio, 1), -1);

/** Lê o período dos parâmetros da URL (padrão: este mês) */
export function lerPeriodo(p: (k: string) => string, hoje = hojeSP()): Periodo {
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const preset = (Object.hasOwn(PRESETS, p("periodo")) ? p("periodo") : "mes") as Preset;
  if (preset === "mes_passado") {
    const ini = somarMeses(inicioMes, -1);
    return { preset, de: ini, ate: fimDoMes(ini) };
  }
  if (preset === "3meses") return { preset, de: somarMeses(inicioMes, -2), ate: fimDoMes(inicioMes) };
  if (preset === "ano") return { preset, de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
  if (preset === "personalizado") {
    // Data real (recusa 31/02 etc.)
    const valido = (v: string) => {
      if (!DIA_RE.test(v)) return false;
      const d = new Date(`${v}T12:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    };
    let de = valido(p("de")) ? p("de") : inicioMes;
    let ate = valido(p("ate")) ? p("ate") : fimDoMes(inicioMes);
    if (de > ate) [de, ate] = [ate, de];
    // Até 5 anos por consulta
    const limite = somarMeses(de, 60);
    if (ate > limite) ate = limite;
    return { preset, de, ate };
  }
  return { preset: "mes", de: inicioMes, ate: fimDoMes(inicioMes) };
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" */
export const dataBR = (dia: string) => dia.split("-").reverse().join("/");

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "AAAA-MM" → "nov/2026" */
export const mesBR = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;

/** "nov/2026" se for um mês inteiro; senão "01/11/2026 a 15/11/2026" */
export function rotuloPeriodo(de: string, ate: string) {
  if (de.endsWith("-01") && ate === fimDoMes(de)) return mesBR(de);
  if (de.endsWith("-01-01") && ate === `${de.slice(0, 4)}-12-31`) return de.slice(0, 4);
  return de === ate ? dataBR(de) : `${dataBR(de)} a ${dataBR(ate)}`;
}

/** Quantos dias tem o período (inclusive) */
export const diasNoPeriodo = (de: string, ate: string) =>
  Math.round((new Date(`${ate}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / 86_400_000) + 1;

/* ---------- Fluxo de caixa ---------- */

export type LinhaFluxo = {
  chave: string;
  rotulo: string;
  entradas: number;
  saidas: number;
  entradasPrev: number;
  saidasPrev: number;
  /** Saldo acumulado só com o realizado */
  saldo: number;
  /** Saldo acumulado com o realizado + o previsto em aberto */
  saldoProjetado: number;
};

/**
 * Realizado = baixas não estornadas pela data do pagamento
 *   (receber: valor + juros + multa − desconto − taxa; pagar: valor + juros + multa − desconto).
 * Previsto = o que falta pagar/receber dos lançamentos em aberto ou parciais, pelo vencimento.
 * Transferências entre contas não entram (não mudam o total).
 */
export async function fluxoDeCaixa(oficinaId: string, de: string, ate: string, por: "dia" | "mes") {
  const db = await getDb();
  const realizado = await db
    .select({
      data: baixas.data,
      tipo: lancamentos.tipo,
      valor: sql<string>`coalesce(sum(case when ${lancamentos.tipo} = 'receber'
        then ${baixas.valor} + ${baixas.juros} + ${baixas.multa} - ${baixas.desconto} - ${baixas.taxa}
        else ${baixas.valor} + ${baixas.juros} + ${baixas.multa} - ${baixas.desconto} end), 0)`,
    })
    .from(baixas)
    .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
    .where(and(eq(baixas.oficinaId, oficinaId), isNull(baixas.estornadaEm), gte(baixas.data, de), lte(baixas.data, ate)))
    .groupBy(baixas.data, lancamentos.tipo);

  const previsto = await db
    .select({
      data: lancamentos.vencimento,
      tipo: lancamentos.tipo,
      valor: sql<string>`coalesce(sum(${lancamentos.valor} - ${lancamentos.valorPago}), 0)`,
    })
    .from(lancamentos)
    .where(
      and(
        eq(lancamentos.oficinaId, oficinaId),
        inArray(lancamentos.status, ["aberto", "parcial"]),
        gte(lancamentos.vencimento, de),
        lte(lancamentos.vencimento, ate),
      ),
    )
    .groupBy(lancamentos.vencimento, lancamentos.tipo);

  const saldoInicial = (await saldosDasContas(oficinaId, somarDiasData(de, -1))).reduce((s, c) => s + c.saldo, 0);

  const chaveDe = (dia: string) => (por === "mes" ? dia.slice(0, 7) : dia);
  const mapa = new Map<string, LinhaFluxo>();
  const linha = (chave: string) => {
    let l = mapa.get(chave);
    if (!l) {
      l = { chave, rotulo: por === "mes" ? mesBR(chave) : dataBR(chave), entradas: 0, saidas: 0, entradasPrev: 0, saidasPrev: 0, saldo: 0, saldoProjetado: 0 };
      mapa.set(chave, l);
    }
    return l;
  };
  // Por mês: todos os meses do período aparecem, mesmo sem movimento
  if (por === "mes") {
    for (let m = `${de.slice(0, 7)}-01`; m <= ate; m = somarMeses(m, 1)) linha(m.slice(0, 7));
  }
  for (const r of realizado) {
    const l = linha(chaveDe(r.data));
    if (r.tipo === "receber") l.entradas += centavos(r.valor);
    else l.saidas += centavos(r.valor);
  }
  for (const r of previsto) {
    const l = linha(chaveDe(r.data));
    if (r.tipo === "receber") l.entradasPrev += centavos(r.valor);
    else l.saidasPrev += centavos(r.valor);
  }

  const linhas = [...mapa.values()].sort((a, b) => a.chave.localeCompare(b.chave));
  let saldo = saldoInicial;
  let projetado = saldoInicial;
  for (const l of linhas) {
    saldo += l.entradas - l.saidas;
    projetado += l.entradas - l.saidas + l.entradasPrev - l.saidasPrev;
    l.saldo = saldo;
    l.saldoProjetado = projetado;
  }
  const soma = (k: "entradas" | "saidas" | "entradasPrev" | "saidasPrev") => linhas.reduce((s, l) => s + l[k], 0);
  return {
    linhas,
    saldoInicial,
    totais: { entradas: soma("entradas"), saidas: soma("saidas"), entradasPrev: soma("entradasPrev"), saidasPrev: soma("saidasPrev") },
    saldoFinal: saldo,
    saldoProjetado: projetado,
  };
}

/* ---------- DRE simplificada ---------- */

export type LinhaDre = { rotulo: string; valor: number; nivel: "total" | "grupo" | "categoria" };

/**
 * DRE por competência: lançamentos não cancelados (inclusive os em aberto) com competência no período,
 * somados pelo grupo da DRE da categoria. Lançamento "pagar" num grupo de receita diminui a receita
 * (e "receber" num grupo de despesa diminui a despesa). Sem categoria: outras receitas/despesas.
 * As taxas de cartão descontadas nas baixas (data do recebimento no período) entram nas despesas financeiras.
 */
export async function dre(oficinaId: string, de: string, ate: string) {
  const db = await getDb();
  const rows = await db
    .select({
      grupo: categorias.grupoDre,
      categoria: categorias.nome,
      tipo: lancamentos.tipo,
      valor: sql<string>`coalesce(sum(${lancamentos.valor}), 0)`,
    })
    .from(lancamentos)
    .leftJoin(categorias, eq(categorias.id, lancamentos.categoriaId))
    .where(
      and(
        eq(lancamentos.oficinaId, oficinaId),
        ne(lancamentos.status, "cancelado"),
        gte(lancamentos.competencia, de),
        lte(lancamentos.competencia, ate),
      ),
    )
    .groupBy(categorias.grupoDre, categorias.nome, lancamentos.tipo);

  const [taxas] = await db
    .select({ total: sql<string>`coalesce(sum(${baixas.taxa}), 0)` })
    .from(baixas)
    .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
    .where(
      and(
        eq(baixas.oficinaId, oficinaId),
        eq(lancamentos.tipo, "receber"),
        isNull(baixas.estornadaEm),
        gte(baixas.data, de),
        lte(baixas.data, ate),
      ),
    );
  const taxasCartao = centavos(taxas?.total);

  const grupos = Object.fromEntries(
    (Object.keys(GRUPOS_DRE) as GrupoDre[]).map((g) => [g, { valor: 0, categorias: new Map<string, number>() }]),
  ) as Record<GrupoDre, { valor: number; categorias: Map<string, number> }>;

  for (const r of rows) {
    const grupo: GrupoDre =
      r.grupo && Object.hasOwn(GRUPOS_DRE, r.grupo) ? (r.grupo as GrupoDre) : r.tipo === "receber" ? "outras_receitas" : "outras_despesas";
    const ehReceita = GRUPOS_DRE[grupo].tipo === "receita";
    // Receita: receber soma, pagar subtrai. Despesa: pagar soma, receber subtrai.
    const v = centavos(r.valor) * ((r.tipo === "receber") === ehReceita ? 1 : -1);
    const nome = r.categoria ?? "Sem categoria";
    grupos[grupo].valor += v;
    grupos[grupo].categorias.set(nome, (grupos[grupo].categorias.get(nome) ?? 0) + v);
  }

  const g = (k: GrupoDre) => grupos[k].valor;
  const receitaBruta = g("receita_servicos") + g("receita_pecas") + g("outras_receitas");
  const receitaLiquida = receitaBruta - g("impostos");
  const lucroBruto = receitaLiquida - g("custo_pecas");
  const despesas = g("despesa_pessoal") + g("despesa_operacional") + g("despesa_financeira") + taxasCartao + g("outras_despesas");
  const resultado = lucroBruto - despesas;

  // Linhas prontas para a tabela e o CSV (despesas com sinal negativo)
  const linhas: LinhaDre[] = [];
  const grupo = (k: GrupoDre, sinal: 1 | -1, extra?: LinhaDre) => {
    // extra: linha a mais dentro do grupo (já com sinal), somada ao total do grupo
    linhas.push({ rotulo: GRUPOS_DRE[k].label, valor: g(k) * sinal + (extra?.valor ?? 0), nivel: "grupo" });
    const cats = [...grupos[k].categorias.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
    for (const [nome, v] of cats) linhas.push({ rotulo: nome, valor: v * sinal, nivel: "categoria" });
    if (extra) linhas.push(extra);
  };
  linhas.push({ rotulo: "Receita bruta", valor: receitaBruta, nivel: "total" });
  grupo("receita_servicos", 1);
  grupo("receita_pecas", 1);
  grupo("outras_receitas", 1);
  grupo("impostos", -1);
  linhas.push({ rotulo: "Receita líquida", valor: receitaLiquida, nivel: "total" });
  grupo("custo_pecas", -1);
  linhas.push({ rotulo: "Lucro bruto", valor: lucroBruto, nivel: "total" });
  linhas.push({ rotulo: "Despesas", valor: -despesas, nivel: "total" });
  grupo("despesa_pessoal", -1);
  grupo("despesa_operacional", -1);
  grupo("despesa_financeira", -1, taxasCartao ? { rotulo: "Taxas de cartão (descontadas nos recebimentos)", valor: -taxasCartao, nivel: "categoria" } : undefined);
  grupo("outras_despesas", -1);
  linhas.push({ rotulo: "Resultado do período", valor: resultado, nivel: "total" });

  return { linhas, receitaBruta, receitaLiquida, lucroBruto, despesas, resultado, taxasCartao };
}

/* ---------- OS entregues (faturamento e comissões) ---------- */

export type OSEntregue = {
  id: string;
  numero: number;
  entregueEm: Date;
  dia: string;
  responsavelId: string | null;
  responsavel: string | null;
  placa: string;
  cliente: string | null;
  /** Soma dos itens não recusados, sem desconto */
  bruto: number;
  desconto: number;
  total: number;
  /** Serviços e peças já com o desconto da OS rateado proporcionalmente */
  servicos: number;
  pecas: number;
  itens: { catalogoItemId: string | null; tipo: "peca" | "servico"; descricao: string; quantidade: number; valor: number }[];
};

/** OS entregues no período (pela data da entrega), com totais em centavos — mesma regra do total da OS */
export async function osEntregues(oficinaId: string, de: string, ate: string, responsavelId?: string): Promise<OSEntregue[]> {
  const db = await getDb();
  const filtros = [
    eq(os.oficinaId, oficinaId),
    eq(os.status, "entregue"),
    gte(os.entregueEm, inicioDoDia(de)),
    lt(os.entregueEm, inicioDoDia(somarDiasData(ate, 1))),
  ];
  if (responsavelId) filtros.push(eq(os.responsavelId, responsavelId));

  const lista = await db
    .select({
      id: os.id,
      numero: os.numero,
      entregueEm: os.entregueEm,
      responsavelId: os.responsavelId,
      responsavel: tecnicos.nome,
      placa: veiculos.placa,
      cliente: clientes.nome,
      descontoPercentual: os.descontoPercentual,
      descontoValor: os.descontoValor,
    })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .leftJoin(tecnicos, eq(tecnicos.id, os.responsavelId))
    .where(and(...filtros))
    .orderBy(asc(os.entregueEm));
  if (lista.length === 0) return [];

  const itens = await db
    .select({
      osId: osItens.osId,
      tipo: osItens.tipo,
      descricao: osItens.descricao,
      quantidade: osItens.quantidade,
      valorUnitario: osItens.valorUnitario,
      catalogoItemId: osItens.catalogoItemId,
    })
    .from(osItens)
    .innerJoin(os, eq(os.id, osItens.osId))
    .where(and(...filtros, eq(osItens.recusado, false)))
    .orderBy(asc(osItens.criadoEm));
  const porOS = new Map<string, typeof itens>();
  for (const i of itens) porOS.set(i.osId, [...(porOS.get(i.osId) ?? []), i]);

  return lista.map((o) => {
    const its = porOS.get(o.id) ?? [];
    const t = calcularTotais(
      its.map((i) => ({ tipo: i.tipo, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario) })),
      { percentual: o.descontoPercentual != null ? Number(o.descontoPercentual) : null, valor: Number(o.descontoValor) },
    );
    const bruto = centavos(t.bruto);
    const total = centavos(t.total);
    const fator = bruto > 0 ? total / bruto : 0;
    const servicos = Math.round(centavos(t.servicos) * fator);
    const entregueEm = o.entregueEm ?? new Date();
    return {
      id: o.id,
      numero: o.numero,
      entregueEm,
      dia: diaSP(entregueEm),
      responsavelId: o.responsavelId,
      responsavel: o.responsavel,
      placa: o.placa,
      cliente: o.cliente,
      bruto,
      desconto: centavos(t.desconto),
      total,
      servicos,
      pecas: total - servicos,
      itens: its.map((i) => ({
        catalogoItemId: i.catalogoItemId,
        tipo: i.tipo,
        descricao: i.descricao,
        quantidade: Number(i.quantidade),
        valor: Math.round(Number(i.quantidade) * Number(i.valorUnitario) * 100 * fator),
      })),
    };
  });
}

/* ---------- Faturamento ---------- */

export async function faturamento(oficinaId: string, de: string, ate: string) {
  const lista = await osEntregues(oficinaId, de, ate);
  const total = lista.reduce((s, o) => s + o.total, 0);
  const ticket = (t: number, n: number) => (n ? Math.round(t / n) : 0);

  const meses = new Map<string, { mes: string; rotulo: string; qtd: number; servicos: number; pecas: number; total: number }>();
  for (let m = `${de.slice(0, 7)}-01`; m <= ate; m = somarMeses(m, 1)) {
    const k = m.slice(0, 7);
    meses.set(k, { mes: k, rotulo: mesBR(k), qtd: 0, servicos: 0, pecas: 0, total: 0 });
  }
  const itens = new Map<string, { descricao: string; tipo: "peca" | "servico"; quantidade: number; total: number; os: Set<string> }>();
  const porTec = new Map<string, { nome: string; qtd: number; total: number }>();

  for (const o of lista) {
    const m = meses.get(o.dia.slice(0, 7));
    if (m) {
      m.qtd++;
      m.servicos += o.servicos;
      m.pecas += o.pecas;
      m.total += o.total;
    }
    for (const i of o.itens) {
      const k = i.catalogoItemId ?? `${i.tipo}:${i.descricao.trim().toLowerCase().replace(/\s+/g, " ")}`;
      const it = itens.get(k) ?? { descricao: i.descricao.trim(), tipo: i.tipo, quantidade: 0, total: 0, os: new Set<string>() };
      it.quantidade += i.quantidade;
      it.total += i.valor;
      it.os.add(o.id);
      itens.set(k, it);
    }
    const kt = o.responsavelId ?? "";
    const t = porTec.get(kt) ?? { nome: o.responsavel ?? "Sem responsável", qtd: 0, total: 0 };
    t.qtd++;
    t.total += o.total;
    porTec.set(kt, t);
  }

  return {
    qtd: lista.length,
    total,
    servicos: lista.reduce((s, o) => s + o.servicos, 0),
    pecas: lista.reduce((s, o) => s + o.pecas, 0),
    desconto: lista.reduce((s, o) => s + o.desconto, 0),
    ticket: ticket(total, lista.length),
    porMes: [...meses.values()].map((m) => ({ ...m, ticket: ticket(m.total, m.qtd) })),
    porItem: [...itens.values()]
      .map((i) => ({ descricao: i.descricao, tipo: i.tipo, quantidade: Math.round(i.quantidade * 100) / 100, total: i.total, qtdOS: i.os.size }))
      .sort((a, b) => b.total - a.total),
    porTecnico: [...porTec.values()].map((t) => ({ ...t, ticket: ticket(t.total, t.qtd) })).sort((a, b) => b.total - a.total),
    lista,
  };
}
