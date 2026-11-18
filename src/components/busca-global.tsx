"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Car, FileText, Loader2, Search, User, X } from "lucide-react";
import { Placa } from "@/components/ui";
import { cn } from "@/lib/utils";
import { buscarTudo, type ResultadoBusca } from "@/app/busca/actions";

const GRUPOS: { tipo: ResultadoBusca["tipo"]; titulo: string; icone: typeof Car }[] = [
  { tipo: "os", titulo: "Ordens de serviço", icone: FileText },
  { tipo: "veiculo", titulo: "Veículos", icone: Car },
  { tipo: "cliente", titulo: "Clientes", icone: User },
];

/** Botão de busca do topo + janela de busca (Ctrl+K ou "/") */
export function BuscaGlobal() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [buscou, setBuscou] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [pending, start] = useTransition();

  function abrir() {
    dialog.current?.showModal();
    input.current?.select();
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target instanceof Element ? e.target : null;
      const digitando = alvo?.closest("input, textarea, select, [contenteditable=true]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !digitando)) {
        e.preventDefault();
        abrir();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  // Busca com pequena espera enquanto digita
  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) return;
    const t = setTimeout(() => {
      start(async () => {
        const r = await buscarTudo(termo);
        setResultados(r);
        setBuscou(termo);
        setAtivo(0);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const visiveis = q.trim().length >= 2 ? resultados : [];

  function ir(r: ResultadoBusca) {
    dialog.current?.close();
    setQ("");
    setResultados([]);
    router.push(r.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="grid size-9 place-items-center rounded-md border border-border text-foreground-2 hover:bg-subtle"
        aria-label="Buscar (Ctrl+K)"
        title="Buscar (Ctrl+K)"
      >
        <Search className="size-[18px]" strokeWidth={1.75} />
      </button>
      <dialog
        ref={dialog}
        aria-label="Buscar"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="mx-auto mt-[10vh] mb-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-zinc-950/40"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          {pending ? <Loader2 className="size-5 shrink-0 animate-spin text-muted" /> : <Search className="size-5 shrink-0 text-muted" />}
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAtivo((a) => Math.min(a + 1, visiveis.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAtivo((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && visiveis[ativo]) {
                e.preventDefault();
                ir(visiveis[ativo]);
              }
            }}
            placeholder="Placa, cliente, telefone ou nº da OS"
            aria-label="Buscar placa, cliente, telefone ou número da OS"
            autoComplete="off"
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted focus-visible:outline-none"
          />
          <button type="button" onClick={() => dialog.current?.close()} className="grid size-8 place-items-center rounded-md text-muted hover:bg-subtle" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <p className="px-4 py-6 text-[13px] text-muted">
              Digite ao menos 2 letras. Ex.: <span className="font-medium text-foreground-2">ABC1D23</span>, <span className="font-medium text-foreground-2">Maria</span>,{" "}
              <span className="font-medium text-foreground-2">98765</span> ou <span className="font-medium text-foreground-2">#12</span>.
            </p>
          ) : visiveis.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted">{pending || buscou !== q.trim() ? "Buscando…" : `Nada encontrado para “${q.trim()}”.`}</p>
          ) : (
            GRUPOS.map((g) => {
              const lista = visiveis.filter((r) => r.tipo === g.tipo);
              if (lista.length === 0) return null;
              return (
                <section key={g.tipo} className="py-1.5">
                  <h3 className="px-4 py-1 text-[12px] font-medium text-muted">{g.titulo}</h3>
                  <ul role="listbox" aria-label={g.titulo}>
                    {lista.map((r) => {
                      const i = visiveis.indexOf(r);
                      return (
                        <li key={`${r.tipo}-${r.id}`} role="option" aria-selected={i === ativo}>
                          <button
                            type="button"
                            onClick={() => ir(r)}
                            onMouseEnter={() => setAtivo(i)}
                            className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", i === ativo && "bg-subtle")}
                          >
                            {r.placa ? <Placa placa={r.placa} /> : <g.icone className="size-4 shrink-0 text-muted" aria-hidden />}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{r.titulo}</span>
                              <span className="block truncate text-[12px] text-muted">{r.detalhe}</span>
                            </span>
                            {r.status && <span className="shrink-0 text-[12px] text-muted">{r.status}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </dialog>
    </>
  );
}
