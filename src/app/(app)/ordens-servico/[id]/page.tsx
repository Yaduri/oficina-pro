import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Avatar, Badge, Card, CardHeader, EmpresaTag, Placa, buttonClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { obterOS } from "@/lib/queries";
import { STATUS } from "@/lib/os";
import { formatBRL, formatData, formatEntrada, formatTelefone, linkWhatsApp } from "@/lib/utils";
import { STATUS_ORCAMENTO, orcamentoDesatualizado, totalItens, ultimoOrcamento, urlBase } from "@/lib/orcamento";
import { checklistDoCheckin, fotosDoCheckin } from "@/lib/checkin-dados";
import { ChecklistResumo } from "@/components/checklist-registrado";
import { ROTULO_POSICAO, type Posicao } from "@/lib/checkin";
import { urlArquivo } from "@/lib/storage";
import { MoverOS } from "../mover-os";
import { ItensOS } from "./itens";
import { OrcamentoOS, type ResumoOrcamento } from "./orcamento";

const UUID = /^[0-9a-f-]{36}$/i;

async function carregar(id: string) {
  if (!UUID.test(id)) return null;
  const { oficina, empresas, pode } = await getContexto();
  const dados = await obterOS(oficina.id, empresas.map((e) => e.id), id);
  return dados && { ...dados, oficina, pode };
}

export async function generateMetadata({ params }: PageProps<"/ordens-servico/[id]">) {
  const dados = await carregar((await params).id);
  return { title: dados ? `OS #${dados.os.numero}` : "OS" };
}

export default async function OSPage({ params }: PageProps<"/ordens-servico/[id]">) {
  const dados = await carregar((await params).id);
  if (!dados) notFound();
  const { os, veiculo, cliente, responsavel, empresa, itens, oficina, pode } = dados;
  const valores = pode("verValores");
  const fechada = os.status === "entregue" || os.status === "cancelada";
  const whats = linkWhatsApp(cliente?.telefone);
  const [fotos, checklist] = os.checkinId
    ? await Promise.all([fotosDoCheckin(os.checkinId), checklistDoCheckin(os.checkinId)])
    : [[], null];
  const orc = valores ? await ultimoOrcamento(os.id) : null;
  let resumo: ResumoOrcamento | null = null;
  if (orc) {
    const url = `${await urlBase()}/orcamento/${orc.token}`;
    const veiculoTxt = [veiculo.marca, veiculo.modelo].filter(Boolean).join(" ");
    const saudacao = cliente ? `Olá, ${cliente.nome.split(" ")[0]}!` : "Olá!";
    const texto = `${saudacao} Segue o orçamento do seu ${veiculoTxt} (${veiculo.placa}), OS #${os.numero}, no valor de ${formatBRL(Number(orc.total))}. Você pode aprovar pelo link: ${url}`;
    const aprovados = new Set(orc.itensAprovados ?? []);
    const respondido = ["aprovado", "parcial", "recusado"].includes(orc.status);
    const vencido = orc.status === "pendente" && orc.validoAte < new Date();
    resumo = {
      status: vencido ? { label: "Vencido", tom: "neutro" } : STATUS_ORCAMENTO[orc.status],
      pendente: orc.status === "pendente",
      respondido,
      url,
      whatsapp: `${whats ?? "https://wa.me/"}?text=${encodeURIComponent(texto)}`,
      enviadoEm: formatEntrada(orc.criadoEm),
      validoAte: formatData(orc.validoAte),
      vencido,
      vistoEm: orc.vistoEm ? formatEntrada(orc.vistoEm).toLowerCase() : null,
      respondidoEm: orc.respondidoEm ? formatEntrada(orc.respondidoEm).toLowerCase() : null,
      respostaNome: orc.respostaNome,
      respostaComentario: orc.respostaComentario,
      total: formatBRL(Number(orc.total)),
      totalAprovado: orc.status === "parcial" ? formatBRL(totalItens(orc.itens.filter((i) => aprovados.has(i.id)))) : null,
      recusados: respondido ? orc.itens.filter((i) => !aprovados.has(i.id)).length : 0,
      desatualizado: orcamentoDesatualizado(orc.itens, itens),
    };
  }

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
          <MoverOS osId={os.id} status={os.status} grande podeFechar={pode("fecharOS")} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Problema relatado" />
            <p className="whitespace-pre-line px-5 py-4">{os.descricao}</p>
          </Card>

          {os.checkinId && (
            <Card>
              <CardHeader
                title="Fotos de chegada"
                action={
                  <Link href={`/check-in/${os.checkinId}`} className="text-[13px] font-medium underline-offset-4 hover:underline">
                    Ver check-in
                  </Link>
                }
              />
              {fotos.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-muted">Check-in sem fotos.</p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-5 sm:p-5">
                  {fotos.map((f) => (
                    <li key={f.id}>
                      <a href={urlArquivo(f.key)} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-border bg-subtle">
                        {/* eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado servido por /arquivos */}
                        <img src={urlArquivo(f.key)} alt={ROTULO_POSICAO[f.posicao as Posicao] ?? f.posicao} className="size-full object-cover" loading="lazy" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {checklist && checklist.length > 0 && (
            <Card>
              <CardHeader
                title="Checklist de entrada"
                action={
                  <Link href={`/check-in/${os.checkinId}`} className="text-[13px] font-medium underline-offset-4 hover:underline">
                    Ver completo
                  </Link>
                }
              />
              <ChecklistResumo itens={checklist} />
            </Card>
          )}

          <Card>
            <CardHeader
              title="Peças e serviços"
              action={
                itens.length > 0 && (
                  <span className="text-[13px] text-muted">
                    {itens.filter((i) => i.concluido && !i.recusado).length}/{itens.filter((i) => !i.recusado).length} feitos
                  </span>
                )
              }
            />
            <ItensOS osId={os.id} itens={itens} editavel={!fechada && pode("editarItens")} valores={valores} marcavel={!fechada} />
          </Card>

          {valores && (
          <OrcamentoOS
            osId={os.id}
            orcamento={resumo}
            podeEnviar={!fechada && pode("orcamento")}
            semItens={itens.length === 0}
            padrao={{ observacao: oficina.obsOrcamento ?? "", dias: oficina.validadeOrcamentoDias }}
          />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
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
