"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { Button, Erro, Input } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { desfazerFechamento, fecharComissao } from "./actions";

/** Fecha a comissão do técnico: escolhe o vencimento e gera a conta a pagar */
export function FecharComissao({
  tecnicoId,
  nome,
  de,
  ate,
  total,
  vencimento,
  valor,
}: {
  tecnicoId: string;
  nome: string;
  de: string;
  ate: string;
  total: number;
  vencimento: string;
  valor: string;
}) {
  const { state, pending, onSubmit } = useFormAction(fecharComissao.bind(null, tecnicoId, de, ate));
  const id = `venc-${tecnicoId}`;
  return (
    <form
      onSubmit={(e) => {
        if (!confirm(`Fechar a comissão de ${nome} (${valor})? Será criada uma conta a pagar.`)) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="total" value={total} />
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={id} className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Vencimento</span>
          <Input id={id} type="date" name="vencimento" defaultValue={vencimento} required className="h-9 w-auto" />
        </label>
        <Button variant="primary" disabled={pending}>
          {pending ? "Fechando…" : "Fechar comissão"}
        </Button>
      </div>
      <Erro>{state?.erro}</Erro>
      {state?.ok && (
        <p role="status" className="text-[13px] text-ok">
          Comissão fechada. Pague em A pagar.
        </p>
      )}
    </form>
  );
}

/** Desfaz um fechamento (só sem pagamento) */
export function DesfazerFechamento({ id, rotulo }: { id: string; rotulo: string }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        className="h-8 px-2 text-[13px]"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Desfazer o fechamento ${rotulo}? A conta a pagar será cancelada e as OS voltam para a apuração.`)) return;
          setErro(undefined);
          start(async () => {
            const r = await desfazerFechamento(id);
            if (r.erro) setErro(r.erro);
          });
        }}
      >
        <Undo2 aria-hidden />
        {pending ? "Desfazendo…" : "Desfazer"}
      </Button>
      {erro && (
        <span role="alert" className="max-w-56 text-right text-[12px] text-danger">
          {erro}
        </span>
      )}
    </span>
  );
}
