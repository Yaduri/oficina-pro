import { getContexto } from "@/lib/oficina";
import { csvNumero, csvValor, gerarCsv, respostaCsv } from "@/lib/csv";
import { dataBR, diasNoPeriodo, dre, faturamento, fluxoDeCaixa, lerPeriodo } from "@/lib/financeiro-relatorios";

/** Exporta as tabelas dos relatórios em CSV (?tabela=fluxo|dre|faturamento-mes|faturamento-itens|faturamento-tecnicos|faturamento-os) */
export async function GET(req: Request) {
  const ctx = await getContexto();
  if (!ctx.pode("financeiro")) return new Response("Sem permissão", { status: 403 });
  const url = new URL(req.url);
  const p = (k: string) => url.searchParams.get(k) ?? "";
  const { de, ate } = lerPeriodo(p);
  const oficinaId = ctx.oficina.id;
  const sufixo = `${de}_${ate}.csv`;
  const tipo = (t: "peca" | "servico") => (t === "peca" ? "Peça" : "Serviço");

  switch (p("tabela")) {
    case "fluxo": {
      const por = p("por") === "mes" || (p("por") !== "dia" && diasNoPeriodo(de, ate) > 62) ? "mes" : "dia";
      const f = await fluxoDeCaixa(oficinaId, de, ate, por);
      return respostaCsv(
        `fluxo-de-caixa_${sufixo}`,
        gerarCsv(
          [por === "mes" ? "Mês" : "Dia", "Entradas", "Saídas", "Saldo do período", "Saldo acumulado", "A receber (previsto)", "A pagar (previsto)", "Saldo projetado"],
          [
            ["Saldo inicial", "", "", "", csvValor(f.saldoInicial), "", "", csvValor(f.saldoInicial)],
            ...f.linhas.map((l) => [
              l.rotulo,
              csvValor(l.entradas),
              csvValor(l.saidas),
              csvValor(l.entradas - l.saidas),
              csvValor(l.saldo),
              csvValor(l.entradasPrev),
              csvValor(l.saidasPrev),
              csvValor(l.saldoProjetado),
            ]),
          ],
        ),
      );
    }
    case "dre": {
      const d = await dre(oficinaId, de, ate);
      return respostaCsv(
        `dre_${sufixo}`,
        gerarCsv(
          ["Linha", "Tipo", "Valor"],
          d.linhas.map((l) => [l.rotulo, l.nivel === "total" ? "Total" : l.nivel === "grupo" ? "Grupo" : "Categoria", csvValor(l.valor)]),
        ),
      );
    }
    case "faturamento-mes": {
      const f = await faturamento(oficinaId, de, ate);
      return respostaCsv(
        `faturamento-por-mes_${sufixo}`,
        gerarCsv(
          ["Mês", "OS entregues", "Serviços", "Peças", "Total", "Ticket médio"],
          f.porMes.map((m) => [m.rotulo, m.qtd, csvValor(m.servicos), csvValor(m.pecas), csvValor(m.total), csvValor(m.ticket)]),
        ),
      );
    }
    case "faturamento-itens": {
      const f = await faturamento(oficinaId, de, ate);
      return respostaCsv(
        `faturamento-por-servico_${sufixo}`,
        gerarCsv(
          ["Item", "Tipo", "Quantidade", "OS", "Total"],
          f.porItem.map((i) => [i.descricao, tipo(i.tipo), csvNumero(i.quantidade), i.qtdOS, csvValor(i.total)]),
        ),
      );
    }
    case "faturamento-tecnicos": {
      const f = await faturamento(oficinaId, de, ate);
      return respostaCsv(
        `faturamento-por-tecnico_${sufixo}`,
        gerarCsv(
          ["Técnico", "OS entregues", "Total", "Ticket médio"],
          f.porTecnico.map((t) => [t.nome, t.qtd, csvValor(t.total), csvValor(t.ticket)]),
        ),
      );
    }
    case "faturamento-os": {
      const f = await faturamento(oficinaId, de, ate);
      return respostaCsv(
        `os-entregues_${sufixo}`,
        gerarCsv(
          ["OS", "Entrega", "Placa", "Cliente", "Técnico", "Serviços (líquido)", "Peças (líquido)", "Desconto", "Total"],
          f.lista.map((o) => [
            o.numero,
            dataBR(o.dia),
            o.placa,
            o.cliente ?? "",
            o.responsavel ?? "",
            csvValor(o.servicos),
            csvValor(o.pecas),
            csvValor(o.desconto),
            csvValor(o.total),
          ]),
        ),
      );
    }
    default:
      return new Response("Tabela inválida", { status: 400 });
  }
}
