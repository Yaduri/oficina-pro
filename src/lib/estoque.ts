import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import type { TipoMovimentoEstoque } from "@/db/schema";

/*
 * Estoque (Fase 4). Regras:
 * - Só peças do catálogo com controlaEstoque = true têm saldo.
 * - Saldo e custo médio do catálogo só mudam por `movimentar` (sempre dentro de uma transação,
 *   com a linha da peça travada), e cada mudança fica em estoque_movimentos.
 * - Custo médio ponderado: muda só nas entradas com custo (compra, ajuste para mais com custo).
 *   Se o saldo antes da entrada era zero ou negativo, o custo médio passa a ser o da entrada.
 * - Saldo pode ficar negativo (a peça foi usada antes de a nota ser lançada); a tela avisa.
 * - Saída pela OS: a OS consome as peças quando sai do orçamento (status em STATUS_CONSOME).
 *   `sincronizarEstoqueOS` compara o que cada item deveria ter consumido com o que já saiu
 *   (soma dos movimentos do item) e lança só a diferença. Chamar depois de qualquer mudança em
 *   itens ou status da OS; é idempotente.
 */

const { catalogoItens: cat, estoqueMovimentos: mov, osItens, ordensServico } = schema;

/** Status em que as peças da OS já saíram do estoque (orçamento aprovado em diante) */
export const STATUS_CONSOME = new Set(["aguardando_peca", "em_execucao", "pronto", "entregue"]);

export const TIPOS_MOVIMENTO: Record<TipoMovimentoEstoque, string> = {
  entrada: "Entrada",
  saida_os: "Saída na OS",
  devolucao_os: "Devolução da OS",
  ajuste: "Ajuste",
  estorno_compra: "Estorno de entrada",
};

/** numeric(12,3) → número */
export const qtd = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 1000) / 1000;
const q3 = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3);
const c4 = (n: number) => (Math.round(n * 10000) / 10000).toFixed(4);

/** "1.000" → "1"; "2.500" → "2,5" */
export function formatQtd(v: string | number, unidade?: string | null) {
  const n = qtd(v);
  const s = n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return unidade && unidade !== "UN" ? `${s} ${unidade}` : s;
}

export type NovoMovimento = {
  oficinaId: string;
  catalogoItemId: string;
  tipo: TipoMovimentoEstoque;
  /** Com sinal: + entra, − sai */
  quantidade: number;
  /** Entradas: custo unitário (sem ele, mantém o custo médio). Estorno de compra: custo da entrada,
   *  para desfazer a média. Outras saídas: ignorado (usa o médio). */
  custoUnitario?: number | null;
  osId?: string | null;
  osItemId?: string | null;
  compraId?: string | null;
  motivo?: string | null;
  criadoPor?: string | null;
};

/**
 * Lança um movimento e atualiza saldo e custo médio da peça. Use dentro de `db.transaction`.
 * Retorna null se a peça não for da oficina ou não controlar estoque.
 */
export async function movimentar(tx: DB, m: NovoMovimento) {
  if (!m.quantidade) return null;
  const [p] = await tx
    .select({ saldo: cat.estoqueAtual, custo: cat.custoMedio, controla: cat.controlaEstoque })
    .from(cat)
    .where(and(eq(cat.id, m.catalogoItemId), eq(cat.oficinaId, m.oficinaId)))
    .for("update");
  if (!p || !p.controla) return null;

  const saldo = qtd(p.saldo);
  const custo = Number(p.custo);
  const novoSaldo = saldo + m.quantidade;
  let novoCusto = custo;
  let custoMov = custo;
  if (m.quantidade > 0 && m.custoUnitario != null && m.custoUnitario >= 0) {
    custoMov = m.custoUnitario;
    novoCusto = saldo <= 0 ? m.custoUnitario : (saldo * custo + m.quantidade * m.custoUnitario) / (saldo + m.quantidade);
  } else if (m.tipo === "estorno_compra" && m.quantidade < 0 && m.custoUnitario != null && novoSaldo > 0) {
    // Desfaz a média da entrada estornada (sai pelo custo com que entrou)
    custoMov = m.custoUnitario;
    novoCusto = Math.max(0, (saldo * custo + m.quantidade * m.custoUnitario) / novoSaldo);
  }

  await tx
    .update(cat)
    .set({ estoqueAtual: q3(novoSaldo), custoMedio: c4(novoCusto) })
    .where(eq(cat.id, m.catalogoItemId));
  const [row] = await tx
    .insert(mov)
    .values({
      oficinaId: m.oficinaId,
      catalogoItemId: m.catalogoItemId,
      tipo: m.tipo,
      quantidade: q3(m.quantidade),
      custoUnitario: c4(custoMov),
      saldoApos: q3(novoSaldo),
      custoMedioApos: c4(novoCusto),
      osId: m.osId ?? null,
      osItemId: m.osItemId ?? null,
      compraId: m.compraId ?? null,
      motivo: m.motivo ?? null,
      criadoPor: m.criadoPor ?? null,
    })
    .returning({ id: mov.id });
  return { id: row.id, saldo: novoSaldo, custoMedio: novoCusto };
}

/**
 * Acerta o estoque com os itens atuais da OS (ver regras no topo). Pode ser chamada fora de
 * transação: abre a sua. Itens removidos da OS devolvem o que tinham consumido.
 */
export async function sincronizarEstoqueOS(oficinaId: string, osId: string, criadoPor?: string | null, tx?: DB) {
  const run = async (t: DB) => {
    const [o] = await t
      .select({ status: ordensServico.status, numero: ordensServico.numero })
      .from(ordensServico)
      .where(and(eq(ordensServico.id, osId), eq(ordensServico.oficinaId, oficinaId)));
    if (!o) return;
    const consome = STATUS_CONSOME.has(o.status);

    // O que cada item deveria ter consumido, por (item, peça)
    const itens = await t
      .select({ id: osItens.id, catalogoItemId: osItens.catalogoItemId, quantidade: osItens.quantidade, recusado: osItens.recusado })
      .from(osItens)
      .innerJoin(cat, eq(cat.id, osItens.catalogoItemId))
      .where(and(eq(osItens.osId, osId), eq(cat.controlaEstoque, true), eq(osItens.tipo, "peca")));
    const chave = (item: string, peca: string) => `${item}|${peca}`;
    const desejado = new Map<string, number>();
    for (const i of itens) {
      if (!i.catalogoItemId) continue;
      desejado.set(chave(i.id, i.catalogoItemId), consome && !i.recusado ? qtd(i.quantidade) : 0);
    }

    // O que já saiu (saídas negativas, devoluções positivas)
    const feitos = await t
      .select({
        osItemId: mov.osItemId,
        catalogoItemId: mov.catalogoItemId,
        total: sql<string>`coalesce(sum(${mov.quantidade}), 0)`,
        custo: sql<string>`coalesce(sum(case when ${mov.quantidade} < 0 then -${mov.quantidade} * ${mov.custoUnitario} end) / nullif(sum(case when ${mov.quantidade} < 0 then -${mov.quantidade} end), 0), 0)`,
      })
      .from(mov)
      .where(and(eq(mov.osId, osId), inArray(mov.tipo, ["saida_os", "devolucao_os"])))
      .groupBy(mov.osItemId, mov.catalogoItemId);
    const consumido = new Map<string, { qtd: number; custo: number }>();
    for (const f of feitos) {
      if (!f.osItemId) continue;
      consumido.set(chave(f.osItemId, f.catalogoItemId), { qtd: -qtd(f.total), custo: Number(f.custo) });
    }

    const chaves = new Set([...desejado.keys(), ...consumido.keys()]);
    for (const k of chaves) {
      const [osItemId, catalogoItemId] = k.split("|");
      const quer = desejado.get(k) ?? 0;
      const ja = consumido.get(k);
      const diff = Math.round((quer - (ja?.qtd ?? 0)) * 1000) / 1000;
      if (!diff) continue;
      await movimentar(t, {
        oficinaId,
        catalogoItemId,
        tipo: diff > 0 ? "saida_os" : "devolucao_os",
        quantidade: -diff,
        // Devolução volta pelo custo com que saiu
        custoUnitario: diff < 0 ? (ja?.custo ?? null) : null,
        osId,
        osItemId,
        motivo: `OS #${o.numero}`,
        criadoPor: criadoPor ?? null,
      });
    }
  };
  if (tx) return run(tx);
  const db = await getDb();
  return db.transaction(run);
}

/** Valor do estoque (saldo positivo × custo médio), em reais */
export async function valorDoEstoque(oficinaId: string) {
  const db = await getDb();
  const [r] = await db
    .select({ total: sql<string>`coalesce(sum(greatest(${cat.estoqueAtual}, 0) * ${cat.custoMedio}), 0)` })
    .from(cat)
    .where(and(eq(cat.oficinaId, oficinaId), eq(cat.controlaEstoque, true), eq(cat.ativo, true)));
  return Number(r?.total ?? 0);
}

/** Próximo número de compra da oficina (chamar dentro da transação que cria a compra) */
export async function proximoNumeroCompra(tx: DB, oficinaId: string) {
  const [r] = await tx
    .select({ n: sql<number>`coalesce(max(${schema.compras.numero}), 0) + 1` })
    .from(schema.compras)
    .where(eq(schema.compras.oficinaId, oficinaId));
  return Number(r?.n ?? 1);
}
