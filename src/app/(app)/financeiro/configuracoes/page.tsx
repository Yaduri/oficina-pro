import { Card, CardHeader } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { GRUPOS_DRE, hojeSP, listarCategorias, listarContas } from "@/lib/financeiro";
import { resumoGateway } from "@/lib/cobranca";
import { CobrancaOnline, FormTaxas, ListaCategorias, ListaContas } from "./listas";

export const metadata = { title: "Contas e categorias" };

export default async function ConfigFinanceiroPage() {
  const { oficina, membro } = await exigir("financeiro");
  const [contas, cats, gateway] = await Promise.all([
    listarContas(oficina.id, false),
    listarCategorias(oficina.id, undefined, false),
    resumoGateway(oficina.id),
  ]);
  const grupos = Object.entries(GRUPOS_DRE).map(([id, g]) => ({ id, label: g.label, tipo: g.tipo }));
  const taxas = oficina.taxasCartao ?? { debito: 0, credito: 0, creditoParcelado: 0 };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <ListaContas
          contas={contas.map((c) => ({
            id: c.id,
            nome: c.nome,
            tipo: c.tipo,
            saldoInicial: Number(c.saldoInicial),
            saldoInicialEm: c.saldoInicialEm,
            ativo: c.ativo,
          }))}
          hoje={hojeSP()}
        />
        <ListaCategorias
          categorias={cats.map((c) => ({ id: c.id, tipo: c.tipo, nome: c.nome, grupoDre: c.grupoDre, sistema: !!c.sistema, ativo: c.ativo }))}
          grupos={grupos}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader title="Taxas da maquininha" />
          <div className="p-5">
            <FormTaxas taxas={taxas} />
          </div>
        </Card>
        <CobrancaOnline
          gateway={
            gateway && {
              ambiente: gateway.ambiente,
              titular: gateway.titular,
              apiKeyFinal: gateway.apiKeyFinal,
              conta: contas.find((c) => c.id === gateway.contaId)?.nome ?? null,
              webhookAtivo: gateway.webhookAtivo,
            }
          }
          emailPadrao={oficina.email || membro.email || ""}
        />
      </div>
    </div>
  );
}
