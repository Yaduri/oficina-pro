import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { Badge, Card, CardHeader, PageHeader, Placa } from "@/components/ui";
import { MessageCircle } from "lucide-react";
import { InstalarApp } from "@/components/pwa";
import { contarFila } from "@/lib/fila-mensagens";
import { getContexto } from "@/lib/oficina";
import { faturamentoDoMes, listarOSAbertas } from "@/lib/queries";
import { entregasPrevistas, listarAgendamentos } from "@/lib/agenda";
import { STATUS_AGENDA, diaSP, inicioDoDia } from "@/lib/agenda-datas";
import { STATUS } from "@/lib/os";
import { formatBRL, formatBRLInteiro, formatEntrada, formatHora } from "@/lib/utils";

export const metadata = { title: "Início" };

function saudacao() {
  const h = Number(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function InicioPage() {
  const { oficina, pode } = await getContexto();
  const valores = pode("verValores");
  const inicioHoje = inicioDoDia(diaSP(new Date()));
  const fimHoje = new Date(inicioHoje.getTime() + 86_400_000);
  const [abertas, faturamento, agenda, entregas, user, aEnviar] = await Promise.all([
    listarOSAbertas(oficina.id),
    faturamentoDoMes(oficina.id),
    listarAgendamentos(oficina.id, inicioHoje, fimHoje),
    entregasPrevistas(oficina.id, inicioHoje, fimHoje),
    currentUser(),
    pode("mensagens") ? contarFila(oficina) : Promise.resolve(0),
  ]);

  const agendadosHoje = agenda.filter((a) => a.status !== "cancelado");
  const aguardando = abertas.filter((o) => o.status === "aguardando_aprovacao");
  const prontos = abertas.filter((o) => o.status === "pronto");
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  const hojeFmt = hoje.charAt(0).toUpperCase() + hoje.slice(1);

  return (
    <>
      <PageHeader
        title={`${saudacao()}${user?.firstName ? `, ${user.firstName}` : ""}`}
        description={
          <>
            {hojeFmt} · {oficina.nomeFantasia || oficina.nome}
          </>
        }
      />

      <InstalarApp />

      {aEnviar > 0 && (
        <Link
          href="/mensagens"
          className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium shadow-card hover:bg-subtle"
        >
          <MessageCircle className="size-4 text-[#25D366]" aria-hidden />
          {aEnviar === 1 ? "1 mensagem a enviar" : `${aEnviar} mensagens a enviar`}
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Veículos no pátio" value={String(abertas.length)}>
          <span className="text-[13px] text-muted">OS abertas</span>
        </Kpi>
        <Kpi label="Aguardando aprovação" value={String(aguardando.length)}>
          {valores && <span className="text-[13px] text-muted">{formatBRL(aguardando.reduce((s, o) => s + o.total, 0))} em orçamentos</span>}
        </Kpi>
        <Kpi label="Prontos para entrega" value={String(prontos.length)}>
          <span className="text-[13px] text-muted">
            {(() => {
              const semAviso = prontos.filter((o) => !o.clienteAvisadoEm).length;
              if (prontos.length === 0) return null;
              if (semAviso === 0) return "Clientes já avisados";
              return semAviso === 1 ? "1 cliente ainda não avisado" : `${semAviso} clientes ainda não avisados`;
            })()}
          </span>
        </Kpi>
        {!valores && (
          <Kpi label="Agendados hoje" value={String(agendadosHoje.length)}>
            <span className="text-[13px] text-muted">
              {agendadosHoje.filter((a) => a.status === "atendido").length} já chegaram · {entregas.length} entregas previstas
            </span>
          </Kpi>
        )}
        {valores && (
        <Kpi label="Faturamento do mês" value={formatBRLInteiro(faturamento.mes)}>
          <span className="text-[13px] text-muted">{formatBRL(faturamento.hoje)} hoje (OS entregues)</span>
        </Kpi>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="No pátio agora"
            action={<Link href="/ordens-servico" className="text-[13px] font-medium text-foreground underline-offset-4 hover:underline">Ver ordens de serviço</Link>}
          />
          {abertas.length === 0 ? (
            <p className="px-5 py-10 text-center text-muted">Nenhum veículo no pátio.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Veículo</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Cliente</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Status</th>
                    {valores && <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Valor</th>}
                  </tr>
                </thead>
                <tbody>
                  {abertas.map((o) => (
                    <tr key={o.id} className="relative whitespace-nowrap hover:bg-subtle [&:not(:last-child)>td]:border-b [&>td]:border-border">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Placa placa={o.placa} />
                          <div>
                            <Link href={`/ordens-servico/${o.id}`} className="font-medium after:absolute after:inset-0">{o.modelo}</Link>
                            <div className="text-[13px] text-muted">OS #{o.numero} · {formatEntrada(o.entradaEm)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{o.cliente ?? "—"}</td>
                      <td className="px-4 py-3"><Badge tom={STATUS[o.status].tom}>{STATUS[o.status].label}</Badge></td>
                      {valores && <td className="px-4 py-3 text-right tabular-nums">{o.total ? formatBRL(o.total) : <span className="text-muted">—</span>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Agenda de hoje"
            action={
              <Link href="/agenda" className="text-[13px] font-medium underline-offset-4 hover:underline">
                Ver agenda
              </Link>
            }
          />
          {agenda.length === 0 && entregas.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted">Nada agendado para hoje.</p>
          ) : (
            <ul>
              {agenda.map((a) => (
                <li key={a.id} className="border-b border-border last:border-b-0">
                  <Link href={`/agenda?data=${diaSP(a.inicio)}`} className="flex gap-3.5 px-5 py-3.5 hover:bg-subtle">
                    <span className="w-11 pt-px text-[13px] font-semibold tabular-nums">{formatHora(a.inicio)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{a.titulo}</div>
                      <div className="truncate text-[13px] text-muted">
                        {[a.placa, a.cliente, a.tecnico].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {a.status !== "agendado" && (
                      <Badge tom={STATUS_AGENDA[a.status].tom} className="self-start">
                        {STATUS_AGENDA[a.status].label}
                      </Badge>
                    )}
                  </Link>
                </li>
              ))}
              {entregas.map((e) => (
                <li key={e.id} className="border-b border-border last:border-b-0">
                  <Link href={`/ordens-servico/${e.id}`} className="flex gap-3.5 px-5 py-3.5 hover:bg-subtle">
                    <span className="w-11 pt-px text-[13px] text-muted">Hoje</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">Entrega prevista · OS #{e.numero}</div>
                      <div className="truncate text-[13px] text-muted">{[e.placa, e.modelo, e.cliente].filter(Boolean).join(" · ")}</div>
                    </div>
                    <Badge tom={STATUS[e.status].tom} className="self-start">
                      {STATUS[e.status].label}
                    </Badge>
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

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1.5 p-5">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className="text-[26px] font-semibold tracking-tight tabular-nums">{value}</div>
      {children}
    </Card>
  );
}
