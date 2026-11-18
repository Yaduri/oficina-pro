import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { diaSP } from "@/lib/agenda-datas";

/*
 * Base do financeiro (Fase 2). Regras:
 * - Dinheiro sempre em centavos (inteiro) nas contas; no banco, numeric(12,2) como string.
 * - Lançamento = uma parcela a receber ou a pagar. Baixa = pagamento (total ou parcial) dele.
 * - Saldo de uma conta = saldo inicial + baixas de "receber" − baixas de "pagar" ± transferências,
 *   a partir de saldoInicialEm. Baixas estornadas não contam.
 * - Valor que entra/sai na conta numa baixa:
 *     receber: valor + juros + multa − desconto − taxa
 *     pagar:   valor + juros + multa − desconto
 */

const { contasFinanceiras: contas, categoriasFinanceiras: categorias, lancamentos, baixas, transferencias, recorrencias } = schema;

export type TipoLancamento = "receber" | "pagar";
export type StatusLancamento = "aberto" | "parcial" | "pago" | "cancelado";
export type Lancamento = typeof lancamentos.$inferSelect;
export type ContaFinanceira = typeof contas.$inferSelect;
export type Categoria = typeof categorias.$inferSelect;

/* ---------- Dinheiro ---------- */

export const centavos = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100);
export const reais = (c: number) => (c / 100).toFixed(2);

/** Divide um total em n parcelas; a diferença de centavos vai para a primeira */
export function dividirParcelas(totalCentavos: number, n: number) {
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? resto : 0));
}

/* ---------- Datas (AAAA-MM-DD, fuso de São Paulo) ---------- */

export const hojeSP = () => diaSP(new Date());

/** Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02) */
export function somarMeses(dia: string, n: number, diaFixo?: number) {
  const [a, m, d] = dia.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(diaFixo ?? d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export function somarDiasData(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- Rótulos ---------- */

export const FORMAS = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  a_prazo: "A prazo (fiado)",
} as const;
export type Forma = keyof typeof FORMAS;
export const ehForma = (v: string): v is Forma => Object.hasOwn(FORMAS, v);

export const STATUS_LANCAMENTO: Record<StatusLancamento, { label: string; tom: "neutro" | "info" | "ok" | "warn" | "danger" }> = {
  aberto: { label: "Em aberto", tom: "warn" },
  parcial: { label: "Pago em parte", tom: "info" },
  pago: { label: "Pago", tom: "ok" },
  cancelado: { label: "Cancelado", tom: "neutro" },
};

export const TIPOS_CONTA = { caixa: "Caixa (dinheiro)", banco: "Conta no banco", maquininha: "Maquininha (a receber)" } as const;

/** Grupos da DRE, na ordem em que aparecem */
export const GRUPOS_DRE = {
  receita_servicos: { label: "Receita de serviços", tipo: "receita" },
  receita_pecas: { label: "Receita de peças", tipo: "receita" },
  outras_receitas: { label: "Outras receitas", tipo: "receita" },
  impostos: { label: "Impostos sobre vendas", tipo: "despesa" },
  custo_pecas: { label: "Custo das peças", tipo: "despesa" },
  despesa_pessoal: { label: "Pessoal e comissões", tipo: "despesa" },
  despesa_operacional: { label: "Despesas operacionais", tipo: "despesa" },
  despesa_financeira: { label: "Despesas financeiras (taxas, juros)", tipo: "despesa" },
  outras_despesas: { label: "Outras despesas", tipo: "despesa" },
} as const;
export type GrupoDre = keyof typeof GRUPOS_DRE;

/** Categorias criadas para cada oficina; as com "sistema" são usadas automaticamente */
const CATEGORIAS_PADRAO: { tipo: "receita" | "despesa"; nome: string; grupoDre: GrupoDre; sistema?: string }[] = [
  { tipo: "receita", nome: "Serviços", grupoDre: "receita_servicos", sistema: "servicos" },
  { tipo: "receita", nome: "Peças", grupoDre: "receita_pecas", sistema: "pecas" },
  { tipo: "receita", nome: "Outras receitas", grupoDre: "outras_receitas" },
  { tipo: "despesa", nome: "Compra de peças", grupoDre: "custo_pecas", sistema: "compra_pecas" },
  { tipo: "despesa", nome: "Salários e encargos", grupoDre: "despesa_pessoal" },
  { tipo: "despesa", nome: "Comissões", grupoDre: "despesa_pessoal", sistema: "comissoes" },
  { tipo: "despesa", nome: "Aluguel", grupoDre: "despesa_operacional" },
  { tipo: "despesa", nome: "Energia, água e internet", grupoDre: "despesa_operacional" },
  { tipo: "despesa", nome: "Ferramentas e manutenção", grupoDre: "despesa_operacional" },
  { tipo: "despesa", nome: "Taxas de cartão", grupoDre: "despesa_financeira", sistema: "taxas_cartao" },
  { tipo: "despesa", nome: "Tarifas bancárias", grupoDre: "despesa_financeira" },
  { tipo: "despesa", nome: "Impostos (DAS, ISS, ICMS)", grupoDre: "impostos" },
  { tipo: "despesa", nome: "Outras despesas", grupoDre: "outras_despesas" },
];

/* ---------- Padrões da oficina ---------- */

/** Já conferido nesta execução do servidor (evita ida ao banco a cada consulta) */
const padroesProntos = new Set<string>();

/**
 * Cria contas e categorias padrão na primeira vez que o financeiro é usado.
 * Várias consultas podem chamar ao mesmo tempo: a trava por oficina garante uma criação só.
 */
export async function garantirPadroes(oficinaId: string) {
  if (padroesProntos.has(oficinaId)) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`financeiro-padroes:${oficinaId}`}))`);
    const [c] = await tx.select({ id: contas.id }).from(contas).where(eq(contas.oficinaId, oficinaId)).limit(1);
    if (!c) {
      await tx.insert(contas).values([
        { oficinaId, nome: "Caixa", tipo: "caixa", saldoInicialEm: hojeSP() },
        { oficinaId, nome: "Banco", tipo: "banco", saldoInicialEm: hojeSP() },
      ]);
    }
    const [cat] = await tx.select({ id: categorias.id }).from(categorias).where(eq(categorias.oficinaId, oficinaId)).limit(1);
    if (!cat) {
      await tx.insert(categorias).values(CATEGORIAS_PADRAO.map((x) => ({ oficinaId, ...x, sistema: x.sistema ?? null })));
    }
  });
  padroesProntos.add(oficinaId);
}

/** Id de uma categoria do sistema (servicos, pecas, compra_pecas, comissoes, taxas_cartao) */
export async function categoriaSistema(oficinaId: string, sistema: string) {
  await garantirPadroes(oficinaId);
  const db = await getDb();
  const [c] = await db
    .select({ id: categorias.id })
    .from(categorias)
    .where(and(eq(categorias.oficinaId, oficinaId), eq(categorias.sistema, sistema)));
  return c?.id ?? null;
}

export async function listarContas(oficinaId: string, soAtivas = true) {
  await garantirPadroes(oficinaId);
  const db = await getDb();
  const filtros = [eq(contas.oficinaId, oficinaId)];
  if (soAtivas) filtros.push(eq(contas.ativo, true));
  return db.select().from(contas).where(and(...filtros)).orderBy(asc(contas.criadoEm));
}

export async function listarCategorias(oficinaId: string, tipo?: "receita" | "despesa", soAtivas = true) {
  await garantirPadroes(oficinaId);
  const db = await getDb();
  const filtros = [eq(categorias.oficinaId, oficinaId)];
  if (tipo) filtros.push(eq(categorias.tipo, tipo));
  if (soAtivas) filtros.push(eq(categorias.ativo, true));
  return db.select().from(categorias).where(and(...filtros)).orderBy(asc(categorias.nome));
}

/** Conta sugerida para a forma de pagamento: dinheiro → caixa; cartão → maquininha (se houver); resto → banco */
export function contaSugerida(lista: ContaFinanceira[], forma: string) {
  const por = (t: ContaFinanceira["tipo"]) => lista.find((c) => c.tipo === t && c.ativo);
  if (forma === "dinheiro") return por("caixa") ?? lista[0];
  if (forma === "debito" || forma === "credito") return por("maquininha") ?? por("banco") ?? lista[0];
  return por("banco") ?? lista[0];
}

/* ---------- Saldos ---------- */

/** Movimento líquido de uma baixa na conta (positivo = entrou) */
export function movimentoDaBaixa(tipo: TipoLancamento, b: { valor: string; juros: string; multa: string; desconto: string; taxa: string }) {
  const bruto = centavos(b.valor) + centavos(b.juros) + centavos(b.multa) - centavos(b.desconto);
  return tipo === "receber" ? bruto - centavos(b.taxa) : -bruto;
}

/** Saldo atual de cada conta da oficina (em centavos), opcionalmente até uma data (inclusive) */
export async function saldosDasContas(oficinaId: string, ate?: string) {
  const db = await getDb();
  const lista = await listarContas(oficinaId, false);
  const limite = ate ?? "9999-12-31";

  const movBaixas = await db
    .select({
      contaId: baixas.contaId,
      total: sql<string>`coalesce(sum(case when ${lancamentos.tipo} = 'receber'
        then ${baixas.valor} + ${baixas.juros} + ${baixas.multa} - ${baixas.desconto} - ${baixas.taxa}
        else -(${baixas.valor} + ${baixas.juros} + ${baixas.multa} - ${baixas.desconto}) end), 0)`,
    })
    .from(baixas)
    .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
    .innerJoin(contas, eq(contas.id, baixas.contaId))
    .where(
      and(
        eq(baixas.oficinaId, oficinaId),
        isNull(baixas.estornadaEm),
        sql`${baixas.data} >= ${contas.saldoInicialEm}`,
        sql`${baixas.data} <= ${limite}`,
      ),
    )
    .groupBy(baixas.contaId);

  const trs = await db
    .select()
    .from(transferencias)
    .where(and(eq(transferencias.oficinaId, oficinaId), sql`${transferencias.data} <= ${limite}`));

  return lista.map((c) => {
    let saldo = centavos(c.saldoInicial) + centavos(movBaixas.find((m) => m.contaId === c.id)?.total);
    for (const t of trs) {
      if (t.data < c.saldoInicialEm) continue;
      if (t.paraContaId === c.id) saldo += centavos(t.valor);
      if (t.deContaId === c.id) saldo -= centavos(t.valor);
    }
    return { ...c, saldo };
  });
}

/* ---------- Lançamentos ---------- */

export type NovoLancamento = {
  oficinaId: string;
  tipo: TipoLancamento;
  descricao: string;
  categoriaId?: string | null;
  contaId?: string | null;
  clienteId?: string | null;
  fornecedor?: string | null;
  tecnicoId?: string | null;
  osId?: string | null;
  centroCusto?: string | null;
  forma?: string | null;
  competencia?: string;
  anexoKey?: string | null;
  recorrenciaId?: string | null;
  observacao?: string | null;
  criadoPor?: string | null;
};

/**
 * Cria um lançamento em parcelas (mesmo grupo). `parcelas` = valores em centavos e vencimentos.
 * Descrição das parcelas: "Descrição (1/3)".
 */
export async function criarLancamentos(tx: DB, base: NovoLancamento, parcelas: { valor: number; vencimento: string }[]) {
  const grupo = randomUUID();
  const n = parcelas.length;
  return tx
    .insert(lancamentos)
    .values(
      parcelas.map((p, i) => ({
        ...base,
        descricao: n > 1 ? `${base.descricao} (${i + 1}/${n})` : base.descricao,
        valor: reais(p.valor),
        vencimento: p.vencimento,
        competencia: base.competencia ?? p.vencimento,
        parcela: i + 1,
        parcelas: n,
        grupo,
      })),
    )
    .returning();
}

export type NovaBaixa = {
  oficinaId: string;
  lancamentoId: string;
  contaId: string;
  data: string;
  /** Principal em centavos */
  valor: number;
  juros?: number;
  multa?: number;
  desconto?: number;
  taxa?: number;
  forma?: string | null;
  observacao?: string | null;
  criadoPor?: string | null;
};

/** Registra uma baixa e atualiza o lançamento. Erro se passar do valor em aberto. */
export async function registrarBaixa(tx: DB, b: NovaBaixa): Promise<{ erro: string } | { id: string }> {
  const [l] = await tx
    .select()
    .from(lancamentos)
    .where(and(eq(lancamentos.id, b.lancamentoId), eq(lancamentos.oficinaId, b.oficinaId)));
  if (!l) return { erro: "Lançamento não encontrado" };
  if (l.status === "cancelado") return { erro: "Lançamento cancelado" };
  const [conta] = await tx
    .select({ id: contas.id })
    .from(contas)
    .where(and(eq(contas.id, b.contaId), eq(contas.oficinaId, b.oficinaId)));
  if (!conta) return { erro: "Conta não encontrada" };
  const aberto = centavos(l.valor) - centavos(l.valorPago);
  if (b.valor <= 0) return { erro: "Informe o valor" };
  if (b.valor > aberto) return { erro: `O valor passa do que está em aberto (R$ ${reais(aberto).replace(".", ",")})` };

  const [nova] = await tx
    .insert(baixas)
    .values({
      oficinaId: b.oficinaId,
      lancamentoId: l.id,
      contaId: b.contaId,
      data: b.data,
      valor: reais(b.valor),
      juros: reais(b.juros ?? 0),
      multa: reais(b.multa ?? 0),
      desconto: reais(b.desconto ?? 0),
      taxa: reais(b.taxa ?? 0),
      forma: b.forma ?? l.forma,
      observacao: b.observacao ?? null,
      criadoPor: b.criadoPor ?? null,
    })
    .returning({ id: baixas.id });
  const pago = centavos(l.valorPago) + b.valor;
  await tx
    .update(lancamentos)
    .set({ valorPago: reais(pago), status: pago >= centavos(l.valor) ? "pago" : "parcial" })
    .where(eq(lancamentos.id, l.id));
  return { id: nova.id };
}

/** Estorna uma baixa: ela deixa de contar no saldo e o valor volta a ficar em aberto */
export async function estornarBaixa(tx: DB, oficinaId: string, baixaId: string, por: string | null) {
  const [b] = await tx
    .select()
    .from(baixas)
    .where(and(eq(baixas.id, baixaId), eq(baixas.oficinaId, oficinaId), isNull(baixas.estornadaEm)));
  if (!b) return { erro: "Pagamento não encontrado ou já estornado" };
  await tx.update(baixas).set({ estornadaEm: new Date(), estornadaPor: por }).where(eq(baixas.id, b.id));
  const [l] = await tx.select().from(lancamentos).where(eq(lancamentos.id, b.lancamentoId));
  const pago = Math.max(centavos(l.valorPago) - centavos(b.valor), 0);
  await tx
    .update(lancamentos)
    .set({ valorPago: reais(pago), status: l.status === "cancelado" ? "cancelado" : pago === 0 ? "aberto" : "parcial" })
    .where(eq(lancamentos.id, l.id));
  return { ok: true as const };
}

/* ---------- Recorrências ---------- */

/**
 * Gera os lançamentos das contas recorrentes até o fim do mês seguinte.
 * Chamado ao abrir as telas do financeiro (não precisa de tarefa agendada).
 */
export async function gerarRecorrencias(oficinaId: string) {
  const db = await getDb();
  const ativas = await db
    .select()
    .from(recorrencias)
    .where(and(eq(recorrencias.oficinaId, oficinaId), eq(recorrencias.ativo, true)));
  if (ativas.length === 0) return;
  const limite = somarMeses(`${hojeSP().slice(0, 7)}-01`, 1); // 1º dia do mês que vem
  for (const r of ativas) {
    let mes = r.geradoAte ? somarMeses(r.geradoAte, 1, 1) : `${r.inicio.slice(0, 7)}-01`;
    const novos: { valor: number; vencimento: string }[] = [];
    while (mes <= limite && (!r.fim || mes <= r.fim)) {
      const venc = somarMeses(mes, 0, r.dia);
      if (venc >= r.inicio) novos.push({ valor: centavos(r.valor), vencimento: venc });
      mes = somarMeses(mes, 1, 1);
    }
    if (novos.length === 0) continue;
    await db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as DB;
      for (const p of novos) {
        await criarLancamentos(
          tx,
          {
            oficinaId,
            tipo: r.tipo,
            descricao: r.descricao,
            categoriaId: r.categoriaId,
            contaId: r.contaId,
            fornecedor: r.fornecedor,
            clienteId: r.clienteId,
            forma: r.forma,
            centroCusto: r.centroCusto,
            observacao: r.observacao,
            recorrenciaId: r.id,
          },
          [p],
        );
      }
      await tx
        .update(recorrencias)
        .set({ geradoAte: `${novos[novos.length - 1].vencimento.slice(0, 7)}-01` })
        .where(eq(recorrencias.id, r.id));
    });
  }
}
