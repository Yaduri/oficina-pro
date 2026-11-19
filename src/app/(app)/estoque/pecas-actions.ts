"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { nomeDoUsuario } from "@/lib/os-acesso";
import { movimentar, qtd } from "@/lib/estoque";
import { lerQtd } from "@/lib/estoque-formato";
import { formatData, parseValor } from "@/lib/utils";

const cat = schema.catalogoItens;
const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const MAX = 1_000_000;

async function contexto() {
  const ctx = await getContexto();
  return ctx.pode("estoque") ? ctx : null;
}

function revalidar(id?: string) {
  revalidatePath("/estoque", "layout");
  if (id) revalidatePath(`/estoque/${id}`);
  revalidatePath("/configuracoes/catalogo");
}

/* ---------- Ajuste de uma peça ---------- */

export type AjusteState = { erro?: string; ok?: boolean } | undefined;

export async function ajustarEstoque(id: string, _prev: AjusteState, form: FormData): Promise<AjusteState> {
  const ctx = await contexto();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  if (!z.uuid().safeParse(id).success) return { erro: "Peça não encontrada" };

  const modo = f(form, "modo");
  if (modo !== "definir" && modo !== "entrada" && modo !== "saida") return { erro: "Escolha o tipo de ajuste" };
  const valor = lerQtd(f(form, "quantidade"));
  if (!Number.isFinite(valor) || valor < 0 || valor >= MAX || (modo !== "definir" && valor === 0)) return { erro: "Quantidade inválida" };
  const motivo = f(form, "motivo").slice(0, 200);
  if (motivo.length < 3) return { erro: "Informe o motivo do ajuste" };
  const custoTxt = ctx.pode("verValores") ? f(form, "custo") : "";
  const custo = custoTxt ? parseValor(custoTxt) : null;
  if (custo !== null && (!Number.isFinite(custo) || custo < 0 || custo >= 10_000_000)) return { erro: "Custo unitário inválido" };

  const db = await getDb();
  const r = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DB;
    const [p] = await tx
      .select({ saldo: cat.estoqueAtual, controla: cat.controlaEstoque })
      .from(cat)
      .where(and(eq(cat.id, id), eq(cat.oficinaId, ctx.oficina.id), eq(cat.tipo, "peca")))
      .for("update");
    if (!p) return { erro: "Peça não encontrada" };
    if (!p.controla) return { erro: "Esta peça não controla estoque" };
    const diff = Math.round((modo === "definir" ? valor - qtd(p.saldo) : modo === "entrada" ? valor : -valor) * 1000) / 1000;
    if (!diff) return { erro: "O saldo já é esse" };
    await movimentar(tx, {
      oficinaId: ctx.oficina.id,
      catalogoItemId: id,
      tipo: "ajuste",
      quantidade: diff,
      custoUnitario: diff > 0 ? custo : null,
      motivo,
      criadoPor: nomeDoUsuario(ctx),
    });
    return { ok: true };
  });
  if (r.ok) revalidar(id);
  return r;
}

/* ---------- Inventário ---------- */

export type InventarioState =
  | { erro?: string; ok?: false }
  | { ok: true; contadas: number; alteradas: number; diferencaValor: number }
  | undefined;

const contagemSchema = z
  .array(z.object({ id: z.uuid(), contado: z.string().max(20) }))
  .max(5000);

export async function aplicarInventario(_prev: InventarioState, form: FormData): Promise<InventarioState> {
  const ctx = await contexto();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };

  let bruto: unknown;
  try {
    bruto = JSON.parse(f(form, "contagem") || "[]");
  } catch {
    return { erro: "Contagem inválida" };
  }
  const p = contagemSchema.safeParse(bruto);
  if (!p.success) return { erro: "Contagem inválida" };
  const linhas = new Map<string, number>();
  for (const l of p.data) {
    if (!l.contado.trim()) continue;
    const n = lerQtd(l.contado);
    if (!Number.isFinite(n) || n < 0 || n >= MAX) return { erro: `Quantidade contada inválida: ${l.contado}` };
    linhas.set(l.id, Math.round(n * 1000) / 1000);
  }
  if (linhas.size === 0) return { erro: "Preencha a quantidade contada de ao menos uma peça" };

  const obs = f(form, "observacao").slice(0, 150);
  const motivo = `Inventário ${formatData(new Date())}${obs ? `: ${obs}` : ""}`;
  const quem = nomeDoUsuario(ctx);

  const db = await getDb();
  const r = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DB;
    const pecas = await tx
      .select({ id: cat.id, saldo: cat.estoqueAtual, custo: cat.custoMedio })
      .from(cat)
      .where(and(eq(cat.oficinaId, ctx.oficina.id), eq(cat.controlaEstoque, true), inArray(cat.id, [...linhas.keys()])))
      .for("update");
    let alteradas = 0;
    let diferencaValor = 0;
    for (const peca of pecas) {
      const diff = Math.round(((linhas.get(peca.id) ?? 0) - qtd(peca.saldo)) * 1000) / 1000;
      if (!diff) continue;
      await movimentar(tx, { oficinaId: ctx.oficina.id, catalogoItemId: peca.id, tipo: "ajuste", quantidade: diff, motivo, criadoPor: quem });
      alteradas++;
      diferencaValor += diff * Number(peca.custo);
    }
    return { contadas: pecas.length, alteradas, diferencaValor: Math.round(diferencaValor * 100) / 100 };
  });
  if (r.contadas === 0) return { erro: "Nenhuma peça encontrada" };
  revalidar();
  return { ok: true, ...r };
}
