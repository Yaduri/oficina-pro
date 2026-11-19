"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Upload } from "lucide-react";
import { Badge, Button, Campo, Card, CardHeader, Erro, Input, Select } from "@/components/ui";
import { UNIDADES, qtdTexto } from "@/lib/estoque-formato";
import { cn, formatBRL, formatDocumento, parseValor } from "@/lib/utils";
import type { NfeItem } from "@/lib/nfe-xml";
import { confirmarImportacao, type ImportacaoDados } from "../actions";
import { SeletorPeca, type OpcaoPeca } from "../_ui/seletor-peca";
import {
  PagamentoCompra,
  conferirPagamento,
  dadosPagamento,
  pagamentoInicial,
  type EstadoPagamento,
  type OpcoesPagamento,
} from "../_ui/pagamento";
import type { LeituraNfe } from "./tipos";

type Leitura = Exclude<LeituraNfe, { erro: string }>;
type Unidade = (typeof UNIDADES)[number];
type Decisao = {
  acao: "vincular" | "criar" | "ignorar";
  catalogoItemId: string | null;
  fator: string;
  descricao: string;
  codigo: string;
  unidade: Unidade;
  marca: string;
  valor: string;
  /** Preço de venda ainda é a sugestão (acompanha o fator) */
  valorAuto: boolean;
};

const MAX = 1024 * 1024;
const num = (s: string) => {
  const n = parseValor(s);
  return Number.isFinite(n) ? n : NaN;
};
const brl = (n: number) => n.toFixed(2).replace(".", ",");
const ROTULO_ORIGEM = { codigo_fornecedor: "Código do fornecedor", gtin: "Código de barras", codigo: "Mesmo código" } as const;

function unidadeDe(u: string): Unidade {
  const x = u.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if ((UNIDADES as readonly string[]).includes(x)) return x as Unidade;
  if (["LT", "LITRO", "LTS"].includes(x)) return "L";
  if (["PC", "PCA", "PECA", "PECAS", "PCS"].includes(x)) return "PC";
  if (["JOGO", "JGO"].includes(x)) return "JG";
  if (["CAIXA", "CXA"].includes(x)) return "CX";
  return "UN";
}

/** Custo por unidade do catálogo: custo do item na nota ÷ (quantidade × fator) */
const custoUnit = (it: NfeItem, fator: number) => (it.quantidade > 0 && fator > 0 ? it.custoTotal / (it.quantidade * fator) : 0);

/** Preço sugerido: custo × 1,6, arredondado (centavos de 10 em 10 abaixo de R$ 10; reais inteiros acima) */
function sugestaoPreco(custo: number) {
  const v = custo * 1.6;
  if (v <= 0) return "";
  return brl(v < 10 ? Math.ceil(v * 10) / 10 : Math.round(v));
}

function decisaoInicial(it: NfeItem, sug: Leitura["sugestoes"][number]): Decisao {
  return {
    acao: sug ? "vincular" : "criar",
    catalogoItemId: sug?.catalogoItemId ?? null,
    fator: String(sug?.fator ?? 1).replace(".", ","),
    descricao: it.descricao,
    codigo: it.codigo,
    unidade: unidadeDe(it.unidade),
    marca: "",
    valor: sugestaoPreco(custoUnit(it, 1)),
    valorAuto: true,
  };
}

/** Envio do XML, revisão do fornecedor e dos itens, e confirmação da entrada */
export function ImportarNota({ pecas, opcoes }: { pecas: OpcaoPeca[]; opcoes: OpcoesPagamento }) {
  const uid = useId();
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [erroEnvio, setErroEnvio] = useState<{ erro: string; compraId?: string } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [decisoes, setDecisoes] = useState<Decisao[]>([]);
  const [data, setData] = useState(opcoes.hoje);
  const [pag, setPag] = useState<EstadoPagamento>(() => pagamentoInicial(opcoes.hoje, opcoes.contas));
  const [erro, setErro] = useState<string>();
  const [pending, start] = useTransition();

  async function enviar(arquivo: File | undefined) {
    setErroEnvio(null);
    if (!arquivo) return;
    if (arquivo.size > MAX) return setErroEnvio({ erro: "Arquivo maior que 1 MB" });
    setLendo(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const res = await fetch("/estoque/compras/importar/ler", { method: "POST", body: fd });
      const r = (await res.json()) as LeituraNfe;
      if ("erro" in r) return setErroEnvio(r);
      setLeitura(r);
      setDecisoes(r.nfe.itens.map((it, k) => decisaoInicial(it, r.sugestoes[k])));
      setPag(pagamentoInicial(opcoes.hoje, opcoes.contas, r.nfe.duplicatas));
      setErro(undefined);
    } catch {
      setErroEnvio({ erro: "Não foi possível ler o arquivo. Tente de novo." });
    } finally {
      setLendo(false);
    }
  }

  if (!leitura) {
    return (
      <Card className="p-5">
        <label
          htmlFor={`${uid}-arq`}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-10 text-center hover:bg-subtle",
            lendo && "pointer-events-none opacity-60",
          )}
        >
          {lendo ? <Loader2 className="size-5 animate-spin text-muted" aria-hidden /> : <Upload className="size-5 text-muted" aria-hidden />}
          <span className="font-medium">{lendo ? "Lendo a nota…" : "Escolher o arquivo XML da NF-e"}</span>
          <input
            id={`${uid}-arq`}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="sr-only"
            disabled={lendo}
            onChange={(e) => {
              enviar(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {erroEnvio && (
          <div className="mt-4">
            <Erro>
              {erroEnvio.erro}
              {erroEnvio.compraId && (
                <>
                  {" "}
                  <Link href={`/estoque/compras/${erroEnvio.compraId}`} className="font-medium underline">
                    Ver compra
                  </Link>
                </>
              )}
            </Erro>
          </div>
        )}
      </Card>
    );
  }

  const { nfe } = leitura;
  const total = nfe.itens.reduce((s, it) => s + Math.round(it.custoTotal * 100), 0);
  const difereNota = Math.abs(total - Math.round(nfe.totais.total * 100)) > 1;
  const setDec = (k: number, p: Partial<Decisao>) => setDecisoes((ds) => ds.map((d, j) => (j === k ? { ...d, ...p } : d)));

  function confirmar() {
    if (!leitura) return;
    setErro(undefined);
    const itens: ImportacaoDados["itens"] = [];
    for (const [k, d] of decisoes.entries()) {
      const it = nfe.itens[k];
      if (d.acao === "ignorar") {
        itens.push({ acao: "ignorar" as const });
        continue;
      }
      const fator = num(d.fator);
      if (!(fator > 0)) return setErro(`Fator de conversão inválido no item ${it.n}`);
      if (d.acao === "vincular") {
        if (!d.catalogoItemId) return setErro(`Escolha a peça do item ${it.n} (${it.descricao})`);
        itens.push({ acao: "vincular" as const, catalogoItemId: d.catalogoItemId, fator });
      } else {
        const valor = num(d.valor);
        if (!(valor > 0)) return setErro(`Informe o preço de venda da peça nova do item ${it.n}`);
        if (d.descricao.trim().length < 2) return setErro(`Informe a descrição da peça nova do item ${it.n}`);
        itens.push({ acao: "criar" as const, descricao: d.descricao, codigo: d.codigo, unidade: d.unidade, marca: d.marca, valor, fator });
      }
    }
    if (itens.every((i) => i.acao === "ignorar")) return setErro("Nenhum item vai para o estoque");
    const e = conferirPagamento(pag, total);
    if (e) return setErro(e);
    start(async () => {
      const r = await confirmarImportacao({ xmlKey: leitura.xmlKey, data, itens, pagamento: dadosPagamento(pag, total) });
      if (r?.erro) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[12px] font-medium text-muted">Fornecedor</dt>
            <dd className="text-sm">
              <span className="font-medium">{leitura.fornecedor?.nome ?? nfe.emitente.fantasia ?? nfe.emitente.nome}</span>
              <span className="block text-[13px] text-muted">{formatDocumento(nfe.emitente.cnpj ?? nfe.emitente.cpf)}</span>
              {!leitura.fornecedor && (
                <Badge tom="info" className="mt-1">
                  Será cadastrado
                </Badge>
              )}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[12px] font-medium text-muted">Nota</dt>
            <dd className="text-sm">
              {nfe.numero ?? "—"}
              {nfe.serie && ` série ${nfe.serie}`}
              {nfe.emissao && <span className="block text-[13px] text-muted">Emitida em {nfe.emissao.split("-").reverse().join("/")}</span>}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[12px] font-medium text-muted">Total da nota</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatBRL(nfe.totais.total)}</dd>
          </div>
        </dl>
        {leitura.avisoDestinatario && (
          <p role="alert" className="mx-5 mb-4 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
            {leitura.avisoDestinatario}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title={`Itens (${nfe.itens.length})`} />
        <ul className="divide-y divide-border">
          {nfe.itens.map((it, k) => {
            const d = decisoes[k];
            const fator = num(d.fator);
            const sug = leitura.sugestoes[k];
            const peca = pecas.find((p) => p.id === d.catalogoItemId);
            const unidade = d.acao === "criar" ? d.unidade : (peca?.unidade ?? "UN");
            const custo = custoUnit(it, fator);
            return (
              <li key={k} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{it.descricao}</p>
                    <p className="text-[12px] text-muted">
                      {[it.codigo && `Cód. ${it.codigo}`, it.gtin && `GTIN ${it.gtin}`, it.ncm && `NCM ${it.ncm}`].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-[13px] text-foreground-2">
                      {qtdTexto(it.quantidade, it.unidade)} × {formatBRL(it.valorUnitario)} = {formatBRL(it.valorProdutos)}
                      {Math.abs(it.custoTotal - it.valorProdutos) >= 0.01 && <> · com frete e impostos {formatBRL(it.custoTotal)}</>}
                    </p>
                  </div>
                  <div role="radiogroup" aria-label={`O que fazer com o item ${it.n}`} className="flex rounded-md border border-border p-0.5 text-[13px]">
                    {(
                      [
                        ["vincular", "Peça existente"],
                        ["criar", "Peça nova"],
                        ["ignorar", "Ignorar"],
                      ] as const
                    ).map(([v, label]) => (
                      <label
                        key={v}
                        className={cn(
                          "cursor-pointer rounded px-2.5 py-1 font-medium",
                          d.acao === v ? "bg-foreground text-white" : "text-foreground-2 hover:bg-subtle",
                        )}
                      >
                        <input type="radio" className="sr-only" name={`${uid}-acao-${k}`} checked={d.acao === v} onChange={() => setDec(k, { acao: v })} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {d.acao === "vincular" && (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-foreground-2">
                        Peça do catálogo
                        {sug && sug.catalogoItemId === d.catalogoItemId && <span className="font-normal text-muted"> ({ROTULO_ORIGEM[sug.origem]})</span>}
                      </span>
                      <SeletorPeca pecas={pecas} valor={d.catalogoItemId} onEscolher={(p) => setDec(k, { catalogoItemId: p.id })} rotulo={`Peça do item ${it.n}`} />
                    </div>
                    <Campo label="Fator" hint={`(1 ${it.unidade} =)`} htmlFor={`${uid}-f${k}`}>
                      <Input id={`${uid}-f${k}`} inputMode="decimal" className="h-10" value={d.fator} onChange={(e) => setDec(k, { fator: e.target.value })} />
                    </Campo>
                  </div>
                )}

                {d.acao === "criar" && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                    <Campo label="Descrição" htmlFor={`${uid}-d${k}`} className="col-span-2 sm:col-span-6">
                      <Input id={`${uid}-d${k}`} className="h-10" value={d.descricao} onChange={(e) => setDec(k, { descricao: e.target.value })} />
                    </Campo>
                    <Campo label="Código" htmlFor={`${uid}-c${k}`} className="sm:col-span-2">
                      <Input id={`${uid}-c${k}`} className="h-10" value={d.codigo} onChange={(e) => setDec(k, { codigo: e.target.value })} />
                    </Campo>
                    <Campo label="Marca" hint="(opcional)" htmlFor={`${uid}-m${k}`} className="sm:col-span-2">
                      <Input id={`${uid}-m${k}`} className="h-10" value={d.marca} onChange={(e) => setDec(k, { marca: e.target.value })} />
                    </Campo>
                    <Campo label="Unidade" htmlFor={`${uid}-u${k}`} className="sm:col-span-2">
                      <Select id={`${uid}-u${k}`} className="h-10" value={d.unidade} onChange={(e) => setDec(k, { unidade: e.target.value as Unidade })}>
                        {UNIDADES.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </Select>
                    </Campo>
                    <Campo label="Fator" hint={`(1 ${it.unidade} =)`} htmlFor={`${uid}-f${k}`} className="sm:col-span-2">
                      <Input
                        id={`${uid}-f${k}`}
                        inputMode="decimal"
                        className="h-10"
                        value={d.fator}
                        onChange={(e) => {
                          const f = num(e.target.value);
                          setDec(k, { fator: e.target.value, ...(d.valorAuto && f > 0 ? { valor: sugestaoPreco(custoUnit(it, f)) } : {}) });
                        }}
                      />
                    </Campo>
                    <Campo label="Preço de venda" htmlFor={`${uid}-p${k}`} className="sm:col-span-2">
                      <Input
                        id={`${uid}-p${k}`}
                        inputMode="decimal"
                        className="h-10"
                        value={d.valor}
                        onChange={(e) => setDec(k, { valor: e.target.value, valorAuto: false })}
                      />
                    </Campo>
                  </div>
                )}

                {d.acao !== "ignorar" && fator > 0 && (
                  <p className="text-[13px] text-muted">
                    Entra no estoque: {qtdTexto(it.quantidade * fator, unidade)} a {formatBRL(custo)} cada
                  </p>
                )}
                {d.acao === "ignorar" && <p className="text-[13px] text-muted">Não entra no estoque; o valor conta no total a pagar.</p>}
              </li>
            );
          })}
        </ul>
        <p className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-sm sm:px-5">
          <span className="text-muted">
            Produtos {formatBRL(nfe.totais.produtos)}
            {nfe.totais.frete > 0 && ` · frete ${formatBRL(nfe.totais.frete)}`}
            {nfe.totais.desconto > 0 && ` · desconto ${formatBRL(nfe.totais.desconto)}`}
            {nfe.totais.ipi + nfe.totais.st > 0 && ` · IPI e ST ${formatBRL(nfe.totais.ipi + nfe.totais.st)}`}
          </span>
          <span>
            Total <strong className="tabular-nums">{formatBRL(total / 100)}</strong>
          </span>
        </p>
        {difereNota && (
          <p className="border-t border-border px-4 py-2 text-[13px] text-warn sm:px-5">
            A soma dos itens difere do total da nota ({formatBRL(nfe.totais.total)}).
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Recebimento e pagamento" />
        <div className="flex flex-col gap-5 p-5">
          <Campo label="Recebida em" htmlFor={`${uid}-data`} className="max-w-48">
            <Input id={`${uid}-data`} type="date" max={opcoes.hoje} value={data} onChange={(e) => setData(e.target.value)} className="h-10" />
          </Campo>
          <PagamentoCompra estado={pag} onChange={setPag} totalCentavos={total} opcoes={opcoes} />
        </div>
      </Card>

      <Erro>{erro}</Erro>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setLeitura(null)}>
          Outro arquivo
        </Button>
        <Button type="button" variant="primary" disabled={pending} onClick={confirmar}>
          {pending ? "Lançando…" : "Dar entrada no estoque"}
        </Button>
      </div>
    </div>
  );
}
