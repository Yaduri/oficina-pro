import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, FileDown, Undo2 } from "lucide-react";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { ehUuid } from "@/lib/os-acesso";
import { STATUS_COMPRA, dataBR, nomeFornecedor, obterCompra, opcoesPagamento } from "@/lib/compras";
import { TIPOS_MOVIMENTO, formatQtd, qtd } from "@/lib/estoque";
import { STATUS_LANCAMENTO, hojeSP } from "@/lib/financeiro";
import { cn, formatBRL, formatData, formatDocumento, formatTelefone } from "@/lib/utils";
import { BotaoAcao } from "../../../financeiro/_lancamentos/botao-acao";
import { cancelarCompra, estornarCompra } from "../actions";
import { ReceberCompra } from "./receber";

function Item({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-[12px] font-medium text-muted">{rotulo}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

const th = "border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium";

export async function generateMetadata({ params }: PageProps<"/estoque/compras/[id]">) {
  const { id } = await params;
  const { oficina } = await exigir("estoque");
  const d = ehUuid(id) ? await obterCompra(oficina.id, id) : null;
  return { title: d ? `Compra #${d.c.numero}` : "Compra" };
}

export default async function CompraPage({ params }: PageProps<"/estoque/compras/[id]">) {
  const { id } = await params;
  const { oficina, pode } = await exigir("estoque");
  if (!ehUuid(id)) notFound();
  const d = await obterCompra(oficina.id, id);
  if (!d) notFound();
  const { c, fornecedor, itens, contas, movimentos } = d;
  const hoje = hojeSP();
  const atrasada = c.status === "pedido" && !!c.previsaoEm && c.previsaoEm < hoje;
  const recebida = c.status === "recebida";
  const opcoes = c.status === "pedido" ? await opcoesPagamento(oficina.id) : null;
  const financeiro = pode("financeiro");

  return (
    <div className="flex flex-col gap-5">
      <Link href="/estoque/compras" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Compras e entradas
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2.5 text-[17px] font-semibold">
            Compra #{c.numero}
            <Badge tom={STATUS_COMPRA[c.status].tom}>{STATUS_COMPRA[c.status].label}</Badge>
            {atrasada && <Badge tom="danger">Atrasado</Badge>}
          </h2>
          <p className="text-[13px] text-muted">
            {c.recebidaEm ? `Recebida em ${formatData(c.recebidaEm)}` : `Criada em ${formatData(c.criadoEm)}`}
            {c.criadoPor && ` · por ${c.criadoPor}`}
            {c.canceladaEm && ` · cancelada em ${formatData(c.canceladaEm)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.xmlKey && (
            <a href={`/arquivos/${c.xmlKey}`} download={`nfe-${c.notaNumero ?? c.numero}.xml`} className={buttonClass("secondary")}>
              <FileDown />
              XML da nota
            </a>
          )}
          {c.status === "pedido" && (
            <BotaoAcao acao={cancelarCompra.bind(null, c.id)} variant="ghost" confirmar="Cancelar este pedido?">
              <Ban />
              Cancelar pedido
            </BotaoAcao>
          )}
          {recebida && (
            <BotaoAcao
              acao={estornarCompra.bind(null, c.id)}
              variant="ghost"
              confirmar="Estornar a entrada? As peças saem do estoque e as contas a pagar desta compra são canceladas."
            >
              <Undo2 />
              Estornar entrada
            </BotaoAcao>
          )}
          {c.status === "pedido" && opcoes && (
            <ReceberCompra
              key={itens.map((i) => `${i.i.id}${i.i.quantidade}${i.i.valorUnitario}`).join()}
              compraId={c.id}
              itens={itens.map(({ i, peca, unidade }) => ({
                id: i.id,
                descricao: peca ?? i.descricao,
                unidade,
                quantidade: qtd(i.quantidade),
                valorUnitario: Number(i.valorUnitario),
              }))}
              extras={{ frete: Number(c.frete), desconto: Number(c.desconto), outros: Number(c.outros) }}
              opcoes={opcoes}
            />
          )}
        </div>
      </div>

      <Card>
        <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <Item rotulo="Fornecedor">
            {fornecedor ? (
              <>
                <Link href={`/estoque/fornecedores/${fornecedor.id}`} className="font-medium underline">
                  {nomeFornecedor(fornecedor)}
                </Link>
                <span className="block text-[13px] text-muted">
                  {[formatDocumento(fornecedor.cpfCnpj), formatTelefone(fornecedor.telefone)].filter(Boolean).join(" · ")}
                </span>
              </>
            ) : (
              "—"
            )}
          </Item>
          {c.osId && (
            <Item rotulo="Ordem de serviço">
              <Link href={`/ordens-servico/${c.osId}`} className="font-medium underline">
                OS #{d.osNumero}
              </Link>
            </Item>
          )}
          {c.previsaoEm && (
            <Item rotulo="Previsão de chegada">
              <span className={cn(atrasada && "font-medium text-danger")}>{dataBR(c.previsaoEm)}</span>
            </Item>
          )}
          {(c.notaNumero || c.notaChave) && (
            <Item rotulo="Nota fiscal">
              {c.notaNumero ? `${c.notaNumero}${c.notaSerie ? ` série ${c.notaSerie}` : ""}` : "—"}
              {c.notaEmissao && <span className="text-muted"> · emitida {dataBR(c.notaEmissao)}</span>}
            </Item>
          )}
          {c.notaChave && (
            <Item rotulo="Chave de acesso" className="sm:col-span-2">
              <span className="font-mono text-[12px]">{c.notaChave.replace(/(\d{4})/g, "$1 ").trim()}</span>
            </Item>
          )}
          {c.observacao && (
            <Item rotulo="Observação" className="sm:col-span-2 lg:col-span-3">
              <span className="whitespace-pre-line">{c.observacao}</span>
            </Item>
          )}
        </dl>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Itens" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className={th}>Peça</th>
                <th className={cn(th, "text-right")}>Qtd.</th>
                <th className={cn(th, "text-right")}>Valor unit.</th>
                {recebida && <th className={cn(th, "text-right")}>Custo unit.</th>}
                <th className={cn(th, "text-right")}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(({ i, peca, pecaCodigo, unidade }) => (
                <tr key={i.id} className="[&:not(:last-child)>td]:border-b [&>td]:border-border">
                  <td className="px-4 py-3">
                    {i.catalogoItemId ? (
                      <Link href={`/estoque/${i.catalogoItemId}`} className="font-medium hover:underline">
                        {peca ?? i.descricao}
                      </Link>
                    ) : (
                      <span className="font-medium">{i.descricao}</span>
                    )}
                    <span className="block text-[12px] text-muted">
                      {[pecaCodigo, i.codigoFornecedor && i.codigoFornecedor !== pecaCodigo ? `fornecedor ${i.codigoFornecedor}` : null, !i.catalogoItemId ? "fora do estoque" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatQtd(i.quantidade, unidade)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatBRL(i.valorUnitario)}</td>
                  {recebida && <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground-2">{formatBRL(i.custoUnitario)}</td>}
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatBRL(qtd(i.quantidade) * Number(i.valorUnitario))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="flex flex-col gap-1 border-t border-border px-5 py-3 text-sm">
          {[
            ["Produtos", Number(c.valorProdutos)],
            ["Frete", Number(c.frete)],
            ["Outras despesas", Number(c.outros)],
            ["Desconto", -Number(c.desconto)],
          ]
            .filter(([, v], k) => k === 0 || v !== 0)
            .map(([rotulo, v]) => (
              <div key={rotulo} className="flex justify-between text-foreground-2">
                <dt>{rotulo}</dt>
                <dd className="tabular-nums">{formatBRL(v)}</dd>
              </div>
            ))}
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBRL(c.valorTotal)}</dd>
          </div>
        </dl>
      </Card>

      {contas.length > 0 && (
        <Card>
          <CardHeader title="Contas a pagar" />
          <ul className="divide-y divide-border">
            {contas.map((l) => {
              const vencida = (l.status === "aberto" || l.status === "parcial") && l.vencimento < hoje;
              const st = vencida ? { label: "Vencida", tom: "danger" as const } : STATUS_LANCAMENTO[l.status];
              const texto = (
                <>
                  <span className="font-medium">{l.parcelas > 1 ? `${l.parcela}/${l.parcelas}` : "Parcela única"}</span>{" "}
                  <span className="text-foreground-2">vence {dataBR(l.vencimento)}</span>
                </>
              );
              return (
                <li key={l.id} className="relative flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-subtle">
                  {financeiro ? (
                    <Link href={`/financeiro/pagar/${l.id}`} className="text-sm after:absolute after:inset-0">
                      {texto}
                    </Link>
                  ) : (
                    <span className="text-sm">{texto}</span>
                  )}
                  <span className="flex items-center gap-2">
                    <span className={cn("tabular-nums", l.status === "cancelado" && "text-muted line-through")}>{formatBRL(l.valor)}</span>
                    <Badge tom={st.tom}>{st.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {movimentos.length > 0 && (
        <Card>
          <CardHeader title="Movimentos de estoque" />
          <ul className="divide-y divide-border">
            {movimentos.map(({ m, peca, unidade }) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <Link href={`/estoque/${m.catalogoItemId}`} className="font-medium hover:underline">
                    {peca}
                  </Link>
                  <span className="block text-[12px] text-muted">
                    {TIPOS_MOVIMENTO[m.tipo]} · {formatData(m.criadoEm)}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  <span className={cn("font-medium", qtd(m.quantidade) < 0 ? "text-danger" : "text-ok")}>
                    {qtd(m.quantidade) > 0 ? "+" : ""}
                    {formatQtd(m.quantidade, unidade)}
                  </span>
                  <span className="block text-[12px] text-muted">
                    saldo {formatQtd(m.saldoApos, unidade)} · custo {formatBRL(m.custoUnitario)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
