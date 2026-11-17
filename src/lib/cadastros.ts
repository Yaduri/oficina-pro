import "server-only";
import { totalOS } from "@/lib/queries";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatPlaca, soDigitos } from "@/lib/utils";

/*
 * Clientes e veículos são compartilhados pela oficina (as duas empresas atendem o mesmo cliente).
 * Toda consulta filtra por oficina_id.
 */

const { clientes, veiculos, ordensServico: os, empresas, checkins, veiculoTransferencias } = schema;

export type Cliente = typeof clientes.$inferSelect;
export type Veiculo = typeof veiculos.$inferSelect;

/** Lista de clientes com as placas dos veículos; busca por nome, documento, telefone ou placa */
export async function listarClientes(oficinaId: string, busca?: string, arquivados = false) {
  const db = await getDb();
  const q = busca?.trim();
  let filtro = and(eq(clientes.oficinaId, oficinaId), arquivados ? isNotNull(clientes.arquivadoEm) : isNull(clientes.arquivadoEm))!;
  if (q) {
    const digitos = soDigitos(q);
    const placa = formatPlaca(q);
    const termos = [ilike(clientes.nome, `%${q}%`)];
    if (digitos.length >= 3) {
      termos.push(ilike(clientes.documento, `%${digitos}%`), ilike(clientes.telefone, `%${digitos}%`));
    }
    if (placa.length >= 3) {
      termos.push(
        sql`exists (select 1 from ${veiculos} v where v.cliente_id = ${clientes.id} and v.placa like ${`%${placa}%`})`,
      );
    }
    filtro = and(filtro, or(...termos))!;
  }

  const lista = await db.select().from(clientes).where(filtro).orderBy(asc(clientes.nome)).limit(200);
  if (lista.length === 0) return [];

  const vs = await db
    .select({ clienteId: veiculos.clienteId, placa: veiculos.placa, modelo: veiculos.modelo })
    .from(veiculos)
    .where(and(eq(veiculos.oficinaId, oficinaId), inArray(veiculos.clienteId, lista.map((c) => c.id)), isNull(veiculos.arquivadoEm)))
    .orderBy(asc(veiculos.placa));

  return lista.map((c) => ({ ...c, veiculos: vs.filter((v) => v.clienteId === c.id) }));
}

/** Opções simples para selects (Nova OS) */
export async function opcoesClientes(oficinaId: string) {
  const db = await getDb();
  return db
    .select({ id: clientes.id, nome: clientes.nome, telefone: clientes.telefone })
    .from(clientes)
    .where(and(eq(clientes.oficinaId, oficinaId), isNull(clientes.arquivadoEm)))
    .orderBy(asc(clientes.nome));
}

/** Quantas OS e check-ins o cliente tem (e os veículos dele) — decide entre excluir e arquivar */
export async function usoDoCliente(oficinaId: string, clienteId: string) {
  const db = await getDb();
  const doCliente = and(eq(os.oficinaId, oficinaId), or(eq(os.clienteId, clienteId), sql`${os.veiculoId} in (select id from ${veiculos} where cliente_id = ${clienteId})`));
  const [{ n: nOS }] = await db.select({ n: count() }).from(os).where(doCliente);
  const [{ n: nCk }] = await db
    .select({ n: count() })
    .from(checkins)
    .where(and(eq(checkins.oficinaId, oficinaId), or(eq(checkins.clienteId, clienteId), sql`${checkins.veiculoId} in (select id from ${veiculos} where cliente_id = ${clienteId})`)));
  return nOS + nCk;
}

/** Quantas OS e check-ins o veículo tem */
export async function usoDoVeiculo(oficinaId: string, veiculoId: string) {
  const db = await getDb();
  const [{ n: nOS }] = await db.select({ n: count() }).from(os).where(and(eq(os.oficinaId, oficinaId), eq(os.veiculoId, veiculoId)));
  const [{ n: nCk }] = await db.select({ n: count() }).from(checkins).where(and(eq(checkins.oficinaId, oficinaId), eq(checkins.veiculoId, veiculoId)));
  return nOS + nCk;
}

/** Histórico do veículo: todas as OS (de qualquer dono) e as trocas de dono */
export async function historicoVeiculo(oficinaId: string, empresaIds: string[], veiculoId: string) {
  const db = await getDb();
  const [ordens, trocas] = await Promise.all([
    empresaIds.length === 0
      ? []
      : db
          .select({
            id: os.id,
            numero: os.numero,
            status: os.status,
            descricao: os.descricao,
            entradaEm: os.entradaEm,
            kmEntrada: os.kmEntrada,
            cliente: clientes.nome,
            empresaNome: empresas.nome,
            empresaTipo: empresas.tipo,
            total: totalOS,
          })
          .from(os)
          .innerJoin(empresas, eq(empresas.id, os.empresaId))
          .leftJoin(clientes, eq(clientes.id, os.clienteId))
          .where(and(eq(os.oficinaId, oficinaId), eq(os.veiculoId, veiculoId), inArray(os.empresaId, empresaIds)))
          .orderBy(desc(os.entradaEm))
          .limit(100),
    db
      .select()
      .from(veiculoTransferencias)
      .where(and(eq(veiculoTransferencias.oficinaId, oficinaId), eq(veiculoTransferencias.veiculoId, veiculoId)))
      .orderBy(desc(veiculoTransferencias.criadoEm)),
  ]);
  return { ordens: ordens.map((r) => ({ ...r, total: Number(r.total) })), trocas };
}

export async function obterCliente(oficinaId: string, id: string) {
  const db = await getDb();
  const [cliente] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.oficinaId, oficinaId)));
  if (!cliente) return null;
  const vs = await db
    .select()
    .from(veiculos)
    .where(and(eq(veiculos.clienteId, id), eq(veiculos.oficinaId, oficinaId)))
    .orderBy(asc(veiculos.placa));
  return { ...cliente, veiculos: vs };
}

/** Histórico de OS de um cliente (todas as empresas que o usuário pode ver) */
export async function historicoCliente(oficinaId: string, empresaIds: string[], clienteId: string) {
  if (empresaIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      id: os.id,
      numero: os.numero,
      status: os.status,
      descricao: os.descricao,
      entradaEm: os.entradaEm,
      placa: veiculos.placa,
      modelo: veiculos.modelo,
      empresaNome: empresas.nome,
      empresaTipo: empresas.tipo,
      total: totalOS,
    })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .innerJoin(empresas, eq(empresas.id, os.empresaId))
    .where(and(eq(os.oficinaId, oficinaId), eq(os.clienteId, clienteId), inArray(os.empresaId, empresaIds)))
    .orderBy(desc(os.entradaEm))
    .limit(100);
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export async function obterVeiculo(oficinaId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ veiculo: veiculos, cliente: clientes })
    .from(veiculos)
    .leftJoin(clientes, eq(clientes.id, veiculos.clienteId))
    .where(and(eq(veiculos.id, id), eq(veiculos.oficinaId, oficinaId)));
  return row ?? null;
}

export async function buscarVeiculoPorPlaca(oficinaId: string, placa: string) {
  const db = await getDb();
  const [row] = await db
    .select({ veiculo: veiculos, cliente: clientes })
    .from(veiculos)
    .leftJoin(clientes, eq(clientes.id, veiculos.clienteId))
    .where(and(eq(veiculos.oficinaId, oficinaId), eq(veiculos.placa, formatPlaca(placa))));
  return row ?? null;
}
