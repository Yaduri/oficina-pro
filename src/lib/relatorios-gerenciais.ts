import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, notExists, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { inicioDoDia } from "@/lib/agenda-datas";
import { centavos, hojeSP, somarDiasData, somarMeses } from "@/lib/financeiro";
import { ABERTAS, type StatusOS } from "@/lib/os";

/*
 * Relatórios gerenciais (5.3): serviços mais vendidos, tempo no pátio, produtividade por técnico,
 * aprovação de orçamentos, clientes inativos e satisfação (NPS).
 * Tudo agregado no banco e sempre filtrado pela oficina. Valores em centavos.
 *
 * Mesma regra de valor do faturamento (lib/financeiro-relatorios.ts): OS entregues pela data da entrega,
 * itens não recusados, desconto da OS rateado na proporção do valor de cada item.
 */

const { ordensServico: os, osItens, catalogoItens, tecnicos, veiculos, clientes, orcamentos, pesquisasSatisfacao: pesquisas } = schema;

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const ate1 = (ate: string) => inicioDoDia(somarDiasData(ate, 1));

/** Filtro das OS entregues no período (pela data da entrega) */
const filtroEntregues = (oficinaId: string, de: string, ate: string): SQL[] => [
  eq(os.oficinaId, oficinaId),
  eq(os.status, "entregue"),
  gte(os.entregueEm, inicioDoDia(de)),
  lt(os.entregueEm, ate1(ate)),
];

/**
 * Uma linha por OS com o bruto dos itens não recusados e o fator do desconto
 * (total = bruto × fator), igual a calcularTotais (lib/os-total.ts).
 */
async function subOS(filtros: SQL[]) {
  const db = await getDb();
  const bruto = sql`coalesce(sum(${osItens.quantidade} * ${osItens.valorUnitario}), 0)`;
  const desconto = sql`least(${bruto}, coalesce(${bruto} * ${os.descontoPercentual} / 100, ${os.descontoValor}))`;
  return db
    .select({
      osId: sql<string>`${os.id}`.as("p_os_id"),
      clienteId: sql<string | null>`${os.clienteId}`.as("p_cliente_id"),
      veiculoId: sql<string>`${os.veiculoId}`.as("p_veiculo_id"),
      responsavelId: sql<string | null>`${os.responsavelId}`.as("p_responsavel_id"),
      entregueEm: sql<Date>`${os.entregueEm}`.as("p_entregue_em"),
      dias: sql<string>`extract(epoch from (${os.entregueEm} - ${os.entradaEm})) / 86400`.as("p_dias"),
      bruto: bruto.as("p_bruto"),
      brutoServicos: sql<string>`coalesce(sum(${osItens.quantidade} * ${osItens.valorUnitario}) filter (where ${osItens.tipo} = 'servico'), 0)`.as(
        "p_bruto_servicos",
      ),
      fator: sql<string>`case when ${bruto} > 0 then (${bruto} - ${desconto}) / ${bruto} else 0 end`.as("p_fator"),
    })
    .from(os)
    .leftJoin(osItens, and(eq(osItens.osId, os.id), eq(osItens.recusado, false)))
    .where(and(...filtros))
    .groupBy(os.id)
    .as("p");
}

/* ---------- Serviços mais vendidos e peças mais usadas ---------- */

export type ItemVendido = { chave: string; tipo: "peca" | "servico"; descricao: string; quantidade: number; total: number; qtdOS: number };

/** Agrupa pelo item do catálogo; sem catálogo, pela descrição normalizada */
export async function itensMaisVendidos(oficinaId: string, de: string, ate: string): Promise<ItemVendido[]> {
  const db = await getDb();
  const p = await subOS(filtroEntregues(oficinaId, de, ate));
  const chave = sql<string>`coalesce(${osItens.catalogoItemId}::text, ${osItens.tipo}::text || ':' || lower(regexp_replace(trim(${osItens.descricao}), '\\s+', ' ', 'g')))`;
  const rows = await db
    .select({
      chave,
      tipo: osItens.tipo,
      descricao: sql<string>`coalesce(max(${catalogoItens.descricao}), min(trim(${osItens.descricao})))`,
      quantidade: sql<string>`sum(${osItens.quantidade})`,
      total: sql<string>`sum(${osItens.quantidade} * ${osItens.valorUnitario} * ${p.fator})`,
      qtdOS: sql<string>`count(distinct ${osItens.osId})`,
    })
    .from(osItens)
    .innerJoin(p, eq(p.osId, osItens.osId))
    .leftJoin(catalogoItens, eq(catalogoItens.id, osItens.catalogoItemId))
    .where(eq(osItens.recusado, false))
    .groupBy(chave, osItens.tipo);
  return rows
    .map((r) => ({
      chave: r.chave,
      tipo: r.tipo,
      descricao: r.descricao,
      quantidade: Math.round(num(r.quantidade) * 100) / 100,
      total: centavos(r.total),
      qtdOS: num(r.qtdOS),
    }))
    .sort((a, b) => b.total - a.total || b.quantidade - a.quantidade);
}

/* ---------- Tempo no pátio ---------- */

export const FAIXAS_PATIO = [
  { chave: "1", rotulo: "Até 1 dia", max: 1 },
  { chave: "3", rotulo: "2 a 3 dias", max: 3 },
  { chave: "7", rotulo: "4 a 7 dias", max: 7 },
  { chave: "15", rotulo: "8 a 15 dias", max: 15 },
  { chave: "mais", rotulo: "Mais de 15 dias", max: Infinity },
] as const;

export type OSAberta = {
  id: string;
  numero: number;
  status: StatusOS;
  entradaEm: Date;
  dias: number;
  placa: string;
  veiculo: string;
  cliente: string | null;
  responsavel: string | null;
};

/** Entrada → entrega das OS entregues no período, em dias; e as OS abertas há mais tempo */
export async function tempoNoPatio(oficinaId: string, de: string, ate: string) {
  const db = await getDb();
  const filtros = and(...filtroEntregues(oficinaId, de, ate));
  const dur = sql`extract(epoch from (${os.entregueEm} - ${os.entradaEm})) / 86400`;

  const [stats] = await db
    .select({
      qtd: sql<string>`count(*)`,
      media: sql<string | null>`avg(${dur})`,
      mediana: sql<string | null>`percentile_cont(0.5) within group (order by ${dur})`,
    })
    .from(os)
    .where(filtros);

  // Dias contados para cima: 1h ou 23h = 1 dia; 25h = 2 dias
  const dias = sql`greatest(ceil(${dur}), 1)`;
  const faixa = sql<string>`case when ${dias} <= 1 then '1' when ${dias} <= 3 then '3' when ${dias} <= 7 then '7' when ${dias} <= 15 then '15' else 'mais' end`;
  const porFaixa = await db.select({ faixa, qtd: sql<string>`count(*)` }).from(os).where(filtros).groupBy(faixa);
  const qtdFaixa = new Map(porFaixa.map((r) => [r.faixa, num(r.qtd)]));

  const abertasRows = await db
    .select({
      id: os.id,
      numero: os.numero,
      status: os.status,
      entradaEm: os.entradaEm,
      placa: veiculos.placa,
      marca: veiculos.marca,
      modelo: veiculos.modelo,
      cliente: clientes.nome,
      responsavel: tecnicos.nome,
    })
    .from(os)
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .leftJoin(tecnicos, eq(tecnicos.id, os.responsavelId))
    .where(and(eq(os.oficinaId, oficinaId), inArray(os.status, ABERTAS)))
    .orderBy(asc(os.entradaEm))
    .limit(15);
  const agora = Date.now();

  const qtd = num(stats?.qtd);
  return {
    qtd,
    media: stats?.media != null ? num(stats.media) : null,
    mediana: stats?.mediana != null ? num(stats.mediana) : null,
    faixas: FAIXAS_PATIO.map((f) => {
      const n = qtdFaixa.get(f.chave) ?? 0;
      return { chave: f.chave, rotulo: f.rotulo, qtd: n, pct: qtd ? n / qtd : 0 };
    }),
    abertas: abertasRows.map(
      (o): OSAberta => ({
        id: o.id,
        numero: o.numero,
        status: o.status,
        entradaEm: o.entradaEm,
        dias: Math.max(0, (agora - o.entradaEm.getTime()) / 86_400_000),
        placa: o.placa,
        veiculo: [o.marca, o.modelo].filter(Boolean).join(" "),
        cliente: o.cliente,
        responsavel: o.responsavel,
      }),
    ),
  };
}

/* ---------- Produtividade por técnico ---------- */

export type LinhaTecnico = {
  tecnicoId: string | null;
  nome: string;
  qtd: number;
  servicos: number;
  pecas: number;
  total: number;
  ticket: number;
  /** Média entrada → entrega, em dias */
  diasMedio: number | null;
  /** Soma do tempo padrão do catálogo × quantidade dos serviços */
  minutosPadrao: number;
};

export async function produtividadeTecnicos(oficinaId: string, de: string, ate: string): Promise<LinhaTecnico[]> {
  const db = await getDb();
  const p = await subOS(filtroEntregues(oficinaId, de, ate));
  const rows = await db
    .select({
      tecnicoId: p.responsavelId,
      nome: sql<string | null>`max(${tecnicos.nome})`,
      qtd: sql<string>`count(*)`,
      total: sql<string>`coalesce(sum(${p.bruto} * ${p.fator}), 0)`,
      servicos: sql<string>`coalesce(sum(${p.brutoServicos} * ${p.fator}), 0)`,
      dias: sql<string | null>`avg(${p.dias})`,
    })
    .from(p)
    .leftJoin(tecnicos, eq(tecnicos.id, p.responsavelId))
    .groupBy(p.responsavelId);

  const minutos = await db
    .select({
      tecnicoId: os.responsavelId,
      minutos: sql<string>`coalesce(sum(${catalogoItens.tempoMinutos} * ${osItens.quantidade}), 0)`,
    })
    .from(osItens)
    .innerJoin(os, eq(os.id, osItens.osId))
    .innerJoin(catalogoItens, eq(catalogoItens.id, osItens.catalogoItemId))
    .where(and(...filtroEntregues(oficinaId, de, ate), eq(osItens.recusado, false), eq(osItens.tipo, "servico")))
    .groupBy(os.responsavelId);
  const minPor = new Map(minutos.map((m) => [m.tecnicoId ?? "", num(m.minutos)]));

  return rows
    .map((r) => {
      const qtd = num(r.qtd);
      const total = centavos(r.total);
      const servicos = centavos(r.servicos);
      return {
        tecnicoId: r.tecnicoId,
        nome: r.tecnicoId ? (r.nome ?? "Técnico removido") : "Sem responsável",
        qtd,
        servicos,
        pecas: total - servicos,
        total,
        ticket: qtd ? Math.round(total / qtd) : 0,
        diasMedio: r.dias != null ? num(r.dias) : null,
        minutosPadrao: Math.round(minPor.get(r.tecnicoId ?? "") ?? 0),
      };
    })
    .sort((a, b) => (a.tecnicoId ? 0 : 1) - (b.tecnicoId ? 0 : 1) || b.total - a.total);
}

/* ---------- Aprovação de orçamentos ---------- */

export const SITUACOES_ORCAMENTO = {
  aprovado: "Aprovado",
  parcial: "Aprovado em parte",
  recusado: "Recusado",
  pendente: "Aguardando resposta",
  vencido: "Vencido sem resposta",
} as const;
export type SituacaoOrcamento = keyof typeof SITUACOES_ORCAMENTO;

/**
 * Orçamentos enviados no período (data do envio), sem os substituídos por um envio mais novo.
 * Valor aprovado: total do aprovado; no parcial, os itens aprovados com o desconto na mesma proporção.
 */
export async function aprovacaoOrcamentos(oficinaId: string, de: string, ate: string) {
  const db = await getDb();
  const o = orcamentos;
  const situacao = sql<string>`case when ${o.status} = 'pendente' and ${o.validoAte} < now() then 'vencido' else ${o.status}::text end`;
  const aprovadoParcial = sql`(select coalesce(sum((e->>'quantidade')::numeric * (e->>'valorUnitario')::numeric), 0)
    from jsonb_array_elements(${o.itens}) e
    where e->>'id' in (select jsonb_array_elements_text(coalesce(${o.itensAprovados}, '[]'::jsonb))))`;
  const rows = await db
    .select({
      situacao,
      qtd: sql<string>`count(*)`,
      valor: sql<string>`coalesce(sum(${o.total}), 0)`,
      valorAprovado: sql<string>`coalesce(sum(case
        when ${o.status} = 'aprovado' then ${o.total}
        when ${o.status} = 'parcial' and ${o.total} + ${o.desconto} > 0 then ${aprovadoParcial} * ${o.total} / (${o.total} + ${o.desconto})
        else 0 end), 0)`,
      vistos: sql<string>`count(*) filter (where ${o.vistoEm} is not null)`,
      respondidos: sql<string>`count(*) filter (where ${o.respondidoEm} is not null)`,
      segundosResposta: sql<string>`coalesce(sum(extract(epoch from (${o.respondidoEm} - ${o.criadoEm}))) filter (where ${o.respondidoEm} is not null), 0)`,
    })
    .from(o)
    .where(and(eq(o.oficinaId, oficinaId), ne(o.status, "substituido"), gte(o.criadoEm, inicioDoDia(de)), lt(o.criadoEm, ate1(ate))))
    .groupBy(situacao);

  const por = new Map(rows.map((r) => [r.situacao, r]));
  const linhas = (Object.keys(SITUACOES_ORCAMENTO) as SituacaoOrcamento[]).map((s) => {
    const r = por.get(s);
    return {
      situacao: s,
      rotulo: SITUACOES_ORCAMENTO[s],
      qtd: num(r?.qtd),
      valor: centavos(r?.valor),
      valorAprovado: centavos(r?.valorAprovado),
      vistos: num(r?.vistos),
    };
  });
  const soma = (f: (r: (typeof rows)[number]) => string) => rows.reduce((s, r) => s + num(f(r)), 0);
  const total = linhas.reduce((s, l) => s + l.qtd, 0);
  const valor = linhas.reduce((s, l) => s + l.valor, 0);
  const valorAprovado = linhas.reduce((s, l) => s + l.valorAprovado, 0);
  const aprovados = linhas.filter((l) => l.situacao === "aprovado" || l.situacao === "parcial").reduce((s, l) => s + l.qtd, 0);
  const respondidos = soma((r) => r.respondidos);
  const vistos = soma((r) => r.vistos);
  return {
    linhas,
    total,
    valor,
    valorAprovado,
    aprovados,
    respondidos,
    vistos,
    taxaQtd: total ? aprovados / total : null,
    taxaValor: valor ? valorAprovado / valor : null,
    /** Horas médias entre o envio e a resposta */
    horasResposta: respondidos ? soma((r) => r.segundosResposta) / respondidos / 3600 : null,
  };
}

/* ---------- Clientes inativos ---------- */

export const MESES_INATIVO = [6, 12, 18] as const;

export type ClienteInativo = {
  id: string;
  nome: string;
  telefone: string | null;
  aceitaWhatsapp: boolean;
  ultimaVisita: Date;
  totalGasto: number;
  qtdOS: number;
  veiculoId: string | null;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
};

/**
 * Clientes não arquivados cuja última OS entregue foi há mais de N meses e que não têm OS aberta agora.
 * Total gasto: todas as OS entregues do cliente. Veículo: o da última OS entregue.
 */
export async function clientesInativos(oficinaId: string, meses: number, limite?: number): Promise<ClienteInativo[]> {
  const db = await getDb();
  const p = await subOS([eq(os.oficinaId, oficinaId), eq(os.status, "entregue"), isNotNull(os.clienteId), isNotNull(os.entregueEm)]);
  const h = db
    .select({
      clienteId: sql<string>`${p.clienteId}`.as("h_cliente_id"),
      ultima: sql<Date>`max(${p.entregueEm})`.as("h_ultima"),
      total: sql<string>`sum(${p.bruto} * ${p.fator})`.as("h_total"),
      qtd: sql<string>`count(*)`.as("h_qtd"),
      veiculoId: sql<string>`(array_agg(${p.veiculoId} order by ${p.entregueEm} desc))[1]`.as("h_ultimo_veiculo_id"),
    })
    .from(p)
    .groupBy(p.clienteId)
    .as("h");

  const corte = inicioDoDia(somarMeses(hojeSP(), -meses));
  const q = db
    .select({
      id: clientes.id,
      nome: clientes.nome,
      telefone: clientes.telefone,
      aceitaWhatsapp: clientes.aceitaWhatsapp,
      ultima: h.ultima,
      total: h.total,
      qtd: h.qtd,
      veiculoId: h.veiculoId,
      placa: veiculos.placa,
      marca: veiculos.marca,
      modelo: veiculos.modelo,
    })
    .from(h)
    .innerJoin(clientes, eq(clientes.id, h.clienteId))
    .leftJoin(veiculos, sql`${veiculos.id} = ${h.veiculoId}`)
    .where(
      and(
        eq(clientes.oficinaId, oficinaId),
        isNull(clientes.arquivadoEm),
        sql`${h.ultima} < ${corte.toISOString()}::timestamptz`,
        notExists(
          db
            .select({ um: sql`1` })
            .from(os)
            .where(and(eq(os.oficinaId, oficinaId), eq(os.clienteId, clientes.id), inArray(os.status, ABERTAS))),
        ),
      ),
    )
    .orderBy(desc(h.ultima));
  const rows = limite ? await q.limit(limite) : await q;
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    telefone: r.telefone,
    aceitaWhatsapp: r.aceitaWhatsapp,
    ultimaVisita: new Date(r.ultima),
    totalGasto: centavos(r.total),
    qtdOS: num(r.qtd),
    veiculoId: r.veiculoId,
    placa: r.placa,
    marca: r.marca,
    modelo: r.modelo,
  }));
}

/* ---------- Satisfação (NPS) ---------- */

export type RespostaPesquisa = {
  id: string;
  osId: string;
  numero: number;
  nota: number;
  comentario: string | null;
  respondidoEm: Date;
  cliente: string | null;
  placa: string;
};

/** NPS das pesquisas respondidas no período; taxa de resposta das pesquisas criadas no período */
export async function satisfacao(oficinaId: string, de: string, ate: string) {
  const db = await getDb();
  const noPeriodo = and(
    eq(pesquisas.oficinaId, oficinaId),
    isNotNull(pesquisas.nota),
    gte(pesquisas.respondidoEm, inicioDoDia(de)),
    lt(pesquisas.respondidoEm, ate1(ate)),
  );
  const porNota = await db.select({ nota: pesquisas.nota, qtd: sql<string>`count(*)` }).from(pesquisas).where(noPeriodo).groupBy(pesquisas.nota);
  const notas = Array.from({ length: 11 }, (_, n) => ({ nota: n, qtd: 0 }));
  for (const r of porNota) if (r.nota != null && r.nota >= 0 && r.nota <= 10) notas[r.nota].qtd += num(r.qtd);
  const respostas = notas.reduce((s, n) => s + n.qtd, 0);
  const promotores = notas.filter((n) => n.nota >= 9).reduce((s, n) => s + n.qtd, 0);
  const detratores = notas.filter((n) => n.nota <= 6).reduce((s, n) => s + n.qtd, 0);

  const [criadas] = await db
    .select({ criadas: sql<string>`count(*)`, respondidas: sql<string>`count(*) filter (where ${pesquisas.respondidoEm} is not null)` })
    .from(pesquisas)
    .where(and(eq(pesquisas.oficinaId, oficinaId), gte(pesquisas.criadoEm, inicioDoDia(de)), lt(pesquisas.criadoEm, ate1(ate))));

  const media = respostas ? notas.reduce((s, n) => s + n.nota * n.qtd, 0) / respostas : null;
  return {
    respostas,
    promotores,
    neutros: respostas - promotores - detratores,
    detratores,
    nps: respostas ? Math.round(((promotores - detratores) / respostas) * 100) : null,
    media,
    notas,
    criadas: num(criadas?.criadas),
    respondidasDasCriadas: num(criadas?.respondidas),
    taxaResposta: num(criadas?.criadas) ? num(criadas?.respondidas) / num(criadas?.criadas) : null,
  };
}

/** Respostas do período, mais recentes primeiro (soComentario: só as que têm comentário) */
export async function respostasPesquisa(oficinaId: string, de: string, ate: string, opcoes: { soComentario?: boolean; limite?: number } = {}) {
  const db = await getDb();
  const filtros = [
    eq(pesquisas.oficinaId, oficinaId),
    isNotNull(pesquisas.nota),
    gte(pesquisas.respondidoEm, inicioDoDia(de)),
    lt(pesquisas.respondidoEm, ate1(ate)),
  ];
  if (opcoes.soComentario) filtros.push(sql`coalesce(trim(${pesquisas.comentario}), '') <> ''`);
  const q = db
    .select({
      id: pesquisas.id,
      osId: pesquisas.osId,
      numero: os.numero,
      nota: pesquisas.nota,
      comentario: pesquisas.comentario,
      respondidoEm: pesquisas.respondidoEm,
      cliente: clientes.nome,
      placa: veiculos.placa,
    })
    .from(pesquisas)
    .innerJoin(os, eq(os.id, pesquisas.osId))
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .where(and(...filtros))
    .orderBy(desc(pesquisas.respondidoEm));
  const rows = opcoes.limite ? await q.limit(opcoes.limite) : await q;
  return rows.map(
    (r): RespostaPesquisa => ({
      ...r,
      nota: r.nota ?? 0,
      respondidoEm: r.respondidoEm ?? new Date(),
    }),
  );
}

/* ---------- Formatação ---------- */

/** Dias com uma casa: "2,5 dias" */
export function formatDias(d: number | null) {
  if (d == null) return "—";
  const v = Math.round(d * 10) / 10;
  return `${v.toLocaleString("pt-BR")} ${v === 1 ? "dia" : "dias"}`;
}

/** Minutos → "12h30" */
export function formatHoras(min: number) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** 0,456 → "45,6%" */
export const pct = (v: number | null) => (v == null ? "—" : `${(Math.round(v * 1000) / 10).toLocaleString("pt-BR")}%`);
