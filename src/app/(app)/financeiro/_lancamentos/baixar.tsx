"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { CircleDollarSign, X } from "lucide-react";
import { Button, Campo, Erro, Input, Select, Textarea } from "@/components/ui";
import { formatBRL, parseValor } from "@/lib/utils";
import { baixarLancamento, type AcaoState } from "./actions";
import type { OpcaoConta } from "./tipos";

type Props = {
  id: string;
  tipo: "receber" | "pagar";
  hoje: string;
  /** Em aberto, em reais */
  emAberto: number;
  contaId: string | null;
  forma: string | null;
  contas: OpcaoConta[];
  formas: { valor: string; label: string }[];
};

/** Conta sugerida pela forma (mesma regra de contaSugerida no servidor) */
function sugerir(contas: OpcaoConta[], forma: string) {
  const por = (t: OpcaoConta["tipo"]) => contas.find((c) => c.tipo === t);
  if (forma === "dinheiro") return por("caixa") ?? contas[0];
  if (forma === "debito" || forma === "credito") return por("maquininha") ?? por("banco") ?? contas[0];
  return por("banco") ?? contas[0];
}

const reaisTxt = (v: number) => v.toFixed(2).replace(".", ",");
const num = (s: string) => {
  const n = parseValor(s);
  return Number.isFinite(n) ? n : 0;
};

/** Botão "Registrar pagamento/recebimento" + janela com data, conta, valor, juros, multa, desconto e taxa */
export function Baixar({ id, tipo, hoje, emAberto, contaId, forma, contas, formas }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [state, dispatch, pending] = useActionState<AcaoState, FormData>(baixarLancamento.bind(null, id), undefined);
  const receber = tipo === "receber";
  const [formaAtual, setFormaAtual] = useState(forma ?? "");
  const [conta, setConta] = useState(contaId ?? (sugerir(contas, forma ?? "")?.id ?? ""));
  const [v, setV] = useState({ valor: reaisTxt(emAberto), juros: "", multa: "", desconto: "", taxa: "" });

  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => dispatch(dados));
  }

  const principal = num(v.valor);
  const bruto = principal + num(v.juros) + num(v.multa) - num(v.desconto);
  const liquido = receber ? bruto - num(v.taxa) : bruto;
  const restara = Math.max(emAberto - principal, 0);
  const campo = (k: keyof typeof v) => ({
    id: `${uid}-${k}`,
    name: k,
    inputMode: "decimal" as const,
    placeholder: "0,00",
    value: v[k],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value })),
  });
  const titulo = receber ? "Registrar recebimento" : "Registrar pagamento";

  return (
    <>
      <Button variant="primary" onClick={() => dialog.current?.showModal()}>
        <CircleDollarSign />
        {receber ? "Receber" : "Pagar"}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`${uid}-titulo`}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-zinc-950/40"
      >
        <form onSubmit={onSubmit} className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id={`${uid}-titulo`} className="text-[17px] font-semibold">
              {titulo}
            </h2>
            <Button type="button" variant="ghost" className="px-2" onClick={() => dialog.current?.close()} aria-label="Fechar">
              <X />
            </Button>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            <p className="text-[13px] text-muted">Em aberto: {formatBRL(emAberto)}. Pode registrar só uma parte; o restante continua em aberto.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Data" htmlFor={`${uid}-data`}>
                <Input id={`${uid}-data`} name="data" type="date" required max={hoje} defaultValue={hoje} />
              </Campo>
              <Campo label="Forma" htmlFor={`${uid}-forma`}>
                <Select
                  id={`${uid}-forma`}
                  name="forma"
                  value={formaAtual}
                  onChange={(e) => {
                    setFormaAtual(e.target.value);
                    const s = sugerir(contas, e.target.value);
                    if (s) setConta(s.id);
                  }}
                >
                  <option value="">Não informada</option>
                  {formas.map((x) => (
                    <option key={x.valor} value={x.valor}>
                      {x.label}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
            <Campo label={receber ? "Conta que recebeu" : "Conta de onde saiu"} htmlFor={`${uid}-conta`}>
              <Select id={`${uid}-conta`} name="contaId" required value={conta} onChange={(e) => setConta(e.target.value)}>
                <option value="" disabled>
                  Escolha…
                </option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Valor abatido da conta (R$)" htmlFor={`${uid}-valor`} hint={restara > 0 && principal > 0 ? `(fica ${formatBRL(restara)} em aberto)` : undefined}>
              <Input required {...campo("valor")} />
            </Campo>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Campo label="Juros" htmlFor={`${uid}-juros`}>
                <Input {...campo("juros")} />
              </Campo>
              <Campo label="Multa" htmlFor={`${uid}-multa`}>
                <Input {...campo("multa")} />
              </Campo>
              <Campo label="Desconto" htmlFor={`${uid}-desconto`}>
                <Input {...campo("desconto")} />
              </Campo>
              {receber && (
                <Campo label="Taxa" htmlFor={`${uid}-taxa`} hint="(cartão)">
                  <Input {...campo("taxa")} />
                </Campo>
              )}
            </div>
            <p className="rounded-md bg-subtle px-3 py-2 text-sm" aria-live="polite">
              {receber ? "Entra na conta: " : "Sai da conta: "}
              <strong className="tabular-nums">{formatBRL(Math.max(liquido, 0))}</strong>
            </p>
            <Campo label="Observação" hint="(opcional)" htmlFor={`${uid}-obs`}>
              <Textarea id={`${uid}-obs`} name="observacao" rows={2} className="min-h-16" maxLength={500} />
            </Campo>
            <Erro>{state?.erro}</Erro>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Registrando…" : "Confirmar"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
