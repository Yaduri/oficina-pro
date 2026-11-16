"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { exigirAdmin } from "@/lib/oficina";
import { cnpjValido, normalizarCnpj, soDigitos } from "@/lib/utils";

export type ConfigState = { erro?: string; ok?: boolean } | undefined;

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

const opcional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, "Texto muito longo")
    .transform((v) => v || null);

const telefone = z
  .string()
  .transform(soDigitos)
  .refine((v) => v === "" || v.length === 10 || v.length === 11, "Telefone deve ter DDD + número")
  .transform((v) => v || null);

const email = z
  .string()
  .trim()
  .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido")
  .transform((v) => v || null);

const enderecoSchema = z.object({
  cep: z
    .string()
    .transform(soDigitos)
    .refine((v) => v === "" || v.length === 8, "CEP deve ter 8 dígitos")
    .transform((v) => v || null),
  logradouro: opcional(),
  numero: opcional(20),
  complemento: opcional(),
  bairro: opcional(),
  cidade: opcional(),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || UFS.includes(v), "UF inválida")
    .transform((v) => v || null),
});

const f = (form: FormData, k: string) => String(form.get(k) ?? "");
const campos = (form: FormData, nomes: string[]) => Object.fromEntries(nomes.map((n) => [n, f(form, n)]));
const CAMPOS_ENDERECO = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf"];

function revalidar() {
  revalidatePath("/configuracoes");
  revalidatePath("/", "layout");
}

/* ---------- Oficina ---------- */

export async function salvarOficina(_prev: ConfigState, form: FormData): Promise<ConfigState> {
  const { oficina } = await exigirAdmin();
  const dados = z
    .object({
      nome: z.string().trim().min(2, "Informe o nome da oficina").max(120),
      telefone,
      whatsapp: telefone,
      email,
      logoKey: z
        .string()
        .refine((v) => v === "" || v.startsWith(`${oficina.id}/logos/`), "Logo inválida")
        .transform((v) => v || null),
    })
    .and(enderecoSchema)
    .safeParse(campos(form, ["nome", "telefone", "whatsapp", "email", "logoKey", ...CAMPOS_ENDERECO]));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const db = await getDb();
  await db.update(schema.oficinas).set(dados.data).where(eq(schema.oficinas.id, oficina.id));
  revalidar();
  return { ok: true };
}

/* ---------- Empresa (CNPJ) ---------- */

export async function salvarEmpresa(empresaId: string, _prev: ConfigState, form: FormData): Promise<ConfigState> {
  const { oficina, empresas } = await exigirAdmin();
  if (!empresas.some((e) => e.id === empresaId)) return { erro: "Empresa não encontrada" };

  const proprio = form.get("enderecoProprio") === "on";
  const dados = z
    .object({
      nome: z.string().trim().min(2, "Informe como a empresa aparece no sistema").max(40, "Nome muito longo (até 40 letras)"),
      razaoSocial: opcional(),
      nomeFantasia: opcional(),
      cnpj: z
        .string()
        .transform(normalizarCnpj)
        .refine((v) => v === "" || cnpjValido(v), "CNPJ inválido. Confira os números (e letras, no CNPJ alfanumérico).")
        .transform((v) => v || null),
      inscricaoEstadual: opcional(30),
      inscricaoMunicipal: opcional(30),
      regime: z
        .enum(["", "mei", "simples", "presumido", "real"])
        .transform((v) => v || null),
      telefone,
      email,
    })
    .and(enderecoSchema)
    .safeParse(
      campos(form, [
        "nome",
        "razaoSocial",
        "nomeFantasia",
        "cnpj",
        "inscricaoEstadual",
        "inscricaoMunicipal",
        "regime",
        "telefone",
        "email",
        ...CAMPOS_ENDERECO,
      ]),
    );
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const db = await getDb();
  if (dados.data.cnpj) {
    const [repetido] = await db
      .select({ id: schema.empresas.id })
      .from(schema.empresas)
      .where(
        and(
          eq(schema.empresas.oficinaId, oficina.id),
          eq(schema.empresas.cnpj, dados.data.cnpj),
          ne(schema.empresas.id, empresaId),
        ),
      );
    if (repetido) return { erro: "Este CNPJ já está em outra empresa da oficina" };
  }

  // Sem endereço próprio, a empresa usa o da oficina: limpa os campos
  const end = proprio
    ? {}
    : { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null };
  await db
    .update(schema.empresas)
    .set({ ...dados.data, ...end, enderecoProprio: proprio })
    .where(and(eq(schema.empresas.id, empresaId), eq(schema.empresas.oficinaId, oficina.id)));
  revalidar();
  return { ok: true };
}

/* ---------- Textos padrão ---------- */

export async function salvarTextos(_prev: ConfigState, form: FormData): Promise<ConfigState> {
  const { oficina } = await exigirAdmin();
  const dados = z
    .object({
      textoGarantia: opcional(2000),
      textoTermoCheckin: opcional(2000),
      obsOrcamento: opcional(1000),
      validadeOrcamentoDias: z.coerce
        .number({ error: "Validade inválida" })
        .int("Use um número inteiro de dias")
        .min(1, "Validade mínima de 1 dia")
        .max(90, "Validade máxima de 90 dias"),
    })
    .safeParse(campos(form, ["textoGarantia", "textoTermoCheckin", "obsOrcamento", "validadeOrcamentoDias"]));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const db = await getDb();
  await db.update(schema.oficinas).set(dados.data).where(eq(schema.oficinas.id, oficina.id));
  revalidar();
  return { ok: true };
}
