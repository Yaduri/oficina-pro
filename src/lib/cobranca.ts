import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, getDbSistema, schema, type DB } from "@/db";
import { asaas, ambienteDaChave, ErroAsaas, formaDoTipo, STATUS_DESFEITO, STATUS_PAGO, type EventoAsaas, type PagamentoAsaas, type TipoCobranca } from "@/lib/asaas";
import { cifrar, decifrar, iguais, tokenAleatorio } from "@/lib/cripto";
import { centavos, estornarBaixa, garantirPadroes, hojeSP, reais, registrarBaixa } from "@/lib/financeiro";

/*
 * Cobrança online (Fase 2.5) com o Asaas. Regras:
 * - Cada oficina usa a própria conta do Asaas (chave de API cifrada em gateways_pagamento).
 * - Uma cobrança pertence a uma conta a receber (lançamento) e cobra o que está em aberto nele.
 * - Só uma cobrança pendente por lançamento.
 * - Pagamento confirmado (webhook ou "Atualizar") vira baixa na conta financeira "Asaas",
 *   com a tarifa do Asaas (valor − valor líquido) em taxa. Estorno/chargeback estorna a baixa.
 */

const { gatewaysPagamento: gateways, cobrancas, lancamentos, clientes, contasFinanceiras: contas } = schema;

export type Gateway = typeof gateways.$inferSelect;
export type Cobranca = typeof cobrancas.$inferSelect;

export const TIPOS_COBRANCA: Record<TipoCobranca, string> = {
  UNDEFINED: "Cliente escolhe (PIX, boleto ou cartão)",
  PIX: "PIX",
  BOLETO: "Boleto (com PIX)",
  CREDIT_CARD: "Cartão de crédito",
};
export const ehTipoCobranca = (v: string): v is TipoCobranca => Object.hasOwn(TIPOS_COBRANCA, v);

export const SITUACAO_COBRANCA = {
  pendente: { label: "Aguardando pagamento", tom: "warn" },
  pago: { label: "Paga", tom: "ok" },
  cancelada: { label: "Cancelada", tom: "neutro" },
  estornada: { label: "Estornada", tom: "danger" },
} as const;

/* ---------- Configuração ---------- */

/** `conexao`: o webhook (sem login) passa a do sistema; sem ela, a do usuário logado */
export async function gatewayDaOficina(oficinaId: string, conexao?: DB) {
  const db = conexao ?? (await getDb());
  const [g] = await db.select().from(gateways).where(eq(gateways.oficinaId, oficinaId));
  return g ?? null;
}

/** Dados seguros para a tela (sem a chave) */
export async function resumoGateway(oficinaId: string) {
  const g = await gatewayDaOficina(oficinaId);
  if (!g) return null;
  return {
    ambiente: g.ambiente,
    apiKeyFinal: g.apiKeyFinal,
    titular: g.titular,
    contaId: g.contaId,
    webhookAtivo: !!g.webhookId,
    ativo: g.ativo,
    atualizadoEm: g.atualizadoEm,
  };
}

const api = (g: Gateway) => asaas(g.ambiente, decifrar(g.apiKeyCifrada));

/** Endereço que o Asaas chama; só https público funciona (localhost não recebe webhook) */
export const urlWebhook = (base: string, oficinaId: string) => `${base}/api/webhooks/asaas/${oficinaId}`;
export const webhookPossivel = (base: string) => base.startsWith("https://") && !/\/\/(localhost|127\.)/.test(base);

/**
 * Valida a chave, guarda cifrada, cria a conta financeira "Asaas" (se faltar)
 * e registra o webhook. Retorna aviso quando o webhook não pôde ser criado.
 */
export async function conectarAsaas(p: { oficinaId: string; apiKey: string; email: string; urlBase: string }) {
  const apiKey = p.apiKey.trim();
  const ambiente = ambienteDaChave(apiKey);
  if (!ambiente) return { erro: "Chave não reconhecida. Copie a chave completa no Asaas, começando por $aact_." };
  const cliente = asaas(ambiente, apiKey);
  let titular: string | null = null;
  try {
    await cliente.saldo();
    const info = await cliente.conta().catch(() => null);
    titular = info?.companyName || info?.name || null;
  } catch (e) {
    return { erro: e instanceof ErroAsaas ? e.message : "Não foi possível validar a chave" };
  }

  await garantirPadroes(p.oficinaId);
  const db = await getDb();
  const atual = await gatewayDaOficina(p.oficinaId);
  const token = atual?.webhookToken ?? tokenAleatorio();

  // Conta financeira onde caem os recebimentos
  let contaId = atual?.contaId ?? null;
  if (!contaId) {
    const [existente] = await db
      .select({ id: contas.id })
      .from(contas)
      .where(and(eq(contas.oficinaId, p.oficinaId), eq(contas.nome, "Asaas")));
    contaId =
      existente?.id ??
      (await db.insert(contas).values({ oficinaId: p.oficinaId, nome: "Asaas", tipo: "banco", saldoInicialEm: hojeSP() }).returning({ id: contas.id }))[0]
        .id;
  }

  // Webhook (troca de conta/ambiente: o antigo fica na conta antiga e é removido se der)
  let webhookId: string | null = null;
  let aviso: string | undefined;
  const mesmaChave = atual && decifrar(atual.apiKeyCifrada) === apiKey;
  if (atual?.webhookId && !mesmaChave) await api(atual).removerWebhook(atual.webhookId).catch(() => undefined);
  if (webhookPossivel(p.urlBase)) {
    const w = { url: urlWebhook(p.urlBase, p.oficinaId), email: p.email, authToken: token };
    try {
      webhookId =
        mesmaChave && atual?.webhookId
          ? (await cliente.atualizarWebhook(atual.webhookId, w).catch(() => cliente.criarWebhook(w))).id
          : (await cliente.criarWebhook(w)).id;
    } catch (e) {
      aviso = `Chave salva, mas o aviso automático de pagamento não foi criado: ${e instanceof Error ? e.message : "erro"}. Use "Atualizar" na cobrança para conferir.`;
    }
  } else {
    aviso = "Chave salva. Este endereço não é público, então o Asaas não consegue avisar os pagamentos: use \"Atualizar\" na cobrança.";
  }

  const valores = {
    ambiente,
    apiKeyCifrada: cifrar(apiKey),
    apiKeyFinal: apiKey.slice(-4),
    webhookToken: token,
    webhookId,
    contaId,
    titular,
    ativo: true,
    atualizadoEm: new Date(),
  };
  if (atual) await db.update(gateways).set(valores).where(eq(gateways.id, atual.id));
  else await db.insert(gateways).values({ oficinaId: p.oficinaId, ...valores });
  return { ok: true as const, aviso };
}

export async function desconectarAsaas(oficinaId: string) {
  const g = await gatewayDaOficina(oficinaId);
  if (!g) return;
  if (g.webhookId) await api(g).removerWebhook(g.webhookId).catch(() => undefined);
  const db = await getDb();
  await db.delete(gateways).where(eq(gateways.id, g.id));
}

/* ---------- Cobranças ---------- */

export async function cobrancasDoLancamento(oficinaId: string, lancamentoId: string) {
  const db = await getDb();
  return db
    .select()
    .from(cobrancas)
    .where(and(eq(cobrancas.oficinaId, oficinaId), eq(cobrancas.lancamentoId, lancamentoId)))
    .orderBy(desc(cobrancas.criadoEm));
}

/**
 * Gera a cobrança do valor em aberto do lançamento.
 * `documento` (CPF/CNPJ só dígitos) é obrigatório no Asaas; se o cliente não tiver, é salvo nele.
 */
export async function gerarCobranca(p: {
  oficinaId: string;
  lancamentoId: string;
  tipo: TipoCobranca;
  vencimento?: string;
  documento?: string;
  criadoPor: string | null;
}): Promise<{ erro: string } | { id: string }> {
  const g = await gatewayDaOficina(p.oficinaId);
  if (!g?.ativo) return { erro: "Conecte a conta do Asaas em Financeiro › Contas e categorias" };
  const db = await getDb();
  const [l] = await db
    .select()
    .from(lancamentos)
    .where(and(eq(lancamentos.id, p.lancamentoId), eq(lancamentos.oficinaId, p.oficinaId), eq(lancamentos.tipo, "receber")));
  if (!l) return { erro: "Conta a receber não encontrada" };
  if (l.status === "pago" || l.status === "cancelado") return { erro: "Esta conta não está em aberto" };
  const aberto = centavos(l.valor) - centavos(l.valorPago);
  if (aberto < 500) return { erro: "O Asaas só cobra a partir de R$ 5,00" };
  if (!l.clienteId) return { erro: "Escolha o cliente da conta antes de gerar a cobrança" };

  const [pendente] = await db
    .select({ id: cobrancas.id })
    .from(cobrancas)
    .where(and(eq(cobrancas.lancamentoId, l.id), eq(cobrancas.situacao, "pendente")));
  if (pendente) return { erro: "Já existe uma cobrança aguardando pagamento. Cancele-a para gerar outra." };

  const [c] = await db.select().from(clientes).where(eq(clientes.id, l.clienteId));
  if (!c) return { erro: "Cliente não encontrado" };
  const doc = (c.documento || p.documento || "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) return { erro: "Informe o CPF ou CNPJ do cliente (o Asaas exige)" };
  if (!c.documento) await db.update(clientes).set({ documento: doc }).where(eq(clientes.id, c.id));

  const hoje = hojeSP();
  const vencimento = p.vencimento && p.vencimento >= hoje ? p.vencimento : l.vencimento >= hoje ? l.vencimento : hoje;
  const cli = api(g);
  try {
    // Cliente no Asaas: reaproveita o de uma cobrança anterior, ou procura pelo documento, ou cria
    const [anterior] = await db
      .select({ externo: cobrancas.clienteExternoId })
      .from(cobrancas)
      .where(and(eq(cobrancas.oficinaId, p.oficinaId), eq(cobrancas.clienteId, c.id), eq(cobrancas.ambiente, g.ambiente)))
      .orderBy(desc(cobrancas.criadoEm))
      .limit(1);
    const telefone = c.telefone?.replace(/\D/g, "");
    const clienteExterno =
      anterior?.externo ??
      (await cli.buscarCliente(doc))?.id ??
      (
        await cli.criarCliente({
          name: c.nome,
          cpfCnpj: doc,
          email: c.email ?? undefined,
          mobilePhone: telefone && telefone.length >= 10 ? telefone : undefined,
          externalReference: c.id,
        })
      ).id;

    const pg = await cli.criarPagamento({
      customer: clienteExterno,
      billingType: p.tipo,
      value: aberto / 100,
      dueDate: vencimento,
      description: l.descricao.slice(0, 500),
      externalReference: l.id,
    });
    const pix = p.tipo === "PIX" || p.tipo === "UNDEFINED" || p.tipo === "BOLETO" ? await cli.pixQrCode(pg.id).catch(() => null) : null;

    const [nova] = await db
      .insert(cobrancas)
      .values({
        oficinaId: p.oficinaId,
        lancamentoId: l.id,
        ambiente: g.ambiente,
        externoId: pg.id,
        clienteExternoId: clienteExterno,
        clienteId: c.id,
        status: pg.status,
        tipo: p.tipo,
        valor: reais(aberto),
        vencimento,
        linkPagamento: pg.invoiceUrl ?? null,
        pixCopiaECola: pix?.payload ?? null,
        criadoPor: p.criadoPor,
      })
      .returning({ id: cobrancas.id });
    return { id: nova.id };
  } catch (e) {
    return { erro: e instanceof ErroAsaas ? e.message : "Não foi possível gerar a cobrança" };
  }
}

async function cobrancaDaOficina(oficinaId: string, id: string) {
  const db = await getDb();
  const [c] = await db.select().from(cobrancas).where(and(eq(cobrancas.id, id), eq(cobrancas.oficinaId, oficinaId)));
  return c ?? null;
}

/** QR Code do PIX (imagem base64), buscado na hora para não guardar imagem no banco */
export async function qrCodeDaCobranca(oficinaId: string, id: string) {
  const c = await cobrancaDaOficina(oficinaId, id);
  const g = await gatewayDaOficina(oficinaId);
  if (!c || !g || c.situacao !== "pendente" || c.ambiente !== g.ambiente) return null;
  try {
    const q = await api(g).pixQrCode(c.externoId);
    return { imagem: `data:image/png;base64,${q.encodedImage}`, copiaECola: q.payload, expiraEm: q.expirationDate ?? null };
  } catch {
    return null;
  }
}

export async function cancelarCobranca(oficinaId: string, id: string) {
  const c = await cobrancaDaOficina(oficinaId, id);
  if (!c) return { erro: "Cobrança não encontrada" };
  if (c.situacao !== "pendente") return { erro: "Só dá para cancelar cobrança aguardando pagamento" };
  const g = await gatewayDaOficina(oficinaId);
  if (g && g.ambiente === c.ambiente) {
    try {
      await api(g).removerPagamento(c.externoId);
    } catch (e) {
      // Já removida no Asaas: segue cancelando aqui
      if (!(e instanceof ErroAsaas && e.status === 404)) return { erro: e instanceof Error ? e.message : "Erro ao cancelar" };
    }
  }
  const db = await getDb();
  await db.update(cobrancas).set({ situacao: "cancelada", canceladaEm: new Date(), atualizadoEm: new Date() }).where(eq(cobrancas.id, c.id));
  return { ok: true as const };
}

/** Cancela as cobranças pendentes de um lançamento. Com manterSeValorAberto, mantém as que ainda cobram exatamente o valor em aberto. */
export async function cancelarPendentesDoLancamento(oficinaId: string, lancamentoId: string, manterSeValorAberto: number | null = null) {
  const db = await getDb();
  const pend = (await db
    .select({ id: cobrancas.id, valor: cobrancas.valor })
    .from(cobrancas)
    .where(and(eq(cobrancas.oficinaId, oficinaId), eq(cobrancas.lancamentoId, lancamentoId), eq(cobrancas.situacao, "pendente")))).filter(
    (c) => manterSeValorAberto == null || centavos(c.valor) !== manterSeValorAberto,
  );
  for (const c of pend) await cancelarCobranca(oficinaId, c.id);
}

/** Busca o status no Asaas e aplica (botão "Atualizar", útil sem webhook) */
export async function atualizarCobranca(oficinaId: string, id: string) {
  const c = await cobrancaDaOficina(oficinaId, id);
  const g = await gatewayDaOficina(oficinaId);
  if (!c || !g) return { erro: "Cobrança não encontrada" };
  if (c.ambiente !== g.ambiente) return { erro: "A cobrança é de outra conta do Asaas" };
  try {
    const pg = await api(g).pagamento(c.externoId);
    await aplicarPagamento(oficinaId, pg.deleted ? { ...pg, status: "DELETED" } : pg, pg.deleted ? "PAYMENT_DELETED" : "SYNC");
    return { ok: true as const };
  } catch (e) {
    return { erro: e instanceof ErroAsaas ? e.message : "Não foi possível consultar o Asaas" };
  }
}

/** Só no sandbox: simula o cliente pagando */
export async function simularPagamento(oficinaId: string, id: string) {
  const c = await cobrancaDaOficina(oficinaId, id);
  const g = await gatewayDaOficina(oficinaId);
  if (!c || !g || g.ambiente !== "sandbox" || c.ambiente !== "sandbox") return { erro: "Disponível só no sandbox" };
  try {
    await api(g).simularPagamento(c.externoId);
  } catch (e) {
    return { erro: e instanceof ErroAsaas ? e.message : "Erro ao simular" };
  }
  return atualizarCobranca(oficinaId, id);
}

/* ---------- Webhook ---------- */

/*
 * O webhook não tem usuário logado: usa a conexão do sistema (sem RLS). A oficina vem do
 * endereço e só é aceita com o token do cabeçalho; as consultas filtram por ela.
 */

/** Confere o token do cabeçalho asaas-access-token */
export async function webhookAutorizado(oficinaId: string, token: string | null) {
  const g = await gatewayDaOficina(oficinaId, await getDbSistema());
  return !!(g && token && iguais(token, g.webhookToken));
}

export async function processarEvento(oficinaId: string, ev: EventoAsaas) {
  if (!ev.payment?.id || !ev.event.startsWith("PAYMENT_")) return;
  const status = ev.event === "PAYMENT_DELETED" ? "DELETED" : ev.payment.status;
  await aplicarPagamento(oficinaId, { ...ev.payment, status }, ev.event, await getDbSistema());
}

/**
 * Aplica o estado do pagamento do Asaas na cobrança e no financeiro.
 * Idempotente: eventos repetidos ou fora de ordem não duplicam baixa.
 */
async function aplicarPagamento(oficinaId: string, pg: PagamentoAsaas, evento: string, conexao?: DB) {
  const db = conexao ?? (await getDb());
  await db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(cobrancas)
      .where(and(eq(cobrancas.oficinaId, oficinaId), eq(cobrancas.provedor, "asaas"), eq(cobrancas.externoId, pg.id)))
      .for("update");
    if (!c) return;
    const agora = new Date();
    const base = { status: pg.status, atualizadoEm: agora, ...(pg.invoiceUrl ? { linkPagamento: pg.invoiceUrl } : {}) };

    if (STATUS_PAGO.has(pg.status)) {
      if (c.situacao === "pago") {
        await tx.update(cobrancas).set(base).where(eq(cobrancas.id, c.id));
        return;
      }
      const baixaId = await baixaDoPagamento(tx, oficinaId, c, pg);
      await tx
        .update(cobrancas)
        .set({
          ...base,
          situacao: "pago",
          baixaId,
          canceladaEm: null,
          formaPaga: formaDoTipo(pg.billingType),
          valorLiquido: pg.netValue != null ? reais(Math.round(pg.netValue * 100)) : null,
          pagoEm: pg.paymentDate ?? pg.clientPaymentDate ?? pg.confirmedDate ?? hojeSP(),
        })
        .where(eq(cobrancas.id, c.id));
      return;
    }

    if (STATUS_DESFEITO.has(pg.status) || evento === "PAYMENT_RECEIVED_IN_CASH_UNDONE") {
      if (c.baixaId) await estornarBaixa(tx, oficinaId, c.baixaId, `asaas:${evento}`);
      await tx
        .update(cobrancas)
        .set({ ...base, situacao: c.situacao === "pago" ? "estornada" : c.situacao === "pendente" ? "pendente" : c.situacao, baixaId: null })
        .where(eq(cobrancas.id, c.id));
      return;
    }

    if (pg.status === "DELETED") {
      if (c.situacao === "pendente") {
        await tx.update(cobrancas).set({ ...base, situacao: "cancelada", canceladaEm: agora }).where(eq(cobrancas.id, c.id));
      }
      return;
    }

    // PENDING / OVERDUE / restaurada
    await tx
      .update(cobrancas)
      .set({ ...base, ...(c.situacao === "cancelada" && evento === "PAYMENT_RESTORED" ? { situacao: "pendente" as const, canceladaEm: null } : {}) })
      .where(eq(cobrancas.id, c.id));
  });
}

/** Cria a baixa do pagamento recebido. Se o lançamento já foi quitado por fora, não baixa de novo. */
async function baixaDoPagamento(tx: DB, oficinaId: string, c: Cobranca, pg: PagamentoAsaas) {
  const [g] = await tx.select().from(gateways).where(eq(gateways.oficinaId, oficinaId));
  if (!g?.contaId) return null;
  const [l] = await tx
    .select()
    .from(lancamentos)
    .where(and(eq(lancamentos.id, c.lancamentoId), eq(lancamentos.oficinaId, oficinaId)));
  if (!l || l.status === "cancelado") return null;
  const aberto = centavos(l.valor) - centavos(l.valorPago);
  if (aberto <= 0) return null;
  const pago = Math.round(pg.value * 100);
  const principal = Math.min(centavos(c.valor), aberto, pago);
  const juros = Math.max(pago - principal, 0);
  const taxa = pg.netValue != null ? Math.max(pago - Math.round(pg.netValue * 100), 0) : 0;
  const r = await registrarBaixa(tx, {
    oficinaId,
    lancamentoId: l.id,
    contaId: g.contaId,
    data: pg.paymentDate ?? pg.clientPaymentDate ?? pg.confirmedDate ?? hojeSP(),
    valor: principal,
    juros,
    taxa,
    forma: formaDoTipo(pg.billingType),
    observacao: `Asaas ${pg.id}`,
    criadoPor: "asaas",
  });
  return "id" in r ? r.id : null;
}

/** Cobranças com baixa (para mostrar "pago pelo Asaas" na baixa) */
export async function cobrancasPagasDoLancamento(oficinaId: string, lancamentoId: string) {
  const db = await getDb();
  return db
    .select({ id: cobrancas.id, baixaId: cobrancas.baixaId })
    .from(cobrancas)
    .where(and(eq(cobrancas.oficinaId, oficinaId), eq(cobrancas.lancamentoId, lancamentoId), isNotNull(cobrancas.baixaId)));
}
