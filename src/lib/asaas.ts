import "server-only";

/**
 * Cliente mínimo da API v3 do Asaas (https://docs.asaas.com).
 * Autenticação pelo cabeçalho access_token; User-Agent obrigatório em contas novas.
 */

export type AmbienteAsaas = "sandbox" | "producao";

const BASE: Record<AmbienteAsaas, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

export type TipoCobranca = "UNDEFINED" | "PIX" | "BOLETO" | "CREDIT_CARD";

export type PagamentoAsaas = {
  id: string;
  customer: string;
  status: string;
  billingType: string;
  value: number;
  netValue?: number;
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
};

export type EventoAsaas = { id?: string; event: string; payment?: PagamentoAsaas };

export class ErroAsaas extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Ambiente pelo prefixo da chave ($aact_prod_ / $aact_hmlg_); null se não reconhecer */
export function ambienteDaChave(chave: string): AmbienteAsaas | null {
  if (chave.startsWith("$aact_prod_")) return "producao";
  if (chave.startsWith("$aact_hmlg_")) return "sandbox";
  return null;
}

export function asaas(ambiente: AmbienteAsaas, apiKey: string) {
  async function req<T>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
    let r: Response;
    try {
      r = await fetch(BASE[ambiente] + caminho, {
        method: metodo,
        headers: {
          access_token: apiKey,
          "User-Agent": "OficinaPro/1.0",
          Accept: "application/json",
          // GET não pode ter corpo (o Asaas responde 403)
          ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch {
      throw new ErroAsaas("Não foi possível falar com o Asaas. Tente de novo em instantes.", 0);
    }
    const texto = await r.text();
    const json = texto ? JSON.parse(texto) : {};
    if (!r.ok) {
      if (r.status === 401) throw new ErroAsaas("Chave de API do Asaas inválida", 401);
      if (r.status === 429) throw new ErroAsaas("Muitas requisições ao Asaas. Tente de novo em alguns minutos.", 429);
      const msg = (json?.errors as { description?: string }[] | undefined)?.map((e) => e.description).filter(Boolean).join(" ");
      throw new ErroAsaas(msg || `Erro do Asaas (${r.status})`, r.status);
    }
    return json as T;
  }

  return {
    saldo: () => req<{ balance: number }>("GET", "/finance/balance"),
    conta: () => req<{ name?: string; companyName?: string; cpfCnpj?: string; email?: string }>("GET", "/myAccount/commercialInfo/"),

    buscarCliente: async (cpfCnpj: string) =>
      (await req<{ data: { id: string; deleted?: boolean }[] }>("GET", `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`)).data.find(
        (c) => !c.deleted,
      ) ?? null,
    criarCliente: (c: { name: string; cpfCnpj: string; email?: string; mobilePhone?: string; externalReference?: string }) =>
      req<{ id: string }>("POST", "/customers", { ...c, notificationDisabled: true }),

    criarPagamento: (p: {
      customer: string;
      billingType: TipoCobranca;
      value: number;
      dueDate: string;
      description?: string;
      externalReference?: string;
    }) => req<PagamentoAsaas>("POST", "/payments", p),
    pagamento: (id: string) => req<PagamentoAsaas>("GET", `/payments/${encodeURIComponent(id)}`),
    removerPagamento: (id: string) => req<{ deleted: boolean }>("DELETE", `/payments/${encodeURIComponent(id)}`),
    pixQrCode: (id: string) =>
      req<{ encodedImage: string; payload: string; expirationDate?: string }>("GET", `/payments/${encodeURIComponent(id)}/pixQrCode`),
    /** Só no sandbox: simula o pagamento e dispara os webhooks */
    simularPagamento: (id: string) => req<PagamentoAsaas>("POST", `/sandbox/payment/${encodeURIComponent(id)}/confirm`),

    criarWebhook: (w: { url: string; email: string; authToken: string }) =>
      req<{ id: string }>("POST", "/webhooks", {
        name: "Oficina Pro",
        url: w.url,
        email: w.email,
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: w.authToken,
        sendType: "SEQUENTIALLY",
        events: EVENTOS_WEBHOOK,
      }),
    atualizarWebhook: (id: string, w: { url: string; email: string; authToken: string }) =>
      req<{ id: string }>("PUT", `/webhooks/${encodeURIComponent(id)}`, {
        url: w.url,
        email: w.email,
        enabled: true,
        interrupted: false,
        authToken: w.authToken,
        events: EVENTOS_WEBHOOK,
      }),
    removerWebhook: (id: string) => req<{ deleted: boolean }>("DELETE", `/webhooks/${encodeURIComponent(id)}`),
  };
}

export type ClienteAsaas = ReturnType<typeof asaas>;

export const EVENTOS_WEBHOOK = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_UPDATED",
];

/** Status em que o dinheiro foi pago pelo cliente */
export const STATUS_PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);
/** Status em que um pagamento foi desfeito */
export const STATUS_DESFEITO = new Set(["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"]);

/** Forma de pagamento do sistema a partir do billingType pago */
export function formaDoTipo(billingType: string) {
  if (billingType === "PIX") return "pix";
  if (billingType === "BOLETO") return "boleto";
  if (billingType === "CREDIT_CARD") return "credito";
  if (billingType === "DEBIT_CARD") return "debito";
  return "pix";
}
