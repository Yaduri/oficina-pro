"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { lerQtd, qtdTexto } from "@/lib/estoque-formato";
import { cn, formatBRL } from "@/lib/utils";
import { Saldo } from "../saldo";

type Item = {
  id: string;
  codigo: string | null;
  descricao: string;
  marca: string | null;
  unidade: string;
  saldo: number;
  minimo: number;
  /** null: usuário não vê valores */
  custoMedio: number | null;
  sugestao: number;
};

const qtdCampo = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

/** Peças a repor: escolhe quais e quanto, e abre o pedido de compra já preenchido */
export function ListaReposicao({ itens }: { itens: Item[] }) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(itens.map((i) => i.id)));
  const [qtds, setQtds] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.id, qtdCampo(i.sugestao)])));

  const escolhidos = useMemo(
    () =>
      itens
        .filter((i) => marcados.has(i.id))
        .map((i) => ({ item: i, qtd: lerQtd(qtds[i.id] ?? "") }))
        .filter((x) => Number.isFinite(x.qtd) && x.qtd > 0),
    [itens, marcados, qtds],
  );
  const invalidos = itens.filter((i) => marcados.has(i.id)).length - escolhidos.length;
  const custoTotal = escolhidos.reduce((s, x) => s + x.qtd * (x.item.custoMedio ?? 0), 0);
  const mostraCusto = itens.some((i) => i.custoMedio !== null);

  const todos = marcados.size === itens.length;
  function alternar(id: string, v: boolean) {
    setMarcados((m) => {
      const n = new Set(m);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function criarPedido() {
    const pecas = escolhidos.map((x) => `${x.item.id}:${Math.round(x.qtd * 1000) / 1000}`).join(",");
    router.push(`/estoque/compras/nova?pecas=${pecas}`);
  }

  const campoQtd = (i: Item, className?: string) => (
    <Input
      aria-label={`Quantidade a comprar de ${i.descricao}`}
      inputMode="decimal"
      value={qtds[i.id] ?? ""}
      onChange={(e) => setQtds((q) => ({ ...q, [i.id]: e.target.value }))}
      disabled={!marcados.has(i.id)}
      className={cn("h-9 w-24 text-right text-sm", className)}
    />
  );
  const caixa = (i: Item) => (
    <input
      type="checkbox"
      checked={marcados.has(i.id)}
      onChange={(e) => alternar(i.id, e.target.checked)}
      aria-label={`Comprar ${i.descricao}`}
      className="size-[18px] shrink-0 cursor-pointer accent-zinc-900"
    />
  );
  const nome = (i: Item) => (
    <>
      <Link href={`/estoque/${i.id}`} className="font-medium underline-offset-4 hover:underline">
        {i.descricao}
      </Link>
      {(i.codigo || i.marca) && (
        <span className="flex flex-wrap gap-x-2 text-[13px] text-muted">
          {i.codigo && <span>Cód. {i.codigo}</span>}
          {i.marca && <span>{i.marca}</span>}
        </span>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        {/* Celular: cartões */}
        <ul className="divide-y divide-border md:hidden">
          {itens.map((i) => (
            <li key={i.id} className="flex items-start gap-3 px-4 py-3">
              <span className="pt-0.5">{caixa(i)}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="min-w-0">{nome(i)}</div>
                <div className="flex flex-wrap items-center gap-x-3 text-[13px] text-foreground-2">
                  <span>
                    Saldo <Saldo saldo={i.saldo} minimo={i.minimo} unidade={i.unidade} />
                  </span>
                  <span>Mín. {qtdTexto(i.minimo, i.unidade)}</span>
                </div>
              </div>
              {campoQtd(i)}
            </li>
          ))}
        </ul>

        {/* Tela grande: tabela */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="w-10 border-b border-border bg-zinc-50/60 py-2.5 pl-4">
                  <input
                    type="checkbox"
                    checked={todos}
                    onChange={(e) => setMarcados(e.target.checked ? new Set(itens.map((i) => i.id)) : new Set())}
                    aria-label="Marcar todas"
                    className="size-[18px] cursor-pointer accent-zinc-900"
                  />
                </th>
                <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Peça</th>
                <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Saldo</th>
                <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Mínimo</th>
                {mostraCusto && <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Custo médio</th>}
                <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Comprar</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id} className={cn("[&:not(:last-child)>td]:border-b [&>td]:border-border", !marcados.has(i.id) && "text-muted")}>
                  <td className="py-3 pl-4">{caixa(i)}</td>
                  <td className="px-4 py-3">{nome(i)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Saldo saldo={i.saldo} minimo={i.minimo} unidade={i.unidade} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{i.minimo > 0 ? qtdTexto(i.minimo, i.unidade) : "—"}</td>
                  {mostraCusto && (
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{i.custoMedio ? formatBRL(i.custoMedio) : "—"}</td>
                  )}
                  <td className="px-4 py-2 text-right">{campoQtd(i, "ml-auto")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-[13px] text-muted">
          {invalidos > 0
            ? `Quantidade inválida em ${invalidos} ${invalidos === 1 ? "peça" : "peças"}`
            : `${escolhidos.length} ${escolhidos.length === 1 ? "peça" : "peças"}${mostraCusto && custoTotal > 0 ? `, cerca de ${formatBRL(custoTotal)}` : ""}`}
        </span>
        <Button variant="primary" disabled={escolhidos.length === 0 || invalidos > 0} onClick={criarPedido}>
          Criar pedido de compra
        </Button>
      </div>
    </div>
  );
}
