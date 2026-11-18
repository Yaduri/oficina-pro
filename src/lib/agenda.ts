import "server-only";
import { and, asc, eq, gte, isNotNull, lt, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { agendamentos: ag, veiculos, clientes, tecnicos, ordensServico: os } = schema;

export type ItemAgenda = Awaited<ReturnType<typeof listarAgendamentos>>[number];
export type EntregaPrevista = Awaited<ReturnType<typeof entregasPrevistas>>[number];

/** Agendamentos entre `de` e `ate` */
export async function listarAgendamentos(
  oficinaId: string,
  de: Date,
  ate: Date,
  filtro: { tecnicoId?: string; incluirCancelados?: boolean } = {},
) {
  const db = await getDb();
  const cond = [
    eq(ag.oficinaId, oficinaId),
    gte(ag.inicio, de),
    lt(ag.inicio, ate),
  ];
  if (filtro.tecnicoId) cond.push(eq(ag.tecnicoId, filtro.tecnicoId));
  if (!filtro.incluirCancelados) cond.push(notInArray(ag.status, ["cancelado"]));
  return db
    .select({
      id: ag.id,
      titulo: ag.titulo,
      detalhe: ag.detalhe,
      inicio: ag.inicio,
      duracaoMin: ag.duracaoMin,
      status: ag.status,
      checkinId: ag.checkinId,
      tecnicoId: ag.tecnicoId,
      tecnico: tecnicos.nome,
      veiculoId: ag.veiculoId,
      placa: veiculos.placa,
      marca: veiculos.marca,
      modelo: veiculos.modelo,
      clienteId: ag.clienteId,
      cliente: clientes.nome,
      telefone: clientes.telefone,
      aceitaWhatsapp: clientes.aceitaWhatsapp,
    })
    .from(ag)
    .leftJoin(tecnicos, eq(tecnicos.id, ag.tecnicoId))
    .leftJoin(veiculos, eq(veiculos.id, ag.veiculoId))
    .leftJoin(clientes, eq(clientes.id, ag.clienteId))
    .where(and(...cond))
    .orderBy(asc(ag.inicio));
}

/** OS abertas com previsão de entrega entre `de` e `ate` */
export async function entregasPrevistas(oficinaId: string, de: Date, ate: Date, tecnicoId?: string) {
  const db = await getDb();
  const cond = [
    eq(os.oficinaId, oficinaId),
    isNotNull(os.previsaoEntregaEm),
    gte(os.previsaoEntregaEm, de),
    lt(os.previsaoEntregaEm, ate),
    notInArray(os.status, ["entregue", "cancelada"]),
  ];
  if (tecnicoId) cond.push(eq(os.responsavelId, tecnicoId));
  return db
    .select({
      id: os.id,
      numero: os.numero,
      status: os.status,
      previsao: os.previsaoEntregaEm,
      placa: veiculos.placa,
      modelo: veiculos.modelo,
      cliente: clientes.nome,
    })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .where(and(...cond))
    .orderBy(asc(os.previsaoEntregaEm), asc(os.numero));
}

/** Um agendamento da oficina (para editar ou virar check-in) */
export async function obterAgendamento(oficinaId: string, id: string) {
  const db = await getDb();
  const [a] = await db
    .select({ agendamento: ag, veiculo: veiculos, cliente: clientes })
    .from(ag)
    .leftJoin(veiculos, eq(veiculos.id, ag.veiculoId))
    .leftJoin(clientes, eq(clientes.id, ag.clienteId))
    .where(and(eq(ag.id, id), eq(ag.oficinaId, oficinaId)));
  return a ?? null;
}
