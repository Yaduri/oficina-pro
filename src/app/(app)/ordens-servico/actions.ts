"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import type { Acao } from "@/lib/permissoes";
import { nomeDoUsuario, registrarEvento } from "@/lib/os-acesso";
import { registrarAuditoria } from "@/lib/auditoria";
import { sincronizarEstoqueDaOS } from "@/lib/estoque-os";
import { STATUS } from "@/lib/os";
import { atualizarStatusOS } from "@/lib/queries";
import { buscarVeiculoPorPlaca } from "@/lib/cadastros";
import { gravarVeiculo, prepararVeiculo, proximoNumeroOS } from "@/lib/veiculo-form";
import { novoToken } from "@/lib/orcamento";
import { PLACA_RE, formatBRL, formatPlaca, parseValor, soDigitos } from "@/lib/utils";
import { calcularTotais } from "@/lib/os-total";

const statusEnum = z.enum(["diagnostico", "aguardando_aprovacao", "aguardando_peca", "em_execucao", "pronto", "entregue", "cancelada"]);

function revalidarOS(osId?: string) {
  revalidatePath("/ordens-servico");
  revalidatePath("/inicio");
  if (osId) revalidatePath(`/ordens-servico/${osId}`);
}

export async function moverOS(osId: string, status: string) {
  const parsed = z.object({ osId: z.uuid(), status: statusEnum }).safeParse({ osId, status });
  if (!parsed.success) return { ok: false, erro: "Dados inválidos" };

  const ctx = await getContexto();
  const { oficina, pode } = ctx;
  // A entrega tem formulário próprio (km de saída, garantia, assinatura)
  if (parsed.data.status === "entregue") return { ok: false, erro: "Use “Entregar veículo” na tela da OS" };
  if (!pode("fecharOS")) {
    // Técnico movimenta a OS no quadro, mas não entrega, cancela nem reabre
    if (parsed.data.status === "cancelada") return { ok: false, erro: "Seu usuário não pode cancelar OS" };
    const db = await getDb();
    const [atual] = await db
      .select({ status: schema.ordensServico.status })
      .from(schema.ordensServico)
      .where(and(eq(schema.ordensServico.id, parsed.data.osId), eq(schema.ordensServico.oficinaId, oficina.id)));
    if (atual && (atual.status === "entregue" || atual.status === "cancelada")) return { ok: false, erro: "Seu usuário não pode reabrir OS" };
  }
  const db = await getDb();
  const [antes] = await db
    .select({ status: schema.ordensServico.status })
    .from(schema.ordensServico)
    .where(and(eq(schema.ordensServico.id, parsed.data.osId), eq(schema.ordensServico.oficinaId, oficina.id)));
  const ok = await atualizarStatusOS(oficina.id, parsed.data.osId, parsed.data.status);
  if (!ok) return { ok: false, erro: "OS não encontrada" };
  await sincronizarEstoqueDaOS(oficina.id, parsed.data.osId, nomeDoUsuario(ctx));
  if (antes && antes.status !== parsed.data.status) {
    await registrarEvento(db, oficina.id, parsed.data.osId, `Status: ${STATUS[antes.status].label} → ${STATUS[parsed.data.status].label}`, ctx);
    if (parsed.data.status === "cancelada" || antes.status === "entregue" || antes.status === "cancelada") {
      await registrarAuditoria({
        oficinaId: oficina.id,
        usuarioId: ctx.userId,
        usuarioNome: nomeDoUsuario(ctx),
        tabela: "ordens_servico",
        registroId: parsed.data.osId,
        acao: parsed.data.status === "cancelada" ? "cancelar" : "reabrir",
        resumo: `${parsed.data.status === "cancelada" ? "Cancelou" : "Reabriu"} a OS (${STATUS[antes.status].label} → ${STATUS[parsed.data.status].label})`,
        antes: { status: antes.status },
        depois: { status: parsed.data.status },
        db,
      });
    }
  }

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
  catalogoItemId: z.uuid().optional().catch(undefined),
});

/* ---------- Criar OS ---------- */

export type NovaOSState = { erro?: string } | undefined;

const novaOSSchema = z.object({
  veiculoId: z.string(),
  descricao: z.string().trim().min(3, "Descreva o problema relatado pelo cliente"),
  kmEntrada: z
    .string()
    .transform(soDigitos)
    .transform((v) => (v ? Number(v) : null)),
  responsavel: z.string().trim(),
  itens: z.array(itemSchema),
});

const f = (form: FormData, k: string) => String(form.get(k) ?? "");

export async function criarOS(_prev: NovaOSState, form: FormData): Promise<NovaOSState> {
  const { oficina, pode } = await getContexto();
  if (!pode("abrirOS")) return { erro: "Seu usuário não tem permissão para isso" };

  let itens: unknown = [];
  try {
    itens = JSON.parse(f(form, "itens") || "[]");
  } catch {
    return { erro: "Itens inválidos" };
  }
  const dados = novaOSSchema.safeParse({
    veiculoId: f(form, "veiculoId"),
    descricao: f(form, "descricao"),
    kmEntrada: f(form, "kmEntrada"),
    responsavel: f(form, "responsavel"),
    itens,
  });
  if (!dados.success) return { erro: dados.error.issues[0].message };
  const d = dados.data;

  const prep = await prepararVeiculo(oficina.id, form);
  if ("erro" in prep) return prep;

  const db = await getDb();
  const { tecnicos, ordensServico, osItens } = schema;

  const osId = await db.transaction(async (tx) => {
    const { veiculoId, clienteId } = await gravarVeiculo(tx as unknown as DB, oficina.id, prep.ok, d.kmEntrada);

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
            .values({ oficinaId: oficina.id, nome: d.responsavel })
            .returning({ id: tecnicos.id })
        )[0].id;
    }

    const proximo = await proximoNumeroOS(tx as unknown as DB, oficina.id);

    const [nova] = await tx
      .insert(ordensServico)
      .values({
        oficinaId: oficina.id,
        numero: proximo,
        veiculoId,
        clienteId,
        responsavelId,
        descricao: d.descricao,
        kmEntrada: d.kmEntrada,
      })
      .returning({ id: ordensServico.id });

    if (d.itens.length > 0) {
      // Itens do catálogo: só guarda a ligação se forem desta oficina
      const ids = [...new Set(d.itens.map((i) => i.catalogoItemId).filter((x): x is string => !!x))];
      const doCatalogo = ids.length
        ? await tx
            .select({ id: schema.catalogoItens.id })
            .from(schema.catalogoItens)
            .where(and(eq(schema.catalogoItens.oficinaId, oficina.id), inArray(schema.catalogoItens.id, ids)))
        : [];
      const cat = new Map(doCatalogo.map((c) => [c.id, c]));
      await tx.insert(osItens).values(
        d.itens.map((i) => {
          const c = i.catalogoItemId ? cat.get(i.catalogoItemId) : undefined;
          return {
            osId: nova.id,
            catalogoItemId: c?.id ?? null,
            tipo: i.tipo,
            descricao: i.descricao,
            quantidade: String(i.quantidade),
            valorUnitario: i.valor.toFixed(2),
          };
        }),
      );
    }
    return nova.id;
  });
  await registrarEvento(db, oficina.id, osId, "Abriu a OS", await getContexto());
  await sincronizarEstoqueDaOS(oficina.id, osId, nomeDoUsuario(await getContexto()));

  revalidarOS();
  revalidatePath("/clientes");
  redirect(`/ordens-servico/${osId}`);
}

/* ---------- Itens na tela da OS ---------- */

const uuid = (v: string) => z.uuid().safeParse(v).success;

async function osDaOficina(osId: string, itemId?: string, acao?: Acao) {
  if (!uuid(osId) || (itemId !== undefined && !uuid(itemId))) return null;
  const { oficina, pode } = await getContexto();
  if (acao && !pode(acao)) return null;
  const db = await getDb();
  const [o] = await db
    .select({ id: schema.ordensServico.id })
    .from(schema.ordensServico)
    .where(and(eq(schema.ordensServico.id, osId), eq(schema.ordensServico.oficinaId, oficina.id)));
  return o ? { db, os: o, oficinaId: oficina.id } : null;
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
  const r = await osDaOficina(osId, undefined, "editarItens");
  if (!r) return { erro: "OS não encontrada ou sem permissão" };
  // Item escolhido do catálogo: só guarda a ligação se for desta oficina
  let catalogoItemId: string | null = null;
  const cat = f(form, "catalogoItemId");
  if (cat && z.uuid().safeParse(cat).success) {
    const [c] = await r.db
      .select({ id: schema.catalogoItens.id })
      .from(schema.catalogoItens)
      .where(and(eq(schema.catalogoItens.id, cat), eq(schema.catalogoItens.oficinaId, r.oficinaId)));
    catalogoItemId = c?.id ?? null;
  }
  await r.db.insert(schema.osItens).values({
    osId,
    catalogoItemId,
    tipo: item.data.tipo,
    descricao: item.data.descricao,
    quantidade: String(item.data.quantidade),
    valorUnitario: item.data.valor.toFixed(2),
  });
  await sincronizarEstoqueDaOS(r.oficinaId, osId, nomeDoUsuario(await getContexto()));
  await registrarEvento(
    r.db,
    r.oficinaId,
    osId,
    `Adicionou ${item.data.tipo === "peca" ? "a peça" : "o serviço"} “${item.data.descricao}” (${formatBRL(item.data.quantidade * item.data.valor)})`,
    await getContexto(),
  );
  revalidarOS(osId);
  return { ok: true };
}

export async function marcarItem(osId: string, itemId: string, concluido: boolean) {
  const r = await osDaOficina(osId, itemId);
  if (!r) return;
  const [item] = await r.db
    .update(schema.osItens)
    .set({ concluido })
    .where(and(eq(schema.osItens.id, itemId), eq(schema.osItens.osId, osId)))
    .returning({ descricao: schema.osItens.descricao });
  if (item) {
    await registrarEvento(r.db, r.oficinaId, osId, `${concluido ? "Concluiu" : "Desmarcou"} “${item.descricao}”`, await getContexto());
  }
  revalidarOS(osId);
}

export async function removerItem(osId: string, itemId: string) {
  const r = await osDaOficina(osId, itemId, "editarItens");
  if (!r) return;
  const [item] = await r.db
    .delete(schema.osItens)
    .where(and(eq(schema.osItens.id, itemId), eq(schema.osItens.osId, osId)))
    .returning({
      descricao: schema.osItens.descricao,
      quantidade: schema.osItens.quantidade,
      valorUnitario: schema.osItens.valorUnitario,
      tipo: schema.osItens.tipo,
    });
  if (item) {
    const ctx = await getContexto();
    await sincronizarEstoqueDaOS(r.oficinaId, osId, nomeDoUsuario(ctx));
    await registrarEvento(r.db, r.oficinaId, osId, `Removeu o item “${item.descricao}”`, ctx);
    await registrarAuditoria({
      oficinaId: r.oficinaId,
      usuarioId: ctx.userId,
      usuarioNome: nomeDoUsuario(ctx),
      tabela: "os_itens",
      registroId: itemId,
      acao: "excluir",
      resumo: `Removeu ${item.tipo === "peca" ? "peça" : "serviço"} “${item.descricao}” (${formatBRL(Number(item.quantidade) * Number(item.valorUnitario))}) da OS`,
      antes: { osId, ...item },
      db: r.db,
    });
  }
  revalidarOS(osId);
}

/** Saldo das peças com controle de estoque (mostrado ao lançar peça na OS) */
export async function saldosDoCatalogo(): Promise<Record<string, { saldo: number; unidade: string }>> {
  const { oficina, pode } = await getContexto();
  if (!pode("editarItens")) return {};
  const db = await getDb();
  const c = schema.catalogoItens;
  const rows = await db
    .select({ id: c.id, saldo: c.estoqueAtual, unidade: c.unidade })
    .from(c)
    .where(and(eq(c.oficinaId, oficina.id), eq(c.tipo, "peca"), eq(c.controlaEstoque, true), eq(c.ativo, true)));
  return Object.fromEntries(rows.map((r) => [r.id, { saldo: Number(r.saldo), unidade: r.unidade }]));
}

/* ---------- Orçamento com link para o cliente ---------- */

export type OrcamentoState = { erro?: string; ok?: boolean } | undefined;

/** Gera um novo link de orçamento com os itens atuais da OS (o anterior pendente é substituído). */
export async function enviarOrcamento(osId: string, _prev: OrcamentoState, form: FormData): Promise<OrcamentoState> {
  const dados = z
    .object({
      observacao: z.string().trim().max(1000, "Observação muito longa"),
      dias: z.coerce.number().int().min(1).max(90),
    })
    .safeParse({ observacao: f(form, "observacao"), dias: f(form, "dias") || "15" });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const r = await osDaOficina(osId, undefined, "orcamento");
  if (!r) return { erro: "OS não encontrada ou sem permissão" };
  const { userId, oficina } = await getContexto();

  const [atual] = await r.db
    .select({
      status: schema.ordensServico.status,
      descontoPercentual: schema.ordensServico.descontoPercentual,
      descontoValor: schema.ordensServico.descontoValor,
    })
    .from(schema.ordensServico)
    .where(eq(schema.ordensServico.id, osId));
  if (atual.status === "entregue" || atual.status === "cancelada") return { erro: "A OS está fechada" };

  const itens = await r.db.select().from(schema.osItens).where(eq(schema.osItens.osId, osId)).orderBy(schema.osItens.criadoEm);
  if (itens.length === 0) return { erro: "Adicione peças ou serviços antes de enviar o orçamento" };

  const copia = itens.map((i) => ({
    id: i.id,
    tipo: i.tipo,
    descricao: i.descricao,
    quantidade: Number(i.quantidade),
    valorUnitario: Number(i.valorUnitario),
  }));
  // O desconto da OS vale sobre todos os itens enviados (recusas anteriores são zeradas)
  const totais = calcularTotais(copia, {
    percentual: atual.descontoPercentual != null ? Number(atual.descontoPercentual) : null,
    valor: Number(atual.descontoValor),
  });
  const agora = new Date();

  await r.db.transaction(async (tx) => {
    await tx
      .update(schema.orcamentos)
      .set({ status: "substituido" })
      .where(and(eq(schema.orcamentos.osId, osId), eq(schema.orcamentos.status, "pendente")));
    await tx.insert(schema.orcamentos).values({
      oficinaId: oficina.id,
      osId,
      token: novoToken(),
      itens: copia,
      total: totais.total.toFixed(2),
      desconto: totais.desconto.toFixed(2),
      observacao: dados.data.observacao || null,
      validoAte: new Date(agora.getTime() + dados.data.dias * 86_400_000),
      enviadoPor: userId,
    });
    // O cliente decide de novo sobre todos os itens
    await tx.update(schema.osItens).set({ recusado: false }).where(eq(schema.osItens.osId, osId));
    await tx
      .update(schema.ordensServico)
      .set({ status: "aguardando_aprovacao", aprovacaoEnviadaEm: agora })
      .where(eq(schema.ordensServico.id, osId));
  });
  // Volta para aprovação: as peças que já tinham saído voltam ao estoque até o cliente aprovar
  await sincronizarEstoqueDaOS(oficina.id, osId, nomeDoUsuario(await getContexto()));
  await registrarEvento(r.db, oficina.id, osId, `Enviou o orçamento (${formatBRL(totais.total)}) para o cliente`, await getContexto());

  revalidarOS(osId);
  revalidatePath("/orcamentos");
  return { ok: true };
}

/** Cancela o link pendente (o cliente não consegue mais responder). */
export async function cancelarOrcamento(osId: string) {
  const r = await osDaOficina(osId, undefined, "orcamento");
  if (!r) return;
  await r.db
    .update(schema.orcamentos)
    .set({ status: "substituido" })
    .where(and(eq(schema.orcamentos.osId, osId), eq(schema.orcamentos.status, "pendente")));
  await registrarEvento(r.db, r.oficinaId, osId, "Cancelou o link do orçamento", await getContexto());
  revalidarOS(osId);
  revalidatePath("/orcamentos");
}
