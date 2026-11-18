"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Erro, Input, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { BuscaCatalogo, type OpcaoCatalogo } from "@/components/busca-catalogo";
import { calcularTotais } from "@/lib/os-total";
import { cn, formatBRL } from "@/lib/utils";
import { adicionarItem, marcarItem, removerItem } from "../actions";
import { definirDesconto, editarItem } from "../edicao";

type Item = {
  id: string;
  tipo: "peca" | "servico";
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  concluido: boolean;
  recusado: boolean;
};

type Desconto = { percentual: number | null; valor: number };

const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const valorTxt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ItensOS({
  osId,
  itens,
  editavel,
  valores = true,
  marcavel = editavel,
  desconto = { percentual: null, valor: 0 },
  catalogo = [],
}: {
  osId: string;
  itens: Item[];
  /** Pode lançar, remover e alterar itens */
  editavel: boolean;
  /** Mostra preços e totais (técnico não vê) */
  valores?: boolean;
  /** Pode marcar itens como feitos */
  marcavel?: boolean;
  desconto?: Desconto;
  /** Catálogo de serviços e peças (busca ao lançar item) */
  catalogo?: OpcaoCatalogo[];
}) {
  const t = calcularTotais(itens, desconto);

  return (
    <div className="flex flex-col">
      {itens.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nenhum item lançado. Adicione peças e serviços após o diagnóstico.</p>
      ) : (
        <ul className="divide-y divide-border">
          {itens.map((i) => (
            <LinhaItem
              key={i.id}
              osId={osId}
              item={i}
              editavel={editavel}
              valores={valores}
              marcavel={marcavel}
            />
          ))}
        </ul>
      )}

      {editavel && <NovoItem osId={osId} catalogo={catalogo} />}

      {valores && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t border-border px-5 py-4 text-[13px]">
          <dt className="text-muted">Peças</dt>
          <dd className="text-right tabular-nums">{formatBRL(t.pecas)}</dd>
          <dt className="text-muted">Serviços</dt>
          <dd className="text-right tabular-nums">{formatBRL(t.servicos)}</dd>
          {t.recusado > 0 && (
            <>
              <dt className="text-muted">Recusado pelo cliente</dt>
              <dd className="text-right text-muted tabular-nums line-through">{formatBRL(t.recusado)}</dd>
            </>
          )}
          <LinhaDesconto osId={osId} desconto={desconto} valor={t.desconto} editavel={editavel && itens.length > 0} />
          <dt className="pt-1 text-[15px] font-semibold">Total</dt>
          <dd className="pt-1 text-right text-[15px] font-semibold tabular-nums">{formatBRL(t.total)}</dd>
        </dl>
      )}
    </div>
  );
}

/* ---------- Desconto ---------- */

function LinhaDesconto({ osId, desconto, valor, editavel }: { osId: string; desconto: Desconto; valor: number; editavel: boolean }) {
  const [editando, setEditando] = useState(false);
  const { state, pending, onSubmit } = useFormAction(async (prev: Awaited<ReturnType<typeof definirDesconto>>, form: FormData) => {
    const r = await definirDesconto(osId, prev, form);
    if (r?.ok) setEditando(false);
    return r;
  });
  const tem = valor > 0;

  if (editando) {
    return (
      <dd className="col-span-2 py-1.5">
        <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-md border border-border bg-subtle/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select name="tipo" aria-label="Tipo de desconto" defaultValue={desconto.percentual != null ? "percentual" : "valor"} className={cn(inputClass, "h-9 w-auto text-sm")}>
              <option value="valor">R$</option>
              <option value="percentual">%</option>
            </select>
            <Input
              name="valor"
              aria-label="Valor do desconto"
              inputMode="decimal"
              defaultValue={desconto.percentual != null ? String(desconto.percentual).replace(".", ",") : desconto.valor ? valorTxt(desconto.valor) : ""}
              className="h-9 w-28 text-right text-sm"
              autoFocus
            />
            <Button type="submit" variant="primary" disabled={pending}>
              Aplicar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
          <Erro>{state?.erro}</Erro>
        </form>
      </dd>
    );
  }

  if (!tem && !editavel) return null;
  return (
    <>
      <dt className="text-muted">
        Desconto{desconto.percentual != null && tem ? ` (${desconto.percentual.toLocaleString("pt-BR")}%)` : ""}
        {editavel && (
          <button type="button" onClick={() => setEditando(true)} className="ml-2 font-medium text-foreground underline-offset-4 hover:underline">
            {tem ? "alterar" : "adicionar"}
          </button>
        )}
      </dt>
      <dd className="text-right tabular-nums">{tem ? `− ${formatBRL(valor)}` : "—"}</dd>
    </>
  );
}

/* ---------- Item ---------- */

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
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <li className="bg-subtle/60 px-4 py-3 sm:px-5">
        <FormItem
          acao={editarItem.bind(null, osId, item.id)}
          item={item}
          rotulo="Salvar"
          onDone={() => setEditando(false)}
          onCancel={() => setEditando(false)}
        />
      </li>
    );
  }

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
        <p className="flex flex-wrap items-center gap-x-1 text-[13px] text-muted">
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
        <div className="flex">
          <Button variant="ghost" className="px-2" disabled={pending} onClick={() => setEditando(true)} aria-label={`Alterar ${item.descricao}`}>
            <Pencil />
          </Button>
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
        </div>
      )}
    </li>
  );
}

type AcaoItem = (prev: { erro?: string; ok?: boolean } | undefined, form: FormData) => Promise<{ erro?: string; ok?: boolean } | undefined>;

function FormItem({
  acao,
  item,
  rotulo,
  onDone,
  onCancel,
  limparAoSalvar = false,
  catalogo = [],
}: {
  acao: AcaoItem;
  item?: Item;
  rotulo: string;
  onDone?: () => void;
  onCancel?: () => void;
  limparAoSalvar?: boolean;
  catalogo?: OpcaoCatalogo[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const [catalogoId, setCatalogoId] = useState("");
  const [texto, setTexto] = useState("");
  const { state, pending, onSubmit } = useFormAction(async (prev: Awaited<ReturnType<AcaoItem>>, dados: FormData) => {
    const r = await acao(prev, dados);
    if (r?.ok) {
      onDone?.();
      if (limparAoSalvar) {
        setCatalogoId("");
        setTexto("");
      }
    }
    return r;
  });
  useEffect(() => {
    if (state?.ok && limparAoSalvar) {
      form.current?.reset();
      form.current?.querySelector<HTMLInputElement>("[name=descricao]")?.focus();
    }
  }, [state, limparAoSalvar]);

  /** Preenche tipo, descrição e valor a partir do catálogo */
  function escolher(c: OpcaoCatalogo) {
    const el = form.current?.elements;
    if (!el) return;
    const campo = (n: string) => el.namedItem(n) as HTMLInputElement | HTMLSelectElement | null;
    campo("tipo")!.value = c.tipo;
    setTexto(c.descricao);
    campo("valor")!.value = valorTxt(c.valor);
    setCatalogoId(c.id);
    (campo("quantidade") as HTMLInputElement | null)?.select();
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="catalogoItemId" value={catalogoId} />
      <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[110px_1fr_72px_120px_auto]">
        <select name="tipo" aria-label="Tipo" defaultValue={item?.tipo ?? "servico"} className={cn(inputClass, "h-10")}>
          <option value="servico">Serviço</option>
          <option value="peca">Peça</option>
        </select>
        {catalogo.length > 0 && !item ? (
          <BuscaCatalogo
            name="descricao"
            catalogo={catalogo}
            value={texto}
            onChange={(t) => {
              setTexto(t);
              setCatalogoId("");
            }}
            onEscolher={escolher}
            className="col-span-2 sm:col-span-1 max-sm:order-first"
          />
        ) : (
          <Input
            name="descricao"
            aria-label="Descrição"
            placeholder="Descrição"
            defaultValue={item?.descricao}
            required
            className="col-span-2 h-10 sm:col-span-1 max-sm:order-first"
          />
        )}
        <Input name="quantidade" aria-label="Quantidade" defaultValue={item ? qtd(item.quantidade) : "1"} inputMode="decimal" className="h-10 text-right" />
        <Input
          name="valor"
          aria-label="Valor unitário (R$)"
          placeholder="R$ 0,00"
          defaultValue={item ? valorTxt(item.valorUnitario) : undefined}
          inputMode="decimal"
          required
          className="h-10 text-right"
        />
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <Button variant="primary" className="h-10 flex-1" disabled={pending}>
            {!item && <Plus />}
            {rotulo}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
      <Erro>{state?.erro}</Erro>
    </form>
  );
}

function NovoItem({ osId, catalogo }: { osId: string; catalogo: OpcaoCatalogo[] }) {
  return (
    <div className="border-t border-border bg-subtle/60 px-4 py-3 sm:px-5">
      <FormItem acao={adicionarItem.bind(null, osId)} rotulo="Adicionar" limparAoSalvar catalogo={catalogo} />
    </div>
  );
}
