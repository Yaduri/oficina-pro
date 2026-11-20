import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { exigirAdmin } from "@/lib/oficina";
import { FiscalForm, OficinaForm, TextosForm } from "./forms";
import { AbasConfig } from "./abas";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const { oficina } = await exigirAdmin();

  return (
    <>
      <PageHeader title="Configurações" />

      <AbasConfig />

      <nav aria-label="Seções" className="no-scrollbar flex gap-1.5 overflow-x-auto text-[13px]">
        <a href="#oficina" className="rounded-full border border-border px-3 py-1 font-medium text-foreground-2 hover:bg-subtle">
          Oficina
        </a>
        <a href="#fiscal" className="whitespace-nowrap rounded-full border border-border px-3 py-1 font-medium text-foreground-2 hover:bg-subtle">
          Dados fiscais
        </a>
        <a href="#textos" className="whitespace-nowrap rounded-full border border-border px-3 py-1 font-medium text-foreground-2 hover:bg-subtle">
          Textos padrão
        </a>
        <a href="#conta" className="whitespace-nowrap rounded-full border border-border px-3 py-1 font-medium text-foreground-2 hover:bg-subtle">
          Dados e LGPD
        </a>
      </nav>

      <Secao id="oficina" titulo="Oficina" descricao="Aparecem para o cliente no orçamento e nos documentos.">
        <OficinaForm oficina={oficina} />
      </Secao>

      <Secao id="fiscal" titulo="Dados fiscais" descricao="Aparecem nos documentos e serão usados na emissão de notas fiscais.">
        <FiscalForm fiscal={oficina} />
      </Secao>

      <Secao id="textos" titulo="Textos padrão">
        <TextosForm textos={oficina} />
      </Secao>

      <Secao
        id="conta"
        titulo="Dados da conta e saída"
        descricao="Portabilidade prometida nos Termos de Uso: baixe todos os dados da oficina em JSON e planilhas CSV."
      >
        <Card className="flex flex-col gap-3 p-5 text-[13px]">
          <p className="text-muted">
            O arquivo ZIP inclui cadastros de clientes, veículos, catálogo, ordens de serviço, financeiro, notas fiscais e trilha de auditoria. Chaves de API e certificados privados nunca entram no arquivo.
          </p>
          <div>
            <a href="/configuracoes/exportar" className={buttonClass("secondary")}>
              <Download />
              Exportar todos os dados da conta (ZIP)
            </a>
          </div>
        </Card>
      </Secao>
    </>
  );
}

function Secao({ id, titulo, descricao, children }: { id: string; titulo: ReactNode; descricao?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-36 gap-4 border-t border-border pt-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        {descricao && <p className="text-[13px] text-muted">{descricao}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
