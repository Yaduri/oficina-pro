"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirAdmin } from "@/lib/oficina";
import { removerCertificadoA1, salvarCertificadoA1, salvarParametrosFiscais } from "@/lib/fiscal/notas";
import { formatDocumento } from "@/lib/utils";
import type { DadosIbsCbs } from "@/db/schema";

export type FiscalConfigState = { erro?: string; ok?: boolean; aviso?: string } | undefined;

const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

function numeroOpcional(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

function revalidar() {
  revalidatePath("/configuracoes/fiscal");
  revalidatePath("/notas");
}

/* ---------- Certificado digital A1 (.pfx / .p12) ---------- */

export async function enviarCertificadoA1(_prev: FiscalConfigState, form: FormData): Promise<FiscalConfigState> {
  const { oficina } = await exigirAdmin();
  const arquivo = form.get("certificado");
  const senha = String(form.get("senha") ?? "");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione o arquivo .pfx ou .p12 do certificado A1." };
  }
  if (arquivo.size > 2_000_000) {
    return { erro: "Arquivo muito grande (máximo 2 MB)." };
  }
  if (!senha) {
    return { erro: "Informe a senha do certificado A1." };
  }

  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const info = await salvarCertificadoA1(oficina.id, bytes, senha);
    revalidar();

    const avisos: string[] = [];
    if (info.validoAte < new Date()) {
      avisos.push("Atenção: este certificado já está vencido.");
    }
    if (info.cnpj && oficina.cnpj && info.cnpj !== oficina.cnpj.replace(/[^0-9A-Za-z]/g, "")) {
      avisos.push(
        `O CNPJ do certificado (${formatDocumento(info.cnpj)}) é diferente do CNPJ cadastrado na oficina (${formatDocumento(oficina.cnpj)}).`,
      );
    }
    return { ok: true, aviso: avisos.join(" ") || undefined };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível validar o certificado A1." };
  }
}

export async function excluirCertificadoA1(): Promise<FiscalConfigState> {
  const { oficina } = await exigirAdmin();
  await removerCertificadoA1(oficina.id);
  revalidar();
  return { ok: true };
}

/* ---------- Parâmetros NFS-e Nacional e Reforma Tributária ---------- */

const paramsSchema = z.object({
  provedor: z.enum(["nfse_nacional", "focus_nfe"]),
  ambiente: z.enum(["homologacao", "producao"]),
  codigoMunicipioIbge: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 7, "Código IBGE do município deve ter 7 dígitos")
    .transform((v) => v || null),
  serieDps: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 1 && v.length <= 5, "Série da DPS deve ter de 1 a 5 dígitos"),
  proximoNumeroDps: z.coerce.number().int("Número da DPS deve ser inteiro").min(1, "Mínimo 1").max(999_999_999),
  codigoTribNacionalPadrao: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 6, "Código de tributação nacional deve ter 6 dígitos (ex.: 140101)"),
  codigoTribMunicipalPadrao: z
    .string()
    .max(20)
    .transform((v) => v || null),
  optanteSimplesNacional: z.enum(["1", "2", "3"]),
  regimeApuracaoSn: z.enum(["1", "2", "3"]),
  regimeEspecialTrib: z.enum(["0", "1", "2", "3", "4", "5", "6"]),
});

export async function salvarConfiguracaoFiscal(_prev: FiscalConfigState, form: FormData): Promise<FiscalConfigState> {
  const { oficina } = await exigirAdmin();

  const parsed = paramsSchema.safeParse({
    provedor: f(form, "provedor") || "nfse_nacional",
    ambiente: f(form, "ambiente") || "homologacao",
    codigoMunicipioIbge: f(form, "codigoMunicipioIbge"),
    serieDps: f(form, "serieDps") || "00001",
    proximoNumeroDps: f(form, "proximoNumeroDps") || "1",
    codigoTribNacionalPadrao: f(form, "codigoTribNacionalPadrao") || "140101",
    codigoTribMunicipalPadrao: f(form, "codigoTribMunicipalPadrao"),
    optanteSimplesNacional: f(form, "optanteSimplesNacional") || "3",
    regimeApuracaoSn: f(form, "regimeApuracaoSn") || "1",
    regimeEspecialTrib: f(form, "regimeEspecialTrib") || "0",
  });

  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }

  const aliq = numeroOpcional(f(form, "aliquotaIss"));
  if (aliq !== null && (Number.isNaN(aliq) || aliq < 0 || aliq > 15)) {
    return { erro: "Alíquota de ISS inválida (use entre 0 e 15%)." };
  }

  const incluirIbsCbs = form.get("incluirIbsCbs") === "on";
  const pIbsUf = numeroOpcional(f(form, "pIbsUf"));
  const pIbsMun = numeroOpcional(f(form, "pIbsMun"));
  const pCbs = numeroOpcional(f(form, "pCbs"));
  if ([pIbsUf, pIbsMun, pCbs].some((x) => x !== null && (Number.isNaN(x) || x < 0 || x > 50))) {
    return { erro: "Alíquota de IBS/CBS inválida." };
  }

  const ibsCbsPadrao: DadosIbsCbs | null = incluirIbsCbs
    ? {
        finNFSe: f(form, "finNFSe") || "0",
        indFinal: f(form, "indFinal") || "1",
        cIndOp: f(form, "cIndOp") || undefined,
        cst: f(form, "cstIbsCbs") || "000",
        cClassTrib: f(form, "cClassTrib") || "000001",
        pIbsUf: pIbsUf ?? undefined,
        pIbsMun: pIbsMun ?? undefined,
        pCbs: pCbs ?? undefined,
      }
    : null;

  await salvarParametrosFiscais(oficina.id, {
    ...parsed.data,
    aliquotaIss: aliq,
    issRetidoPadrao: form.get("issRetidoPadrao") === "on",
    incluirIbsCbs,
    ibsCbsPadrao,
  });

  revalidar();
  return { ok: true };
}
