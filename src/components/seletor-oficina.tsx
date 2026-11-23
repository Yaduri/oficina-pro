"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import type { OficinaResumo } from "@/lib/oficina";
import { trocarOficina } from "@/app/(app)/oficina-actions";
import { PAPEIS } from "@/lib/permissoes";
import { cn } from "@/lib/utils";

type Props = {
  atualId: string;
  oficinas: OficinaResumo[];
  retorno?: string;
  variante?: "topbar" | "banner";
  className?: string;
};

/**
 * Seletor de oficina ativa. Não renderiza nada quando o usuário pertence a apenas 1 oficina.
 * - "topbar": botão compacto no topo com menu acessível.
 * - "banner": faixa destacada no Novo Check-in com troca rápida em 1 toque (alvos >= 44px).
 */
export function SeletorOficina({ atualId, oficinas, retorno, variante = "topbar", className }: Props) {
  const [prevAtualId, setPrevAtualId] = useState(atualId);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  if (atualId !== prevAtualId) {
    setPrevAtualId(atualId);
    setAberto(false);
    setAlvoId(null);
    setErro(null);
  }

  useEffect(() => {
    if (variante !== "topbar" || !aberto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [aberto, variante]);

  if (oficinas.length <= 1) return null;

  const atual = oficinas.find((o) => o.id === atualId) ?? oficinas[0];

  function selecionar(id: string) {
    if (pendente) return;
    if (id === atual.id) {
      setAberto(false);
      return;
    }
    setErro(null);
    setAlvoId(id);
    startTransition(async () => {
      const res = await trocarOficina(id, retorno);
      if (res?.erro) {
        setErro(res.erro);
        setAlvoId(null);
      }
    });
  }

  if (variante === "banner") {
    const outras = oficinas.filter((o) => o.id !== atual.id);
    return (
      <div
        role="region"
        aria-label="Oficina ativa no check-in"
        className={cn("flex flex-col gap-3 rounded-lg border border-info/30 bg-info-soft/60 px-4 py-3", className)}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-foreground">
            <Building2 className="size-4 shrink-0 text-info" strokeWidth={1.75} aria-hidden />
            <span className="truncate">
              Registrando entrada em: <strong className="font-semibold">{atual.nome}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {outras.map((o) => {
              const carregando = pendente && alvoId === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={pendente}
                  onClick={() => selecionar(o.id)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-info/30 bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-card transition-colors hover:bg-subtle disabled:opacity-60"
                >
                  {carregando ? (
                    <Loader2 className="size-4 animate-spin text-info" aria-hidden />
                  ) : (
                    <Building2 className="size-3.5 text-muted" aria-hidden />
                  )}
                  <span>Trocar para {o.nome}</span>
                </button>
              );
            })}
          </div>
        </div>
        {erro && (
          <p role="alert" className="text-xs font-medium text-danger">
            {erro}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Oficina ativa: ${atual.nome}. Clique para trocar`}
        disabled={pendente}
        onClick={() => {
          setErro(null);
          setAberto((v) => !v);
        }}
        className={cn(
          "flex h-9 w-full max-w-full items-center justify-between gap-1.5 rounded-md border border-border bg-subtle/60 px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-subtle disabled:opacity-60 sm:w-auto sm:max-w-[180px] 2xl:max-w-[220px]",
          aberto && "bg-subtle",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {pendente ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" aria-hidden />
          ) : (
            <Building2 className="size-3.5 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          )}
          <span className="truncate">{atual.nome}</span>
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted transition-transform", aberto && "rotate-180")} aria-hidden />
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Trocar de oficina"
          className="absolute left-0 z-40 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-1 shadow-pop"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Suas oficinas</p>
          <div className="flex flex-col gap-0.5">
            {oficinas.map((o) => {
              const ativa = o.id === atual.id;
              const carregando = pendente && alvoId === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={ativa}
                  disabled={pendente}
                  onClick={() => selecionar(o.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors disabled:opacity-60",
                    ativa ? "bg-subtle text-foreground" : "text-foreground-2 hover:bg-subtle/70",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{o.nome}</span>
                    <span className="block truncate text-xs text-muted">{PAPEIS[o.papel].label}</span>
                  </span>
                  {carregando ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
                  ) : ativa ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
          {erro && (
            <p role="alert" className="mt-1 border-t border-border px-2.5 pt-2 pb-1 text-xs font-medium text-danger">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
