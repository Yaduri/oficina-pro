import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, FileText, MessageCircle, Phone } from "lucide-react";
import { Badge, Placa, buttonClass, type Tom } from "@/components/ui";
import type { StatusOS } from "@/lib/os";
import { dadosPortal, formatDia, portalPorToken, SITUACAO_REVISAO } from "@/lib/relacionamento";
import { identificacao } from "@/lib/identificacao";
import { formatBRL, formatData, linkWhatsApp } from "@/lib/utils";

export const metadata: Metadata = { title: "Meus veículos", robots: { index: false, follow: false } };

/** Status da OS em palavras para o cliente */
const STATUS_CLIENTE: Record<StatusOS, { label: string; tom: Tom }> = {
  diagnostico: { label: "Em avaliação", tom: "neutro" },
  aguardando_aprovacao: { label: "Aguardando sua aprovação", tom: "warn" },
  aguardando_peca: { label: "Aguardando peça", tom: "neutro" },
  em_execucao: { label: "Em serviço", tom: "info" },
  pronto: { label: "Pronto para retirada", tom: "ok" },
  entregue: { label: "Entregue", tom: "neutro" },
  cancelada: { label: "Cancelada", tom: "neutro" },
};

/** Status em que o valor da OS já foi combinado com o cliente */
const COM_TOTAL: StatusOS[] = ["aguardando_peca", "em_execucao", "pronto", "entregue"];

const resumo = (itens: string[]) => (itens.length <= 4 ? itens.join(", ") : `${itens.slice(0, 4).join(", ")} e mais ${itens.length - 4}`);

export default async function PortalCliente({ params }: PageProps<"/portal/[token]">) {
  const { token } = await params;
  const dados = await portalPorToken(token);
  if (!dados) notFound();
  const { cliente, oficina } = dados;
  const veiculos = await dadosPortal(oficina.id, cliente.id);
  const id = identificacao(oficina);
  const whats = linkWhatsApp(oficina.whatsapp);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3.5">
            {oficina.logoKey && (
              // eslint-disable-next-line @next/next/no-img-element -- servida pela rota do próprio portal
              <img src={`/portal/${token}/logo`} alt="" className="size-14 shrink-0 rounded-md object-contain" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{id.titulo}</p>
              {id.endereco && <p className="text-[13px] text-muted">{id.endereco}</p>}
              {id.email && <p className="text-[13px] text-muted">{id.email}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight">Olá, {cliente.nome.trim().split(/\s+/)[0]}</h1>
            <div className="flex flex-wrap gap-2">
              {whats && (
                <a
                  href={whats}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-subtle"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  Falar com a oficina
                </a>
              )}
              {id.telefone && (
                <a
                  href={`tel:${id.telefone.replace(/\D/g, "")}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-subtle"
                >
                  <Phone className="size-4" aria-hidden />
                  {id.telefone}
                </a>
              )}
            </div>
          </div>
        </header>

        {veiculos.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-4 text-[14px] text-muted shadow-card">Nenhum veículo cadastrado.</p>
        )}

        {veiculos.map((v) => {
          const pendentes = v.ordens.filter((o) => o.orcamento);
          return (
            <section key={v.id} className="flex flex-col rounded-lg border border-border bg-card shadow-card">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border p-4 sm:px-5">
                <Placa placa={v.placa} />
                <p className="min-w-0 flex-1 font-medium">
                  {[v.marca, v.modelo, v.ano].filter(Boolean).join(" ")}
                  {v.cor && <span className="font-normal text-muted"> · {v.cor}</span>}
                </p>
              </div>

              {pendentes.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-warn/30 bg-warn-soft px-4 py-3 sm:px-5">
                  <p className="text-[14px]">
                    <span className="font-semibold">Orçamento da OS #{o.numero}</span> · {formatBRL(o.orcamento!.total)}
                    <span className="block text-[13px] text-foreground-2">Válido até {formatData(o.orcamento!.validoAte)}</span>
                  </p>
                  <Link
                    href={`/orcamento/${o.orcamento!.token}`}
                    className={buttonClass("primary")}
                  >
                    Ver e responder
                  </Link>
                </div>
              ))}

              {v.revisoes.length > 0 && (
                <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:px-5">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground-2">
                    <CalendarClock className="size-4" aria-hidden />
                    Próximas revisões
                  </h2>
                  <ul className="flex flex-col gap-1.5 text-[14px]">
                    {v.revisoes.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{r.descricao}</span>
                        <span className="text-muted">
                          {[r.proximaData && formatDia(r.proximaData), r.proximoKm != null && `${r.proximoKm.toLocaleString("pt-BR")} km`]
                            .filter(Boolean)
                            .join(" ou ")}
                        </span>
                        {r.situacao !== "em_dia" && <Badge tom={SITUACAO_REVISAO[r.situacao].tom}>{SITUACAO_REVISAO[r.situacao].label}</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {v.ordens.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-muted sm:px-5">Nenhum serviço ainda.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {v.ordens.map((o) => (
                    <li key={o.id} className="flex flex-col gap-1.5 px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium">OS #{o.numero}</span>
                        <Badge tom={STATUS_CLIENTE[o.status].tom}>{STATUS_CLIENTE[o.status].label}</Badge>
                        <span className="ml-auto font-semibold tabular-nums">
                          {COM_TOTAL.includes(o.status) && o.total > 0 ? formatBRL(o.total) : ""}
                        </span>
                      </div>
                      <p className="text-[13px] text-muted">
                        Entrada {formatData(o.entradaEm)}
                        {o.kmEntrada != null && ` · ${o.kmEntrada.toLocaleString("pt-BR")} km`}
                        {o.entregueEm && o.status === "entregue" && ` · entregue ${formatData(o.entregueEm)}`}
                        {o.garantiaAte && o.status === "entregue" && ` · garantia até ${formatData(o.garantiaAte)}`}
                      </p>
                      <p className="text-[13px] text-foreground-2">{o.itens.length > 0 ? resumo(o.itens) : o.descricao}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {o.pdfToken && (
                          <a
                            href={`/documento/${o.pdfToken}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium underline-offset-4 hover:underline"
                          >
                            <FileText className="size-4" aria-hidden />
                            Ver OS em PDF
                          </a>
                        )}
                        {o.notas.map((n) => (
                          <a
                            key={n.token}
                            href={`/documento/${n.token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium underline-offset-4 hover:underline"
                          >
                            <FileText className="size-4" aria-hidden />
                            Nota fiscal nº {n.numero}
                            {n.ambiente === "homologacao" ? " (homologação)" : ""}
                          </a>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
