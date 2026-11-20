"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigir } from "@/lib/oficina";
import {
  cancelarNotaFiscal,
  consultarNotaNaSefin,
  criarEEmitirNfse,
  processarFilaFiscal,
  transmitirNota,
} from "@/lib/fiscal/notas";
import { cnpjValido, cpfValido, normalizarCnpj, soDigitos } from "@/lib/utils";
import type { RetencoesFiscais } from "@/db/schema";

export type NotaActionState = { erro?: string; ok?: boolean; mensagem?: string; notaId?: string } | undefined;

const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

function lerValor(v: string): number {
  if (!v) return 0;
  const limpo = v.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}

function lerOpcional(v: string): number | null {
  if (!v) return null;
  return lerValor(v);
}

function revalidarNota(osId?: string | null, notaId?: string) {
  revalidatePath("/notas");
  if (notaId) revalidatePath(`/notas/${notaId}`);
  if (osId) revalidatePath(`/ordens-servico/${osId}`);
}

/** Emite uma nova NFS-e (a partir de OS, avulsa ou substituição) */
export async function emitirNfseAction(_prev: NotaActionState, form: FormData): Promise<NotaActionState> {
  const ctx = await exigir("emitirNota");

  const osIdRaw = f(form, "osId");
  const osId = osIdRaw && z.uuid().safeParse(osIdRaw).success ? osIdRaw : null;
  const clienteIdRaw = f(form, "clienteId");
  const clienteId = clienteIdRaw && z.uuid().safeParse(clienteIdRaw).success ? clienteIdRaw : null;

  const tomadorNome = f(form, "tomadorNome");
  if (tomadorNome.length < 2) return { erro: "Informe o nome ou razão social do tomador." };

  const docRaw = f(form, "tomadorDocumento");
  let tomadorDocumento: string | null = null;
  if (docRaw) {
    const digitos = soDigitos(docRaw);
    const alfa = normalizarCnpj(docRaw);
    if (digitos.length === 11) {
      if (!cpfValido(digitos)) return { erro: "CPF do tomador inválido." };
      tomadorDocumento = digitos;
    } else if (alfa.length === 14) {
      if (!cnpjValido(alfa)) return { erro: "CNPJ do tomador inválido." };
      tomadorDocumento = alfa;
    } else {
      return { erro: "Informe um CPF (11 dígitos) ou CNPJ (14 caracteres) válido para o tomador." };
    }
  }

  const competencia = f(form, "competencia");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Data de competência inválida." };

  const valorServicos = lerValor(f(form, "valorServicos"));
  if (Number.isNaN(valorServicos) || valorServicos <= 0) return { erro: "Informe um valor de serviços maior que zero." };

  const valorDesconto = lerValor(f(form, "valorDesconto"));
  if (Number.isNaN(valorDesconto) || valorDesconto < 0 || valorDesconto > valorServicos) {
    return { erro: "Valor de desconto inválido." };
  }

  const aliquotaIss = lerOpcional(f(form, "aliquotaIss"));
  if (aliquotaIss !== null && (Number.isNaN(aliquotaIss) || aliquotaIss < 0 || aliquotaIss > 15)) {
    return { erro: "Alíquota de ISS deve ficar entre 0 e 15%." };
  }

  const codigoTribNacional = soDigitos(f(form, "codigoTribNacional"));
  if (codigoTribNacional.length !== 6) {
    return { erro: "Código de tributação nacional deve ter 6 dígitos (ex.: 140101)." };
  }

  const discriminacao = f(form, "discriminacao");
  if (discriminacao.length < 5) return { erro: "Descreva os serviços prestados (mínimo 5 caracteres)." };

  const retencoes: RetencoesFiscais = {};
  for (const campo of ["pis", "cofins", "csll", "irrf", "inss"] as const) {
    const v = lerValor(f(form, `ret_${campo}`));
    if (Number.isNaN(v) || v < 0) return { erro: `Valor de retenção (${campo.toUpperCase()}) inválido.` };
    if (v > 0) retencoes[campo] = v;
  }

  // Substituição opcional
  const substNotaId = f(form, "substituiNotaId");
  const substChave = soDigitos(f(form, "chaveSubstituida"));
  const substCodigo = f(form, "codigoMotivoSubstituicao");
  const substMotivo = f(form, "motivoSubstituicao");
  let substituicao: {
    notaAnteriorId: string;
    chaveSubstituida: string;
    codigoMotivo: "01" | "02" | "03" | "04" | "05" | "99";
    motivo: string;
  } | null = null;

  if (substNotaId && z.uuid().safeParse(substNotaId).success) {
    if (substChave.length < 20) return { erro: "Chave de acesso da nota substituída inválida." };
    if (substMotivo.length < 10) return { erro: "Informe o motivo da substituição (mínimo 10 caracteres)." };
    substituicao = {
      notaAnteriorId: substNotaId,
      chaveSubstituida: substChave,
      codigoMotivo: (["01", "02", "03", "04", "05", "99"].includes(substCodigo) ? substCodigo : "99") as "01" | "02" | "03" | "04" | "05" | "99",
      motivo: substMotivo,
    };
  }

  const r = await criarEEmitirNfse({
    oficinaId: ctx.oficina.id,
    osId,
    clienteId,
    competencia,
    valorServicos,
    valorDesconto,
    aliquotaIss,
    issRetido: form.get("issRetido") === "on",
    retencoes: Object.keys(retencoes).length > 0 ? retencoes : null,
    codigoTribNacional,
    codigoTribMunicipal: f(form, "codigoTribMunicipal") || null,
    discriminacao,
    tomador: {
      nome: tomadorNome,
      documento: tomadorDocumento,
      email: f(form, "tomadorEmail") || null,
      telefone: f(form, "tomadorTelefone") || null,
      cep: f(form, "tomadorCep") || null,
      logradouro: f(form, "tomadorLogradouro") || null,
      numero: f(form, "tomadorNumero") || null,
      complemento: f(form, "tomadorComplemento") || null,
      bairro: f(form, "tomadorBairro") || null,
      cidade: f(form, "tomadorCidade") || null,
      uf: f(form, "tomadorUf") || null,
    },
    substituicao,
    criadoPor: ctx.userId,
    usuarioNome: ctx.membro.nome || ctx.membro.email,
  });

  if (!r.ok) return { erro: r.erro };

  revalidarNota(osId, r.notaId);
  if (f(form, "redirecionar") === "1") {
    redirect(`/notas/${r.notaId}`);
  }
  return { ok: true, notaId: r.notaId, mensagem: r.mensagem };
}

export async function reenviarNotaAction(notaId: string, osId?: string | null): Promise<NotaActionState> {
  if (!z.uuid().safeParse(notaId).success) return { erro: "Nota inválida." };
  const ctx = await exigir("emitirNota");
  const r = await transmitirNota(ctx.oficina.id, notaId, {
    usuarioId: ctx.userId,
    usuarioNome: ctx.membro.nome || ctx.membro.email,
  });
  revalidarNota(osId, notaId);
  if (r.status === "autorizada") return { ok: true, mensagem: "NFS-e autorizada pela SEFIN Nacional." };
  return { erro: r.mensagem || "Não foi possível autorizar a nota." };
}

export async function consultarNotaAction(notaId: string, osId?: string | null): Promise<NotaActionState> {
  if (!z.uuid().safeParse(notaId).success) return { erro: "Nota inválida." };
  const ctx = await exigir("emitirNota");
  const r = await consultarNotaNaSefin(ctx.oficina.id, notaId);
  revalidarNota(osId, notaId);
  if (!r.ok) return { erro: r.erro };
  return { ok: true, mensagem: `Situação sincronizada: ${r.status}.` };
}

export async function cancelarNotaAction(notaId: string, osId: string | null, _prev: NotaActionState, form: FormData): Promise<NotaActionState> {
  if (!z.uuid().safeParse(notaId).success) return { erro: "Nota inválida." };
  const ctx = await exigir("emitirNota");
  const codigo = f(form, "codigoMotivo");
  const motivo = f(form, "motivo");
  if (!["1", "2", "9"].includes(codigo)) return { erro: "Escolha o motivo do cancelamento." };
  if (motivo.length < 15) return { erro: "Descreva a justificativa com pelo menos 15 caracteres (exigência da SEFIN Nacional)." };

  const r = await cancelarNotaFiscal({
    oficinaId: ctx.oficina.id,
    notaId,
    codigoMotivo: codigo as "1" | "2" | "9",
    motivo,
    usuarioId: ctx.userId,
    usuarioNome: ctx.membro.nome || ctx.membro.email,
  });

  if (!r.ok) return { erro: r.erro };
  revalidarNota(osId, notaId);
  return { ok: true, mensagem: "NFS-e cancelada com sucesso." };
}

export async function processarFilaAction(): Promise<NotaActionState> {
  const ctx = await exigir("emitirNota");
  const r = await processarFilaFiscal(ctx.oficina.id);
  revalidatePath("/notas");
  return {
    ok: true,
    mensagem:
      r.processadas === 0
        ? "Nenhuma nota aguardando nova tentativa no momento."
        : `Fila processada: ${r.autorizadas} autorizada(s), ${r.falhas} pendente(s)/rejeitada(s).`,
  };
}
