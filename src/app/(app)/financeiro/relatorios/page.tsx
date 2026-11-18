import Link from "next/link";
import { Badge, Card, CardHeader, Vazio } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { diasNoPeriodo, dre, faturamento, fluxoDeCaixa, lerPeriodo, type Periodo } from "@/lib/financeiro-relatorios";
import { cn } from "@/lib/utils";
import { BotaoCsv, FiltroPeriodo, Indicador, Tabela, Td, Th, Valor, brl, paramsPeriodo, trClass, urlCom } from "./componentes";

export const metadata = { title: "Relatórios financeiros" };

const BASE = "/financeiro/relatorios";
const VISOES = { fluxo: "Fluxo de caixa", dre: "DRE", faturamento: "Faturamento" } as const;
type Visao = keyof typeof VISOES;

export default async function RelatoriosPage({ searchParams }: PageProps<"/financeiro/relatorios">) {
  const sp = await searchParams;
  const p = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const { oficina } = await exigir("financeiro");
  const periodo = lerPeriodo(p);
  const ver: Visao = Object.hasOwn(VISOES, p("ver")) ? (p("ver") as Visao) : "fluxo";
  const por = p("por") === "mes" || p("por") === "dia" ? p("por") : undefined;
  const manter = { ver: ver === "fluxo" ? undefined : ver, por: ver === "fluxo" ? por : undefined };

  return (
    <>
      <FiltroPeriodo base={BASE} periodo={periodo} manter={manter} />
      <nav aria-label="Relatórios" className="flex gap-1 rounded-lg bg-subtle p-1">
        {(Object.keys(VISOES) as Visao[]).map((v) => (
          <Link
            key={v}
            href={urlCom(BASE, { ...paramsPeriodo(periodo), ver: v === "fluxo" ? undefined : v })}
            aria-current={ver === v ? "page" : undefined}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-center text-[13px] font-medium whitespace-nowrap",
              ver === v ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground",
            )}
          >
            {VISOES[v]}
          </Link>
        ))}
      </nav>
      {ver === "fluxo" && <Fluxo oficinaId={oficina.id} periodo={periodo} por={por} />}
      {ver === "dre" && <Dre oficinaId={oficina.id} periodo={periodo} />}
      {ver === "faturamento" && <Faturamento oficinaId={oficina.id} periodo={periodo} />}
    </>
  );
}

const csv = (periodo: Periodo, tabela: string, extra: Record<string, string | undefined> = {}) =>
  urlCom(`${BASE}/csv`, { tabela, ...paramsPeriodo(periodo), ...extra });

/* ---------- Fluxo de caixa ---------- */

async function Fluxo({ oficinaId, periodo, por: porParam }: { oficinaId: string; periodo: Periodo; por?: string }) {
  const por = porParam === "mes" || (!porParam && diasNoPeriodo(periodo.de, periodo.ate) > 62) ? "mes" : "dia";
  const f = await fluxoDeCaixa(oficinaId, periodo.de, periodo.ate, por);
  const max = Math.max(1, ...f.linhas.flatMap((l) => [l.entradas + l.entradasPrev, l.saidas + l.saidasPrev]));
  const pct = (c: number) => `${(c / max) * 100}%`;
  const temMovimento = f.linhas.some((l) => l.entradas || l.saidas || l.entradasPrev || l.saidasPrev);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Entradas (realizado)" valor={brl(f.totais.entradas)} detalhe={`+ ${brl(f.totais.entradasPrev)} a receber`} />
        <Indicador rotulo="Saídas (realizado)" valor={brl(f.totais.saidas)} detalhe={`+ ${brl(f.totais.saidasPrev)} a pagar`} />
        <Indicador
          rotulo="Saldo das contas no fim"
          valor={brl(f.saldoFinal)}
          tom={f.saldoFinal < 0 ? "danger" : undefined}
          detalhe={`Início: ${brl(f.saldoInicial)}`}
        />
        <Indicador
          rotulo="Saldo projetado"
          valor={brl(f.saldoProjetado)}
          tom={f.saldoProjetado < 0 ? "danger" : undefined}
          detalhe="Se tudo em aberto for pago"
        />
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          title="Fluxo de caixa"
          action={
            <div className="flex items-center gap-1">
              <div className="flex rounded-md border border-border p-0.5 text-[13px]" role="group" aria-label="Agrupar">
                {(["dia", "mes"] as const).map((v) => (
                  <Link
                    key={v}
                    href={urlCom(BASE, { ...paramsPeriodo(periodo), por: v })}
                    aria-current={por === v ? "true" : undefined}
                    className={cn("rounded px-2 py-0.5", por === v ? "bg-foreground text-white" : "text-muted hover:text-foreground")}
                  >
                    {v === "dia" ? "Por dia" : "Por mês"}
                  </Link>
                ))}
              </div>
              <BotaoCsv href={csv(periodo, "fluxo", { por })} />
            </div>
          }
        />
        {!temMovimento ? (
          <Vazio titulo="Nenhum movimento no período">Pagamentos registrados e contas em aberto aparecem aqui.</Vazio>
        ) : (
          <>
            {/* Gráfico: barras de entradas e saídas (realizado forte, previsto claro); os números estão na tabela */}
            <div aria-hidden className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:px-5">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                <Legenda className="bg-ok">Entradas</Legenda>
                <Legenda className="bg-ok/30">A receber</Legenda>
                <Legenda className="bg-danger">Saídas</Legenda>
                <Legenda className="bg-danger/30">A pagar</Legenda>
              </div>
              <ul className="flex flex-col gap-1.5">
                {f.linhas.map((l) => (
                  <li key={l.chave} className="grid grid-cols-[4.75rem_1fr] items-center gap-2 text-[12px]">
                    <span className="tabular-nums text-muted">{l.rotulo}</span>
                    <span className="flex flex-col gap-0.5">
                      <span className="flex h-2.5">
                        <span className="rounded-l-sm bg-ok" style={{ width: pct(l.entradas) }} />
                        <span className="rounded-r-sm bg-ok/30" style={{ width: pct(l.entradasPrev) }} />
                      </span>
                      <span className="flex h-2.5">
                        <span className="rounded-l-sm bg-danger" style={{ width: pct(l.saidas) }} />
                        <span className="rounded-r-sm bg-danger/30" style={{ width: pct(l.saidasPrev) }} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Tabela legenda="Fluxo de caixa: realizado e previsto">
              <thead>
                <tr>
                  <Th>{por === "mes" ? "Mês" : "Dia"}</Th>
                  <Th num>Entradas</Th>
                  <Th num>Saídas</Th>
                  <Th num>Saldo acumulado</Th>
                  <Th num>A receber</Th>
                  <Th num>A pagar</Th>
                  <Th num>Saldo projetado</Th>
                </tr>
              </thead>
              <tbody>
                <tr className={cn(trClass, "text-muted")}>
                  <Td>Saldo inicial</Td>
                  <Td />
                  <Td />
                  <Td num>{brl(f.saldoInicial)}</Td>
                  <Td />
                  <Td />
                  <Td num>{brl(f.saldoInicial)}</Td>
                </tr>
                {f.linhas.map((l) => (
                  <tr key={l.chave} className={cn(trClass, "hover:bg-subtle")}>
                    <Td className="tabular-nums">{l.rotulo}</Td>
                    <Td num>
                      <Valor c={l.entradas} />
                    </Td>
                    <Td num>
                      <Valor c={l.saidas} />
                    </Td>
                    <Td num className={cn(l.saldo < 0 && "text-danger")}>
                      {brl(l.saldo)}
                    </Td>
                    <Td num className="text-muted">
                      <Valor c={l.entradasPrev} />
                    </Td>
                    <Td num className="text-muted">
                      <Valor c={l.saidasPrev} />
                    </Td>
                    <Td num className={cn(l.saldoProjetado < 0 && "text-danger")}>
                      {brl(l.saldoProjetado)}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-strong font-semibold">
                  <Td>Total</Td>
                  <Td num>{brl(f.totais.entradas)}</Td>
                  <Td num>{brl(f.totais.saidas)}</Td>
                  <Td num>{brl(f.saldoFinal)}</Td>
                  <Td num>{brl(f.totais.entradasPrev)}</Td>
                  <Td num>{brl(f.totais.saidasPrev)}</Td>
                  <Td num>{brl(f.saldoProjetado)}</Td>
                </tr>
              </tfoot>
            </Tabela>
          </>
        )}
      </Card>
      <p className="px-1 text-[13px] text-muted">
        Realizado: pagamentos registrados pela data em que foram feitos (recebimentos já sem a taxa do cartão; estornos não contam). Previsto: o que
        falta receber ou pagar das contas em aberto, pelo vencimento — inclusive as vencidas dentro do período. Transferências entre contas não
        aparecem. O saldo inicial é a soma das contas no dia anterior ao período.
      </p>
    </>
  );
}

function Legenda({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", className)} />
      {children}
    </span>
  );
}

/* ---------- DRE ---------- */

async function Dre({ oficinaId, periodo }: { oficinaId: string; periodo: Periodo }) {
  const d = await dre(oficinaId, periodo.de, periodo.ate);
  const margem = d.receitaLiquida ? Math.round((d.resultado / d.receitaLiquida) * 1000) / 10 : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Receita bruta" valor={brl(d.receitaBruta)} />
        <Indicador rotulo="Lucro bruto" valor={brl(d.lucroBruto)} detalhe="Receita líquida − custo das peças" />
        <Indicador rotulo="Despesas" valor={brl(d.despesas)} />
        <Indicador
          rotulo="Resultado"
          valor={brl(d.resultado)}
          tom={d.resultado < 0 ? "danger" : d.resultado > 0 ? "ok" : undefined}
          detalhe={margem != null ? `${margem.toLocaleString("pt-BR")}% da receita líquida` : undefined}
        />
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader title="DRE simplificada" action={<BotaoCsv href={csv(periodo, "dre")} />} />
        <Tabela legenda="Demonstração do resultado do período">
          <thead>
            <tr>
              <Th>Descrição</Th>
              <Th num>Valor</Th>
            </tr>
          </thead>
          <tbody>
            {d.linhas.map((l, i) => {
              if (l.nivel === "categoria" && l.valor === 0) return null;
              return (
                <tr
                  key={i}
                  className={cn(
                    trClass,
                    l.nivel === "total" && "bg-subtle/70 font-semibold",
                    l.nivel === "categoria" && "text-[13px] text-muted",
                  )}
                >
                  <Td className={cn("whitespace-normal", l.nivel === "grupo" && "pl-7", l.nivel === "categoria" && "pl-11")}>
                    {l.nivel === "total" && i > 0 && "= "}
                    {l.rotulo}
                  </Td>
                  <Td num className={cn(l.valor < 0 && l.nivel !== "categoria" && "text-danger")}>
                    {l.valor === 0 && l.nivel !== "total" ? <span className="text-muted">—</span> : brl(l.valor)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      </Card>
      <p className="px-1 text-[13px] text-muted">
        Regime de competência: entram todas as contas a receber e a pagar não canceladas com data de competência no período — pagas ou ainda em
        aberto — somadas pelo grupo da DRE da categoria (ajuste em Contas e categorias). As taxas de cartão descontadas nos recebimentos do período
        entram em despesas financeiras. Juros, multas e descontos dos pagamentos não entram.
      </p>
    </>
  );
}

/* ---------- Faturamento ---------- */

async function Faturamento({ oficinaId, periodo }: { oficinaId: string; periodo: Periodo }) {
  const f = await faturamento(oficinaId, periodo.de, periodo.ate);
  const maxMes = Math.max(1, ...f.porMes.map((m) => m.total));
  const itens = f.porItem.slice(0, 30);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="OS entregues" valor={f.qtd} />
        <Indicador rotulo="Faturamento" valor={brl(f.total)} detalhe={`Serviços ${brl(f.servicos)} · Peças ${brl(f.pecas)}`} />
        <Indicador rotulo="Ticket médio" valor={brl(f.ticket)} />
        <Indicador rotulo="Descontos dados" valor={brl(f.desconto)} />
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          title="Por mês"
          action={
            <div className="flex items-center gap-1">
              <BotaoCsv href={csv(periodo, "faturamento-os")}>Lista de OS</BotaoCsv>
              <BotaoCsv href={csv(periodo, "faturamento-mes")} />
            </div>
          }
        />
        <Tabela legenda="Faturamento por mês">
          <thead>
            <tr>
              <Th>Mês</Th>
              <Th num>OS</Th>
              <Th num>Serviços</Th>
              <Th num>Peças</Th>
              <Th num>Total</Th>
              <Th num>Ticket médio</Th>
              <Th className="w-1/4 min-w-24">
                <span className="sr-only">Gráfico</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {f.porMes.map((m) => (
              <tr key={m.mes} className={trClass}>
                <Td>{m.rotulo}</Td>
                <Td num>{m.qtd}</Td>
                <Td num>
                  <Valor c={m.servicos} />
                </Td>
                <Td num>
                  <Valor c={m.pecas} />
                </Td>
                <Td num className="font-medium">
                  <Valor c={m.total} />
                </Td>
                <Td num>
                  <Valor c={m.ticket} />
                </Td>
                <Td>
                  <span aria-hidden className="flex h-2.5 rounded-sm bg-subtle">
                    <span className="rounded-sm bg-foreground/70" style={{ width: `${(m.total / maxMes) * 100}%` }} />
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Por serviço e peça" action={<BotaoCsv href={csv(periodo, "faturamento-itens")} />} />
          {itens.length === 0 ? (
            <Vazio titulo="Nenhuma OS entregue no período" />
          ) : (
            <>
              <Tabela legenda="Faturamento por serviço e peça">
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th num>Qtd.</Th>
                    <Th num>OS</Th>
                    <Th num>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i, n) => (
                    <tr key={n} className={trClass}>
                      <Td className="max-w-72 whitespace-normal">
                        <span className="flex flex-wrap items-center gap-2">
                          {i.descricao}
                          <Badge tom={i.tipo === "servico" ? "info" : "neutro"}>{i.tipo === "servico" ? "Serviço" : "Peça"}</Badge>
                        </span>
                      </Td>
                      <Td num>{i.quantidade.toLocaleString("pt-BR")}</Td>
                      <Td num>{i.qtdOS}</Td>
                      <Td num>{brl(i.total)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
              {f.porItem.length > itens.length && (
                <p className="border-t border-border px-4 py-3 text-[13px] text-muted">
                  Mostrando os 30 de maior valor de {f.porItem.length}. O CSV traz todos.
                </p>
              )}
            </>
          )}
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Por técnico" action={<BotaoCsv href={csv(periodo, "faturamento-tecnicos")} />} />
          {f.porTecnico.length === 0 ? (
            <Vazio titulo="Nenhuma OS entregue no período" />
          ) : (
            <Tabela legenda="Faturamento por técnico responsável">
              <thead>
                <tr>
                  <Th>Técnico</Th>
                  <Th num>OS</Th>
                  <Th num>Total</Th>
                  <Th num>Ticket médio</Th>
                </tr>
              </thead>
              <tbody>
                {f.porTecnico.map((t) => (
                  <tr key={t.nome} className={trClass}>
                    <Td className={cn(t.nome === "Sem responsável" && "text-muted")}>{t.nome}</Td>
                    <Td num>{t.qtd}</Td>
                    <Td num>{brl(t.total)}</Td>
                    <Td num>{brl(t.ticket)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>
      </div>
      <p className="px-1 text-[13px] text-muted">
        OS entregues no período (pela data da entrega), sem os itens recusados e com o desconto da OS. Nos itens, o desconto é dividido na proporção
        do valor de cada um. O técnico é o responsável pela OS.
      </p>
    </>
  );
}
