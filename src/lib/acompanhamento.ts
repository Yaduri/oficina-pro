import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDbSistema, schema, type DB } from "@/db";
import { linkPublico, linksPublicosEmLote } from "@/lib/links-publicos";
import { TOKEN_RE, urlBase } from "@/lib/orcamento";
import { calcularTotais } from "@/lib/os-total";
import { STATUS_CLIENTE, type StatusOS } from "@/lib/os";

/*
 * Link de acompanhamento da OS (/acompanhamento/<token>): um link por OS, que o cliente recebe
 * e usa do orçamento à entrega. Antes da aprovação mostra o orçamento para aprovar (inclusive
 * orçamentos complementares da mesma OS); depois, o andamento com data e hora, as fotos que a
 * oficina marcou como visíveis e, entregue, o PDF da OS e as notas fiscais.
 *
 * Fica em links_documento (tipo "acompanhamento", ref_id = id da OS) e não expira.
 * Página pública: conexão do sistema, com a oficina e a OS do token filtradas em cada consulta.
 * Nunca mostrar os_eventos (tem nomes de funcionários e observações internas), custos nem
 * fotos não marcadas.
 */

const { linksDocumento: ld, ordensServico: os, veiculos, clientes, oficinas, orcamentos, osFotos, osStatusHistorico: hist, osItens, notasFiscais } = schema;

/** Token do link de acompanhamento da OS (cria na primeira vez). `conexao`: a do sistema nas páginas públicas. */
export async function garantirAcompanhamento(oficinaId: string, osId: string, conexao?: DB) {
  const token = await linkPublico(oficinaId, "acompanhamento", osId, conexao);
  if (!token) throw new Error("Não foi possível gerar o link de acompanhamento");
  return token;
}

/** Endereço completo do link de acompanhamento */
export async function urlAcompanhamento(token: string) {
  return `${await urlBase()}/acompanhamento/${token}`;
}

/** OS, veículo, cliente e oficina do link de acompanhamento */
export async function acompanhamentoPorToken(token: string, conexao?: DB) {
  if (!TOKEN_RE.test(token)) return null;
  // Sem login: o token é a autorização (conexão do sistema, filtrada pelo token)
  const db = conexao ?? (await getDbSistema());
  const [row] = await db
    .select({ os, veiculo: veiculos, cliente: clientes, oficina: oficinas })
    .from(ld)
    .innerJoin(os, and(eq(os.id, ld.refId), eq(os.oficinaId, ld.oficinaId)))
    .innerJoin(veiculos, and(eq(veiculos.id, os.veiculoId), eq(veiculos.oficinaId, ld.oficinaId)))
    .innerJoin(oficinas, eq(oficinas.id, ld.oficinaId))
    .leftJoin(clientes, and(eq(clientes.id, os.clienteId), eq(clientes.oficinaId, ld.oficinaId)))
    .where(and(eq(ld.token, token), eq(ld.tipo, "acompanhamento")));
  return row ?? null;
}

/** Foto do serviço pelo link: só da OS do token e marcada como visível ao cliente */
export async function fotoDoAcompanhamento(token: string, fotoId: string, conexao?: DB) {
  if (!TOKEN_RE.test(token) || !/^[0-9a-f-]{36}$/i.test(fotoId)) return null;
  const db = conexao ?? (await getDbSistema());
  const [row] = await db
    .select({ key: osFotos.key, oficinaId: ld.oficinaId })
    .from(ld)
    .innerJoin(os, and(eq(os.id, ld.refId), eq(os.oficinaId, ld.oficinaId)))
    .innerJoin(osFotos, eq(osFotos.osId, os.id))
    .where(and(eq(ld.token, token), eq(ld.tipo, "acompanhamento"), eq(osFotos.id, fotoId), eq(osFotos.visivelCliente, true)));
  // As chaves sempre começam com o id da oficina
  if (!row || !row.key.startsWith(`${row.oficinaId}/`)) return null;
  return row.key;
}

/* ---------- Linha do tempo ---------- */

/** Etapas mostradas ao cliente, na ordem do fluxo */
export const ETAPAS_CLIENTE: StatusOS[] = ["diagnostico", "aguardando_aprovacao", "aguardando_peca", "em_execucao", "pronto", "entregue"];

/** Etapas que podem não acontecer (só aparecem se a OS passou por elas) */
const OPCIONAIS: StatusOS[] = ["aguardando_aprovacao", "aguardando_peca"];

export type EtapaCliente = { status: StatusOS; label: string; quando: Date | null; situacao: "feita" | "atual" | "futura" };

/**
 * Linha do tempo para o cliente a partir do histórico de status (data e hora de cada mudança).
 * Etapas anteriores à atual só aparecem se aconteceram (a entrada sempre); das próximas,
 * "Aguardando peça" não aparece (só se acontecer). OS cancelada: o que aconteceu e o cancelamento.
 */
export function linhaDoTempo(
  atual: StatusOS,
  historico: { status: StatusOS; criadoEm: Date }[],
  datas: { entradaEm: Date; entregueEm: Date | null },
): EtapaCliente[] {
  const ultima = new Map<StatusOS, Date>();
  for (const h of historico) {
    const d = ultima.get(h.status);
    if (!d || h.criadoEm > d) ultima.set(h.status, h.criadoEm);
  }
  if (!ultima.has("diagnostico")) ultima.set("diagnostico", datas.entradaEm);
  if (!ultima.has("entregue") && datas.entregueEm && atual === "entregue") ultima.set("entregue", datas.entregueEm);
  const etapa = (status: StatusOS, situacao: EtapaCliente["situacao"]): EtapaCliente => ({
    status,
    label: STATUS_CLIENTE[status].label,
    quando: situacao === "futura" ? null : (ultima.get(status) ?? null),
    situacao,
  });

  if (atual === "cancelada") {
    const feitas = ETAPAS_CLIENTE.filter((s) => ultima.has(s))
      .map((s) => etapa(s, "feita"))
      .sort((a, b) => a.quando!.getTime() - b.quando!.getTime());
    return [...feitas, etapa("cancelada", "atual")];
  }

  const idx = ETAPAS_CLIENTE.indexOf(atual);
  const res: EtapaCliente[] = [];
  ETAPAS_CLIENTE.forEach((s, i) => {
    if (i < idx) {
      if (s === "diagnostico" || ultima.has(s)) res.push(etapa(s, "feita"));
    } else if (i === idx) res.push(etapa(s, "atual"));
    else if (!OPCIONAIS.includes(s) || (s === "aguardando_aprovacao" && atual === "diagnostico")) res.push(etapa(s, "futura"));
  });
  return res;
}

/* ---------- Dados da página ---------- */

/**
 * Tudo o que a página mostra além da OS: orçamentos, histórico de status, fotos visíveis, itens
 * (sem custos internos) e, entregue, PDF da OS e notas fiscais. No máximo 3 consultas ao mesmo tempo.
 */
export async function dadosAcompanhamento(
  oficinaId: string,
  osId: string,
  status: StatusOS,
  desconto: { percentual: number | null; valor: number },
  conexao?: DB,
) {
  const db = conexao ?? (await getDbSistema());
  const [orcs, historico, fotos] = await Promise.all([
    db
      .select()
      .from(orcamentos)
      .where(and(eq(orcamentos.oficinaId, oficinaId), eq(orcamentos.osId, osId)))
      .orderBy(asc(orcamentos.criadoEm)),
    db
      .select({ status: hist.status, criadoEm: hist.criadoEm })
      .from(hist)
      .where(and(eq(hist.oficinaId, oficinaId), eq(hist.osId, osId)))
      .orderBy(asc(hist.criadoEm)),
    // os_fotos não tem oficina_id: a OS vem do token (já filtrada pela oficina) e o join confere
    db
      .select({ id: osFotos.id, legenda: osFotos.legenda, criadoEm: osFotos.criadoEm })
      .from(osFotos)
      .innerJoin(os, and(eq(os.id, osFotos.osId), eq(os.oficinaId, oficinaId)))
      .where(and(eq(osFotos.osId, osId), eq(osFotos.visivelCliente, true)))
      .orderBy(asc(osFotos.criadoEm)),
  ]);

  const entregue = status === "entregue";
  const [itens, notas] = await Promise.all([
    db
      .select({ descricao: osItens.descricao, tipo: osItens.tipo, quantidade: osItens.quantidade, valorUnitario: osItens.valorUnitario })
      .from(osItens)
      .innerJoin(os, and(eq(os.id, osItens.osId), eq(os.oficinaId, oficinaId)))
      .where(and(eq(osItens.osId, osId), eq(osItens.recusado, false)))
      .orderBy(asc(osItens.criadoEm)),
    // Notas fiscais autorizadas da OS (mesmo critério do portal)
    entregue
      ? db
          .select({ id: notasFiscais.id, numeroNota: notasFiscais.numeroNota, numeroDps: notasFiscais.numeroDps, ambiente: notasFiscais.ambiente })
          .from(notasFiscais)
          .where(and(eq(notasFiscais.oficinaId, oficinaId), eq(notasFiscais.osId, osId), eq(notasFiscais.status, "autorizada")))
          .orderBy(desc(notasFiscais.emitidaEm))
      : Promise.resolve([]),
  ]);

  // Entregue: PDF da OS (via do cliente) e DANFSe das notas autorizadas, com links públicos reaproveitados
  let pdfToken: string | null = null;
  let notasLinks: { numero: string; ambiente: "homologacao" | "producao"; token: string }[] = [];
  if (entregue) {
    pdfToken = await linkPublico(oficinaId, "os", osId, db);
    if (notas.length > 0) {
      const tokens = await linksPublicosEmLote(oficinaId, "nota", notas.map((n) => n.id), db);
      notasLinks = notas
        .filter((n) => tokens.has(n.id))
        .map((n) => ({ numero: n.numeroNota ?? `DPS ${n.numeroDps}`, ambiente: n.ambiente, token: tokens.get(n.id)! }));
    }
  }

  const valores = itens.map((i) => ({ tipo: i.tipo, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario) }));
  return {
    orcamentos: orcs,
    historico,
    fotos,
    itens: itens.map((i) => ({ descricao: i.descricao, tipo: i.tipo })),
    total: calcularTotais(valores, desconto).total,
    pdfToken,
    notas: notasLinks,
  };
}

/**
 * Tokens de acompanhamento de várias OS da mesma oficina (portal do cliente): 1 consulta para
 * os existentes e 1 insert para os que faltam.
 */
export function acompanhamentosEmLote(oficinaId: string, osIds: string[], db: DB) {
  return linksPublicosEmLote(oficinaId, "acompanhamento", osIds, db);
}
