"use client";

import { useState } from "react";
import { Button, Campo, Erro, Input } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { lerQtd, qtdTexto } from "@/lib/estoque-formato";
import { cn } from "@/lib/utils";
import { ajustarEstoque, type AjusteState } from "../pecas-actions";

const MODOS = [
  ["definir", "Novo saldo"],
  ["entrada", "Somar"],
  ["saida", "Tirar"],
] as const;
type Modo = (typeof MODOS)[number][0];

/** Ajuste manual do saldo (vira movimento "Ajuste" com o motivo) */
export function AjustarEstoque({ id, saldo, unidade, custo }: { id: string; saldo: number; unidade: string; custo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("definir");
  const [quantidade, setQuantidade] = useState("");
  const { state, pending, onSubmit } = useFormAction(async (prev: AjusteState, dados: FormData) => {
    const r = await ajustarEstoque(id, prev, dados);
    if (r?.ok) {
      setAberto(false);
      setQuantidade("");
    }
    return r;
  });

  const n = lerQtd(quantidade);
  const novo = Number.isFinite(n) ? (modo === "definir" ? n : modo === "entrada" ? saldo + n : saldo - n) : null;
  const aumenta = novo !== null && novo > saldo;

  if (!aberto) {
    return (
      <Button variant="primary" onClick={() => setAberto(true)}>
        Ajustar estoque
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card sm:max-w-md">
      <input type="hidden" name="modo" value={modo} />
      <div className="flex gap-1 rounded-md bg-subtle p-1 text-[13px] font-medium" role="radiogroup" aria-label="Tipo de ajuste">
        {MODOS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={modo === v}
            onClick={() => setModo(v)}
            className={cn("flex-1 rounded px-3 py-1.5", modo === v ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground")}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label={modo === "definir" ? "Quantidade contada" : "Quantidade"} htmlFor="ajuste-qtd">
          <Input
            id="ajuste-qtd"
            name="quantidade"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
            autoFocus
            className="text-right"
          />
        </Campo>
        {custo && aumenta ? (
          <Campo label="Custo unitário" hint="(opcional)" htmlFor="ajuste-custo">
            <Input id="ajuste-custo" name="custo" inputMode="decimal" placeholder="R$ 0,00" className="text-right" />
          </Campo>
        ) : (
          <div />
        )}
      </div>
      {novo !== null && quantidade.trim() && (
        <p className="text-[13px] text-muted">
          Saldo: {qtdTexto(saldo, unidade)} → <span className={cn("font-medium", novo < 0 ? "text-danger" : "text-foreground")}>{qtdTexto(novo, unidade)}</span>
        </p>
      )}
      <Campo label="Motivo" htmlFor="ajuste-motivo">
        <Input id="ajuste-motivo" name="motivo" required minLength={3} maxLength={200} placeholder="Peça danificada, contagem, devolução…" />
      </Campo>
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <Button variant="primary" disabled={pending}>
          {pending ? "Salvando…" : "Aplicar ajuste"}
        </Button>
      </div>
    </form>
  );
}
