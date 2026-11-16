import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { buscarVeiculoPorPlaca } from "@/lib/cadastros";
import { PLACA_RE, formatPlaca, soDigitos } from "@/lib/utils";

/*
 * Veículo informado num formulário (Nova OS, check-in): um veículo já cadastrado (veiculoId)
 * ou um veículo novo, com cliente existente (clienteId) ou novo (clienteNome/clienteTelefone).
 */

const novoVeiculoSchema = z.object({
  placa: z
    .string()
    .transform(formatPlaca)
    .refine((v) => PLACA_RE.test(v), "Placa inválida (ex.: ABC1D23 ou ABC1234)"),
  marca: z
    .string()
    .trim()
    .transform((v) => v || null),
  modelo: z.string().trim().min(1, "Informe o modelo do veículo"),
  clienteId: z.string(),
  clienteNome: z.string().trim(),
  clienteTelefone: z
    .string()
    .transform(soDigitos)
    .refine((v) => v === "" || v.length === 10 || v.length === 11, "Telefone deve ter DDD + número"),
});

export type VeiculoPreparado =
  | { tipo: "existente"; veiculoId: string; clienteId: string | null }
  | { tipo: "novo"; dados: z.infer<typeof novoVeiculoSchema>; clienteId: string | null };

const f = (form: FormData, k: string) => String(form.get(k) ?? "");

/** Valida (fora da transação) o veículo enviado no formulário */
export async function prepararVeiculo(
  oficinaId: string,
  form: FormData,
): Promise<{ erro: string } | { ok: VeiculoPreparado }> {
  const db = await getDb();
  const { veiculos, clientes } = schema;
  const veiculoId = f(form, "veiculoId");

  if (veiculoId) {
    if (!z.uuid().safeParse(veiculoId).success) return { erro: "Veículo inválido" };
    const [v] = await db
      .select({ id: veiculos.id, clienteId: veiculos.clienteId })
      .from(veiculos)
      .where(and(eq(veiculos.id, veiculoId), eq(veiculos.oficinaId, oficinaId)));
    if (!v) return { erro: "Veículo não encontrado" };
    return { ok: { tipo: "existente", veiculoId: v.id, clienteId: v.clienteId } };
  }

  const nv = novoVeiculoSchema.safeParse({
    placa: f(form, "placa"),
    marca: f(form, "marca"),
    modelo: f(form, "modelo"),
    clienteId: f(form, "clienteId"),
    clienteNome: f(form, "clienteNome"),
    clienteTelefone: f(form, "clienteTelefone"),
  });
  if (!nv.success) return { erro: nv.error.issues[0].message };
  if (await buscarVeiculoPorPlaca(oficinaId, nv.data.placa)) {
    return { erro: `A placa ${nv.data.placa} já está cadastrada. Busque novamente.` };
  }
  if (nv.data.clienteId) {
    if (!z.uuid().safeParse(nv.data.clienteId).success) return { erro: "Cliente inválido" };
    const [c] = await db
      .select({ id: clientes.id })
      .from(clientes)
      .where(and(eq(clientes.id, nv.data.clienteId), eq(clientes.oficinaId, oficinaId)));
    if (!c) return { erro: "Cliente não encontrado" };
    return { ok: { tipo: "novo", dados: nv.data, clienteId: c.id } };
  }
  if (nv.data.clienteNome.length < 2) return { erro: "Informe o nome do cliente" };
  return { ok: { tipo: "novo", dados: nv.data, clienteId: null } };
}

/** Grava (dentro da transação) o veículo/cliente novos ou atualiza o km do existente */
export async function gravarVeiculo(tx: DB, oficinaId: string, p: VeiculoPreparado, km: number | null) {
  const { veiculos, clientes } = schema;
  if (p.tipo === "existente") {
    if (km != null) {
      await tx
        .update(veiculos)
        .set({ km })
        .where(and(eq(veiculos.id, p.veiculoId), sql`coalesce(${veiculos.km}, 0) < ${km}`));
    }
    return { veiculoId: p.veiculoId, clienteId: p.clienteId };
  }
  let clienteId = p.clienteId;
  if (!clienteId) {
    const [c] = await tx
      .insert(clientes)
      .values({ oficinaId, nome: p.dados.clienteNome, telefone: p.dados.clienteTelefone || null })
      .returning({ id: clientes.id });
    clienteId = c.id;
  }
  const [v] = await tx
    .insert(veiculos)
    .values({ oficinaId, clienteId, placa: p.dados.placa, marca: p.dados.marca, modelo: p.dados.modelo, km })
    .returning({ id: veiculos.id });
  return { veiculoId: v.id, clienteId };
}

/** Próximo número de OS da oficina */
export async function proximoNumeroOS(tx: DB, oficinaId: string) {
  const { ordensServico } = schema;
  const [{ proximo }] = await tx
    .select({ proximo: sql<number>`coalesce(max(${ordensServico.numero}), 0)::int + 1` })
    .from(ordensServico)
    .where(eq(ordensServico.oficinaId, oficinaId));
  return proximo;
}
