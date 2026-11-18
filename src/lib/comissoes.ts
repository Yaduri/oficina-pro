import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { centavos } from "@/lib/financeiro";
import { osEntregues, type OSEntregue } from "@/lib/financeiro-relatorios";

/*
 * Comissões (2.6). Regra por técnico: % sobre serviços, % sobre peças e/ou valor fixo por OS entregue.
 * Base = serviços e peças da OS (itens não recusados) com o desconto da OS rateado proporcionalmente.
 * Uma OS entra uma única vez por técnico: as que já estão num fechamento (detalhes.osId) ficam de fora.
 * Os valores em `detalhes` do fechamento são em centavos.
 */

const { tecnicos, comissoesFechamentos: fechamentos, lancamentos, baixas } = schema;

export type Regra = { servicoPct: number | null; pecaPct: number | null; fixo: number | null };
type TecnicoRegra = { comissaoServicoPct: string | null; comissaoPecaPct: string | null; comissaoFixaOs: string | null };

export function regraDo(t: TecnicoRegra): Regra {
  const n = (v: string | null) => (v == null ? null : Number(v));
  return { servicoPct: n(t.comissaoServicoPct), pecaPct: n(t.comissaoPecaPct), fixo: t.comissaoFixaOs == null ? null : centavos(t.comissaoFixaOs) };
}

export const temRegra = (r: Regra) => !!(r.servicoPct || r.pecaPct || r.fixo);

/** "10% serviços · 5% peças · R$ 20,00 por OS" */
export function descreverRegra(r: Regra) {
  const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const partes: string[] = [];
  if (r.servicoPct) partes.push(`${pct(r.servicoPct)} dos serviços`);
  if (r.pecaPct) partes.push(`${pct(r.pecaPct)} das peças`);
  if (r.fixo) partes.push(`${(r.fixo / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por OS`);
  return partes.join(" · ");
}

export function comissaoDaOS(r: Regra, o: { servicos: number; pecas: number }) {
  return Math.round((o.servicos * (r.servicoPct ?? 0)) / 100) + Math.round((o.pecas * (r.pecaPct ?? 0)) / 100) + (r.fixo ?? 0);
}

export type ApuracaoTecnico = {
  tecnico: { id: string; nome: string; ativo: boolean };
  regra: Regra;
  os: (OSEntregue & { comissao: number })[];
  servicos: number;
  pecas: number;
  total: number;
  /** OS do período que já estão num fechamento */
  jaFechadas: number;
};

/** OS que já entraram em algum fechamento ("tecnicoId:osId") */
export async function osJaFechadas(tx: DB, oficinaId: string, tecnicoId?: string) {
  const filtros = [eq(fechamentos.oficinaId, oficinaId)];
  if (tecnicoId) filtros.push(eq(fechamentos.tecnicoId, tecnicoId));
  const rows = await tx.select({ tecnicoId: fechamentos.tecnicoId, detalhes: fechamentos.detalhes }).from(fechamentos).where(and(...filtros));
  const set = new Set<string>();
  for (const r of rows) for (const d of r.detalhes) set.add(`${r.tecnicoId}:${d.osId}`);
  return set;
}

/**
 * Apuração do período para os técnicos com regra (ou só um técnico).
 * `semRegra`: técnicos sem regra que foram responsáveis por OS entregues no período.
 */
export async function apurarComissoes(oficinaId: string, de: string, ate: string, tecnicoId?: string) {
  const db = await getDb();
  const filtros = [eq(tecnicos.oficinaId, oficinaId)];
  if (tecnicoId) filtros.push(eq(tecnicos.id, tecnicoId));
  const lista = await db.select().from(tecnicos).where(and(...filtros)).orderBy(asc(tecnicos.nome));
  const entregues = await osEntregues(oficinaId, de, ate, tecnicoId);
  const fechadas = await osJaFechadas(db, oficinaId, tecnicoId);

  const apuracao: ApuracaoTecnico[] = [];
  const semRegra: { id: string; nome: string; qtd: number }[] = [];
  for (const t of lista) {
    const minhas = entregues.filter((o) => o.responsavelId === t.id);
    const regra = regraDo(t);
    if (!temRegra(regra)) {
      if (minhas.length) semRegra.push({ id: t.id, nome: t.nome, qtd: minhas.length });
      continue;
    }
    const pendentes = minhas.filter((o) => !fechadas.has(`${t.id}:${o.id}`)).map((o) => ({ ...o, comissao: comissaoDaOS(regra, o) }));
    apuracao.push({
      tecnico: { id: t.id, nome: t.nome, ativo: t.ativo },
      regra,
      os: pendentes,
      servicos: pendentes.reduce((s, o) => s + o.servicos, 0),
      pecas: pendentes.reduce((s, o) => s + o.pecas, 0),
      total: pendentes.reduce((s, o) => s + o.comissao, 0),
      jaFechadas: minhas.length - pendentes.length,
    });
  }
  // Técnicos ativos primeiro; quem tem algo a fechar no topo
  apuracao.sort((a, b) => Number(b.tecnico.ativo) - Number(a.tecnico.ativo) || Number(b.os.length > 0) - Number(a.os.length > 0));
  return { apuracao, semRegra };
}

/** Fechamentos mais recentes, com a situação da conta a pagar */
export async function listarFechamentos(oficinaId: string, limite = 50) {
  const db = await getDb();
  const rows = await db
    .select({
      id: fechamentos.id,
      tecnico: tecnicos.nome,
      de: fechamentos.de,
      ate: fechamentos.ate,
      valor: fechamentos.valor,
      detalhes: fechamentos.detalhes,
      criadoEm: fechamentos.criadoEm,
      lancamentoId: fechamentos.lancamentoId,
      status: lancamentos.status,
      vencimento: lancamentos.vencimento,
      baixasAtivas: sql<number>`(select count(*) from ${baixas} b where b.lancamento_id = ${fechamentos.lancamentoId} and b.estornada_em is null)::int`,
    })
    .from(fechamentos)
    .innerJoin(tecnicos, eq(tecnicos.id, fechamentos.tecnicoId))
    .leftJoin(lancamentos, eq(lancamentos.id, fechamentos.lancamentoId))
    .where(eq(fechamentos.oficinaId, oficinaId))
    .orderBy(desc(fechamentos.criadoEm))
    .limit(limite);
  return rows.map((r) => ({ ...r, valor: centavos(r.valor), qtdOS: r.detalhes.length, podeDesfazer: r.baixasAtivas === 0 }));
}

/** Há baixas não estornadas no lançamento? */
export async function lancamentoTemBaixas(tx: DB, lancamentoId: string) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(baixas)
    .where(and(eq(baixas.lancamentoId, lancamentoId), isNull(baixas.estornadaEm)));
  return (r?.n ?? 0) > 0;
}
