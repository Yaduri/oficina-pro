"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { centavos, criarLancamentos, hojeSP, movimentoDaBaixa, reais, registrarBaixa } from "@/lib/financeiro";
import { FOLGA_DIAS, esperadoDoCaixa, sessaoAberta } from "@/lib/financeiro-caixa";
import { lerOfx } from "@/lib/ofx";
import { DIA_RE } from "@/lib/agenda-datas";
import { parseValor } from "@/lib/utils";

export type CaixaState = { erro?: string; ok?: boolean; msg?: string } | undefined;

const { contasFinanceiras: contas, transferencias, caixaSessoes, extratoItens, baixas, lancamentos, categoriasFinanceiras } = schema;
const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const uuid = (v: string) => z.uuid().safeParse(v).success;

async function ctxFin() {
  const ctx = await getContexto();
  return ctx.pode("financeiro") ? ctx : null;
}

function revalidar() {
  revalidatePath("/financeiro", "layout");
}

/** Valor em reais digitado → centavos (NaN se inválido) */
function lerCentavos(v: string) {
  const n = parseValor(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

async function contaDaOficina(db: DB, oficinaId: string, id: string) {
  if (!uuid(id)) return null;
  const [c] = await db.select().from(contas).where(and(eq(contas.id, id), eq(contas.oficinaId, oficinaId)));
  return c ?? null;
}

/* ---------- Transferência ---------- */

export async function transferir(_prev: CaixaState, form: FormData): Promise<CaixaState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const de = f(form, "deContaId");
  const para = f(form, "paraContaId");
  const valor = lerCentavos(f(form, "valor"));
  const data = f(form, "data") || hojeSP();
  const descricao = f(form, "descricao").slice(0, 200) || null;
  if (!de || !para) return { erro: "Escolha as duas contas" };
  if (de === para) return { erro: "Escolha contas diferentes" };
  if (!(valor > 0) || valor >= 1_000_000_000) return { erro: "Informe um valor maior que zero" };
  if (!DIA_RE.test(data)) return { erro: "Data inválida" };

  const db = await getDb();
  const [cDe, cPara] = await Promise.all([contaDaOficina(db, ctx.oficina.id, de), contaDaOficina(db, ctx.oficina.id, para)]);
  if (!cDe || !cPara) return { erro: "Conta não encontrada" };
  if (!cDe.ativo || !cPara.ativo) return { erro: "Conta desativada" };

  await db.insert(transferencias).values({
    oficinaId: ctx.oficina.id,
    deContaId: de,
    paraContaId: para,
    valor: reais(valor),
    data,
    descricao,
    criadoPor: ctx.userId,
  });
  revalidar();
  return { ok: true };
}

/** Exclui uma transferência lançada por engano (desfaz a conciliação, se houver) */
export async function removerTransferencia(id: string) {
  const ctx = await ctxFin();
  if (!ctx || !uuid(id)) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [t] = await tx
      .select({ id: transferencias.id })
      .from(transferencias)
      .where(and(eq(transferencias.id, id), eq(transferencias.oficinaId, ctx.oficina.id)));
    if (!t) return;
    await tx.update(extratoItens).set({ transferenciaId: null }).where(eq(extratoItens.transferenciaId, id));
    await tx.delete(transferencias).where(eq(transferencias.id, id));
  });
  revalidar();
}

/* ---------- Caixa do dia ---------- */

export async function abrirCaixa(contaId: string, _prev: CaixaState, form: FormData): Promise<CaixaState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const valor = lerCentavos(f(form, "valorAbertura") || "0");
  if (!(valor >= 0) || valor >= 1_000_000_000) return { erro: "Valor de abertura inválido" };

  const db = await getDb();
  const conta = await contaDaOficina(db, ctx.oficina.id, contaId);
  if (!conta || conta.tipo !== "caixa") return { erro: "Conta de caixa não encontrada" };
  if (!conta.ativo) return { erro: "Conta desativada" };
  if (await sessaoAberta(db, ctx.oficina.id, contaId)) return { erro: "O caixa já está aberto" };

  await db.insert(caixaSessoes).values({
    oficinaId: ctx.oficina.id,
    contaId,
    abertoPor: ctx.userId,
    valorAbertura: reais(valor),
    observacao: f(form, "observacao").slice(0, 500) || null,
  });
  revalidar();
  return { ok: true };
}

export async function fecharCaixa(sessaoId: string, _prev: CaixaState, form: FormData): Promise<CaixaState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  if (!uuid(sessaoId)) return { erro: "Caixa não encontrado" };
  const txt = f(form, "valorContado");
  if (!txt) return { erro: "Informe quanto tem na gaveta" };
  const contado = lerCentavos(txt);
  if (!(contado >= 0) || contado >= 1_000_000_000) return { erro: "Valor contado inválido" };

  const db = await getDb();
  const [s] = await db
    .select()
    .from(caixaSessoes)
    .where(and(eq(caixaSessoes.id, sessaoId), eq(caixaSessoes.oficinaId, ctx.oficina.id), isNull(caixaSessoes.fechadoEm)));
  if (!s) return { erro: "Este caixa já foi fechado" };

  const { esperado } = await esperadoDoCaixa(db, ctx.oficina.id, s);
  const obs = f(form, "observacao").slice(0, 500);
  if (contado !== esperado && !obs) return { erro: "Há diferença no caixa: explique na observação" };

  await db
    .update(caixaSessoes)
    .set({
      fechadoEm: new Date(),
      fechadoPor: ctx.userId,
      valorEsperado: reais(esperado),
      valorContado: reais(contado),
      observacao: [s.observacao, obs].filter(Boolean).join("\n") || null,
    })
    .where(and(eq(caixaSessoes.id, s.id), isNull(caixaSessoes.fechadoEm)));
  revalidar();
  return { ok: true };
}

/* ---------- Conciliação OFX ---------- */

/** Recebe o texto do arquivo (lido no navegador) e grava as linhas novas do extrato */
export async function importarOfx(contaId: string, texto: string): Promise<CaixaState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  if (typeof texto !== "string" || !texto.trim()) return { erro: "Arquivo vazio" };
  const db = await getDb();
  const conta = await contaDaOficina(db, ctx.oficina.id, contaId);
  if (!conta || conta.tipo !== "banco") return { erro: "Conta bancária não encontrada" };

  let lido;
  try {
    lido = lerOfx(texto);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível ler o arquivo" };
  }
  // FITIDs repetidos no mesmo arquivo contam uma vez
  const unicas = [...new Map(lido.transacoes.map((t) => [t.fitid, t])).values()];
  if (unicas.length === 0) return { erro: "Nenhum lançamento encontrado no arquivo" };

  let novas = 0;
  for (let i = 0; i < unicas.length; i += 500) {
    const res = await db
      .insert(extratoItens)
      .values(
        unicas.slice(i, i + 500).map((t) => ({
          oficinaId: ctx.oficina.id,
          contaId,
          fitid: t.fitid,
          data: t.data,
          valor: reais(t.valor),
          descricao: t.descricao,
        })),
      )
      .onConflictDoNothing({ target: [extratoItens.contaId, extratoItens.fitid] })
      .returning({ id: extratoItens.id });
    novas += res.length;
  }
  revalidar();
  const repetidas = unicas.length - novas;
  const partes = [
    novas === 1 ? "1 lançamento novo" : `${novas} lançamentos novos`,
    repetidas ? `${repetidas} já importado${repetidas > 1 ? "s" : ""} antes` : null,
    lido.invalidas ? `${lido.invalidas} ignorado${lido.invalidas > 1 ? "s" : ""} por erro no arquivo` : null,
  ];
  return { ok: true, msg: partes.filter(Boolean).join(" · ") };
}

async function itemPendente(db: DB, oficinaId: string, itemId: string) {
  if (!uuid(itemId)) return null;
  const [i] = await db.select().from(extratoItens).where(and(eq(extratoItens.id, itemId), eq(extratoItens.oficinaId, oficinaId)));
  if (!i || i.baixaId || i.transferenciaId || i.ignorado) return null;
  return i;
}

const diasEntre = (a: string, b: string) => Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000;

/** Liga a linha do banco a um pagamento ("b:id") ou transferência ("t:id") do sistema */
export async function conciliar(itemId: string, chave: string): Promise<CaixaState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const db = await getDb();
  const item = await itemPendente(db, ctx.oficina.id, itemId);
  if (!item) return { erro: "Linha já conciliada ou não encontrada" };
  const [tipo, id] = chave.split(":");
  if (!uuid(id ?? "")) return { erro: "Escolha o lançamento" };
  const valor = centavos(item.valor);

  if (tipo === "b") {
    const [b] = await db
      .select({ b: baixas, tipo: lancamentos.tipo })
      .from(baixas)
      .innerJoin(lancamentos, eq(lancamentos.id, baixas.lancamentoId))
      .where(and(eq(baixas.id, id), eq(baixas.oficinaId, ctx.oficina.id), eq(baixas.contaId, item.contaId), isNull(baixas.estornadaEm)));
    if (!b) return { erro: "Pagamento não encontrado nesta conta" };
    if (movimentoDaBaixa(b.tipo, b.b) !== valor) return { erro: "O valor não confere com a linha do banco" };
    if (diasEntre(b.b.data, item.data) > FOLGA_DIAS) return { erro: "A data está longe demais da linha do banco" };
    const [usado] = await db.select({ id: extratoItens.id }).from(extratoItens).where(eq(extratoItens.baixaId, id));
    if (usado) return { erro: "Esse pagamento já foi conciliado com outra linha" };
    await db.update(extratoItens).set({ baixaId: id }).where(eq(extratoItens.id, item.id));
  } else if (tipo === "t") {
    const [t] = await db
      .select()
      .from(transferencias)
      .where(
        and(
          eq(transferencias.id, id),
          eq(transferencias.oficinaId, ctx.oficina.id),
          or(eq(transferencias.deContaId, item.contaId), eq(transferencias.paraContaId, item.contaId)),
        ),
      );
    if (!t) return { erro: "Transferência não encontrada nesta conta" };
    const sinal = t.paraContaId === item.contaId ? 1 : -1;
    if (sinal * centavos(t.valor) !== valor) return { erro: "O valor não confere com a linha do banco" };
    if (diasEntre(t.data, item.data) > FOLGA_DIAS) return { erro: "A data está longe demais da linha do banco" };
    const [usado] = await db.select({ id: extratoItens.id }).from(extratoItens).where(eq(extratoItens.transferenciaId, id));
    if (usado) return { erro: "Essa transferência já foi conciliada com outra linha" };
    await db.update(extratoItens).set({ transferenciaId: id }).where(eq(extratoItens.id, item.id));
  } else {
    return { erro: "Escolha o lançamento" };
  }
  revalidar();
  return { ok: true };
}

/** Ignora (tarifa já lançada de outro jeito, linha informativa…) ou volta a pendente */
export async function ignorarItem(itemId: string, ignorar: boolean) {
  const ctx = await ctxFin();
  if (!ctx || !uuid(itemId)) return;
  const db = await getDb();
  await db
    .update(extratoItens)
    .set(ignorar ? { ignorado: true } : { ignorado: false, baixaId: null, transferenciaId: null })
    .where(and(eq(extratoItens.id, itemId), eq(extratoItens.oficinaId, ctx.oficina.id)));
  revalidar();
}

/** Cria um lançamento já pago na data da linha do banco e concilia com ela */
export async function criarDoExtrato(itemId: string, _prev: CaixaState, form: FormData): Promise<CaixaState> {
  const ctx = await ctxFin();
  if (!ctx) return { erro: "Seu usuário não tem permissão para isso" };
  const db = await getDb();
  const item = await itemPendente(db, ctx.oficina.id, itemId);
  if (!item) return { erro: "Linha já conciliada ou não encontrada" };
  const valor = centavos(item.valor);
  if (valor === 0) return { erro: "Linha com valor zero: use Ignorar" };
  const tipo = valor > 0 ? "receber" : "pagar";

  const descricao = f(form, "descricao").slice(0, 200);
  if (descricao.length < 2) return { erro: "Informe a descrição" };
  const categoriaId = f(form, "categoriaId");
  if (!uuid(categoriaId)) return { erro: "Escolha a categoria" };
  const [cat] = await db
    .select({ id: categoriasFinanceiras.id })
    .from(categoriasFinanceiras)
    .where(
      and(
        eq(categoriasFinanceiras.id, categoriaId),
        eq(categoriasFinanceiras.oficinaId, ctx.oficina.id),
        eq(categoriasFinanceiras.tipo, tipo === "receber" ? "receita" : "despesa"),
      ),
    );
  if (!cat) return { erro: "Categoria não encontrada" };

  try {
    await db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as DB;
      const [l] = await criarLancamentos(
        tx,
        {
          oficinaId: ctx.oficina.id,
          tipo,
          descricao,
          categoriaId,
          contaId: item.contaId,
          forma: "transferencia",
          observacao: item.descricao ? `Extrato do banco: ${item.descricao}` : "Criado pela conciliação do extrato",
          criadoPor: ctx.userId,
        },
        [{ valor: Math.abs(valor), vencimento: item.data }],
      );
      const r = await registrarBaixa(tx, {
        oficinaId: ctx.oficina.id,
        lancamentoId: l.id,
        contaId: item.contaId,
        data: item.data,
        valor: Math.abs(valor),
        forma: "transferencia",
        criadoPor: ctx.userId,
      });
      if ("erro" in r) throw new Error(r.erro);
      await tx.update(extratoItens).set({ baixaId: r.id }).where(eq(extratoItens.id, item.id));
    });
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível criar o lançamento" };
  }
  revalidar();
  return { ok: true };
}
