"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { ehUuid, nomeDoUsuario, registrarEvento } from "@/lib/os-acesso";
import { atualizarStatusOS } from "@/lib/queries";
import { STATUS } from "@/lib/os";
import { sincronizarEstoqueOS } from "@/lib/estoque";
import { categoriaSistema } from "@/lib/financeiro";
import { lerArquivo, chaveValida } from "@/lib/storage";
import { lerNfe } from "@/lib/nfe-xml";
import { UNIDADES } from "@/lib/estoque-formato";
import { normalizarCnpj } from "@/lib/utils";
import {
  RecusaCompra,
  cancelarPedido,
  criarCompra,
  dataCurta,
  diaValido,
  estornarEntrada,
  meioDiaSP,
  receberCompra,
  type Contexto,
  type PagamentoCompra,
} from "@/lib/compras";

export type AcaoState = { erro?: string; ok?: boolean } | undefined;

const { compras, catalogoItens: cat, fornecedores, fornecedorCodigos, ordensServico } = schema;
const SEM_PERMISSAO = { erro: "Seu usuário não tem permissão para compras" };

async function contexto() {
  const ctx = await getContexto();
  return ctx.pode("estoque") ? ctx : null;
}

const cent = (reaisValor: number) => Math.round(reaisValor * 100);
const dinheiro = z.number().finite().min(0, "Valor não pode ser negativo").max(10_000_000, "Valor muito alto");
const dia = z.string().refine(diaValido, "Data inválida");
const diaOpcional = z
  .string()
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || diaValido(v), "Data inválida");
const textoOpc = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => v?.trim() || null)
    .refine((v) => v === null || v.length <= max, "Texto muito longo");

const pagamentoSchema = z.discriminatedUnion("modo", [
  z.object({
    modo: z.literal("prazo"),
    parcelas: z.array(z.object({ valor: dinheiro, vencimento: dia })).min(1, "Informe as parcelas").max(60),
    forma: z.string().nullish(),
    contaId: z.uuid().nullish(),
  }),
  z.object({ modo: z.literal("paga"), contaId: z.uuid("Escolha a conta de onde saiu o dinheiro"), forma: z.string().nullish() }),
]);

function pagamento(p: z.infer<typeof pagamentoSchema>): PagamentoCompra {
  return p.modo === "prazo"
    ? { modo: "prazo", parcelas: p.parcelas.map((x) => ({ valor: cent(x.valor), vencimento: x.vencimento })), forma: p.forma ?? null, contaId: p.contaId ?? null }
    : { modo: "paga", contaId: p.contaId, forma: p.forma ?? null };
}

const notaSchema = {
  data: dia,
  notaNumero: textoOpc(20),
  notaSerie: textoOpc(5),
  notaEmissao: diaOpcional,
  pagamento: pagamentoSchema,
};

/** Conta escolhida é da oficina (a baixa confere de novo) */
async function contaDaOficina(oficinaId: string, contaId: string | null | undefined) {
  if (!contaId) return true;
  const db = await getDb();
  const [c] = await db
    .select({ id: schema.contasFinanceiras.id })
    .from(schema.contasFinanceiras)
    .where(and(eq(schema.contasFinanceiras.id, contaId), eq(schema.contasFinanceiras.oficinaId, oficinaId)));
  return !!c;
}

function revalidar(compraId?: string, osId?: string | null, fornecedorId?: string | null) {
  revalidatePath("/estoque", "layout");
  revalidatePath("/financeiro", "layout");
  if (compraId) revalidatePath(`/estoque/compras/${compraId}`);
  if (fornecedorId) revalidatePath(`/estoque/fornecedores/${fornecedorId}`);
  if (osId) {
    revalidatePath(`/ordens-servico/${osId}`);
    revalidatePath("/ordens-servico");
    revalidatePath("/inicio");
  }
}

/** Executa numa transação; RecusaCompra vira mensagem de erro */
async function emTransacao<T>(fn: (tx: DB) => Promise<T>): Promise<{ ok: T } | { erro: string }> {
  const db = await getDb();
  try {
    return { ok: await db.transaction(async (tx) => fn(tx as unknown as DB)) };
  } catch (e) {
    if (e instanceof RecusaCompra) return { erro: e.message };
    // Nota já importada (índice único da chave)
    if (e instanceof Error && /compras_chave_uq/.test(`${e.message} ${(e as { cause?: unknown }).cause ?? ""}`)) {
      return { erro: "Esta nota já foi lançada" };
    }
    throw e;
  }
}

/** Pedido ligado a uma OS: a OS fica "Aguardando peça", com a previsão da peça */
async function vincularPedidoAOS(ctx: Contexto, osId: string, numero: number, previsao: string | null) {
  const db = await getDb();
  const oficinaId = ctx.oficina.id;
  const [o] = await db
    .select({ status: ordensServico.status })
    .from(ordensServico)
    .where(and(eq(ordensServico.id, osId), eq(ordensServico.oficinaId, oficinaId)));
  if (!o) return;
  let mudou = false;
  // Só a OS já aprovada (em execução ou pronta) passa a esperar a peça; em diagnóstico ou
  // aguardando aprovação ela continua onde está, para as peças não saírem antes do sim do cliente
  if (o.status === "em_execucao" || o.status === "pronto") {
    mudou = await atualizarStatusOS(oficinaId, osId, "aguardando_peca");
    if (mudou) await registrarEvento(db, oficinaId, osId, `Status: ${STATUS[o.status].label} → ${STATUS.aguardando_peca.label}`, ctx);
  }
  if (previsao && o.status !== "entregue" && o.status !== "cancelada") {
    await db.update(ordensServico).set({ previsaoPecaEm: meioDiaSP(previsao) }).where(eq(ordensServico.id, osId));
  }
  await registrarEvento(db, oficinaId, osId, `Pedido de compra #${numero}${previsao ? `, previsão ${dataCurta(previsao)}` : ""}`, ctx);
  if (mudou) await sincronizarEstoqueOS(oficinaId, osId, nomeDoUsuario(ctx));
}

/* ---------- Nova compra (pedido ou entrada manual) ---------- */

const novaCompraSchema = z
  .object({
    tipo: z.enum(["pedido", "entrada"]),
    fornecedorId: z.uuid("Escolha o fornecedor"),
    osId: z.uuid().nullish(),
    previsao: diaOpcional,
    observacao: textoOpc(1000),
    itens: z
      .array(
        z.object({
          catalogoItemId: z.uuid("Escolha a peça de cada item"),
          quantidade: z.number().finite().gt(0, "Quantidade deve ser maior que zero").max(1_000_000),
          valorUnitario: dinheiro,
        }),
      )
      .min(1, "Inclua ao menos uma peça")
      .max(200),
    frete: dinheiro,
    desconto: dinheiro,
    outros: dinheiro,
    recebimento: z.object(notaSchema).nullish(),
  })
  .refine((d) => d.tipo === "pedido" || !!d.recebimento, "Informe os dados do recebimento");

export type NovaCompraDados = z.input<typeof novaCompraSchema>;

export async function salvarCompra(dados: NovaCompraDados): Promise<AcaoState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  const p = novaCompraSchema.safeParse(dados);
  if (!p.success) return { erro: p.error.issues[0].message };
  const d = p.data;
  const oficinaId = ctx.oficina.id;
  if (d.recebimento && !(await contaDaOficina(oficinaId, d.recebimento.pagamento.contaId))) return { erro: "Conta não encontrada" };

  // Descrição de cada item = a da peça
  const db = await getDb();
  const ids = [...new Set(d.itens.map((i) => i.catalogoItemId))];
  const pecas = new Map(
    (
      await db
        .select({ id: cat.id, descricao: cat.descricao, unidade: cat.unidade, gtin: cat.gtin, ncm: cat.ncm })
        .from(cat)
        .where(and(eq(cat.oficinaId, oficinaId), inArray(cat.id, ids)))
    ).map((x) => [x.id, x]),
  );
  const categoriaId = d.recebimento ? await categoriaSistema(oficinaId, "compra_pecas") : null;

  const r = await emTransacao(async (tx) => {
    const c = await criarCompra(tx, ctx, {
      fornecedorId: d.fornecedorId,
      osId: d.osId ?? null,
      previsaoEm: d.tipo === "pedido" ? d.previsao : null,
      observacao: d.observacao,
      frete: cent(d.frete),
      desconto: cent(d.desconto),
      outros: cent(d.outros),
      itens: d.itens.map((i) => {
        const pc = pecas.get(i.catalogoItemId);
        return {
          catalogoItemId: i.catalogoItemId,
          descricao: pc?.descricao ?? "Peça",
          unidade: pc?.unidade ?? null,
          gtin: pc?.gtin ?? null,
          ncm: pc?.ncm ?? null,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
        };
      }),
    });
    if (d.recebimento) {
      const rec = d.recebimento;
      await receberCompra(tx, ctx, c.id, {
        data: rec.data,
        notaNumero: rec.notaNumero,
        notaSerie: rec.notaSerie,
        notaEmissao: rec.notaEmissao,
        frete: cent(d.frete),
        desconto: cent(d.desconto),
        outros: cent(d.outros),
        pagamento: pagamento(rec.pagamento),
        categoriaId,
      });
    }
    return c;
  });
  if ("erro" in r) return r;

  if (d.tipo === "pedido" && d.osId) await vincularPedidoAOS(ctx, d.osId, r.ok.numero, d.previsao);
  revalidar(r.ok.id, d.osId, d.fornecedorId);
  redirect(`/estoque/compras/${r.ok.id}`);
}

/* ---------- Receber pedido ---------- */

const receberSchema = z.object({
  ...notaSchema,
  frete: dinheiro,
  desconto: dinheiro,
  outros: dinheiro,
  itens: z
    .array(
      z.object({
        id: z.uuid(),
        quantidade: z.number().finite().min(0, "Quantidade inválida").max(1_000_000),
        valorUnitario: dinheiro,
      }),
    )
    .min(1),
});

export type ReceberDados = z.input<typeof receberSchema>;

export async function receberPedido(compraId: string, dados: ReceberDados): Promise<AcaoState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!ehUuid(compraId)) return { erro: "Compra não encontrada" };
  const p = receberSchema.safeParse(dados);
  if (!p.success) return { erro: p.error.issues[0].message };
  const d = p.data;
  if (!(await contaDaOficina(ctx.oficina.id, d.pagamento.contaId))) return { erro: "Conta não encontrada" };
  const categoriaId = await categoriaSistema(ctx.oficina.id, "compra_pecas");
  const r = await emTransacao((tx) =>
    receberCompra(tx, ctx, compraId, {
      data: d.data,
      notaNumero: d.notaNumero,
      notaSerie: d.notaSerie,
      notaEmissao: d.notaEmissao,
      frete: cent(d.frete),
      desconto: cent(d.desconto),
      outros: cent(d.outros),
      itens: d.itens,
      pagamento: pagamento(d.pagamento),
      categoriaId,
    }),
  );
  if ("erro" in r) return r;
  revalidar(compraId, r.ok.osId);
  return { ok: true };
}

/* ---------- Cancelar / estornar ---------- */

export async function cancelarCompra(compraId: string): Promise<AcaoState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!ehUuid(compraId)) return { erro: "Compra não encontrada" };
  const r = await emTransacao((tx) => cancelarPedido(tx, ctx, compraId));
  if ("erro" in r) return r;
  revalidar(compraId, r.ok.osId, r.ok.fornecedorId);
  return { ok: true };
}

export async function estornarCompra(compraId: string): Promise<AcaoState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  if (!ehUuid(compraId)) return { erro: "Compra não encontrada" };
  const r = await emTransacao((tx) => estornarEntrada(tx, ctx, compraId));
  if ("erro" in r) return r;
  revalidar(compraId, r.ok.osId, r.ok.fornecedorId);
  return { ok: true };
}

/* ---------- Peça nova (cadastro mínimo na compra) ---------- */

const pecaSchema = z.object({
  descricao: z.string().trim().min(2, "Informe a descrição da peça").max(200, "Descrição muito longa"),
  codigo: textoOpc(40),
  unidade: z.enum(UNIDADES, "Unidade inválida"),
  valor: z.number().finite().min(0, "Preço de venda inválido").max(10_000_000),
});

export type PecaRapida = { id: string; codigo: string | null; descricao: string; unidade: string; custoMedio: number; estoqueAtual: number; gtin: string | null };

export async function criarPecaRapida(dados: z.input<typeof pecaSchema>): Promise<{ erro: string } | PecaRapida> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO as { erro: string };
  const p = pecaSchema.safeParse(dados);
  if (!p.success) return { erro: p.error.issues[0].message };
  const db = await getDb();
  const [nova] = await db
    .insert(cat)
    .values({
      oficinaId: ctx.oficina.id,
      tipo: "peca",
      descricao: p.data.descricao,
      codigo: p.data.codigo,
      unidade: p.data.unidade,
      valor: p.data.valor.toFixed(2),
      controlaEstoque: true,
    })
    .returning({ id: cat.id, codigo: cat.codigo, descricao: cat.descricao, unidade: cat.unidade, gtin: cat.gtin });
  revalidatePath("/estoque");
  revalidatePath("/configuracoes/catalogo");
  return { ...nova, custoMedio: 0, estoqueAtual: 0 };
}

/* ---------- Importar XML da NF-e ---------- */

const decisaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("vincular"), catalogoItemId: z.uuid("Escolha a peça"), fator: z.number().finite().gt(0).max(100_000) }),
  z.object({
    acao: z.literal("criar"),
    descricao: z.string().trim().min(2, "Informe a descrição da peça nova").max(200),
    codigo: textoOpc(40),
    unidade: z.enum(UNIDADES, "Unidade inválida"),
    marca: textoOpc(60),
    valor: z.number().finite().gt(0, "Informe o preço de venda das peças novas").max(10_000_000),
    fator: z.number().finite().gt(0).max(100_000),
  }),
  z.object({ acao: z.literal("ignorar") }),
]);

const importacaoSchema = z.object({
  xmlKey: z.string(),
  data: dia,
  itens: z.array(decisaoSchema).min(1),
  pagamento: pagamentoSchema,
});

export type ImportacaoDados = z.input<typeof importacaoSchema>;

export async function confirmarImportacao(dados: ImportacaoDados): Promise<AcaoState> {
  const ctx = await contexto();
  if (!ctx) return SEM_PERMISSAO;
  const p = importacaoSchema.safeParse(dados);
  if (!p.success) return { erro: p.error.issues[0].message };
  const d = p.data;
  const oficinaId = ctx.oficina.id;
  if (!chaveValida(d.xmlKey) || !d.xmlKey.startsWith(`${oficinaId}/compras/`)) return { erro: "Arquivo da nota não encontrado. Envie o XML de novo." };
  if (!(await contaDaOficina(oficinaId, d.pagamento.contaId))) return { erro: "Conta não encontrada" };

  // Os valores vêm sempre do XML guardado (não do navegador)
  const arq = await lerArquivo(d.xmlKey);
  if (!arq) return { erro: "Arquivo da nota não encontrado. Envie o XML de novo." };
  const xml = await new Response(Buffer.isBuffer(arq.body) ? new Uint8Array(arq.body) : arq.body).text();
  const lido = lerNfe(xml);
  if (!lido.ok) return { erro: lido.erro };
  const nfe = lido.nfe;
  if (d.itens.length !== nfe.itens.length) return { erro: "Os itens não conferem com a nota. Envie o XML de novo." };
  if (d.itens.every((i) => i.acao === "ignorar")) return { erro: "Nenhum item vai para o estoque. Vincule ou cadastre ao menos uma peça." };

  const db = await getDb();
  if (nfe.chave) {
    const [ja] = await db
      .select({ id: compras.id, numero: compras.numero })
      .from(compras)
      .where(and(eq(compras.oficinaId, oficinaId), eq(compras.notaChave, nfe.chave), ne(compras.status, "cancelada")));
    if (ja) return { erro: `Esta nota já foi lançada na compra #${ja.numero}` };
  }
  const categoriaId = await categoriaSistema(oficinaId, "compra_pecas");
  const doc = nfe.emitente.cnpj ? normalizarCnpj(nfe.emitente.cnpj) : nfe.emitente.cpf;

  const r = await emTransacao(async (tx) => {
    // Fornecedor: pelo CNPJ/CPF; senão, cadastra com os dados da nota
    let fornecedorId: string | null = null;
    if (doc) {
      const [f] = await tx
        .select({ id: fornecedores.id })
        .from(fornecedores)
        .where(and(eq(fornecedores.oficinaId, oficinaId), eq(fornecedores.cpfCnpj, doc)));
      fornecedorId = f?.id ?? null;
    }
    if (!fornecedorId) {
      const e = nfe.emitente;
      const [f] = await tx
        .insert(fornecedores)
        .values({
          oficinaId,
          tipoPessoa: e.cnpj ? "pj" : "pf",
          nome: e.nome,
          nomeFantasia: e.fantasia,
          cpfCnpj: doc,
          inscricaoEstadual: e.ie,
          telefone: e.telefone && e.telefone.length >= 10 && e.telefone.length <= 11 ? e.telefone : null,
          ...e.endereco,
        })
        .returning({ id: fornecedores.id });
      fornecedorId = f.id;
    }

    // Peças novas e vínculos (código do fornecedor → peça, com o fator)
    const pecaDe: (string | null)[] = [];
    for (const [k, dec] of d.itens.entries()) {
      const it = nfe.itens[k];
      if (dec.acao === "ignorar") {
        pecaDe.push(null);
        continue;
      }
      let pecaId: string;
      if (dec.acao === "criar") {
        const [nova] = await tx
          .insert(cat)
          .values({
            oficinaId,
            tipo: "peca",
            descricao: dec.descricao,
            codigo: dec.codigo,
            unidade: dec.unidade,
            marca: dec.marca,
            ncm: it.ncm,
            gtin: it.gtin,
            valor: dec.valor.toFixed(2),
            controlaEstoque: true,
          })
          .returning({ id: cat.id });
        pecaId = nova.id;
      } else {
        pecaId = dec.catalogoItemId;
      }
      pecaDe.push(pecaId);
      if (it.codigo) {
        await tx
          .insert(fornecedorCodigos)
          .values({ oficinaId, fornecedorId, codigo: it.codigo, catalogoItemId: pecaId, fator: dec.fator.toFixed(4) })
          .onConflictDoUpdate({
            target: [fornecedorCodigos.fornecedorId, fornecedorCodigos.codigo],
            set: { catalogoItemId: pecaId, fator: dec.fator.toFixed(4) },
          });
      }
    }

    const fatorDe = (k: number) => {
      const dec = d.itens[k];
      return dec.acao === "ignorar" ? 1 : dec.fator;
    };
    const soma = (f: (i: (typeof nfe.itens)[number]) => number) => nfe.itens.reduce((s, i) => s + cent(f(i)), 0);
    const c = await criarCompra(tx, ctx, {
      fornecedorId,
      frete: soma((i) => i.frete),
      desconto: soma((i) => i.desconto),
      outros: soma((i) => i.seguro + i.outros + i.ipi + i.st),
      notaNumero: nfe.numero,
      notaSerie: nfe.serie,
      notaChave: nfe.chave,
      notaEmissao: nfe.emissao,
      xmlKey: d.xmlKey,
      itens: nfe.itens.map((it, k) => ({
        catalogoItemId: pecaDe[k],
        codigoFornecedor: it.codigo || null,
        descricao: it.descricao,
        ncm: it.ncm,
        gtin: it.gtin,
        unidade: it.unidade,
        quantidade: it.quantidade * fatorDe(k),
        valorUnitario: it.valorUnitario / fatorDe(k),
      })),
    });
    await receberCompra(tx, ctx, c.id, {
      data: d.data,
      frete: soma((i) => i.frete),
      desconto: soma((i) => i.desconto),
      outros: soma((i) => i.seguro + i.outros + i.ipi + i.st),
      custos: new Map(c.itemIds.map((id, k) => [id, cent(nfe.itens[k].custoTotal)])),
      semEstoque: new Set(c.itemIds.filter((_, k) => pecaDe[k] === null)),
      pagamento: pagamento(d.pagamento),
      categoriaId,
    });
    return { id: c.id, fornecedorId };
  });
  if ("erro" in r) return r;
  revalidar(r.ok.id, null, r.ok.fornecedorId);
  redirect(`/estoque/compras/${r.ok.id}`);
}
