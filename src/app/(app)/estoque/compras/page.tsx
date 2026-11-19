import Link from "next/link";
import { FileUp, PackagePlus, Plus, Search } from "lucide-react";
import { Button, Card, Input, Vazio, buttonClass, inputClass } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { FILTROS_COMPRA, ehFiltroCompra, listarCompras } from "@/lib/compras";
import { hojeSP } from "@/lib/financeiro";
import { cn, formatBRL } from "@/lib/utils";
import { TabelaCompras } from "./_ui/tabela";

export const metadata = { title: "Compras e entradas" };

export default async function ComprasPage({ searchParams }: PageProps<"/estoque/compras">) {
  const { oficina } = await exigir("estoque");
  const sp = await searchParams;
  const p = (k: string) => ((Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "").trim();
  const status = ehFiltroCompra(p("status")) ? p("status") : "abertos";
  const busca = p("q").slice(0, 60) || undefined;
  const lista = await listarCompras(oficina.id, { status: status as keyof typeof FILTROS_COMPRA, busca });
  const filtrando = !!(p("status") || busca);
  const total = lista.filter((c) => c.status !== "cancelada").reduce((s, c) => s + Number(c.valorTotal), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/estoque/compras/importar" className={buttonClass("secondary")}>
          <FileUp />
          Importar XML da nota
        </Link>
        <Link href="/estoque/compras/nova?tipo=entrada" className={buttonClass("secondary")}>
          <PackagePlus />
          Lançar entrada
        </Link>
        <Link href="/estoque/compras/nova" className={buttonClass("primary")}>
          <Plus />
          Novo pedido
        </Link>
      </div>

      <form className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input name="q" defaultValue={busca} placeholder="Fornecedor, nota ou número" className="h-10 pl-9" />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Situação</span>
          <select name="status" defaultValue={status} className={cn(inputClass, "h-10 cursor-pointer")}>
            {Object.entries(FILTROS_COMPRA).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button variant="primary" className="h-10 flex-1">
            Filtrar
          </Button>
          {filtrando && (
            <Link href="/estoque/compras" className={buttonClass("ghost", "h-10")}>
              Limpar
            </Link>
          )}
        </div>
      </form>

      <Card className="overflow-hidden">
        {lista.length === 0 ? (
          <Vazio titulo={filtrando ? "Nenhuma compra com esses filtros" : "Nenhum pedido em aberto"} />
        ) : (
          <>
            <TabelaCompras lista={lista} hoje={hojeSP()} />
            <p className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-[13px] text-muted">
              <span>
                {lista.length} {lista.length === 1 ? "compra" : "compras"}
                {lista.length === 200 && " (mostrando as 200 mais recentes)"}
              </span>
              <span>
                Total <strong className="tabular-nums text-foreground">{formatBRL(total)}</strong>
              </span>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
