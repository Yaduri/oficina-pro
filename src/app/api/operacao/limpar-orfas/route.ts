import { iguais } from "@/lib/cripto";
import { limparArquivosOrfaos } from "@/lib/limpeza-arquivos";

/*
 * Limpeza periódica de fotos/anexos órfãos no R2 (Fase 6.3).
 * Protegida por `Authorization: Bearer <CRON_SECRET>`.
 * Aceita `?dryRun=1` para inspecionar sem apagar nada.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const esperado = process.env.CRON_SECRET?.trim();
  if (!esperado) return Response.json({ erro: "CRON_SECRET não configurado" }, { status: 503 });
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!recebido || !iguais(recebido, esperado)) {
    return Response.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const horas = Number(url.searchParams.get("horas") ?? "24");
  const resultado = await limparArquivosOrfaos({
    dryRun,
    idadeMinimaHoras: Number.isFinite(horas) && horas >= 1 ? horas : 24,
  });
  return Response.json({ ok: true, ...resultado });
}
