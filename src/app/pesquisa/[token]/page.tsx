import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Placa } from "@/components/ui";
import { pesquisaPorToken } from "@/lib/relacionamento";
import { identificacao } from "@/lib/identificacao";
import { formatData } from "@/lib/utils";
import { FormularioPesquisa } from "./formulario";

export const metadata: Metadata = { title: "Pesquisa de satisfação", robots: { index: false, follow: false } };

export default async function PesquisaPublica({ params }: PageProps<"/pesquisa/[token]">) {
  const { token } = await params;
  const dados = await pesquisaPorToken(token);
  if (!dados) notFound();
  const { pesquisa: p, os, veiculo, oficina } = dados;
  const id = identificacao(oficina);
  const respondida = p.respondidoEm != null && p.nota != null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center gap-3.5">
          {oficina.logoKey && (
            // eslint-disable-next-line @next/next/no-img-element -- servida pela rota da própria pesquisa
            <img src={`/pesquisa/${token}/logo`} alt="" className="size-14 shrink-0 rounded-md object-contain" />
          )}
          <div className="min-w-0">
            <p className="font-semibold">{id.titulo}</p>
            {id.telefone && <p className="text-[13px] text-muted">{id.telefone}</p>}
          </div>
        </header>

        <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-4 shadow-card sm:px-5">
          <Placa placa={veiculo.placa} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}</p>
            <p className="text-[13px] text-muted">
              OS #{os.numero}
              {os.entregueEm && ` · entregue em ${formatData(os.entregueEm)}`}
            </p>
          </div>
        </section>

        {respondida ? (
          <section role="status" className="flex flex-col gap-3 rounded-lg border border-ok/30 bg-ok-soft p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[16px] font-semibold">
              <CheckCircle2 className="size-5 text-ok" aria-hidden />
              Obrigado pela resposta!
            </p>
            <p className="text-[14px]">
              Sua nota: <span className="font-semibold tabular-nums">{p.nota}</span> de 10
            </p>
            {p.comentario && <p className="whitespace-pre-line text-[14px] text-foreground-2">{p.comentario}</p>}
          </section>
        ) : os.status === "cancelada" ? (
          <p className="rounded-lg border border-warn/30 bg-warn-soft p-4 text-[14px] font-medium">Esta ordem de serviço foi cancelada.</p>
        ) : (
          <FormularioPesquisa token={token} oficina={id.titulo} />
        )}
      </main>
    </div>
  );
}
