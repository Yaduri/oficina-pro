import { PageHeader } from "@/components/ui";
import { exigirAdmin } from "@/lib/oficina";
import { EXEMPLO_VARIAVEIS } from "@/lib/mensagens";
import { varsOficina } from "@/lib/fila-mensagens";
import { AbasConfig } from "../abas";
import { ModelosForm } from "./form";

export const metadata = { title: "Mensagens" };

export default async function MensagensConfigPage() {
  const { oficina } = await exigirAdmin();

  return (
    <>
      <PageHeader title="Configurações" />
      <AbasConfig />
      <p className="text-[13px] text-muted">
        Textos que o sistema prepara para o WhatsApp. As variáveis entre chaves são trocadas pelos dados de cada cliente.
      </p>
      <ModelosForm
        modelos={oficina.modelosMensagem}
        posVendaDias={oficina.posVendaDias}
        exemplo={{ ...EXEMPLO_VARIAVEIS, ...varsOficina(oficina) }}
      />
    </>
  );
}
