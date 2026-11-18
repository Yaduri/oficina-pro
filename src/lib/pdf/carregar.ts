import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { obterOS } from "@/lib/queries";
import { obterCheckin } from "@/lib/checkin-dados";
import { novoToken, orcamentoPorToken, ultimoOrcamento, urlBase } from "@/lib/orcamento";
import { documentoOS, documentoOrcamento, documentoTermo } from "./gerar";

/*
 * Busca no banco e monta cada PDF. Quem chama já conferiu o acesso:
 * usuário logado da oficina ou token de link público.
 */

async function oficinaCompleta(oficinaId: string) {
  const db = await getDb();
  const [o] = await db.select().from(schema.oficinas).where(eq(schema.oficinas.id, oficinaId));
  return o ?? null;
}

const placaArquivo = (placa: string) => placa.replace(/[^A-Z0-9]/gi, "");

/** PDF da OS da oficina */
export async function pdfOS(oficinaId: string, osId: string, opcoes: { via: "cliente" | "oficina"; valores: boolean }) {
  const oficina = await oficinaCompleta(oficinaId);
  if (!oficina) return null;
  const dados = await obterOS(oficinaId, osId);
  if (!dados) return null;
  let checklist = null;
  if (opcoes.via === "oficina" && dados.os.checkinId) {
    const db = await getDb();
    const [c] = await db.select({ checklist: schema.checkins.checklist }).from(schema.checkins).where(eq(schema.checkins.id, dados.os.checkinId));
    checklist = c?.checklist ?? null;
  }
  // Quem registrou a entrega (guardado como id do login)
  let entreguePor: string | null = null;
  if (dados.os.entreguePor) {
    const db = await getDb();
    const [m] = await db
      .select({ nome: schema.membros.nome, email: schema.membros.email })
      .from(schema.membros)
      .where(and(eq(schema.membros.oficinaId, oficinaId), eq(schema.membros.clerkUserId, dados.os.entreguePor)));
    entreguePor = m?.nome || m?.email || null;
  }
  const doc = await documentoOS({
    oficina,
    entreguePor,
    os: dados.os,
    veiculo: dados.veiculo,
    cliente: dados.cliente,
    responsavel: dados.responsavel?.nome ?? null,
    itens: dados.itens,
    via: opcoes.via,
    valores: opcoes.valores,
    checklist,
  });
  return { doc, nome: `OS-${dados.os.numero}-${placaArquivo(dados.veiculo.placa)}.pdf` };
}

/** PDF do orçamento a partir da OS (usuário logado) */
export async function pdfOrcamentoDaOS(oficinaId: string, osId: string) {
  const oficina = await oficinaCompleta(oficinaId);
  if (!oficina) return null;
  const dados = await obterOS(oficinaId, osId);
  if (!dados) return null;
  const orcamento = await ultimoOrcamento(osId);
  const doc = await documentoOrcamento({
    oficina,
    os: dados.os,
    veiculo: dados.veiculo,
    cliente: dados.cliente,
    orcamento,
    itensAtuais: dados.itens,
    link: orcamento ? `${await urlBase()}/orcamento/${orcamento.token}` : null,
  });
  return { doc, nome: `Orcamento-OS-${dados.os.numero}-${placaArquivo(dados.veiculo.placa)}.pdf` };
}

/** PDF do orçamento pelo link do cliente (exatamente o que foi enviado) */
export async function pdfOrcamentoPorToken(token: string) {
  const r = await orcamentoPorToken(token);
  if (!r) return null;
  const doc = await documentoOrcamento({
    oficina: r.oficina,
    os: r.os,
    veiculo: r.veiculo,
    cliente: r.cliente,
    orcamento: r.orcamento,
    link: `${await urlBase()}/orcamento/${token}`,
  });
  return { doc, nome: `Orcamento-OS-${r.os.numero}-${placaArquivo(r.veiculo.placa)}.pdf` };
}

/** PDF do termo de entrada */
export async function pdfTermo(oficinaId: string, checkinId: string) {
  const oficina = await oficinaCompleta(oficinaId);
  if (!oficina) return null;
  const dados = await obterCheckin(oficinaId, checkinId);
  if (!dados) return null;
  const doc = await documentoTermo({
    oficina,
    checkin: dados.checkin,
    veiculo: dados.veiculo,
    cliente: dados.cliente,
    fotos: dados.fotos,
    ordens: dados.ordens.map((o) => o.numero),
  });
  return { doc, nome: `Termo-${placaArquivo(dados.veiculo.placa)}-${dados.checkin.criadoEm.toISOString().slice(0, 10)}.pdf` };
}

/* ---------- Links públicos ---------- */

/** Token do link público do documento (cria na primeira vez) */
export async function linkPublico(oficinaId: string, tipo: "os" | "termo", refId: string) {
  const db = await getDb();
  const t = schema.linksDocumento;
  const [existente] = await db.select({ token: t.token }).from(t).where(and(eq(t.tipo, tipo), eq(t.refId, refId), eq(t.oficinaId, oficinaId)));
  if (existente) return existente.token;
  const [novo] = await db
    .insert(t)
    .values({ oficinaId, tipo, refId, token: novoToken() })
    .onConflictDoNothing()
    .returning({ token: t.token });
  if (novo) return novo.token;
  const [outro] = await db.select({ token: t.token }).from(t).where(and(eq(t.tipo, tipo), eq(t.refId, refId), eq(t.oficinaId, oficinaId)));
  return outro?.token ?? null;
}

export async function documentoPorToken(token: string) {
  const db = await getDb();
  const [l] = await db.select().from(schema.linksDocumento).where(eq(schema.linksDocumento.token, token));
  return l ?? null;
}
