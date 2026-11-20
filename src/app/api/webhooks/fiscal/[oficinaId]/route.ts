import { z } from "zod";
import { processarWebhookFiscal, webhookFiscalAutorizado } from "@/lib/fiscal/notas";

/*
 * Webhook fiscal para retornos assíncronos de provedores externos (ex.: Focus NFe na etapa 3.3).
 * Autenticado por cabeçalho `x-fiscal-token` em comparação de tempo constante.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/webhooks/fiscal/[oficinaId]">) {
  const { oficinaId } = await ctx.params;
  if (!z.uuid().safeParse(oficinaId).success) {
    return Response.json({ erro: "Não encontrado" }, { status: 404 });
  }

  try {
    const token = req.headers.get("x-fiscal-token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
    if (!(await webhookFiscalAutorizado(oficinaId, token))) {
      return Response.json({ erro: "Não autorizado" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      ref?: string;
      status?: string;
      numero?: string;
      chave?: string;
      mensagem?: string;
    } | null;

    if (body && typeof body === "object") {
      await processarWebhookFiscal(oficinaId, body);
    }
    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[webhook fiscal]", oficinaId, e);
    return Response.json({ erro: "Erro interno" }, { status: 500 });
  }
}
