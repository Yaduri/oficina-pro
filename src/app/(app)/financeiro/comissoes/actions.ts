"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { DIA_RE } from "@/lib/agenda-datas";
import { apurarComissoes, lancamentoTemBaixas, osJaFechadas } from "@/lib/comissoes";
import { categoriaSistema, criarLancamentos, reais } from "@/lib/financeiro";
import { rotuloPeriodo } from "@/lib/financeiro-relatorios";
import { getContexto } from "@/lib/oficina";

export type ComissaoState = { erro?: string; ok?: boolean } | undefined;

async function financeiro() {
  const ctx = await getContexto();
  return ctx.pode("financeiro") ? ctx : null;
}

function revalidar() {
  revalidatePath("/financeiro", "layout");
}

/**
 * Fecha a comissão do técnico no período: guarda as OS consideradas e cria a conta a pagar.
 * A apuração é refeita aqui (não confia na tela); `total` do formulário só confere se a tela está atualizada.
 */
export async function fecharComissao(tecnicoId: string, de: string, ate: string, _prev: ComissaoState, form: FormData): Promise<ComissaoState> {
  const ctx = await financeiro();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  if (!z.uuid().safeParse(tecnicoId).success || !DIA_RE.test(de) || !DIA_RE.test(ate) || de > ate) return { erro: "Período inválido" };
  const vencimento = String(form.get("vencimento") ?? "");
  if (!DIA_RE.test(vencimento)) return { erro: "Informe o vencimento" };
  const oficinaId = ctx.oficina.id;

  const { apuracao } = await apurarComissoes(oficinaId, de, ate, tecnicoId);
  const a = apuracao[0];
  if (!a || a.os.length === 0) return { erro: "Nada a fechar para este técnico no período" };
  if (String(a.total) !== String(form.get("total") ?? "")) return { erro: "Os valores mudaram desde que a tela foi aberta. Recarregue a página e confira." };
  if (a.total <= 0) return { erro: "A comissão do período está zerada" };
  const categoriaId = await categoriaSistema(oficinaId, "comissoes");

  const db = await getDb();
  const erro = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DB;
    // Evita fechar as mesmas OS duas vezes (dois cliques ou duas pessoas ao mesmo tempo)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`comissao:${tecnicoId}`}))`);
    const fechadas = await osJaFechadas(tx, oficinaId, tecnicoId);
    if (a.os.some((o) => fechadas.has(`${tecnicoId}:${o.id}`))) return "Parte destas OS já foi fechada. Recarregue a página.";

    const [lanc] = await criarLancamentos(
      tx,
      {
        oficinaId,
        tipo: "pagar",
        descricao: `Comissão ${a.tecnico.nome} ${rotuloPeriodo(de, ate)}`,
        categoriaId,
        tecnicoId,
        competencia: ate,
        criadoPor: ctx.userId,
      },
      [{ valor: a.total, vencimento }],
    );
    await tx.insert(schema.comissoesFechamentos).values({
      oficinaId,
      tecnicoId,
      de,
      ate,
      valor: reais(a.total),
      detalhes: a.os.map((o) => ({
        osId: o.id,
        numero: o.numero,
        entregueEm: o.entregueEm.toISOString(),
        servicos: o.servicos,
        pecas: o.pecas,
        comissao: o.comissao,
      })),
      lancamentoId: lanc.id,
      criadoPor: ctx.userId,
    });
    return null;
  });
  if (erro) return { erro };
  revalidar();
  return { ok: true };
}

/** Desfaz um fechamento cuja conta a pagar ainda não teve pagamento: apaga o fechamento e cancela a conta */
export async function desfazerFechamento(id: string): Promise<{ erro?: string }> {
  const ctx = await financeiro();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  if (!z.uuid().safeParse(id).success) return { erro: "Fechamento não encontrado" };
  const oficinaId = ctx.oficina.id;
  const { comissoesFechamentos: f, lancamentos } = schema;

  const db = await getDb();
  const erro = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DB;
    const [fech] = await tx
      .select()
      .from(f)
      .where(and(eq(f.id, id), eq(f.oficinaId, oficinaId)));
    if (!fech) return "Fechamento não encontrado";
    if (fech.lancamentoId) {
      if (await lancamentoTemBaixas(tx, fech.lancamentoId)) return "A comissão já foi paga (ou paga em parte). Estorne o pagamento em A pagar antes de desfazer.";
      await tx
        .update(lancamentos)
        .set({ status: "cancelado" })
        .where(and(eq(lancamentos.id, fech.lancamentoId), eq(lancamentos.oficinaId, oficinaId)));
    }
    await tx.delete(f).where(eq(f.id, fech.id));
    return null;
  });
  if (erro) return { erro };
  revalidar();
  return {};
}
