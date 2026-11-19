"use client";

import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui";
import { qtdTexto } from "@/lib/estoque-formato";
import { cn } from "@/lib/utils";

export type OpcaoPeca = { id: string; codigo: string | null; descricao: string; unidade: string; custoMedio: number; estoqueAtual: number; gtin: string | null };

/** Busca de peça do catálogo (descrição, código ou código de barras). Mostra a escolhida. */
export function SeletorPeca({
  pecas,
  valor,
  onEscolher,
  rotulo = "Peça",
  className,
}: {
  pecas: OpcaoPeca[];
  valor: string | null;
  onEscolher: (p: OpcaoPeca) => void;
  rotulo?: string;
  className?: string;
}) {
  const lista = useId();
  const atual = pecas.find((p) => p.id === valor);
  const [texto, setTexto] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const mostrado = texto ?? (atual ? `${atual.codigo ? `${atual.codigo} · ` : ""}${atual.descricao}` : "");
  const sugestoes = useMemo(() => {
    const t = (texto ?? "").trim().toLowerCase();
    if (t.length < 1) return pecas.slice(0, 8);
    const termos = t.split(/\s+/);
    return pecas
      .filter((p) => termos.every((x) => p.descricao.toLowerCase().includes(x) || p.codigo?.toLowerCase().includes(x) || p.gtin?.includes(x)))
      .slice(0, 8);
  }, [texto, pecas]);
  const mostrar = aberto && sugestoes.length > 0;

  function pegar(p: OpcaoPeca) {
    setAberto(false);
    setTexto(null);
    onEscolher(p);
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        aria-label={rotulo}
        placeholder="Buscar peça"
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={lista}
        aria-autocomplete="list"
        value={mostrado}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
          setAtivo(0);
        }}
        onFocus={(e) => {
          e.currentTarget.select();
          setAberto(true);
        }}
        onBlur={() =>
          setTimeout(() => {
            setAberto(false);
            setTexto(null);
          }, 150)
        }
        onKeyDown={(e) => {
          if (!mostrar) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((a) => (a + 1) % sugestoes.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => (a - 1 + sugestoes.length) % sugestoes.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pegar(sugestoes[Math.min(ativo, sugestoes.length - 1)]);
          } else if (e.key === "Escape") {
            setAberto(false);
          }
        }}
        className={cn("h-10", !atual && !texto && "border-amber-300")}
      />
      {mostrar && (
        <ul id={lista} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-pop">
          {sugestoes.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => {
                e.preventDefault();
                pegar(p);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm", i === ativo && "bg-subtle")}
            >
              <span className="min-w-0">
                <span className="block truncate">{p.descricao}</span>
                {p.codigo && <span className="text-[12px] text-muted">{p.codigo}</span>}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted">{qtdTexto(p.estoqueAtual, p.unidade)} em estoque</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
