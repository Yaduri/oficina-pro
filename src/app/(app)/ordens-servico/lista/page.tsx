import Link from "next/link";
import { Search } from "lucide-react";
import { Badge, Button, Card, Input, PageHeader, Placa, Vazio, buttonClass, inputClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { listarOS, listarTecnicos } from "@/lib/queries";
import { ABERTAS, STATUS, type StatusOS } from "@/lib/os";
import { cn, formatBRL, formatData } from "@/lib/utils";
import { AbasOS } from "../abas";

export const metadata = { title: "Lista de OS" };

const FILTROS_STATUS: { valor: string; label: string; status?: StatusOS[] }[] = [
  { valor: "", label: "Todas" },
  { valor: "abertas", label: "Abertas", status: ABERTAS },
  ...(["diagnostico", "aguardando_aprovacao", "aguardando_peca", "em_execucao", "pronto", "entregue", "cancelada"] as StatusOS[]).map((s) => ({
    valor: s,
    label: STATUS[s].label,
    status: [s],
  })),
];

/** "AAAA-MM-DD" → início do dia em São Paulo */
function inicioDoDia(v?: string) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function ListaOSPage({ searchParams }: PageProps<"/ordens-servico/lista">) {
  const sp = await searchParams;
  const p = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const { oficina, pode } = await getContexto();
  const valores = pode("verValores");

  const status = FILTROS_STATUS.find((f) => f.valor === p("status")) ?? FILTROS_STATUS[0];
  const de = inicioDoDia(p("de"));
  const ateInicio = inicioDoDia(p("ate"));
  const ate = ateInicio ? new Date(ateInicio.getTime() + 86_400_000) : undefined;
  const tecnicos = await listarTecnicos(oficina.id);
  const responsavelId = tecnicos.some((t) => t.id === p("tecnico")) ? p("tecnico") : undefined;
  const busca = p("q").trim().slice(0, 60);

  const lista = await listarOS(oficina.id, { status: status.status, de, ate, responsavelId, busca: busca || undefined });
  const total = lista.filter((o) => o.status !== "cancelada").reduce((s, o) => s + o.total, 0);
  const filtrando = !!(status.valor || de || ate || responsavelId || busca);

  return (
    <>
      <PageHeader title="Ordens de serviço" />
      <AbasOS atual="lista" />

      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <span className="text-[13px] font-medium text-foreground-2">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input name="q" defaultValue={busca} placeholder="Placa, modelo, cliente ou nº" className="h-10 pl-9" />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Status</span>
          <select name="status" defaultValue={status.valor} className={cn(inputClass, "h-10 cursor-pointer")}>
            {FILTROS_STATUS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Técnico</span>
          <select name="tecnico" defaultValue={responsavelId ?? ""} className={cn(inputClass, "h-10 cursor-pointer")}>
            <option value="">Todos</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Entrada de</span>
          <Input type="date" name="de" defaultValue={p("de")} className="h-10" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">até</span>
          <Input type="date" name="ate" defaultValue={p("ate")} className="h-10" />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button variant="primary" className="h-10 flex-1">
            Filtrar
          </Button>
          {filtrando && (
            <Link href="/ordens-servico/lista" className={buttonClass("ghost", "h-10")}>
              Limpar
            </Link>
          )}
        </div>
      </form>

      <Card className="overflow-hidden">
        {lista.length === 0 ? (
          <Vazio titulo={filtrando ? "Nenhuma OS com esses filtros" : "Nenhuma OS ainda"} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">OS</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Veículo</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Cliente</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Status</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Entrada</th>
                    {valores && <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Valor</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((o) => (
                    <tr key={o.id} className="relative whitespace-nowrap hover:bg-subtle [&:not(:last-child)>td]:border-b [&>td]:border-border">
                      <td className="px-4 py-3">
                        <Link href={`/ordens-servico/${o.id}`} className="font-medium after:absolute after:inset-0">
                          #{o.numero}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Placa placa={o.placa} />
                          <span className="text-foreground-2">{o.modelo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{o.cliente ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge tom={STATUS[o.status].tom}>{STATUS[o.status].label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground-2">{formatData(o.entradaEm)}</td>
                      {valores && (
                        <td className={cn("px-4 py-3 text-right tabular-nums", o.status === "cancelada" && "text-muted line-through")}>
                          {o.total ? formatBRL(o.total) : <span className="text-muted">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-[13px] text-muted">
              <span>
                {lista.length} OS
                {lista.length === 300 && " (mostrando as 300 mais recentes)"}
              </span>
              {valores && <span>Total sem canceladas: {formatBRL(total)}</span>}
            </p>
          </>
        )}
      </Card>
    </>
  );
}
