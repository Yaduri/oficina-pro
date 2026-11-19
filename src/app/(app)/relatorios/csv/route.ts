import { getContexto } from "@/lib/oficina";
import { csvNumero, csvValor, gerarCsv, respostaCsv } from "@/lib/csv";
import { diaSP } from "@/lib/agenda-datas";
import { dataBR, lerPeriodo } from "@/lib/financeiro-relatorios";
import { STATUS } from "@/lib/os";
import { nomeVeiculo } from "@/lib/mensagens";
import {
  MESES_INATIVO,
  aprovacaoOrcamentos,
  clientesInativos,
  itensMaisVendidos,
  produtividadeTecnicos,
  respostasPesquisa,
  tempoNoPatio,
} from "@/lib/relatorios-gerenciais";

/** Exporta as tabelas dos relatórios gerenciais em CSV (?tabela=itens|patio-faixas|patio-abertas|tecnicos|orcamentos|inativos|satisfacao) */
export async function GET(req: Request) {
  const ctx = await getContexto();
  if (!ctx.pode("relatorios")) return new Response("Sem permissão", { status: 403 });
  const url = new URL(req.url);
  const p = (k: string) => url.searchParams.get(k) ?? "";
  const { de, ate } = lerPeriodo(p);
  const oficinaId = ctx.oficina.id;
  const sufixo = `${de}_${ate}.csv`;
  const data = (d: Date) => dataBR(diaSP(d));
  const dias = (d: number | null) => (d == null ? "" : csvNumero(d));

  switch (p("tabela")) {
    case "itens": {
      const tipo = p("tipo") === "peca" ? "peca" : p("tipo") === "servico" ? "servico" : null;
      const lista = (await itensMaisVendidos(oficinaId, de, ate)).filter((i) => !tipo || i.tipo === tipo);
      return respostaCsv(
        `${tipo === "peca" ? "pecas-mais-usadas" : tipo === "servico" ? "servicos-mais-vendidos" : "itens-vendidos"}_${sufixo}`,
        gerarCsv(
          ["Item", "Tipo", "Quantidade", "OS", "Faturamento"],
          lista.map((i) => [i.descricao, i.tipo === "peca" ? "Peça" : "Serviço", csvNumero(i.quantidade), i.qtdOS, csvValor(i.total)]),
        ),
      );
    }
    case "patio-faixas": {
      const t = await tempoNoPatio(oficinaId, de, ate);
      return respostaCsv(
        `tempo-no-patio_${sufixo}`,
        gerarCsv(
          ["Tempo", "OS", "%"],
          [
            ...t.faixas.map((f) => [f.rotulo, f.qtd, csvNumero(f.pct * 100)]),
            ["Total", t.qtd, ""],
            ["Média (dias)", dias(t.media), ""],
            ["Mediana (dias)", dias(t.mediana), ""],
          ],
        ),
      );
    }
    case "patio-abertas": {
      const t = await tempoNoPatio(oficinaId, de, ate);
      return respostaCsv(
        `os-abertas-ha-mais-tempo_${diaSP(new Date())}.csv`,
        gerarCsv(
          ["OS", "Entrada", "Dias no pátio", "Status", "Placa", "Veículo", "Cliente", "Técnico"],
          t.abertas.map((o) => [
            o.numero,
            data(o.entradaEm),
            csvNumero(Math.floor(o.dias)),
            STATUS[o.status].label,
            o.placa,
            o.veiculo,
            o.cliente ?? "",
            o.responsavel ?? "",
          ]),
        ),
      );
    }
    case "tecnicos": {
      const linhas = await produtividadeTecnicos(oficinaId, de, ate);
      return respostaCsv(
        `produtividade-por-tecnico_${sufixo}`,
        gerarCsv(
          ["Técnico", "OS entregues", "Serviços", "Peças", "Total", "Ticket médio", "Tempo médio no pátio (dias)", "Horas padrão vendidas"],
          linhas.map((l) => [
            l.nome,
            l.qtd,
            csvValor(l.servicos),
            csvValor(l.pecas),
            csvValor(l.total),
            csvValor(l.ticket),
            dias(l.diasMedio),
            csvNumero(l.minutosPadrao / 60),
          ]),
        ),
      );
    }
    case "orcamentos": {
      const o = await aprovacaoOrcamentos(oficinaId, de, ate);
      return respostaCsv(
        `aprovacao-de-orcamentos_${sufixo}`,
        gerarCsv(
          ["Situação", "Quantidade", "%", "Valor enviado", "Valor aprovado", "Vistos", "Não vistos"],
          [
            ...o.linhas.map((l) => [
              l.rotulo,
              l.qtd,
              o.total ? csvNumero((l.qtd / o.total) * 100) : "",
              csvValor(l.valor),
              csvValor(l.valorAprovado),
              l.vistos,
              l.qtd - l.vistos,
            ]),
            ["Total", o.total, "", csvValor(o.valor), csvValor(o.valorAprovado), o.vistos, o.total - o.vistos],
          ],
        ),
      );
    }
    case "inativos": {
      const meses = MESES_INATIVO.some((m) => String(m) === p("meses")) ? Number(p("meses")) : 6;
      const lista = await clientesInativos(oficinaId, meses);
      return respostaCsv(
        `clientes-inativos-${meses}-meses_${diaSP(new Date())}.csv`,
        gerarCsv(
          ["Cliente", "Telefone", "Aceita WhatsApp", "Última visita", "OS entregues", "Total gasto", "Placa", "Veículo"],
          lista.map((c) => [
            c.nome,
            c.telefone ?? "",
            c.aceitaWhatsapp ? "Sim" : "Não",
            data(c.ultimaVisita),
            c.qtdOS,
            csvValor(c.totalGasto),
            c.placa ?? "",
            nomeVeiculo(c),
          ]),
        ),
      );
    }
    case "satisfacao": {
      const lista = await respostasPesquisa(oficinaId, de, ate);
      return respostaCsv(
        `pesquisa-de-satisfacao_${sufixo}`,
        gerarCsv(
          ["Resposta", "OS", "Placa", "Cliente", "Nota", "Classificação", "Comentário"],
          lista.map((r) => [
            data(r.respondidoEm),
            r.numero,
            r.placa,
            r.cliente ?? "",
            r.nota,
            r.nota >= 9 ? "Promotor" : r.nota >= 7 ? "Neutro" : "Detrator",
            r.comentario ?? "",
          ]),
        ),
      );
    }
    default:
      return new Response("Tabela inválida", { status: 400 });
  }
}
