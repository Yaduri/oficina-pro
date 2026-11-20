import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { exigirAdmin } from "@/lib/oficina";
import { resumoConfigFiscal } from "@/lib/fiscal/notas";
import { AbasConfig } from "../abas";
import { CertificadoForm, ParametrosFiscaisForm } from "./forms";

export const metadata = { title: "Configurações fiscais" };

export default async function ConfigFiscalPage() {
  const { oficina } = await exigirAdmin();
  const cfg = await resumoConfigFiscal(oficina.id);

  return (
    <>
      <PageHeader
        title="Configurações"
        actions={
          <Link href="/notas" className="text-[13px] font-medium underline-offset-4 hover:underline">
            Ir para Notas fiscais →
          </Link>
        }
      />

      <AbasConfig />

      {!oficina.cnpj && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[13px]">
          Cadastre o CNPJ e a razão social da oficina na aba{" "}
          <Link href="/configuracoes#fiscal" className="font-semibold underline">
            Oficina → Dados fiscais
          </Link>{" "}
          antes de emitir notas.
        </div>
      )}

      <Secao
        id="certificado"
        titulo="Certificado digital A1"
        descricao="Usado para assinar a DPS e autenticar a oficina direto na NFS-e Nacional (mTLS). Guardado criptografado no banco."
      >
        <CertificadoForm certificado={cfg.certificado} cnpjOficina={oficina.cnpj} />
      </Secao>

      <Secao
        id="nfse"
        titulo="NFS-e Nacional"
        descricao="Parâmetros usados na emissão de notas de serviço. Comece em Homologação para testar sem validade fiscal."
      >
        <ParametrosFiscaisForm inicial={cfg} cepOficina={oficina.cep} />
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
