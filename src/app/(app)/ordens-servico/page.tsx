import { AlertCircle, CheckCheck, ListChecks, MessageCircle, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { Avatar, PageHeader, Placa, buttonClass } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { listarOSAbertas, type OSResumo } from "@/lib/queries";
import { COLUNAS, STATUS } from "@/lib/os";
import { formatBRL, formatHora, tempoDesde } from "@/lib/utils";
import { MoverOS } from "./mover-os";
import { AbasOS } from "./abas";

export const metadata = { title: "Ordens de serviço" };

export default async function OrdensServicoPage() {
  const { oficina, pode } = await exigir("checkin");
  const valores = pode("verValores");
  const podeFechar = pode("fecharOS");
  const abertas = await listarOSAbertas(oficina.id);

  return (
    <>
      <PageHeader
        title="Ordens de serviço"
        description={`${abertas.length} ${abertas.length === 1 ? "aberta" : "abertas"}`}
        actions={
          pode("abrirOS") && (
            <Link href="/ordens-servico/nova" className={buttonClass("primary")}>
              <Plus />Nova OS
            </Link>
          )
        }
      />

      <AbasOS atual="quadro" />

      {/* No celular as colunas rolam na horizontal */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
        {COLUNAS.map((status) => {
          const cards = abertas.filter((o) => o.status === status);
          return (
            <section
              key={status}
              aria-label={STATUS[status].label}
              className="flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2.5 self-start rounded-lg border border-dashed border-border-strong p-2.5 sm:w-[280px] lg:w-auto lg:max-w-none"
            >
              <h2 className="flex items-center gap-2 whitespace-nowrap px-1.5 py-1 text-[13px] font-semibold">
                {STATUS[status].label} <span className="font-medium text-muted">{cards.length}</span>
              </h2>
              {cards.map((o) => (
                <CartaoOS key={o.id} os={o} valores={valores} podeFechar={podeFechar} />
              ))}
              {cards.length === 0 && <p className="px-1.5 pb-2 text-[13px] text-muted">Nenhuma OS</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function CartaoOS({ os, valores, podeFechar }: { os: OSResumo; valores: boolean; podeFechar: boolean }) {
  const meta = metaDoCartao(os);
  return (
    <article className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 shadow-card transition-colors hover:border-border-strong">
      <Link href={`/ordens-servico/${os.id}`} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Placa placa={os.placa} />
        <span className="text-xs font-medium text-muted">#{os.numero}</span>
      </div>
      <div>
        <h3 className="font-semibold">{os.modelo}</h3>
        <p className="mt-px text-[13px] text-muted">{os.descricao}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted">
        {meta}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
        <span className="flex min-w-0 items-center gap-1.5 text-foreground-2">
          {os.responsavel ? (
            <>
              <Avatar nome={os.responsavel} size="sm" />
              <span className="truncate">{os.responsavel.split(" ")[0]}</span>
            </>
          ) : (
            <span className="text-muted">Sem responsável</span>
          )}
        </span>
        {valores && os.total > 0 ? (
          <span className="font-semibold tabular-nums">{formatBRL(os.total)}</span>
        ) : (
          <span className="text-muted">{tempoDesde(os.entradaEm)}</span>
        )}
      </div>
      </Link>
      <div className="flex min-w-0 items-center gap-2">
        <MoverOS osId={os.id} status={os.status} podeFechar={podeFechar} />
        {os.status === "pronto" && podeFechar && (
          <Link href={`/ordens-servico/${os.id}#entregar`} className="shrink-0 whitespace-nowrap text-xs font-medium underline-offset-4 hover:underline">
            Entregar
          </Link>
        )}
      </div>
    </article>
  );
}

function metaDoCartao(os: OSResumo) {
  const cls = "flex items-center gap-1 whitespace-nowrap";
  const ic = "size-3.5";
  switch (os.status) {
    case "aguardando_aprovacao": {
      if (!os.aprovacaoEnviadaEm) return null;
      const horas = (Date.now() - os.aprovacaoEnviadaEm.getTime()) / 3_600_000;
      return horas >= 24 ? (
        <span className={`${cls} text-danger`}><AlertCircle className={ic} />{tempoDesde(os.aprovacaoEnviadaEm)} sem resposta</span>
      ) : (
        <span className={cls}><MessageCircle className={ic} />Enviado {formatHora(os.aprovacaoEnviadaEm)}</span>
      );
    }
    case "aguardando_peca":
      return os.previsaoPecaEm ? (
        <span className={cls}><Truck className={ic} />Previsão {os.previsaoPecaEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}</span>
      ) : null;
    case "em_execucao":
      return os.itensTotal > 0 ? (
        <span className={cls}><ListChecks className={ic} />{os.itensFeitos}/{os.itensTotal}</span>
      ) : null;
    case "pronto":
      return os.clienteAvisadoEm ? (
        <span className={`${cls} text-ok`}><CheckCheck className={ic} />Cliente avisado</span>
      ) : (
        <span className={cls}>Avisar cliente</span>
      );
    default:
      return null;
  }
}
