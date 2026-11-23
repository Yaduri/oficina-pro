import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { getDb, getDbSistema, schema, type DB } from "@/db";
import { notasAutorizadasDasOS } from "@/lib/fiscal/notas";
import { linkPublico, linksPublicosEmLote } from "@/lib/links-publicos";
import { diaSP, somarDias } from "@/lib/agenda-datas";
import { somarMeses } from "@/lib/financeiro";
import { totalOS } from "@/lib/queries";

/*
 * Relacionamento com o cliente (Fase 5.2): lembretes de revisão, pesquisa de satisfação e
 * portal do cliente. As funções exportadas aqui são usadas pela fila de mensagens (5.1).
 */

const { lembretesRevisao: lr, veiculos, clientes, ordensServico: os, checkins, osItens, catalogoItens, pesquisasSatisfacao: ps } = schema;

/** Antecedência do aviso de revisão */
export const ANTECEDENCIA_DIAS = 15;
export const ANTECEDENCIA_KM = 500;
const DIA = 86_400_000;

/* ---------- Lembretes de revisão ---------- */

/** Revisão de um veículo que já chegou (ou está chegando) e ainda não foi avisada */
export type RevisaoPendente = {
  id: string;
  veiculoId: string;
  placa: string;
  veiculo: string;
  clienteId: string | null;
  clienteNome: string | null;
  telefone: string | null;
  aceitaWhatsapp: boolean;
  descricao: string;
  /** "AAAA-MM-DD": data prevista (pela data ou estimada pelo km) */
  previstaPara: string;
  /** Por que entrou na fila (ex.: "Venceu em 10/12" ou "≈ 10.000 km rodados") */
  motivo: string;
};

export type SituacaoRevisao = "em_dia" | "chegando" | "vencida";

export const SITUACAO_REVISAO: Record<SituacaoRevisao, { label: string; tom: "ok" | "warn" | "danger" }> = {
  em_dia: { label: "Em dia", tom: "ok" },
  chegando: { label: "Chegando", tom: "warn" },
  vencida: { label: "Vencida", tom: "danger" },
};

/** Próxima data e km a partir da última vez e do intervalo */
export function calcularProxima(p: { ultimaData: string | null; ultimoKm: number | null; meses: number | null; km: number | null }) {
  return {
    proximaData: p.ultimaData && p.meses ? somarMeses(p.ultimaData, p.meses) : null,
    proximoKm: p.ultimoKm != null && p.km ? p.ultimoKm + p.km : null,
  };
}

/** "10/12/2026" a partir de "AAAA-MM-DD" */
export const formatDia = (dia: string) => dia.split("-").reverse().join("/");
const formatDiaCurto = (dia: string) => dia.split("-").reverse().slice(0, 2).join("/");
const km = (n: number) => `${Math.round(n).toLocaleString("pt-BR")} km`;

type Leitura = { km: number; quando: number };
/** Uso do veículo estimado pelas leituras de km conhecidas */
export type UsoVeiculo = { ultimoKm: number; ultimaLeitura: number; kmPorDia: number | null };

/**
 * Média de km/dia de cada veículo a partir das leituras conhecidas: km de entrada e saída das OS,
 * km dos check-ins, última vez de cada lembrete e o km do cadastro. Com uma leitura só (ou leituras
 * muito próximas), não há média e a revisão segue só pela data.
 */
export async function usoDosVeiculos(oficinaId: string, veiculoIds: string[], conexao?: DB): Promise<Map<string, UsoVeiculo>> {
  const res = new Map<string, UsoVeiculo>();
  if (veiculoIds.length === 0) return res;
  const db = conexao ?? (await getDb());
  const [ordens, chks, lembs, vs] = await Promise.all([
    db
      .select({ veiculoId: os.veiculoId, kmEntrada: os.kmEntrada, entradaEm: os.entradaEm, kmSaida: os.kmSaida, entregueEm: os.entregueEm })
      .from(os)
      .where(and(eq(os.oficinaId, oficinaId), inArray(os.veiculoId, veiculoIds), or(isNotNull(os.kmEntrada), isNotNull(os.kmSaida)))),
    db
      .select({ veiculoId: checkins.veiculoId, km: checkins.km, criadoEm: checkins.criadoEm })
      .from(checkins)
      .where(and(eq(checkins.oficinaId, oficinaId), inArray(checkins.veiculoId, veiculoIds), isNotNull(checkins.km))),
    db
      .select({ veiculoId: lr.veiculoId, km: lr.ultimoKm, data: lr.ultimaData })
      .from(lr)
      .where(and(eq(lr.oficinaId, oficinaId), inArray(lr.veiculoId, veiculoIds), isNotNull(lr.ultimoKm), isNotNull(lr.ultimaData))),
    db
      .select({ id: veiculos.id, km: veiculos.km, criadoEm: veiculos.criadoEm })
      .from(veiculos)
      .where(and(eq(veiculos.oficinaId, oficinaId), inArray(veiculos.id, veiculoIds))),
  ]);

  const leituras = new Map<string, Leitura[]>();
  const add = (v: string, k: number | null, d: Date | null) => {
    if (k == null || k <= 0 || !d) return;
    const l = leituras.get(v) ?? [];
    l.push({ km: k, quando: d.getTime() });
    leituras.set(v, l);
  };
  for (const o of ordens) {
    add(o.veiculoId, o.kmEntrada, o.entradaEm);
    add(o.veiculoId, o.kmSaida, o.entregueEm ?? o.entradaEm);
  }
  for (const c of chks) add(c.veiculoId, c.km, c.criadoEm);
  for (const l of lembs) add(l.veiculoId, l.km, new Date(`${l.data}T12:00:00-03:00`));
  for (const v of vs) {
    const l = leituras.get(v.id) ?? [];
    // O km do cadastro não tem data: só entra se for maior que tudo o que já foi lido (data = última leitura)
    // ou, sem nenhuma leitura, como leitura única no cadastro do veículo
    if (v.km != null && v.km > 0) {
      if (l.length === 0) add(v.id, v.km, v.criadoEm);
      else {
        const ultima = l.reduce((a, b) => (b.quando > a.quando ? b : a));
        if (v.km > ultima.km) l.push({ km: v.km, quando: ultima.quando });
      }
    }
  }

  for (const [v, l] of leituras) {
    l.sort((a, b) => a.quando - b.quando || a.km - b.km);
    const primeira = l[0];
    const ultima = l.reduce((a, b) => (b.km >= a.km ? b : a));
    const dias = (ultima.quando - primeira.quando) / DIA;
    const porDia = dias >= 7 && ultima.km > primeira.km ? (ultima.km - primeira.km) / dias : null;
    res.set(v, {
      ultimoKm: ultima.km,
      ultimaLeitura: ultima.quando,
      // Média absurda (km digitado errado) é ignorada
      kmPorDia: porDia && porDia <= 1000 ? porDia : null,
    });
  }
  return res;
}

/** Km estimado hoje pela média de uso */
export function kmEstimado(uso: UsoVeiculo | undefined, agora = Date.now()) {
  if (!uso) return null;
  if (!uso.kmPorDia) return uso.ultimoKm;
  return Math.round(uso.ultimoKm + (uso.kmPorDia * Math.max(0, agora - uso.ultimaLeitura)) / DIA);
}

type LembreteBase = { proximaData: string | null; proximoKm: number | null };

/** Situação, data prevista (a mais cedo entre a data e a estimada pelo km) e motivo */
export function avaliarRevisao(l: LembreteBase, uso: UsoVeiculo | undefined, hoje = diaSP(new Date())) {
  const kmHoje = kmEstimado(uso);
  let dataPeloKm: string | null = null;
  if (l.proximoKm != null && uso) {
    if (kmHoje != null && kmHoje >= l.proximoKm) {
      // Já passou: estima quando passou (ou hoje, sem média)
      dataPeloKm = uso.kmPorDia ? diaSP(new Date(uso.ultimaLeitura + (Math.max(0, l.proximoKm - uso.ultimoKm) / uso.kmPorDia) * DIA)) : hoje;
    } else if (uso.kmPorDia) {
      dataPeloKm = diaSP(new Date(uso.ultimaLeitura + ((l.proximoKm - uso.ultimoKm) / uso.kmPorDia) * DIA));
    }
  }
  const previstaPara = [l.proximaData, dataPeloKm].filter((d): d is string => !!d).sort()[0] ?? null;
  const limite = somarDias(hoje, ANTECEDENCIA_DIAS);
  const vencidaData = !!l.proximaData && l.proximaData <= hoje;
  const vencidaKm = l.proximoKm != null && kmHoje != null && kmHoje >= l.proximoKm;
  const chegandoData = !!l.proximaData && l.proximaData <= limite;
  const chegandoKm = l.proximoKm != null && kmHoje != null && kmHoje >= l.proximoKm - ANTECEDENCIA_KM;
  const situacao: SituacaoRevisao = vencidaData || vencidaKm ? "vencida" : chegandoData || chegandoKm ? "chegando" : "em_dia";

  let motivo = "";
  if (vencidaData) motivo = `Venceu em ${formatDiaCurto(l.proximaData!)}`;
  else if (vencidaKm) motivo = `≈ ${km(kmHoje!)} rodados (revisão aos ${km(l.proximoKm!)})`;
  else if (chegandoData) motivo = `Vence em ${formatDiaCurto(l.proximaData!)}`;
  else if (chegandoKm) motivo = `≈ ${km(kmHoje!)} rodados (revisão aos ${km(l.proximoKm!)})`;
  return { situacao, previstaPara, kmEstimado: kmHoje, motivo, avisar: situacao !== "em_dia" };
}

/**
 * Revisões a avisar: vencidas ou que vencem nos próximos 15 dias, por data ou pelo km estimado,
 * de lembretes ativos e ainda não avisados, de veículos não arquivados.
 */
export async function revisoesPendentes(oficinaId: string): Promise<RevisaoPendente[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: lr.id,
      veiculoId: lr.veiculoId,
      descricao: lr.descricao,
      proximaData: lr.proximaData,
      proximoKm: lr.proximoKm,
      placa: veiculos.placa,
      marca: veiculos.marca,
      modelo: veiculos.modelo,
      clienteId: clientes.id,
      clienteNome: clientes.nome,
      telefone: clientes.telefone,
      aceitaWhatsapp: clientes.aceitaWhatsapp,
    })
    .from(lr)
    .innerJoin(veiculos, eq(veiculos.id, lr.veiculoId))
    .leftJoin(clientes, eq(clientes.id, veiculos.clienteId))
    .where(
      and(
        eq(lr.oficinaId, oficinaId),
        eq(lr.ativo, true),
        isNull(lr.avisadoEm),
        isNull(veiculos.arquivadoEm),
        or(isNotNull(lr.proximaData), isNotNull(lr.proximoKm)),
      ),
    );
  if (rows.length === 0) return [];
  const usos = await usoDosVeiculos(oficinaId, [...new Set(rows.map((r) => r.veiculoId))]);
  const hoje = diaSP(new Date());
  const res: RevisaoPendente[] = [];
  for (const r of rows) {
    const a = avaliarRevisao(r, usos.get(r.veiculoId), hoje);
    if (!a.avisar) continue;
    res.push({
      id: r.id,
      veiculoId: r.veiculoId,
      placa: r.placa,
      veiculo: [r.marca, r.modelo].filter(Boolean).join(" "),
      clienteId: r.clienteId,
      clienteNome: r.clienteNome,
      telefone: r.telefone,
      aceitaWhatsapp: r.aceitaWhatsapp ?? false,
      descricao: r.descricao,
      previstaPara: a.previstaPara ?? hoje,
      motivo: a.motivo,
    });
  }
  return res.sort((a, b) => a.previstaPara.localeCompare(b.previstaPara));
}

/** Lembretes do veículo (ativos primeiro), com a situação de cada um */
export async function revisoesDoVeiculo(oficinaId: string, veiculoId: string) {
  const db = await getDb();
  const rows = await db
    .select({ lembrete: lr, osNumero: os.numero })
    .from(lr)
    .leftJoin(os, eq(os.id, lr.osId))
    .where(and(eq(lr.oficinaId, oficinaId), eq(lr.veiculoId, veiculoId)))
    .orderBy(desc(lr.ativo), asc(lr.proximaData), asc(lr.descricao));
  const uso = (await usoDosVeiculos(oficinaId, [veiculoId])).get(veiculoId);
  const hoje = diaSP(new Date());
  return rows.map(({ lembrete: l, osNumero }) => ({ ...l, osNumero, ...avaliarRevisao(l, uso, hoje) }));
}

/**
 * Na entrega da OS: cada serviço feito que se repete (catálogo com revisão em meses/km) cria ou
 * atualiza o lembrete do veículo. Roda dentro da transação da entrega.
 */
export async function atualizarLembretesDaEntrega(
  tx: DB,
  p: { oficinaId: string; osId: string; veiculoId: string; data: string; km: number | null },
) {
  const servicos = await tx
    .selectDistinctOn([catalogoItens.id], {
      catalogoItemId: catalogoItens.id,
      descricao: catalogoItens.descricao,
      meses: catalogoItens.revisaoMeses,
      km: catalogoItens.revisaoKm,
    })
    .from(osItens)
    .innerJoin(catalogoItens, eq(catalogoItens.id, osItens.catalogoItemId))
    .where(
      and(
        eq(osItens.osId, p.osId),
        eq(osItens.tipo, "servico"),
        eq(osItens.recusado, false),
        eq(catalogoItens.oficinaId, p.oficinaId),
        or(isNotNull(catalogoItens.revisaoMeses), isNotNull(catalogoItens.revisaoKm)),
      ),
    );
  for (const s of servicos) {
    const intervalo = { meses: s.meses, km: s.km };
    const valores = {
      intervaloMeses: intervalo.meses,
      intervaloKm: intervalo.km,
      ultimaData: p.data,
      ultimoKm: p.km,
      ...calcularProxima({ ultimaData: p.data, ultimoKm: p.km, ...intervalo }),
      osId: p.osId,
      avisadoEm: null,
      ativo: true,
    };
    const [existente] = await tx
      .select({ id: lr.id })
      .from(lr)
      .where(and(eq(lr.oficinaId, p.oficinaId), eq(lr.veiculoId, p.veiculoId), eq(lr.catalogoItemId, s.catalogoItemId)))
      .orderBy(desc(lr.criadoEm))
      .limit(1);
    if (existente) await tx.update(lr).set(valores).where(eq(lr.id, existente.id));
    else
      await tx.insert(lr).values({ oficinaId: p.oficinaId, veiculoId: p.veiculoId, catalogoItemId: s.catalogoItemId, descricao: s.descricao, ...valores });
  }
}

/* ---------- Pesquisa de satisfação ---------- */

/** Token da pesquisa de satisfação da OS (cria na primeira vez). A página pública é /pesquisa/<token>. */
export async function garantirPesquisa(oficinaId: string, osId: string): Promise<string> {
  const db = await getDb();
  const t = schema.pesquisasSatisfacao;
  const buscar = async () =>
    (await db.select({ token: t.token }).from(t).where(and(eq(t.osId, osId), eq(t.oficinaId, oficinaId))))[0]?.token;
  const existente = await buscar();
  if (existente) return existente;
  await db.insert(t).values({ oficinaId, osId, token: randomBytes(18).toString("base64url") }).onConflictDoNothing();
  const token = await buscar();
  if (!token) throw new Error("Não foi possível criar a pesquisa");
  return token;
}

/** Tokens gerados por garantirPesquisa (24 caracteres base64url) */
export const TOKEN_PESQUISA_RE = /^[A-Za-z0-9_-]{24}$/;

/** Pesquisa pelo link público, com a OS, o veículo e a oficina */
export async function pesquisaPorToken(token: string) {
  if (!TOKEN_PESQUISA_RE.test(token)) return null;
  // Sem login: conexão do sistema, filtrada pelo token
  const db = await getDbSistema();
  const [row] = await db
    .select({
      pesquisa: ps,
      os: { id: os.id, numero: os.numero, entregueEm: os.entregueEm, status: os.status },
      veiculo: { placa: veiculos.placa, marca: veiculos.marca, modelo: veiculos.modelo },
      oficina: schema.oficinas,
    })
    .from(ps)
    .innerJoin(os, eq(os.id, ps.osId))
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .innerJoin(schema.oficinas, eq(schema.oficinas.id, ps.oficinaId))
    .where(and(eq(ps.token, token), eq(os.oficinaId, ps.oficinaId)));
  return row ?? null;
}

/** Resposta da pesquisa da OS (para a tela da OS) */
export async function pesquisaDaOS(oficinaId: string, osId: string) {
  const db = await getDb();
  const [p] = await db
    .select({ nota: ps.nota, comentario: ps.comentario, respondidoEm: ps.respondidoEm })
    .from(ps)
    .where(and(eq(ps.oficinaId, oficinaId), eq(ps.osId, osId)));
  return p ?? null;
}

/* ---------- Portal do cliente ---------- */

/** Token do portal do cliente (um por cliente, reaproveitado). A página pública é /portal/<token>. */
export async function garantirPortal(oficinaId: string, clienteId: string): Promise<string> {
  const token = await linkPublico(oficinaId, "portal", clienteId);
  if (!token) throw new Error("Não foi possível gerar o link do portal");
  return token;
}

/** Cliente e oficina do link do portal (cliente arquivado não tem portal) */
export async function portalPorToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  // Sem login: conexão do sistema, filtrada pelo token
  const db = await getDbSistema();
  const [row] = await db
    .select({ cliente: clientes, oficina: schema.oficinas })
    .from(schema.linksDocumento)
    .innerJoin(clientes, and(eq(clientes.id, schema.linksDocumento.refId), eq(clientes.oficinaId, schema.linksDocumento.oficinaId)))
    .innerJoin(schema.oficinas, eq(schema.oficinas.id, schema.linksDocumento.oficinaId))
    .where(and(eq(schema.linksDocumento.token, token), eq(schema.linksDocumento.tipo, "portal"), isNull(clientes.arquivadoEm)));
  return row ?? null;
}

/**
 * Dados do portal: veículos do cliente (não arquivados) e, em cada um, só as OS do próprio cliente
 * (veículo comprado de outro cliente não mostra as OS do dono anterior).
 * Página pública: conexão do sistema, com a oficina e o cliente do token filtrados em cada consulta.
 */
export async function dadosPortal(oficinaId: string, clienteId: string) {
  const db = await getDbSistema();
  const vs = await db
    .select({ id: veiculos.id, placa: veiculos.placa, marca: veiculos.marca, modelo: veiculos.modelo, ano: veiculos.ano, cor: veiculos.cor })
    .from(veiculos)
    .where(and(eq(veiculos.oficinaId, oficinaId), eq(veiculos.clienteId, clienteId), isNull(veiculos.arquivadoEm)))
    .orderBy(asc(veiculos.placa));
  const ids = vs.map((v) => v.id);
  if (ids.length === 0) return [];
  const [ordens, lembretes, usos] = await Promise.all([
    db
      .select({
        id: os.id,
        veiculoId: os.veiculoId,
        numero: os.numero,
        status: os.status,
        descricao: os.descricao,
        entradaEm: os.entradaEm,
        entregueEm: os.entregueEm,
        kmEntrada: os.kmEntrada,
        garantiaAte: os.garantiaAte,
        total: totalOS,
      })
      .from(os)
      .where(and(eq(os.oficinaId, oficinaId), eq(os.clienteId, clienteId), inArray(os.veiculoId, ids), ne(os.status, "cancelada")))
      .orderBy(desc(os.entradaEm))
      .limit(200),
    db
      .select()
      .from(lr)
      .where(and(eq(lr.oficinaId, oficinaId), inArray(lr.veiculoId, ids), eq(lr.ativo, true)))
      .orderBy(asc(lr.proximaData)),
    usoDosVeiculos(oficinaId, ids, db),
  ]);
  const osIds = ordens.map((o) => o.id);
  const [itens, orcs, notasAut] = osIds.length
    ? await Promise.all([
        db
          .select({ osId: osItens.osId, descricao: osItens.descricao, tipo: osItens.tipo })
          .from(osItens)
          .where(and(inArray(osItens.osId, osIds), eq(osItens.recusado, false)))
          .orderBy(asc(osItens.criadoEm)),
        db
          .select({ osId: schema.orcamentos.osId, token: schema.orcamentos.token, total: schema.orcamentos.total, validoAte: schema.orcamentos.validoAte })
          .from(schema.orcamentos)
          .where(and(eq(schema.orcamentos.oficinaId, oficinaId), inArray(schema.orcamentos.osId, osIds), eq(schema.orcamentos.status, "pendente"))),
        notasAutorizadasDasOS(oficinaId, osIds, db),
      ])
    : [[], [], []];
  const agora = new Date();
  const hoje = diaSP(agora);

  // Links públicos reaproveitados, em lote (1 consulta + 1 insert por tipo, não 1 ida ao banco por OS):
  // acompanhamento de cada OS, PDF da OS e DANFSe das notas autorizadas
  const acompanhamentos = await linksPublicosEmLote(oficinaId, "acompanhamento", osIds, db);
  const pdfs = await linksPublicosEmLote(oficinaId, "os", osIds, db);
  const notasDasOS = notasAut.filter((n) => n.osId);
  const tokensNotas = await linksPublicosEmLote(oficinaId, "nota", notasDasOS.map((n) => n.id), db);
  const notasTokens = new Map<string, { numero: string; ambiente: "homologacao" | "producao"; token: string }[]>();
  for (const n of notasDasOS) {
    if (!n.osId) continue;
    const t = tokensNotas.get(n.id);
    if (!t) continue;
    const arr = notasTokens.get(n.osId) ?? [];
    arr.push({ numero: n.numeroNota ?? `DPS ${n.numeroDps}`, ambiente: n.ambiente, token: t });
    notasTokens.set(n.osId, arr);
  }

  return vs.map((v) => ({
    ...v,
    ordens: ordens
      .filter((o) => o.veiculoId === v.id)
      .map((o) => {
        const orc = orcs.find((x) => x.osId === o.id && x.validoAte >= agora && o.status !== "entregue");
        return {
          ...o,
          total: Number(o.total),
          itens: itens.filter((i) => i.osId === o.id).map((i) => i.descricao),
          orcamento: orc ? { token: orc.token, total: Number(orc.total), validoAte: orc.validoAte } : null,
          pdfToken: pdfs.get(o.id) ?? null,
          acompanhamentoToken: acompanhamentos.get(o.id) ?? null,
          notas: notasTokens.get(o.id) ?? [],
        };
      }),
    revisoes: lembretes
      .filter((l) => l.veiculoId === v.id && (l.proximaData || l.proximoKm != null))
      .map((l) => ({ id: l.id, descricao: l.descricao, proximaData: l.proximaData, proximoKm: l.proximoKm, ...avaliarRevisao(l, usos.get(v.id), hoje) })),
  }));
}
