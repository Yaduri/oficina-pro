"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { usoDoCliente, usoDoVeiculo } from "@/lib/cadastros";
import { nomeDoUsuario } from "@/lib/os-acesso";
import { COMBUSTIVEIS } from "@/lib/veiculo";
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
  nascimento: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && v >= "1900-01-01" && v <= hoje()), "Data de nascimento inválida")
    .transform((v) => v || null),
  aceitaWhatsapp: z.string().transform((v) => v === "on"),
  observacoes: z
    .string()
    .trim()
    .max(1000, "Observação muito longa")
    .transform((v) => v || null),
});
const CAMPOS_CLIENTE = [
  "tipoPessoa", "nome", "documento", "telefone", "email",
  "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf",
  "nascimento", "aceitaWhatsapp", "observacoes",
];

function hoje() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}


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
    .refine((v) => v.length <= 7, "Km inválido")
    .transform((v) => (v ? Number(v) : null)),
  chassi: z
    .string()
    .transform((v) => v.replace(/[\s.-]/g, "").toUpperCase())
    .refine((v) => v === "" || /^[A-HJ-NPR-Z0-9]{17}$/.test(v), "Chassi deve ter 17 caracteres (sem I, O e Q)")
    .transform((v) => v || null),
  motor: opcional,
  combustivel: z
    .string()
    .refine((v) => v === "" || COMBUSTIVEIS.some((c) => c.valor === v), "Combustível inválido")
    .transform((v) => v || null),
});
const CAMPOS_VEICULO = ["placa", "marca", "modelo", "ano", "cor", "km", "chassi", "motor", "combustivel"];

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
  const { oficina, pode } = await getContexto();
  if (!pode("cadastros")) return { erro: "Seu usuário não tem permissão para isso" };
  const c = clienteSchema.safeParse(campos(form, CAMPOS_CLIENTE));
  if (!c.success) return { erro: c.error.issues[0].message };

  const temVeiculo = String(form.get("v_placa") ?? "").trim() !== "";
  let v: z.infer<typeof veiculoSchema> | null = null;
  if (temVeiculo) {
    const parsed = veiculoSchema.safeParse(campos(form, CAMPOS_VEICULO, "v_"));
    if (!parsed.success) return { erro: parsed.error.issues[0].message };
    v = parsed.data;
    if (await placaEmUso(oficina.id, v.placa)) return { erro: `A placa ${v.placa} já está cadastrada` };
  }

  const db = await getDb();
  const id = await db.transaction(async (tx) => {
    const [novo] = await tx
      .insert(schema.clientes)
      .values({ oficinaId: oficina.id, ...c.data, aceitaWhatsappEm: c.data.aceitaWhatsapp ? new Date() : null })
      .returning({ id: schema.clientes.id });
    if (v) await tx.insert(schema.veiculos).values({ oficinaId: oficina.id, clienteId: novo.id, ...v });
    return novo.id;
  });

  revalidatePath("/clientes");
  redirect(`/clientes/${id}`);
}

export async function atualizarCliente(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { oficina, pode } = await getContexto();
  if (!pode("cadastros")) return { erro: "Seu usuário não tem permissão para isso" };
  const c = clienteSchema.safeParse(campos(form, CAMPOS_CLIENTE));
  if (!c.success) return { erro: c.error.issues[0].message };

  const db = await getDb();
  const res = await db
    .update(schema.clientes)
    .set({
      ...c.data,
      // Guarda quando o cliente consentiu; some se ele retirar o consentimento
      aceitaWhatsappEm: c.data.aceitaWhatsapp ? sql`coalesce(${schema.clientes.aceitaWhatsappEm}, now())` : null,
    })
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
  const { oficina, pode } = await getContexto();
  if (!pode("cadastros")) return { erro: "Seu usuário não tem permissão para isso" };
  const v = veiculoSchema.safeParse(campos(form, CAMPOS_VEICULO));
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

/* ---------- Arquivar, excluir, transferir ---------- */

export type Simples = { erro?: string; ok?: boolean; arquivado?: boolean };

async function ctxCadastros() {
  const ctx = await getContexto();
  return ctx.pode("cadastros") ? ctx : null;
}

function revalidarCadastros(...extras: (string | null | undefined)[]) {
  revalidatePath("/clientes");
  for (const p of extras) if (p) revalidatePath(p);
  revalidatePath("/ordens-servico/nova");
  revalidatePath("/check-in/novo");
}

/** Arquiva (some das listas, mas o histórico fica) ou reativa o cliente */
export async function arquivarCliente(id: string, arquivar: boolean): Promise<Simples> {
  const ctx = await ctxCadastros();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  if (!z.uuid().safeParse(id).success) return { erro: "Cliente não encontrado" };
  const db = await getDb();
  const res = await db
    .update(schema.clientes)
    .set({ arquivadoEm: arquivar ? new Date() : null })
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.oficinaId, ctx.oficina.id)))
    .returning({ id: schema.clientes.id });
  if (res.length === 0) return { erro: "Cliente não encontrado" };
  revalidarCadastros(`/clientes/${id}`);
  return { ok: true };
}

/** Exclui o cliente e os veículos dele — só se nunca tiveram OS nem check-in; senão, arquiva */
export async function excluirCliente(id: string): Promise<Simples> {
  const ctx = await ctxCadastros();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  if (!z.uuid().safeParse(id).success) return { erro: "Cliente não encontrado" };
  if ((await usoDoCliente(ctx.oficina.id, id)) > 0) {
    const r = await arquivarCliente(id, true);
    return r.ok ? { ok: true, arquivado: true } : r;
  }
  const db = await getDb();
  const apagou = await db.transaction(async (tx) => {
    await tx.delete(schema.veiculos).where(and(eq(schema.veiculos.clienteId, id), eq(schema.veiculos.oficinaId, ctx.oficina.id)));
    return tx
      .delete(schema.clientes)
      .where(and(eq(schema.clientes.id, id), eq(schema.clientes.oficinaId, ctx.oficina.id)))
      .returning({ id: schema.clientes.id });
  });
  if (apagou.length === 0) return { erro: "Cliente não encontrado" };
  revalidarCadastros();
  redirect("/clientes");
}

async function veiculoDaOficina(oficinaId: string, veiculoId: string) {
  if (!z.uuid().safeParse(veiculoId).success) return null;
  const db = await getDb();
  const [v] = await db
    .select()
    .from(schema.veiculos)
    .where(and(eq(schema.veiculos.id, veiculoId), eq(schema.veiculos.oficinaId, oficinaId)));
  return v ?? null;
}

export async function arquivarVeiculo(veiculoId: string, arquivar: boolean): Promise<Simples> {
  const ctx = await ctxCadastros();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const v = await veiculoDaOficina(ctx.oficina.id, veiculoId);
  if (!v) return { erro: "Veículo não encontrado" };
  const db = await getDb();
  await db.update(schema.veiculos).set({ arquivadoEm: arquivar ? new Date() : null }).where(eq(schema.veiculos.id, v.id));
  revalidarCadastros(v.clienteId && `/clientes/${v.clienteId}`, `/veiculos/${v.id}`);
  return { ok: true };
}

/** Exclui o veículo se nunca teve OS nem check-in; senão, arquiva */
export async function excluirVeiculo(veiculoId: string): Promise<Simples> {
  const ctx = await ctxCadastros();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const v = await veiculoDaOficina(ctx.oficina.id, veiculoId);
  if (!v) return { erro: "Veículo não encontrado" };
  if ((await usoDoVeiculo(ctx.oficina.id, v.id)) > 0) {
    const r = await arquivarVeiculo(v.id, true);
    return r.ok ? { ok: true, arquivado: true } : r;
  }
  const db = await getDb();
  await db.delete(schema.veiculos).where(eq(schema.veiculos.id, v.id));
  revalidarCadastros(v.clienteId && `/clientes/${v.clienteId}`);
  return { ok: true };
}

/**
 * Passa o veículo para outro cliente. As OS antigas continuam no nome do dono da época
 * (o histórico do veículo mostra todas) e a troca fica registrada.
 */
export async function transferirVeiculo(veiculoId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await ctxCadastros();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const v = await veiculoDaOficina(ctx.oficina.id, veiculoId);
  if (!v) return { erro: "Veículo não encontrado" };
  const db = await getDb();

  const clienteId = String(form.get("clienteId") ?? "");
  const novoNome = String(form.get("novoNome") ?? "").trim();
  const novoTel = soDigitos(String(form.get("novoTelefone") ?? ""));
  if (!clienteId) {
    if (novoNome.length < 2) return { erro: "Escolha o novo dono ou informe o nome dele" };
    if (novoTel && novoTel.length !== 10 && novoTel.length !== 11) return { erro: "Telefone deve ter DDD + número" };
  } else if (!z.uuid().safeParse(clienteId).success) {
    return { erro: "Cliente inválido" };
  }
  if (clienteId && clienteId === v.clienteId) return { erro: "Esse cliente já é o dono do veículo" };

  const [de] = v.clienteId
    ? await db.select({ nome: schema.clientes.nome }).from(schema.clientes).where(eq(schema.clientes.id, v.clienteId))
    : [];

  const res = await db.transaction(async (tx) => {
    let paraId = clienteId;
    let paraNome = novoNome;
    if (paraId) {
      const [c] = await tx
        .select({ id: schema.clientes.id, nome: schema.clientes.nome })
        .from(schema.clientes)
        .where(and(eq(schema.clientes.id, paraId), eq(schema.clientes.oficinaId, ctx.oficina.id)));
      if (!c) return { erro: "Cliente não encontrado" } as const;
      paraNome = c.nome;
      await tx.update(schema.clientes).set({ arquivadoEm: null }).where(eq(schema.clientes.id, c.id));
    } else {
      const [c] = await tx
        .insert(schema.clientes)
        .values({ oficinaId: ctx.oficina.id, nome: novoNome, telefone: novoTel || null })
        .returning({ id: schema.clientes.id });
      paraId = c.id;
    }
    await tx.update(schema.veiculos).set({ clienteId: paraId, arquivadoEm: null }).where(eq(schema.veiculos.id, v.id));
    await tx.insert(schema.veiculoTransferencias).values({
      oficinaId: ctx.oficina.id,
      veiculoId: v.id,
      deClienteId: v.clienteId,
      paraClienteId: paraId,
      deNome: de?.nome ?? null,
      paraNome,
      por: nomeDoUsuario(ctx),
    });
    return { paraId } as const;
  });
  if ("erro" in res) return { erro: res.erro };

  revalidarCadastros(v.clienteId && `/clientes/${v.clienteId}`, `/clientes/${res.paraId}`, `/veiculos/${v.id}`);
  redirect(`/veiculos/${v.id}`);
}
