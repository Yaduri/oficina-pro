import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type TipoCatalogo = "servico" | "peca";

export type ItemCatalogo = {
  id: string;
  tipo: TipoCatalogo;
  codigo: string | null;
  descricao: string;
  valor: number;
  tempoMinutos: number | null;
  codigoServicoMunicipal: string | null;
  ativo: boolean;
  /* Peça: estoque (saldo e custo médio só mudam pelos movimentos de lib/estoque.ts) */
  controlaEstoque: boolean;
  unidade: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  localizacao: string | null;
  marca: string | null;
  gtin: string | null;
  ncm: string | null;
};

/** Catálogo da oficina (só ativos para lançar na OS; todos na tela de configuração) */
export async function listarCatalogo(oficinaId: string, opcoes: { tipo?: TipoCatalogo; soAtivos?: boolean } = {}): Promise<ItemCatalogo[]> {
  const db = await getDb();
  const c = schema.catalogoItens;
  const filtros = [eq(c.oficinaId, oficinaId)];
  if (opcoes.tipo) filtros.push(eq(c.tipo, opcoes.tipo));
  if (opcoes.soAtivos) filtros.push(eq(c.ativo, true));
  const rows = await db
    .select({
      id: c.id,
      tipo: c.tipo,
      codigo: c.codigo,
      descricao: c.descricao,
      valor: c.valor,
      tempoMinutos: c.tempoMinutos,
      codigoServicoMunicipal: c.codigoServicoMunicipal,
      ativo: c.ativo,
      controlaEstoque: c.controlaEstoque,
      unidade: c.unidade,
      estoqueAtual: c.estoqueAtual,
      estoqueMinimo: c.estoqueMinimo,
      localizacao: c.localizacao,
      marca: c.marca,
      gtin: c.gtin,
      ncm: c.ncm,
    })
    .from(c)
    .where(and(...filtros))
    .orderBy(asc(c.descricao));
  return rows.map((r) => ({
    ...r,
    valor: Number(r.valor),
    estoqueAtual: Number(r.estoqueAtual),
    estoqueMinimo: Number(r.estoqueMinimo),
  }));
}

/** "90" → "1h30" */
export function formatTempo(min: number | null | undefined) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}
