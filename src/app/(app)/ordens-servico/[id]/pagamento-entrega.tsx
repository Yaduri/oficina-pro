"use client";

import { useImperativeHandle, useState, type Ref } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Campo, Input, Select } from "@/components/ui";
import { cn, formatBRL, parseValor } from "@/lib/utils";
import {
  COM_TAXA,
  COM_VENCIMENTO,
  FORMAS_PAGAMENTO,
  PARCELAVEL,
  taxaPadrao,
  valorTaxa,
  type FormaPagamento,
  type LinhaPagamentoForm,
  type TaxasCartao,
} from "@/lib/recebimento-regras";

export type DadosPagamento = {
  /** Valor ainda não lançado da OS, em centavos */
  aReceber: number;
  contas: { id: string; nome: string }[];
  /** Conta sugerida para cada forma */
  sugestoes: Record<string, string>;
  taxas: TaxasCartao | null;
  formas: Record<string, string>;
  hoje: string;
  /** Hoje + 30 dias */
  vencimentoPadrao: string;
};

export type PagamentoHandle = { erro: () => string | undefined };

type Linha = LinhaPagamentoForm & { key: number };

const paraInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const emCentavos = (v: string) => {
  const n = parseValor(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const brl = (c: number) => formatBRL(c / 100);

/** Seção "Pagamento" da entrega: uma ou mais formas, parcelas, conta e taxa da maquininha */
export function PagamentoEntrega({ dados, ref }: { dados: DadosPagamento; ref?: Ref<PagamentoHandle> }) {
  const [modo, setModo] = useState<"agora" | "depois">("agora");
  const [seq, setSeq] = useState(1);
  const nova = (forma: FormaPagamento, valor: number, key: number): Linha => ({
    key,
    forma,
    valor: paraInput(valor),
    parcelas: 1,
    contaId: dados.sugestoes[forma] ?? dados.contas[0]?.id ?? "",
    vencimento: dados.vencimentoPadrao,
    taxa: String(taxaPadrao(dados.taxas, forma, 1)).replace(".", ","),
  });
  const [linhas, setLinhas] = useState<Linha[]>(() => [nova("pix", dados.aReceber, 0)]);

  const soma = linhas.reduce((s, l) => s + emCentavos(l.valor), 0);
  const falta = dados.aReceber - soma;

  useImperativeHandle(ref, () => ({
    erro: () => {
      if (modo === "depois") return undefined;
      if (linhas.some((l) => emCentavos(l.valor) <= 0)) return "Informe o valor de cada pagamento";
      if (falta !== 0)
        return falta > 0
          ? `Faltam ${brl(falta)} para fechar o total. Para deixar para depois, use “A prazo (fiado)”.`
          : `Os pagamentos passam do total em ${brl(-falta)}.`;
      return undefined;
    },
  }));

  function alterar(key: number, mudanca: Partial<LinhaPagamentoForm>) {
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const n = { ...l, ...mudanca };
        const forma = n.forma as FormaPagamento;
        if (mudanca.forma) {
          n.parcelas = 1;
          n.contaId = dados.sugestoes[forma] ?? n.contaId;
        }
        if (!PARCELAVEL.includes(forma)) n.parcelas = 1;
        // Taxa sugerida muda com a forma e com crédito à vista x parcelado
        if (mudanca.forma || mudanca.parcelas) n.taxa = String(taxaPadrao(dados.taxas, forma, n.parcelas)).replace(".", ",");
        return n;
      }),
    );
  }

  function adicionar() {
    setLinhas((ls) => [...ls, nova("dinheiro", Math.max(falta, 0), seq)]);
    setSeq((s) => s + 1);
  }

  const payload = JSON.stringify(linhas.map((l) => ({ forma: l.forma, valor: l.valor, parcelas: l.parcelas, contaId: l.contaId, vencimento: l.vencimento, taxa: l.taxa })));

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:p-4">
      <legend className="px-1 text-[13px] font-medium text-foreground-2">Pagamento</legend>
      <input type="hidden" name="pagamentoModo" value={modo} />
      <input type="hidden" name="pagamentos" value={modo === "agora" ? payload : "[]"} />
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-muted">A receber</span>
        <span className="text-lg font-semibold tabular-nums">{brl(dados.aReceber)}</span>
      </p>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quando o cliente paga">
        {(
          [
            ["agora", "Receber agora"],
            ["depois", "Receber depois"],
          ] as const
        ).map(([v, label]) => (
          <label
            key={v}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium",
              modo === v ? "border-primary bg-primary/10 text-foreground" : "border-border text-foreground-2",
            )}
          >
            <input type="radio" name="modoPagamentoUi" value={v} checked={modo === v} onChange={() => setModo(v)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>

      {modo === "depois" ? (
        <p className="text-[13px] text-foreground-2">
          O valor todo fica em contas a receber (a prazo), vencendo em 30 dias. Você registra o pagamento depois, na própria OS.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {linhas.map((l, i) => {
              const forma = l.forma as FormaPagamento;
              const id = `pg-${l.key}`;
              const taxaPct = parseValor(l.taxa);
              const taxa = COM_TAXA.includes(forma) && Number.isFinite(taxaPct) ? valorTaxa(emCentavos(l.valor), taxaPct) : 0;
              return (
                <li key={l.key} className={cn("flex flex-col gap-3", i > 0 && "border-t border-border pt-3")}>
                  <div className="grid grid-cols-[1fr_8.5rem_auto] items-end gap-2">
                    <Campo label={linhas.length > 1 ? `Forma ${i + 1}` : "Forma"} htmlFor={`${id}-forma`}>
                      <Select id={`${id}-forma`} value={l.forma} onChange={(e) => alterar(l.key, { forma: e.target.value })}>
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f} value={f}>
                            {dados.formas[f] ?? f}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    <Campo label="Valor (R$)" htmlFor={`${id}-valor`}>
                      <Input
                        id={`${id}-valor`}
                        inputMode="decimal"
                        value={l.valor}
                        onChange={(e) => alterar(l.key, { valor: e.target.value })}
                        className="text-right tabular-nums"
                      />
                    </Campo>
                    {linhas.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 px-2"
                        aria-label={`Remover forma ${i + 1}`}
                        onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 />
                      </Button>
                    ) : (
                      <span />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {PARCELAVEL.includes(forma) && (
                      <Campo label="Parcelas" htmlFor={`${id}-parcelas`}>
                        <Select id={`${id}-parcelas`} value={l.parcelas} onChange={(e) => alterar(l.key, { parcelas: Number(e.target.value) })}>
                          {Array.from({ length: 12 }, (_, n) => n + 1).map((n) => (
                            <option key={n} value={n}>
                              {n === 1 ? "1x" : `${n}x de ${brl(Math.floor(emCentavos(l.valor) / n))}`}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                    )}
                    {COM_VENCIMENTO.includes(forma) && (
                      <Campo label={l.parcelas > 1 ? "1º vencimento" : "Vencimento"} htmlFor={`${id}-venc`}>
                        <Input
                          id={`${id}-venc`}
                          type="date"
                          min={dados.hoje}
                          value={l.vencimento}
                          onChange={(e) => alterar(l.key, { vencimento: e.target.value })}
                        />
                      </Campo>
                    )}
                    <Campo label="Conta" htmlFor={`${id}-conta`}>
                      <Select id={`${id}-conta`} value={l.contaId} onChange={(e) => alterar(l.key, { contaId: e.target.value })}>
                        {dados.contas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    {COM_TAXA.includes(forma) && (
                      <Campo label="Taxa (%)" hint={taxa > 0 ? `= ${brl(taxa)}` : undefined} htmlFor={`${id}-taxa`}>
                        <Input
                          id={`${id}-taxa`}
                          inputMode="decimal"
                          value={l.taxa}
                          onChange={(e) => alterar(l.key, { taxa: e.target.value })}
                          className="tabular-nums"
                        />
                      </Campo>
                    )}
                  </div>
                  {forma === "credito" && (
                    <p className="text-xs text-muted">
                      Fica a receber da maquininha: {l.parcelas > 1 ? `${l.parcelas} parcelas, a cada 30 dias` : "em 30 dias"}. A taxa é descontada quando o
                      valor cair na conta.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" className="-ml-2" onClick={adicionar} disabled={linhas.length >= 8}>
              <Plus />
              Dividir pagamento
            </Button>
            <p className={cn("text-[13px] tabular-nums", falta === 0 ? "text-ok" : "text-danger")} aria-live="polite">
              {falta === 0 ? "Total fechado" : falta > 0 ? `Faltam ${brl(falta)}` : `Passou ${brl(-falta)}`}
            </p>
          </div>
        </>
      )}
    </fieldset>
  );
}
