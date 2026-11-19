import { Card, Vazio } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { listarPecasEstoque, precisaRepor } from "@/lib/estoque-pecas";
import { ListaReposicao } from "./lista";

export const metadata = { title: "Reposição" };

/** Unidades contadas em peças inteiras */
const INTEIRAS = new Set(["UN", "PC", "CX", "JG", "KIT"]);

export default async function ReposicaoPage() {
  const { oficina, pode } = await exigir("estoque");
  const pecas = (await listarPecasEstoque(oficina.id)).filter(precisaRepor);

  const itens = pecas.map((p) => {
    const bruto = Math.max(p.minimo * 2 - p.saldo, 1);
    const sugestao = INTEIRAS.has(p.unidade) ? Math.ceil(bruto) : Math.ceil(bruto * 1000) / 1000;
    return {
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      marca: p.marca,
      unidade: p.unidade,
      saldo: p.saldo,
      minimo: p.minimo,
      custoMedio: pode("verValores") ? p.custoMedio : null,
      sugestao,
    };
  });

  if (itens.length === 0) {
    return (
      <Card>
        <Vazio titulo="Nenhuma peça para repor">Aparecem aqui as peças com saldo no mínimo, abaixo dele ou negativo.</Vazio>
      </Card>
    );
  }
  return <ListaReposicao itens={itens} />;
}
