import Link from "next/link";
import { Car, CircleCheck, Clock, TrendingUp } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { Badge, Card, CardHeader, EmpresaTag, PageHeader, Placa, type TipoEmpresa } from "@/components/ui";
import { empresasFiltradas } from "@/lib/oficina";
import { faturamentoDoMes, listarOSAbertas } from "@/lib/queries";
import { entregasPrevistas, listarAgendamentos } from "@/lib/agenda";
import { STATUS_AGENDA, diaSP, inicioDoDia } from "@/lib/agenda-datas";
import { STATUS } from "@/lib/os";
import { cn, formatBRL, formatBRLInteiro, formatEntrada, formatHora } from "@/lib/utils";

export const metadata = { title: "Início" };

const barra: Record<TipoEmpresa, string> = { mecanica: "bg-mec", eletrica: "bg-amber-500", outra: "bg-zinc-400" };

function saudacao() {
  const h = Number(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function InicioPage({ searchParams }: PageProps<"/inicio">) {
  const { empresa } = await searchParams;
  const { oficina, empresas, empresaIds, selecionada, pode } = await empresasFiltradas(empresa);
  const valores = pode("verValores");
  const inicioHoje = inicioDoDia(diaSP(new Date()));
  const fimHoje = new Date(inicioHoje.getTime() + 86_400_000);
  const [abertas, faturamento, agenda, entregas, user] = await Promise.all([
    listarOSAbertas(oficina.id, empresaIds),
    faturamentoDoMes(oficina.id, empresaIds),
    listarAgendamentos(oficina.id, empresaIds, inicioHoje, fimHoje),
    entregasPrevistas(oficina.id, empresaIds, inicioHoje, fimHoje),
    currentUser(),
  ]);

  const visiveis = selecionada ? [selecionada] : empresas;
  const porEmpresa = visiveis.map((e) => ({
    ...e,
    patio: abertas.filter((o) => o.empresaId === e.id).length,
    faturado: faturamento.find((f) => f.empresaId === e.id)?.total ?? 0,
  }));
  const totalFaturado = porEmpresa.reduce((s, e) => s + e.faturado, 0);
  const aguardando = abertas.filter((o) => o.status === "aguardando_aprovacao");
  const prontos = abertas.filter((o) => o.status === "pronto");
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  const hojeFmt = hoje.charAt(0).toUpperCase() + hoje.slice(1);
  const qs = selecionada ? `?empresa=${selecionada.id}` : "";

  return (
    <>
      <PageHeader
        title={`${saudacao()}${user?.firstName ? `, ${user.firstName}` : ""}`}
        description={
          <>
            {hojeFmt} · {selecionada ? selecionada.nome : `resumo de ${empresas.length > 1 ? "todas as empresas" : oficina.nome}`}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Car} label="Veículos no pátio" value={String(abertas.length)}>
          {porEmpresa.length > 1 && (
            <Legenda itens={porEmpresa.map((e) => ({ tipo: e.tipo, texto: `${e.patio} ${e.nome.toLowerCase()}` }))} />
          )}
        </Kpi>
        <Kpi icon={Clock} label="Aguardando aprovação" value={String(aguardando.length)}>
          {valores && <span className="text-[13px] text-muted">{formatBRL(aguardando.reduce((s, o) => s + o.total, 0))} em orçamentos</span>}
        </Kpi>
        <Kpi icon={CircleCheck} label="Prontos para entrega" value={String(prontos.length)}>
          <span className="text-[13px] text-muted">
            {prontos.length === 0 ? "Nenhum no momento" : prontos.every((o) => o.clienteAvisadoEm) ? "Clientes já avisados" : "Avisar clientes"}
          </span>
        </Kpi>
        {valores && (
        <Kpi icon={TrendingUp} label="Faturamento do mês" value={formatBRLInteiro(totalFaturado)}>
          {porEmpresa.length > 1 && (
            <>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-subtle">
                {porEmpresa.map((e) => (
                  <span key={e.id} className={barra[e.tipo]} style={{ width: totalFaturado ? `${(e.faturado / totalFaturado) * 100}%` : "0%" }} />
                ))}
              </div>
              <Legenda itens={porEmpresa.map((e) => ({ tipo: e.tipo, texto: formatBRLInteiro(e.faturado) }))} />
            </>
          )}
        </Kpi>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="No pátio agora"
            action={<Link href={`/ordens-servico${qs}`} className="text-[13px] font-medium text-foreground underline-offset-4 hover:underline">Ver ordens de serviço</Link>}
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
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Empresa</th>
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
                      <td className="px-4 py-3"><EmpresaTag tipo={o.empresaTipo} nome={o.empresaNome} /></td>
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
                    {a.status !== "agendado" ? (
                      <Badge tom={STATUS_AGENDA[a.status].tom} className="self-start">
                        {STATUS_AGENDA[a.status].label}
                      </Badge>
                    ) : a.empresaTipo && a.empresaNome ? (
                      <EmpresaTag tipo={a.empresaTipo} nome={a.empresaNome.slice(0, 3)} className="self-start" />
                    ) : null}
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

function Kpi({ icon: Icon, label, value, children }: { icon: typeof Car; label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1.5 px-5 py-[18px]">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <Icon className="size-4" strokeWidth={1.75} />
        {label}
      </div>
      <div className="text-[26px] font-semibold tracking-tight tabular-nums">{value}</div>
      {children}
    </Card>
  );
}

function Legenda({ itens }: { itens: { tipo: TipoEmpresa; texto: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted">
      {itens.map((i, idx) => (
        <span key={idx} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", barra[i.tipo])} />
          {i.texto}
        </span>
      ))}
    </div>
  );
}
