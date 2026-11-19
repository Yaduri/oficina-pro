"use client";

import { useId, useRef, useState, useTransition } from "react";
import { PackageCheck, X } from "lucide-react";
import { Button, Campo, Erro, Input } from "@/components/ui";
import { formatBRL, parseValor } from "@/lib/utils";
import { receberPedido } from "../actions";
import { totalItensCentavos } from "../nova/form";
import {
  PagamentoCompra,
  conferirPagamento,
  dadosPagamento,
  pagamentoInicial,
  type EstadoPagamento,
  type OpcoesPagamento,
} from "../_ui/pagamento";

type Item = { id: string; descricao: string; unidade: string | null; quantidade: number; valorUnitario: number };

const txt = (n: number, casas = 2) => (Math.round(n * 10 ** casas) / 10 ** casas).toLocaleString("pt-BR", { maximumFractionDigits: casas, useGrouping: false });
const num = (s: string) => {
  const n = parseValor(s);
  return Number.isFinite(n) ? n : NaN;
};
const cent = (s: string) => {
  const n = num(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Botão "Receber" + janela para conferir quantidades, valores, nota e pagamento */
export function ReceberCompra({
  compraId,
  itens,
  extras: extrasIniciais,
  opcoes,
}: {
  compraId: string;
  itens: Item[];
  extras: { frete: number; desconto: number; outros: number };
  opcoes: OpcoesPagamento;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [linhas, setLinhas] = useState(() => itens.map((i) => ({ id: i.id, quantidade: txt(i.quantidade, 3), valor: txt(i.valorUnitario, 4) })));
  const [extras, setExtras] = useState(() => ({
    frete: extrasIniciais.frete ? txt(extrasIniciais.frete) : "",
    desconto: extrasIniciais.desconto ? txt(extrasIniciais.desconto) : "",
    outros: extrasIniciais.outros ? txt(extrasIniciais.outros) : "",
  }));
  const [nota, setNota] = useState({ data: opcoes.hoje, numero: "", serie: "", emissao: "" });
  const [pag, setPag] = useState<EstadoPagamento>(() => pagamentoInicial(opcoes.hoje, opcoes.contas));
  const [erro, setErro] = useState<string>();
  const [pending, start] = useTransition();

  const total = totalItensCentavos(linhas) + cent(extras.frete) + cent(extras.outros) - cent(extras.desconto);

  function enviar() {
    setErro(undefined);
    const itensEnvio: { id: string; quantidade: number; valorUnitario: number }[] = [];
    for (const l of linhas) {
      const q = num(l.quantidade || "0");
      const v = num(l.valor || "0");
      if (!(q >= 0) || !(v >= 0)) return setErro("Quantidade ou valor inválido");
      itensEnvio.push({ id: l.id, quantidade: q, valorUnitario: v });
    }
    if (!itensEnvio.some((i) => i.quantidade > 0)) return setErro("Nenhum item para receber");
    const ex = { frete: num(extras.frete || "0"), desconto: num(extras.desconto || "0"), outros: num(extras.outros || "0") };
    if (Object.values(ex).some((v) => !(v >= 0))) return setErro("Frete, desconto ou outros inválido");
    const e = conferirPagamento(pag, total);
    if (e) return setErro(e);
    start(async () => {
      const r = await receberPedido(compraId, {
        data: nota.data,
        notaNumero: nota.numero,
        notaSerie: nota.serie,
        notaEmissao: nota.emissao || null,
        ...ex,
        itens: itensEnvio,
        pagamento: dadosPagamento(pag, total),
      });
      if (r?.erro) setErro(r.erro);
      else ref.current?.close();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => (setErro(undefined), ref.current?.showModal())}>
        <PackageCheck />
        Receber
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={`${uid}-t`}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-zinc-950/40"
      >
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id={`${uid}-t`} className="text-[17px] font-semibold">
              Receber compra
            </h2>
            <Button type="button" variant="ghost" className="px-2" onClick={() => ref.current?.close()} aria-label="Fechar">
              <X />
            </Button>
          </div>
          <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
            <ul className="flex flex-col gap-3">
              {itens.map((it, k) => {
                const l = linhas[k];
                const set = (p: Partial<typeof l>) => setLinhas((ls) => ls.map((x, j) => (j === k ? { ...x, ...p } : x)));
                return (
                  <li key={it.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_8rem] sm:items-end">
                    <span className="col-span-2 text-sm font-medium sm:col-span-1 sm:pb-2.5">{it.descricao}</span>
                    <Campo label={`Qtd. recebida${it.unidade && it.unidade !== "UN" ? ` (${it.unidade})` : ""}`} htmlFor={`${uid}-q${k}`}>
                      <Input id={`${uid}-q${k}`} inputMode="decimal" className="h-10" value={l.quantidade} onChange={(e) => set({ quantidade: e.target.value })} />
                    </Campo>
                    <Campo label="Valor unit." htmlFor={`${uid}-v${k}`}>
                      <Input id={`${uid}-v${k}`} inputMode="decimal" className="h-10" value={l.valor} onChange={(e) => set({ valor: e.target.value })} />
                    </Campo>
                  </li>
                );
              })}
            </ul>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["frete", "Frete"],
                  ["outros", "Outras despesas"],
                  ["desconto", "Desconto"],
                ] as const
              ).map(([k, label]) => (
                <Campo key={k} label={label} htmlFor={`${uid}-${k}`}>
                  <Input
                    id={`${uid}-${k}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-10"
                    value={extras[k]}
                    onChange={(e) => setExtras((x) => ({ ...x, [k]: e.target.value }))}
                  />
                </Campo>
              ))}
            </div>
            <p className="rounded-md bg-subtle px-3 py-2 text-sm">
              Total <strong className="tabular-nums">{formatBRL(total / 100)}</strong>
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Campo label="Recebida em" htmlFor={`${uid}-data`}>
                <Input id={`${uid}-data`} type="date" max={opcoes.hoje} value={nota.data} onChange={(e) => setNota((n) => ({ ...n, data: e.target.value }))} className="h-10" />
              </Campo>
              <Campo label="Nota nº" hint="(opcional)" htmlFor={`${uid}-nf`}>
                <Input id={`${uid}-nf`} value={nota.numero} onChange={(e) => setNota((n) => ({ ...n, numero: e.target.value }))} className="h-10" />
              </Campo>
              <Campo label="Série" hint="(opcional)" htmlFor={`${uid}-serie`}>
                <Input id={`${uid}-serie`} value={nota.serie} onChange={(e) => setNota((n) => ({ ...n, serie: e.target.value }))} className="h-10" />
              </Campo>
              <Campo label="Emissão" hint="(opcional)" htmlFor={`${uid}-emissao`}>
                <Input id={`${uid}-emissao`} type="date" value={nota.emissao} onChange={(e) => setNota((n) => ({ ...n, emissao: e.target.value }))} className="h-10" />
              </Campo>
            </div>
            <PagamentoCompra estado={pag} onChange={setPag} totalCentavos={total} opcoes={opcoes} />
            <Erro>{erro}</Erro>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => ref.current?.close()}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" disabled={pending} onClick={enviar}>
              {pending ? "Recebendo…" : "Confirmar recebimento"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
