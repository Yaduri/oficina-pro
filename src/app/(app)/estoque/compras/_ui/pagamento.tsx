"use client";

import { useId } from "react";
import { Button, Campo, Input, Select } from "@/components/ui";
import { cn, formatBRL, parseValor } from "@/lib/utils";

export type OpcaoConta = { id: string; nome: string; tipo: "caixa" | "banco" | "maquininha" };
export type OpcoesPagamento = { contas: OpcaoConta[]; formas: { valor: string; label: string }[]; hoje: string };

type Linha = { valor: string; vencimento: string };
export type EstadoPagamento = {
  modo: "prazo" | "paga";
  n: number;
  primeiro: string;
  /** Parcelas editadas à mão (ou vindas da nota); null = divide o total igualmente */
  linhas: Linha[] | null;
  forma: string;
  contaId: string;
};

const txt = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");
const cent = (s: string) => {
  const n = parseValor(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function sugerirConta(contas: OpcaoConta[], forma: string) {
  const por = (t: OpcaoConta["tipo"]) => contas.find((c) => c.tipo === t);
  if (forma === "dinheiro") return por("caixa") ?? contas[0];
  return por("banco") ?? contas[0];
}

/** Parcelas iguais (diferença de centavos na primeira), a cada 30 dias */
function dividir(total: number, n: number, primeiro: string): Linha[] {
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => ({ valor: txt(base + (i === 0 ? resto : 0)), vencimento: somarDias(primeiro, 30 * i) }));
}

export function pagamentoInicial(hoje: string, contas: OpcaoConta[], duplicatas?: { valor: number; vencimento: string }[]): EstadoPagamento {
  const linhas = duplicatas && duplicatas.length > 0 ? duplicatas.map((d) => ({ valor: d.valor.toFixed(2).replace(".", ","), vencimento: d.vencimento })) : null;
  return {
    modo: "prazo",
    n: linhas?.length ?? 1,
    primeiro: linhas?.[0]?.vencimento ?? somarDias(hoje, 30),
    linhas,
    forma: "boleto",
    contaId: sugerirConta(contas, "boleto")?.id ?? "",
  };
}

export function linhasPagamento(e: EstadoPagamento, totalCentavos: number) {
  return e.linhas ?? dividir(totalCentavos, Math.max(e.n, 1), e.primeiro);
}

/** Dados para a ação do servidor (valores em reais) */
export function dadosPagamento(e: EstadoPagamento, totalCentavos: number) {
  if (e.modo === "paga") return { modo: "paga" as const, contaId: e.contaId, forma: e.forma || null };
  return {
    modo: "prazo" as const,
    forma: e.forma || null,
    contaId: null,
    parcelas: linhasPagamento(e, totalCentavos).map((l) => ({ valor: cent(l.valor) / 100, vencimento: l.vencimento })),
  };
}

/** Erro de conferência antes de enviar (null = ok) */
export function conferirPagamento(e: EstadoPagamento, totalCentavos: number) {
  if (totalCentavos <= 0) return null;
  if (e.modo === "paga") return e.contaId ? null : "Escolha a conta de onde saiu o dinheiro";
  const linhas = linhasPagamento(e, totalCentavos);
  if (linhas.some((l) => !(cent(l.valor) > 0) || !l.vencimento)) return "Preencha valor e vencimento de cada parcela";
  const soma = linhas.reduce((s, l) => s + cent(l.valor), 0);
  if (soma !== totalCentavos) return `A soma das parcelas (${formatBRL(soma / 100)}) difere do total (${formatBRL(totalCentavos / 100)})`;
  return null;
}

/** Como a compra será paga: contas a pagar em parcelas ou já paga */
export function PagamentoCompra({
  estado,
  onChange,
  totalCentavos,
  opcoes,
}: {
  estado: EstadoPagamento;
  onChange: (e: EstadoPagamento) => void;
  totalCentavos: number;
  opcoes: OpcoesPagamento;
}) {
  const uid = useId();
  const set = (p: Partial<EstadoPagamento>) => onChange({ ...estado, ...p });
  const linhas = linhasPagamento(estado, totalCentavos);
  const soma = linhas.reduce((s, l) => s + (cent(l.valor) || 0), 0);
  const formas = opcoes.formas.filter((f) => f.valor !== "a_prazo");

  if (totalCentavos <= 0) return <p className="text-[13px] text-muted">Sem valor a pagar.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Pagamento" className="grid grid-cols-2 gap-2">
        {(
          [
            ["prazo", "Gerar contas a pagar"],
            ["paga", "Já paga"],
          ] as const
        ).map(([v, label]) => (
          <label
            key={v}
            className={cn(
              "flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium",
              estado.modo === v ? "border-foreground bg-subtle" : "border-border text-foreground-2 hover:bg-subtle",
            )}
          >
            <input type="radio" className="sr-only" name={`${uid}-modo`} checked={estado.modo === v} onChange={() => set({ modo: v })} />
            {label}
          </label>
        ))}
      </div>

      {estado.modo === "prazo" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo label="Parcelas" htmlFor={`${uid}-n`}>
              <Select id={`${uid}-n`} value={estado.n} onChange={(e) => set({ n: Number(e.target.value), linhas: null })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="1º vencimento" htmlFor={`${uid}-venc`}>
              <Input
                id={`${uid}-venc`}
                type="date"
                value={estado.primeiro}
                onChange={(e) => e.target.value && set({ primeiro: e.target.value, linhas: null })}
              />
            </Campo>
            <Campo label="Forma" htmlFor={`${uid}-forma`} className="col-span-2 sm:col-span-1">
              <Select id={`${uid}-forma`} value={estado.forma} onChange={(e) => set({ forma: e.target.value })}>
                <option value="">Não informada</option>
                {formas.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <ul className="flex flex-col gap-2">
            {linhas.map((l, i) => (
              <li key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                <span className="text-[13px] text-muted">{i + 1}/{linhas.length}</span>
                <Input
                  aria-label={`Valor da parcela ${i + 1}`}
                  inputMode="decimal"
                  className="h-10"
                  value={l.valor}
                  onChange={(e) => set({ linhas: linhas.map((x, k) => (k === i ? { ...x, valor: e.target.value } : x)), n: linhas.length })}
                />
                <Input
                  aria-label={`Vencimento da parcela ${i + 1}`}
                  type="date"
                  className="h-10"
                  value={l.vencimento}
                  onChange={(e) => set({ linhas: linhas.map((x, k) => (k === i ? { ...x, vencimento: e.target.value } : x)), n: linhas.length })}
                />
              </li>
            ))}
          </ul>
          {soma !== totalCentavos && (
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
              Soma das parcelas {formatBRL(soma / 100)}, total {formatBRL(totalCentavos / 100)}.
              <Button type="button" variant="ghost" className="h-7 px-2 text-[13px]" onClick={() => set({ linhas: null })}>
                Dividir o total
              </Button>
            </p>
          )}
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Conta de onde saiu" htmlFor={`${uid}-conta`}>
            <Select id={`${uid}-conta`} value={estado.contaId} onChange={(e) => set({ contaId: e.target.value })}>
              <option value="" disabled>
                Escolha…
              </option>
              {opcoes.contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Forma" htmlFor={`${uid}-forma2`}>
            <Select
              id={`${uid}-forma2`}
              value={estado.forma}
              onChange={(e) => {
                const s = sugerirConta(opcoes.contas, e.target.value);
                set({ forma: e.target.value, contaId: s?.id ?? estado.contaId });
              }}
            >
              <option value="">Não informada</option>
              {formas.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
      )}
    </div>
  );
}
