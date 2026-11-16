import type { ReactNode } from "react";
import { EmpresaTag, PageHeader } from "@/components/ui";
import { exigirAdmin } from "@/lib/oficina";
import { formatDocumento } from "@/lib/utils";
import { EmpresaForm, OficinaForm, TextosForm } from "./forms";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const { oficina, empresas } = await exigirAdmin();

  return (
    <>
      <PageHeader title="Configurações" description="Dados da oficina e de cada CNPJ, usados no orçamento, no termo de entrada, nos PDFs e nas notas fiscais." />

      <nav aria-label="Seções" className="no-scrollbar -mt-2 flex gap-1.5 overflow-x-auto text-[13px]">
        <a href="#oficina" className="rounded-full border border-border px-3 py-1 font-medium text-foreground-2 hover:bg-subtle">
          Oficina
        </a>
        {empresas.map((e) => (
          <a key={e.id} href={`#empresa-${e.id}`} className="whitespace-nowrap rounded-full border border-border px-3 py-1 font-medium text-foreground-2 hover:bg-subtle">
            {e.nome}
          </a>
        ))}
        <a href="#textos" className="whitespace-nowrap rounded-full border border-border px-3 py-1 font-medium text-foreground-2 hover:bg-subtle">
          Textos padrão
        </a>
      </nav>

      <Secao id="oficina" titulo="Oficina" descricao="Nome, logo, contato e endereço que o cliente vê no orçamento e nos documentos.">
        <OficinaForm oficina={oficina} />
      </Secao>

      {empresas.map((e) => (
        <Secao
          key={e.id}
          id={`empresa-${e.id}`}
          titulo={<EmpresaTag tipo={e.tipo} nome={e.nome} />}
          descricao={
            <>
              Dados do CNPJ{e.cnpj ? ` ${formatDocumento(e.cnpj)}` : ""}. Aparecem nos documentos das OS desta empresa e serão usados
              na emissão de notas fiscais.
            </>
          }
        >
          <EmpresaForm empresa={e} />
        </Secao>
      ))}

      <Secao id="textos" titulo="Textos padrão" descricao="Garantia, termo de entrada do veículo e padrões do orçamento.">
        <TextosForm textos={oficina} />
      </Secao>
    </>
  );
}

function Secao({ id, titulo, descricao, children }: { id: string; titulo: ReactNode; descricao: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-36 gap-4 border-t border-border pt-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        <p className="text-[13px] text-muted">{descricao}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
