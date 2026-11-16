import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Avatar, Badge, Card, CardHeader, EmpresaTag, Placa, buttonClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { obterOS } from "@/lib/queries";
import { STATUS } from "@/lib/os";
import { formatData, formatEntrada, formatTelefone, linkWhatsApp } from "@/lib/utils";
import { MoverOS } from "../mover-os";
import { ItensOS } from "./itens";

const UUID = /^[0-9a-f-]{36}$/i;

async function carregar(id: string) {
  if (!UUID.test(id)) return null;
  const { oficina, empresas } = await getContexto();
  return obterOS(oficina.id, empresas.map((e) => e.id), id);
}

export async function generateMetadata({ params }: PageProps<"/ordens-servico/[id]">) {
  const dados = await carregar((await params).id);
  return { title: dados ? `OS #${dados.os.numero}` : "OS" };
}

export default async function OSPage({ params }: PageProps<"/ordens-servico/[id]">) {
  const dados = await carregar((await params).id);
  if (!dados) notFound();
  const { os, veiculo, cliente, responsavel, empresa, itens } = dados;
  const fechada = os.status === "entregue" || os.status === "cancelada";
  const whats = linkWhatsApp(cliente?.telefone);

  return (
    <>
      <Link href="/ordens-servico" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />Ordens de serviço
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold tracking-tight">OS #{os.numero}</h1>
            <Badge tom={STATUS[os.status].tom}>{STATUS[os.status].label}</Badge>
            <EmpresaTag tipo={empresa.tipo} nome={empresa.nome} />
          </div>
          <p className="text-muted">Entrada {formatEntrada(os.entradaEm).toLowerCase()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {whats && (
            <a href={whats} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <MessageCircle />WhatsApp
            </a>
          )}
          <MoverOS osId={os.id} status={os.status} grande />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Problema relatado" />
            <p className="whitespace-pre-line px-5 py-4">{os.descricao}</p>
          </Card>

          <Card>
            <CardHeader
              title="Peças e serviços"
              action={
                itens.length > 0 && (
                  <span className="text-[13px] text-muted">
                    {itens.filter((i) => i.concluido).length}/{itens.length} feitos
                  </span>
                )
              }
            />
            <ItensOS osId={os.id} itens={itens} editavel={!fechada} />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Veículo" />
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center gap-3">
                <Placa placa={veiculo.placa} />
                <span className="font-medium">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}</span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                {veiculo.ano && (
                  <>
                    <dt className="text-muted">Ano</dt>
                    <dd>{veiculo.ano}</dd>
                  </>
                )}
                {veiculo.cor && (
                  <>
                    <dt className="text-muted">Cor</dt>
                    <dd>{veiculo.cor}</dd>
                  </>
                )}
                <dt className="text-muted">Km de entrada</dt>
                <dd className="tabular-nums">{os.kmEntrada != null ? os.kmEntrada.toLocaleString("pt-BR") : "—"}</dd>
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Cliente" />
            <div className="px-5 py-4">
              {cliente ? (
                <Link href={`/clientes/${cliente.id}`} className="flex items-center gap-3 rounded-md hover:underline">
                  <Avatar nome={cliente.nome} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{cliente.nome}</span>
                    {cliente.telefone && <span className="block text-[13px] text-muted">{formatTelefone(cliente.telefone)}</span>}
                  </span>
                </Link>
              ) : (
                <p className="text-[13px] text-muted">Sem cliente vinculado</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Andamento" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-[13px]">
              <dt className="text-muted">Responsável</dt>
              <dd className="flex items-center gap-1.5">
                {responsavel ? (
                  <>
                    <Avatar nome={responsavel.nome} size="sm" />
                    {responsavel.nome}
                  </>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted">Entrada</dt>
              <dd>{formatData(os.entradaEm)}</dd>
              {os.aprovacaoEnviadaEm && (
                <>
                  <dt className="text-muted">Orçamento enviado</dt>
                  <dd>{formatEntrada(os.aprovacaoEnviadaEm)}</dd>
                </>
              )}
              {os.entregueEm && os.status === "entregue" && (
                <>
                  <dt className="text-muted">Entregue</dt>
                  <dd>{formatEntrada(os.entregueEm)}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
