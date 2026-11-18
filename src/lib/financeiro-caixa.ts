import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import {
  centavos,
  hojeSP,
  movimentoDaBaixa,
  saldosDasContas,
  somarDiasData,
  type ContaFinanceira,
  type TipoLancamento,
} from "@/lib/financeiro";

/*
 * Caixa e bancos (Fase 2.3): visão geral, extrato por conta, caixa do dia e conciliação OFX.
 * Valores em centavos.
 */

const { lancamentos, baixas, transferencias, caixaSessoes, extratoItens, membros } = schema;

export const inicioDoMes = (dia = hojeSP()) => `${dia.slice(0, 7)}-01`;

/* ---------- Visão geral ---------- */

type Soma = { total: number; qtd: number };
const vazio = (): Soma => ({ total: 0, qtd: 0 });

/** Em aberto vencendo hoje, vencido, próximos 7 dias; entradas e saídas do mês (baixas) */
export async function resumoVisaoGeral(oficinaId: string) {
  const db = await getDb();
  const hoje = hojeSP();
  const em7 = somarDiasData(hoje, 7);

  const abertos = await db
    .select({
      tipo: lancamentos.tipo,
      faixa: sql<string>`case when ${lancamentos.vencimento} < ${hoje} then 'vencido'
        when ${lancamentos.vencimento} = ${hoje} then 'hoje' else 'proximos' end`,
      total: sql<string>`coalesce(sum(${lancamentos.valor} - ${lancamentos.valorPago}), 0)`,
      qtd: sql<number>`count(*)::int`,
    })
    .from(lancamentos)
    .where(
      and(
        eq(lancamentos.oficinaId, oficinaId),
        inArray(lancamentos.status, ["aberto", "parcial"]),
        lte(lancamentos.vencimento, em7),
      ),
    )
    .groupBy(sql`1`, sql`2`);

  const r = {
    receber: { hoje: vazio(), vencido: vazio(), proximos: vazio() },
    pagar: { hoje: vazio(), vencido: vazio(), proximos: vazio() },
  };
  for (const a of abertos) {
    r[a.tipo][a.faixa as "hoje" | "vencido" | "proximos"] = { total: centavos(a.total), qtd: Number(a.qtd) };
  }

  const mes = await db
    .select({
      tipo: lancamentos.tipo,
      total: sql<string>`coalesce(sum(case when ${lancamentos.tipo} = 'receber'
        then ${baixas.valor} + ${baixas.juros} + ${baixas.multa} - ${baixas.desconto} - ${baixas.taxa}
        else ${baixas.valor} + ${baixas.juros} + ${baixas.multa} - ${baixas.desconto} end), 0)`,
      qtd: sql<number>`count(*)::int`,
    })
    .from(baixas)
    .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
    .where(
      and(
        eq(baixas.oficinaId, oficinaId),
        isNull(baixas.estornadaEm),
        gte(baixas.data, inicioDoMes(hoje)),
        lte(baixas.data, hoje),
      ),
    )
    .groupBy(lancamentos.tipo);
  const doMes = (t: TipoLancamento) => {
    const m = mes.find((x) => x.tipo === t);
    return { total: centavos(m?.total), qtd: Number(m?.qtd ?? 0) };
  };

  return { ...r, entradasMes: doMes("receber"), saidasMes: doMes("pagar"), hoje, em7 };
}

export type Movimento = {
  id: string;
  origem: "baixa" | "transferencia";
  data: string;
  criadoEm: Date;
  descricao: string;
  detalhe: string | null;
  /** Centavos; positivo = entrou na conta */
  valor: number;
  estornada: boolean;
  contaId: string;
  lancamentoId?: string;
  tipoLancamento?: TipoLancamento;
};

const selBaixa = {
  id: baixas.id,
  data: baixas.data,
  criadoEm: baixas.criadoEm,
  contaId: baixas.contaId,
  valor: baixas.valor,
  juros: baixas.juros,
  multa: baixas.multa,
  desconto: baixas.desconto,
  taxa: baixas.taxa,
  forma: baixas.forma,
  estornadaEm: baixas.estornadaEm,
  lancamentoId: lancamentos.id,
  tipo: lancamentos.tipo,
  descricao: lancamentos.descricao,
  fornecedor: lancamentos.fornecedor,
};
type LinhaBaixa = {
  id: string;
  data: string;
  criadoEm: Date;
  contaId: string;
  valor: string;
  juros: string;
  multa: string;
  desconto: string;
  taxa: string;
  forma: string | null;
  estornadaEm: Date | null;
  lancamentoId: string;
  tipo: TipoLancamento;
  descricao: string;
  fornecedor: string | null;
};

const FORMAS_CURTAS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  credito: "Crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
};

function deBaixa(b: LinhaBaixa): Movimento {
  const juros = centavos(b.juros) + centavos(b.multa);
  const extras = [
    b.forma ? FORMAS_CURTAS[b.forma] ?? null : null,
    b.fornecedor,
    juros ? `juros/multa ${(juros / 100).toFixed(2).replace(".", ",")}` : null,
    centavos(b.desconto) ? `desconto ${b.desconto.replace(".", ",")}` : null,
    centavos(b.taxa) ? `taxa ${b.taxa.replace(".", ",")}` : null,
  ].filter(Boolean);
  return {
    id: b.id,
    origem: "baixa",
    data: b.data,
    criadoEm: b.criadoEm,
    descricao: b.descricao,
    detalhe: [b.tipo === "receber" ? "Recebimento" : "Pagamento", ...extras].join(" · "),
    valor: movimentoDaBaixa(b.tipo, b),
    estornada: !!b.estornadaEm,
    contaId: b.contaId,
    lancamentoId: b.lancamentoId,
    tipoLancamento: b.tipo,
  };
}

/** Transferência vista por uma conta (sinal) ou, sem conta, pelo destino */
function deTransferencia(
  t: typeof transferencias.$inferSelect,
  nomes: Map<string, string>,
  contaId?: string,
): Movimento {
  const saida = contaId ? t.deContaId === contaId : false;
  const de = nomes.get(t.deContaId) ?? "?";
  const para = nomes.get(t.paraContaId) ?? "?";
  return {
    id: t.id,
    origem: "transferencia",
    data: t.data,
    criadoEm: t.criadoEm,
    descricao: t.descricao || (contaId ? (saida ? `Transferência para ${para}` : `Transferência de ${de}`) : "Transferência"),
    detalhe: `${de} → ${para}`,
    valor: saida ? -centavos(t.valor) : centavos(t.valor),
    estornada: false,
    contaId: contaId ?? t.paraContaId,
  };
}

/** Últimos pagamentos/recebimentos e transferências da oficina (mais novos primeiro) */
export async function ultimosMovimentos(oficinaId: string, contasLista: ContaFinanceira[], n = 8) {
  const db = await getDb();
  const nomes = new Map(contasLista.map((c) => [c.id, c.nome]));
  const [bs, ts] = await Promise.all([
    db
      .select(selBaixa)
      .from(baixas)
      .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
      .where(eq(baixas.oficinaId, oficinaId))
      .orderBy(desc(baixas.criadoEm))
      .limit(n),
    db.select().from(transferencias).where(eq(transferencias.oficinaId, oficinaId)).orderBy(desc(transferencias.criadoEm)).limit(n),
  ]);
  return [...bs.map(deBaixa), ...ts.map((t) => deTransferencia(t, nomes))]
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
    .slice(0, n)
    .map((m) => ({ ...m, conta: nomes.get(m.contaId) ?? "" }));
}

/* ---------- Extrato de uma conta ---------- */

/**
 * Movimentos da conta no período, em ordem, com saldo corrido.
 * Começa no saldo do dia anterior; antes de saldoInicialEm nada conta.
 */
export async function extratoDaConta(oficinaId: string, conta: ContaFinanceira, de: string, ate: string, contasLista: ContaFinanceira[]) {
  const db = await getDb();
  const inicio = de < conta.saldoInicialEm ? conta.saldoInicialEm : de;
  const saldoAnterior =
    inicio <= conta.saldoInicialEm
      ? centavos(conta.saldoInicial)
      : ((await saldosDasContas(oficinaId, somarDiasData(inicio, -1))).find((c) => c.id === conta.id)?.saldo ?? 0);

  const nomes = new Map(contasLista.map((c) => [c.id, c.nome]));
  const [bs, ts] = await Promise.all([
    db
      .select(selBaixa)
      .from(baixas)
      .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
      .where(and(eq(baixas.oficinaId, oficinaId), eq(baixas.contaId, conta.id), gte(baixas.data, inicio), lte(baixas.data, ate)))
      .orderBy(asc(baixas.data), asc(baixas.criadoEm)),
    db
      .select()
      .from(transferencias)
      .where(
        and(
          eq(transferencias.oficinaId, oficinaId),
          or(eq(transferencias.deContaId, conta.id), eq(transferencias.paraContaId, conta.id)),
          gte(transferencias.data, inicio),
          lte(transferencias.data, ate),
        ),
      ),
  ]);

  const movs = [...bs.map(deBaixa), ...ts.map((t) => deTransferencia(t, nomes, conta.id))].sort(
    (a, b) => a.data.localeCompare(b.data) || a.criadoEm.getTime() - b.criadoEm.getTime(),
  );
  let saldo = saldoAnterior;
  let entradas = 0;
  let saidas = 0;
  const linhas = movs.map((m) => {
    if (!m.estornada) {
      saldo += m.valor;
      if (m.valor >= 0) entradas += m.valor;
      else saidas -= m.valor;
    }
    return { ...m, saldo };
  });
  return { inicio, saldoAnterior, linhas, entradas, saidas, saldoFinal: saldo };
}

/* ---------- Caixa do dia ---------- */

/** Sessão aberta do caixa (no máximo uma por conta) */
export async function sessaoAberta(db: DB, oficinaId: string, contaId: string) {
  const [s] = await db
    .select()
    .from(caixaSessoes)
    .where(and(eq(caixaSessoes.oficinaId, oficinaId), eq(caixaSessoes.contaId, contaId), isNull(caixaSessoes.fechadoEm)))
    .orderBy(desc(caixaSessoes.abertoEm))
    .limit(1);
  return s ?? null;
}

/**
 * Quanto deveria ter na gaveta: valor de abertura + o que foi lançado na conta depois da abertura
 * (pelo horário do registro, não pela data do pagamento), menos o que foi estornado depois da abertura.
 */
export async function esperadoDoCaixa(db: DB, oficinaId: string, s: typeof caixaSessoes.$inferSelect) {
  const desde = s.abertoEm;
  const bs = await db
    .select(selBaixa)
    .from(baixas)
    .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
    .where(
      and(
        eq(baixas.oficinaId, oficinaId),
        eq(baixas.contaId, s.contaId),
        or(
          and(gte(baixas.criadoEm, desde), isNull(baixas.estornadaEm)),
          // Registrado antes da abertura e estornado depois: o dinheiro saiu da gaveta
          and(lt(baixas.criadoEm, desde), isNotNull(baixas.estornadaEm), gte(baixas.estornadaEm, desde)),
        ),
      ),
    );
  const ts = await db
    .select()
    .from(transferencias)
    .where(
      and(
        eq(transferencias.oficinaId, oficinaId),
        or(eq(transferencias.deContaId, s.contaId), eq(transferencias.paraContaId, s.contaId)),
        gte(transferencias.criadoEm, desde),
      ),
    );

  let entradas = 0;
  let saidas = 0;
  let estornos = 0;
  for (const b of bs) {
    const v = movimentoDaBaixa(b.tipo, b);
    if (b.estornadaEm) estornos -= v;
    else if (v >= 0) entradas += v;
    else saidas -= v;
  }
  let transfEntrada = 0;
  let transfSaida = 0;
  for (const t of ts) {
    if (t.paraContaId === s.contaId) transfEntrada += centavos(t.valor);
    if (t.deContaId === s.contaId) transfSaida += centavos(t.valor);
  }
  const abertura = centavos(s.valorAbertura);
  return {
    abertura,
    entradas,
    saidas,
    estornos,
    transfEntrada,
    transfSaida,
    qtd: bs.length + ts.length,
    esperado: abertura + entradas - saidas + estornos + transfEntrada - transfSaida,
  };
}

/** Histórico das sessões do caixa, com o nome de quem abriu/fechou */
export async function historicoCaixa(oficinaId: string, contaId: string, n = 30) {
  const db = await getDb();
  const lista = await db
    .select()
    .from(caixaSessoes)
    .where(and(eq(caixaSessoes.oficinaId, oficinaId), eq(caixaSessoes.contaId, contaId)))
    .orderBy(desc(caixaSessoes.abertoEm))
    .limit(n);
  const ids = [...new Set(lista.flatMap((s) => [s.abertoPor, s.fechadoPor]).filter((x): x is string => !!x))];
  const pessoas = ids.length
    ? await db
        .select({ id: membros.clerkUserId, nome: membros.nome, email: membros.email })
        .from(membros)
        .where(and(eq(membros.oficinaId, oficinaId), inArray(membros.clerkUserId, ids)))
    : [];
  const nome = (id: string | null) => {
    const p = pessoas.find((x) => x.id === id);
    return p?.nome || p?.email || null;
  };
  return lista.map((s) => ({ ...s, abertoPorNome: nome(s.abertoPor), fechadoPorNome: nome(s.fechadoPor) }));
}

/* ---------- Conciliação ---------- */

export type Candidato = { chave: string; descricao: string; data: string; valor: number };

const distanciaDias = (a: string, b: string) =>
  Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000;

/** Folga de datas entre a linha do banco e o lançamento no sistema */
export const FOLGA_DIAS = 3;

/**
 * Linhas do extrato importado e, para as pendentes, os pagamentos/transferências do sistema
 * na mesma conta com o mesmo valor líquido e data a até 3 dias, ainda não conciliados.
 * Cada candidato é sugerido para uma só linha (a de data mais próxima, na ordem do extrato).
 */
export async function dadosConciliacao(oficinaId: string, conta: ContaFinanceira, contasLista: ContaFinanceira[], verTodas: boolean) {
  const db = await getDb();
  const itens = await db
    .select()
    .from(extratoItens)
    .where(and(eq(extratoItens.oficinaId, oficinaId), eq(extratoItens.contaId, conta.id)))
    .orderBy(desc(extratoItens.data), asc(extratoItens.fitid));

  const pendentes = itens.filter((i) => !i.baixaId && !i.transferenciaId && !i.ignorado);
  const usadosB = new Set(itens.map((i) => i.baixaId).filter(Boolean));
  const usadosT = new Set(itens.map((i) => i.transferenciaId).filter(Boolean));
  const nomes = new Map(contasLista.map((c) => [c.id, c.nome]));

  // Descrição do que já foi conciliado
  const idsB = itens.map((i) => i.baixaId).filter((x): x is string => !!x);
  const idsT = itens.map((i) => i.transferenciaId).filter((x): x is string => !!x);
  const [ligB, ligT] = await Promise.all([
    idsB.length
      ? db.select(selBaixa).from(baixas).innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId)).where(inArray(baixas.id, idsB))
      : [],
    idsT.length ? db.select().from(transferencias).where(inArray(transferencias.id, idsT)) : [],
  ]);

  let candidatos: Candidato[] = [];
  if (pendentes.length) {
    const datas = pendentes.map((p) => p.data).sort();
    const de = somarDiasData(datas[0], -FOLGA_DIAS);
    const ate = somarDiasData(datas[datas.length - 1], FOLGA_DIAS);
    const [bs, ts] = await Promise.all([
      db
        .select(selBaixa)
        .from(baixas)
        .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
        .where(
          and(
            eq(baixas.oficinaId, oficinaId),
            eq(baixas.contaId, conta.id),
            isNull(baixas.estornadaEm),
            gte(baixas.data, de),
            lte(baixas.data, ate),
          ),
        ),
      db
        .select()
        .from(transferencias)
        .where(
          and(
            eq(transferencias.oficinaId, oficinaId),
            or(eq(transferencias.deContaId, conta.id), eq(transferencias.paraContaId, conta.id)),
            gte(transferencias.data, de),
            lte(transferencias.data, ate),
          ),
        ),
    ]);
    candidatos = [
      ...bs.filter((b) => !usadosB.has(b.id)).map((b) => ({ chave: `b:${b.id}`, descricao: deBaixa(b).descricao, data: b.data, valor: movimentoDaBaixa(b.tipo, b) })),
      ...ts
        .filter((t) => !usadosT.has(t.id))
        .map((t) => {
          const m = deTransferencia(t, nomes, conta.id);
          return { chave: `t:${t.id}`, descricao: m.descricao, data: t.data, valor: m.valor };
        }),
    ];
  }

  const reservados = new Set<string>();
  const linhas = itens.map((i) => {
    const valor = centavos(i.valor);
    let status: "pendente" | "conciliado" | "ignorado" = "pendente";
    let ligado: string | null = null;
    if (i.ignorado) status = "ignorado";
    if (i.baixaId) {
      status = "conciliado";
      const b = ligB.find((x) => x.id === i.baixaId);
      ligado = b ? `${b.descricao}${b.estornadaEm ? " (estornado)" : ""}` : "Pagamento";
    } else if (i.transferenciaId) {
      status = "conciliado";
      const t = ligT.find((x) => x.id === i.transferenciaId);
      ligado = t ? deTransferencia(t, nomes, conta.id).descricao : "Transferência";
    }
    let opcoes: Candidato[] = [];
    if (status === "pendente") {
      opcoes = candidatos
        .filter((c) => c.valor === valor && distanciaDias(c.data, i.data) <= FOLGA_DIAS)
        .sort((a, b) => Number(reservados.has(a.chave)) - Number(reservados.has(b.chave)) || distanciaDias(a.data, i.data) - distanciaDias(b.data, i.data));
      if (opcoes[0] && !reservados.has(opcoes[0].chave)) reservados.add(opcoes[0].chave);
    }
    return { id: i.id, fitid: i.fitid, data: i.data, valor, descricao: i.descricao, status, ligado, opcoes };
  });

  const contagem = {
    pendente: linhas.filter((l) => l.status === "pendente").length,
    conciliado: linhas.filter((l) => l.status === "conciliado").length,
    ignorado: linhas.filter((l) => l.status === "ignorado").length,
  };
  return { linhas: verTodas ? linhas : linhas.filter((l) => l.status === "pendente"), contagem };
}
