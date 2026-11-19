import { z } from "zod";
import type { EventoAsaas } from "@/lib/asaas";
import { processarEvento, webhookAutorizado } from "@/lib/cobranca";

/*
 * Webhook do Asaas (um endereço por oficina). Rota pública: o proxy só disponibiliza a sessão
 * do Clerk e não exige login. A autenticação é o token do cabeçalho asaas-access-token.
 * O Asaas considera falha qualquer resposta diferente de 200 e pausa a fila após 15 falhas,
 * então só devolvemos erro quando queremos que ele tente de novo.
 */

export const dynamic = "force-dynamic";

const ok = () => Response.json({ ok: true }, { status: 200 });

export async function POST(req: Request, ctx: RouteContext<"/api/webhooks/asaas/[oficinaId]">) {
  const { oficinaId } = await ctx.params;
  if (!z.uuid().safeParse(oficinaId).success) return Response.json({ erro: "Não encontrado" }, { status: 404 });

  try {
    if (!(await webhookAutorizado(oficinaId, req.headers.get("asaas-access-token")))) {
      return Response.json({ erro: "Não autorizado" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Partial<EventoAsaas> | null;
    // Corpo inválido ou evento sem interesse: confirma para não travar a fila
    if (!body || typeof body.event !== "string") return ok();

    await processarEvento(oficinaId, body as EventoAsaas);
    return ok();
  } catch (e) {
    console.error("[webhook asaas]", oficinaId, e);
    return Response.json({ erro: "Erro interno" }, { status: 500 });
  }
}
