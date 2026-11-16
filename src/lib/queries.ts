import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ABERTAS, type StatusOS } from "@/lib/os";

const { ordensServico: os, osItens, veiculos, clientes, tecnicos, empresas, agendamentos } = schema;

/** Total da OS = soma de quantidade × valor dos itens */
const totalOS = sql<string>`coalesce((select sum(i.quantidade * i.valor_unitario) from ${osItens} i where i.os_id = ${os.id} and not i.recusado), 0)`;
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
      total: sql<string>`coalesce(sum(${osItens.quantidade} * ${osItens.valorUnitario}), 0)`,
    })
    .from(os)
    .innerJoin(osItens, eq(osItens.osId, os.id))
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

/** Agenda de hoje (fuso de São Paulo) */
export async function agendaDeHoje(oficinaId: string, empresaIds: string[]) {
  const db = await getDb();
  const agora = new Date();
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  const fim = new Date(inicio.getTime() + 86_400_000);
  return db
    .select({
      id: agendamentos.id,
      titulo: agendamentos.titulo,
      detalhe: agendamentos.detalhe,
      inicio: agendamentos.inicio,
      tipo: agendamentos.tipo,
      empresaNome: empresas.nome,
      empresaTipo: empresas.tipo,
      empresaId: agendamentos.empresaId,
    })
    .from(agendamentos)
    .leftJoin(empresas, eq(empresas.id, agendamentos.empresaId))
    .where(and(eq(agendamentos.oficinaId, oficinaId), gte(agendamentos.inicio, inicio), lt(agendamentos.inicio, fim)))
    .orderBy(asc(agendamentos.inicio))
    .then((rows) => rows.filter((r) => !r.empresaId || empresaIds.includes(r.empresaId)));
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
