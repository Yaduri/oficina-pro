"use client";

import { useEffect, useRef, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button, Campo, Card, Erro, Input } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { adicionarItemChecklist, alternarItemChecklist, moverItemChecklist, removerItemChecklist } from "./actions";

type Item = { id: string; grupo: string; descricao: string; ativo: boolean };

export function ListaChecklist({ grupos }: { grupos: { grupo: string; itens: Item[] }[] }) {
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => (
        <Card key={g.grupo}>
          <h3 className="border-b border-border px-5 py-3 text-[15px] font-semibold">{g.grupo}</h3>
          <ul className="divide-y divide-border">
            {g.itens.map((item, i) => (
              <Linha key={item.id} item={item} primeiro={i === 0} ultimo={i === g.itens.length - 1} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Linha({ item, primeiro, ultimo }: { item: Item; primeiro: boolean; ultimo: boolean }) {
  const [pending, start] = useTransition();
  return (
    <li className={cn("flex items-center gap-2 px-4 py-2.5 sm:px-5", pending && "opacity-60")}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={item.ativo}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            start(() => alternarItemChecklist(item.id, v));
          }}
          className="size-[18px] shrink-0 cursor-pointer accent-zinc-900"
          aria-label={`Usar “${item.descricao}” no check-in`}
        />
        <span className={cn("truncate", !item.ativo && "text-muted line-through")}>{item.descricao}</span>
      </label>
      <Button
        variant="ghost"
        className="px-2"
        disabled={pending || primeiro}
        onClick={() => start(() => moverItemChecklist(item.id, "cima"))}
        aria-label={`Subir ${item.descricao}`}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        className="px-2"
        disabled={pending || ultimo}
        onClick={() => start(() => moverItemChecklist(item.id, "baixo"))}
        aria-label={`Descer ${item.descricao}`}
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        className="px-2"
        disabled={pending}
        onClick={() => {
          if (confirm(`Remover “${item.descricao}” do checklist? Os check-ins já feitos não mudam.`)) start(() => removerItemChecklist(item.id));
        }}
        aria-label={`Remover ${item.descricao}`}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

export function NovoItemChecklist({ grupos }: { grupos: string[] }) {
  const { state, pending, onSubmit } = useFormAction(adicionarItemChecklist);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      const d = form.current?.querySelector<HTMLInputElement>("[name=descricao]");
      if (d) {
        d.value = "";
        d.focus();
      }
    }
  }, [state]);

  return (
    <Card>
      <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3 p-5">
        <h3 className="text-[15px] font-semibold">Adicionar item</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <Campo label="Grupo" htmlFor="ck-grupo">
            <Input id="ck-grupo" name="grupo" list="ck-grupos" defaultValue={grupos[0] ?? ""} placeholder="Ex.: Itens do veículo" required className="h-10" />
            <datalist id="ck-grupos">
              {grupos.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Campo>
          <Campo label="Item" htmlFor="ck-descricao">
            <Input id="ck-descricao" name="descricao" placeholder="Ex.: Cadeirinha de criança" required className="h-10" />
          </Campo>
          <Button variant="primary" className="h-10" disabled={pending}>
            <Plus />
            Adicionar
          </Button>
        </div>
        <Erro>{state?.erro}</Erro>
      </form>
    </Card>
  );
}
