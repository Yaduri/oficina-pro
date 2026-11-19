import Link from "next/link";
import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { Button, Input, buttonClass } from "@/components/ui";
import { PRESETS, rotuloPeriodo, type Periodo, type Preset } from "@/lib/financeiro-relatorios";
import { cn, formatBRL } from "@/lib/utils";

/** Centavos → "R$ 1.234,56" */
export const brl = (c: number) => formatBRL(c / 100 || 0);

/** Monta a URL com os parâmetros (vazios são omitidos) */
export function urlCom(base: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Parâmetros que representam o período na URL */
export const paramsPeriodo = (p: Periodo) =>
  p.preset === "personalizado" ? { periodo: p.preset, de: p.de, ate: p.ate } : p.preset === "mes" ? {} : { periodo: p.preset };

/** Atalhos de período + intervalo personalizado (formulário GET) */
export function FiltroPeriodo({ base, periodo, manter = {} }: { base: string; periodo: Periodo; manter?: Record<string, string | undefined> }) {
  const atalhos = (Object.keys(PRESETS) as Preset[]).filter((k) => k !== "personalizado");
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[13px] font-medium text-foreground-2" id="periodo-rotulo">
          Período: <span className="text-foreground">{rotuloPeriodo(periodo.de, periodo.ate)}</span>
        </span>
        <nav aria-labelledby="periodo-rotulo" className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {atalhos.map((k) => {
            const ativo = periodo.preset === k;
            return (
              <Link
                key={k}
                href={urlCom(base, { ...manter, periodo: k === "mes" ? undefined : k })}
                aria-current={ativo ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium",
                  ativo ? "border-foreground bg-foreground text-white" : "border-border bg-card text-foreground-2 hover:bg-subtle",
                )}
              >
                {PRESETS[k]}
              </Link>
            );
          })}
        </nav>
      </div>
      <form action={base} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        {Object.entries(manter).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="periodo" value="personalizado" />
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">De</span>
          <Input type="date" name="de" defaultValue={periodo.de} required className="h-9" />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Até</span>
          <Input type="date" name="ate" defaultValue={periodo.ate} required className="h-9" />
        </label>
        <Button variant={periodo.preset === "personalizado" ? "primary" : "secondary"}>Aplicar</Button>
      </form>
    </div>
  );
}

/** Link de exportação para CSV */
export function BotaoCsv({ href, children = "Exportar CSV" }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} download className={buttonClass("ghost", "h-8 px-2.5 text-[13px]")}>
      <Download aria-hidden />
      {children}
    </a>
  );
}

/* ---------- Tabela ---------- */

export function Tabela({ children, legenda }: { children: ReactNode; legenda: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{legenda}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, num, className }: { children?: ReactNode; num?: boolean; className?: string }) {
  return (
    <th scope="col" className={cn("border-b border-border bg-zinc-50/60 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted", num ? "text-right" : "text-left", className)}>
      {children}
    </th>
  );
}

export function Td({ children, num, className }: { children?: ReactNode; num?: boolean; className?: string }) {
  return <td className={cn("px-4 py-2.5 whitespace-nowrap", num && "text-right tabular-nums", className)}>{children}</td>;
}

/** Linha de tabela com borda entre as linhas */
export const trClass = "[&:not(:last-child)>td]:border-b [&>td]:border-border";

/** Valor em centavos com cor para negativos */
export function Valor({ c, sinal }: { c: number; sinal?: boolean }) {
  return <span className={cn(c < 0 && "text-danger", sinal && c > 0 && "text-ok")}>{c === 0 ? <span className="text-muted">—</span> : brl(c)}</span>;
}

/** Número de destaque */
export function Indicador({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "ok" | "danger" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 shadow-card">
      <span className="text-[13px] text-muted">{rotulo}</span>
      <span className={cn("text-lg font-semibold tabular-nums", tom === "ok" && "text-ok", tom === "danger" && "text-danger")}>{valor}</span>
      {detalhe && <span className="text-[12px] text-muted">{detalhe}</span>}
    </div>
  );
}
