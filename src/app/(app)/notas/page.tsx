import Link from "next/link";
import { FileCode2, FileText, Plus, Settings, ShieldAlert } from "lucide-react";
import { Badge, Card, PageHeader, Placa, Vazio, buttonClass } from "@/components/ui";
import { diaSP } from "@/lib/agenda-datas";
import { listarNotas, resumoConfigFiscal } from "@/lib/fiscal/notas";
import { STATUS_NOTA_LABEL } from "@/lib/fiscal/tipos";
import { exigir } from "@/lib/oficina";
import { formatBRL, formatData, formatDocumento } from "@/lib/utils";
import { FiltrosNotas } from "./filtros";

export const metadata = { title: "Notas fiscais" };

export default async function NotasPage({ searchParams }: { searchParams: Promise<{ mes?: string; status?: string; busca?: string }> }) {
  const { oficina, pode, papel } = await exigir("fiscal");
  const sp = await searchParams;
  const mesAtual = diaSP(new Date()).slice(0, 7);
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesAtual;
  const status = sp.status ?? "";
  const busca = sp.busca ?? "";

  const [lista, cfg] = await Promise.all([listarNotas(oficina.id, { mes, status, busca }), resumoConfigFiscal(oficina.id)]);

  const autorizadas = lista.filter((r) => r.nota.status === "autorizada");
  const totalAutorizado = autorizadas.reduce((s, r) => s + Number(r.nota.valorLiquido), 0);
  const totalIss = autorizadas.reduce((s, r) => s + Number(r.nota.valorIss), 0);
  const qtdFila = lista.filter((r) => r.nota.status === "fila" || r.nota.status === "processando").length;
  const qtdProblemas = lista.filter((r) => r.nota.status === "rejeitada" || r.nota.status === "cancelada").length;

  const podeEmitir = pode("emitirNota");
  const podeConfig = pode("configurar");

  return (
    <>
      <PageHeader
        title="Notas fiscais"
        description={papel === "contador" ? `Acesso do contador (somente leitura) · ${oficina.razaoSocial || oficina.nome}` : "Emissão de NFS-e direto na NFS-e Nacional e exportação mensal."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {podeConfig && (
              <Link href="/configuracoes/fiscal" className={buttonClass("secondary")}>
                <Settings />
                Configurar fiscal
              </Link>
            )}
            {podeEmitir && (
              <Link href="/notas/nova" className={buttonClass("primary")}>
                <Plus />
                Emitir NFS-e
              </Link>
            )}
          </div>
        }
      />

      {/* Alertas de configuração/certificado */}
      {podeConfig && (!cfg.certificado || cfg.certificado.situacao === "vencido" || cfg.certificado.situacao === "vencendo") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[13px]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0 text-warn" aria-hidden />
            <span>
              {!cfg.certificado
                ? "Certificado digital A1 ainda não cadastrado. Cadastre o .pfx/.p12 para transmitir notas na NFS-e Nacional."
                : cfg.certificado.situacao === "vencido"
                  ? "Seu certificado digital A1 está vencido. Envie um novo arquivo para continuar emitindo."
                  : `Seu certificado digital A1 vence em ${cfg.certificado.diasRestantes} dias (${formatData(cfg.certificado.validoAte!)}).`}
            </span>
          </div>
          <Link href="/configuracoes/fiscal" className="font-semibold underline underline-offset-4">
            Configurar certificado
          </Link>
        </div>
      )}

      {/* KPIs do período */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Autorizadas no mês" value={formatBRL(totalAutorizado)} detalhe={`${autorizadas.length} ${autorizadas.length === 1 ? "nota" : "notas"}`} />
        <Kpi label="ISS apurado" value={formatBRL(totalIss)} detalhe={cfg.ambiente === "homologacao" ? "Ambiente: Homologação" : "Ambiente: Produção"} />
        <Kpi label="Na fila" value={String(qtdFila)} detalhe="Aguardando transmissão" />
        <Kpi label="Rejeitadas / canceladas" value={String(qtdProblemas)} detalhe="No período filtrado" />
      </div>

      <FiltrosNotas mes={mes} status={status} busca={busca} qtdFila={qtdFila} podeEmitir={podeEmitir} />

      <Card className="overflow-hidden">
        {lista.length === 0 ? (
          <Vazio titulo="Nenhuma nota fiscal neste período">
            {podeEmitir
              ? "Emita uma NFS-e a partir de uma ordem de serviço entregue ou clique em “Emitir NFS-e”."
              : "Nenhuma nota fiscal emitida na competência selecionada."}
          </Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Nota / DPS</th>
                  <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Tomador</th>
                  <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">OS</th>
                  <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Situação</th>
                  <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Valor</th>
                  <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Arquivos</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(({ nota, osNumero, placa }) => {
                  const st = STATUS_NOTA_LABEL[nota.status];
                  return (
                    <tr key={nota.id} className="hover:bg-subtle [&:not(:last-child)>td]:border-b [&>td]:border-border">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/notas/${nota.id}`} className="font-medium underline-offset-4 hover:underline">
                          {nota.numeroNota ? `NFS-e nº ${nota.numeroNota}` : `DPS #${nota.numeroDps}`}
                        </Link>
                        <div className="flex items-center gap-1.5 text-[12px] text-muted">
                          <span>{nota.competencia.split("-").reverse().join("/")}</span>
                          {nota.ambiente === "homologacao" && <span className="rounded bg-warn-soft px-1 text-[11px] font-medium text-foreground">Homologação</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[240px] truncate font-medium">{nota.tomadorNome}</div>
                        <div className="text-[12px] text-muted">{nota.tomadorDocumento ? formatDocumento(nota.tomadorDocumento) : "Sem CPF/CNPJ"}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {osNumero && nota.osId ? (
                          <Link href={`/ordens-servico/${nota.osId}`} className="inline-flex items-center gap-2 hover:underline">
                            <span>OS #{osNumero}</span>
                            {placa && <Placa placa={placa} />}
                          </Link>
                        ) : (
                          <span className="text-muted">Avulsa</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge tom={st.tom}>{st.label}</Badge>
                        {nota.ultimaMensagem && nota.status !== "autorizada" && (
                          <p className="mt-1 max-w-[220px] truncate text-[12px] text-muted" title={nota.ultimaMensagem}>
                            {nota.ultimaMensagem}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                        {formatBRL(Number(nota.valorLiquido))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={`/notas/${nota.id}/danfse`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] font-medium hover:bg-card"
                            title="Abrir DANFSe em PDF"
                          >
                            <FileText className="size-3.5" aria-hidden />
                            PDF
                          </a>
                          {(nota.xmlNotaKey || nota.xmlDpsKey) && (
                            <a
                              href={`/notas/${nota.id}/xml`}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] font-medium hover:bg-card"
                              title="Baixar XML"
                            >
                              <FileCode2 className="size-3.5" aria-hidden />
                              XML
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Kpi({ label, value, detalhe }: { label: string; value: string; detalhe: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4 sm:p-5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <span className="text-[22px] font-semibold tracking-tight tabular-nums sm:text-[24px]">{value}</span>
      <span className="text-[12px] text-muted">{detalhe}</span>
    </Card>
  );
}
