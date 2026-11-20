import { reportarErro } from "@/lib/monitoramento";
import { ipDaRequisicao, respostaMuitasTentativas, verificarLimite } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Recebe relatórios de erro dos boundaries error.tsx / global-error.tsx (com rate limit por IP) */
export async function POST(req: Request) {
  const ip = ipDaRequisicao(req.headers);
  const lim = await verificarLimite({ chave: `erros:${ip}`, limite: 15, janelaSeg: 600 });
  if (!lim.permitido) return respostaMuitasTentativas(lim);

  const body = (await req.json().catch(() => null)) as {
    mensagem?: string;
    stack?: string;
    rota?: string;
    digest?: string;
  } | null;

  if (!body?.mensagem) return Response.json({ ok: true });

  const err = new Error(String(body.mensagem).slice(0, 500));
  if (body.stack) err.stack = String(body.stack).slice(0, 1500);
  await reportarErro(err, {
    origem: "client-error-boundary",
    rota: typeof body.rota === "string" ? body.rota.slice(0, 200) : undefined,
    digest: typeof body.digest === "string" ? body.digest.slice(0, 80) : undefined,
  });

  return Response.json({ ok: true });
}
