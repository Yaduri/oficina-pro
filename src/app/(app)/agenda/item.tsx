"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Camera, Check, MessageCircle, MoreHorizontal, Pencil, RotateCcw, UserX, X } from "lucide-react";
import { Badge, Placa, buttonClass } from "@/components/ui";
import { STATUS_AGENDA, formatDuracao, horaSP, nomeDoDia, diaSP, type StatusAgenda } from "@/lib/agenda-datas";
import { cn, linkWhatsApp } from "@/lib/utils";
import { mudarStatusAgendamento } from "./actions";

export type AgendamentoTela = {
  id: string;
  titulo: string;
  detalhe: string | null;
  inicio: string;
  duracaoMin: number;
  status: StatusAgenda;
  checkinId: string | null;
  tecnico: string | null;
  veiculoId: string | null;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  cliente: string | null;
  telefone: string | null;
  aceitaWhatsapp: boolean | null;
};

/** Um horário da agenda com as ações (confirmar, check-in, lembrete, falta, cancelar) */
export function ItemAgenda({ a, podeEditar, compacto = false }: { a: AgendamentoTela; podeEditar: boolean; compacto?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  const raiz = useRef<HTMLDivElement>(null);
  const inicio = new Date(a.inicio);
  const fim = new Date(inicio.getTime() + a.duracaoMin * 60_000);
  const encerrado = a.status === "atendido" || a.status === "cancelado" || a.status === "faltou";
  const veiculo = [a.marca, a.modelo].filter(Boolean).join(" ");

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menu]);

  function status(s: StatusAgenda) {
    setMenu(false);
    setErro(undefined);
    start(async () => {
      const r = await mudarStatusAgendamento(a.id, s);
      if (r?.erro) setErro(r.erro);
    });
  }

  const whats = linkWhatsApp(a.telefone);
  const lembrete = whats
    ? `${whats}?text=${encodeURIComponent(
        `Olá${a.cliente ? `, ${a.cliente.split(" ")[0]}` : ""}! Lembrete do seu agendamento ${
          diaSP(inicio) === diaSP(new Date()) ? "hoje" : nomeDoDia(diaSP(inicio), { weekday: "long", day: "numeric", month: "numeric" })
        } às ${horaSP(inicio)}${veiculo ? ` para o ${veiculo}` : ""}${a.placa ? ` (${a.placa})` : ""}: ${a.titulo}. Podemos confirmar?`,
      )}`
    : null;

  if (compacto) {
    return (
      <Link
        href={`/agenda?data=${diaSP(inicio)}`}
        className={cn("block rounded-md border border-border bg-card px-2.5 py-2 text-[13px] hover:bg-subtle", encerrado && "opacity-60")}
      >
        <span className="font-semibold tabular-nums">{horaSP(inicio)}</span> <span className={cn(a.status === "cancelado" && "line-through")}>{a.titulo}</span>
        <span className="block truncate text-[12px] text-muted">{[a.placa, a.tecnico].filter(Boolean).join(" · ")}</span>
      </Link>
    );
  }

  return (
    <div ref={raiz} className={cn("relative flex gap-3 px-4 py-3.5 sm:gap-4 sm:px-5", pending && "opacity-60")}>
      <div className="w-14 shrink-0 pt-0.5 text-right">
        <p className={cn("text-[15px] font-semibold tabular-nums", encerrado && "text-muted")}>{horaSP(inicio)}</p>
        <p className="text-[12px] text-muted tabular-nums">até {horaSP(fim)}</p>
      </div>
      <div className={cn("min-w-0 flex-1", encerrado && "text-muted")}>
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("font-medium", a.status === "cancelado" && "line-through")}>{a.titulo}</p>
          {a.status !== "agendado" && <Badge tom={STATUS_AGENDA[a.status].tom}>{STATUS_AGENDA[a.status].label}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          {a.placa && (
            <Link href={a.veiculoId ? `/veiculos/${a.veiculoId}` : "#"} className="flex items-center gap-1.5 hover:text-foreground">
              <Placa placa={a.placa} />
              {veiculo}
            </Link>
          )}
          {a.cliente && <span>{a.cliente}</span>}
          {a.tecnico && <span>· {a.tecnico}</span>}
          <span>· {formatDuracao(a.duracaoMin)}</span>
        </div>
        {a.detalhe && <p className="mt-1 whitespace-pre-line text-[13px] text-foreground-2">{a.detalhe}</p>}
        {erro && <p className="mt-1 text-[13px] text-danger">{erro}</p>}
      </div>

      <div className="flex shrink-0 items-start gap-1.5">
        {a.status === "atendido" && a.checkinId ? (
          <Link href={`/check-in/${a.checkinId}`} className={buttonClass("ghost", "text-[13px]")}>
            Ver check-in
          </Link>
        ) : (
          !encerrado &&
          podeEditar && (
            <Link href={`/check-in/novo?agendamento=${a.id}`} className={buttonClass("secondary", "hidden sm:inline-flex")}>
              <Camera />
              Chegou
            </Link>
          )
        )}
        {podeEditar && a.status !== "atendido" && (
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label={`Ações do agendamento das ${horaSP(inicio)}`}
            aria-expanded={menu}
            className={buttonClass("ghost", "px-2")}
          >
            <MoreHorizontal />
          </button>
        )}
      </div>

      {menu && (
        <div role="menu" className="absolute right-4 top-12 z-30 w-60 overflow-hidden rounded-lg border border-border bg-card py-1 text-sm shadow-pop sm:right-5">
          {!encerrado && (
            <Link role="menuitem" href={`/check-in/novo?agendamento=${a.id}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-subtle sm:hidden">
              <Camera className="size-4" />
              Chegou: fazer check-in
            </Link>
          )}
          {a.status === "agendado" && (
            <button role="menuitem" type="button" onClick={() => status("confirmado")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-subtle">
              <Check className="size-4" />
              Cliente confirmou
            </button>
          )}
          {lembrete && !encerrado && (
            <a role="menuitem" href={lembrete} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2.5 px-3 py-2 hover:bg-subtle">
              <MessageCircle className="size-4 text-[#25D366]" />
              <span>
                Lembrete pelo WhatsApp
                {!a.aceitaWhatsapp && <span className="block text-[12px] text-muted">Cliente sem consentimento registrado</span>}
              </span>
            </a>
          )}
          {!encerrado && (
            <Link role="menuitem" href={`/agenda/${a.id}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-subtle">
              <Pencil className="size-4" />
              Editar ou remarcar
            </Link>
          )}
          {!encerrado && (
            <>
              <div className="my-1 border-t border-border" />
              <button role="menuitem" type="button" onClick={() => status("faltou")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-subtle">
                <UserX className="size-4" />
                Cliente faltou
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => confirm("Cancelar este agendamento?") && status("cancelado")}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-danger hover:bg-subtle"
              >
                <X className="size-4" />
                Cancelar agendamento
              </button>
            </>
          )}
          {encerrado && (
            <button role="menuitem" type="button" onClick={() => status("agendado")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-subtle">
              <RotateCcw className="size-4" />
              Voltar para agendado
            </button>
          )}
        </div>
      )}
    </div>
  );
}
