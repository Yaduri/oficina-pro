"use client";

import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui";
import { cn, formatBRL } from "@/lib/utils";

/** Item do catálogo oferecido ao lançar peça ou serviço */
export type OpcaoCatalogo = {
  id: string;
  tipo: "peca" | "servico";
  codigo: string | null;
  descricao: string;
  valor: number;
  empresaId: string | null;
};

/**
 * Campo de descrição que sugere itens do catálogo enquanto digita.
 * Continua aceitando texto livre; ao escolher uma sugestão, chama `onEscolher`.
 */
export function BuscaCatalogo({
  catalogo,
  value,
  onChange,
  onEscolher,
  name,
  placeholder = "Descrição ou buscar no catálogo",
  className,
}: {
  catalogo: OpcaoCatalogo[];
  value: string;
  onChange: (texto: string) => void;
  onEscolher: (c: OpcaoCatalogo) => void;
  name?: string;
  placeholder?: string;
  className?: string;
}) {
  const lista = useId();
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const sugestoes = useMemo(() => {
    const t = value.trim().toLowerCase();
    if (t.length < 2) return [];
    const termos = t.split(/\s+/);
    return catalogo
      .filter((c) => termos.every((p) => c.descricao.toLowerCase().includes(p) || c.codigo?.toLowerCase().includes(p)))
      .slice(0, 8);
  }, [value, catalogo]);
  const mostrar = aberto && sugestoes.length > 0;

  function pegar(c: OpcaoCatalogo) {
    setAberto(false);
    onEscolher(c);
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        name={name}
        aria-label="Descrição"
        placeholder={placeholder}
        required
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={lista}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
          setAtivo(0);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
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
        className="h-10"
      />
      {mostrar && (
        <ul id={lista} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-pop">
          {sugestoes.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => {
                e.preventDefault();
                pegar(c);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm", i === ativo && "bg-subtle")}
            >
              <span className="min-w-0">
                <span className="block truncate">{c.descricao}</span>
                <span className="text-[12px] text-muted">
                  {c.tipo === "peca" ? "Peça" : "Serviço"}
                  {c.codigo && ` · ${c.codigo}`}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-foreground-2">{formatBRL(c.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
