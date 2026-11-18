"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { HandCoins, Undo2, X } from "lucide-react";
import { Badge, Button, Campo, Card, CardHeader, Erro, Input, Select, type Tom } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatBRL, parseValor } from "@/lib/utils";
import { COM_TAXA, FORMAS_PAGAMENTO, taxaPadrao, valorTaxa, type FormaPagamento, type TaxasCartao } from "@/lib/recebimento-regras";
import { estornarPagamentoOS, registrarPagamentoOS } from "../recebimento";

export type ParcelaOS = {
  id: string;
  forma: string | null;
  formaLabel: string;
  parcela: number;
  parcelas: number;
  vencimento: string;
  valor: number;
  pago: number;
  status: { label: string; tom: Tom };
  aberta: boolean;
};

export type PagamentoOS = {
  id: string;
  data: string;
  formaLabel: string;
  conta: string;
  valor: number;
  taxa: number;
  estornado: boolean;
};

export type RegistroPagamento = {
  contas: { id: string; nome: string }[];
  sugestoes: Record<string, string>;
  taxas: TaxasCartao | null;
  formas: Record<string, string>;
  hoje: string;
};

const brl = (c: number) => formatBRL(c / 100);

/** Card "Recebimentos" da OS: parcelas, pagamentos, registrar pagamento e estorno */
export function RecebimentosOS({
  osId,
  total,
  recebido,
  aReceber,
  semLancamento,
  parcelas,
  pagamentos,
  registro,
  podeEstornar,
}: {
  osId: string;
  /** Valores em centavos */
  total: number;
  recebido: number;
  aReceber: number;
  semLancamento: number;
  parcelas: ParcelaOS[];
  pagamentos: PagamentoOS[];
  /** Nulo = sem botão "Registrar pagamento" */
  registro: RegistroPagamento | null;
  podeEstornar: boolean;
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  const saldo = aReceber + semLancamento;

  function estornar(p: PagamentoOS) {
    if (!confirm(`Estornar o pagamento de ${brl(p.valor)} (${p.formaLabel}) de ${p.data}? O valor volta a ficar em aberto.`)) return;
    setErro(undefined);
    start(async () => {
      const r = await estornarPagamentoOS(osId, p.id);
      if (r?.erro) setErro(r.erro);
    });
  }

  return (
    <Card>
      <CardHeader
        title="Recebimentos"
        action={registro && saldo > 0 && <RegistrarPagamento osId={osId} parcelas={parcelas.filter((p) => p.aberta)} semLancamento={semLancamento} registro={registro} />}
      />
      <dl className="grid grid-cols-3 gap-2 border-b border-border px-5 py-4 text-[13px]">
        <div>
          <dt className="text-muted">Total da OS</dt>
          <dd className="font-semibold tabular-nums">{brl(total)}</dd>
        </div>
        <div>
          <dt className="text-muted">Recebido</dt>
          <dd className="font-semibold tabular-nums text-ok">{brl(recebido)}</dd>
        </div>
        <div>
          <dt className="text-muted">Falta</dt>
          <dd className={cn("font-semibold tabular-nums", saldo > 0 && "text-warn")}>{brl(saldo)}</dd>
        </div>
      </dl>
      {semLancamento > 0 && parcelas.length > 0 && (
        <p className="border-b border-border px-5 py-2.5 text-[13px] text-foreground-2">{brl(semLancamento)} da OS ainda não foram lançados no financeiro.</p>
      )}

      {parcelas.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-muted">Nada lançado no financeiro para esta OS.</p>
      ) : (
        <ul className="divide-y divide-border">
          {parcelas.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="font-medium">
                  {p.formaLabel}
                  {p.parcelas > 1 && <span className="text-muted"> · {p.parcela}/{p.parcelas}</span>}
                </p>
                <p className="text-muted">
                  Vence {p.vencimento}
                  {p.pago > 0 && p.pago < p.valor && <> · pago {brl(p.pago)}</>}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-medium tabular-nums">{brl(p.valor)}</span>
                <Badge tom={p.status.tom}>{p.status.label}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pagamentos.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <h3 className="mb-2 text-[13px] font-medium text-foreground-2">Pagamentos</h3>
          <ul className="flex flex-col gap-2 text-[13px]">
            {pagamentos.map((p) => (
              <li key={p.id} className={cn("flex items-center justify-between gap-3", p.estornado && "text-muted")}>
                <div className="min-w-0">
                  <p className={cn(p.estornado && "line-through")}>
                    {p.data} · {p.formaLabel}
                  </p>
                  <p className="text-xs text-muted">
                    {p.conta}
                    {p.taxa > 0 && <> · taxa {brl(p.taxa)}</>}
                    {p.estornado && " · estornado"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={cn("tabular-nums", p.estornado && "line-through")}>{brl(p.valor)}</span>
                  {podeEstornar && !p.estornado && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2"
                      disabled={pending}
                      onClick={() => estornar(p)}
                      aria-label={`Estornar pagamento de ${brl(p.valor)} de ${p.data}`}
                      title="Estornar"
                    >
                      <Undo2 />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {erro && (
        <div className="px-5 pb-4">
          <Erro>{erro}</Erro>
        </div>
      )}
    </Card>
  );
}

function RegistrarPagamento({
  osId,
  parcelas,
  semLancamento,
  registro,
}: {
  osId: string;
  parcelas: ParcelaOS[];
  semLancamento: number;
  registro: RegistroPagamento;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { state, pending, onSubmit } = useFormAction(registrarPagamentoOS.bind(null, osId));

  const opcoes = [
    ...parcelas.map((p) => ({
      id: p.id,
      label: `${p.formaLabel}${p.parcelas > 1 ? ` ${p.parcela}/${p.parcelas}` : ""} · vence ${p.vencimento} · ${brl(p.valor - p.pago)} em aberto`,
      aberto: p.valor - p.pago,
      forma: p.forma,
      parcelas: p.parcelas,
    })),
    ...(semLancamento > 0
      ? [{ id: "novo", label: `Valor ainda não lançado · ${brl(semLancamento)}`, aberto: semLancamento, forma: null, parcelas: 1 }]
      : []),
  ];

  const inicial = (op: (typeof opcoes)[number] | undefined) => {
    const forma = (op?.forma && op.forma !== "a_prazo" && op.forma !== "boleto" ? op.forma : "pix") as FormaPagamento;
    return {
      alvo: op?.id ?? "",
      valor: op ? (op.aberto / 100).toFixed(2).replace(".", ",") : "",
      forma,
      contaId: registro.sugestoes[forma] ?? registro.contas[0]?.id ?? "",
      taxa: String(taxaPadrao(registro.taxas, forma, op?.parcelas ?? 1)).replace(".", ","),
      data: registro.hoje,
    };
  };
  const [v, setV] = useState(() => inicial(opcoes[0]));

  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  function abrir() {
    setV(inicial(opcoes[0]));
    dialog.current?.showModal();
  }

  const forma = v.forma as FormaPagamento;
  const taxaPct = parseValor(v.taxa);
  const valorC = Math.round((parseValor(v.valor) || 0) * 100);
  const taxa = COM_TAXA.includes(forma) && Number.isFinite(taxaPct) ? valorTaxa(valorC, taxaPct) : 0;

  return (
    <>
      <Button type="button" onClick={abrir} className="h-8">
        <HandCoins />
        Registrar pagamento
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="pagto-titulo"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-zinc-950/40"
      >
        <form onSubmit={onSubmit} className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="pagto-titulo" className="text-[17px] font-semibold">
              Registrar pagamento
            </h2>
            <Button type="button" variant="ghost" className="px-2" onClick={() => dialog.current?.close()} aria-label="Fechar">
              <X />
            </Button>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            <Campo label="O que está sendo pago" htmlFor="pg-alvo">
              <Select
                id="pg-alvo"
                name="lancamentoId"
                value={v.alvo}
                onChange={(e) => setV(inicial(opcoes.find((o) => o.id === e.target.value)))}
              >
                {opcoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Forma" htmlFor="pg-forma">
                <Select
                  id="pg-forma"
                  name="forma"
                  value={v.forma}
                  onChange={(e) => {
                    const fm = e.target.value as FormaPagamento;
                    setV((x) => ({ ...x, forma: fm, contaId: registro.sugestoes[fm] ?? x.contaId, taxa: String(taxaPadrao(registro.taxas, fm, 1)).replace(".", ",") }));
                  }}
                >
                  {FORMAS_PAGAMENTO.filter((fm) => fm !== "a_prazo").map((fm) => (
                    <option key={fm} value={fm}>
                      {registro.formas[fm] ?? fm}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Valor (R$)" htmlFor="pg-valor">
                <Input
                  id="pg-valor"
                  name="valor"
                  inputMode="decimal"
                  value={v.valor}
                  onChange={(e) => setV((x) => ({ ...x, valor: e.target.value }))}
                  className="text-right tabular-nums"
                />
              </Campo>
              <Campo label="Conta" htmlFor="pg-conta">
                <Select id="pg-conta" name="contaId" value={v.contaId} onChange={(e) => setV((x) => ({ ...x, contaId: e.target.value }))}>
                  {registro.contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Data" htmlFor="pg-data">
                <Input id="pg-data" name="data" type="date" max={registro.hoje} value={v.data} onChange={(e) => setV((x) => ({ ...x, data: e.target.value }))} />
              </Campo>
              {COM_TAXA.includes(forma) && (
                <Campo label="Taxa (%)" hint={taxa > 0 ? `= ${brl(taxa)}` : undefined} htmlFor="pg-taxa">
                  <Input id="pg-taxa" name="taxa" inputMode="decimal" value={v.taxa} onChange={(e) => setV((x) => ({ ...x, taxa: e.target.value }))} />
                </Campo>
              )}
            </div>
            <Erro>{state?.erro}</Erro>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Registrando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
