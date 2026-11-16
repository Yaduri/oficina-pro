"use client";

import { useEffect, useRef, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Erro, Input, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatBRL } from "@/lib/utils";
import { adicionarItem, marcarItem, removerItem } from "../actions";

type Item = {
  id: string;
  tipo: "peca" | "servico";
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  concluido: boolean;
  recusado: boolean;
};

const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function ItensOS({
  osId,
  itens,
  editavel,
  valores = true,
  marcavel = editavel,
}: {
  osId: string;
  itens: Item[];
  /** Pode lançar, remover e alterar itens */
  editavel: boolean;
  /** Mostra preços e totais (técnico não vê) */
  valores?: boolean;
  /** Pode marcar itens como feitos */
  marcavel?: boolean;
}) {
  // Itens recusados pelo cliente no orçamento ficam fora do total
  const validos = itens.filter((i) => !i.recusado);
  const soma = (l: Item[]) => l.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const total = soma(validos);
  const pecas = soma(validos.filter((i) => i.tipo === "peca"));
  const recusado = soma(itens.filter((i) => i.recusado));

  return (
    <div className="flex flex-col">
      {itens.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nenhum item lançado. Adicione peças e serviços após o diagnóstico.</p>
      ) : (
        <ul className="divide-y divide-border">
          {itens.map((i) => (
            <LinhaItem key={i.id} osId={osId} item={i} editavel={editavel} valores={valores} marcavel={marcavel} />
          ))}
        </ul>
      )}

      {editavel && <NovoItem osId={osId} />}

      {valores && (
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t border-border px-5 py-4 text-[13px]">
        <dt className="text-muted">Peças</dt>
        <dd className="text-right tabular-nums">{formatBRL(pecas)}</dd>
        <dt className="text-muted">Serviços</dt>
        <dd className="text-right tabular-nums">{formatBRL(total - pecas)}</dd>
        {recusado > 0 && (
          <>
            <dt className="text-muted">Recusado pelo cliente</dt>
            <dd className="text-right text-muted tabular-nums line-through">{formatBRL(recusado)}</dd>
          </>
        )}
        <dt className="pt-1 text-[15px] font-semibold">Total</dt>
        <dd className="pt-1 text-right text-[15px] font-semibold tabular-nums">{formatBRL(total)}</dd>
      </dl>
      )}
    </div>
  );
}

function LinhaItem({
  osId,
  item,
  editavel,
  valores,
  marcavel,
}: {
  osId: string;
  item: Item;
  editavel: boolean;
  valores: boolean;
  marcavel: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", pending && "opacity-60")}>
      <input
        type="checkbox"
        checked={item.concluido}
        disabled={!marcavel || pending || item.recusado}
        onChange={(e) => {
          const v = e.target.checked;
          start(() => marcarItem(osId, item.id, v));
        }}
        aria-label={`Marcar “${item.descricao}” como feito`}
        className="size-[18px] shrink-0 cursor-pointer accent-zinc-900"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium", (item.concluido || item.recusado) && "text-muted line-through")}>{item.descricao}</p>
        <p className="text-[13px] text-muted">
          {item.tipo === "peca" ? "Peça" : "Serviço"} · {qtd(item.quantidade)}
          {valores && <> × {formatBRL(item.valorUnitario)}</>}
          {item.recusado && <span className="font-medium text-danger"> · Recusado pelo cliente</span>}
        </p>
      </div>
      {valores && (
        <span className={cn("font-medium tabular-nums", item.recusado && "text-muted line-through")}>
          {formatBRL(item.quantidade * item.valorUnitario)}
        </span>
      )}
      {editavel && (
        <Button
          variant="ghost"
          className="px-2"
          disabled={pending}
          onClick={() => {
            if (confirm(`Remover “${item.descricao}” da OS?`)) start(() => removerItem(osId, item.id));
          }}
          aria-label={`Remover ${item.descricao}`}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function NovoItem({ osId }: { osId: string }) {
  const { state, pending, onSubmit } = useFormAction(adicionarItem.bind(null, osId));
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      form.current?.querySelector<HTMLInputElement>("[name=descricao]")?.focus();
    }
  }, [state]);

  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border bg-subtle/60 px-4 py-3 sm:px-5">
      <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[110px_1fr_72px_120px_auto]">
        <select name="tipo" aria-label="Tipo" defaultValue="servico" className={cn(inputClass, "h-10")}>
          <option value="servico">Serviço</option>
          <option value="peca">Peça</option>
        </select>
        <Input name="descricao" aria-label="Descrição" placeholder="Descrição" required className="col-span-2 h-10 sm:col-span-1 max-sm:order-first" />
        <Input name="quantidade" aria-label="Quantidade" defaultValue="1" inputMode="decimal" className="h-10 text-right" />
        <Input name="valor" aria-label="Valor unitário (R$)" placeholder="R$ 0,00" inputMode="decimal" required className="h-10 text-right" />
        <Button variant="primary" className="h-10" disabled={pending}>
          <Plus />Adicionar
        </Button>
      </div>
      <Erro>{state?.erro}</Erro>
    </form>
  );
}
