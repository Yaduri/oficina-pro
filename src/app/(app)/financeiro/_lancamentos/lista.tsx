import Link from "next/link";
import { redirect } from "next/navigation";
import { ehUuid } from "@/lib/os-acesso";
import { Paperclip, Repeat, Search } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, Vazio, buttonClass, inputClass } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { centavos, somarDiasData, STATUS_LANCAMENTO, type TipoLancamento } from "@/lib/financeiro";
import {
  ehFiltroStatus,
  FILTROS_STATUS,
  LIMITE_LISTA,
  listarLancamentos,
  listarRecorrencias,
  opcoesFormulario,
  resumoLancamentos,
} from "@/lib/financeiro-lancamentos";
import { DIA_RE } from "@/lib/agenda-datas";
import { cn, formatBRL } from "@/lib/utils";
import { FormLancamento } from "./form-lancamento";
import { BotaoAcao } from "./botao-acao";
import { alterarRecorrencia } from "./actions";

type SP = Record<string, string | string[] | undefined>;

/** "AAAA-MM-DD" → "DD/MM/AAAA" */
export const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Status para mostrar: em aberto e vencido vira "Vencida" */
export function statusVisivel(status: keyof typeof STATUS_LANCAMENTO, vencimento: string, hoje: string) {
  if ((status === "aberto" || status === "parcial") && vencimento < hoje) return { label: "Vencida", tom: "danger" as const };
  return STATUS_LANCAMENTO[status];
}

const ultimoDiaDoMes = (dia: string) => somarDiasData(`${somarDiasData(`${dia.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);

/** Tela "A receber" / "A pagar": resumo, filtros, lista e recorrências */
export async function ListaLancamentos({ tipo, searchParams }: { tipo: TipoLancamento; searchParams: Promise<SP> }) {
  const { oficina } = await exigir("financeiro");
  const sp = await searchParams;
  const p = (k: string) => {
    const x = sp[k];
    return ((Array.isArray(x) ? x[0] : x) ?? "").trim();
  };
  const receber = tipo === "receber";
  const base = `/financeiro/${tipo}`;
  // Links de outras telas (ex.: comissões) com ?lancamento=<id> abrem o detalhe
  if (ehUuid(p("lancamento"))) redirect(`${base}/${p("lancamento")}`);

  const opcoes = await opcoesFormulario(oficina.id, tipo);
  const { hoje } = opcoes;
  const status = ehFiltroStatus(p("status")) ? (p("status") as keyof typeof FILTROS_STATUS) : "abertas";
  const de = DIA_RE.test(p("de")) ? p("de") : undefined;
  const ate = DIA_RE.test(p("ate")) ? p("ate") : undefined;
  const categoriaId = opcoes.categorias.some((c) => c.id === p("categoria")) ? p("categoria") : undefined;
  const busca = p("q").slice(0, 60) || undefined;
  const filtrando = !!(p("status") || de || ate || categoriaId || busca);

  // "Pago no período": o período do filtro ou, sem ele, o mês atual
  const periodo = { de: de ?? `${hoje.slice(0, 7)}-01`, ate: ate ?? (de ? hoje : ultimoDiaDoMes(hoje)) };
  const [lista, resumo, recs] = await Promise.all([
    listarLancamentos(oficina.id, tipo, { status, de, ate, categoriaId, busca }),
    resumoLancamentos(oficina.id, tipo, periodo),
    listarRecorrencias(oficina.id, tipo),
  ]);

  const totalValor = lista.reduce((s, x) => s + centavos(x.valor), 0);
  const totalAberto = lista.filter((x) => x.status === "aberto" || x.status === "parcial").reduce((s, x) => s + centavos(x.valor) - centavos(x.valorPago), 0);
  const quem = (x: (typeof lista)[number]) => (receber ? x.cliente : x.fornecedor);
  const textoPeriodo = de || ate ? `${de ? dataCurta(periodo.de) : "início"} a ${dataCurta(periodo.ate)}` : "este mês";

  const chips = [
    { label: "Em aberto", valor: resumo.aberto, qtd: resumo.qtdAberto, href: `${base}?status=abertas`, tom: "" },
    { label: "Vencido", valor: resumo.vencido, qtd: resumo.qtdVencido, href: `${base}?status=vencidas`, tom: resumo.vencido > 0 ? "text-danger" : "" },
    { label: "Vence hoje", valor: resumo.hoje, qtd: resumo.qtdHoje, href: `${base}?status=abertas&de=${hoje}&ate=${hoje}`, tom: resumo.hoje > 0 ? "text-warn" : "" },
    { label: `${receber ? "Recebido" : "Pago"} (${textoPeriodo})`, valor: resumo.pago, qtd: null, href: null, tom: "text-ok" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{receber ? "Contas a receber" : "Contas a pagar"}</h2>
        <FormLancamento tipo={tipo} opcoes={opcoes} />
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo">
        {chips.map((c) => {
          const conteudo = (
            <>
              <span className="text-[13px] text-muted">{c.label}</span>
              <span className={cn("text-lg font-semibold tabular-nums", c.tom)}>{formatBRL(c.valor / 100)}</span>
              {c.qtd !== null && (
                <span className="text-[12px] text-muted">
                  {c.qtd} {c.qtd === 1 ? "conta" : "contas"}
                </span>
              )}
            </>
          );
          return (
            <li key={c.label}>
              {c.href ? (
                <Link href={c.href} className="flex h-full flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 shadow-card hover:bg-subtle">
                  {conteudo}
                </Link>
              ) : (
                <div className="flex h-full flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 shadow-card">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>

      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <span className="text-[13px] font-medium text-foreground-2">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input name="q" defaultValue={busca} placeholder={receber ? "Descrição ou cliente" : "Descrição ou fornecedor"} className="h-10 pl-9" />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Situação</span>
          <select name="status" defaultValue={status} className={cn(inputClass, "h-10 cursor-pointer")}>
            {Object.entries(FILTROS_STATUS).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Categoria</span>
          <select name="categoria" defaultValue={categoriaId ?? ""} className={cn(inputClass, "h-10 cursor-pointer")}>
            <option value="">Todas</option>
            {opcoes.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Vencimento de</span>
          <Input type="date" name="de" defaultValue={de} className="h-10" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">até</span>
          <Input type="date" name="ate" defaultValue={ate} className="h-10" />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button variant="primary" className="h-10 flex-1">
            Filtrar
          </Button>
          {filtrando && (
            <Link href={base} className={buttonClass("ghost", "h-10")}>
              Limpar
            </Link>
          )}
        </div>
      </form>

      <Card className="overflow-hidden">
        {lista.length === 0 ? (
          <Vazio titulo={filtrando ? "Nenhuma conta com esses filtros" : receber ? "Nada a receber em aberto" : "Nada a pagar em aberto"}>
            {!filtrando && "Use “Novo lançamento” para registrar uma conta."}
          </Vazio>
        ) : (
          <>
            {/* Celular: cartões */}
            <ul className="divide-y divide-border md:hidden">
              {lista.map((x) => {
                const st = statusVisivel(x.status, x.vencimento, hoje);
                const vencida = st.label === "Vencida";
                return (
                  <li key={x.id} className="relative flex flex-col gap-1 px-4 py-3 hover:bg-subtle">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`${base}/${x.id}`} className="font-medium after:absolute after:inset-0">
                        {x.descricao}
                      </Link>
                      <span className="shrink-0 font-semibold tabular-nums">{formatBRL(x.valor)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                      <span className={cn(vencida && "font-medium text-danger")}>Vence {dataBR(x.vencimento)}</span>
                      {quem(x) && <span>· {quem(x)}</span>}
                      {x.categoria && <span>· {x.categoria}</span>}
                      {x.osId && (
                        <Link href={`/ordens-servico/${x.osId}`} className="relative z-10 font-medium text-foreground underline">
                          OS #{x.osNumero}
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tom={st.tom}>{st.label}</Badge>
                      {centavos(x.valorPago) > 0 && x.status !== "pago" && <span className="text-[13px] text-muted">pago {formatBRL(x.valorPago)}</span>}
                      {x.recorrenciaId && <Repeat className="size-3.5 text-muted" aria-label="Recorrente" />}
                      {x.anexoKey && <Paperclip className="size-3.5 text-muted" aria-label="Tem anexo" />}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Tela grande: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Vencimento</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Descrição</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Categoria</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Valor</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">{receber ? "Recebido" : "Pago"}</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((x) => {
                    const st = statusVisivel(x.status, x.vencimento, hoje);
                    const vencida = st.label === "Vencida";
                    return (
                      <tr key={x.id} className="relative hover:bg-subtle [&:not(:last-child)>td]:border-b [&>td]:border-border">
                        <td className={cn("whitespace-nowrap px-4 py-3 tabular-nums", vencida ? "font-medium text-danger" : "text-foreground-2")}>
                          {dataBR(x.vencimento)}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`${base}/${x.id}`} className="font-medium after:absolute after:inset-0">
                            {x.descricao}
                          </Link>
                          <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                            {quem(x) && <span>{quem(x)}</span>}
                            {x.osId && (
                              <Link href={`/ordens-servico/${x.osId}`} className="relative z-10 font-medium text-foreground underline">
                                OS #{x.osNumero}
                              </Link>
                            )}
                            {x.recorrenciaId && <Repeat className="size-3.5" aria-label="Recorrente" />}
                            {x.anexoKey && <Paperclip className="size-3.5" aria-label="Tem anexo" />}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground-2">{x.categoria ?? "—"}</td>
                        <td className={cn("whitespace-nowrap px-4 py-3 text-right tabular-nums", x.status === "cancelado" && "text-muted line-through")}>
                          {formatBRL(x.valor)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground-2">
                          {centavos(x.valorPago) > 0 ? formatBRL(x.valorPago) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tom={st.tom}>{st.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-[13px] text-muted">
              <span>
                {lista.length} {lista.length === 1 ? "conta" : "contas"}
                {lista.length === LIMITE_LISTA && ` (mostrando as primeiras ${LIMITE_LISTA})`}
              </span>
              <span>
                Total {formatBRL(totalValor / 100)}
                {totalAberto > 0 && totalAberto !== totalValor && ` · em aberto ${formatBRL(totalAberto / 100)}`}
              </span>
            </p>
          </>
        )}
      </Card>

      {recs.length > 0 && (
        <Card>
          <CardHeader title={receber ? "Recebimentos recorrentes" : "Contas recorrentes"} />
          <ul className="divide-y divide-border">
            {recs.map(({ r, categoria }) => {
              const encerrada = !!r.fim && r.fim < hoje;
              const situacao = encerrada ? { label: "Encerrada", tom: "neutro" as const } : r.ativo ? { label: "Ativa", tom: "ok" as const } : { label: "Pausada", tom: "warn" as const };
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.descricao} <span className="font-normal tabular-nums text-foreground-2">· {formatBRL(r.valor)}</span>
                    </p>
                    <p className="text-[13px] text-muted">
                      Todo dia {r.dia}
                      {categoria && ` · ${categoria}`}
                      {r.fornecedor && ` · ${r.fornecedor}`}
                      {` · desde ${dataBR(r.inicio)}`}
                      {r.fim && ` até ${dataBR(r.fim)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tom={situacao.tom}>{situacao.label}</Badge>
                    {!encerrada && (
                      <>
                        {r.ativo ? (
                          <BotaoAcao acao={alterarRecorrencia.bind(null, r.id, "pausar")} variant="ghost" rotulo={`Pausar ${r.descricao}`}>
                            Pausar
                          </BotaoAcao>
                        ) : (
                          <BotaoAcao acao={alterarRecorrencia.bind(null, r.id, "retomar")} variant="ghost" rotulo={`Retomar ${r.descricao}`}>
                            Retomar
                          </BotaoAcao>
                        )}
                        <BotaoAcao
                          acao={alterarRecorrencia.bind(null, r.id, "encerrar")}
                          variant="ghost"
                          rotulo={`Encerrar ${r.descricao}`}
                          confirmar={`Encerrar "${r.descricao}"? Os meses futuros ainda não pagos serão cancelados.`}
                        >
                          Encerrar
                        </BotaoAcao>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
