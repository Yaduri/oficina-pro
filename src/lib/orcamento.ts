import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { getDb, getDbSistema, schema } from "@/db";
import type { ItemOrcamento } from "@/db/schema";
import type { Tom } from "@/components/ui";

const { orcamentos, ordensServico: os, veiculos, clientes, oficinas } = schema;

export type StatusOrcamento = (typeof schema.statusOrcamento.enumValues)[number];
export type Orcamento = typeof orcamentos.$inferSelect;

export const STATUS_ORCAMENTO: Record<StatusOrcamento, { label: string; tom: Tom }> = {
  pendente: { label: "Aguardando cliente", tom: "warn" },
  aprovado: { label: "Aprovado", tom: "ok" },
  parcial: { label: "Aprovado em parte", tom: "info" },
  recusado: { label: "Recusado", tom: "danger" },
  substituido: { label: "Substituído", tom: "neutro" },
};

/** Segredo do link público (192 bits) */
export function novoToken() {
  return randomBytes(24).toString("base64url");
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/** Endereço público do app: APP_URL ou o host da requisição atual */
export async function urlBase() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const totalItens = (itens: Pick<ItemOrcamento, "quantidade" | "valorUnitario">[]) =>
  itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

/** Itens atuais da OS diferem do que foi enviado ao cliente? */
export function orcamentoDesatualizado(enviado: ItemOrcamento[], atuais: ItemOrcamento[]) {
  if (enviado.length !== atuais.length) return true;
  const mapa = new Map(enviado.map((i) => [i.id, i]));
  return atuais.some((a) => {
    const e = mapa.get(a.id);
    return !e || e.descricao !== a.descricao || e.quantidade !== a.quantidade || e.valorUnitario !== a.valorUnitario || e.tipo !== a.tipo;
  });
}

/** Último orçamento enviado de uma OS */
export async function ultimoOrcamento(osId: string) {
  const db = await getDb();
  const [o] = await db.select().from(orcamentos).where(eq(orcamentos.osId, osId)).orderBy(desc(orcamentos.criadoEm)).limit(1);
  return o ?? null;
}

/** Página pública: orçamento pelo token, com dados para exibir ao cliente */
export async function orcamentoPorToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  // Sem login: o token é a autorização (conexão do sistema, filtrada pelo token)
  const db = await getDbSistema();
  const [row] = await db
    .select({ orcamento: orcamentos, os, veiculo: veiculos, cliente: clientes, oficina: oficinas })
    .from(orcamentos)
    .innerJoin(os, eq(os.id, orcamentos.osId))
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .innerJoin(oficinas, eq(oficinas.id, orcamentos.oficinaId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .where(eq(orcamentos.token, token));
  return row ?? null;
}

/** Lista para a tela Orçamentos (último envio de cada OS) */
export async function listarOrcamentos(oficinaId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: orcamentos.id,
      osId: os.id,
      numero: os.numero,
      status: orcamentos.status,
      total: orcamentos.total,
      criadoEm: orcamentos.criadoEm,
      vistoEm: orcamentos.vistoEm,
      respondidoEm: orcamentos.respondidoEm,
      placa: veiculos.placa,
      marca: veiculos.marca,
      modelo: veiculos.modelo,
      cliente: clientes.nome,
    })
    .from(orcamentos)
    .innerJoin(os, eq(os.id, orcamentos.osId))
    .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
    .leftJoin(clientes, eq(clientes.id, os.clienteId))
    .where(and(eq(orcamentos.oficinaId, oficinaId)))
    .orderBy(desc(orcamentos.criadoEm))
    .limit(200);
  // Só o envio mais recente de cada OS
  const vistos = new Set<string>();
  return rows.filter((r) => (vistos.has(r.osId) ? false : (vistos.add(r.osId), true)));
}
