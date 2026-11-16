import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { checkins, checkinFotos, veiculos, clientes, ordensServico: os, empresas } = schema;

/** OS geradas por cada check-in, para exibir junto */
async function osDosCheckins(ids: string[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db
    .select({
      checkinId: os.checkinId,
      id: os.id,
      numero: os.numero,
      status: os.status,
      empresaId: empresas.id,
      empresaNome: empresas.nome,
      empresaTipo: empresas.tipo,
    })
    .from(os)
    .innerJoin(empresas, eq(empresas.id, os.empresaId))
    .where(inArray(os.checkinId, ids))
    .orderBy(asc(os.numero));
}

export async function listarCheckins(oficinaId: string, empresaIds: string[]) {
  const db = await getDb();
  const lista = await db
    .select({
      id: checkins.id,
      criadoEm: checkins.criadoEm,
      relato: checkins.relato,
      km: checkins.km,
      assinado: checkins.assinaturaKey,
      placa: veiculos.placa,
      modelo: veiculos.modelo,
      marca: veiculos.marca,
      cliente: clientes.nome,
    })
    .from(checkins)
    .innerJoin(veiculos, eq(veiculos.id, checkins.veiculoId))
    .leftJoin(clientes, eq(clientes.id, checkins.clienteId))
    .where(eq(checkins.oficinaId, oficinaId))
    .orderBy(desc(checkins.criadoEm))
    .limit(100);

  const ids = lista.map((c) => c.id);
  const [ordens, fotos] = await Promise.all([
    osDosCheckins(ids),
    ids.length
      ? db
          .select({ checkinId: checkinFotos.checkinId, key: checkinFotos.key, ordem: checkinFotos.ordem })
          .from(checkinFotos)
          .where(inArray(checkinFotos.checkinId, ids))
          .orderBy(asc(checkinFotos.ordem))
      : Promise.resolve([]),
  ]);

  return (
    lista
      .map((c) => ({
        ...c,
        assinado: Boolean(c.assinado),
        ordens: ordens.filter((o) => o.checkinId === c.id),
        fotos: fotos.filter((f) => f.checkinId === c.id).map((f) => f.key),
      }))
      // Mostra o check-in se alguma OS dele é de uma empresa visível (ou se ainda não tem OS)
      .filter((c) => c.ordens.length === 0 || c.ordens.some((o) => empresaIds.includes(o.empresaId)))
  );
}

export async function obterCheckin(oficinaId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ checkin: checkins, veiculo: veiculos, cliente: clientes })
    .from(checkins)
    .innerJoin(veiculos, eq(veiculos.id, checkins.veiculoId))
    .leftJoin(clientes, eq(clientes.id, checkins.clienteId))
    .where(and(eq(checkins.id, id), eq(checkins.oficinaId, oficinaId)));
  if (!row) return null;
  const [fotos, ordens] = await Promise.all([
    db.select().from(checkinFotos).where(eq(checkinFotos.checkinId, id)).orderBy(asc(checkinFotos.ordem)),
    osDosCheckins([id]),
  ]);
  return { ...row, fotos, ordens };
}

/** Fotos do check-in de uma OS (para a tela da OS) */
export async function fotosDoCheckin(checkinId: string) {
  const db = await getDb();
  return db
    .select({ id: checkinFotos.id, key: checkinFotos.key, posicao: checkinFotos.posicao })
    .from(checkinFotos)
    .where(eq(checkinFotos.checkinId, checkinId))
    .orderBy(asc(checkinFotos.ordem));
}

/** Checklist registrado no check-in de uma OS */
export async function checklistDoCheckin(checkinId: string) {
  const db = await getDb();
  const [r] = await db.select({ checklist: checkins.checklist }).from(checkins).where(eq(checkins.id, checkinId));
  return r?.checklist ?? null;
}
