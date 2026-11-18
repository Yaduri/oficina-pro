"use server";

import { and, desc, eq, inArray, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { ABERTAS, STATUS } from "@/lib/os";
import { diaSP, inicioDoDia } from "@/lib/agenda-datas";
import { formatData } from "@/lib/utils";

/** Dias sem nenhuma movimentação para uma OS aberta ser considerada parada */
const DIAS_PARADA = 3;
/** Respostas e visualizações de orçamento aparecem por este tempo */
const DIAS_RECENTES = 7;
const DIA = 86_400_000;

export type Notificacao = {
  id: string;
  tipo: "aprovado" | "parcial" | "recusado" | "visto" | "peca" | "parada" | "entrega";
  titulo: string;
  detalhe: string;
  href: string;
  /** ISO */
  quando: string;
  nova: boolean;
};

const { ordensServico: os, orcamentos, veiculos, clientes, osEventos, membros } = schema;

/**
 * Notificações calculadas a partir dos dados (nada é gravado além de "lido até").
 * Só das empresas que o usuário vê; orçamentos só para quem vê valores.
 */
export async function minhasNotificacoes(): Promise<{ itens: Notificacao[]; novas: number }> {
  const ctx = await getContexto();
  const empresaIds = ctx.empresas.map((e) => e.id);
  if (empresaIds.length === 0) return { itens: [], novas: 0 };
  const db = await getDb();
  const agora = Date.now();
  const hoje = inicioDoDia(diaSP(new Date()));
  const base = and(eq(os.oficinaId, ctx.oficina.id), inArray(os.empresaId, empresaIds));
  const veiculo = (placa: string, modelo: string, numero: number) => `OS #${numero} · ${placa} ${modelo}`;
  const itens: Omit<Notificacao, "nova">[] = [];

  if (ctx.pode("verValores")) {
    const desde = new Date(agora - DIAS_RECENTES * DIA);
    const orcs = await db
      .select({
        id: orcamentos.id,
        status: orcamentos.status,
        vistoEm: orcamentos.vistoEm,
        respondidoEm: orcamentos.respondidoEm,
        respostaNome: orcamentos.respostaNome,
        osId: os.id,
        numero: os.numero,
        placa: veiculos.placa,
        modelo: veiculos.modelo,
        cliente: clientes.nome,
      })
      .from(orcamentos)
      .innerJoin(os, eq(os.id, orcamentos.osId))
      .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
      .leftJoin(clientes, eq(clientes.id, os.clienteId))
      .where(and(base, sql`greatest(${orcamentos.respondidoEm}, ${orcamentos.vistoEm}) >= ${desde.toISOString()}::timestamptz`))
      .orderBy(desc(orcamentos.criadoEm))
      .limit(30);
    for (const o of orcs) {
      const quem = o.respostaNome ?? o.cliente ?? "O cliente";
      if (o.respondidoEm && (o.status === "aprovado" || o.status === "parcial" || o.status === "recusado")) {
        const verbo = { aprovado: "aprovou o orçamento", parcial: "aprovou parte do orçamento", recusado: "recusou o orçamento" }[o.status];
        itens.push({
          id: `orc-${o.id}-${o.status}`,
          tipo: o.status,
          titulo: `${quem} ${verbo}`,
          detalhe: veiculo(o.placa, o.modelo, o.numero),
          href: `/ordens-servico/${o.osId}`,
          quando: o.respondidoEm.toISOString(),
        });
      } else if (o.vistoEm && o.status === "pendente") {
        itens.push({
          id: `orc-${o.id}-visto`,
          tipo: "visto",
          titulo: `${o.cliente ?? "O cliente"} abriu o orçamento`,
          detalhe: `${veiculo(o.placa, o.modelo, o.numero)} · ainda sem resposta`,
          href: `/ordens-servico/${o.osId}`,
          quando: o.vistoEm.toISOString(),
        });
      }
    }
  }

  // Peça com previsão vencida
  const pecas = await db
    .select({ id: os.id, numero: os.numero, previsao: os.previsaoPecaEm, placa: veiculos.placa, modelo: veiculos.modelo })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .where(and(base, eq(os.status, "aguardando_peca"), isNotNull(os.previsaoPecaEm), lt(os.previsaoPecaEm, hoje)))
    .limit(20);
  for (const p of pecas) {
    itens.push({
      id: `peca-${p.id}-${p.previsao!.getTime()}`,
      tipo: "peca",
      titulo: "Peça atrasada",
      detalhe: `${veiculo(p.placa, p.modelo, p.numero)} · previsão era ${formatData(p.previsao!)}`,
      href: `/ordens-servico/${p.id}`,
      quando: new Date(inicioDoDia(diaSP(p.previsao!)).getTime() + DIA).toISOString(),
    });
  }

  // Entrega prevista vencida
  const entregas = await db
    .select({ id: os.id, numero: os.numero, previsao: os.previsaoEntregaEm, placa: veiculos.placa, modelo: veiculos.modelo })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .where(and(base, isNotNull(os.previsaoEntregaEm), lt(os.previsaoEntregaEm, hoje), notInArray(os.status, ["entregue", "cancelada"])))
    .limit(20);
  for (const e of entregas) {
    itens.push({
      id: `entrega-${e.id}-${e.previsao!.getTime()}`,
      tipo: "entrega",
      titulo: "Entrega atrasada",
      detalhe: `${veiculo(e.placa, e.modelo, e.numero)} · prevista para ${formatData(e.previsao!)}`,
      href: `/ordens-servico/${e.id}`,
      quando: new Date(inicioDoDia(diaSP(e.previsao!)).getTime() + DIA).toISOString(),
    });
  }

  // OS aberta sem nenhuma movimentação há DIAS_PARADA dias (peça com previsão futura não conta)
  const ultimo = sql<Date>`coalesce((select max(${osEventos.criadoEm}) from ${osEventos} where ${osEventos.osId} = ${os.id}), ${os.entradaEm})`;
  const limite = new Date(agora - DIAS_PARADA * DIA);
  const paradas = await db
    .select({ id: os.id, numero: os.numero, status: os.status, previsaoPeca: os.previsaoPecaEm, placa: veiculos.placa, modelo: veiculos.modelo, ultimo })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .where(and(base, inArray(os.status, ABERTAS), sql`${ultimo} < ${limite.toISOString()}::timestamptz`))
    .limit(20);
  for (const p of paradas) {
    if (p.status === "aguardando_peca" && p.previsaoPeca && p.previsaoPeca >= hoje) continue;
    const desde = new Date(p.ultimo);
    const dias = Math.floor((agora - desde.getTime()) / DIA);
    itens.push({
      id: `parada-${p.id}-${desde.getTime()}`,
      tipo: "parada",
      titulo: `OS parada há ${dias} dias`,
      detalhe: `${veiculo(p.placa, p.modelo, p.numero)} · ${STATUS[p.status].label}`,
      href: `/ordens-servico/${p.id}`,
      quando: new Date(desde.getTime() + DIAS_PARADA * DIA).toISOString(),
    });
  }

  const lidas = ctx.membro.notificacoesLidasEm?.getTime() ?? 0;
  const ordenadas = itens
    .filter((i) => new Date(i.quando).getTime() <= agora)
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, 30)
    .map((i) => ({ ...i, nova: new Date(i.quando).getTime() > lidas }));
  return { itens: ordenadas, novas: ordenadas.filter((i) => i.nova).length };
}

/** Marca tudo como lido (ao abrir o sino) */
export async function marcarNotificacoesLidas() {
  const ctx = await getContexto();
  const db = await getDb();
  await db.update(membros).set({ notificacoesLidasEm: new Date() }).where(eq(membros.id, ctx.membro.id));
}
