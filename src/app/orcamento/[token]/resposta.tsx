"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button, Campo, Erro, Input, Textarea } from "@/components/ui";
import type { ItemOrcamento } from "@/db/schema";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatBRL } from "@/lib/utils";
import { responderOrcamento } from "./actions";

const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function RespostaOrcamento({
  token,
  itens,
  nomeInicial,
}: {
  token: string;
  itens: ItemOrcamento[];
  nomeInicial: string;
}) {
  const { state, pending, onSubmit } = useFormAction(responderOrcamento.bind(null, token));
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(itens.map((i) => i.id)));
  const total = itens.filter((i) => marcados.has(i.id)).reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const todos = marcados.size === itens.length;

  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="rounded-lg border border-border bg-card shadow-card">
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold">Peças e serviços</h2>
          {itens.length > 1 && <span className="text-[13px] text-muted">Desmarque o que não quiser fazer</span>}
        </div>
        <ul className="divide-y divide-border">
          {itens.map((i) => {
            const marcado = marcados.has(i.id);
            return (
              <li key={i.id}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3.5 hover:bg-subtle sm:px-5">
                  <input
                    type="checkbox"
                    name="itens"
                    value={i.id}
                    checked={marcado}
                    onChange={() => alternar(i.id)}
                    className="mt-0.5 size-5 shrink-0 cursor-pointer accent-zinc-900"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block font-medium", !marcado && "text-muted line-through")}>{i.descricao}</span>
                    <span className="block text-[13px] text-muted">
                      {i.tipo === "peca" ? "Peça" : "Serviço"} · {qtd(i.quantidade)} × {formatBRL(i.valorUnitario)}
                    </span>
                  </span>
                  <span className={cn("font-medium tabular-nums", !marcado && "text-muted line-through")}>
                    {formatBRL(i.quantidade * i.valorUnitario)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between border-t border-border px-4 py-3 text-[16px] font-semibold sm:px-5">
          <span>{todos ? "Total" : "Total selecionado"}</span>
          <span className="tabular-nums">{formatBRL(total)}</span>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-card sm:p-5">
        <Campo label="Seu nome" htmlFor="nome">
          <Input id="nome" name="nome" defaultValue={nomeInicial} required minLength={2} autoComplete="name" />
        </Campo>
        <Campo label="Comentário" hint="(opcional)" htmlFor="comentario">
          <Textarea id="comentario" name="comentario" rows={2} className="min-h-16" placeholder="Alguma dúvida ou pedido para a oficina?" />
        </Campo>
        <Erro>{state?.erro}</Erro>
      </section>

      {/* Ações fixas no rodapé no celular */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row-reverse sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none print:hidden">
        <Button
          type="submit"
          name="decisao"
          value="aprovar"
          variant="primary"
          disabled={pending || marcados.size === 0}
          className="h-12 text-[15px] sm:h-10 sm:text-sm"
        >
          <Check />
          {todos ? `Aprovar orçamento · ${formatBRL(total)}` : `Aprovar selecionados · ${formatBRL(total)}`}
        </Button>
        <Button
          type="submit"
          name="decisao"
          value="recusar"
          disabled={pending}
          className="h-11 sm:h-10"
          onClick={(e) => {
            if (!confirm("Recusar todo o orçamento?")) e.preventDefault();
          }}
        >
          <X />
          Recusar
        </Button>
      </div>
    </form>
  );
}
