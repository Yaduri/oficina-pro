import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Avatar, Badge, Card, CardHeader, Placa, buttonClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { eventosDaOS, fotosDaOS, listarTecnicos, obterOS } from "@/lib/queries";
import { STATUS } from "@/lib/os";
import { formatBRL, formatData, formatEntrada, formatTelefone, linkWhatsApp } from "@/lib/utils";
import { STATUS_ORCAMENTO, orcamentoDesatualizado, ultimoOrcamento, urlBase } from "@/lib/orcamento";
import { calcularTotais, totalSelecionado } from "@/lib/os-total";
import { checklistDoCheckin, fotosDoCheckin } from "@/lib/checkin-dados";
import { ChecklistResumo } from "@/components/checklist-registrado";
import { ROTULO_POSICAO, type Posicao } from "@/lib/checkin";
import { urlArquivo } from "@/lib/storage";
import { MoverOS } from "../mover-os";
import { ItensOS } from "./itens";
import { listarCatalogo } from "@/lib/catalogo";
import { OrcamentoOS, type ResumoOrcamento } from "./orcamento";
import { DadosOS } from "./dados-os";
import { EntregarOS } from "./entrega";
import { FotosServico } from "./fotos-servico";
import { AvisarCliente } from "./avisar";
import { DocumentosPdf, type DocumentoOpcao } from "@/components/documentos-pdf";
import { FORMAS, STATUS_LANCAMENTO, centavos, contaSugerida, ehForma, hojeSP, listarContas, somarDiasData } from "@/lib/financeiro";
import { situacaoRecebimento } from "@/lib/recebimento";
import { FORMAS_PAGAMENTO } from "@/lib/recebimento-regras";
import { RecebimentosOS } from "./recebimentos";

const UUID = /^[0-9a-f-]{36}$/i;

async function carregar(id: string) {
  if (!UUID.test(id)) return null;
  const { oficina, pode, userId } = await getContexto();
  const dados = await obterOS(oficina.id, id);
  return dados && { ...dados, oficina, pode, userId };
}

export async function generateMetadata({ params }: PageProps<"/ordens-servico/[id]">) {
  const dados = await carregar((await params).id);
  return { title: dados ? `OS #${dados.os.numero}` : "OS" };
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" */
const dataBR = (d: string) => d.split("-").reverse().join("/");

/** Data no formato do input type="date", no fuso de São Paulo */
const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Data de garantia sugerida na entrega (hoje + dias configurados) */
function garantiaSugerida(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return dia(d);
}

export default async function OSPage({ params }: PageProps<"/ordens-servico/[id]">) {
  const dados = await carregar((await params).id);
  if (!dados) notFound();
  const { os, veiculo, cliente, responsavel, itens, oficina, pode, userId } = dados;
  const valores = pode("verValores");
  const fechada = os.status === "entregue" || os.status === "cancelada";
  const whats = linkWhatsApp(cliente?.telefone);
  const podeItens = !fechada && pode("editarItens");
  const [[fotos, checklist], orc, fotosServico, eventos, tecnicos, catalogo] = await Promise.all([
    os.checkinId ? Promise.all([fotosDoCheckin(os.checkinId), checklistDoCheckin(os.checkinId)]) : Promise.resolve([[], null] as const),
    valores ? ultimoOrcamento(os.id) : Promise.resolve(null),
    fotosDaOS(os.id),
    eventosDaOS(os.id),
    listarTecnicos(oficina.id),
    podeItens ? listarCatalogo(oficina.id, { soAtivos: true }) : Promise.resolve([]),
  ]);
  const desconto = { percentual: os.descontoPercentual != null ? Number(os.descontoPercentual) : null, valor: Number(os.descontoValor) };

  // Recebimentos (financeiro): só para quem vê valores
  const [recebimento, contas] = valores ? await Promise.all([situacaoRecebimento(oficina.id, os), listarContas(oficina.id)]) : [null, []];
  const hoje = hojeSP();
  const formasPagamento = {
    contas: contas.map((c) => ({ id: c.id, nome: c.nome })),
    sugestoes: Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f, contaSugerida(contas, f)?.id ?? ""])),
    taxas: oficina.taxasCartao ?? null,
    formas: { ...FORMAS } as Record<string, string>,
    hoje,
  };
  const pagamentoEntrega =
    recebimento && !fechada && contas.length > 0 && recebimento.semLancamento > 0
      ? { ...formasPagamento, aReceber: recebimento.semLancamento, vencimentoPadrao: somarDiasData(hoje, 30) }
      : null;
  const pagamentosAtivos = recebimento?.pagamentos.filter((p) => !p.estornadaEm) ?? [];
  const garantiaPadrao = garantiaSugerida(oficina.garantiaDias);

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
      totalAprovado: orc.status === "parcial" ? formatBRL(totalSelecionado(orc.itens, aprovados, Number(orc.desconto)).total) : null,
      recusados: respondido ? orc.itens.filter((i) => !aprovados.has(i.id)).length : 0,
      // Itens ou desconto mudaram depois do envio
      desatualizado:
        orcamentoDesatualizado(orc.itens, itens) ||
        Math.abs(calcularTotais(itens.map((i) => ({ ...i, recusado: false })), desconto).desconto - Number(orc.desconto)) > 0.009,
    };
  }

  const veiculoTxt = [veiculo.marca, veiculo.modelo].filter(Boolean).join(" ");
  const msgPronto =
    whats &&
    `${whats}?text=${encodeURIComponent(
      `Olá${cliente ? `, ${cliente.nome.split(" ")[0]}` : ""}! Seu ${veiculoTxt} (${veiculo.placa}) está pronto para retirada na ${oficina.nomeFantasia || oficina.nome}.${
        valores && calcularTotais(itens, desconto).total > 0 ? ` Total: ${formatBRL(calcularTotais(itens, desconto).total)}.` : ""
      }`,
    )}`;

  const documentos: DocumentoOpcao[] = [
    { href: `/pdf/os/${os.id}`, label: "Ordem de serviço", detalhe: "Via do cliente" },
    { href: `/pdf/os/${os.id}?via=oficina`, label: "Ordem de serviço", detalhe: "Via da oficina, com responsável e checklist" },
    ...(valores && itens.length > 0 ? [{ href: `/pdf/orcamento/${os.id}`, label: "Orçamento", detalhe: orc ? "Como foi enviado ao cliente" : "Ainda não enviado" }] : []),
    ...(os.checkinId ? [{ href: `/pdf/termo/${os.checkinId}`, label: "Termo de entrada" }] : []),
    ...(pagamentosAtivos.length > 0 ? [{ href: `/pdf/recibo/${os.id}`, label: "Recibo" }] : []),
  ];

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
          </div>
          <p className="text-muted">
            Entrada {formatEntrada(os.entradaEm).toLowerCase()}
            {os.previsaoEntregaEm && !fechada && <> · previsão de entrega {formatData(os.previsaoEntregaEm)}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {whats && (
            <a href={whats} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <MessageCircle />WhatsApp
            </a>
          )}
          <DocumentosPdf documentos={documentos} enviar={valores ? { tipo: "os", id: os.id, label: "Enviar OS pelo WhatsApp" } : null} />
          <MoverOS osId={os.id} status={os.status} grande podeFechar={pode("fecharOS")} />
          {os.status === "pronto" && msgPronto && pode("fecharOS") && (
            <AvisarCliente osId={os.id} whatsapp={msgPronto} avisadoEm={os.clienteAvisadoEm ? formatEntrada(os.clienteAvisadoEm).toLowerCase() : null} />
          )}
          {!fechada && pode("fecharOS") && (
            <EntregarOS
              osId={os.id}
              kmEntrada={os.kmEntrada}
              garantiaPadrao={garantiaPadrao}
              textoGarantia={oficina.textoGarantia}
              pagamento={pagamentoEntrega}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DadosOS
            osId={os.id}
            descricao={os.descricao}
            responsavel={responsavel?.nome ?? null}
            kmEntrada={os.kmEntrada}
            previsao={os.previsaoEntregaEm ? dia(os.previsaoEntregaEm) : null}
            previsaoPeca={os.previsaoPecaEm ? dia(os.previsaoPecaEm) : null}
            tecnicos={tecnicos.map((t) => t.nome)}
            editavel={!fechada && pode("abrirOS")}
          />

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
            <ItensOS
              osId={os.id}
              itens={itens}
              editavel={podeItens}
              valores={valores}
              marcavel={!fechada}
              desconto={desconto}
              catalogo={catalogo.map((c) => ({ id: c.id, tipo: c.tipo, codigo: c.codigo, descricao: c.descricao, valor: c.valor }))}
            />
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

          {recebimento && (os.status === "entregue" || recebimento.lancamentos.length > 0) && (
            <RecebimentosOS
              osId={os.id}
              total={recebimento.totais.total}
              recebido={recebimento.recebido}
              aReceber={recebimento.aReceber}
              semLancamento={os.status === "entregue" ? recebimento.semLancamento : 0}
              parcelas={recebimento.lancamentos.map((l) => ({
                id: l.id,
                forma: l.forma,
                formaLabel: l.forma && ehForma(l.forma) ? FORMAS[l.forma] : "Recebimento",
                parcela: l.parcela,
                parcelas: l.parcelas,
                vencimento: dataBR(l.vencimento),
                valor: centavos(l.valor),
                pago: centavos(l.valorPago),
                status: STATUS_LANCAMENTO[l.status],
                aberta: l.status === "aberto" || l.status === "parcial",
              }))}
              pagamentos={recebimento.pagamentos.map((p) => ({
                id: p.id,
                data: dataBR(p.data),
                formaLabel: p.forma && ehForma(p.forma) ? FORMAS[p.forma] : "Pagamento",
                conta: p.conta,
                valor: p.pagoCliente,
                taxa: centavos(p.taxa),
                estornado: !!p.estornadaEm,
              }))}
              registro={os.status === "entregue" && pode("fecharOS") && contas.length > 0 ? formasPagamento : null}
              podeEstornar={pode("financeiro")}
              podeCobrar={pode("financeiro")}
            />
          )}

          <FotosServico
            osId={os.id}
            podeAdicionar={pode("checkin")}
            fotos={fotosServico.map((f) => ({
              id: f.id,
              url: urlArquivo(f.key),
              legenda: f.legenda,
              quando: formatEntrada(f.criadoEm),
              podeRemover: f.criadoPor === userId || pode("editarItens"),
            }))}
          />
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
                {os.kmSaida != null && (
                  <>
                    <dt className="text-muted">Km de saída</dt>
                    <dd className="tabular-nums">{os.kmSaida.toLocaleString("pt-BR")}</dd>
                  </>
                )}
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
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 px-5 py-4 text-[13px]">
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
              {os.previsaoEntregaEm && (
                <>
                  <dt className="text-muted">Previsão</dt>
                  <dd>{formatData(os.previsaoEntregaEm)}</dd>
                </>
              )}
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
                  {os.garantiaAte && (
                    <>
                      <dt className="text-muted">Garantia até</dt>
                      <dd>{formatData(os.garantiaAte)}</dd>
                    </>
                  )}
                </>
              )}
            </dl>
            {os.status === "entregue" && (os.entregaObs || os.entregaAssinaturaKey) && (
              <div className="flex flex-col gap-2 border-t border-border px-5 py-4 text-[13px]">
                {os.entregaObs && <p className="whitespace-pre-line">{os.entregaObs}</p>}
                {os.entregaAssinaturaKey && (
                  <>
                    <p className="text-muted">Assinatura de retirada</p>
                    {/* eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado servido por /arquivos */}
                    <img
                      src={urlArquivo(os.entregaAssinaturaKey)}
                      alt="Assinatura de retirada do cliente"
                      className="h-24 w-full rounded-md border border-border bg-white object-contain"
                    />
                  </>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Histórico" />
            {eventos.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">Sem registros.</p>
            ) : (
              <ol className="flex max-h-96 flex-col gap-3 overflow-y-auto px-5 py-4 text-[13px]">
                {eventos.map((e) => (
                  <li key={e.id} className="flex flex-col">
                    <span>{e.descricao}</span>
                    <span className="text-xs text-muted">
                      {e.usuarioNome ?? "—"} · {formatEntrada(e.criadoEm)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
