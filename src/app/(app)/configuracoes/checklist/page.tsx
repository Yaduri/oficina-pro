import { Card, PageHeader, Vazio } from "@/components/ui";
import { exigirAdmin } from "@/lib/oficina";
import { listarChecklist } from "@/lib/checklist-dados";
import { agrupar, SUGESTAO_CHECKLIST } from "@/lib/checklist";
import { AbasConfig } from "../abas";
import { ListaChecklist, NovoItemChecklist } from "./lista";
import { Sugestao } from "./sugestao";

export const metadata = { title: "Checklist" };

export default async function ChecklistPage() {
  const { oficina } = await exigirAdmin();
  const itens = await listarChecklist(oficina.id);
  const grupos = agrupar(itens);
  const totalSugestao = SUGESTAO_CHECKLIST.reduce((s, g) => s + g.itens.length, 0);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Itens conferidos na chegada do veículo. Desmarque para não usar um item; os check-ins já feitos não mudam."
      />
      <AbasConfig />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {grupos.length === 0 ? (
            <Card>
              <Vazio titulo="Nenhum item no checklist">
                Adicione os itens que vocês conferem quando o carro chega, ou comece pela sugestão com {totalSugestao} itens comuns.
              </Vazio>
              <div className="flex justify-center pb-8">
                <Sugestao />
              </div>
            </Card>
          ) : (
            <ListaChecklist grupos={grupos} />
          )}
        </div>
        <div className="flex flex-col gap-4">
          <NovoItemChecklist grupos={grupos.map((g) => g.grupo)} />
          {grupos.length > 0 && (
            <p className="px-1 text-[13px] text-muted">
              No check-in, cada item é marcado como OK, com problema ou não tem. <Sugestao discreto />
            </p>
          )}
        </div>
      </div>
    </>
  );
}
