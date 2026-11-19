import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Ban, FileText, RotateCcw, Undo2 } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Badge, Card, CardHeader } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { ehUuid } from "@/lib/os-acesso";
import { centavos, FORMAS, movimentoDaBaixa, STATUS_LANCAMENTO, type TipoLancamento } from "@/lib/financeiro";
import { detalheLancamento, opcoesFormulario } from "@/lib/financeiro-lancamentos";
import { cn, formatBRL, formatData } from "@/lib/utils";
import { BotaoAcao } from "./botao-acao";
import { Baixar } from "./baixar";
import { FormLancamento } from "./form-lancamento";
import { cancelarLancamento, estornarPagamento, reabrirLancamento } from "./actions";
import { dataBR, statusVisivel } from "./lista";
import { CobrancaOnline } from "./cobranca";
import { dadosCobranca } from "./cobranca-dados";

const nomeForma = (f: string | null) => (f && Object.hasOwn(FORMAS, f) ? FORMAS[f as keyof typeof FORMAS] : null);

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[12px] font-medium text-muted">{rotulo}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

/** Compra de peças que gerou a conta a pagar */
async function numeroDaCompra(oficinaId: string, compraId: string) {
  const db = await getDb();
  const [c] = await db
    .select({ id: schema.compras.id, numero: schema.compras.numero })
    .from(schema.compras)
    .where(and(eq(schema.compras.id, compraId), eq(schema.compras.oficinaId, oficinaId)));
  return c ?? null;
}

/** Detalhe de um lançamento: dados, ações, parcelas do grupo e pagamentos (com estorno) */
export async function DetalheLancamento({ tipo, id }: { tipo: TipoLancamento; id: string }) {
  const { oficina } = await exigir("financeiro");
  if (!ehUuid(id)) notFound();
  const d = await detalheLancamento(oficina.id, id);
  if (!d) notFound();
  // Link com o tipo trocado (ex.: /pagar?lancamento= de uma conta a receber): vai para a tela certa
  if (d.l.tipo !== tipo) redirect(`/financeiro/${d.l.tipo}/${id}`);
  const { l, recorrencia } = d;
  const compra = l.compraId ? await numeroDaCompra(oficina.id, l.compraId) : null;
  const [opcoes, cobranca] = await Promise.all([
    opcoesFormulario(oficina.id, tipo, l.clienteId),
    tipo === "receber" ? dadosCobranca(oficina.id, id) : Promise.resolve(null),
  ]);
  const { hoje } = opcoes;

  const receber = tipo === "receber";
  const base = `/financeiro/${tipo}`;
  const valor = centavos(l.valor);
  const pago = centavos(l.valorPago);
  const aberto = Math.max(valor - pago, 0);
  const st = statusVisivel(l.status, l.vencimento, hoje);
  const emAberto = l.status === "aberto" || l.status === "parcial";
  const baixasAtivas = d.baixas.filter((b) => !b.b.estornadaEm);

  return (
    <div className="flex flex-col gap-5">
      <Link href={base} className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-foreground-2 hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {receber ? "Contas a receber" : "Contas a pagar"}
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold">{l.descricao}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tom={st.tom}>{st.label}</Badge>
              {st.label === "Vencida" && <Badge tom={STATUS_LANCAMENTO[l.status].tom}>{STATUS_LANCAMENTO[l.status].label}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {emAberto && (
              <Baixar
                key={l.valorPago}
                id={l.id}
                tipo={tipo}
                hoje={hoje}
                emAberto={aberto / 100}
                contaId={l.contaId}
                forma={l.forma}
                contas={opcoes.contas}
                formas={opcoes.formas}
              />
            )}
            {emAberto && (
              <FormLancamento
                key={`${l.valor}-${l.vencimento}-${l.anexoKey}`}
                tipo={tipo}
                opcoes={opcoes}
                editar={{
                  id: l.id,
                  valores: {
                    descricao: l.descricao,
                    valor: Number(l.valor).toFixed(2).replace(".", ","),
                    categoriaId: l.categoriaId,
                    clienteId: l.clienteId,
                    fornecedor: l.fornecedor,
                    contaId: l.contaId,
                    forma: l.forma,
                    vencimento: l.vencimento,
                    competencia: l.competencia,
                    centroCusto: l.centroCusto,
                    observacao: l.observacao,
                    anexoKey: l.anexoKey,
                    valorPago: pago / 100,
                  },
                }}
              />
            )}
            {l.status === "aberto" && baixasAtivas.length === 0 && (
              <BotaoAcao acao={cancelarLancamento.bind(null, l.id)} variant="ghost" confirmar="Cancelar este lançamento? Ele deixa de contar nos totais.">
                <Ban />
                Cancelar
              </BotaoAcao>
            )}
            {l.status === "cancelado" && (
              <BotaoAcao acao={reabrirLancamento.bind(null, l.id)}>
                <RotateCcw />
                Reabrir
              </BotaoAcao>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {[
            { rotulo: "Valor", v: valor, cls: "" },
            { rotulo: receber ? "Recebido" : "Pago", v: pago, cls: pago > 0 ? "text-ok" : "" },
            { rotulo: "Em aberto", v: l.status === "cancelado" ? 0 : aberto, cls: st.label === "Vencida" ? "text-danger" : "" },
          ].map((x) => (
            <div key={x.rotulo} className="flex flex-col gap-0.5 px-4 py-3 sm:px-5">
              <span className="text-[12px] font-medium text-muted">{x.rotulo}</span>
              <span className={cn("text-base font-semibold tabular-nums sm:text-lg", x.cls)}>{formatBRL(x.v / 100)}</span>
            </div>
          ))}
        </div>

        <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <Item rotulo="Vencimento">
            <span className={cn(st.label === "Vencida" && "font-medium text-danger")}>{dataBR(l.vencimento)}</span>
          </Item>
          <Item rotulo="Competência">{dataBR(l.competencia)}</Item>
          <Item rotulo="Categoria">{d.categoria ?? "—"}</Item>
          {receber ? (
            <Item rotulo="Cliente">
              {l.clienteId && d.cliente ? (
                <Link href={`/clientes/${l.clienteId}`} className="font-medium underline">
                  {d.cliente}
                </Link>
              ) : (
                "—"
              )}
            </Item>
          ) : (
            <Item rotulo="Fornecedor">{l.fornecedor ?? "—"}</Item>
          )}
          <Item rotulo={receber ? "Conta para receber" : "Conta para pagar"}>{d.conta ?? "—"}</Item>
          <Item rotulo="Forma">{nomeForma(l.forma) ?? "—"}</Item>
          <Item rotulo="Centro de custo">{l.centroCusto ?? "—"}</Item>
          {l.osId && (
            <Item rotulo="Ordem de serviço">
              <Link href={`/ordens-servico/${l.osId}`} className="font-medium underline">
                OS #{d.osNumero}
              </Link>
            </Item>
          )}
          {compra && (
            <Item rotulo="Compra">
              <Link href={`/estoque/compras/${compra.id}`} className="font-medium underline">
                Compra #{compra.numero}
              </Link>
            </Item>
          )}
          {l.parcelas > 1 && (
            <Item rotulo="Parcela">
              {l.parcela} de {l.parcelas}
            </Item>
          )}
          {recorrencia && (
            <Item rotulo="Repete">
              Todo mês, dia {recorrencia.dia}
              {!recorrencia.ativo && " (pausada ou encerrada)"}
            </Item>
          )}
          {l.anexoKey && (
            <Item rotulo="Anexo">
              <a href={`/arquivos/${l.anexoKey}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">
                <FileText className="size-4" aria-hidden />
                Abrir boleto/nota
              </a>
            </Item>
          )}
          {l.observacao && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Item rotulo="Observação">
                <span className="whitespace-pre-line">{l.observacao}</span>
              </Item>
            </div>
          )}
        </dl>
      </Card>

      {cobranca && (cobranca.emAberto || cobranca.pendente || cobranca.historico.length > 0) && (
        <Card>
          <CardHeader title="Cobrança online" />
          <div className="px-5 py-4">
            <CobrancaOnline key={`${l.status}-${l.valorPago}-${l.valor}`} lancamentoId={l.id} inicial={cobranca} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={receber ? "Recebimentos" : "Pagamentos"} />
        {d.baixas.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted">Nenhum {receber ? "recebimento" : "pagamento"} registrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {d.baixas.map(({ b, conta }) => {
              const mov = Math.abs(movimentoDaBaixa(tipo, b));
              const extras = [
                centavos(b.juros) > 0 && `juros ${formatBRL(b.juros)}`,
                centavos(b.multa) > 0 && `multa ${formatBRL(b.multa)}`,
                centavos(b.desconto) > 0 && `desconto ${formatBRL(b.desconto)}`,
                centavos(b.taxa) > 0 && `taxa ${formatBRL(b.taxa)}`,
              ].filter(Boolean);
              return (
                <li key={b.id} className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-3", b.estornadaEm && "text-muted")}>
                  <div className="min-w-0">
                    <p className={cn("font-medium tabular-nums", b.estornadaEm && "line-through")}>
                      {formatBRL(mov / 100)} <span className="font-normal text-foreground-2">em {dataBR(b.data)}</span>
                    </p>
                    <p className="text-[13px] text-muted">
                      {[conta, nomeForma(b.forma), `abateu ${formatBRL(b.valor)}`, ...extras].filter(Boolean).join(" · ")}
                    </p>
                    {b.observacao && <p className="text-[13px] text-muted">{b.observacao}</p>}
                  </div>
                  {b.estornadaEm ? (
                    <Badge>Estornado em {formatData(b.estornadaEm)}</Badge>
                  ) : (
                    <BotaoAcao
                      acao={estornarPagamento.bind(null, b.id)}
                      variant="ghost"
                      rotulo={`Estornar ${receber ? "recebimento" : "pagamento"} de ${dataBR(b.data)}`}
                      confirmar={`Estornar este ${receber ? "recebimento" : "pagamento"}? O valor volta a ficar em aberto e sai do saldo da conta.`}
                    >
                      <Undo2 />
                      Estornar
                    </BotaoAcao>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {d.grupo.length > 1 && (
        <Card>
          <CardHeader title="Parcelas" />
          <ul className="divide-y divide-border">
            {d.grupo.map((g) => {
              const gs = statusVisivel(g.status, g.vencimento, hoje);
              const atual = g.id === l.id;
              return (
                <li key={g.id} className={cn("relative flex items-center justify-between gap-3 px-5 py-2.5", atual ? "bg-subtle" : "hover:bg-subtle")}>
                  <Link href={`${base}/${g.id}`} aria-current={atual ? "page" : undefined} className="text-sm after:absolute after:inset-0">
                    <span className="font-medium">
                      {g.parcela}/{g.parcelas}
                    </span>{" "}
                    <span className="text-foreground-2">vence {dataBR(g.vencimento)}</span>
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatBRL(g.valor)}</span>
                    <Badge tom={gs.tom}>{gs.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
