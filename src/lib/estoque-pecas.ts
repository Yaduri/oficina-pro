import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { TipoMovimentoEstoque } from "@/db/schema";

/* Consultas das telas de estoque (peças, detalhe, reposição e inventário) */

const { catalogoItens: cat, estoqueMovimentos: mov } = schema;

export type PecaEstoque = {
  id: string;
  codigo: string | null;
  descricao: string;
  marca: string | null;
  localizacao: string | null;
  gtin: string | null;
  ncm: string | null;
  unidade: string;
  ativo: boolean;
  controlaEstoque: boolean;
  saldo: number;
  minimo: number;
  custoMedio: number;
  venda: number;
};

const colunas = {
  id: cat.id,
  codigo: cat.codigo,
  descricao: cat.descricao,
  marca: cat.marca,
  localizacao: cat.localizacao,
  gtin: cat.gtin,
  ncm: cat.ncm,
  unidade: cat.unidade,
  ativo: cat.ativo,
  controlaEstoque: cat.controlaEstoque,
  saldo: cat.estoqueAtual,
  minimo: cat.estoqueMinimo,
  custoMedio: cat.custoMedio,
  venda: cat.valor,
};

type Numericos = "saldo" | "minimo" | "custoMedio" | "venda";
type Linha = Omit<PecaEstoque, Numericos> & Record<Numericos, string>;
const converter = (r: Linha): PecaEstoque => ({
  ...r,
  saldo: Number(r.saldo),
  minimo: Number(r.minimo),
  custoMedio: Number(r.custoMedio),
  venda: Number(r.venda),
});

/** Peças ativas que controlam estoque */
export async function listarPecasEstoque(oficinaId: string) {
  const db = await getDb();
  const rows = await db
    .select(colunas)
    .from(cat)
    .where(and(eq(cat.oficinaId, oficinaId), eq(cat.tipo, "peca"), eq(cat.controlaEstoque, true), eq(cat.ativo, true)))
    .orderBy(asc(cat.descricao));
  return rows.map(converter);
}

/** Peças ativas do catálogo sem controle de estoque */
export async function contarPecasSemControle(oficinaId: string) {
  const db = await getDb();
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cat)
    .where(and(eq(cat.oficinaId, oficinaId), eq(cat.tipo, "peca"), eq(cat.controlaEstoque, false), eq(cat.ativo, true)));
  return Number(r?.n ?? 0);
}

/** Abaixo do mínimo (com mínimo definido) ou com saldo negativo */
export function precisaRepor(p: Pick<PecaEstoque, "saldo" | "minimo">) {
  return p.saldo < 0 || (p.minimo > 0 && p.saldo <= p.minimo);
}

export async function obterPeca(oficinaId: string, id: string) {
  const db = await getDb();
  const [r] = await db
    .select(colunas)
    .from(cat)
    .where(and(eq(cat.id, id), eq(cat.oficinaId, oficinaId), eq(cat.tipo, "peca")));
  return r ? converter(r) : null;
}

export type MovimentoPeca = {
  id: string;
  criadoEm: Date;
  tipo: TipoMovimentoEstoque;
  quantidade: number;
  custoUnitario: number;
  saldoApos: number;
  osId: string | null;
  osNumero: number | null;
  compraId: string | null;
  compraNumero: number | null;
  motivo: string | null;
  criadoPor: string | null;
};

/** Últimos movimentos da peça (mais recentes primeiro) */
export async function movimentosDaPeca(oficinaId: string, catalogoItemId: string, limite = 300): Promise<MovimentoPeca[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: mov.id,
      criadoEm: mov.criadoEm,
      tipo: mov.tipo,
      quantidade: mov.quantidade,
      custoUnitario: mov.custoUnitario,
      saldoApos: mov.saldoApos,
      osId: mov.osId,
      osNumero: schema.ordensServico.numero,
      compraId: mov.compraId,
      compraNumero: schema.compras.numero,
      motivo: mov.motivo,
      criadoPor: mov.criadoPor,
    })
    .from(mov)
    .leftJoin(schema.ordensServico, eq(schema.ordensServico.id, mov.osId))
    .leftJoin(schema.compras, eq(schema.compras.id, mov.compraId))
    .where(and(eq(mov.oficinaId, oficinaId), eq(mov.catalogoItemId, catalogoItemId)))
    .orderBy(desc(mov.criadoEm), desc(mov.id))
    .limit(limite);

  // criadoPor pode ser o nome ou o id do usuário (Clerk): mostra o nome
  const ids = [...new Set(rows.map((r) => r.criadoPor).filter((x): x is string => !!x && x.startsWith("user_")))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const ms = await db
      .select({ id: schema.membros.clerkUserId, nome: schema.membros.nome, email: schema.membros.email })
      .from(schema.membros)
      .where(and(eq(schema.membros.oficinaId, oficinaId), inArray(schema.membros.clerkUserId, ids)));
    for (const m of ms) nomes.set(m.id, m.nome || m.email || "Usuário");
  }

  return rows.map((r) => ({
    ...r,
    quantidade: Number(r.quantidade),
    custoUnitario: Number(r.custoUnitario),
    saldoApos: Number(r.saldoApos),
    criadoPor: r.criadoPor ? (nomes.get(r.criadoPor) ?? r.criadoPor) : null,
  }));
}
