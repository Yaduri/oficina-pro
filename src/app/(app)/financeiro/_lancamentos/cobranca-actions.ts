"use server";

import { revalidatePath } from "next/cache";
import { getContexto } from "@/lib/oficina";
import { ehUuid } from "@/lib/os-acesso";
import { DIA_RE } from "@/lib/agenda-datas";
import { atualizarCobranca, cancelarCobranca, ehTipoCobranca, gerarCobranca, qrCodeDaCobranca, simularPagamento } from "@/lib/cobranca";
import { dadosCobranca, type DadosCobranca } from "./cobranca-dados";

export type CobrancaState = { erro?: string; dados?: DadosCobranca } | undefined;

const SEM_PERMISSAO = { erro: "Seu usuário não tem permissão para o financeiro" };
const NAO_ENCONTRADO = { erro: "Conta a receber não encontrada" };

async function oficinaFinanceiro() {
  const ctx = await getContexto();
  if (!ctx.pode("financeiro")) return null;
  return { oficinaId: ctx.oficina.id, userId: ctx.userId };
}

/** Recarrega os dados do painel e as telas que mostram o lançamento */
async function responder(oficinaId: string, lancamentoId: string, erro?: string): Promise<CobrancaState> {
  const dados = await dadosCobranca(oficinaId, lancamentoId);
  if (!dados) return NAO_ENCONTRADO;
  revalidatePath("/financeiro", "layout");
  if (dados.osId) revalidatePath(`/ordens-servico/${dados.osId}`);
  revalidatePath("/inicio");
  return { erro, dados };
}

export async function carregarCobranca(lancamentoId: string): Promise<CobrancaState> {
  const c = await oficinaFinanceiro();
  if (!c) return SEM_PERMISSAO;
  if (!ehUuid(lancamentoId)) return NAO_ENCONTRADO;
  const dados = await dadosCobranca(c.oficinaId, lancamentoId);
  return dados ? { dados } : NAO_ENCONTRADO;
}

/** QR Code do PIX, buscado no Asaas quando o painel abre */
export async function qrCodeCobranca(cobrancaId: string) {
  const c = await oficinaFinanceiro();
  if (!c || !ehUuid(cobrancaId)) return null;
  return qrCodeDaCobranca(c.oficinaId, cobrancaId);
}

export async function gerarCobrancaAcao(lancamentoId: string, _prev: CobrancaState, form: FormData): Promise<CobrancaState> {
  const c = await oficinaFinanceiro();
  if (!c) return SEM_PERMISSAO;
  if (!ehUuid(lancamentoId)) return NAO_ENCONTRADO;
  const tipo = String(form.get("tipo") ?? "");
  if (!ehTipoCobranca(tipo)) return { erro: "Escolha como o cliente vai pagar" };
  const vencimento = String(form.get("vencimento") ?? "").trim();
  if (vencimento && !DIA_RE.test(vencimento)) return { erro: "Data de vencimento inválida" };
  const documento = String(form.get("documento") ?? "").replace(/\D/g, "");
  const r = await gerarCobranca({
    oficinaId: c.oficinaId,
    lancamentoId,
    tipo,
    vencimento: vencimento || undefined,
    documento: documento || undefined,
    criadoPor: c.userId,
  });
  if ("erro" in r) return { erro: r.erro };
  return responder(c.oficinaId, lancamentoId);
}

type Operacao = "atualizar" | "cancelar" | "simular";

export async function operarCobranca(lancamentoId: string, cobrancaId: string, op: Operacao): Promise<CobrancaState> {
  const c = await oficinaFinanceiro();
  if (!c) return SEM_PERMISSAO;
  if (!ehUuid(lancamentoId) || !ehUuid(cobrancaId)) return NAO_ENCONTRADO;
  const fn = op === "cancelar" ? cancelarCobranca : op === "simular" ? simularPagamento : op === "atualizar" ? atualizarCobranca : null;
  if (!fn) return { erro: "Operação inválida" };
  const r = await fn(c.oficinaId, cobrancaId);
  return responder(c.oficinaId, lancamentoId, "erro" in r ? r.erro : undefined);
}
