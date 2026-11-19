"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { schema, type DB } from "@/db";
import { hojeSP, listarContas } from "@/lib/financeiro";
import {
  categoriaDaOS,
  lancadoNaOS,
  lancarPagamentos,
  planejarPagamentos,
  planoReceberDepois,
  resumoPagamentos,
  totaisDaOS,
  type PlanoPagamento,
} from "@/lib/recebimento";
import { ehUuid, nomeDoUsuario, osDaOficina, registrarEvento } from "@/lib/os-acesso";
import { sincronizarEstoqueDaOS } from "@/lib/estoque-os";
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
  const previsaoPeca = dataDoInput(f(form, "previsaoPeca"));
  if (previsaoPeca === undefined) return { erro: "Data de previsão da peça inválida" };
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
      (await db.insert(schema.tecnicos).values({ oficinaId: ctx.oficina.id, nome: responsavel }).returning())[0];
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
  if ((previsaoPeca?.getTime() ?? null) !== (os.previsaoPecaEm?.getTime() ?? null)) {
    mudancas.push(`previsão da peça (${previsaoPeca ? formatData(previsaoPeca) : "sem data"})`);
  }
  if (mudancas.length === 0) return { ok: true };

  await db
    .update(schema.ordensServico)
    .set({ descricao, kmEntrada, responsavelId, previsaoEntregaEm: previsao, previsaoPecaEm: previsaoPeca })
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
  });
  if (!d.success) return { erro: d.error.issues[0].message };

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
    })
    .where(eq(schema.osItens.id, itemId));
  await sincronizarEstoqueDaOS(ctx.oficina.id, os.id, nomeDoUsuario(ctx));

  const detalhes: string[] = [];
  if (Number(antes.valorUnitario) !== d.data.valor) detalhes.push(`valor ${formatBRL(antes.valorUnitario)} → ${formatBRL(d.data.valor)}`);
  if (Number(antes.quantidade) !== d.data.quantidade) detalhes.push(`quantidade ${Number(antes.quantidade)} → ${d.data.quantidade}`);
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

  // Pagamento (só quem vê valores): o que falta lançar da OS vira conta a receber
  const hoje = hojeSP();
  let planos: PlanoPagamento[] = [];
  let categoriaId: string | null = null;
  if (ctx.pode("verValores")) {
    const totais = await totaisDaOS(db, os);
    const aReceber = totais.total - (await lancadoNaOS(db, ctx.oficina.id, os.id));
    if (aReceber > 0) {
      const contas = await listarContas(ctx.oficina.id);
      if (contas.length === 0) return { erro: "Cadastre uma conta (caixa ou banco) no financeiro antes de receber" };
      if (f(form, "pagamentoModo") === "depois") {
        planos = [planoReceberDepois(aReceber, contas, hoje)];
      } else {
        let linhas: unknown;
        try {
          linhas = JSON.parse(f(form, "pagamentos") || "[]");
        } catch {
          return { erro: "Pagamento inválido" };
        }
        const plano = planejarPagamentos(linhas as Parameters<typeof planejarPagamentos>[0], aReceber, contas, hoje);
        if ("erro" in plano) return plano;
        planos = plano.planos;
      }
      categoriaId = await categoriaDaOS(ctx.oficina.id, totais);
    }
  }
  const [veic] = await db.select({ placa: schema.veiculos.placa }).from(schema.veiculos).where(eq(schema.veiculos.id, os.veiculoId));

  const agora = new Date();
  try {
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
      if (planos.length > 0) {
        await lancarPagamentos(tx as unknown as DB, {
          oficinaId: ctx.oficina.id,
          os,
          placa: veic?.placa ?? "",
          categoriaId,
          planos,
          hoje,
          userId: ctx.userId,
        });
      }
    });
  } catch (e) {
    return { erro: e instanceof Error && e.message ? `Não foi possível registrar o pagamento: ${e.message}` : "Não foi possível registrar a entrega" };
  }
  await sincronizarEstoqueDaOS(ctx.oficina.id, os.id, nomeDoUsuario(ctx));
  await registrarEvento(
    db,
    ctx.oficina.id,
    os.id,
    `Entregou o veículo${assinaturaKey ? " (com assinatura do cliente)" : ""}${garantiaAte ? `, garantia até ${formatData(garantiaAte)}` : ""}`,
    ctx,
  );
  if (planos.length > 0) await registrarEvento(db, ctx.oficina.id, os.id, resumoPagamentos(planos), ctx);
  revalidar(os.id);
  revalidatePath("/clientes");
  if (planos.length > 0) revalidatePath("/financeiro", "layout");
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


/* ---------- Cliente avisado ---------- */

/** Registra que o cliente foi avisado (pelo WhatsApp) de que o veículo está pronto */
export async function marcarClienteAvisado(osId: string) {
  const r = await osDaOficina(osId, "fecharOS");
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  await db.update(schema.ordensServico).set({ clienteAvisadoEm: new Date() }).where(eq(schema.ordensServico.id, os.id));
  await registrarEvento(db, ctx.oficina.id, os.id, "Avisou o cliente pelo WhatsApp que o veículo está pronto", ctx);
  revalidar(os.id);
  return { ok: true };
}
