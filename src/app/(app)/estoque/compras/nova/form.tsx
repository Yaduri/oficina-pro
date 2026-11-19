"use client";

import { useId, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Campo, Card, CardHeader, Erro, Input, Select, Textarea } from "@/components/ui";
import { formatBRL, parseValor } from "@/lib/utils";
import { salvarCompra } from "../actions";
import { SeletorPeca, type OpcaoPeca } from "../_ui/seletor-peca";
import { NovaPecaRapida, NovoFornecedorRapido } from "../_ui/cadastros-rapidos";
import {
  PagamentoCompra,
  conferirPagamento,
  dadosPagamento,
  pagamentoInicial,
  type EstadoPagamento,
  type OpcoesPagamento,
} from "../_ui/pagamento";

export type ItemInicial = { catalogoItemId: string; quantidade: number; valorUnitario: number };
type Linha = { key: number; catalogoItemId: string | null; quantidade: string; valor: string };

const txtNum = (n: number, casas = 2) => (Math.round(n * 10 ** casas) / 10 ** casas).toLocaleString("pt-BR", { maximumFractionDigits: casas, useGrouping: false });
const num = (s: string) => {
  const n = parseValor(s);
  return Number.isFinite(n) ? n : NaN;
};
const cent = (s: string) => {
  const n = num(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
let seq = 0;

/** Itens da compra, com quantidade e valor unitário: usado também no recebimento */
export function totalItensCentavos(linhas: { quantidade: string; valor: string }[]) {
  return linhas.reduce((s, l) => {
    const q = num(l.quantidade);
    const v = num(l.valor);
    return s + (Number.isFinite(q) && Number.isFinite(v) ? Math.round(q * v * 100) : 0);
  }, 0);
}

export function NovaCompraForm({
  tipo,
  fornecedores: fornecedoresIniciais,
  pecas: pecasIniciais,
  oss,
  pagamento: opcoesPag,
  inicial,
}: {
  tipo: "pedido" | "entrada";
  fornecedores: { id: string; nome: string }[];
  pecas: OpcaoPeca[];
  oss: { id: string; rotulo: string }[];
  pagamento: OpcoesPagamento;
  inicial: { itens: ItemInicial[]; osId: string | null; fornecedorId: string | null };
}) {
  const uid = useId();
  const entrada = tipo === "entrada";
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [pecas, setPecas] = useState(pecasIniciais);
  const [fornecedorId, setFornecedorId] = useState(inicial.fornecedorId ?? "");
  const [osId, setOsId] = useState(inicial.osId ?? "");
  const [previsao, setPrevisao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial.itens.length > 0
      ? inicial.itens.map((i) => ({ key: ++seq, catalogoItemId: i.catalogoItemId, quantidade: txtNum(i.quantidade, 3), valor: i.valorUnitario ? txtNum(i.valorUnitario) : "" }))
      : [{ key: ++seq, catalogoItemId: null, quantidade: "1", valor: "" }],
  );
  const [extras, setExtras] = useState({ frete: "", desconto: "", outros: "" });
  const [nota, setNota] = useState({ data: opcoesPag.hoje, numero: "", serie: "", emissao: "" });
  const [pag, setPag] = useState<EstadoPagamento>(() => pagamentoInicial(opcoesPag.hoje, opcoesPag.contas));
  const [erro, setErro] = useState<string>();
  const [pending, start] = useTransition();

  const produtos = totalItensCentavos(linhas);
  const total = produtos + cent(extras.frete) + cent(extras.outros) - cent(extras.desconto);
  const setLinha = (key: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const escolherPeca = (key: number, p: OpcaoPeca) => {
    setLinhas((ls) =>
      ls.map((l) => (l.key === key ? { ...l, catalogoItemId: p.id, valor: l.valor || (p.custoMedio > 0 ? txtNum(p.custoMedio) : "") } : l)),
    );
  };

  function enviar() {
    setErro(undefined);
    if (!fornecedorId) return setErro("Escolha o fornecedor");
    const itens: { catalogoItemId: string; quantidade: number; valorUnitario: number }[] = [];
    for (const l of linhas) {
      if (!l.catalogoItemId) return setErro("Escolha a peça de cada item (ou remova a linha)");
      const q = num(l.quantidade);
      const v = l.valor.trim() ? num(l.valor) : 0;
      if (!(q > 0)) return setErro("Quantidade inválida");
      if (!(v >= 0)) return setErro("Valor unitário inválido");
      itens.push({ catalogoItemId: l.catalogoItemId, quantidade: q, valorUnitario: v });
    }
    if (itens.length === 0) return setErro("Inclua ao menos uma peça");
    const extrasNum = { frete: num(extras.frete || "0"), desconto: num(extras.desconto || "0"), outros: num(extras.outros || "0") };
    if (Object.values(extrasNum).some((v) => !(v >= 0))) return setErro("Frete, desconto ou outros inválido");
    if (total < 0) return setErro("O desconto passa do valor da compra");
    if (entrada) {
      const e = conferirPagamento(pag, total);
      if (e) return setErro(e);
    }
    start(async () => {
      const r = await salvarCompra({
        tipo,
        fornecedorId,
        osId: osId || null,
        previsao: entrada ? null : previsao || null,
        observacao,
        itens,
        ...extrasNum,
        recebimento: entrada
          ? {
              data: nota.data,
              notaNumero: nota.numero,
              notaSerie: nota.serie,
              notaEmissao: nota.emissao || null,
              pagamento: dadosPagamento(pag, total),
            }
          : null,
      });
      if (r?.erro) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Campo label="Fornecedor" htmlFor={`${uid}-forn`}>
            <div className="flex gap-1.5">
              <Select id={`${uid}-forn`} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="h-10 min-w-0 flex-1">
                <option value="">Escolha…</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>
              <NovoFornecedorRapido
                onCriado={(f) => {
                  setFornecedores((l) => [...l, f].sort((a, b) => a.nome.localeCompare(b.nome)));
                  setFornecedorId(f.id);
                }}
              />
            </div>
          </Campo>
          <Campo label="Ordem de serviço" hint="(opcional)" htmlFor={`${uid}-os`}>
            <Select id={`${uid}-os`} value={osId} onChange={(e) => setOsId(e.target.value)} className="h-10">
              <option value="">Para o estoque</option>
              {oss.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </Select>
          </Campo>
          {!entrada && (
            <Campo label="Previsão de chegada" hint="(opcional)" htmlFor={`${uid}-prev`}>
              <Input id={`${uid}-prev`} type="date" min={opcoesPag.hoje} value={previsao} onChange={(e) => setPrevisao(e.target.value)} className="h-10" />
            </Campo>
          )}
        </div>
        {!entrada && osId && <p className="-mt-2 px-5 pb-4 text-[13px] text-muted">A OS passa para Aguardando peça.</p>}
      </Card>

      <Card>
        <CardHeader title="Itens" />
        <ul className="divide-y divide-border">
          {linhas.map((l, i) => {
            const peca = pecas.find((p) => p.id === l.catalogoItemId);
            const sub = Math.round((num(l.quantidade) || 0) * (num(l.valor) || 0) * 100);
            return (
              <li key={l.key} className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_8rem_7rem_2.5rem] sm:items-center sm:px-5">
                <SeletorPeca
                  pecas={pecas}
                  valor={l.catalogoItemId}
                  onEscolher={(p) => escolherPeca(l.key, p)}
                  rotulo={`Peça do item ${i + 1}`}
                  className="col-span-2 sm:col-span-1"
                />
                <label className="flex flex-col gap-1 sm:block">
                  <span className="text-[12px] text-muted sm:sr-only">Quantidade{peca && peca.unidade !== "UN" ? ` (${peca.unidade})` : ""}</span>
                  <Input
                    aria-label={`Quantidade do item ${i + 1}`}
                    inputMode="decimal"
                    className="h-10"
                    value={l.quantidade}
                    onChange={(e) => setLinha(l.key, { quantidade: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 sm:block">
                  <span className="text-[12px] text-muted sm:sr-only">Valor unitário</span>
                  <Input
                    aria-label={`Valor unitário do item ${i + 1}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-10"
                    value={l.valor}
                    onChange={(e) => setLinha(l.key, { valor: e.target.value })}
                  />
                </label>
                <span className="self-center text-right text-sm tabular-nums text-foreground-2">{formatBRL(sub / 100)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-self-end px-2"
                  aria-label={`Remover item ${i + 1}`}
                  disabled={linhas.length === 1}
                  onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-5">
          <Button type="button" variant="ghost" onClick={() => setLinhas((ls) => [...ls, { key: ++seq, catalogoItemId: null, quantidade: "1", valor: "" }])}>
            <Plus />
            Adicionar item
          </Button>
          <NovaPecaRapida
            onCriada={(p) => {
              setPecas((ps) => [...ps, p].sort((a, b) => a.descricao.localeCompare(b.descricao)));
              setLinhas((ls) => {
                const vazia = ls.find((x) => !x.catalogoItemId);
                return vazia
                  ? ls.map((x) => (x.key === vazia.key ? { ...x, catalogoItemId: p.id } : x))
                  : [...ls, { key: ++seq, catalogoItemId: p.id, quantidade: "1", valor: "" }];
              });
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-border px-4 py-4 sm:px-5">
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
        <p className="flex justify-between border-t border-border px-4 py-3 text-sm sm:px-5">
          <span className="text-muted">Produtos {formatBRL(produtos / 100)}</span>
          <span>
            Total <strong className="tabular-nums">{formatBRL(total / 100)}</strong>
          </span>
        </p>
      </Card>

      {entrada && (
        <Card>
          <CardHeader title="Recebimento" />
          <div className="flex flex-col gap-5 p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Campo label="Recebida em" htmlFor={`${uid}-data`}>
                <Input id={`${uid}-data`} type="date" max={opcoesPag.hoje} value={nota.data} onChange={(e) => setNota((n) => ({ ...n, data: e.target.value }))} className="h-10" />
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
            <PagamentoCompra estado={pag} onChange={setPag} totalCentavos={total} opcoes={opcoesPag} />
          </div>
        </Card>
      )}

      <Campo label="Observação" hint="(opcional)" htmlFor={`${uid}-obs`}>
        <Textarea id={`${uid}-obs`} rows={2} className="min-h-16" maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Campo>

      <Erro>{erro}</Erro>
      <div className="flex justify-end">
        <Button variant="primary" disabled={pending} onClick={enviar}>
          {pending ? "Salvando…" : entrada ? "Dar entrada no estoque" : "Criar pedido"}
        </Button>
      </div>
    </div>
  );
}
