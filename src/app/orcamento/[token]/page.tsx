import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDbSistema } from "@/db";
import { orcamentoPorToken } from "@/lib/orcamento";
import { garantirAcompanhamento } from "@/lib/acompanhamento";
import { ipAtual, verificarLimite } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Orçamento", robots: { index: false, follow: false } };

/**
 * Links de orçamento já enviados aos clientes continuam valendo: levam ao link de acompanhamento
 * da OS (criado aqui se ainda não existir), onde o orçamento pendente é aprovado item a item.
 * As actions (./actions.ts), o PDF e a logo do orçamento seguem pelo token do orçamento.
 */
export default async function OrcamentoPublico({ params }: PageProps<"/orcamento/[token]">) {
  const lim = await verificarLimite({ chave: `orc-view:${await ipAtual()}`, limite: 60, janelaSeg: 600 });
  if (!lim.permitido) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-[18px] font-semibold">Muitas tentativas</h1>
        <p className="text-[14px] text-muted">Aguarde {lim.retryAfterSeg} segundos e recarregue a página.</p>
      </div>
    );
  }
  const { token } = await params;
  const dados = await orcamentoPorToken(token);
  if (!dados) notFound();
  // Sem login: conexão do sistema, com a oficina e a OS vindas do orçamento do token
  const acompanhamento = await garantirAcompanhamento(dados.orcamento.oficinaId, dados.os.id, await getDbSistema());
  redirect(`/acompanhamento/${acompanhamento}`);
}
