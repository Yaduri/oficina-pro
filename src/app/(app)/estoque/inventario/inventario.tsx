"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button, Card, Erro, Input } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { lerQtd, qtdTexto } from "@/lib/estoque-formato";
import { cn, formatBRL } from "@/lib/utils";
import { aplicarInventario, type InventarioState } from "../pecas-actions";

type Peca = {
  id: string;
  codigo: string | null;
  descricao: string;
  marca: string | null;
  gtin: string | null;
  localizacao: string | null;
  unidade: string;
  saldo: number;
};

/** Contagem física: preenche o que contou e aplica as diferenças como ajuste */
export function Inventario({ pecas, valores }: { pecas: Peca[]; valores: boolean }) {
  const [busca, setBusca] = useState("");
  const [local, setLocal] = useState("");
  const [contado, setContado] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useFormAction(async (prev: InventarioState, dados: FormData) => {
    const r = await aplicarInventario(prev, dados);
    if (r?.ok) setContado({});
    return r;
  });
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  const filtradas = useMemo(() => {
    const termos = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const l = local.trim().toLowerCase();
    return pecas.filter((p) => {
      if (l && !p.localizacao?.toLowerCase().includes(l)) return false;
      const texto = [p.descricao, p.codigo, p.marca, p.gtin].filter(Boolean).join(" ").toLowerCase();
      return termos.every((t) => texto.includes(t));
    });
  }, [pecas, busca, local]);

  const preenchidas = pecas.filter((p) => (contado[p.id] ?? "").trim());
  const invalidas = preenchidas.filter((p) => {
    const n = lerQtd(contado[p.id]);
    return !Number.isFinite(n) || n < 0;
  });
  const diferentes = preenchidas.filter((p) => !invalidas.includes(p) && Math.abs(lerQtd(contado[p.id]) - p.saldo) > 0.0005);

  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-4">
      <input
        type="hidden"
        name="contagem"
        value={JSON.stringify(preenchidas.map((p) => ({ id: p.id, contado: contado[p.id].trim() })))}
      />

      {state?.ok && (
        <p role="status" className="rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok">
          {state.alteradas === 0
            ? `Contagem aplicada: ${state.contadas} ${state.contadas === 1 ? "peça conferida" : "peças conferidas"}, nenhuma diferença.`
            : `Contagem aplicada: ${state.alteradas} ${state.alteradas === 1 ? "peça ajustada" : "peças ajustadas"} de ${state.contadas} ${state.contadas === 1 ? "conferida" : "conferidas"}${
                valores ? `. Diferença em valor: ${state.diferencaValor > 0 ? "+" : state.diferencaValor < 0 ? "−" : ""}${formatBRL(Math.abs(state.diferencaValor))}` : ""
              }.`}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição, código, marca ou código de barras" className="h-10 pl-9" />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Localização</span>
          <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Prateleira A" className="h-10" />
        </label>
      </div>

      <Card className="overflow-hidden">
        {filtradas.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted">Nenhuma peça com esses filtros.</p>
        ) : (
          <ul className="divide-y divide-border">
            <li className="hidden grid-cols-[minmax(0,1fr)_110px_110px_90px] gap-4 bg-zinc-50/60 px-4 py-2.5 text-xs font-medium text-muted sm:grid sm:px-5">
              <span>Peça</span>
              <span className="text-right">No sistema</span>
              <span className="text-right">Contado</span>
              <span className="text-right">Diferença</span>
            </li>
            {filtradas.map((p) => {
              const txt = contado[p.id] ?? "";
              const n = lerQtd(txt);
              const valido = txt.trim() && Number.isFinite(n) && n >= 0;
              const diff = valido ? Math.round((n - p.saldo) * 1000) / 1000 : null;
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_110px_110px_90px] sm:px-5"
                >
                  <div className="min-w-0">
                    <Link href={`/estoque/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {p.descricao}
                    </Link>
                    <span className="flex flex-wrap gap-x-2 text-[13px] text-muted">
                      {p.codigo && <span>Cód. {p.codigo}</span>}
                      {p.localizacao && <span>{p.localizacao}</span>}
                      <span className="sm:hidden">No sistema: {qtdTexto(p.saldo, p.unidade)}</span>
                      {diff !== null && diff !== 0 && (
                        <span className={cn("font-medium sm:hidden", diff < 0 ? "text-danger" : "text-ok")}>
                          {diff > 0 ? "+" : "−"}
                          {qtdTexto(Math.abs(diff), p.unidade)}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className={cn("hidden text-right tabular-nums sm:block", p.saldo < 0 && "font-medium text-danger")}>{qtdTexto(p.saldo, p.unidade)}</span>
                  <Input
                    aria-label={`Quantidade contada de ${p.descricao}`}
                    inputMode="decimal"
                    value={txt}
                    onChange={(e) => setContado((c) => ({ ...c, [p.id]: e.target.value }))}
                    className={cn("h-9 text-right text-sm", txt.trim() && !valido && "border-danger")}
                  />
                  <span
                    className={cn(
                      "hidden text-right tabular-nums sm:block",
                      diff === null || diff === 0 ? "text-muted" : diff < 0 ? "font-medium text-danger" : "font-medium text-ok",
                    )}
                  >
                    {diff === null ? "" : diff === 0 ? "0" : `${diff > 0 ? "+" : "−"}${qtdTexto(Math.abs(diff), p.unidade)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">
            Observação <span className="font-normal text-muted">(opcional)</span>
          </span>
          <Input name="observacao" maxLength={150} placeholder="Contagem do almoxarifado" className="h-10" />
        </label>
        <div className="flex items-center justify-end gap-3">
          <span className="text-[13px] text-muted">
            {invalidas.length > 0
              ? `Quantidade inválida em ${invalidas.length} ${invalidas.length === 1 ? "peça" : "peças"}`
              : `${preenchidas.length} ${preenchidas.length === 1 ? "contada" : "contadas"}, ${diferentes.length} com diferença`}
          </span>
          <Button
            variant="primary"
            className="h-10"
            disabled={pending || preenchidas.length === 0 || invalidas.length > 0}
            onClick={(e) => {
              if (diferentes.length > 0 && !confirm(`Ajustar o saldo de ${diferentes.length} ${diferentes.length === 1 ? "peça" : "peças"} para a quantidade contada?`)) {
                e.preventDefault();
              }
            }}
          >
            {pending ? "Aplicando…" : "Aplicar contagem"}
          </Button>
        </div>
      </div>
      <Erro>{state && !state.ok ? state.erro : undefined}</Erro>
    </form>
  );
}
