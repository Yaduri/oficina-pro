import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCode2, FileText } from "lucide-react";
import { Badge, Card, CardHeader, Placa, buttonClass } from "@/components/ui";
import { obterNotaDetalhe, resumoConfigFiscal } from "@/lib/fiscal/notas";
import { STATUS_NOTA_LABEL } from "@/lib/fiscal/tipos";
import { textoDaOficina } from "@/lib/fila-mensagens";
import { nomeVeiculo, primeiroNome } from "@/lib/mensagens";
import { exigir } from "@/lib/oficina";
import { urlBase } from "@/lib/orcamento";
import { linkPublico } from "@/lib/pdf/carregar";
import { formatBRL, formatData, formatDocumento, formatEntrada, formatTelefone } from "@/lib/utils";
import { AcoesNota, CopiarChave } from "./acoes";
import type { DadosIniciaisNfse } from "../emitir-form";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: PageProps<"/notas/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Nota fiscal" };
  const { oficina } = await exigir("fiscal");
  const det = await obterNotaDetalhe(oficina.id, id);
  return { title: det ? `NFS-e ${det.nota.numeroNota ?? `DPS #${det.nota.numeroDps}`}` : "Nota fiscal" };
}

export default async function NotaDetalhePage({ params }: PageProps<"/notas/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { oficina, pode } = await exigir("fiscal");
  const [det, cfg] = await Promise.all([obterNotaDetalhe(oficina.id, id), resumoConfigFiscal(oficina.id)]);
  if (!det) notFound();

  const { nota, osNumero, placa, veiculoMarca, veiculoModelo } = det;
  const st = STATUS_NOTA_LABEL[nota.status];
  const tokenPublico = nota.status === "autorizada" ? await linkPublico(oficina.id, "nota", nota.id) : null;
  const linkPdfPublico = tokenPublico ? `${await urlBase()}/documento/${tokenPublico}` : "";

  const textoWhatsapp = textoDaOficina(oficina, "nota_fiscal", {
    cliente: primeiroNome(nota.tomadorNome),
    nota: nota.numeroNota ?? `DPS ${nota.numeroDps}`,
    os: osNumero ? String(osNumero) : undefined,
    veiculo: nomeVeiculo({ marca: veiculoMarca, modelo: veiculoModelo }) || undefined,
    placa: placa ?? undefined,
    total: formatBRL(Number(nota.valorLiquido)),
    link: linkPdfPublico,
  });

  const assuntoEmail = `Nota Fiscal nº ${nota.numeroNota ?? nota.numeroDps} — ${oficina.nomeFantasia || oficina.nome}`;
  const corpoEmail = textoWhatsapp;

  const dadosSubstituicao: DadosIniciaisNfse | null =
    nota.status === "autorizada" && nota.chaveAcesso
      ? {
          osId: nota.osId,
          clienteId: nota.clienteId,
          competencia: nota.competencia,
          valorServicos: Number(nota.valorServicos),
          valorDesconto: Number(nota.valorDesconto),
          aliquotaIss: nota.aliquotaIss != null ? Number(nota.aliquotaIss) : null,
          issRetido: nota.issRetido,
          codigoTribNacional: nota.codigoTribNacional,
          codigoTribMunicipal: nota.codigoTribMunicipal ?? "",
          discriminacao: nota.discriminacao,
          tomador: {
            nome: nota.tomadorNome,
            documento: nota.tomadorDocumento ?? "",
            email: nota.tomadorEmail ?? "",
            telefone: nota.tomadorTelefone ?? "",
            cep: nota.tomadorEndereco?.cep ?? "",
            logradouro: nota.tomadorEndereco?.logradouro ?? "",
            numero: nota.tomadorEndereco?.numero ?? "",
            complemento: nota.tomadorEndereco?.complemento ?? "",
            bairro: nota.tomadorEndereco?.bairro ?? "",
            cidade: nota.tomadorEndereco?.cidade ?? "",
            uf: nota.tomadorEndereco?.uf ?? "",
          },
          ambiente: nota.ambiente,
          temCertificado: !!cfg.certificado,
          certificadoVencido: cfg.certificado?.situacao === "vencido",
          substituicao: {
            notaAnteriorId: nota.id,
            chaveSubstituida: nota.chaveAcesso,
            numeroAnterior: nota.numeroNota ?? `DPS #${nota.numeroDps}`,
          },
        }
      : null;

  return (
    <>
      <Link href="/notas" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Notas fiscais
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold tracking-tight">
              {nota.numeroNota ? `NFS-e nº ${nota.numeroNota}` : `DPS ${nota.serieDps}/${nota.numeroDps}`}
            </h1>
            <Badge tom={st.tom}>{st.label}</Badge>
            <Badge tom={nota.ambiente === "producao" ? "info" : "warn"}>
              {nota.ambiente === "producao" ? "Produção" : "Homologação"}
            </Badge>
          </div>
          <p className="text-[13px] text-muted">
            Competência {nota.competencia.split("-").reverse().join("/")}
            {nota.emitidaEm && ` · emitida ${formatEntrada(nota.emitidaEm).toLowerCase()}`}
            {nota.tentativas > 0 && ` · ${nota.tentativas} ${nota.tentativas === 1 ? "tentativa" : "tentativas"}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a href={`/notas/${nota.id}/danfse`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <FileText />
            DANFSe (PDF)
          </a>
          {nota.xmlNotaKey && (
            <a href={`/notas/${nota.id}/xml?tipo=nfse`} className={buttonClass("secondary")}>
              <FileCode2 />
              XML NFS-e
            </a>
          )}
          {nota.xmlDpsKey && (
            <a href={`/notas/${nota.id}/xml?tipo=dps`} className={buttonClass("secondary")}>
              <FileCode2 />
              XML DPS
            </a>
          )}
          {nota.xmlCancelamentoKey && (
            <a href={`/notas/${nota.id}/xml?tipo=cancelamento`} className={buttonClass("secondary")}>
              <FileCode2 />
              XML Cancelamento
            </a>
          )}
        </div>
      </div>

      {/* Ações fiscais e envio */}
      <AcoesNota
        notaId={nota.id}
        osId={nota.osId}
        clienteId={nota.clienteId}
        status={nota.status}
        chaveAcesso={nota.chaveAcesso}
        podeEmitir={pode("emitirNota")}
        podeMensagens={pode("mensagens")}
        tomadorTelefone={nota.tomadorTelefone}
        tomadorEmail={nota.tomadorEmail}
        textoWhatsapp={textoWhatsapp}
        assuntoEmail={assuntoEmail}
        corpoEmail={corpoEmail}
        dadosSubstituicao={dadosSubstituicao}
      />

      {/* Erro / rejeição / fila */}
      {nota.ultimaMensagem && nota.status !== "autorizada" && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-4 text-[13px]">
          <p className="font-semibold text-danger">Retorno da SEFIN Nacional</p>
          <p className="mt-1">{nota.ultimaMensagem}</p>
          {nota.erros && nota.erros.length > 1 && (
            <ul className="mt-2 list-disc pl-5 text-foreground-2">
              {nota.erros.slice(1).map((e, i) => (
                <li key={i}>{e.codigo ? `[${e.codigo}] ${e.mensagem}` : e.mensagem}</li>
              ))}
            </ul>
          )}
          {nota.status === "fila" && nota.proximaTentativaEm && (
            <p className="mt-2 text-muted">Próxima tentativa automática prevista após {formatEntrada(nota.proximaTentativaEm).toLowerCase()}.</p>
          )}
        </div>
      )}

      {/* Cancelamento / substituição */}
      {nota.status === "cancelada" && (
        <div className="rounded-lg border border-border bg-subtle p-4 text-[13px]">
          <p className="font-semibold">Nota cancelada{nota.canceladaEm ? ` em ${formatData(nota.canceladaEm)}` : ""}</p>
          {nota.motivoCancelamento && <p className="mt-1 text-foreground-2">Motivo: {nota.motivoCancelamento}</p>}
        </div>
      )}

      {(nota.substituidaPorId || nota.substituiNotaId) && (
        <div className="rounded-lg border border-border bg-subtle px-4 py-3 text-[13px]">
          {nota.substituidaPorId && (
            <p>
              Esta nota foi substituída pela{" "}
              <Link href={`/notas/${nota.substituidaPorId}`} className="font-semibold underline">
                nova NFS-e →
              </Link>
            </p>
          )}
          {nota.substituiNotaId && (
            <p>
              Esta nota substitui a{" "}
              <Link href={`/notas/${nota.substituiNotaId}`} className="font-semibold underline">
                NFS-e anterior
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          {nota.chaveAcesso && (
            <Card>
              <CardHeader title="Chave de acesso" action={<CopiarChave chave={nota.chaveAcesso} />} />
              <div className="px-5 py-4">
                <p className="break-all font-mono text-[13px]">{nota.chaveAcesso}</p>
                <p className="mt-1 text-[12px] text-muted">
                  ID DPS: {nota.idDps}
                  {nota.codigoVerificacao ? ` · Verificação: ${nota.codigoVerificacao}` : ""}
                </p>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Discriminação dos serviços" />
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
                <span>Cód. Tributação Nacional: <strong className="text-foreground">{nota.codigoTribNacional}</strong></span>
                {nota.codigoTribMunicipal && <span>Cód. Municipal: <strong className="text-foreground">{nota.codigoTribMunicipal}</strong></span>}
                <span>ISS: <strong className="text-foreground">{nota.issRetido ? "Retido pelo tomador" : "Recolhido pelo prestador"}</strong></span>
              </div>
              <p className="whitespace-pre-line text-[14px]">{nota.discriminacao}</p>
            </div>
          </Card>

          {nota.ibsCbs && (
            <Card>
              <CardHeader title="Reforma Tributária — IBS / CBS" />
              <dl className="grid grid-cols-2 gap-3 px-5 py-4 text-[13px] sm:grid-cols-3">
                <div><dt className="text-muted">Finalidade</dt><dd>{nota.ibsCbs.finNFSe ?? "0"}</dd></div>
                <div><dt className="text-muted">CST</dt><dd>{nota.ibsCbs.cst ?? "—"}</dd></div>
                <div><dt className="text-muted">Class. Trib.</dt><dd>{nota.ibsCbs.cClassTrib ?? "—"}</dd></div>
                {nota.ibsCbs.pIbsUf != null && <div><dt className="text-muted">IBS UF</dt><dd>{nota.ibsCbs.pIbsUf}%</dd></div>}
                {nota.ibsCbs.pIbsMun != null && <div><dt className="text-muted">IBS Mun.</dt><dd>{nota.ibsCbs.pIbsMun}%</dd></div>}
                {nota.ibsCbs.pCbs != null && <div><dt className="text-muted">CBS</dt><dd>{nota.ibsCbs.pCbs}%</dd></div>}
              </dl>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Valores" />
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 px-5 py-4 text-[13px]">
              <dt className="text-muted">Serviços</dt>
              <dd className="tabular-nums">{formatBRL(Number(nota.valorServicos))}</dd>
              {Number(nota.valorDesconto) > 0 && (
                <>
                  <dt className="text-muted">Desconto</dt>
                  <dd className="tabular-nums">- {formatBRL(Number(nota.valorDesconto))}</dd>
                </>
              )}
              <dt className="text-muted">Base de cálculo</dt>
              <dd className="tabular-nums">{formatBRL(Number(nota.baseCalculo))}</dd>
              <dt className="text-muted">
                ISS {nota.aliquotaIss != null ? `(${Number(nota.aliquotaIss).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%)` : ""}
              </dt>
              <dd className="tabular-nums">{formatBRL(Number(nota.valorIss))}</dd>
              {Number(nota.valorRetencoes) > 0 && (
                <>
                  <dt className="text-muted">Retenções</dt>
                  <dd className="tabular-nums">- {formatBRL(Number(nota.valorRetencoes))}</dd>
                </>
              )}
              <dt className="border-t border-border pt-2 font-semibold">Valor líquido</dt>
              <dd className="border-t border-border pt-2 font-semibold tabular-nums">{formatBRL(Number(nota.valorLiquido))}</dd>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Tomador" />
            <dl className="flex flex-col gap-2 px-5 py-4 text-[13px]">
              <div>
                <dt className="text-muted">Nome</dt>
                <dd className="font-medium">{nota.tomadorNome}</dd>
              </div>
              {nota.tomadorDocumento && (
                <div>
                  <dt className="text-muted">CPF / CNPJ</dt>
                  <dd>{formatDocumento(nota.tomadorDocumento)}</dd>
                </div>
              )}
              {nota.tomadorEmail && (
                <div>
                  <dt className="text-muted">E-mail</dt>
                  <dd>{nota.tomadorEmail}</dd>
                </div>
              )}
              {nota.tomadorTelefone && (
                <div>
                  <dt className="text-muted">Telefone</dt>
                  <dd>{formatTelefone(nota.tomadorTelefone)}</dd>
                </div>
              )}
            </dl>
          </Card>

          {osNumero && nota.osId && (
            <Card>
              <CardHeader title="Ordem de serviço" />
              <div className="flex items-center justify-between gap-2 px-5 py-4 text-[13px]">
                <Link href={`/ordens-servico/${nota.osId}`} className="font-semibold underline-offset-4 hover:underline">
                  OS #{osNumero}
                </Link>
                {placa && <Placa placa={placa} />}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
