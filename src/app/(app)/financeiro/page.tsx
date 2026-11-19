import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, TriangleAlert } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { listarContas, saldosDasContas, somarDiasData, TIPOS_CONTA } from "@/lib/financeiro";
import { inicioDoMes, resumoVisaoGeral, ultimosMovimentos } from "@/lib/financeiro-caixa";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Financeiro" };

const brl = (c: number) => formatBRL(c / 100 || 0);
const dia = (d: string) => d.split("-").reverse().join("/").slice(0, 5);
const qtdTxt = (n: number) => (n === 1 ? "1 conta" : `${n} contas`);

export default async function FinanceiroPage() {
  const { oficina } = await exigir("financeiro");
  const [contas, saldos, r] = await Promise.all([listarContas(oficina.id, false), saldosDasContas(oficina.id), resumoVisaoGeral(oficina.id)]);
  const movimentos = await ultimosMovimentos(oficina.id, contas, 8);
  const visiveis = saldos.filter((c) => c.ativo || c.saldo !== 0);
  const total = visiveis.reduce((t, c) => t + c.saldo, 0);
  const amanha = somarDiasData(r.hoje, 1);
  const q = (tipo: "receber" | "pagar", p: Record<string, string>) => `/financeiro/${tipo}?${new URLSearchParams(p)}`;
  const resultadoMes = r.entradasMes.total - r.saidasMes.total;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao
          tipo="receber"
          titulo="A receber hoje"
          soma={r.receber.hoje}
          href={q("receber", { status: "aberto", de: r.hoje, ate: r.hoje })}
          vencido={r.receber.vencido}
          hrefVencido={q("receber", { status: "vencidas" })}
        />
        <Cartao
          tipo="pagar"
          titulo="A pagar hoje"
          soma={r.pagar.hoje}
          href={q("pagar", { status: "aberto", de: r.hoje, ate: r.hoje })}
          vencido={r.pagar.vencido}
          hrefVencido={q("pagar", { status: "vencidas" })}
        />
        <Card className="flex flex-col gap-1.5 p-5">
          <p className="text-[13px] font-medium text-muted">Entradas e saídas do mês</p>
          <p className={cn("text-[26px] font-semibold tracking-tight tabular-nums", resultadoMes < 0 && "text-danger")}>{brl(resultadoMes)}</p>
          <p className="flex flex-wrap gap-x-3 text-[13px] tabular-nums">
            <span className="text-ok">+{brl(r.entradasMes.total)}</span>
            <span className="text-danger">−{brl(r.saidasMes.total)}</span>
          </p>
          <p className="text-[12px] text-muted">Recebido e pago desde {dia(inicioDoMes(r.hoje))}</p>
        </Card>
        <Card className="flex flex-col gap-1.5 p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <CalendarClock className="size-4" strokeWidth={1.75} aria-hidden />
            Próximos 7 dias
          </p>
          <Link href={q("receber", { status: "aberto", de: amanha, ate: r.em7 })} className="flex items-baseline justify-between gap-2 hover:underline underline-offset-4">
            <span className="text-[13px]">A receber</span>
            <span className="font-semibold tabular-nums text-ok">{brl(r.receber.proximos.total)}</span>
          </Link>
          <Link href={q("pagar", { status: "aberto", de: amanha, ate: r.em7 })} className="flex items-baseline justify-between gap-2 hover:underline underline-offset-4">
            <span className="text-[13px]">A pagar</span>
            <span className="font-semibold tabular-nums text-danger">{brl(r.pagar.proximos.total)}</span>
          </Link>
          <p className="border-t border-border pt-1.5 text-[12px] text-muted">
            Previsto: {brl(r.receber.proximos.total - r.pagar.proximos.total)} · {dia(amanha)} a {dia(r.em7)}
          </p>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Saldos"
            action={
              <Link href="/financeiro/caixa" className="text-[13px] font-medium underline-offset-4 hover:underline">
                Caixa e bancos
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            {visiveis.map((c) => (
              <li key={c.id}>
                <Link href={`/financeiro/caixa?conta=${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-subtle">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.nome}</span>
                    <span className="block text-[12px] text-muted">{c.ativo ? TIPOS_CONTA[c.tipo] : "Desativada"}</span>
                  </span>
                  <span className={cn("font-semibold tabular-nums", c.saldo < 0 && "text-danger")}>{brl(c.saldo)}</span>
                </Link>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 bg-subtle/60 px-5 py-3">
              <span className="font-medium">Total</span>
              <span className={cn("text-[17px] font-semibold tabular-nums", total < 0 && "text-danger")}>{brl(total)}</span>
            </li>
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Últimas movimentações" />
          {movimentos.length === 0 ? (
            <p className="px-5 py-10 text-center text-muted">Nenhum pagamento ou recebimento registrado ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {movimentos.map((m) => (
                <li key={`${m.origem}-${m.id}`} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", m.estornada && "text-muted")}>
                  <span className="w-11 shrink-0 text-[13px] tabular-nums text-muted">{dia(m.data)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-medium", m.estornada && "line-through")}>{m.descricao}</p>
                    <p className="truncate text-[12px] text-muted">
                      {m.origem === "transferencia" ? m.detalhe : [m.conta, m.detalhe].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {m.estornada && <Badge>Estornado</Badge>}
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      m.estornada ? "line-through" : m.origem === "transferencia" ? "" : m.valor >= 0 ? "text-ok" : "text-danger",
                    )}
                  >
                    {m.origem === "transferencia" ? "" : m.valor >= 0 ? "+" : "−"}
                    {brl(Math.abs(m.valor))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Cartao({
  tipo,
  titulo,
  soma,
  href,
  vencido,
  hrefVencido,
}: {
  tipo: "receber" | "pagar";
  titulo: string;
  soma: { total: number; qtd: number };
  href: string;
  vencido: { total: number; qtd: number };
  hrefVencido: string;
}) {
  const Icone = tipo === "receber" ? ArrowDownLeft : ArrowUpRight;
  return (
    <Card className="flex flex-col gap-1.5 p-5">
      <Link href={href} className="group flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
          <Icone className={cn("size-4", tipo === "receber" ? "text-ok" : "text-danger")} strokeWidth={1.75} aria-hidden />
          {titulo}
        </span>
        <span className="text-[26px] font-semibold tracking-tight tabular-nums group-hover:underline underline-offset-4">{brl(soma.total)}</span>
        <span className="text-[13px] text-muted">{soma.qtd ? qtdTxt(soma.qtd) : "Nada vence hoje"}</span>
      </Link>
      {vencido.qtd > 0 ? (
        <Link href={hrefVencido} className="mt-1 flex items-center gap-1.5 rounded-md bg-danger-soft px-2.5 py-1.5 text-[13px] font-medium text-danger hover:underline underline-offset-4">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Vencido: {brl(vencido.total)} ({qtdTxt(vencido.qtd)})
        </Link>
      ) : (
        <span className="mt-1 text-[13px] text-muted">Nada vencido</span>
      )}
    </Card>
  );
}
