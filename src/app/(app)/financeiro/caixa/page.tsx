import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { Badge, Button, Card, CardHeader, Input, Vazio } from "@/components/ui";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/oficina";
import { hojeSP, listarCategorias, listarContas, saldosDasContas, TIPOS_CONTA } from "@/lib/financeiro";
import { dadosConciliacao, esperadoDoCaixa, extratoDaConta, historicoCaixa, inicioDoMes, sessaoAberta } from "@/lib/financeiro-caixa";
import { DIA_RE, horaSP } from "@/lib/agenda-datas";
import { cn, formatBRL } from "@/lib/utils";
import {
  AbrirCaixa,
  AcoesConciliacao,
  DesfazerConciliacao,
  FecharCaixa,
  ImportarOfx,
  RemoverTransferencia,
  Transferir,
} from "./componentes";

export const metadata = { title: "Caixa e bancos" };

const brl = (c: number) => formatBRL(c / 100);
const dia = (d: string) => d.split("-").reverse().join("/");
const quando = (d: Date) => `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${horaSP(d)}`;

type Ver = "extrato" | "caixa" | "conciliacao";

export default async function CaixaPage({ searchParams }: PageProps<"/financeiro/caixa">) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const { oficina } = await exigir("financeiro");
  const db = await getDb();

  const [todas, saldos, abertas] = await Promise.all([
    listarContas(oficina.id, false),
    saldosDasContas(oficina.id),
    db
      .select({ contaId: schema.caixaSessoes.contaId })
      .from(schema.caixaSessoes)
      .where(and(eq(schema.caixaSessoes.oficinaId, oficina.id), isNull(schema.caixaSessoes.fechadoEm))),
  ]);
  const ativas = todas.filter((c) => c.ativo);
  // Desativadas só aparecem se ainda têm saldo
  const visiveis = saldos.filter((c) => c.ativo || c.saldo !== 0);
  const conta = todas.find((c) => c.id === s("conta")) ?? ativas[0] ?? todas[0];
  if (!conta) return <Card><Vazio titulo="Nenhuma conta cadastrada" /></Card>;

  const opcoesVer: { v: Ver; label: string }[] = [{ v: "extrato", label: "Extrato" }];
  if (conta.tipo === "caixa") opcoesVer.push({ v: "caixa", label: "Caixa do dia" });
  if (conta.tipo === "banco") opcoesVer.push({ v: "conciliacao", label: "Conciliação" });
  const ver: Ver = opcoesVer.some((o) => o.v === s("ver")) ? (s("ver") as Ver) : "extrato";
  const url = (q: Record<string, string>) => `/financeiro/caixa?${new URLSearchParams({ conta: conta.id, ...q })}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          Saldo total{" "}
          <strong className="text-foreground tabular-nums">{brl(visiveis.reduce((t, c) => t + c.saldo, 0))}</strong>
        </p>
        {ativas.length > 1 && <Transferir contas={ativas.map((c) => ({ id: c.id, nome: c.nome }))} hoje={hojeSP()} />}
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visiveis.map((c) => {
          const sel = c.id === conta.id;
          return (
            <li key={c.id}>
              <Link
                href={`/financeiro/caixa?conta=${c.id}`}
                aria-current={sel ? "page" : undefined}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border bg-card px-4 py-3.5 shadow-card hover:bg-subtle",
                  sel ? "border-foreground ring-1 ring-foreground" : "border-border",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-[13px] text-muted">
                  <span className="truncate">{TIPOS_CONTA[c.tipo]}</span>
                  {!c.ativo && <Badge>Desativada</Badge>}
                  {c.tipo === "caixa" && c.ativo && abertas.some((a) => a.contaId === c.id) && <Badge tom="ok">Caixa aberto</Badge>}
                </span>
                <span className="font-medium">{c.nome}</span>
                <span className={cn("text-[22px] font-semibold tracking-tight tabular-nums", c.saldo < 0 && "text-danger")}>{brl(c.saldo)}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="conta-titulo" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="conta-titulo" className="text-[17px] font-semibold">
            {conta.nome}
          </h2>
          {opcoesVer.length > 1 && (
            <div className="flex gap-1 rounded-md bg-subtle p-1 text-[13px] font-medium">
              {opcoesVer.map((o) => (
                <Link
                  key={o.v}
                  href={url(o.v === "extrato" ? {} : { ver: o.v })}
                  aria-current={ver === o.v ? "page" : undefined}
                  className={cn(
                    "rounded px-3.5 py-1.5",
                    ver === o.v ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground",
                  )}
                >
                  {o.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {ver === "extrato" && <Extrato oficinaId={oficina.id} conta={conta} contas={todas} de={s("de")} ate={s("ate")} />}
        {ver === "caixa" && <CaixaDoDia oficinaId={oficina.id} conta={conta} saldo={saldos.find((c) => c.id === conta.id)?.saldo ?? 0} />}
        {ver === "conciliacao" && <Conciliacao oficinaId={oficina.id} conta={conta} contas={todas} todas={s("todas") === "1"} url={url} />}
      </section>
    </>
  );
}

/* ---------- Extrato ---------- */

type Conta = Awaited<ReturnType<typeof listarContas>>[number];

async function Extrato({ oficinaId, conta, contas, de: deQ, ate: ateQ }: { oficinaId: string; conta: Conta; contas: Conta[]; de: string; ate: string }) {
  const hoje = hojeSP();
  let de = DIA_RE.test(deQ) ? deQ : inicioDoMes(hoje);
  let ate = DIA_RE.test(ateQ) ? ateQ : hoje;
  if (de > ate) [de, ate] = [ate, de];
  const e = await extratoDaConta(oficinaId, conta, de, ate, contas);

  return (
    <Card className="overflow-hidden">
      <form className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3 sm:px-5" aria-label="Período do extrato">
        <input type="hidden" name="conta" value={conta.id} />
        <label className="flex flex-col gap-1 text-[13px] font-medium text-foreground-2">
          De
          <Input type="date" name="de" defaultValue={de} className="h-9 w-40" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-foreground-2">
          Até
          <Input type="date" name="ate" defaultValue={ate} className="h-9 w-40" />
        </label>
        <Button type="submit">Ver</Button>
      </form>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border px-4 py-3 text-[13px] sm:grid-cols-4 sm:px-5">
        <div>
          <dt className="text-muted">Saldo em {dia(e.inicio)}</dt>
          <dd className="font-semibold tabular-nums">{brl(e.saldoAnterior)}</dd>
        </div>
        <div>
          <dt className="text-muted">Entradas</dt>
          <dd className="font-semibold tabular-nums text-ok">{brl(e.entradas)}</dd>
        </div>
        <div>
          <dt className="text-muted">Saídas</dt>
          <dd className="font-semibold tabular-nums text-danger">{brl(-e.saidas)}</dd>
        </div>
        <div>
          <dt className="text-muted">Saldo em {dia(ate)}</dt>
          <dd className="font-semibold tabular-nums">{brl(e.saldoFinal)}</dd>
        </div>
      </dl>
      {de < conta.saldoInicialEm && (
        <p className="border-b border-border px-4 py-2 text-[13px] text-muted sm:px-5">
          O saldo desta conta é contado a partir de {dia(conta.saldoInicialEm)} (saldo inicial {formatBRL(conta.saldoInicial)}).
        </p>
      )}

      {e.linhas.length === 0 ? (
        <Vazio titulo="Nenhum movimento no período" />
      ) : (
        <ul className="divide-y divide-border">
          {e.linhas.map((m) => (
            <li key={`${m.origem}-${m.id}`} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", m.estornada && "text-muted")}>
              <span className="w-12 shrink-0 text-[13px] tabular-nums text-muted">{dia(m.data).slice(0, 5)}</span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-medium", m.estornada && "line-through")}>{m.descricao}</p>
                <p className="truncate text-[12px] text-muted">
                  {m.estornada ? "Estornado · " : ""}
                  {m.detalhe}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    m.estornada ? "line-through" : m.valor >= 0 ? "text-ok" : "text-danger",
                  )}
                >
                  {m.valor >= 0 ? "+" : "−"}
                  {brl(Math.abs(m.valor))}
                </span>
                <span className="text-[12px] tabular-nums text-muted" title="Saldo após o movimento">
                  {brl(m.saldo)}
                </span>
              </div>
              {m.origem === "transferencia" && <RemoverTransferencia id={m.id} descricao={m.descricao} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Caixa do dia ---------- */

async function CaixaDoDia({ oficinaId, conta, saldo }: { oficinaId: string; conta: Conta; saldo: number }) {
  const db = await getDb();
  const [aberta, historico] = await Promise.all([sessaoAberta(db, oficinaId, conta.id), historicoCaixa(oficinaId, conta.id)]);
  const calc = aberta ? await esperadoDoCaixa(db, oficinaId, aberta) : null;
  const fechadas = historico.filter((h) => h.fechadoEm);
  const ultimoContado = fechadas[0]?.valorContado;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title={aberta ? "Caixa aberto" : "Caixa fechado"} action={aberta ? <Badge tom="ok">Aberto</Badge> : null} />
        <div className="p-4 sm:p-5">
          {aberta && calc ? (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-muted">
                Aberto em {quando(aberta.abertoEm)}
                {historico[0]?.abertoPorNome ? ` por ${historico[0].abertoPorNome}` : ""}.
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
                <dt className="text-muted">Abertura</dt>
                <dd className="text-right tabular-nums">{brl(calc.abertura)}</dd>
                <dt className="text-muted">Entradas</dt>
                <dd className="text-right tabular-nums text-ok">+{brl(calc.entradas)}</dd>
                <dt className="text-muted">Saídas</dt>
                <dd className="text-right tabular-nums text-danger">−{brl(calc.saidas)}</dd>
                {(calc.transfEntrada > 0 || calc.transfSaida > 0) && (
                  <>
                    <dt className="text-muted">Transferências</dt>
                    <dd className="text-right tabular-nums">
                      {calc.transfEntrada - calc.transfSaida >= 0 ? "+" : "−"}
                      {brl(Math.abs(calc.transfEntrada - calc.transfSaida))}
                    </dd>
                  </>
                )}
                {calc.estornos !== 0 && (
                  <>
                    <dt className="text-muted">Estornos</dt>
                    <dd className="text-right tabular-nums">
                      {calc.estornos >= 0 ? "+" : "−"}
                      {brl(Math.abs(calc.estornos))}
                    </dd>
                  </>
                )}
                <dt className="border-t border-border pt-2 font-medium">Esperado na gaveta</dt>
                <dd className="border-t border-border pt-2 text-right font-semibold tabular-nums">{brl(calc.esperado)}</dd>
              </dl>
              <FecharCaixa sessaoId={aberta.id} esperado={calc.esperado} />
            </div>
          ) : (
            <AbrirCaixa
              contaId={conta.id}
              sugestao={ultimoContado != null ? Number(ultimoContado) : saldo / 100}
              saldoSistema={saldo}
              ultimoContado={ultimoContado != null ? Number(ultimoContado) : null}
            />
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Fechamentos anteriores" />
        {fechadas.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">Nenhum fechamento ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {fechadas.map((h) => {
              const dif = Math.round((Number(h.valorContado) - Number(h.valorEsperado)) * 100);
              return (
                <li key={h.id} className="flex flex-col gap-1 px-4 py-3 text-[13px] sm:px-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{quando(h.abertoEm)}</span>
                    <Badge tom={dif === 0 ? "ok" : dif > 0 ? "info" : "danger"}>
                      {dif === 0 ? "Conferido" : dif > 0 ? `Sobra ${brl(dif)}` : `Falta ${brl(-dif)}`}
                    </Badge>
                  </div>
                  <p className="text-muted">
                    Fechado {h.fechadoEm ? quando(h.fechadoEm) : ""}
                    {h.fechadoPorNome ? ` por ${h.fechadoPorNome}` : ""}
                  </p>
                  <p className="tabular-nums text-muted">
                    Abertura {formatBRL(h.valorAbertura)} · esperado {formatBRL(h.valorEsperado)} · contado {formatBRL(h.valorContado)}
                  </p>
                  {h.observacao && <p className="whitespace-pre-line text-foreground-2">{h.observacao}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------- Conciliação ---------- */

async function Conciliacao({
  oficinaId,
  conta,
  contas,
  todas,
  url,
}: {
  oficinaId: string;
  conta: Conta;
  contas: Conta[];
  todas: boolean;
  url: (q: Record<string, string>) => string;
}) {
  const [d, receitas, despesas] = await Promise.all([
    dadosConciliacao(oficinaId, conta, contas, todas),
    listarCategorias(oficinaId, "receita"),
    listarCategorias(oficinaId, "despesa"),
  ]);
  const cats = {
    receita: receitas.map((c) => ({ id: c.id, nome: c.nome })),
    despesa: despesas.map((c) => ({ id: c.id, nome: c.nome })),
  };
  const total = d.contagem.pendente + d.contagem.conciliado + d.contagem.ignorado;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-5">
        <ImportarOfx contaId={conta.id} />
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span>
              <strong>{d.contagem.pendente}</strong> pendente{d.contagem.pendente === 1 ? "" : "s"}
            </span>
            <span className="text-muted">{d.contagem.conciliado} conciliada{d.contagem.conciliado === 1 ? "" : "s"}</span>
            <span className="text-muted">{d.contagem.ignorado} ignorada{d.contagem.ignorado === 1 ? "" : "s"}</span>
            <Link href={url(todas ? { ver: "conciliacao" } : { ver: "conciliacao", todas: "1" })} className="ml-auto font-medium underline-offset-4 hover:underline">
              {todas ? "Só pendentes" : "Ver todas"}
            </Link>
          </div>
        )}
      </div>

      {d.linhas.length === 0 ? (
        <Vazio titulo={total === 0 ? "Nenhum extrato importado" : "Tudo conciliado"}>
          {total === 0
            ? "Baixe o extrato em OFX no site ou app do banco e importe aqui para conferir com os lançamentos do sistema."
            : "Todas as linhas do extrato estão conciliadas ou ignoradas."}
        </Vazio>
      ) : (
        <ul className="divide-y divide-border">
          {d.linhas.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
              <div className="flex items-start gap-3">
                <span className="w-12 shrink-0 pt-px text-[13px] tabular-nums text-muted">{dia(l.data).slice(0, 5)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{l.descricao ?? "Sem descrição"}</p>
                  {l.status === "conciliado" && <p className="text-[12px] text-ok">Conciliado com: {l.ligado}</p>}
                  {l.status === "ignorado" && <p className="text-[12px] text-muted">Ignorado</p>}
                </div>
                <span className={cn("shrink-0 font-semibold tabular-nums", l.valor >= 0 ? "text-ok" : "text-danger")}>
                  {l.valor >= 0 ? "+" : "−"}
                  {brl(Math.abs(l.valor))}
                </span>
              </div>
              {l.status === "pendente" ? (
                <AcoesConciliacao
                  item={{ id: l.id, data: l.data, valor: l.valor, descricao: l.descricao }}
                  opcoes={l.opcoes.map((o) => ({ chave: o.chave, rotulo: `${dia(o.data).slice(0, 5)} · ${o.descricao}` }))}
                  categorias={l.valor >= 0 ? cats.receita : cats.despesa}
                />
              ) : (
                <div className="flex justify-end">
                  <DesfazerConciliacao id={l.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
