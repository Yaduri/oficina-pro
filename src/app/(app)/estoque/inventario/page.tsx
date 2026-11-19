import { Card, Vazio } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { listarPecasEstoque } from "@/lib/estoque-pecas";
import { Inventario } from "./inventario";

export const metadata = { title: "Inventário" };

export default async function InventarioPage() {
  const { oficina, pode } = await exigir("estoque");
  const pecas = await listarPecasEstoque(oficina.id);
  if (pecas.length === 0) {
    return (
      <Card>
        <Vazio titulo="Nenhuma peça com controle de estoque" />
      </Card>
    );
  }
  return (
    <Inventario
      valores={pode("verValores")}
      pecas={pecas.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        descricao: p.descricao,
        marca: p.marca,
        gtin: p.gtin,
        localizacao: p.localizacao,
        unidade: p.unidade,
        saldo: p.saldo,
      }))}
    />
  );
}
