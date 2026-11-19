"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarClock, CheckCircle2, CircleAlert, Eye, PackageX, PauseCircle, TruckIcon, XCircle } from "lucide-react";
import { formatEntrada, cn } from "@/lib/utils";
import { marcarNotificacoesLidas, minhasNotificacoes, type Notificacao } from "@/app/notificacoes/actions";

const ICONE: Record<Notificacao["tipo"], { icone: typeof Bell; cor: string }> = {
  aprovado: { icone: CheckCircle2, cor: "text-ok" },
  parcial: { icone: CheckCircle2, cor: "text-info" },
  recusado: { icone: XCircle, cor: "text-danger" },
  visto: { icone: Eye, cor: "text-foreground-2" },
  peca: { icone: PackageX, cor: "text-warn" },
  parada: { icone: PauseCircle, cor: "text-warn" },
  entrega: { icone: TruckIcon, cor: "text-danger" },
  conta_vence: { icone: CalendarClock, cor: "text-warn" },
  conta_vencida: { icone: CircleAlert, cor: "text-danger" },
};

/** Sino do topo: busca as notificações ao abrir a página, a cada minuto e ao navegar */
export function Sino() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<{ itens: Notificacao[]; novas: number } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    minhasNotificacoes()
      .then(setDados)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
  }, [carregar, pathname]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    // Ao abrir, o que está na lista passa a contar como lido (as marcas "nova" ficam até fechar)
    if (abrir && dados?.novas) {
      marcarNotificacoesLidas().then(() => setDados((d) => (d ? { ...d, novas: 0 } : d)));
    }
    if (!abrir) setDados((d) => (d ? { ...d, itens: d.itens.map((i) => ({ ...i, nova: false })) } : d));
  }

  const novas = dados?.novas ?? 0;

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className="relative grid size-9 place-items-center rounded-md border border-border text-foreground-2 hover:bg-subtle"
        aria-label={novas ? `Notificações: ${novas} ${novas === 1 ? "nova" : "novas"}` : "Notificações"}
      >
        <Bell className="size-[18px]" strokeWidth={1.75} />
        {novas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-none text-white tabular-nums">
            {novas > 9 ? "9+" : novas}
          </span>
        )}
      </button>
      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações"
          className="fixed inset-x-3 top-[4.25rem] z-40 overflow-hidden rounded-xl border border-border bg-card shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">Notificações</h2>
            <span className="text-[12px] text-muted">Últimos 7 dias e pendências</span>
          </div>
          {!dados ? (
            <p className="px-4 py-6 text-[13px] text-muted">Carregando…</p>
          ) : dados.itens.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">Nenhuma notificação.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {dados.itens.map((n) => {
                const { icone: Icone, cor } = ICONE[n.tipo];
                return (
                  <li key={n.id}>
                    <Link href={n.href} onClick={() => setAberto(false)} className={cn("flex gap-3 px-4 py-3 hover:bg-subtle", n.nova && "bg-info-soft/40")}>
                      <Icone className={cn("mt-0.5 size-[18px] shrink-0", cor)} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={cn("text-sm", n.nova ? "font-semibold" : "font-medium")}>{n.titulo}</span>
                          {n.nova && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-info" aria-label="nova" />}
                        </span>
                        <span className="block text-[13px] text-muted">{n.detalhe}</span>
                        <span className="block text-[12px] text-muted">{formatEntrada(new Date(n.quando))}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
