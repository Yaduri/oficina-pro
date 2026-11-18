import { listarFechamentos } from "@/lib/comissoes";
import { csvValor, gerarCsv, respostaCsv } from "@/lib/csv";
import { dataBR, rotuloPeriodo } from "@/lib/financeiro-relatorios";
import { diaSP } from "@/lib/agenda-datas";
import { getContexto } from "@/lib/oficina";

/** Fechamentos de comissão em CSV, uma linha por OS */
export async function GET() {
  const ctx = await getContexto();
  if (!ctx.pode("financeiro")) return new Response("Sem permissão", { status: 403 });
  const lista = await listarFechamentos(ctx.oficina.id, 2000);
  const linhas = lista.flatMap((f) =>
    f.detalhes.map((d) => [
      f.tecnico,
      rotuloPeriodo(f.de, f.ate),
      dataBR(diaSP(f.criadoEm)),
      d.numero,
      dataBR(diaSP(new Date(d.entregueEm))),
      csvValor(d.servicos),
      csvValor(d.pecas),
      csvValor(d.comissao),
    ]),
  );
  return respostaCsv(
    "comissoes-fechamentos.csv",
    gerarCsv(["Técnico", "Período", "Fechado em", "OS", "Entrega", "Serviços", "Peças", "Comissão"], linhas),
  );
}
