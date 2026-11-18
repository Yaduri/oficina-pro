"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { ehUuid, osDaOficina, registrarEvento } from "@/lib/os-acesso";
import { FORMAS, centavos, criarLancamentos, ehForma, estornarBaixa, hojeSP, listarContas, registrarBaixa } from "@/lib/financeiro";
import { categoriaDaOS, lancadoNaOS, totaisDaOS } from "@/lib/recebimento";
import { COM_TAXA, valorTaxa } from "@/lib/recebimento-regras";
import { formatBRL, parseValor } from "@/lib/utils";

export type RecebimentoState = { erro?: string; ok?: boolean } | undefined;

const SEM_PERMISSAO = { erro: "OS não encontrada ou seu usuário não tem permissão" };
const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const brl = (c: number) => formatBRL(c / 100);

function revalidar(osId: string) {
  revalidatePath(`/ordens-servico/${osId}`);
  revalidatePath("/financeiro", "layout");
  revalidatePath("/inicio");
}

/**
 * "Registrar pagamento" de uma OS entregue: baixa numa parcela em aberto da OS
 * ou, se o valor ainda não foi lançado ("novo"), cria o lançamento e já dá a baixa.
 */
export async function registrarPagamentoOS(osId: string, _prev: RecebimentoState, form: FormData): Promise<RecebimentoState> {
  const r = await osDaOficina(osId, "fecharOS");
  if (!r || !r.ctx.pode("verValores")) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  if (os.status !== "entregue") return { erro: "Registre o pagamento na entrega do veículo" };

  const forma = f(form, "forma");
  if (!ehForma(forma)) return { erro: "Escolha a forma de pagamento" };
  const v = parseValor(f(form, "valor"));
  if (!Number.isFinite(v) || v <= 0) return { erro: "Informe o valor" };
  const valor = Math.round(v * 100);
  const data = f(form, "data");
  const hoje = hojeSP();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) return { erro: "Data inválida" };
  if (data > hoje) return { erro: "A data do pagamento não pode ser no futuro" };
  const contas = await listarContas(ctx.oficina.id);
  const conta = contas.find((c) => c.id === f(form, "contaId"));
  if (!conta) return { erro: "Escolha a conta" };
  let taxaPct = 0;
  if (COM_TAXA.includes(forma) && f(form, "taxa")) {
    taxaPct = parseValor(f(form, "taxa"));
    if (!Number.isFinite(taxaPct) || taxaPct < 0 || taxaPct >= 30) return { erro: "Taxa da maquininha inválida" };
  }
  const taxa = COM_TAXA.includes(forma) ? valorTaxa(valor, taxaPct) : 0;

  const alvo = f(form, "lancamentoId");
  let lancamentoId: string | null = null;
  let novo: { categoriaId: string | null; placa: string } | null = null;
  if (alvo === "novo") {
    const totais = await totaisDaOS(db, os);
    const livre = totais.total - (await lancadoNaOS(db, ctx.oficina.id, os.id));
    if (valor > livre) return { erro: `O valor passa do que falta lançar da OS (${brl(Math.max(livre, 0))})` };
    const [veic] = await db.select({ placa: schema.veiculos.placa }).from(schema.veiculos).where(eq(schema.veiculos.id, os.veiculoId));
    novo = { categoriaId: await categoriaDaOS(ctx.oficina.id, totais), placa: veic?.placa ?? "" };
  } else {
    if (!ehUuid(alvo)) return { erro: "Escolha o que está sendo pago" };
    const [l] = await db
      .select({ id: schema.lancamentos.id })
      .from(schema.lancamentos)
      .where(
        and(
          eq(schema.lancamentos.id, alvo),
          eq(schema.lancamentos.oficinaId, ctx.oficina.id),
          eq(schema.lancamentos.osId, os.id),
          eq(schema.lancamentos.tipo, "receber"),
        ),
      );
    if (!l) return { erro: "Parcela não encontrada" };
    lancamentoId = l.id;
  }

  let erro: string | undefined;
  try {
    await db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as DB;
      let id = lancamentoId;
      if (novo) {
        const [l] = await criarLancamentos(
          tx,
          {
            oficinaId: ctx.oficina.id,
            tipo: "receber",
            descricao: `OS #${os.numero} — ${novo.placa}`,
            categoriaId: novo.categoriaId,
            contaId: conta.id,
            clienteId: os.clienteId,
            osId: os.id,
            forma,
            // Competência da OS = dia da entrega
            competencia: os.entregueEm ? os.entregueEm.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : data,
            criadoPor: ctx.userId,
          },
          [{ valor, vencimento: data }],
        );
        id = l.id;
      }
      const b = await registrarBaixa(tx, {
        oficinaId: ctx.oficina.id,
        lancamentoId: id!,
        contaId: conta.id,
        data,
        valor,
        taxa,
        forma,
        criadoPor: ctx.userId,
      });
      if ("erro" in b) {
        erro = b.erro;
        throw new Error(b.erro);
      }
    });
  } catch (e) {
    return { erro: erro ?? (e instanceof Error ? e.message : "Não foi possível registrar o pagamento") };
  }

  await registrarEvento(db, ctx.oficina.id, os.id, `Recebeu ${brl(valor)} (${FORMAS[forma]})`, ctx);
  revalidar(os.id);
  return { ok: true };
}

/** Estorna um pagamento da OS (só o financeiro): o valor volta a ficar em aberto */
export async function estornarPagamentoOS(osId: string, baixaId: string): Promise<RecebimentoState> {
  if (!ehUuid(baixaId)) return SEM_PERMISSAO;
  const r = await osDaOficina(osId, "financeiro");
  if (!r) return SEM_PERMISSAO;
  const { db, ctx, os } = r;
  const [b] = await db
    .select({ id: schema.baixas.id, valor: schema.baixas.valor, forma: schema.baixas.forma })
    .from(schema.baixas)
    .innerJoin(schema.lancamentos, eq(schema.lancamentos.id, schema.baixas.lancamentoId))
    .where(and(eq(schema.baixas.id, baixaId), eq(schema.baixas.oficinaId, ctx.oficina.id), eq(schema.lancamentos.osId, os.id)));
  if (!b) return { erro: "Pagamento não encontrado" };
  const res = await db.transaction(async (tx) => estornarBaixa(tx as unknown as DB, ctx.oficina.id, b.id, ctx.userId));
  if ("erro" in res) return { erro: res.erro };
  await registrarEvento(
    db,
    ctx.oficina.id,
    os.id,
    `Estornou o pagamento de ${brl(centavos(b.valor))}${b.forma && ehForma(b.forma) ? ` (${FORMAS[b.forma]})` : ""}`,
    ctx,
  );
  revalidar(os.id);
  return { ok: true };
}
