"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { PLACA_RE, formatPlaca, soDigitos } from "@/lib/utils";

export type FormState = { erro?: string; ok?: boolean } | undefined;

const opcional = z
  .string()
  .trim()
  .transform((v) => v || null);

const clienteSchema = z.object({
  tipoPessoa: z.enum(["pf", "pj"]),
  nome: z.string().trim().min(2, "Informe o nome do cliente"),
  documento: z
    .string()
    .transform(soDigitos)
    .refine((v) => v === "" || v.length === 11 || v.length === 14, "CPF deve ter 11 dígitos e CNPJ 14")
    .transform((v) => v || null),
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
});

const anoAtual = new Date().getFullYear();
const veiculoSchema = z.object({
  placa: z
    .string()
    .transform(formatPlaca)
    .refine((v) => PLACA_RE.test(v), "Placa inválida (ex.: ABC1D23 ou ABC1234)"),
  marca: opcional,
  modelo: z.string().trim().min(1, "Informe o modelo do veículo"),
  ano: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && +v >= 1950 && +v <= anoAtual + 1), "Ano inválido")
    .transform((v) => (v ? Number(v) : null)),
  cor: opcional,
  km: z
    .string()
    .transform(soDigitos)
    .transform((v) => (v ? Number(v) : null)),
});

function campos(form: FormData, nomes: string[], prefixo = "") {
  return Object.fromEntries(nomes.map((n) => [n, String(form.get(prefixo + n) ?? "")]));
}

async function placaEmUso(oficinaId: string, placa: string, exceto?: string) {
  const db = await getDb();
  const filtros = [eq(schema.veiculos.oficinaId, oficinaId), eq(schema.veiculos.placa, placa)];
  if (exceto) filtros.push(ne(schema.veiculos.id, exceto));
  const [v] = await db.select({ id: schema.veiculos.id }).from(schema.veiculos).where(and(...filtros));
  return Boolean(v);
}

/** Cria um cliente (e opcionalmente o primeiro veículo) */
export async function criarCliente(_prev: FormState, form: FormData): Promise<FormState> {
  const { oficina } = await getContexto();
  const c = clienteSchema.safeParse(campos(form, ["tipoPessoa", "nome", "documento", "telefone", "email"]));
  if (!c.success) return { erro: c.error.issues[0].message };

  const temVeiculo = String(form.get("v_placa") ?? "").trim() !== "";
  let v: z.infer<typeof veiculoSchema> | null = null;
  if (temVeiculo) {
    const parsed = veiculoSchema.safeParse(campos(form, ["placa", "marca", "modelo", "ano", "cor", "km"], "v_"));
    if (!parsed.success) return { erro: parsed.error.issues[0].message };
    v = parsed.data;
    if (await placaEmUso(oficina.id, v.placa)) return { erro: `A placa ${v.placa} já está cadastrada` };
  }

  const db = await getDb();
  const id = await db.transaction(async (tx) => {
    const [novo] = await tx
      .insert(schema.clientes)
      .values({ oficinaId: oficina.id, ...c.data })
      .returning({ id: schema.clientes.id });
    if (v) await tx.insert(schema.veiculos).values({ oficinaId: oficina.id, clienteId: novo.id, ...v });
    return novo.id;
  });

  revalidatePath("/clientes");
  redirect(`/clientes/${id}`);
}

export async function atualizarCliente(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { oficina } = await getContexto();
  const c = clienteSchema.safeParse(campos(form, ["tipoPessoa", "nome", "documento", "telefone", "email"]));
  if (!c.success) return { erro: c.error.issues[0].message };

  const db = await getDb();
  const res = await db
    .update(schema.clientes)
    .set(c.data)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.oficinaId, oficina.id)))
    .returning({ id: schema.clientes.id });
  if (res.length === 0) return { erro: "Cliente não encontrado" };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  return { ok: true };
}

/** Cria (sem veiculoId) ou atualiza um veículo do cliente */
export async function salvarVeiculo(
  clienteId: string,
  veiculoId: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { oficina } = await getContexto();
  const v = veiculoSchema.safeParse(campos(form, ["placa", "marca", "modelo", "ano", "cor", "km"]));
  if (!v.success) return { erro: v.error.issues[0].message };
  if (await placaEmUso(oficina.id, v.data.placa, veiculoId ?? undefined)) {
    return { erro: `A placa ${v.data.placa} já está cadastrada` };
  }

  const db = await getDb();
  const [cliente] = await db
    .select({ id: schema.clientes.id })
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, clienteId), eq(schema.clientes.oficinaId, oficina.id)));
  if (!cliente) return { erro: "Cliente não encontrado" };

  if (veiculoId) {
    const res = await db
      .update(schema.veiculos)
      .set(v.data)
      .where(and(eq(schema.veiculos.id, veiculoId), eq(schema.veiculos.oficinaId, oficina.id)))
      .returning({ id: schema.veiculos.id });
    if (res.length === 0) return { erro: "Veículo não encontrado" };
  } else {
    await db.insert(schema.veiculos).values({ oficinaId: oficina.id, clienteId, ...v.data });
  }

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/clientes");
  revalidatePath("/ordens-servico");
  return { ok: true };
}
