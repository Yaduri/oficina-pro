"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { ehUuid, osDaOficina, registrarEvento } from "@/lib/os-acesso";
import { formatBRL, formatData, parseValor, soDigitos } from "@/lib/utils";

export type EdicaoState = { erro?: string; ok?: boolean } | undefined;

const SEM_PERMISSAO = { erro: "OS não encontrada ou seu usuário não tem permissão" };
const FECHADA = { erro: "A OS está fechada (entregue ou cancelada)" };
const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const fechada = (status: string) => status === "entregue" || status === "cancelada";

function revalidar(osId: string) {
  revalidatePath(`/ordens-servico/${osId}`);
  revalidatePath("/ordens-servico");
  revalidatePath("/ordens-servico/lista");
  revalidatePath("/inicio");
}

/** "AAAA-MM-DD" do input de data → meio-dia em São Paulo (evita trocar de dia pelo fuso) */
function dataDoInput(v: string) {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/* ---------- Dados da OS ---------- */

export async function editarDadosOS(osId: string, _prev: EdicaoState, form: FormData): Promise<EdicaoState> {
  const r = await osDaOficina(osId, "abrirOS");
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;

  const descricao = f(form, "descricao");
  if (descricao.length < 3) return { erro: "Descreva o problema relatado pelo cliente" };
  const kmTxt = soDigitos(f(form, "kmEntrada"));
  const kmEntrada = kmTxt ? Number(kmTxt) : null;
  const previsao = dataDoInput(f(form, "previsaoEntrega"));
  if (previsao === undefined) return { erro: "Data de previsão inválida" };
  const responsavel = f(form, "responsavel");

  let responsavelId: string | null = null;
  let nomeResp: string | null = null;
  if (responsavel) {
    const [t] = await db
      .select()
      .from(schema.tecnicos)
      .where(and(eq(schema.tecnicos.oficinaId, ctx.oficina.id), ilike(schema.tecnicos.nome, responsavel)));
    const tec =
      t ??
      (await db.insert(schema.tecnicos).values({ oficinaId: ctx.oficina.id, empresaId: os.empresaId, nome: responsavel }).returning())[0];
    responsavelId = tec.id;
    nomeResp = tec.nome;
  }

  const mudancas: string[] = [];
  if (descricao !== os.descricao) mudancas.push("relato");
  if (kmEntrada !== os.kmEntrada) mudancas.push(`km de entrada (${kmEntrada?.toLocaleString("pt-BR") ?? "—"})`);
  if (responsavelId !== os.responsavelId) mudancas.push(`responsável (${nomeResp ?? "nenhum"})`);
  if ((previsao?.getTime() ?? null) !== (os.previsaoEntregaEm?.getTime() ?? null)) {
    mudancas.push(`previsão de entrega (${previsao ? formatData(previsao) : "sem data"})`);
  }
  if (mudancas.length === 0) return { ok: true };

  await db
    .update(schema.ordensServico)
    .set({ descricao, kmEntrada, responsavelId, previsaoEntregaEm: previsao })
    .where(eq(schema.ordensServico.id, os.id));
  await registrarEvento(db, ctx.oficina.id, os.id, `Alterou ${mudancas.join(", ")}`, ctx);
  revalidar(os.id);
  return { ok: true };
}

/* ---------- Itens ---------- */

const itemSchema = z.object({
  tipo: z.enum(["peca", "servico"]),
  descricao: z.string().trim().min(1, "Descreva o item").max(200),
  quantidade: z
    .string()
    .transform(parseValor)
    .refine((n) => Number.isFinite(n) && n > 0 && n < 100000, "Quantidade inválida"),
  valor: z
    .string()
    .transform(parseValor)
    .refine((n) => Number.isFinite(n) && n >= 0 && n < 10_000_000, "Valor inválido"),
  empresaId: z.uuid("Empresa inválida"),
});

export async function editarItem(osId: string, itemId: string, _prev: EdicaoState, form: FormData): Promise<EdicaoState> {
  if (!ehUuid(itemId)) return SEM_PERMISSAO;
  const r = await osDaOficina(osId, "editarItens");
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  if (fechada(os.status)) return FECHADA;

  const d = itemSchema.safeParse({
    tipo: f(form, "tipo"),
    descricao: f(form, "descricao"),
    quantidade: f(form, "quantidade") || "1",
    valor: f(form, "valor"),
    empresaId: f(form, "empresaId") || os.empresaId,
  });
  if (!d.success) return { erro: d.error.issues[0].message };
  if (!ctx.empresas.some((e) => e.id === d.data.empresaId)) return { erro: "Empresa não permitida" };

  const [antes] = await db
    .select()
    .from(schema.osItens)
    .where(and(eq(schema.osItens.id, itemId), eq(schema.osItens.osId, os.id)));
  if (!antes) return { erro: "Item não encontrado" };

  await db
    .update(schema.osItens)
    .set({
      tipo: d.data.tipo,
      descricao: d.data.descricao,
      quantidade: String(d.data.quantidade),
      valorUnitario: d.data.valor.toFixed(2),
      empresaId: d.data.empresaId,
    })
    .where(eq(schema.osItens.id, itemId));

  const detalhes: string[] = [];
  if (Number(antes.valorUnitario) !== d.data.valor) detalhes.push(`valor ${formatBRL(antes.valorUnitario)} → ${formatBRL(d.data.valor)}`);
  if (Number(antes.quantidade) !== d.data.quantidade) detalhes.push(`quantidade ${Number(antes.quantidade)} → ${d.data.quantidade}`);
  if (antes.empresaId !== d.data.empresaId) {
    detalhes.push(`empresa → ${ctx.empresas.find((e) => e.id === d.data.empresaId)?.nome}`);
  }
  await registrarEvento(
    db,
    ctx.oficina.id,
    os.id,
    `Alterou o item “${d.data.descricao}”${detalhes.length ? ` (${detalhes.join(", ")})` : ""}`,
    ctx,
  );
  revalidar(os.id);
  return { ok: true };
}

/* ---------- Desconto ---------- */

export async function definirDesconto(osId: string, _prev: EdicaoState, form: FormData): Promise<EdicaoState> {
  const r = await osDaOficina(osId, "editarItens");
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  if (fechada(os.status)) return FECHADA;

  const tipo = f(form, "tipo");
  const valor = parseValor(f(form, "valor") || "0");
  let set: { descontoPercentual: string | null; descontoValor: string };
  let texto: string;
  if (tipo === "percentual") {
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) return { erro: "Percentual entre 0 e 100" };
    set = { descontoPercentual: valor.toFixed(2), descontoValor: "0" };
    texto = valor > 0 ? `Desconto de ${valor.toLocaleString("pt-BR")}%` : "Removeu o desconto";
  } else if (tipo === "valor") {
    if (!Number.isFinite(valor) || valor < 0 || valor >= 10_000_000) return { erro: "Valor de desconto inválido" };
    set = { descontoPercentual: null, descontoValor: valor.toFixed(2) };
    texto = valor > 0 ? `Desconto de ${formatBRL(valor)}` : "Removeu o desconto";
  } else return { erro: "Escolha o tipo de desconto" };

  await db.update(schema.ordensServico).set(set).where(eq(schema.ordensServico.id, os.id));
  await registrarEvento(db, ctx.oficina.id, os.id, texto, ctx);
  revalidar(os.id);
  return { ok: true };
}

/* ---------- Transferir para outra empresa ---------- */

export async function transferirOS(osId: string, empresaId: string): Promise<EdicaoState> {
  const r = await osDaOficina(osId, "abrirOS");
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  if (fechada(os.status)) return FECHADA;
  const destino = ctx.empresas.find((e) => e.id === empresaId);
  if (!destino || destino.id === os.empresaId) return { erro: "Escolha outra empresa" };
  const origem = ctx.oficina.empresas.find((e) => e.id === os.empresaId);

  await db.transaction(async (tx) => {
    await tx.update(schema.ordensServico).set({ empresaId: destino.id }).where(eq(schema.ordensServico.id, os.id));
    // Itens que eram da empresa de origem acompanham a OS (itens de OS mista ficam como estão)
    await tx
      .update(schema.osItens)
      .set({ empresaId: destino.id })
      .where(and(eq(schema.osItens.osId, os.id), eq(schema.osItens.empresaId, os.empresaId)));
  });
  await registrarEvento(db, ctx.oficina.id, os.id, `Transferiu a OS de ${origem?.nome ?? "outra empresa"} para ${destino.nome}`, ctx);
  revalidar(os.id);
  return { ok: true };
}

/* ---------- Entrega do veículo ---------- */

export async function entregarOS(osId: string, _prev: EdicaoState, form: FormData): Promise<EdicaoState> {
  const r = await osDaOficina(osId, "fecharOS");
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  if (fechada(os.status)) return { erro: "A OS já está fechada" };

  const kmTxt = soDigitos(f(form, "kmSaida"));
  const kmSaida = kmTxt ? Number(kmTxt) : null;
  if (kmSaida !== null && os.kmEntrada !== null && kmSaida < os.kmEntrada) {
    return { erro: `O km de saída não pode ser menor que o de entrada (${os.kmEntrada.toLocaleString("pt-BR")})` };
  }
  const garantiaAte = dataDoInput(f(form, "garantiaAte"));
  if (garantiaAte === undefined) return { erro: "Data de garantia inválida" };
  const obs = f(form, "entregaObs").slice(0, 1000) || null;
  const assinaturaKey = f(form, "assinaturaKey");
  if (assinaturaKey && !assinaturaKey.startsWith(`${ctx.oficina.id}/os/`)) return { erro: "Assinatura inválida" };

  const agora = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.ordensServico)
      .set({
        status: "entregue",
        entregueEm: agora,
        kmSaida,
        garantiaAte,
        entregaObs: obs,
        entregaAssinaturaKey: assinaturaKey || null,
        entreguePor: ctx.userId,
      })
      .where(eq(schema.ordensServico.id, os.id));
    if (kmSaida !== null) {
      const [v] = await tx.select({ km: schema.veiculos.km }).from(schema.veiculos).where(eq(schema.veiculos.id, os.veiculoId));
      if (v && (v.km === null || kmSaida > v.km)) {
        await tx.update(schema.veiculos).set({ km: kmSaida }).where(eq(schema.veiculos.id, os.veiculoId));
      }
    }
  });
  await registrarEvento(
    db,
    ctx.oficina.id,
    os.id,
    `Entregou o veículo${assinaturaKey ? " (com assinatura do cliente)" : ""}${garantiaAte ? `, garantia até ${formatData(garantiaAte)}` : ""}`,
    ctx,
  );
  revalidar(os.id);
  revalidatePath("/clientes");
  return { ok: true };
}

/* ---------- Fotos durante o serviço ---------- */

export async function adicionarFotoOS(osId: string, key: string, legenda: string): Promise<EdicaoState> {
  const r = await osDaOficina(osId, "checkin");
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  if (!key.startsWith(`${ctx.oficina.id}/os/`)) return { erro: "Foto inválida" };
  await db.insert(schema.osFotos).values({ osId: os.id, key, legenda: legenda.trim().slice(0, 120) || null, criadoPor: ctx.userId });
  await registrarEvento(db, ctx.oficina.id, os.id, `Adicionou uma foto${legenda.trim() ? `: ${legenda.trim().slice(0, 120)}` : ""}`, ctx);
  revalidar(os.id);
  return { ok: true };
}

export async function removerFotoOS(osId: string, fotoId: string): Promise<EdicaoState> {
  if (!ehUuid(fotoId)) return SEM_PERMISSAO;
  const r = await osDaOficina(osId);
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  const [foto] = await db
    .select()
    .from(schema.osFotos)
    .where(and(eq(schema.osFotos.id, fotoId), eq(schema.osFotos.osId, os.id)));
  if (!foto) return { erro: "Foto não encontrada" };
  // Quem tirou a foto pode apagar; os demais só com permissão de editar a OS
  if (foto.criadoPor !== ctx.userId && !ctx.pode("editarItens")) return SEM_PERMISSAO;
  await db.delete(schema.osFotos).where(eq(schema.osFotos.id, foto.id));
  await registrarEvento(db, ctx.oficina.id, os.id, "Removeu uma foto", ctx);
  revalidar(os.id);
  return { ok: true };
}

