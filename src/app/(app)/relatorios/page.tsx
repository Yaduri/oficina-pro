import Link from "next/link";
import { BotaoWhatsApp } from "@/components/botao-whatsapp";
import { Badge, Card, CardHeader, PageHeader, Placa, Vazio } from "@/components/ui";
import { lerPeriodo, type Periodo } from "@/lib/financeiro-relatorios";
import { montarMensagem, nomeVeiculo, primeiroNome, textoModelo } from "@/lib/mensagens";
import { exigir, type Oficina } from "@/lib/oficina";
import { STATUS } from "@/lib/os";
import {
  MESES_INATIVO,
  aprovacaoOrcamentos,
  clientesInativos,
  formatDias,
  formatHoras,
  itensMaisVendidos,
  pct,
  produtividadeTecnicos,
  respostasPesquisa,
  satisfacao,
  tempoNoPatio,
} from "@/lib/relatorios-gerenciais";
import { cn, formatData, formatTelefone } from "@/lib/utils";
import { BotaoCsv, FiltroPeriodo, Indicador, Tabela, Td, Th, brl, paramsPeriodo, trClass, urlCom } from "../financeiro/relatorios/componentes";

export const metadata = { title: "Relatórios" };

const BASE = "/relatorios";
const VISOES = {
  servicos: "Serviços",
  patio: "Pátio",
  tecnicos: "Técnicos",
  orcamentos: "Orçamentos",
  inativos: "Clientes inativos",
  satisfacao: "Satisfação",
} as const;
type Visao = keyof typeof VISOES;

const lerMeses = (v: string) => (MESES_INATIVO.some((m) => String(m) === v) ? Number(v) : 6);

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const { oficina } = await exigir("relatorios");
  const periodo = lerPeriodo(p);
  const ver: Visao = Object.hasOwn(VISOES, p("ver")) ? (p("ver") as Visao) : "servicos";
  const meses = lerMeses(p("meses"));
  const verParam = ver === "servicos" ? undefined : ver;

  return (
    <>
      <PageHeader title="Relatórios" />
      <nav aria-label="Relatórios" className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-subtle p-1">
        {(Object.keys(VISOES) as Visao[]).map((v) => (
          <Link
            key={v}
            href={urlCom(BASE, { ...(v === "inativos" ? {} : paramsPeriodo(periodo)), ver: v === "servicos" ? undefined : v })}
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
      {ver !== "inativos" && <FiltroPeriodo base={BASE} periodo={periodo} manter={{ ver: verParam }} />}
      {ver === "servicos" && <Servicos oficinaId={oficina.id} periodo={periodo} />}
      {ver === "patio" && <Patio oficinaId={oficina.id} periodo={periodo} />}
      {ver === "tecnicos" && <Tecnicos oficinaId={oficina.id} periodo={periodo} />}
      {ver === "orcamentos" && <Orcamentos oficinaId={oficina.id} periodo={periodo} />}
      {ver === "inativos" && <Inativos oficina={oficina} meses={meses} />}
      {ver === "satisfacao" && <Satisfacao oficinaId={oficina.id} periodo={periodo} />}
    </>
  );
}

const csv = (periodo: Periodo | null, tabela: string, extra: Record<string, string | undefined> = {}) =>
  urlCom(`${BASE}/csv`, { tabela, ...(periodo ? paramsPeriodo(periodo) : {}), ...extra });

const nf = (n: number) => n.toLocaleString("pt-BR");

function Barra({ valor, max, className = "bg-foreground/70" }: { valor: number; max: number; className?: string }) {
  return (
    <span aria-hidden className="flex h-2.5 rounded-sm bg-subtle">
      <span className={cn("rounded-sm", className)} style={{ width: `${max > 0 ? (valor / max) * 100 : 0}%` }} />
    </span>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[13px] text-muted">{children}</p>;
}

/* ---------- Serviços mais vendidos ---------- */

async function Servicos({ oficinaId, periodo }: { oficinaId: string; periodo: Periodo }) {
  const todos = await itensMaisVendidos(oficinaId, periodo.de, periodo.ate);
  const grupos = [
    { tipo: "servico" as const, titulo: "Serviços mais vendidos", vazio: "Nenhum serviço em OS entregue no período" },
    { tipo: "peca" as const, titulo: "Peças mais usadas", vazio: "Nenhuma peça em OS entregue no período" },
  ];
  const soma = (t: "servico" | "peca") => todos.filter((i) => i.tipo === t).reduce((s, i) => s + i.total, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Serviços" valor={brl(soma("servico"))} detalhe={`${nf(todos.filter((i) => i.tipo === "servico").length)} diferentes`} />
        <Indicador rotulo="Peças" valor={brl(soma("peca"))} detalhe={`${nf(todos.filter((i) => i.tipo === "peca").length)} diferentes`} />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {grupos.map((g) => {
          const lista = todos.filter((i) => i.tipo === g.tipo);
          const visiveis = lista.slice(0, 30);
          const max = Math.max(1, ...visiveis.map((i) => i.total));
          return (
            <Card key={g.tipo} className="min-w-0 overflow-hidden">
              <CardHeader title={g.titulo} action={<BotaoCsv href={csv(periodo, "itens", { tipo: g.tipo })} />} />
              {lista.length === 0 ? (
                <Vazio titulo={g.vazio} />
              ) : (
                <>
                  <Tabela legenda={g.titulo}>
                    <thead>
                      <tr>
                        <Th>{g.tipo === "servico" ? "Serviço" : "Peça"}</Th>
                        <Th num>Qtd.</Th>
                        <Th num>OS</Th>
                        <Th num>Faturamento</Th>
                        <Th className="w-1/5 min-w-20">
                          <span className="sr-only">Gráfico</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((i) => (
                        <tr key={i.chave} className={trClass}>
                          <Td className="max-w-64 whitespace-normal">{i.descricao}</Td>
                          <Td num>{nf(i.quantidade)}</Td>
                          <Td num>{i.qtdOS}</Td>
                          <Td num>{brl(i.total)}</Td>
                          <Td>
                            <Barra valor={i.total} max={max} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabela>
                  {lista.length > visiveis.length && (
                    <p className="border-t border-border px-4 py-3 text-[13px] text-muted">
                      Mostrando os 30 de maior faturamento de {lista.length}. O CSV traz todos.
                    </p>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
      <Nota>
        OS entregues no período, sem os itens recusados e com o desconto da OS dividido na proporção do valor de cada item. Itens do catálogo são
        somados juntos; os digitados à mão, pela descrição.
      </Nota>
    </>
  );
}

/* ---------- Tempo no pátio ---------- */

async function Patio({ oficinaId, periodo }: { oficinaId: string; periodo: Periodo }) {
  const t = await tempoNoPatio(oficinaId, periodo.de, periodo.ate);
  const max = Math.max(1, ...t.faixas.map((f) => f.qtd));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="OS entregues" valor={t.qtd} />
        <Indicador rotulo="Tempo médio" valor={formatDias(t.media)} />
        <Indicador rotulo="Mediana" valor={formatDias(t.mediana)} detalhe="Metade sai em até esse tempo" />
        <Indicador rotulo="No pátio agora há mais de 15 dias" valor={t.abertas.filter((o) => o.dias > 15).length} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Da entrada à entrega" action={<BotaoCsv href={csv(periodo, "patio-faixas")} />} />
          {t.qtd === 0 ? (
            <Vazio titulo="Nenhuma OS entregue no período" />
          ) : (
            <Tabela legenda="OS entregues por tempo no pátio">
              <thead>
                <tr>
                  <Th>Tempo</Th>
                  <Th num>OS</Th>
                  <Th num>%</Th>
                  <Th className="w-2/5 min-w-24">
                    <span className="sr-only">Gráfico</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {t.faixas.map((f) => (
                  <tr key={f.chave} className={trClass}>
                    <Td>{f.rotulo}</Td>
                    <Td num>{f.qtd}</Td>
                    <Td num className="text-muted">
                      {pct(f.pct)}
                    </Td>
                    <Td>
                      <Barra valor={f.qtd} max={max} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Abertas há mais tempo" action={<BotaoCsv href={csv(null, "patio-abertas")} />} />
          {t.abertas.length === 0 ? (
            <Vazio titulo="Nenhuma OS aberta" />
          ) : (
            <Tabela legenda="OS abertas há mais tempo">
              <thead>
                <tr>
                  <Th>OS</Th>
                  <Th>Veículo</Th>
                  <Th>Status</Th>
                  <Th num>No pátio</Th>
                </tr>
              </thead>
              <tbody>
                {t.abertas.map((o) => (
                  <tr key={o.id} className={cn(trClass, "hover:bg-subtle")}>
                    <Td>
                      <Link href={`/ordens-servico/${o.id}`} className="font-medium hover:underline">
                        #{o.numero}
                      </Link>
                    </Td>
                    <Td className="whitespace-normal">
                      <span className="flex flex-wrap items-center gap-2">
                        <Placa placa={o.placa} />
                        <span className="text-[13px] text-muted">{[o.veiculo, o.cliente].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Td>
                    <Td>
                      <Badge tom={STATUS[o.status].tom}>{STATUS[o.status].label}</Badge>
                    </Td>
                    <Td num className={cn(o.dias > 15 && "text-danger")}>
                      {formatDias(Math.floor(o.dias))}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>
      </div>
      <Nota>
        Tempo da entrada do veículo até a entrega, das OS entregues no período. Fração de dia conta como um dia inteiro nas faixas. O tempo em cada
        status não aparece porque o histórico das OS antigas não registra todas as mudanças.
      </Nota>
    </>
  );
}

/* ---------- Produtividade por técnico ---------- */

async function Tecnicos({ oficinaId, periodo }: { oficinaId: string; periodo: Periodo }) {
  const linhas = await produtividadeTecnicos(oficinaId, periodo.de, periodo.ate);
  const max = Math.max(1, ...linhas.map((l) => l.total));
  return (
    <>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader title="Produtividade por técnico" action={<BotaoCsv href={csv(periodo, "tecnicos")} />} />
        {linhas.length === 0 ? (
          <Vazio titulo="Nenhuma OS entregue no período" />
        ) : (
          <Tabela legenda="Produtividade por técnico responsável">
            <thead>
              <tr>
                <Th>Técnico</Th>
                <Th num>OS</Th>
                <Th num>Serviços</Th>
                <Th num>Peças</Th>
                <Th num>Total</Th>
                <Th num>Ticket médio</Th>
                <Th num>Tempo médio</Th>
                <Th num>Horas padrão</Th>
                <Th className="w-1/6 min-w-20">
                  <span className="sr-only">Gráfico</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.tecnicoId ?? "-"} className={trClass}>
                  <Td className={cn(!l.tecnicoId && "text-muted")}>{l.nome}</Td>
                  <Td num>{l.qtd}</Td>
                  <Td num>{brl(l.servicos)}</Td>
                  <Td num>{brl(l.pecas)}</Td>
                  <Td num className="font-medium">
                    {brl(l.total)}
                  </Td>
                  <Td num>{brl(l.ticket)}</Td>
                  <Td num>{formatDias(l.diasMedio)}</Td>
                  <Td num>{formatHoras(l.minutosPadrao)}</Td>
                  <Td>
                    <Barra valor={l.total} max={max} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>
      <Nota>
        OS entregues no período pelo técnico responsável, com o desconto da OS. Tempo médio: da entrada à entrega. Horas padrão: tempo do
        catálogo × quantidade dos serviços (serviços sem tempo no catálogo não contam).
      </Nota>
    </>
  );
}

/* ---------- Aprovação de orçamentos ---------- */

function formatHorasResposta(h: number | null) {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h).toLocaleString("pt-BR")} h`;
  return formatDias(h / 24);
}

async function Orcamentos({ oficinaId, periodo }: { oficinaId: string; periodo: Periodo }) {
  const o = await aprovacaoOrcamentos(oficinaId, periodo.de, periodo.ate);
  const max = Math.max(1, ...o.linhas.map((l) => l.qtd));
  const tom = { aprovado: "bg-ok", parcial: "bg-ok/50", recusado: "bg-danger", pendente: "bg-foreground/40", vencido: "bg-warn" } as const;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Orçamentos enviados" valor={o.total} detalhe={brl(o.valor)} />
        <Indicador rotulo="Aprovação" valor={pct(o.taxaQtd)} detalhe={`${o.aprovados} aprovados, inteiros ou em parte`} />
        <Indicador rotulo="Aprovação por valor" valor={pct(o.taxaValor)} detalhe={`${brl(o.valorAprovado)} aprovados`} />
        <Indicador rotulo="Tempo até a resposta" valor={formatHorasResposta(o.horasResposta)} detalhe={`${o.vistos} de ${o.total} vistos pelo cliente`} />
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader title="Orçamentos por situação" action={<BotaoCsv href={csv(periodo, "orcamentos")} />} />
        {o.total === 0 ? (
          <Vazio titulo="Nenhum orçamento enviado no período" />
        ) : (
          <Tabela legenda="Orçamentos enviados por situação">
            <thead>
              <tr>
                <Th>Situação</Th>
                <Th num>Qtd.</Th>
                <Th num>%</Th>
                <Th num>Valor enviado</Th>
                <Th num>Valor aprovado</Th>
                <Th num>Vistos</Th>
                <Th num>Não vistos</Th>
                <Th className="w-1/6 min-w-20">
                  <span className="sr-only">Gráfico</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {o.linhas.map((l) => (
                <tr key={l.situacao} className={trClass}>
                  <Td>{l.rotulo}</Td>
                  <Td num>{l.qtd}</Td>
                  <Td num className="text-muted">
                    {pct(o.total ? l.qtd / o.total : null)}
                  </Td>
                  <Td num>{brl(l.valor)}</Td>
                  <Td num>{l.valorAprovado ? brl(l.valorAprovado) : <span className="text-muted">—</span>}</Td>
                  <Td num>{l.vistos}</Td>
                  <Td num>{l.qtd - l.vistos}</Td>
                  <Td>
                    <Barra valor={l.qtd} max={max} className={tom[l.situacao]} />
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong font-semibold">
                <Td>Total</Td>
                <Td num>{o.total}</Td>
                <Td />
                <Td num>{brl(o.valor)}</Td>
                <Td num>{brl(o.valorAprovado)}</Td>
                <Td num>{o.vistos}</Td>
                <Td num>{o.total - o.vistos}</Td>
                <Td />
              </tr>
            </tfoot>
          </Tabela>
        )}
      </Card>
      <Nota>
        Orçamentos enviados no período, sem os que foram trocados por um envio mais novo. No aprovado em parte, o valor aprovado é a soma dos
        itens aceitos com o desconto na mesma proporção. Vencido: passou da validade sem resposta.
      </Nota>
    </>
  );
}

/* ---------- Clientes inativos ---------- */

async function Inativos({ oficina, meses }: { oficina: Oficina; meses: number }) {
  const todos = await clientesInativos(oficina.id, meses);
  const lista = todos.slice(0, 100);
  const modelo = textoModelo(oficina.modelosMensagem, "reativacao");
  const nomeOficina = oficina.nomeFantasia || oficina.nome;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-foreground-2" id="meses-rotulo">
          Sem voltar há mais de
        </span>
        <nav aria-labelledby="meses-rotulo" className="flex gap-1.5">
          {MESES_INATIVO.map((m) => (
            <Link
              key={m}
              href={urlCom(BASE, { ver: "inativos", meses: m === 6 ? undefined : String(m) })}
              aria-current={meses === m ? "true" : undefined}
              className={cn(
                "inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium",
                meses === m ? "border-foreground bg-foreground text-white" : "border-border bg-card text-foreground-2 hover:bg-subtle",
              )}
            >
              {m} meses
            </Link>
          ))}
        </nav>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Clientes inativos" valor={todos.length} />
        <Indicador rotulo="Com consentimento" valor={todos.filter((c) => c.aceitaWhatsapp).length} detalhe="Podem receber mensagem" />
        <Indicador rotulo="Já gastaram" valor={brl(todos.reduce((s, c) => s + c.totalGasto, 0))} />
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader title="Clientes inativos" action={<BotaoCsv href={csv(null, "inativos", { meses: String(meses) })} />} />
        {lista.length === 0 ? (
          <Vazio titulo={`Nenhum cliente sem voltar há mais de ${meses} meses`} />
        ) : (
          <>
            <Tabela legenda="Clientes sem OS entregue há mais tempo">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Último veículo</Th>
                  <Th>Última visita</Th>
                  <Th num>Total gasto</Th>
                  <Th>Telefone</Th>
                  <Th>
                    <span className="sr-only">Mensagem</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const veiculo = nomeVeiculo(c);
                  const texto = montarMensagem(modelo, {
                    cliente: primeiroNome(c.nome),
                    veiculo,
                    placa: c.placa ?? undefined,
                    oficina: nomeOficina,
                  });
                  return (
                    <tr key={c.id} className={cn(trClass, "hover:bg-subtle")}>
                      <Td className="max-w-56 whitespace-normal">
                        <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                          {c.nome}
                        </Link>
                        <span className="block text-[12px] text-muted">{c.qtdOS === 1 ? "1 OS" : `${c.qtdOS} OS`}</span>
                      </Td>
                      <Td className="whitespace-normal">
                        {c.placa ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Placa placa={c.placa} />
                            <span className="text-[13px] text-muted">{veiculo}</span>
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td className="tabular-nums">{formatData(c.ultimaVisita)}</Td>
                      <Td num>{brl(c.totalGasto)}</Td>
                      <Td className="tabular-nums">{c.telefone ? formatTelefone(c.telefone) : <span className="text-muted">—</span>}</Td>
                      <Td>
                        {!c.aceitaWhatsapp ? (
                          <span className="text-[13px] text-muted">Sem consentimento</span>
                        ) : c.telefone ? (
                          <BotaoWhatsApp
                            telefone={c.telefone}
                            texto={texto}
                            registro={{ tipo: "reativacao", clienteId: c.id, veiculoId: c.veiculoId }}
                            label="WhatsApp"
                            variant="ghost"
                            className="h-8 px-2.5 text-[13px]"
                          />
                        ) : (
                          <span className="text-[13px] text-muted">Sem telefone</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>
            {todos.length > lista.length && (
              <p className="border-t border-border px-4 py-3 text-[13px] text-muted">
                Mostrando os 100 mais recentes de {todos.length}. O CSV traz todos.
              </p>
            )}
          </>
        )}
      </Card>
      <Nota>
        Clientes não arquivados cuja última OS entregue foi há mais de {meses} meses e que não têm OS aberta. A mensagem usa o modelo Cliente
        inativo e só aparece para quem aceitou receber mensagens.
      </Nota>
    </>
  );
}

/* ---------- Satisfação ---------- */

async function Satisfacao({ oficinaId, periodo }: { oficinaId: string; periodo: Periodo }) {
  const [s, comentarios] = await Promise.all([
    satisfacao(oficinaId, periodo.de, periodo.ate),
    respostasPesquisa(oficinaId, periodo.de, periodo.ate, { soComentario: true, limite: 15 }),
  ]);
  const max = Math.max(1, ...s.notas.map((n) => n.qtd));
  const corNota = (n: number) => (n >= 9 ? "bg-ok" : n >= 7 ? "bg-foreground/40" : "bg-danger");
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="NPS"
          valor={s.nps ?? "—"}
          tom={s.nps == null ? undefined : s.nps >= 50 ? "ok" : s.nps < 0 ? "danger" : undefined}
          detalhe="De −100 a 100"
        />
        <Indicador
          rotulo="Respostas"
          valor={s.respostas}
          detalhe={s.media != null ? `Nota média ${(Math.round(s.media * 10) / 10).toLocaleString("pt-BR")}` : undefined}
        />
        <Indicador rotulo="Taxa de resposta" valor={pct(s.taxaResposta)} detalhe={`${s.respondidasDasCriadas} de ${s.criadas} pesquisas`} />
        <Indicador
          rotulo="Promotores e detratores"
          valor={`${pct(s.respostas ? s.promotores / s.respostas : null)} · ${pct(s.respostas ? s.detratores / s.respostas : null)}`}
          detalhe={`${s.promotores} deram 9 ou 10; ${s.detratores} deram até 6`}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Notas" action={<BotaoCsv href={csv(periodo, "satisfacao")}>Respostas</BotaoCsv>} />
          {s.respostas === 0 ? (
            <Vazio titulo="Nenhuma resposta no período" />
          ) : (
            <Tabela legenda="Respostas por nota">
              <thead>
                <tr>
                  <Th>Nota</Th>
                  <Th num>Respostas</Th>
                  <Th className="w-3/5 min-w-24">
                    <span className="sr-only">Gráfico</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {[...s.notas].reverse().map((n) => (
                  <tr key={n.nota} className={trClass}>
                    <Td className="tabular-nums">{n.nota}</Td>
                    <Td num>{n.qtd}</Td>
                    <Td>
                      <Barra valor={n.qtd} max={max} className={corNota(n.nota)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Últimos comentários" />
          {comentarios.length === 0 ? (
            <Vazio titulo="Nenhum comentário no período" />
          ) : (
            <ul className="divide-y divide-border">
              {comentarios.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                  <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <Badge tom={c.nota >= 9 ? "ok" : c.nota >= 7 ? "neutro" : "danger"}>Nota {c.nota}</Badge>
                    <Link href={`/ordens-servico/${c.osId}`} className="font-medium text-foreground hover:underline">
                      OS #{c.numero}
                    </Link>
                    {c.cliente && <span>{c.cliente}</span>}
                    <span className="tabular-nums">{formatData(c.respondidoEm)}</span>
                  </span>
                  <p className="text-sm whitespace-pre-line">{c.comentario}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Nota>
        NPS: % de promotores (9 ou 10) menos % de detratores (0 a 6), das pesquisas respondidas no período. Taxa de resposta: pesquisas criadas no
        período que já foram respondidas.
      </Nota>
    </>
  );
}
