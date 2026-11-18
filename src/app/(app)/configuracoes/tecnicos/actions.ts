"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { parseValor } from "@/lib/utils";

export type TecnicoState = { erro?: string; ok?: boolean } | undefined;

const dados = z.object({
  nome: z.string().trim().min(2, "Informe o nome do técnico").max(80, "Nome muito longo"),
});

/** Campo de comissão: vazio ou zero = sem comissão (null); senão o número em texto para o banco */
function lerComissao(form: FormData, campo: string, rotulo: string, max: number): { valor: string | null } | { erro: string } {
  const bruto = String(form.get(campo) ?? "").replace("%", "").trim();
  if (!bruto) return { valor: null };
  const n = parseValor(bruto);
  if (!Number.isFinite(n) || n < 0 || n > max) return { erro: `${rotulo} inválido` };
  return { valor: n === 0 ? null : n.toFixed(2) };
}

async function admin() {
  const ctx = await getContexto();
  return ctx.pode("configurar") ? ctx : null;
}

function revalidar() {
  revalidatePath("/configuracoes/tecnicos");
  revalidatePath("/ordens-servico", "layout");
  revalidatePath("/financeiro/comissoes");
}

/** Cria (sem id) ou atualiza um técnico */
export async function salvarTecnico(id: string | null, _prev: TecnicoState, form: FormData): Promise<TecnicoState> {
  const ctx = await admin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const p = dados.safeParse({ nome: String(form.get("nome") ?? "") });
  if (!p.success) return { erro: p.error.issues[0].message };
  const servico = lerComissao(form, "comissaoServicoPct", "Percentual sobre serviços", 100);
  const peca = lerComissao(form, "comissaoPecaPct", "Percentual sobre peças", 100);
  const fixa = lerComissao(form, "comissaoFixaOs", "Valor fixo por OS", 99_999);
  for (const r of [servico, peca, fixa]) if ("erro" in r) return { erro: r.erro };
  const valores = {
    ...p.data,
    comissaoServicoPct: "valor" in servico ? servico.valor : null,
    comissaoPecaPct: "valor" in peca ? peca.valor : null,
    comissaoFixaOs: "valor" in fixa ? fixa.valor : null,
  };

  const db = await getDb();
  const t = schema.tecnicos;
  const filtros = [eq(t.oficinaId, ctx.oficina.id), sql`lower(${t.nome}) = lower(${p.data.nome})`];
  if (id) filtros.push(ne(t.id, id));
  const [dup] = await db.select({ id: t.id }).from(t).where(and(...filtros));
  if (dup) return { erro: `Já existe um técnico chamado ${p.data.nome}` };

  if (id) {
    if (!z.uuid().safeParse(id).success) return { erro: "Técnico não encontrado" };
    const res = await db
      .update(t)
      .set(valores)
      .where(and(eq(t.id, id), eq(t.oficinaId, ctx.oficina.id)))
      .returning({ id: t.id });
    if (res.length === 0) return { erro: "Técnico não encontrado" };
  } else {
    await db.insert(t).values({ oficinaId: ctx.oficina.id, ...valores });
  }
  revalidar();
  return { ok: true };
}

export async function alternarTecnico(id: string, ativo: boolean) {
  const ctx = await admin();
  if (!ctx || !z.uuid().safeParse(id).success) return;
  const db = await getDb();
  await db
    .update(schema.tecnicos)
    .set({ ativo })
    .where(and(eq(schema.tecnicos.id, id), eq(schema.tecnicos.oficinaId, ctx.oficina.id)));
  revalidar();
}

/** Exclui se nunca foi responsável por uma OS; senão, só desativa */
export async function excluirTecnico(id: string): Promise<{ desativado?: boolean } | undefined> {
  const ctx = await admin();
  if (!ctx || !z.uuid().safeParse(id).success) return;
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.ordensServico)
    .where(and(eq(schema.ordensServico.oficinaId, ctx.oficina.id), eq(schema.ordensServico.responsavelId, id)));
  const onde = and(eq(schema.tecnicos.id, id), eq(schema.tecnicos.oficinaId, ctx.oficina.id));
  if (n > 0) {
    await db.update(schema.tecnicos).set({ ativo: false }).where(onde);
    revalidar();
    return { desativado: true };
  }
  await db.delete(schema.tecnicos).where(onde);
  revalidar();
}
