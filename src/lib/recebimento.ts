import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import {
  FORMAS,
  categoriaSistema,
  centavos,
  contaSugerida,
  criarLancamentos,
  dividirParcelas,
  ehForma,
  registrarBaixa,
  somarDiasData,
  somarMeses,
  type ContaFinanceira,
  type Forma,
} from "@/lib/financeiro";
import { calcularTotais } from "@/lib/os-total";
import { A_VISTA, COM_TAXA, COM_VENCIMENTO, PARCELAVEL, valorTaxa, type LinhaPagamentoForm } from "@/lib/recebimento-regras";
import { formatBRL, parseValor } from "@/lib/utils";

/*
 * Recebimento da OS (Fase 2.1). Regras contábeis:
 * - Cada linha de pagamento vira um lançamento "receber" por parcela, ligado à OS e ao cliente,
 *   com competência = dia da entrega e descrição "OS #N — PLACA".
 * - Categoria: "Serviços" quando o total de serviços ≥ peças, senão "Peças" (uma só por OS, para a DRE).
 * - À vista (dinheiro, PIX, débito, transferência): vencimento hoje e baixa automática na conta escolhida;
 *   no débito a taxa da maquininha vai na baixa (sai do valor que entra na conta).
 * - Crédito: uma parcela a cada 30 dias (D+30, D+60…), em aberto na conta escolhida (maquininha);
 *   a taxa prevista fica na observação de cada parcela e é informada na baixa, quando o dinheiro cai.
 * - Boleto e a prazo: parcelas em aberto, a 1ª no vencimento escolhido e as demais de mês em mês.
 * - "Receber depois": um único lançamento a prazo, vencendo em 30 dias.
 */

type OS = typeof schema.ordensServico.$inferSelect;
const { lancamentos, baixas, contasFinanceiras } = schema;

const brl = (c: number) => formatBRL(c / 100);
const nomeForma = (f: string | null) => (f && ehForma(f) ? FORMAS[f] : "Outro");

/** Totais da OS em centavos (itens recusados fora, desconto aplicado) */
export async function totaisDaOS(db: DB, os: OS) {
  const itens = await db.select().from(schema.osItens).where(eq(schema.osItens.osId, os.id));
  const t = calcularTotais(
    itens.map((i) => ({ tipo: i.tipo, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario), recusado: i.recusado })),
    { percentual: os.descontoPercentual != null ? Number(os.descontoPercentual) : null, valor: Number(os.descontoValor) },
  );
  return { total: centavos(t.total), pecas: centavos(t.pecas), servicos: centavos(t.servicos) };
}

/** Soma dos lançamentos a receber (não cancelados) já criados para a OS */
export async function lancadoNaOS(db: DB, oficinaId: string, osId: string) {
  const l = await db
    .select({ valor: lancamentos.valor })
    .from(lancamentos)
    .where(and(eq(lancamentos.oficinaId, oficinaId), eq(lancamentos.osId, osId), eq(lancamentos.tipo, "receber"), ne(lancamentos.status, "cancelado")));
  return l.reduce((s, x) => s + centavos(x.valor), 0);
}

/** Categoria do recebimento: serviços se pesam mais (ou igual), senão peças */
export async function categoriaDaOS(oficinaId: string, totais: { pecas: number; servicos: number }) {
  return categoriaSistema(oficinaId, totais.servicos >= totais.pecas ? "servicos" : "pecas");
}

/* ---------- Situação da OS (card, recibo) ---------- */

export async function situacaoRecebimento(oficinaId: string, os: OS) {
  const db = await getDb();
  const [totais, lista] = await Promise.all([
    totaisDaOS(db, os),
    db
      .select()
      .from(lancamentos)
      .where(and(eq(lancamentos.oficinaId, oficinaId), eq(lancamentos.osId, os.id), eq(lancamentos.tipo, "receber")))
      .orderBy(asc(lancamentos.criadoEm), asc(lancamentos.parcela)),
  ]);
  const ids = lista.map((l) => l.id);
  const pagamentos = ids.length
    ? await db
        .select({ baixa: baixas, conta: contasFinanceiras.nome })
        .from(baixas)
        .innerJoin(contasFinanceiras, eq(contasFinanceiras.id, baixas.contaId))
        .where(and(eq(baixas.oficinaId, oficinaId), inArray(baixas.lancamentoId, ids)))
        .orderBy(asc(baixas.data), asc(baixas.criadoEm))
    : [];
  const ativos = lista.filter((l) => l.status !== "cancelado");
  const lancado = ativos.reduce((s, l) => s + centavos(l.valor), 0);
  const recebido = ativos.reduce((s, l) => s + centavos(l.valorPago), 0);
  return {
    totais,
    lancamentos: lista,
    pagamentos: pagamentos.map((p) => ({
      ...p.baixa,
      conta: p.conta,
      /** O que o cliente pagou: principal + juros + multa − desconto */
      pagoCliente: centavos(p.baixa.valor) + centavos(p.baixa.juros) + centavos(p.baixa.multa) - centavos(p.baixa.desconto),
    })),
    lancado,
    recebido,
    aReceber: lancado - recebido,
    semLancamento: Math.max(totais.total - lancado, 0),
  };
}

/* ---------- Pagamento na entrega ---------- */

export type PlanoPagamento = {
  forma: Forma;
  valor: number;
  contaId: string;
  taxaPct: number;
  aVista: boolean;
  parcelas: { valor: number; vencimento: string }[];
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Valida as linhas do formulário e monta as parcelas. A soma tem que fechar com o valor a receber. */
export function planejarPagamentos(
  linhas: LinhaPagamentoForm[],
  aReceber: number,
  contas: ContaFinanceira[],
  hoje: string,
): { erro: string } | { planos: PlanoPagamento[] } {
  if (!Array.isArray(linhas) || linhas.length === 0) return { erro: "Informe como o cliente vai pagar" };
  if (linhas.length > 8) return { erro: "Use no máximo 8 formas de pagamento" };
  const planos: PlanoPagamento[] = [];
  for (const [n, l] of linhas.entries()) {
    const pos = linhas.length > 1 ? ` (pagamento ${n + 1})` : "";
    if (!l || typeof l !== "object" || !ehForma(String(l.forma))) return { erro: `Escolha a forma de pagamento${pos}` };
    const forma = l.forma as Forma;
    const v = parseValor(String(l.valor ?? ""));
    if (!Number.isFinite(v) || v <= 0) return { erro: `Informe o valor${pos}` };
    const valor = Math.round(v * 100);
    const conta = contas.find((c) => c.id === l.contaId && c.ativo);
    if (!conta) return { erro: `Escolha a conta${pos}` };
    const parcelas = PARCELAVEL.includes(forma) ? Math.trunc(Number(l.parcelas) || 1) : 1;
    if (parcelas < 1 || parcelas > 12) return { erro: `Parcelas devem ser de 1 a 12${pos}` };
    if (valor < parcelas) return { erro: `Valor pequeno demais para ${parcelas} parcelas${pos}` };
    let taxaPct = 0;
    if (COM_TAXA.includes(forma) && String(l.taxa ?? "").trim()) {
      taxaPct = parseValor(String(l.taxa));
      if (!Number.isFinite(taxaPct) || taxaPct < 0 || taxaPct >= 30) return { erro: `Taxa da maquininha inválida${pos}` };
    }
    let primeiro = hoje;
    if (COM_VENCIMENTO.includes(forma)) {
      primeiro = String(l.vencimento ?? "");
      if (!DATA.test(primeiro) || Number.isNaN(Date.parse(primeiro))) return { erro: `Informe o 1º vencimento${pos}` };
      if (primeiro < hoje) return { erro: `O vencimento não pode ser antes de hoje${pos}` };
    }
    const valores = dividirParcelas(valor, parcelas);
    const vencimento = (i: number) =>
      forma === "credito" ? somarDiasData(hoje, 30 * (i + 1)) : COM_VENCIMENTO.includes(forma) ? somarMeses(primeiro, i) : hoje;
    planos.push({
      forma,
      valor,
      contaId: conta.id,
      taxaPct,
      aVista: A_VISTA.includes(forma),
      parcelas: valores.map((p, i) => ({ valor: p, vencimento: vencimento(i) })),
    });
  }
  const soma = planos.reduce((s, p) => s + p.valor, 0);
  if (soma !== aReceber) {
    return {
      erro: `Os pagamentos somam ${brl(soma)}, mas o valor a receber é ${brl(aReceber)}. ${soma < aReceber ? "Para deixar o resto para depois, use “A prazo (fiado)”." : "Ajuste os valores."}`,
    };
  }
  return { planos };
}

/** "Receber depois": tudo a prazo, vencendo em 30 dias */
export function planoReceberDepois(aReceber: number, contas: ContaFinanceira[], hoje: string): PlanoPagamento {
  const conta = contaSugerida(contas, "a_prazo");
  return { forma: "a_prazo", valor: aReceber, contaId: conta.id, taxaPct: 0, aVista: false, parcelas: [{ valor: aReceber, vencimento: somarDiasData(hoje, 30) }] };
}

/** Grava os lançamentos (e as baixas do que é à vista). Lança erro para desfazer a transação. */
export async function lancarPagamentos(
  tx: DB,
  d: {
    oficinaId: string;
    os: OS;
    placa: string;
    categoriaId: string | null;
    planos: PlanoPagamento[];
    hoje: string;
    userId: string;
  },
) {
  for (const p of d.planos) {
    const taxaTotal = COM_TAXA.includes(p.forma) ? valorTaxa(p.valor, p.taxaPct) : 0;
    const taxas = dividirParcelas(taxaTotal, p.parcelas.length);
    const criados = await criarLancamentos(
      tx,
      {
        oficinaId: d.oficinaId,
        tipo: "receber",
        descricao: `OS #${d.os.numero} — ${d.placa}`,
        categoriaId: d.categoriaId,
        contaId: p.contaId,
        clienteId: d.os.clienteId,
        osId: d.os.id,
        forma: p.forma,
        competencia: d.hoje,
        criadoPor: d.userId,
      },
      p.parcelas,
    );
    for (const [i, l] of criados.entries()) {
      if (p.aVista) {
        const r = await registrarBaixa(tx, {
          oficinaId: d.oficinaId,
          lancamentoId: l.id,
          contaId: p.contaId,
          data: d.hoje,
          valor: centavos(l.valor),
          taxa: taxas[i],
          forma: p.forma,
          criadoPor: d.userId,
        });
        if ("erro" in r) throw new Error(r.erro);
      } else if (taxas[i] > 0) {
        // Crédito: taxa só na baixa, quando a maquininha repassar
        await tx
          .update(lancamentos)
          .set({ observacao: `Taxa prevista da maquininha: ${brl(taxas[i])} (${p.taxaPct.toLocaleString("pt-BR")}%)` })
          .where(eq(lancamentos.id, l.id));
      }
    }
  }
}

/** Texto do histórico: "Recebeu R$ 420,00 (PIX R$ 300,00, Dinheiro R$ 120,00); a receber R$ 300,00 (Cartão de crédito 3x)" */
export function resumoPagamentos(planos: PlanoPagamento[]) {
  const desc = (p: PlanoPagamento) =>
    `${FORMAS[p.forma]}${p.parcelas.length > 1 ? ` ${p.parcelas.length}x` : ""} ${brl(p.valor)}`;
  const agora = planos.filter((p) => p.aVista);
  const depois = planos.filter((p) => !p.aVista);
  const partes: string[] = [];
  if (agora.length) partes.push(`Recebeu ${brl(agora.reduce((s, p) => s + p.valor, 0))} (${agora.map(desc).join(", ")})`);
  if (depois.length) partes.push(`${agora.length ? "a" : "A"} receber ${brl(depois.reduce((s, p) => s + p.valor, 0))} (${depois.map(desc).join(", ")})`);
  return partes.join("; ");
}

export { nomeForma };
