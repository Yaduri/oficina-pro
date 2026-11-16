import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, MessageCircle } from "lucide-react";
import { Badge, Card, CardHeader, EmpresaTag, Placa, buttonClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { obterCheckin } from "@/lib/checkin-dados";
import { ROTULO_POSICAO, rotuloCombustivel, type Posicao } from "@/lib/checkin";
import { STATUS } from "@/lib/os";
import { urlArquivo } from "@/lib/storage";
import { formatEndereco, formatEntrada, formatTelefone, linkWhatsApp } from "@/lib/utils";
import { TERMO_PADRAO } from "@/lib/textos";
import { Imprimir } from "./imprimir";

const UUID = /^[0-9a-f-]{36}$/i;

export const metadata = { title: "Check-in" };

export default async function CheckinPage({ params }: PageProps<"/check-in/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { oficina, empresas } = await getContexto();
  const dados = await obterCheckin(oficina.id, id);
  if (!dados) notFound();
  const { checkin, veiculo, cliente, fotos, ordens } = dados;
  const visiveis = new Set(empresas.map((e) => e.id));
  if (ordens.length > 0 && !ordens.some((o) => visiveis.has(o.empresaId))) notFound();
  const whats = linkWhatsApp(cliente?.telefone);

  return (
    <>
      <Link href="/check-in" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" />Check-in
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="hidden items-center gap-3 border-b border-border pb-3 print:flex">
            {oficina.logoKey && (
              // eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado servido por /arquivos
              <img src={urlArquivo(oficina.logoKey)} alt="" className="size-12 object-contain" />
            )}
            <div className="text-xs">
              <p className="text-sm font-semibold">{oficina.nome} · Termo de entrada do veículo</p>
              {[formatEndereco(oficina), oficina.telefone && formatTelefone(oficina.telefone)].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Placa placa={veiculo.placa} />
            <h1 className="text-[22px] font-semibold tracking-tight">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}</h1>
          </div>
          <p className="text-muted">Entrada {formatEntrada(checkin.criadoEm).toLowerCase()}</p>
        </div>
        <div className="flex flex-wrap gap-2.5 print:hidden">
          {whats && (
            <a href={whats} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <MessageCircle />WhatsApp
            </a>
          )}
          <Imprimir />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] print:block">
        <div className="flex flex-col gap-6">
          <Card className="print:break-inside-avoid">
            <CardHeader title="Fotos de chegada" action={<span className="text-[13px] text-muted">{fotos.length}</span>} />
            {fotos.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted">Nenhuma foto registrada.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 print:grid-cols-3">
                {fotos.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1.5">
                    <a href={urlArquivo(f.key)} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg border border-border bg-subtle">
                      {/* eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado servido por /arquivos */}
                      <img src={urlArquivo(f.key)} alt={ROTULO_POSICAO[f.posicao as Posicao] ?? f.posicao} className="size-full object-cover" loading="lazy" />
                    </a>
                    <span className="text-[13px] font-medium">{ROTULO_POSICAO[f.posicao as Posicao] ?? f.posicao}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="print:break-inside-avoid">
            <CardHeader title="Relato do cliente" />
            <p className="whitespace-pre-line px-5 py-4">{checkin.relato}</p>
          </Card>
        </div>

        <div className="flex flex-col gap-6 print:mt-6">
          <Card className="print:break-inside-avoid">
            <CardHeader title="Estado na chegada" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-[13px]">
              <dt className="text-muted">Km</dt>
              <dd className="tabular-nums">{checkin.km != null ? checkin.km.toLocaleString("pt-BR") : "—"}</dd>
              <dt className="text-muted">Combustível</dt>
              <dd>{rotuloCombustivel(checkin.combustivel)}</dd>
              <dt className="text-muted">Avarias</dt>
              <dd className="whitespace-pre-line">{checkin.avarias ?? "Nenhuma informada"}</dd>
              <dt className="text-muted">Objetos</dt>
              <dd className="whitespace-pre-line">{checkin.objetos ?? "Nenhum informado"}</dd>
            </dl>
          </Card>

          <Card className="print:break-inside-avoid">
            <CardHeader title="Cliente" />
            <div className="px-5 py-4 text-[13px]">
              {cliente ? (
                <Link href={`/clientes/${cliente.id}`} className="hover:underline">
                  <span className="block text-sm font-medium">{cliente.nome}</span>
                  {cliente.telefone && <span className="text-muted">{formatTelefone(cliente.telefone)}</span>}
                </Link>
              ) : (
                <span className="text-muted">Sem cliente vinculado</span>
              )}
            </div>
          </Card>

          {ordens.length > 0 && (
            <Card className="print:hidden">
              <CardHeader title="Ordens de serviço" />
              <ul className="divide-y divide-border">
                {ordens.map((o) => (
                  <li key={o.id}>
                    <Link href={`/ordens-servico/${o.id}`} className="flex flex-wrap items-center gap-2 px-5 py-3 hover:bg-subtle">
                      <span className="font-medium">OS #{o.numero}</span>
                      <EmpresaTag tipo={o.empresaTipo} nome={o.empresaNome} />
                      <Badge tom={STATUS[o.status].tom} className="ml-auto">
                        {STATUS[o.status].label}
                      </Badge>
                      <ArrowUpRight className="size-4 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="print:break-inside-avoid">
            <CardHeader title="Assinatura do cliente" />
            <div className="px-5 py-4">
              {checkin.assinaturaKey ? (
                // eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado servido por /arquivos
                <img src={urlArquivo(checkin.assinaturaKey)} alt={`Assinatura de ${cliente?.nome ?? "cliente"}`} className="h-28 w-full rounded-md border border-border bg-white object-contain" />
              ) : (
                <p className="text-[13px] text-muted">O cliente não assinou.</p>
              )}
              <p className="mt-2 whitespace-pre-line text-xs text-muted">{checkin.termo ?? oficina.textoTermoCheckin ?? TERMO_PADRAO}</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
