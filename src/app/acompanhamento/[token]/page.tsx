import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Check, CheckCircle2, Clock, Download, FileText, MapPin, MessageCircle, Phone, ShieldCheck, XCircle } from "lucide-react";
import { getDbSistema, schema } from "@/db";
import { Badge, Placa, buttonClass } from "@/components/ui";
import { acompanhamentoPorToken, dadosAcompanhamento, linhaDoTempo, type EtapaCliente } from "@/lib/acompanhamento";
import { COM_TOTAL_CLIENTE, STATUS_CLIENTE } from "@/lib/os";
import { totalSelecionado } from "@/lib/os-total";
import { identificacao } from "@/lib/identificacao";
import { linkMensagem } from "@/lib/mensagens";
import { textoAvisoOficina } from "@/lib/fila-mensagens";
import { cn, formatBRL, formatData, linkWhatsApp } from "@/lib/utils";
import { ipAtual, verificarLimite } from "@/lib/rate-limit";
import { RespostaOrcamento } from "@/app/orcamento/[token]/resposta";
import { AvisarOficina } from "@/app/orcamento/[token]/avisar-oficina";

export const metadata: Metadata = { title: "Acompanhe seu serviço", robots: { index: false, follow: false } };

const TZ = "America/Sao_Paulo";
const DIA = 86_400_000;
const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** "23/11/2026 às 14:05" */
function dataHora(d: Date) {
  const dia = d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

export default async function Acompanhamento({ params }: PageProps<"/acompanhamento/[token]">) {
  const lim = await verificarLimite({ chave: `acomp-view:${await ipAtual()}`, limite: 60, janelaSeg: 600 });
  if (!lim.permitido) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-[18px] font-semibold">Muitas tentativas</h1>
        <p className="text-[14px] text-muted">Aguarde {lim.retryAfterSeg} segundos e recarregue a página.</p>
      </div>
    );
  }
  const { token } = await params;
  const base = await acompanhamentoPorToken(token);
  if (!base) notFound();
  const { os, veiculo, cliente, oficina } = base;
  const dados = await dadosAcompanhamento(oficina.id, os.id, os.status, {
    percentual: os.descontoPercentual != null ? Number(os.descontoPercentual) : null,
    valor: Number(os.descontoValor),
  });

  const agora = new Date();
  const osFechada = os.status === "cancelada" || os.status === "entregue";
  // Orçamento à espera do cliente: o mais recente pendente (um complementar substitui o pendente anterior)
  const pendente = [...dados.orcamentos].reverse().find((o) => o.status === "pendente") ?? null;
  const vencido = !!pendente && pendente.validoAte < agora;
  const aberto = !!pendente && !vencido && !osFechada;
  const respondidos = dados.orcamentos.filter((o) => o.status === "aprovado" || o.status === "parcial" || o.status === "recusado");
  const complementar = aberto && respondidos.some((o) => o.status !== "recusado");
  const ultimo = dados.orcamentos.at(-1) ?? null;
  // Logo depois de responder: confirmação e botão para avisar a oficina
  const respostaRecente =
    ultimo && ultimo.respondidoEm && respondidos.includes(ultimo) && agora.getTime() - ultimo.respondidoEm.getTime() < 3 * DIA ? ultimo : null;

  // Primeira visualização do orçamento pelo cliente
  if (aberto && !pendente.vistoEm) {
    const db = await getDbSistema();
    await db
      .update(schema.orcamentos)
      .set({ vistoEm: new Date() })
      .where(and(eq(schema.orcamentos.id, pendente.id), eq(schema.orcamentos.oficinaId, oficina.id), isNull(schema.orcamentos.vistoEm)));
  }

  const id = identificacao(oficina);
  const whatsOficina = linkWhatsApp(oficina.whatsapp);
  const telefoneAviso = linkWhatsApp(oficina.whatsapp) ? oficina.whatsapp : linkWhatsApp(oficina.telefone) ? oficina.telefone : null;
  const tel = id.telefone ? `tel:${id.telefone.replace(/\D/g, "")}` : null;
  const mapa = id.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(id.endereco)}` : null;
  const status = STATUS_CLIENTE[os.status];
  const linha = linhaDoTempo(os.status, dados.historico, { entradaEm: os.entradaEm, entregueEm: os.entregueEm });
  const mostrarTotal = COM_TOTAL_CLIENTE.includes(os.status) && dados.total > 0;
  const nomeCarro = [veiculo.marca, veiculo.modelo, veiculo.ano].filter(Boolean).join(" ");
  const garantiaAte = os.status === "entregue" ? os.garantiaAte : null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3.5">
            {oficina.logoKey && (
              // eslint-disable-next-line @next/next/no-img-element -- servida pela rota do próprio link
              <img src={`/acompanhamento/${token}/logo`} alt="" className="size-14 shrink-0 rounded-md object-contain" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{id.titulo}</p>
              {id.endereco && <p className="text-[13px] text-muted">{id.endereco}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-[22px] font-semibold tracking-tight">OS #{os.numero}</h1>
              <Badge tom={status.tom} className="w-fit">
                {status.label}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {whatsOficina && (
                <a href={whatsOficina} target="_blank" rel="noreferrer" className={buttonClass("secondary", "h-10")}>
                  <MessageCircle />
                  Falar com a oficina
                </a>
              )}
              {tel && (
                <a href={tel} className={buttonClass("secondary", "h-10")}>
                  <Phone />
                  {id.telefone}
                </a>
              )}
            </div>
          </div>
        </header>

        <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-4 shadow-card sm:px-5">
          <Placa placa={veiculo.placa} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{nomeCarro || "Veículo"}</p>
            <p className="text-[13px] text-muted">
              {cliente?.nome ?? "Cliente"} · Entrada {formatData(os.entradaEm)}
              {os.kmEntrada != null && ` · ${os.kmEntrada.toLocaleString("pt-BR")} km`}
            </p>
          </div>
        </section>

        {respostaRecente && !aberto && (
          <div
            role="status"
            className={cn(
              "flex gap-3 rounded-lg border p-4",
              respostaRecente.status === "recusado" ? "border-danger/30 bg-danger-soft" : "border-ok/30 bg-ok-soft",
            )}
          >
            {respostaRecente.status === "recusado" ? (
              <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
            )}
            <div className="text-[14px]">
              <p className="font-semibold">
                {respostaRecente.status === "recusado"
                  ? "Orçamento recusado"
                  : respostaRecente.status === "parcial"
                    ? "Orçamento aprovado em parte"
                    : "Orçamento aprovado"}
              </p>
              <p className="text-foreground-2">
                {respostaRecente.status === "recusado" ? "A oficina vai entrar em contato." : "A oficina vai seguir com o serviço. Acompanhe por aqui."}
              </p>
              {telefoneAviso && (
                <div className="mt-3">
                  <AvisarOficina
                    token={respostaRecente.token}
                    href={linkMensagem(telefoneAviso, textoAvisoOficina({ orcamento: respostaRecente, os, veiculo, cliente, oficina }))}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {aberto && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-[18px] font-semibold">{complementar ? "Orçamento complementar para aprovação" : "Orçamento para aprovação"}</h2>
              <p className="text-[14px] text-foreground-2">
                {complementar
                  ? "A oficina encontrou mais itens. Confira e aprove o que quiser fazer."
                  : "Confira as peças e os serviços. Você pode aprovar tudo ou só parte."}
              </p>
            </div>
            {!complementar && (
              <div className="rounded-lg border border-border bg-card shadow-card">
                <h3 className="border-b border-border px-4 py-3 text-[15px] font-semibold sm:px-5">Problema relatado</h3>
                <p className="whitespace-pre-line px-4 py-3 text-[14px] sm:px-5">{os.descricao}</p>
              </div>
            )}
            {pendente.observacao && (
              <div className="rounded-lg border border-border bg-card p-4 shadow-card sm:px-5">
                <h3 className="mb-1 text-[13px] font-semibold text-foreground-2">Observações da oficina</h3>
                <p className="whitespace-pre-line text-[14px]">{pendente.observacao}</p>
              </div>
            )}
            <RespostaOrcamento token={pendente.token} itens={pendente.itens} desconto={Number(pendente.desconto)} nomeInicial={cliente?.nome ?? ""} />
            <p className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                Válido até {formatData(pendente.validoAte)}
              </span>
              <a href={`/orcamento/${pendente.token}/pdf?baixar=1`} className={buttonClass("ghost")}>
                <Download />
                Baixar PDF do orçamento
              </a>
            </p>
          </section>
        )}
        {pendente && vencido && !osFechada && (
          <Aviso>O orçamento venceu em {formatData(pendente.validoAte)}. Fale com a oficina para receber um novo.</Aviso>
        )}

        {os.status === "pronto" && (
          <section className="flex flex-col gap-4 rounded-lg border border-ok/30 bg-ok-soft p-5">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-ok" aria-hidden />
              <div className="flex flex-col gap-1">
                <h2 className="text-[18px] font-semibold">Seu veículo está pronto para retirada</h2>
                {id.endereco && <p className="text-[14px] text-foreground-2">{id.endereco}</p>}
                {mostrarTotal && <p className="text-[14px] font-medium">Total: {formatBRL(dados.total)}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {whatsOficina && (
                <a href={whatsOficina} target="_blank" rel="noreferrer" className={buttonClass("primary", "h-12 text-[15px] sm:h-10 sm:text-sm")}>
                  <MessageCircle />
                  Combinar a retirada
                </a>
              )}
              {tel && (
                <a href={tel} className={buttonClass("secondary", "h-12 text-[15px] sm:h-10 sm:text-sm")}>
                  <Phone />
                  Ligar para a oficina
                </a>
              )}
              {mapa && (
                <a href={mapa} target="_blank" rel="noreferrer" className={buttonClass("secondary", "h-12 text-[15px] sm:h-10 sm:text-sm")}>
                  <MapPin />
                  Como chegar
                </a>
              )}
            </div>
          </section>
        )}

        {os.status === "cancelada" && <Aviso>Esta ordem de serviço foi cancelada. Em caso de dúvida, fale com a oficina.</Aviso>}

        <section className="rounded-lg border border-border bg-card shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-[15px] font-semibold">Andamento</h2>
            {os.previsaoEntregaEm && !osFechada && os.status !== "pronto" && (
              <span className="text-[13px] text-muted">Previsão de entrega: {formatData(os.previsaoEntregaEm)}</span>
            )}
          </div>
          <LinhaDoTempo etapas={linha} />
        </section>

        {!aberto && dados.itens.length > 0 && (
          <section className="rounded-lg border border-border bg-card shadow-card">
            <h2 className="border-b border-border px-4 py-3 text-[15px] font-semibold sm:px-5">Serviços</h2>
            <ul className="divide-y divide-border">
              {dados.itens.map((i, n) => (
                <li key={n} className="flex items-baseline gap-2 px-4 py-2.5 text-[14px] sm:px-5">
                  <span className="min-w-0 flex-1">{i.descricao}</span>
                  <span className="text-[12px] text-muted">{i.tipo === "peca" ? "Peça" : "Serviço"}</span>
                </li>
              ))}
            </ul>
            {mostrarTotal && (
              <div className="flex justify-between border-t border-border px-4 py-3 text-[15px] font-semibold sm:px-5">
                <span>Total</span>
                <span className="tabular-nums">{formatBRL(dados.total)}</span>
              </div>
            )}
          </section>
        )}

        {dados.fotos.length > 0 && (
          <section className="rounded-lg border border-border bg-card shadow-card">
            <h2 className="border-b border-border px-4 py-3 text-[15px] font-semibold sm:px-5">Fotos do serviço</h2>
            <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5">
              {dados.fotos.map((f) => {
                const src = `/acompanhamento/${token}/foto/${f.id}`;
                return (
                  <li key={f.id} className="flex flex-col gap-1">
                    <a href={src} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-md border border-border bg-subtle">
                      {/* eslint-disable-next-line @next/next/no-img-element -- servida pela rota do próprio link */}
                      <img src={src} alt={f.legenda ?? "Foto do serviço"} className="size-full object-cover" loading="lazy" />
                    </a>
                    <span className="text-[12px] text-muted">{[f.legenda, formatData(f.criadoEm)].filter(Boolean).join(" · ")}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {os.status === "entregue" && (dados.pdfToken || dados.notas.length > 0 || garantiaAte || oficina.textoGarantia) && (
          <section className="flex flex-col rounded-lg border border-border bg-card shadow-card">
            <h2 className="border-b border-border px-4 py-3 text-[15px] font-semibold sm:px-5">Documentos e garantia</h2>
            <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
              {garantiaAte && (
                <p className="flex items-center gap-2 text-[14px]">
                  <ShieldCheck className="size-5 shrink-0 text-ok" aria-hidden />
                  <span>
                    Garantia até <span className="font-semibold">{formatData(garantiaAte)}</span>
                  </span>
                </p>
              )}
              {oficina.textoGarantia && <p className="whitespace-pre-line text-[13px] text-foreground-2">{oficina.textoGarantia}</p>}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {dados.pdfToken && (
                  <a href={`/documento/${dados.pdfToken}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "h-11 sm:h-9")}>
                    <FileText />
                    Ordem de serviço (PDF)
                  </a>
                )}
                {dados.notas.map((n) => (
                  <a key={n.token} href={`/documento/${n.token}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "h-11 sm:h-9")}>
                    <FileText />
                    Nota fiscal nº {n.numero}
                    {n.ambiente === "homologacao" ? " (homologação)" : ""}
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {respondidos.length > 0 && (
          <section className="rounded-lg border border-border bg-card shadow-card">
            <h2 className="border-b border-border px-4 py-3 text-[15px] font-semibold sm:px-5">{respondidos.length > 1 ? "Orçamentos respondidos" : "Orçamento respondido"}</h2>
            <ul className="divide-y divide-border">
              {respondidos.map((o) => {
                const aprovados = new Set(o.itensAprovados ?? []);
                const total = o.status === "recusado" ? Number(o.total) : totalSelecionado(o.itens, aprovados, Number(o.desconto)).total;
                return (
                  <li key={o.id}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-subtle sm:px-5">
                        <Badge tom={o.status === "recusado" ? "danger" : o.status === "parcial" ? "info" : "ok"}>
                          {o.status === "recusado" ? "Recusado" : o.status === "parcial" ? "Aprovado em parte" : "Aprovado"}
                        </Badge>
                        <span className="text-[13px] text-muted">{o.respondidoEm ? dataHora(o.respondidoEm) : formatData(o.criadoEm)}</span>
                        <span className={cn("ml-auto font-medium tabular-nums", o.status === "recusado" && "text-muted line-through")}>{formatBRL(total)}</span>
                      </summary>
                      <ul className="flex flex-col gap-1.5 px-4 pb-3 text-[13px] sm:px-5">
                        {o.itens.map((i) => {
                          const recusado = !aprovados.has(i.id);
                          return (
                            <li key={i.id} className="flex items-baseline gap-2">
                              <span className={cn("min-w-0 flex-1", recusado && "text-muted line-through")}>
                                {i.descricao}
                                <span className="text-muted"> · {qtd(i.quantidade)} × {formatBRL(i.valorUnitario)}</span>
                              </span>
                              <span className={cn("tabular-nums", recusado && "text-muted line-through")}>{formatBRL(i.quantidade * i.valorUnitario)}</span>
                            </li>
                          );
                        })}
                        <li className="pt-1">
                          <a href={`/orcamento/${o.token}/pdf?baixar=1`} className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline">
                            <Download className="size-4" aria-hidden />
                            Baixar PDF
                          </a>
                        </li>
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="pb-4 text-center text-[12px] text-muted">
          Guarde este link: ele mostra o andamento e, depois da entrega, os documentos do serviço.
        </footer>
      </main>
    </div>
  );
}

function LinhaDoTempo({ etapas }: { etapas: EtapaCliente[] }) {
  return (
    <ol className="flex flex-col px-4 py-4 sm:px-5">
      {etapas.map((e, i) => {
        const ultima = i === etapas.length - 1;
        const cancelada = e.status === "cancelada";
        // Entregue é o fim do fluxo: aparece como concluída
        const feita = e.situacao === "feita" || (e.situacao === "atual" && e.status === "entregue");
        return (
          <li key={e.status} className={cn("relative flex gap-3", !ultima && "pb-5")} aria-current={e.situacao === "atual" ? "step" : undefined}>
            {!ultima && <span aria-hidden className={cn("absolute top-7 bottom-0 left-[13px] w-0.5", e.situacao === "feita" ? "bg-ok" : "bg-border")} />}
            <span
              aria-hidden
              className={cn(
                "relative grid size-7 shrink-0 place-items-center rounded-full border-2",
                feita && "border-ok bg-ok text-white",
                !feita && e.situacao === "atual" && (cancelada ? "border-danger bg-danger-soft text-danger" : "border-info bg-info-soft text-info"),
                e.situacao === "futura" && "border-border bg-card",
              )}
            >
              {feita ? <Check className="size-4" /> : e.situacao === "atual" ? <span className="size-2.5 rounded-full bg-current" /> : null}
            </span>
            <div className="flex min-w-0 flex-col pt-0.5">
              <span className={cn("text-[15px]", e.situacao === "futura" ? "text-muted" : "font-medium", e.situacao === "atual" && "font-semibold")}>{e.label}</span>
              {e.quando ? (
                <span className="text-[13px] text-muted">{dataHora(e.quando)}</span>
              ) : (
                e.situacao === "atual" && <span className="text-[13px] text-muted">Agora</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-warn/30 bg-warn-soft p-4 text-[14px] font-medium">{children}</p>;
}
