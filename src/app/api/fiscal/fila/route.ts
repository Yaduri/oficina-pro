import { iguais } from "@/lib/cripto";
import { processarFilaFiscal } from "@/lib/fiscal/notas";

/*
 * Endpoint para disparo periódico da fila de notas fiscais com falha transitória
 * (pode ser chamado por Cron Trigger do Cloudflare ou serviço externo com `Authorization: Bearer <CRON_SECRET>`).
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const esperado = process.env.CRON_SECRET?.trim();
  if (!esperado) {
    return Response.json({ erro: "CRON_SECRET não configurado" }, { status: 503 });
  }
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!recebido || !iguais(recebido, esperado)) {
    return Response.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const resumo = await processarFilaFiscal();
  return Response.json({ ok: true, ...resumo });
}
