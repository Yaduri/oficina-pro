"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { parseValor } from "@/lib/utils";

export type CatalogoState = { erro?: string; ok?: boolean } | undefined;

/** "1h30", "1:30", "90", "1,5h" → minutos */
function lerTempo(v: string): number | null | undefined {
  const t = v.trim().toLowerCase().replace(/\s/g, "");
  if (!t) return null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{1,2})(?:h|:)(\d{1,2})?(?:min)?$/))) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  if ((m = t.match(/^(\d{1,2}(?:[.,]\d+)?)h$/))) return Math.round(Number(m[1].replace(",", ".")) * 60);
  if ((m = t.match(/^(\d{1,4})(?:min)?$/))) return Number(m[1]);
  return undefined;
}

const itemSchema = z.object({
  tipo: z.enum(["servico", "peca"]),
  codigo: z
    .string()
    .trim()
    .max(40, "Código muito longo")
    .transform((v) => v || null),
  descricao: z.string().trim().min(2, "Informe a descrição").max(200, "Descrição muito longa"),
  valor: z
    .string()
    .transform((v) => (v.trim() ? parseValor(v) : 0))
    .refine((n) => Number.isFinite(n) && n >= 0 && n < 10_000_000, "Valor inválido"),
  tempo: z
    .string()
    .transform(lerTempo)
    .refine((n) => n !== undefined && (n === null || (n > 0 && n <= 6000)), "Tempo inválido (ex.: 45, 1h30)"),
  codigoServicoMunicipal: z
    .string()
    .trim()
    .max(20, "Código municipal muito longo")
    .transform((v) => v || null),
});

const f = (form: FormData, k: string) => String(form.get(k) ?? "");

async function admin() {
  const ctx = await getContexto();
  return ctx.pode("configurar") ? ctx : null;
}

function revalidar() {
  revalidatePath("/configuracoes/catalogo");
  revalidatePath("/ordens-servico", "layout");
}

/** Cria (sem id) ou atualiza um item do catálogo */
export async function salvarItemCatalogo(id: string | null, _prev: CatalogoState, form: FormData): Promise<CatalogoState> {
  const ctx = await admin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const p = itemSchema.safeParse({
    tipo: f(form, "tipo"),
    codigo: f(form, "codigo"),
    descricao: f(form, "descricao"),
    valor: f(form, "valor"),
    tempo: f(form, "tempo"),
    codigoServicoMunicipal: f(form, "codigoServicoMunicipal"),
  });
  if (!p.success) return { erro: p.error.issues[0].message };
  const d = p.data;

  const db = await getDb();
  const c = schema.catalogoItens;
  if (d.codigo) {
    const filtros = [eq(c.oficinaId, ctx.oficina.id), eq(c.tipo, d.tipo), sql`lower(${c.codigo}) = lower(${d.codigo})`];
    if (id) filtros.push(ne(c.id, id));
    const [dup] = await db.select({ id: c.id }).from(c).where(and(...filtros));
    if (dup) return { erro: `Já existe um item com o código ${d.codigo}` };
  }

  const valores = {
    tipo: d.tipo,
    codigo: d.codigo,
    descricao: d.descricao,
    valor: d.valor.toFixed(2),
    tempoMinutos: d.tipo === "servico" ? d.tempo : null,
    codigoServicoMunicipal: d.tipo === "servico" ? d.codigoServicoMunicipal : null,
  };
  if (id) {
    if (!z.uuid().safeParse(id).success) return { erro: "Item não encontrado" };
    const res = await db
      .update(c)
      .set(valores)
      .where(and(eq(c.id, id), eq(c.oficinaId, ctx.oficina.id)))
      .returning({ id: c.id });
    if (res.length === 0) return { erro: "Item não encontrado" };
  } else {
    await db.insert(c).values({ oficinaId: ctx.oficina.id, ...valores });
  }
  revalidar();
  return { ok: true };
}

export async function alternarItemCatalogo(id: string, ativo: boolean) {
  const ctx = await admin();
  if (!ctx || !z.uuid().safeParse(id).success) return;
  const db = await getDb();
  const c = schema.catalogoItens;
  await db.update(c).set({ ativo }).where(and(eq(c.id, id), eq(c.oficinaId, ctx.oficina.id)));
  revalidar();
}

/** Remove do catálogo; itens já lançados nas OS não mudam */
export async function removerItemCatalogo(id: string) {
  const ctx = await admin();
  if (!ctx || !z.uuid().safeParse(id).success) return;
  const db = await getDb();
  const c = schema.catalogoItens;
  await db.delete(c).where(and(eq(c.id, id), eq(c.oficinaId, ctx.oficina.id)));
  revalidar();
}
