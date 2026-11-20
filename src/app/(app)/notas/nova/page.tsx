import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { diaSP } from "@/lib/agenda-datas";
import { prepararNfseDaOS, resumoConfigFiscal } from "@/lib/fiscal/notas";
import { exigir } from "@/lib/oficina";
import { EmitirNfseForm, type DadosIniciaisNfse } from "../emitir-form";

export const metadata = { title: "Emitir NFS-e" };

export default async function NovaNotaPage({ searchParams }: { searchParams: Promise<{ osId?: string }> }) {
  const { oficina } = await exigir("emitirNota");
  const { osId } = await searchParams;

  const [cfg, prep] = await Promise.all([
    resumoConfigFiscal(oficina.id),
    osId && /^[0-9a-f-]{36}$/i.test(osId) ? prepararNfseDaOS(oficina.id, osId) : Promise.resolve(null),
  ]);

  const inicial: DadosIniciaisNfse = prep
    ? {
        osId: prep.osId,
        clienteId: prep.tomador.clienteId,
        competencia: prep.competencia,
        valorServicos: prep.valorServicos,
        valorDesconto: prep.valorDesconto,
        aliquotaIss: prep.aliquotaIss,
        issRetido: prep.issRetido,
        codigoTribNacional: prep.codigoTribNacional,
        codigoTribMunicipal: prep.codigoTribMunicipal,
        discriminacao: prep.discriminacao,
        tomador: prep.tomador,
        ambiente: prep.ambiente,
        temCertificado: prep.temCertificado,
        certificadoVencido: prep.certificadoVencido,
      }
    : {
        competencia: diaSP(new Date()),
        valorServicos: 0,
        valorDesconto: 0,
        aliquotaIss: cfg.aliquotaIss,
        issRetido: cfg.issRetidoPadrao,
        codigoTribNacional: cfg.codigoTribNacionalPadrao,
        codigoTribMunicipal: cfg.codigoTribMunicipalPadrao,
        discriminacao: "",
        tomador: { nome: "", documento: "", email: "", telefone: "" },
        ambiente: cfg.ambiente,
        temCertificado: !!cfg.certificado,
        certificadoVencido: cfg.certificado?.situacao === "vencido",
      };

  return (
    <>
      <Link href={prep ? `/ordens-servico/${prep.osId}` : "/notas"} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        {prep ? `Voltar para OS #${prep.osNumero}` : "Notas fiscais"}
      </Link>

      <PageHeader
        title={prep ? `Emitir NFS-e · OS #${prep.osNumero}` : "Emitir NFS-e avulsa"}
        description="A DPS será assinada com o certificado A1 e transmitida à NFS-e Nacional."
      />

      <Card className="p-5">
        <EmitirNfseForm inicial={inicial} />
      </Card>
    </>
  );
}
