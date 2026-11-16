import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { CheckCircle2, Clock, MessageCircle, Phone, XCircle } from "lucide-react";
import { getDb, schema } from "@/db";
import { Badge, Placa } from "@/components/ui";
import { STATUS_ORCAMENTO, orcamentoPorToken } from "@/lib/orcamento";
import { totalSelecionado } from "@/lib/os-total";
import { formatBRL, formatData, formatEntrada, linkWhatsApp } from "@/lib/utils";
import { identificacao } from "@/lib/identificacao";
import { RespostaOrcamento } from "./resposta";
import { Imprimir } from "./imprimir";

export const metadata: Metadata = { title: "Orçamento", robots: { index: false, follow: false } };

const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default async function OrcamentoPublico({ params }: PageProps<"/orcamento/[token]">) {
  const { token } = await params;
  const dados = await orcamentoPorToken(token);
  if (!dados) notFound();
  const { orcamento: orc, os, veiculo, cliente, empresa, oficina } = dados;

  // Primeira visualização pelo cliente
  if (!orc.vistoEm && orc.status === "pendente") {
    const db = await getDb();
    await db
      .update(schema.orcamentos)
      .set({ vistoEm: new Date() })
      .where(and(eq(schema.orcamentos.id, orc.id), isNull(schema.orcamentos.vistoEm)));
  }

  const vencido = orc.status === "pendente" && orc.validoAte < new Date();
  const osFechada = os.status === "cancelada" || os.status === "entregue";
  const aberto = orc.status === "pendente" && !vencido && !osFechada;
  const aprovados = new Set(orc.itensAprovados ?? []);
  const respondido = orc.status === "aprovado" || orc.status === "parcial" || orc.status === "recusado";
  const desconto = Number(orc.desconto);
  const totalAprovado = totalSelecionado(orc.itens, aprovados, desconto).total;
  const id = identificacao(oficina, empresa);
  const whatsOficina = linkWhatsApp(oficina.whatsapp);
  const statusExibido = vencido
    ? { label: "Vencido", tom: "neutro" as const }
    : STATUS_ORCAMENTO[orc.status];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3.5">
            {oficina.logoKey && (
              // eslint-disable-next-line @next/next/no-img-element -- servida pela rota do próprio orçamento
              <img src={`/orcamento/${token}/logo`} alt="" className="size-14 shrink-0 rounded-md object-contain" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{id.titulo}</p>
              <p className="text-[13px] text-muted">
                {id.razaoSocial}
                {id.cnpj && ` · CNPJ ${id.cnpj}`}
              </p>
              {id.endereco && <p className="text-[13px] text-muted">{id.endereco}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight">Orçamento · OS #{os.numero}</h1>
            <div className="flex flex-wrap gap-2 print:hidden">
              {whatsOficina && (
                <a href={whatsOficina} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-subtle">
                  <MessageCircle className="size-4" aria-hidden />
                  Falar com a oficina
                </a>
              )}
              {id.telefone && (
                <a href={`tel:${id.telefone.replace(/\D/g, "")}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-subtle">
                  <Phone className="size-4" aria-hidden />
                  {id.telefone}
                </a>
              )}
            </div>
          </div>
        </header>

        {respondido && (
          <div
            role="status"
            className={
              orc.status === "recusado"
                ? "flex gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4"
                : "flex gap-3 rounded-lg border border-ok/30 bg-ok-soft p-4"
            }
          >
            {orc.status === "recusado" ? (
              <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
            )}
            <div className="text-[14px]">
              <p className="font-semibold">
                {orc.status === "recusado"
                  ? "Orçamento recusado"
                  : orc.status === "parcial"
                    ? `Aprovado em parte · ${formatBRL(totalAprovado)}`
                    : `Orçamento aprovado · ${formatBRL(totalAprovado)}`}
              </p>
              <p className="text-foreground-2">
                Resposta de {orc.respostaNome} {orc.respondidoEm && formatEntrada(orc.respondidoEm).toLowerCase()}.{" "}
                {orc.status === "recusado"
                  ? "A oficina vai entrar em contato."
                  : "A oficina já foi avisada e vai seguir com o serviço."}
              </p>
            </div>
          </div>
        )}
        {orc.status === "substituido" && <Aviso>Este orçamento foi atualizado pela oficina. Peça o link novo.</Aviso>}
        {vencido && <Aviso>Este orçamento venceu em {formatData(orc.validoAte)}. Peça um novo à oficina.</Aviso>}
        {orc.status === "pendente" && !vencido && osFechada && <Aviso>Esta ordem de serviço já foi encerrada.</Aviso>}

        <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-4 shadow-card sm:px-5">
          <Placa placa={veiculo.placa} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{[veiculo.marca, veiculo.modelo, veiculo.ano].filter(Boolean).join(" ")}</p>
            <p className="text-[13px] text-muted">
              {cliente?.nome ?? "Cliente"} · Entrada {formatData(os.entradaEm)}
              {os.kmEntrada != null && ` · ${os.kmEntrada.toLocaleString("pt-BR")} km`}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card shadow-card">
          <h2 className="border-b border-border px-4 py-3 text-[15px] font-semibold sm:px-5">Problema relatado</h2>
          <p className="whitespace-pre-line px-4 py-3 text-[14px] sm:px-5">{os.descricao}</p>
        </section>

        {orc.observacao && (
          <section className="rounded-lg border border-border bg-card p-4 shadow-card sm:px-5">
            <h2 className="mb-1 text-[13px] font-semibold text-foreground-2">Observações da oficina</h2>
            <p className="whitespace-pre-line text-[14px]">{orc.observacao}</p>
          </section>
        )}

        {aberto ? (
          <RespostaOrcamento token={token} itens={orc.itens} desconto={desconto} nomeInicial={cliente?.nome ?? ""} />
        ) : (
          <section className="rounded-lg border border-border bg-card shadow-card">
            <h2 className="border-b border-border px-4 py-3 text-[15px] font-semibold sm:px-5">Peças e serviços</h2>
            <ul className="divide-y divide-border">
              {orc.itens.map((i) => {
                const recusado = respondido && !aprovados.has(i.id);
                return (
                  <li key={i.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className={recusado ? "font-medium text-muted line-through" : "font-medium"}>{i.descricao}</p>
                      <p className="text-[13px] text-muted">
                        {i.tipo === "peca" ? "Peça" : "Serviço"} · {qtd(i.quantidade)} × {formatBRL(i.valorUnitario)}
                        {recusado && " · não aprovado"}
                      </p>
                    </div>
                    <span className={recusado ? "tabular-nums text-muted line-through" : "font-medium tabular-nums"}>
                      {formatBRL(i.quantidade * i.valorUnitario)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {desconto > 0 && (
              <div className="flex justify-between border-t border-border px-4 py-2.5 text-[14px] text-foreground-2 sm:px-5">
                <span>Desconto</span>
                <span className="tabular-nums">
                  − {formatBRL(respondido && orc.status !== "recusado" ? totalSelecionado(orc.itens, aprovados, desconto).desconto : desconto)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-border px-4 py-3 text-[15px] font-semibold sm:px-5">
              <span>{respondido && orc.status !== "recusado" ? "Total aprovado" : "Total"}</span>
              <span className="tabular-nums">
                {formatBRL(respondido && orc.status !== "recusado" ? totalAprovado : Number(orc.total))}
              </span>
            </div>
          </section>
        )}

        {oficina.textoGarantia && (
          <section className="rounded-lg border border-border bg-card p-4 shadow-card sm:px-5">
            <h2 className="mb-1 text-[13px] font-semibold text-foreground-2">Garantia</h2>
            <p className="whitespace-pre-line text-[14px]">{oficina.textoGarantia}</p>
          </section>
        )}

        {orc.respostaComentario && (
          <section className="rounded-lg border border-border bg-card p-4 shadow-card sm:px-5">
            <h2 className="mb-1 text-[13px] font-semibold text-foreground-2">Comentário do cliente</h2>
            <p className="whitespace-pre-line text-[14px]">{orc.respostaComentario}</p>
          </section>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden />
            Enviado em {formatData(orc.criadoEm)} · válido até {formatData(orc.validoAte)}
          </span>
          <span className="flex items-center gap-2">
            <Badge tom={statusExibido.tom} className="print:hidden">
              {statusExibido.label}
            </Badge>
            <Imprimir />
          </span>
        </footer>
      </main>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-warn/30 bg-warn-soft p-4 text-[14px] font-medium">{children}</p>;
}
