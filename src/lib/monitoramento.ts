import "server-only";

/*
 * Monitoramento e aviso de erros em produção (Fase 6.3).
 * - Log estruturado em JSON (capturado automaticamente pelo Cloudflare Workers Observability).
 * - Envio opcional para webhook (Discord, Slack, ntfy ou webhook genérico) via ALERTA_WEBHOOK_URL.
 * - Envio opcional para Sentry via SENTRY_DSN (HTTP Envelope API leve, sem SDK pesado no Workers).
 * - Deduplicação por 5 minutos para evitar tempestade de alertas repetidos.
 */

export type ContextoErro = {
  origem: string;
  rota?: string;
  oficinaId?: string;
  usuarioId?: string;
  digest?: string;
  extra?: Record<string, unknown>;
};

const recentes = new Map<string, number>();
const COOLDOWN_MS = 5 * 60_000;

function deveAlertar(assinatura: string) {
  const agora = Date.now();
  const ultimo = recentes.get(assinatura);
  if (ultimo && agora - ultimo < COOLDOWN_MS) return false;
  if (recentes.size > 200) {
    const primeiro = recentes.keys().next().value;
    if (primeiro) recentes.delete(primeiro);
  }
  recentes.set(assinatura, agora);
  return true;
}

function normalizarErro(err: unknown): { nome: string; mensagem: string; stack?: string } {
  if (err instanceof Error) {
    return { nome: err.name || "Error", mensagem: err.message, stack: err.stack?.slice(0, 1500) };
  }
  if (typeof err === "string") return { nome: "Error", mensagem: err.slice(0, 500) };
  return { nome: "UnknownError", mensagem: String(err).slice(0, 500) };
}

/** Envia envelope mínimo ao Sentry (compatível com Workers sem @sentry/nextjs) */
async function enviarSentry(dsn: string, info: { nome: string; mensagem: string; stack?: string }, ctx: ContextoErro) {
  const u = new URL(dsn);
  const publicKey = u.username;
  const projetoId = u.pathname.replace(/^\/+/, "");
  if (!publicKey || !projetoId) return;
  const endpoint = `${u.protocol}//${u.host}/api/${projetoId}/envelope/`;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const header = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
  const itemHeader = JSON.stringify({ type: "event" });
  const payload = JSON.stringify({
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: process.env.APP_URL?.includes("hoficina") ? "homolog" : process.env.NODE_ENV ?? "production",
    exception: { values: [{ type: info.nome, value: info.mensagem }] },
    tags: { origem: ctx.origem, rota: ctx.rota ?? "" },
    extra: { ...ctx.extra, digest: ctx.digest, stack: info.stack, oficinaId: ctx.oficinaId },
  });
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-sentry-envelope",
      "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=oficina-pro/1.0`,
    },
    body: `${header}\n${itemHeader}\n${payload}`,
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined);
}

/** Envia alerta legível para Discord/Slack/ntfy/webhook genérico */
async function enviarWebhook(url: string, info: { nome: string; mensagem: string; stack?: string }, ctx: ContextoErro) {
  const app = process.env.APP_URL || "Oficina Pro";
  const texto = [
    `🚨 **Erro em ${app}** (${ctx.origem})`,
    ctx.rota ? `**Rota:** \`${ctx.rota}\`` : null,
    `**${info.nome}:** ${info.mensagem}`,
    ctx.digest ? `**Digest:** \`${ctx.digest}\`` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Compatível com Discord (`content`), Slack (`text`) e webhooks genéricos
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: texto, text: texto, erro: info, contexto: ctx }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined);
}

/** Reporta erro com log estruturado + alertas externos (nunca lança exceção) */
export async function reportarErro(err: unknown, ctx: ContextoErro): Promise<void> {
  const info = normalizarErro(err);
  console.error(
    JSON.stringify({
      nivel: "error",
      quando: new Date().toISOString(),
      origem: ctx.origem,
      rota: ctx.rota,
      digest: ctx.digest,
      oficinaId: ctx.oficinaId,
      erro: info,
    }),
  );

  const assinatura = `${ctx.origem}:${ctx.rota ?? ""}:${info.nome}:${info.mensagem.slice(0, 80)}`;
  if (!deveAlertar(assinatura)) return;

  const tarefas: Promise<void>[] = [];
  if (process.env.ALERTA_WEBHOOK_URL) {
    tarefas.push(enviarWebhook(process.env.ALERTA_WEBHOOK_URL, info, ctx));
  }
  if (process.env.SENTRY_DSN) {
    tarefas.push(enviarSentry(process.env.SENTRY_DSN, info, ctx));
  }
  if (tarefas.length > 0) await Promise.allSettled(tarefas);
}
