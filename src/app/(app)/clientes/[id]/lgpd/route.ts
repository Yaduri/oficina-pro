import { z } from "zod";
import { exportarDadosClienteZip } from "@/lib/lgpd";
import { getContexto } from "@/lib/oficina";

export const dynamic = "force-dynamic";

/** Exportação dos dados pessoais de um cliente em ZIP (LGPD — Art. 18) */
export async function GET(_req: Request, ctx: RouteContext<"/clientes/[id]/lgpd">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Não encontrado", { status: 404 });

  const user = await getContexto();
  if (!user.pode("cadastros")) return new Response("Sem permissão", { status: 403 });

  const zip = await exportarDadosClienteZip(user.oficina.id, id, {
    usuarioId: user.userId,
    usuarioNome: user.membro.nome || user.membro.email,
  });
  if (!zip) return new Response("Cliente não encontrado", { status: 404 });

  return new Response(new Uint8Array(zip.buffer), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zip.nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
