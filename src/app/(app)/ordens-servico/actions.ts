"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { atualizarStatusOS } from "@/lib/queries";
import { buscarVeiculoPorPlaca } from "@/lib/cadastros";
import { PLACA_RE, formatPlaca, parseValor, soDigitos } from "@/lib/utils";

const statusEnum = z.enum(["diagnostico", "aguardando_aprovacao", "aguardando_peca", "em_execucao", "pronto", "entregue", "cancelada"]);

function revalidarOS(osId?: string) {
  revalidatePath("/ordens-servico");
  revalidatePath("/inicio");
  if (osId) revalidatePath(`/ordens-servico/${osId}`);
}

export async function moverOS(osId: string, status: string) {
  const parsed = z.object({ osId: z.uuid(), status: statusEnum }).safeParse({ osId, status });
  if (!parsed.success) return { ok: false, erro: "Dados inválidos" };

  const { oficina, empresas } = await getContexto();
  const ok = await atualizarStatusOS(oficina.id, empresas.map((e) => e.id), parsed.data.osId, parsed.data.status);
  if (!ok) return { ok: false, erro: "OS não encontrada" };

  revalidarOS(parsed.data.osId);
  return { ok: true };
}

/* ---------- Busca de placa (Nova OS) ---------- */

export type ResultadoPlaca =
  | { status: "invalida" }
  | { status: "nova"; placa: string }
  | {
      status: "encontrada";
      placa: string;
      veiculo: { id: string; marca: string | null; modelo: string; ano: number | null; km: number | null };
      cliente: { id: string; nome: string; telefone: string | null } | null;
    };

export async function buscarPlaca(placaDigitada: string): Promise<ResultadoPlaca> {
  const placa = formatPlaca(placaDigitada);
  if (!PLACA_RE.test(placa)) return { status: "invalida" };
  const { oficina } = await getContexto();
  const r = await buscarVeiculoPorPlaca(oficina.id, placa);
  if (!r) return { status: "nova", placa };
  const { veiculo: v, cliente: c } = r;
  return {
    status: "encontrada",
    placa,
    veiculo: { id: v.id, marca: v.marca, modelo: v.modelo, ano: v.ano, km: v.km },
    cliente: c ? { id: c.id, nome: c.nome, telefone: c.telefone } : null,
  };
}

/* ---------- Itens ---------- */

const itemSchema = z.object({
  tipo: z.enum(["peca", "servico"]),
  descricao: z.string().trim().min(1, "Descreva cada item"),
  quantidade: z
    .union([z.string(), z.number()])
    .transform(parseValor)
    .refine((n) => Number.isFinite(n) && n > 0 && n < 100000, "Quantidade inválida"),
  valor: z
    .union([z.string(), z.number()])
    .transform(parseValor)
    .refine((n) => Number.isFinite(n) && n >= 0 && n < 10_000_000, "Valor inválido"),
});

/* ---------- Criar OS ---------- */

export type NovaOSState = { erro?: string } | undefined;

const novaOSSchema = z.object({
  empresaId: z.uuid("Escolha a empresa"),
  veiculoId: z.string(),
  descricao: z.string().trim().min(3, "Descreva o problema relatado pelo cliente"),
  kmEntrada: z
    .string()
    .transform(soDigitos)
    .transform((v) => (v ? Number(v) : null)),
  responsavel: z.string().trim(),
  itens: z.array(itemSchema),
});

const novoVeiculoSchema = z.object({
  placa: z
    .string()
    .transform(formatPlaca)
    .refine((v) => PLACA_RE.test(v), "Placa inválida (ex.: ABC1D23 ou ABC1234)"),
  marca: z.string().trim().transform((v) => v || null),
  modelo: z.string().trim().min(1, "Informe o modelo do veículo"),
  clienteId: z.string(),
  clienteNome: z.string().trim(),
  clienteTelefone: z
    .string()
    .transform(soDigitos)
    .refine((v) => v === "" || v.length === 10 || v.length === 11, "Telefone deve ter DDD + número"),
});

const f = (form: FormData, k: string) => String(form.get(k) ?? "");

export async function criarOS(_prev: NovaOSState, form: FormData): Promise<NovaOSState> {
  const { oficina, empresas } = await getContexto();

  let itens: unknown = [];
  try {
    itens = JSON.parse(f(form, "itens") || "[]");
  } catch {
    return { erro: "Itens inválidos" };
  }
  const dados = novaOSSchema.safeParse({
    empresaId: f(form, "empresaId"),
    veiculoId: f(form, "veiculoId"),
    descricao: f(form, "descricao"),
    kmEntrada: f(form, "kmEntrada"),
    responsavel: f(form, "responsavel"),
    itens,
  });
  if (!dados.success) return { erro: dados.error.issues[0].message };
  const d = dados.data;
  if (!empresas.some((e) => e.id === d.empresaId)) return { erro: "Empresa não permitida" };

  const db = await getDb();
  const { veiculos, clientes, tecnicos, ordensServico, osItens } = schema;

  // Veículo existente ou novo (com cliente existente ou novo)
  let veiculoId: string | null = null;
  let clienteId: string | null = null;
  let novoVeiculo: z.infer<typeof novoVeiculoSchema> | null = null;

  if (d.veiculoId) {
    const [v] = await db
      .select({ id: veiculos.id, clienteId: veiculos.clienteId })
      .from(veiculos)
      .where(and(eq(veiculos.id, d.veiculoId), eq(veiculos.oficinaId, oficina.id)));
    if (!v) return { erro: "Veículo não encontrado" };
    veiculoId = v.id;
    clienteId = v.clienteId;
  } else {
    const nv = novoVeiculoSchema.safeParse({
      placa: f(form, "placa"),
      marca: f(form, "marca"),
      modelo: f(form, "modelo"),
      clienteId: f(form, "clienteId"),
      clienteNome: f(form, "clienteNome"),
      clienteTelefone: f(form, "clienteTelefone"),
    });
    if (!nv.success) return { erro: nv.error.issues[0].message };
    novoVeiculo = nv.data;
    if (await buscarVeiculoPorPlaca(oficina.id, novoVeiculo.placa)) {
      return { erro: `A placa ${novoVeiculo.placa} já está cadastrada. Busque novamente.` };
    }
    if (novoVeiculo.clienteId) {
      const [c] = await db
        .select({ id: clientes.id })
        .from(clientes)
        .where(and(eq(clientes.id, novoVeiculo.clienteId), eq(clientes.oficinaId, oficina.id)));
      if (!c) return { erro: "Cliente não encontrado" };
      clienteId = c.id;
    } else if (novoVeiculo.clienteNome.length < 2) {
      return { erro: "Informe o nome do cliente" };
    }
  }

  const osId = await db.transaction(async (tx) => {
    if (novoVeiculo) {
      if (!clienteId) {
        const [c] = await tx
          .insert(clientes)
          .values({ oficinaId: oficina.id, nome: novoVeiculo.clienteNome, telefone: novoVeiculo.clienteTelefone || null })
          .returning({ id: clientes.id });
        clienteId = c.id;
      }
      const [v] = await tx
        .insert(veiculos)
        .values({
          oficinaId: oficina.id,
          clienteId,
          placa: novoVeiculo.placa,
          marca: novoVeiculo.marca,
          modelo: novoVeiculo.modelo,
          km: d.kmEntrada,
        })
        .returning({ id: veiculos.id });
      veiculoId = v.id;
    } else if (d.kmEntrada != null) {
      // Atualiza o km do veículo se o novo for maior
      await tx
        .update(veiculos)
        .set({ km: d.kmEntrada })
        .where(and(eq(veiculos.id, veiculoId!), sql`coalesce(${veiculos.km}, 0) < ${d.kmEntrada}`));
    }

    // Responsável: técnico existente (pelo nome) ou novo
    let responsavelId: string | null = null;
    if (d.responsavel) {
      const [t] = await tx
        .select({ id: tecnicos.id })
        .from(tecnicos)
        .where(and(eq(tecnicos.oficinaId, oficina.id), ilike(tecnicos.nome, d.responsavel)));
      responsavelId =
        t?.id ??
        (
          await tx
            .insert(tecnicos)
            .values({ oficinaId: oficina.id, empresaId: d.empresaId, nome: d.responsavel })
            .returning({ id: tecnicos.id })
        )[0].id;
    }

    const [{ proximo }] = await tx
      .select({ proximo: sql<number>`coalesce(max(${ordensServico.numero}), 0)::int + 1` })
      .from(ordensServico)
      .where(eq(ordensServico.oficinaId, oficina.id));

    const [nova] = await tx
      .insert(ordensServico)
      .values({
        oficinaId: oficina.id,
        empresaId: d.empresaId,
        numero: proximo,
        veiculoId: veiculoId!,
        clienteId,
        responsavelId,
        descricao: d.descricao,
        kmEntrada: d.kmEntrada,
      })
      .returning({ id: ordensServico.id });

    if (d.itens.length > 0) {
      await tx.insert(osItens).values(
        d.itens.map((i) => ({
          osId: nova.id,
          empresaId: d.empresaId,
          tipo: i.tipo,
          descricao: i.descricao,
          quantidade: String(i.quantidade),
          valorUnitario: i.valor.toFixed(2),
        })),
      );
    }
    return nova.id;
  });

  revalidarOS();
  revalidatePath("/clientes");
  redirect(`/ordens-servico/${osId}`);
}

/* ---------- Itens na tela da OS ---------- */

const uuid = (v: string) => z.uuid().safeParse(v).success;

async function osDaOficina(osId: string, itemId?: string) {
  if (!uuid(osId) || (itemId !== undefined && !uuid(itemId))) return null;
  const { oficina, empresas } = await getContexto();
  const db = await getDb();
  const [o] = await db
    .select({ id: schema.ordensServico.id, empresaId: schema.ordensServico.empresaId })
    .from(schema.ordensServico)
    .where(
      and(
        eq(schema.ordensServico.id, osId),
        eq(schema.ordensServico.oficinaId, oficina.id),
        inArray(schema.ordensServico.empresaId, empresas.map((e) => e.id)),
      ),
    );
  return o ? { db, os: o } : null;
}

export type ItemState = { erro?: string; ok?: boolean } | undefined;

export async function adicionarItem(osId: string, _prev: ItemState, form: FormData): Promise<ItemState> {
  const item = itemSchema.safeParse({
    tipo: f(form, "tipo"),
    descricao: f(form, "descricao"),
    quantidade: f(form, "quantidade") || "1",
    valor: f(form, "valor"),
  });
  if (!item.success) return { erro: item.error.issues[0].message };
  const r = await osDaOficina(osId);
  if (!r) return { erro: "OS não encontrada" };
  await r.db.insert(schema.osItens).values({
    osId,
    empresaId: r.os.empresaId,
    tipo: item.data.tipo,
    descricao: item.data.descricao,
    quantidade: String(item.data.quantidade),
    valorUnitario: item.data.valor.toFixed(2),
  });
  revalidarOS(osId);
  return { ok: true };
}

export async function marcarItem(osId: string, itemId: string, concluido: boolean) {
  const r = await osDaOficina(osId, itemId);
  if (!r) return;
  await r.db
    .update(schema.osItens)
    .set({ concluido })
    .where(and(eq(schema.osItens.id, itemId), eq(schema.osItens.osId, osId)));
  revalidarOS(osId);
}

export async function removerItem(osId: string, itemId: string) {
  const r = await osDaOficina(osId, itemId);
  if (!r) return;
  await r.db.delete(schema.osItens).where(and(eq(schema.osItens.id, itemId), eq(schema.osItens.osId, osId)));
  revalidarOS(osId);
}
