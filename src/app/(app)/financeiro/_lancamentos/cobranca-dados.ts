import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { centavos, hojeSP } from "@/lib/financeiro";
import { cobrancasDoLancamento, resumoGateway, SITUACAO_COBRANCA, TIPOS_COBRANCA, ehTipoCobranca } from "@/lib/cobranca";
import type { Tom } from "@/components/ui";

/** Uma cobrança como a tela mostra (valores em centavos) */
export type CobrancaVisivel = {
  id: string;
  valor: number;
  vencimento: string;
  tipo: string;
  /** Tem QR Code PIX (todos menos cartão) */
  temPix: boolean;
  situacao: "pendente" | "pago" | "cancelada" | "estornada";
  situacaoLabel: string;
  tom: Tom;
  vencida: boolean;
  linkPagamento: string | null;
  pixCopiaECola: string | null;
  pagoEm: string | null;
  criadoEm: string;
};

/** Tudo que o painel de cobrança online precisa de um lançamento a receber */
export type DadosCobranca = {
  lancamentoId: string;
  osId: string | null;
  /** Conta a receber em aberto ou parcial */
  emAberto: boolean;
  /** Valor em aberto, em centavos */
  aberto: number;
  hoje: string;
  vencimentoPadrao: string;
  cliente: { nome: string; telefone: string | null; temDocumento: boolean } | null;
  /** Nulo: oficina sem conta do Asaas conectada (ou desativada) */
  ambiente: "sandbox" | "producao" | null;
  tipos: { valor: string; label: string }[];
  pendente: CobrancaVisivel | null;
  historico: CobrancaVisivel[];
};

export async function dadosCobranca(oficinaId: string, lancamentoId: string): Promise<DadosCobranca | null> {
  const db = await getDb();
  const { lancamentos: l, clientes } = schema;
  const [lanc] = await db
    .select()
    .from(l)
    .where(and(eq(l.id, lancamentoId), eq(l.oficinaId, oficinaId), eq(l.tipo, "receber")));
  if (!lanc) return null;
  const [gateway, lista, cliente] = await Promise.all([
    resumoGateway(oficinaId),
    cobrancasDoLancamento(oficinaId, lancamentoId),
    lanc.clienteId
      ? db
          .select({ nome: clientes.nome, telefone: clientes.telefone, documento: clientes.documento })
          .from(clientes)
          .where(eq(clientes.id, lanc.clienteId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const hoje = hojeSP();
  const visiveis: CobrancaVisivel[] = lista.map((c) => {
    const s = SITUACAO_COBRANCA[c.situacao];
    return {
      id: c.id,
      valor: centavos(c.valor),
      vencimento: c.vencimento,
      tipo: ehTipoCobranca(c.tipo) ? TIPOS_COBRANCA[c.tipo] : c.tipo,
      temPix: c.tipo !== "CREDIT_CARD",
      situacao: c.situacao,
      situacaoLabel: s.label,
      tom: s.tom,
      vencida: c.situacao === "pendente" && c.vencimento < hoje,
      linkPagamento: c.linkPagamento,
      pixCopiaECola: c.pixCopiaECola,
      pagoEm: c.pagoEm,
      criadoEm: c.criadoEm.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    };
  });
  const pendente = visiveis.find((c) => c.situacao === "pendente") ?? null;
  return {
    lancamentoId,
    osId: lanc.osId,
    emAberto: lanc.status === "aberto" || lanc.status === "parcial",
    aberto: Math.max(centavos(lanc.valor) - centavos(lanc.valorPago), 0),
    hoje,
    vencimentoPadrao: lanc.vencimento >= hoje ? lanc.vencimento : hoje,
    cliente: cliente ? { nome: cliente.nome, telefone: cliente.telefone, temDocumento: !!cliente.documento } : null,
    ambiente: gateway?.ativo ? gateway.ambiente : null,
    tipos: Object.entries(TIPOS_COBRANCA).map(([valor, label]) => ({ valor, label })),
    pendente,
    historico: visiveis.filter((c) => c !== pendente),
  };
}
