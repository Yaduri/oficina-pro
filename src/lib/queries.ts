import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ABERTAS, type StatusOS } from "@/lib/os";

const { ordensServico: os, osItens, veiculos, clientes, tecnicos, empresas } = schema;

/** Total da OS = soma de quantidade × valor dos itens */
const brutoOS = sql`coalesce((select sum(i.quantidade * i.valor_unitario) from ${osItens} i where i.os_id = ${os.id} and not i.recusado), 0)`;
/** Total da OS já com desconto (percentual ou valor fixo, nunca abaixo de zero) */
export const totalOS = sql<string>`greatest(${brutoOS} - coalesce(${brutoOS} * ${os.descontoPercentual} / 100, ${os.descontoValor}), 0)`;
const itensTotal = sql<number>`(select count(*) from ${osItens} i where i.os_id = ${os.id} and not i.recusado)::int`;
const itensFeitos = sql<number>`(select count(*) from ${osItens} i where i.os_id = ${os.id} and i.concluido and not i.recusado)::int`;

export type OSResumo = Awaited<ReturnType<typeof listarOSAbertas>>[number];

/** OS em andamento (no pátio), mais recentes primeiro */
export async function listarOSAbertas(oficinaId: string, empresaIds: string[]) {
  if (empresaIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      id: os.id,
      numero: os.numero,
      status: os.status,
      descricao: os.descricao,
      entradaEm: os.entradaEm,
      aprovacaoEnviadaEm: os.aprovacaoEnviadaEm,
      previsaoPecaEm: os.previsaoPecaEm,
      clienteAvisadoEm: os.clienteAvisadoEm,
      placa: veiculos.placa,
      modelo: veiculos.modelo,
      cliente: clientes.nome,
      responsavel: tecnicos.nome,
      empresaId: empresas.id,
      empresaNome: empresas.nome,
      empresaTipo: empresas.tipo,
      total: totalOS,
      itensTotal,
      itensFeitos,
    })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .innerJoin(empresas, eq(empresas.id, os.empresaId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .leftJoin(tecnicos, eq(tecnicos.id, os.responsavelId))
    .where(and(eq(os.oficinaId, oficinaId), inArray(os.empresaId, empresaIds), inArray(os.status, ABERTAS)))
    .orderBy(desc(os.entradaEm));
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

function inicioDoMes(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Faturamento do mês por empresa (OS entregues no mês) */
export async function faturamentoDoMes(oficinaId: string, empresaIds: string[]) {
  if (empresaIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      empresaId: os.empresaId,
      total: sql<string>`coalesce(sum(${totalOS}), 0)`,
    })
    .from(os)
    .where(
      and(
        eq(os.oficinaId, oficinaId),
        inArray(os.empresaId, empresaIds),
        eq(os.status, "entregue"),
        gte(os.entregueEm, inicioDoMes()),
      ),
    )
    .groupBy(os.empresaId);
  return rows.map((r) => ({ empresaId: r.empresaId, total: Number(r.total) }));
}

export type FiltroOS = {
  status?: StatusOS[];
  de?: Date;
  ate?: Date;
  responsavelId?: string;
  busca?: string;
};

/** Lista de OS (abertas e fechadas) com filtros, mais recentes primeiro */
export async function listarOS(oficinaId: string, empresaIds: string[], filtro: FiltroOS) {
  if (empresaIds.length === 0) return [];
  const db = await getDb();
  const cond = [eq(os.oficinaId, oficinaId), inArray(os.empresaId, empresaIds)];
  if (filtro.status?.length) cond.push(inArray(os.status, filtro.status));
  if (filtro.de) cond.push(gte(os.entradaEm, filtro.de));
  if (filtro.ate) cond.push(lt(os.entradaEm, filtro.ate));
  if (filtro.responsavelId) cond.push(eq(os.responsavelId, filtro.responsavelId));
  if (filtro.busca) {
    const b = `%${filtro.busca}%`;
    const numero = Number(filtro.busca.replace(/^#/, ""));
    cond.push(
      or(
        ilike(veiculos.placa, b),
        ilike(veiculos.modelo, b),
        ilike(clientes.nome, b),
        ...(Number.isInteger(numero) && numero > 0 ? [eq(os.numero, numero)] : []),
      )!,
    );
  }
  const rows = await db
    .select({
      id: os.id,
      numero: os.numero,
      status: os.status,
      descricao: os.descricao,
      entradaEm: os.entradaEm,
      entregueEm: os.entregueEm,
      placa: veiculos.placa,
      modelo: veiculos.modelo,
      cliente: clientes.nome,
      responsavel: tecnicos.nome,
      empresaNome: empresas.nome,
      empresaTipo: empresas.tipo,
      total: totalOS,
    })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .innerJoin(empresas, eq(empresas.id, os.empresaId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .leftJoin(tecnicos, eq(tecnicos.id, os.responsavelId))
    .where(and(...cond))
    .orderBy(desc(os.entradaEm))
    .limit(300);
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

/** Técnicos ativos da oficina (filtros e responsável da OS) */
export async function listarTecnicos(oficinaId: string) {
  const db = await getDb();
  return db
    .select({ id: tecnicos.id, nome: tecnicos.nome })
    .from(tecnicos)
    .where(and(eq(tecnicos.oficinaId, oficinaId), eq(tecnicos.ativo, true)))
    .orderBy(asc(tecnicos.nome));
}

/** Atualiza o status de uma OS da oficina, registrando datas relevantes */
export async function atualizarStatusOS(oficinaId: string, empresaIds: string[], osId: string, status: StatusOS) {
  const db = await getDb();
  const agora = new Date();
  const extra: Partial<typeof os.$inferInsert> = {};
  if (status === "entregue") extra.entregueEm = agora;
  if (status === "aguardando_aprovacao") extra.aprovacaoEnviadaEm = agora;
  const res = await db
    .update(os)
    .set({ status, ...extra })
    .where(and(eq(os.id, osId), eq(os.oficinaId, oficinaId), inArray(os.empresaId, empresaIds)))
    .returning({ id: os.id });
  return res.length > 0;
}

/** OS completa (com veículo, cliente, responsável, empresa e itens) */
export async function obterOS(oficinaId: string, empresaIds: string[], id: string) {
  if (empresaIds.length === 0) return null;
  const db = await getDb();
  const [row] = await db
    .select({ os, veiculo: veiculos, cliente: clientes, responsavel: tecnicos, empresa: empresas })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .innerJoin(empresas, eq(empresas.id, os.empresaId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .leftJoin(tecnicos, eq(tecnicos.id, os.responsavelId))
    .where(and(eq(os.id, id), eq(os.oficinaId, oficinaId), inArray(os.empresaId, empresaIds)));
  if (!row) return null;
  const itens = await db.select().from(osItens).where(eq(osItens.osId, id)).orderBy(asc(osItens.criadoEm));
  return {
    ...row,
    itens: itens.map((i) => ({ ...i, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario) })),
  };
}

/** Fotos tiradas durante o serviço */
export async function fotosDaOS(osId: string) {
  const db = await getDb();
  return db.select().from(schema.osFotos).where(eq(schema.osFotos.osId, osId)).orderBy(asc(schema.osFotos.criadoEm));
}

/** Histórico da OS, mais recentes primeiro */
export async function eventosDaOS(osId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.osEventos)
    .where(eq(schema.osEventos.osId, osId))
    .orderBy(desc(schema.osEventos.criadoEm))
    .limit(100);
}
