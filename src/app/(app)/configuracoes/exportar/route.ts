import { exportarContaCompletaZip } from "@/lib/lgpd";
import { getContexto } from "@/lib/oficina";

export const dynamic = "force-dynamic";

/** Exportação completa da conta da oficina em ZIP (saída da conta / portabilidade LGPD) */
export async function GET() {
  const ctx = await getContexto();
  if (!ctx.pode("configurar")) return new Response("Sem permissão", { status: 403 });

  const zip = await exportarContaCompletaZip(ctx.oficina.id, {
    usuarioId: ctx.userId,
    usuarioNome: ctx.membro.nome || ctx.membro.email,
  });
  if (!zip) return new Response("Oficina não encontrada", { status: 404 });

  return new Response(new Uint8Array(zip.buffer), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zip.nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
