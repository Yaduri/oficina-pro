import "server-only";
import { and, desc, eq, gt, gte, ilike, inArray, isNull, lt, lte, notInArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Oficina } from "@/lib/oficina";
import { totalOS } from "@/lib/queries";
import { urlBase } from "@/lib/orcamento";
import { garantirPesquisa, revisoesPendentes } from "@/lib/relacionamento";
import { linksPublicosEmLote } from "@/lib/links-publicos";
import { diaSP, horaSP, inicioDoDia, nomeDoDia, somarDias } from "@/lib/agenda-datas";
import {
  TEXTO_DISPENSADA,
  montarMensagem,
  nomeVeiculo,
  primeiroNome,
  textoModelo,
  type PendenciaMensagem,
  type TipoMensagem,
  type VariaveisMensagem,
} from "@/lib/mensagens";
import { formatBRL, formatTelefone } from "@/lib/utils";

/*
 * Fila de mensagens (/mensagens): o que a oficina deveria mandar e ainda não mandou.
 * Um item sai da fila quando há registro em `mensagens` (enviado ou dispensado) ou, no caso
 * de "pronto" e "revisao", quando a OS/lembrete fica marcada como avisada.
 */

/** Nome da oficina usado nas mensagens */
export const nomeOficina = (o: Pick<Oficina, "nome" | "nomeFantasia">) => o.nomeFantasia || o.nome;

/** Variáveis comuns a todos os modelos */
export const varsOficina = (o: Oficina): VariaveisMensagem => ({
  oficina: nomeOficina(o),
  telefone_oficina: formatTelefone(o.whatsapp || o.telefone) || undefined,
});

/** Texto de um modelo da oficina com as variáveis (inclui nome e telefone da oficina) */
export function textoDaOficina(o: Oficina, tipo: TipoMensagem, vars: VariaveisMensagem) {
  return montarMensagem(textoModelo(o.modelosMensagem, tipo), { ...varsOficina(o), ...vars });
}

/** "hoje", "amanhã" ou "sexta, 21/11" */
export function dataRelativa(d: Date) {
  const dia = diaSP(d);
  const hoje = diaSP(new Date());
  if (dia === hoje) return "hoje";
  if (dia === somarDias(hoje, 1)) return "amanhã";
  return nomeDoDia(dia, { weekday: "long", day: "2-digit", month: "2-digit" });
}

/** Lembrete de um agendamento pelo modelo da oficina */
export function textoAgendamento(
  o: Oficina,
  a: { inicio: Date; titulo: string; cliente: string | null; marca: string | null; modelo: string | null; placa: string | null },
) {
  return textoDaOficina(o, "agendamento", {
    cliente: primeiroNome(a.cliente),
    veiculo: nomeVeiculo(a),
    placa: a.placa ?? undefined,
    data: dataRelativa(a.inicio),
    hora: horaSP(a.inicio),
    servico: a.titulo,
  });
}

/** Mensagem do cliente para a oficina depois de responder o orçamento (página pública) */
export function textoAvisoOficina(d: {
  orcamento: { respostaNome: string | null };
  os: { numero: number };
  veiculo: { marca: string | null; modelo: string | null; placa: string };
  cliente: { nome: string } | null;
  oficina: Oficina;
}) {
  return textoDaOficina(d.oficina, "orcamento_respondido", {
    cliente: d.orcamento.respostaNome ?? d.cliente?.nome,
    veiculo: nomeVeiculo(d.veiculo),
    placa: d.veiculo.placa,
    os: String(d.os.numero),
  });
}

/** Item da fila com o veículo à parte (para mostrar a placa) */
export type PendenciaFila = PendenciaMensagem & { placa: string | null; veiculo: string };

/** `links`: endereço do link de acompanhamento de cada OS da fila (orçamento e veículo pronto) */
type Candidato = Omit<PendenciaFila, "texto"> & { montar: (links: Map<string, string>) => string | Promise<string> };

/** Ordem dos grupos na fila */
export const ORDEM_FILA: TipoMensagem[] = ["pronto", "agendamento", "orcamento", "pos_venda", "revisao"];

const DIA = 86_400_000;
const diasDesde = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / DIA));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** "AAAA-MM-DD" → "DD/MM/AAAA" */
const dataBR = (d: string) => d.split("-").reverse().join("/");

async function candidatos(o: Oficina): Promise<Candidato[]> {
  const db = await getDb();
  const { ordensServico: os, veiculos: v, clientes: c, agendamentos: ag, orcamentos: orc, mensagens: m } = schema;
  const agora = new Date();
  const hoje = diaSP(agora);
  const posVendaDias = Math.max(0, o.posVendaDias);

  const colunas = {
    osId: os.id,
    numero: os.numero,
    veiculoId: v.id,
    placa: v.placa,
    marca: v.marca,
    modelo: v.modelo,
    clienteId: c.id,
    cliente: c.nome,
    telefone: c.telefone,
    aceitaWhatsapp: c.aceitaWhatsapp,
  };

  const [prontas, agendas, orcamentos, entregues, revisoes, registros] = await Promise.all([
    db
      .select({ ...colunas, entradaEm: os.entradaEm, total: totalOS })
      .from(os)
      .innerJoin(v, eq(v.id, os.veiculoId))
      .leftJoin(c, eq(c.id, os.clienteId))
      .where(and(eq(os.oficinaId, o.id), eq(os.status, "pronto"), isNull(os.clienteAvisadoEm))),
    db
      .select({
        id: ag.id,
        titulo: ag.titulo,
        inicio: ag.inicio,
        veiculoId: ag.veiculoId,
        placa: v.placa,
        marca: v.marca,
        modelo: v.modelo,
        clienteId: c.id,
        cliente: c.nome,
        telefone: c.telefone,
        aceitaWhatsapp: c.aceitaWhatsapp,
      })
      .from(ag)
      .leftJoin(v, eq(v.id, ag.veiculoId))
      .leftJoin(c, eq(c.id, ag.clienteId))
      .where(and(eq(ag.oficinaId, o.id), eq(ag.status, "agendado"), gte(ag.inicio, agora), lt(ag.inicio, inicioDoDia(somarDias(hoje, 2))))),
    // Orçamento pendente, ainda válido, enviado há mais de 2 dias
    db
      .select({ ...colunas, orcamentoId: orc.id, token: orc.token, total: orc.total, enviadoEm: orc.criadoEm })
      .from(orc)
      .innerJoin(os, eq(os.id, orc.osId))
      .innerJoin(v, eq(v.id, os.veiculoId))
      .leftJoin(c, eq(c.id, os.clienteId))
      .where(
        and(
          eq(orc.oficinaId, o.id),
          eq(orc.status, "pendente"),
          gt(orc.validoAte, agora),
          lt(orc.criadoEm, new Date(agora.getTime() - 2 * DIA)),
          notInArray(os.status, ["entregue", "cancelada"]),
        ),
      ),
    // Entregues entre posVendaDias e 30 dias atrás
    db
      .select({ ...colunas, entregueEm: os.entregueEm })
      .from(os)
      .innerJoin(v, eq(v.id, os.veiculoId))
      .leftJoin(c, eq(c.id, os.clienteId))
      .where(
        and(
          eq(os.oficinaId, o.id),
          eq(os.status, "entregue"),
          lte(os.entregueEm, new Date(agora.getTime() - posVendaDias * DIA)),
          gte(os.entregueEm, new Date(agora.getTime() - Math.max(30, posVendaDias + 7) * DIA)),
        ),
      ),
    revisoesPendentes(o.id),
    db
      .select({ tipo: m.tipo, osId: m.osId, agendamentoId: m.agendamentoId, refId: m.refId, texto: m.texto, criadoEm: m.criadoEm })
      .from(m)
      .where(
        and(
          eq(m.oficinaId, o.id),
          inArray(m.tipo, ["pronto", "agendamento", "orcamento", "pos_venda"]),
          gte(m.criadoEm, new Date(agora.getTime() - 90 * DIA)),
        ),
      ),
  ]);

  const prontoFeito = new Set(registros.filter((r) => r.tipo === "pronto" && r.osId).map((r) => r.osId));
  const agendaFeita = new Set(registros.filter((r) => r.tipo === "agendamento" && r.agendamentoId).map((r) => r.agendamentoId));
  const posVendaFeito = new Set(registros.filter((r) => r.tipo === "pos_venda" && r.osId).map((r) => r.osId));
  // Orçamento: dispensado sai de vez; enviado sai por 2 dias
  const orcDispensado = new Set<string>();
  const orcUltimo = new Map<string, number>();
  for (const r of registros) {
    if (r.tipo !== "orcamento" || !r.refId) continue;
    if (r.texto === TEXTO_DISPENSADA) orcDispensado.add(r.refId);
    else orcUltimo.set(r.refId, Math.max(orcUltimo.get(r.refId) ?? 0, r.criadoEm.getTime()));
  }

  const lista: Candidato[] = [];
  const base = <T extends { clienteId: string | null; cliente: string | null; telefone: string | null; aceitaWhatsapp: boolean | null; placa: string | null; marca: string | null; modelo: string | null }>(x: T) => ({
    clienteId: x.clienteId,
    clienteNome: x.cliente,
    telefone: x.telefone,
    aceitaWhatsapp: !!x.aceitaWhatsapp,
    placa: x.placa,
    veiculo: nomeVeiculo(x),
  });
  const varsVeiculo = (x: { cliente: string | null; placa: string | null; marca: string | null; modelo: string | null }) => ({
    cliente: primeiroNome(x.cliente),
    veiculo: nomeVeiculo(x),
    placa: x.placa ?? undefined,
  });

  for (const x of prontas) {
    if (prontoFeito.has(x.osId)) continue;
    const total = Number(x.total);
    lista.push({
      ...base(x),
      chave: `pronto:${x.osId}`,
      tipo: "pronto",
      quando: x.entradaEm.toISOString(),
      titulo: "Veículo pronto, cliente não avisado",
      detalhe: `OS #${x.numero}`,
      href: `/ordens-servico/${x.osId}`,
      refs: { osId: x.osId, veiculoId: x.veiculoId },
      montar: (links) =>
        textoDaOficina(o, "pronto", {
          ...varsVeiculo(x),
          os: String(x.numero),
          total: total > 0 ? formatBRL(total) : undefined,
          acompanhamento: links.get(x.osId),
        }),
    });
  }

  for (const a of agendas) {
    if (agendaFeita.has(a.id)) continue;
    lista.push({
      ...base(a),
      chave: `agendamento:${a.id}`,
      tipo: "agendamento",
      quando: a.inicio.toISOString(),
      titulo: `Agendado para ${dataRelativa(a.inicio)} às ${horaSP(a.inicio)}`,
      detalhe: a.titulo,
      href: `/agenda?data=${diaSP(a.inicio)}`,
      refs: { agendamentoId: a.id, veiculoId: a.veiculoId ?? undefined },
      montar: () => textoAgendamento(o, a),
    });
  }

  if (orcamentos.length > 0) {
    for (const x of orcamentos) {
      if (orcDispensado.has(x.orcamentoId)) continue;
      const ultimo = Math.max(orcUltimo.get(x.orcamentoId) ?? 0, x.enviadoEm.getTime());
      if (Date.now() - ultimo < 2 * DIA) continue;
      lista.push({
        ...base(x),
        chave: `orcamento:${x.orcamentoId}`,
        tipo: "orcamento",
        quando: x.enviadoEm.toISOString(),
        titulo: `Orçamento sem resposta há ${plural(diasDesde(x.enviadoEm), "dia", "dias")}`,
        detalhe: `OS #${x.numero} · ${formatBRL(Number(x.total))}`,
        href: `/ordens-servico/${x.osId}`,
        refs: { osId: x.osId, veiculoId: x.veiculoId, refId: x.orcamentoId },
        // O cliente aprova pelo link de acompanhamento da OS ({link} nos modelos antigos)
        montar: (links) =>
          textoDaOficina(o, "orcamento", {
            ...varsVeiculo(x),
            os: String(x.numero),
            total: formatBRL(Number(x.total)),
            link: links.get(x.osId),
            acompanhamento: links.get(x.osId),
          }),
      });
    }
  }

  for (const x of entregues) {
    if (posVendaFeito.has(x.osId) || !x.entregueEm) continue;
    const entregueEm = x.entregueEm;
    lista.push({
      ...base(x),
      chave: `pos_venda:${x.osId}`,
      tipo: "pos_venda",
      quando: entregueEm.toISOString(),
      titulo: `Entregue há ${plural(diasDesde(entregueEm), "dia", "dias")}`,
      detalhe: `OS #${x.numero}`,
      href: `/ordens-servico/${x.osId}`,
      refs: { osId: x.osId, veiculoId: x.veiculoId },
      montar: async () => {
        const token = await garantirPesquisa(o.id, x.osId);
        return textoDaOficina(o, "pos_venda", { ...varsVeiculo(x), os: String(x.numero), pesquisa: `${await urlBase()}/pesquisa/${token}` });
      },
    });
  }

  for (const r of revisoes) {
    lista.push({
      clienteId: r.clienteId,
      clienteNome: r.clienteNome,
      telefone: r.telefone,
      aceitaWhatsapp: r.aceitaWhatsapp,
      placa: r.placa,
      veiculo: r.veiculo,
      chave: `revisao:${r.id}`,
      tipo: "revisao",
      quando: `${r.previstaPara}T12:00:00-03:00`,
      titulo: r.descricao,
      detalhe: r.motivo,
      href: `/veiculos/${r.veiculoId}`,
      refs: { veiculoId: r.veiculoId, refId: r.id },
      montar: () =>
        textoDaOficina(o, "revisao", {
          cliente: primeiroNome(r.clienteNome),
          veiculo: r.veiculo,
          placa: r.placa,
          servico: r.descricao.charAt(0).toLowerCase() + r.descricao.slice(1),
          data: dataBR(r.previstaPara),
        }),
    });
  }

  return lista.sort((a, b) => ORDEM_FILA.indexOf(a.tipo) - ORDEM_FILA.indexOf(b.tipo) || a.quando.localeCompare(b.quando));
}

/** Fila completa, com o texto de cada mensagem montado pelo modelo da oficina */
export async function filaMensagens(o: Oficina): Promise<PendenciaFila[]> {
  const lista = await candidatos(o);
  // Links de acompanhamento de todas as OS da fila de uma vez (1 consulta e, se faltar, 1 insert)
  const osIds = lista.filter((p) => (p.tipo === "pronto" || p.tipo === "orcamento") && p.refs.osId).map((p) => p.refs.osId!);
  const links = new Map<string, string>();
  if (osIds.length > 0) {
    const [tokens, url] = await Promise.all([linksPublicosEmLote(o.id, "acompanhamento", osIds), urlBase()]);
    for (const [osId, token] of tokens) links.set(osId, `${url}/acompanhamento/${token}`);
  }
  return Promise.all(lista.map(async ({ montar, ...p }) => ({ ...p, texto: await montar(links) })));
}

/** Quantos itens há na fila (sem montar os textos nem criar links de pesquisa) */
export async function contarFila(o: Oficina) {
  return (await candidatos(o)).length;
}

/* ---------- Histórico (aba "Enviadas") ---------- */

export const POR_PAGINA_MENSAGENS = 30;

export type FiltroMensagens = { tipo?: TipoMensagem; de?: string; ate?: string; busca?: string; pagina?: number };

/** Mensagens registradas, mais recentes primeiro; `temMais` indica se há outra página */
export async function listarMensagens(oficinaId: string, f: FiltroMensagens) {
  const db = await getDb();
  const { mensagens: m, clientes: c, veiculos: v } = schema;
  const cond = [eq(m.oficinaId, oficinaId)];
  if (f.tipo) cond.push(eq(m.tipo, f.tipo));
  if (f.de) cond.push(gte(m.criadoEm, inicioDoDia(f.de)));
  if (f.ate) cond.push(lt(m.criadoEm, inicioDoDia(somarDias(f.ate, 1))));
  if (f.busca) {
    const termo = `%${f.busca.replace(/[%_\\]/g, (x) => `\\${x}`)}%`;
    const digitos = f.busca.replace(/\D/g, "");
    const busca = or(ilike(c.nome, termo), ilike(v.placa, termo), digitos.length >= 4 ? ilike(m.telefone, `%${digitos}%`) : undefined);
    if (busca) cond.push(busca);
  }
  const pagina = Math.max(1, f.pagina ?? 1);
  const rows = await db
    .select({
      id: m.id,
      tipo: m.tipo,
      texto: m.texto,
      telefone: m.telefone,
      criadoEm: m.criadoEm,
      enviadoPorNome: m.enviadoPorNome,
      clienteId: m.clienteId,
      cliente: c.nome,
      veiculoId: m.veiculoId,
      placa: v.placa,
      osId: m.osId,
    })
    .from(m)
    .leftJoin(c, eq(c.id, m.clienteId))
    .leftJoin(v, eq(v.id, m.veiculoId))
    .where(and(...cond))
    .orderBy(desc(m.criadoEm))
    .limit(POR_PAGINA_MENSAGENS + 1)
    .offset((pagina - 1) * POR_PAGINA_MENSAGENS);
  return {
    itens: rows.slice(0, POR_PAGINA_MENSAGENS).map((r) => ({ ...r, dispensada: r.texto === TEXTO_DISPENSADA })),
    temMais: rows.length > POR_PAGINA_MENSAGENS,
    pagina,
  };
}
