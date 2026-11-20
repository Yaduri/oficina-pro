import { diaSP } from "@/lib/agenda-datas";
import { gerarPacoteContadorZip } from "@/lib/fiscal/notas";
import { getContexto } from "@/lib/oficina";

export const dynamic = "force-dynamic";

/** Exportação mensal em ZIP (XMLs + DANFSe PDFs + CSV resumo) para o contador */
export async function GET(req: Request) {
  const { oficina, pode } = await getContexto();
  if (!pode("fiscal")) return new Response("Sem permissão", { status: 403 });

  const paramMes = new URL(req.url).searchParams.get("mes") ?? "";
  const mes = /^\d{4}-\d{2}$/.test(paramMes) ? paramMes : diaSP(new Date()).slice(0, 7);

  const zip = await gerarPacoteContadorZip(oficina.id, mes);
  return new Response(new Uint8Array(zip.buffer), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zip.nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
