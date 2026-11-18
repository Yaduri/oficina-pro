import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, PackageCheck, Plus } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, Placa, Vazio, buttonClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { listarTecnicos } from "@/lib/queries";
import { entregasPrevistas, listarAgendamentos, type EntregaPrevista } from "@/lib/agenda";
import { DIA_RE, diaSP, inicioDaSemana, inicioDoDia, nomeDoDia, somarDias } from "@/lib/agenda-datas";
import { STATUS } from "@/lib/os";
import { cn } from "@/lib/utils";
import { ItemAgenda, type AgendamentoTela } from "./item";
import { FiltroTecnico } from "./filtros";

export const metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const sp = await searchParams;
  const p = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const { oficina, pode } = await getContexto();
  const podeEditar = pode("abrirOS");

  const hoje = diaSP(new Date());
  const dia = DIA_RE.test(p("data")) ? p("data") : hoje;
  const semana = p("vista") === "semana";
  const inicio = semana ? inicioDaSemana(dia) : dia;
  const dias = semana ? Array.from({ length: 7 }, (_, i) => somarDias(inicio, i)) : [dia];
  const de = inicioDoDia(inicio);
  const ate = inicioDoDia(somarDias(inicio, dias.length));

  const tecnicos = await listarTecnicos(oficina.id);
  const tecnicoId = tecnicos.some((t) => t.id === p("tecnico")) ? p("tecnico") : undefined;
  const [agenda, entregas] = await Promise.all([
    listarAgendamentos(oficina.id, de, ate, { tecnicoId, incluirCancelados: !semana }),
    entregasPrevistas(oficina.id, de, ate, tecnicoId),
  ]);
  const itens: AgendamentoTela[] = agenda.map((a) => ({ ...a, inicio: a.inicio.toISOString() }));

  // Mantém filtros ao navegar
  const link = (mudar: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const atual = { data: dia, vista: semana ? "semana" : undefined, tecnico: tecnicoId, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v);
    return `/agenda?${q.toString()}`;
  };
  const passo = semana ? 7 : 1;
  const titulo = semana
    ? `${nomeDoDia(dias[0], { day: "numeric", month: "short" })} a ${nomeDoDia(dias[6], { day: "numeric", month: "short", year: "numeric" })}`
    : nomeDoDia(dia, { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Horários marcados e entregas previstas das OS"
        actions={
          podeEditar && (
            <Link href={`/agenda/novo?data=${dia}`} className={buttonClass("primary")}>
              <Plus />
              Novo agendamento
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Link href={link({ data: somarDias(dia, -passo) })} className={buttonClass("ghost", "px-2")} aria-label={semana ? "Semana anterior" : "Dia anterior"}>
            <ChevronLeft />
          </Link>
          <Link href={link({ data: hoje })} className={buttonClass("secondary", "h-9")}>
            Hoje
          </Link>
          <Link href={link({ data: somarDias(dia, passo) })} className={buttonClass("ghost", "px-2")} aria-label={semana ? "Próxima semana" : "Próximo dia"}>
            <ChevronRight />
          </Link>
          <h2 className="ml-1.5 text-[15px] font-semibold first-letter:uppercase">{titulo}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiltroTecnico tecnicos={tecnicos} atual={tecnicoId} />
          <div className="flex rounded-md bg-subtle p-1 text-[13px] font-medium">
            <Link
              href={link({ vista: undefined })}
              aria-current={!semana ? "page" : undefined}
              className={cn("rounded px-3 py-1", !semana ? "bg-card shadow-card" : "text-muted hover:text-foreground")}
            >
              Dia
            </Link>
            <Link
              href={link({ vista: "semana" })}
              aria-current={semana ? "page" : undefined}
              className={cn("rounded px-3 py-1", semana ? "bg-card shadow-card" : "text-muted hover:text-foreground")}
            >
              Semana
            </Link>
          </div>
        </div>
      </div>

      {semana ? (
        <div className="grid gap-3 lg:grid-cols-7">
          {dias.map((d) => {
            const doDia = itens.filter((a) => diaSP(new Date(a.inicio)) === d);
            const entregasDia = entregas.filter((e) => e.previsao && diaSP(e.previsao) === d);
            return (
              <Card key={d} className={cn("flex min-w-0 flex-col", d === hoje && "ring-2 ring-zinc-900/10")}>
                <Link href={link({ data: d, vista: undefined })} className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2.5 hover:bg-subtle">
                  <span className="text-[13px] font-semibold first-letter:uppercase">{nomeDoDia(d, { weekday: "short", day: "numeric" })}</span>
                  <span className="text-[12px] text-muted">{doDia.length + entregasDia.length || ""}</span>
                </Link>
                <div className="flex flex-col gap-1.5 p-2">
                  {doDia.length === 0 && entregasDia.length === 0 && <p className="px-1 py-2 text-[12px] text-muted">Livre</p>}
                  {doDia.map((a) => (
                    <ItemAgenda key={a.id} a={a} podeEditar={podeEditar} compacto />
                  ))}
                  {entregasDia.map((e) => (
                    <Link key={e.id} href={`/ordens-servico/${e.id}`} className="block rounded-md border border-dashed border-border-strong px-2.5 py-2 text-[13px] hover:bg-subtle">
                      <span className="font-medium">Entrega</span> OS #{e.numero}
                      <span className="block truncate text-[12px] text-muted">{[e.placa, e.cliente].filter(Boolean).join(" · ")}</span>
                    </Link>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="min-w-0">
            <CardHeader title="Horários" action={<span className="text-[13px] text-muted">{itens.filter((a) => a.status !== "cancelado").length}</span>} />
            {itens.length === 0 ? (
              <Vazio titulo="Nenhum horário marcado">
                {podeEditar ? (
                  <Link href={`/agenda/novo?data=${dia}`} className="underline">
                    Agendar um serviço para este dia
                  </Link>
                ) : (
                  "Os agendamentos do dia aparecem aqui."
                )}
              </Vazio>
            ) : (
              <ul className="divide-y divide-border">
                {itens.map((a) => (
                  <li key={a.id}>
                    <ItemAgenda a={a} podeEditar={podeEditar} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Entregas entregas={entregas} />
        </div>
      )}
    </>
  );
}

function Entregas({ entregas }: { entregas: EntregaPrevista[] }) {
  return (
    <Card>
      <CardHeader title="Entregas previstas" action={<span className="text-[13px] text-muted">{entregas.length}</span>} />
      {entregas.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-[13px] text-muted">
          <PackageCheck className="size-4" aria-hidden />
          Nenhuma OS com entrega prevista para este dia.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {entregas.map((e) => (
            <li key={e.id}>
              <Link href={`/ordens-servico/${e.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-subtle sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">OS #{e.numero}</span>
                  <Badge tom={STATUS[e.status].tom}>{STATUS[e.status].label}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <Placa placa={e.placa} />
                  {[e.modelo, e.cliente].filter(Boolean).join(" · ")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-[12px] text-muted">
        <CalendarDays className="size-3.5" aria-hidden />A previsão é definida em cada OS, em “Editar” no relato.
      </p>
    </Card>
  );
}
