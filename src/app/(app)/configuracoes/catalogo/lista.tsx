"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button, Campo, Card, CardHeader, Erro, Input, Vazio } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatBRL } from "@/lib/utils";
import { alternarItemCatalogo, removerItemCatalogo, salvarItemCatalogo } from "./actions";

type Tipo = "servico" | "peca";
type Item = {
  id: string;
  tipo: Tipo;
  codigo: string | null;
  descricao: string;
  valor: number;
  tempoMinutos: number | null;
  tempo: string | null;
  codigoServicoMunicipal: string | null;
  ativo: boolean;
};

const valorTxt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Formulário (novo e edição) ---------- */

export function FormItemCatalogo({ tipo, item, onDone }: { tipo: Tipo; item?: Item; onDone?: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useFormAction(salvarItemCatalogo.bind(null, item?.id ?? null));
  useEffect(() => {
    if (!state?.ok) return;
    if (item) onDone?.();
    else {
      form.current?.reset();
      form.current?.querySelector<HTMLInputElement>("[name=descricao]")?.focus();
    }
  }, [state, item, onDone]);
  const servico = tipo === "servico";
  const pid = item?.id ?? `novo-${tipo}`;

  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="tipo" value={tipo} />
      <Campo label="Descrição" htmlFor={`${pid}-desc`}>
        <Input id={`${pid}-desc`} name="descricao" defaultValue={item?.descricao} required placeholder={servico ? "Troca de óleo e filtro" : "Filtro de óleo"} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label={servico ? "Valor" : "Preço de venda"} htmlFor={`${pid}-valor`}>
          <Input id={`${pid}-valor`} name="valor" inputMode="decimal" placeholder="R$ 0,00" defaultValue={item ? valorTxt(item.valor) : ""} className="text-right" />
        </Campo>
        {servico ? (
          <Campo label="Tempo padrão" hint="(opcional)" htmlFor={`${pid}-tempo`}>
            <Input id={`${pid}-tempo`} name="tempo" placeholder="1h30" defaultValue={item?.tempo ?? ""} />
          </Campo>
        ) : (
          <Campo label="Código" hint="(opcional)" htmlFor={`${pid}-cod`}>
            <Input id={`${pid}-cod`} name="codigo" defaultValue={item?.codigo ?? ""} autoComplete="off" />
          </Campo>
        )}
      </div>
      {servico && (
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Código interno" hint="(opcional)" htmlFor={`${pid}-cod`}>
            <Input id={`${pid}-cod`} name="codigo" defaultValue={item?.codigo ?? ""} autoComplete="off" />
          </Campo>
          <Campo label="Cód. serviço municipal" hint="(NFS-e)" htmlFor={`${pid}-mun`}>
            <Input id={`${pid}-mun`} name="codigoServicoMunicipal" defaultValue={item?.codigoServicoMunicipal ?? ""} placeholder="14.01" />
          </Campo>
        </div>
      )}
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" disabled={pending}>
          {!item && <Plus />}
          {pending ? "Salvando…" : item ? "Salvar" : servico ? "Adicionar serviço" : "Adicionar peça"}
        </Button>
      </div>
    </form>
  );
}

/* ---------- Lista ---------- */

export function ListaCatalogo({ tipo, itens }: { tipo: Tipo; itens: Item[] }) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const servico = tipo === "servico";

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) => i.descricao.toLowerCase().includes(q) || i.codigo?.toLowerCase().includes(q));
  }, [busca, itens]);

  return (
    <Card className="min-w-0">
      <CardHeader
        title={servico ? "Serviços" : "Peças"}
        action={<span className="text-[13px] text-muted">{itens.length}</span>}
      />
      {itens.length > 6 && (
        <div className="relative border-b border-border px-4 py-3 sm:px-5">
          <Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted sm:left-8" aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por descrição ou código" aria-label="Buscar no catálogo" className="pl-9" />
        </div>
      )}
      {itens.length === 0 ? (
        <Vazio titulo={servico ? "Nenhum serviço no catálogo" : "Nenhuma peça no catálogo"}>
          {servico
            ? "Cadastre os serviços mais comuns com o valor. Na OS, é só buscar e o preço já vem preenchido."
            : "Cadastre as peças que vocês vendem com o preço. Na fase de estoque, elas ganham quantidade e custo."}
        </Vazio>
      ) : filtrados.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nada encontrado para “{busca}”.</p>
      ) : (
        <ul className={cn("divide-y divide-border", pending && "opacity-60")}>
          {filtrados.map((i) => {
            if (editando === i.id) {
              return (
                <li key={i.id} className="bg-subtle/60 px-4 py-4 sm:px-5">
                  <FormItemCatalogo tipo={tipo} item={i} onDone={() => setEditando(null)} />
                </li>
              );
            }
            return (
              <li key={i.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5", !i.ativo && "text-muted")}>
                <div className="min-w-0 flex-1 basis-56">
                  <p className={cn("font-medium", !i.ativo && "line-through")}>{i.descricao}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                    {i.codigo && <span>Cód. {i.codigo}</span>}
                    {i.tempo && <span>{i.tempo}</span>}
                    {i.codigoServicoMunicipal && <span>NFS-e {i.codigoServicoMunicipal}</span>}
                    {!i.ativo && <span>Desativado</span>}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatBRL(i.valor)}</span>
                <div className="flex items-center gap-1">
                  <label className="flex cursor-pointer items-center gap-1.5 px-1.5 text-[12px] text-muted" title={i.ativo ? "Aparece na OS" : "Não aparece na OS"}>
                    <input
                      type="checkbox"
                      checked={i.ativo}
                      onChange={(e) => start(() => alternarItemCatalogo(i.id, e.target.checked))}
                      className="size-4 accent-zinc-900"
                      aria-label={`Usar “${i.descricao}” na OS`}
                    />
                    Ativo
                  </label>
                  <Button variant="ghost" className="px-2" onClick={() => setEditando(i.id)} aria-label={`Editar ${i.descricao}`}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 hover:text-danger"
                    onClick={() => {
                      if (confirm(`Remover “${i.descricao}” do catálogo? As OS que já usam continuam iguais.`)) start(() => removerItemCatalogo(i.id));
                    }}
                    aria-label={`Remover ${i.descricao}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
