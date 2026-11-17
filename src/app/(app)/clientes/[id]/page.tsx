import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Badge, Card, CardHeader, EmpresaTag, PageHeader, Placa, Vazio, buttonClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { historicoCliente, obterCliente, usoDoCliente } from "@/lib/cadastros";
import { STATUS } from "@/lib/os";
import { formatBRL, formatData, formatDocumento, formatEndereco, formatTelefone, linkWhatsApp } from "@/lib/utils";
import { AcoesArquivo } from "../arquivar";
import { EditarClienteForm } from "../forms";
import { ListaVeiculos } from "../veiculos";

export async function generateMetadata({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const { oficina } = await getContexto();
  const c = /^[0-9a-f-]{36}$/i.test(id) ? await obterCliente(oficina.id, id) : null;
  return { title: c?.nome ?? "Cliente" };
}

export default async function ClientePage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { oficina, empresas, pode } = await getContexto();
  const editavel = pode("cadastros");
  const cliente = await obterCliente(oficina.id, id);
  if (!cliente) notFound();
  const [historico, uso] = await Promise.all([
    historicoCliente(oficina.id, empresas.map((e) => e.id), id),
    editavel ? usoDoCliente(oficina.id, id) : 0,
  ]);
  const whats = linkWhatsApp(cliente.telefone);
  const ativos = cliente.veiculos.filter((v) => !v.arquivadoEm);
  const arquivados = cliente.veiculos.filter((v) => v.arquivadoEm);
  const endereco = formatEndereco(cliente);
  const aniversario = cliente.nascimento
    ? new Date(`${cliente.nascimento}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })
    : null;

  return (
    <>
      <Link href="/clientes" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />Clientes
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {cliente.nome}
            {cliente.arquivadoEm && <Badge tom="neutro">Arquivado</Badge>}
          </span>
        }
        description={
          [
            formatTelefone(cliente.telefone),
            formatDocumento(cliente.documento),
            aniversario && `Aniversário ${aniversario}`,
            cliente.telefone && !cliente.aceitaWhatsapp && "Sem consentimento para WhatsApp",
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          whats && (
            <a href={whats} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <MessageCircle />WhatsApp
            </a>
          )
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Veículos" />
            <ListaVeiculos clienteId={cliente.id} veiculos={ativos} arquivados={arquivados} editavel={editavel} abrirOS={pode("abrirOS")} />
          </Card>

          {(endereco || cliente.observacoes) && !editavel && (
            <Card>
              <CardHeader title="Endereço e observações" />
              <div className="flex flex-col gap-2 p-5 text-sm">
                {endereco && <p>{endereco}</p>}
                {cliente.observacoes && <p className="whitespace-pre-line text-foreground-2">{cliente.observacoes}</p>}
              </div>
            </Card>
          )}

          {editavel && (
            <Card>
              <CardHeader title="Dados do cliente" />
              <div className="p-5">
                <EditarClienteForm cliente={cliente} />
              </div>
            </Card>
          )}

          {editavel && (
            <Card>
              <CardHeader title="Arquivar ou excluir" />
              <div className="p-5">
                <AcoesArquivo tipo="cliente" id={cliente.id} arquivado={!!cliente.arquivadoEm} temHistorico={uso > 0} rotulo={cliente.nome} />
              </div>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader title="Histórico de serviços" action={<span className="text-[13px] text-muted">{historico.length} OS</span>} />
          {historico.length === 0 ? (
            <Vazio titulo="Nenhuma OS ainda">Use “Abrir OS” em um dos veículos para começar.</Vazio>
          ) : (
            <ul className="divide-y divide-border">
              {historico.map((o) => (
                <li key={o.id}>
                  <Link href={`/ordens-servico/${o.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-subtle sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Placa placa={o.placa} />
                      <span className="text-[13px] font-medium">OS #{o.numero}</span>
                      <span className="text-[13px] text-muted">{formatData(o.entradaEm)}</span>
                      <span className="ml-auto font-semibold tabular-nums">{pode("verValores") && o.total > 0 ? formatBRL(o.total) : ""}</span>
                    </div>
                    <p className="text-[13px] text-foreground-2">{o.descricao}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <EmpresaTag tipo={o.empresaTipo} nome={o.empresaNome} />
                      <Badge tom={STATUS[o.status].tom}>{STATUS[o.status].label}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
