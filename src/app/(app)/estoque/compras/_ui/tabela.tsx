import Link from "next/link";
import { Badge } from "@/components/ui";
import { STATUS_COMPRA, dataBR, type StatusCompra } from "@/lib/compras";
import { cn, formatBRL, formatData } from "@/lib/utils";

export type LinhaCompra = {
  id: string;
  numero: number;
  status: StatusCompra;
  fornecedor: string | null;
  fornecedorFantasia: string | null;
  notaNumero: string | null;
  criadoEm: Date;
  recebidaEm: Date | null;
  previsaoEm: string | null;
  valorTotal: string;
  osId: string | null;
  osNumero: number | null;
};

const th = "border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium";

/** Lista de compras: cartões no celular, tabela na tela grande */
export function TabelaCompras({ lista, hoje, semFornecedor = false }: { lista: LinhaCompra[]; hoje: string; semFornecedor?: boolean }) {
  const atrasada = (c: LinhaCompra) => c.status === "pedido" && !!c.previsaoEm && c.previsaoEm < hoje;
  const nome = (c: LinhaCompra) => c.fornecedorFantasia || c.fornecedor || "Sem fornecedor";
  const data = (c: LinhaCompra) => formatData(c.recebidaEm ?? c.criadoEm);
  const os = (c: LinhaCompra) =>
    c.osId && (
      <Link href={`/ordens-servico/${c.osId}`} className="relative z-10 font-medium text-foreground underline">
        OS #{c.osNumero}
      </Link>
    );

  return (
    <>
      <ul className="divide-y divide-border md:hidden">
        {lista.map((c) => (
          <li key={c.id} className="relative flex flex-col gap-1 px-4 py-3 hover:bg-subtle">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/estoque/compras/${c.id}`} className="font-medium after:absolute after:inset-0">
                #{c.numero}
                {!semFornecedor && ` · ${nome(c)}`}
              </Link>
              <span className="shrink-0 font-semibold tabular-nums">{formatBRL(c.valorTotal)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              <Badge tom={STATUS_COMPRA[c.status].tom}>{STATUS_COMPRA[c.status].label}</Badge>
              <span>{data(c)}</span>
              {c.notaNumero && <span>· NF {c.notaNumero}</span>}
              {c.status === "pedido" && c.previsaoEm && (
                <span className={cn(atrasada(c) && "font-medium text-danger")}>· chega {dataBR(c.previsaoEm)}</span>
              )}
              {os(c)}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className={th}>Número</th>
              {!semFornecedor && <th className={th}>Fornecedor</th>}
              <th className={th}>Nota</th>
              <th className={th}>Data</th>
              <th className={th}>Previsão</th>
              <th className={cn(th, "text-right")}>Valor</th>
              <th className={th}>Situação</th>
              <th className={th}>OS</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="relative hover:bg-subtle [&:not(:last-child)>td]:border-b [&>td]:border-border">
                <td className="whitespace-nowrap px-4 py-3">
                  <Link href={`/estoque/compras/${c.id}`} className="font-medium after:absolute after:inset-0">
                    #{c.numero}
                  </Link>
                </td>
                {!semFornecedor && <td className="px-4 py-3">{nome(c)}</td>}
                <td className="whitespace-nowrap px-4 py-3 text-foreground-2">{c.notaNumero ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground-2">{data(c)}</td>
                <td className={cn("whitespace-nowrap px-4 py-3 tabular-nums", atrasada(c) ? "font-medium text-danger" : "text-foreground-2")}>
                  {c.status === "pedido" && c.previsaoEm ? dataBR(c.previsaoEm) : "—"}
                </td>
                <td className={cn("whitespace-nowrap px-4 py-3 text-right tabular-nums", c.status === "cancelada" && "text-muted line-through")}>
                  {formatBRL(c.valorTotal)}
                </td>
                <td className="px-4 py-3">
                  <Badge tom={atrasada(c) ? "danger" : STATUS_COMPRA[c.status].tom}>{atrasada(c) ? "Atrasado" : STATUS_COMPRA[c.status].label}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{os(c) || <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
