"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { ehUuid } from "@/lib/os-acesso";
import { cnpjValido, normalizarCnpj, soDigitos } from "@/lib/utils";

export type FormState = { erro?: string; ok?: boolean } | undefined;
export type Simples = { erro?: string; ok?: boolean; arquivado?: boolean };

const { fornecedores, compras } = schema;
const SEM_PERMISSAO = { erro: "Seu usuário não tem permissão para isso" };

function cpfValido(v: string) {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

const opcional = z
  .string()
  .trim()
  .transform((v) => v || null);

const fornecedorSchema = z
  .object({
    tipoPessoa: z.enum(["pf", "pj"]),
    nome: z.string().trim().min(2, "Informe o nome ou a razão social").max(200),
    nomeFantasia: opcional,
    cpfCnpj: z.string().trim(),
    inscricaoEstadual: opcional,
    telefone: z
      .string()
      .transform(soDigitos)
      .refine((v) => v === "" || v.length === 10 || v.length === 11, "Telefone deve ter DDD + número")
      .transform((v) => v || null),
    email: z
      .string()
      .trim()
      .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido")
      .transform((v) => v || null),
    contato: opcional,
    cep: z
      .string()
      .transform(soDigitos)
      .refine((v) => v === "" || v.length === 8, "CEP deve ter 8 dígitos")
      .transform((v) => v || null),
    logradouro: opcional,
    numero: opcional,
    complemento: opcional,
    bairro: opcional,
    cidade: opcional,
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), "UF inválida")
      .transform((v) => v || null),
    observacoes: z
      .string()
      .trim()
      .max(1000, "Observação muito longa")
      .transform((v) => v || null),
  })
  .transform((d, c) => {
    let doc: string | null = null;
    if (d.cpfCnpj) {
      if (d.tipoPessoa === "pf") {
        if (!cpfValido(d.cpfCnpj)) c.addIssue({ code: "custom", message: "CPF inválido" });
        doc = soDigitos(d.cpfCnpj);
      } else {
        if (!cnpjValido(d.cpfCnpj)) c.addIssue({ code: "custom", message: "CNPJ inválido" });
        doc = normalizarCnpj(d.cpfCnpj);
      }
    }
    return { ...d, cpfCnpj: doc };
  });

const CAMPOS = [
  "tipoPessoa", "nome", "nomeFantasia", "cpfCnpj", "inscricaoEstadual", "telefone", "email", "contato",
  "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "observacoes",
];

const ler = (form: FormData) => Object.fromEntries(CAMPOS.map((n) => [n, String(form.get(n) ?? "")]));

async function contexto() {
  const ctx = await getContexto();
  return ctx.pode("estoque") ? ctx : null;
}

/** Outro fornecedor da oficina com o mesmo documento */
async function documentoEmUso(oficinaId: string, doc: string | null, exceto?: string) {
  if (!doc) return null;
  const db = await getDb();
  const w = [eq(fornecedores.oficinaId, oficinaId), eq(fornecedores.cpfCnpj, doc)];
  if (exceto) w.push(ne(fornecedores.id, exceto));
  const [f] = await db.select({ nome: fornecedores.nome }).from(fornecedores).where(and(...w));
  return f ? `Já existe um fornecedor com este ${doc.length === 11 ? "CPF" : "CNPJ"}: ${f.nome}` : null;
}

function revalidar(id?: string) {
  revalidatePath("/estoque/fornecedores");
  revalidatePath("/estoque/compras");
  if (id) revalidatePath(`/estoque/fornecedores/${id}`);
}

export async function criarFornecedor(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  const d = fornecedorSchema.safeParse(ler(form));
  if (!d.success) return { erro: d.error.issues[0].message };
  const usado = await documentoEmUso(ctx.oficina.id, d.data.cpfCnpj);
  if (usado) return { erro: usado };
  const db = await getDb();
  const [novo] = await db
    .insert(fornecedores)
    .values({ oficinaId: ctx.oficina.id, ...d.data })
    .returning({ id: fornecedores.id });
  revalidar();
  redirect(`/estoque/fornecedores/${novo.id}`);
}

export async function atualizarFornecedor(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!ehUuid(id)) return { erro: "Fornecedor não encontrado" };
  const d = fornecedorSchema.safeParse(ler(form));
  if (!d.success) return { erro: d.error.issues[0].message };
  const usado = await documentoEmUso(ctx.oficina.id, d.data.cpfCnpj, id);
  if (usado) return { erro: usado };
  const db = await getDb();
  const res = await db
    .update(fornecedores)
    .set(d.data)
    .where(and(eq(fornecedores.id, id), eq(fornecedores.oficinaId, ctx.oficina.id)))
    .returning({ id: fornecedores.id });
  if (res.length === 0) return { erro: "Fornecedor não encontrado" };
  revalidar(id);
  return { ok: true };
}

/** Cadastro rápido (na tela da compra): tipo, nome, documento e telefone */
export async function criarFornecedorRapido(dados: {
  tipoPessoa: string;
  nome: string;
  cpfCnpj: string;
  telefone: string;
}): Promise<{ erro: string } | { id: string; nome: string }> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO as { erro: string };
  const d = fornecedorSchema.safeParse({ ...Object.fromEntries(CAMPOS.map((n) => [n, ""])), ...dados });
  if (!d.success) return { erro: d.error.issues[0].message };
  const usado = await documentoEmUso(ctx.oficina.id, d.data.cpfCnpj);
  if (usado) return { erro: usado };
  const db = await getDb();
  const [novo] = await db
    .insert(fornecedores)
    .values({ oficinaId: ctx.oficina.id, ...d.data })
    .returning({ id: fornecedores.id, nome: fornecedores.nome });
  revalidar();
  return novo;
}

export async function arquivarFornecedor(id: string, arquivar: boolean): Promise<Simples> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!ehUuid(id)) return { erro: "Fornecedor não encontrado" };
  const db = await getDb();
  const res = await db
    .update(fornecedores)
    .set({ ativo: !arquivar })
    .where(and(eq(fornecedores.id, id), eq(fornecedores.oficinaId, ctx.oficina.id)))
    .returning({ id: fornecedores.id });
  if (res.length === 0) return { erro: "Fornecedor não encontrado" };
  revalidar(id);
  return { ok: true };
}

/** Exclui se nunca teve compra; senão, arquiva */
export async function excluirFornecedor(id: string): Promise<Simples> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!ehUuid(id)) return { erro: "Fornecedor não encontrado" };
  const db = await getDb();
  const [uso] = await db
    .select({ n: sql<number>`count(*)` })
    .from(compras)
    .where(and(eq(compras.fornecedorId, id), eq(compras.oficinaId, ctx.oficina.id)));
  if (Number(uso?.n ?? 0) > 0) {
    const r = await arquivarFornecedor(id, true);
    return r.ok ? { ok: true, arquivado: true } : r;
  }
  const res = await db
    .delete(fornecedores)
    .where(and(eq(fornecedores.id, id), eq(fornecedores.oficinaId, ctx.oficina.id)))
    .returning({ id: fornecedores.id });
  if (res.length === 0) return { erro: "Fornecedor não encontrado" };
  revalidar();
  redirect("/estoque/fornecedores");
}
