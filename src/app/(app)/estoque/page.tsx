import Link from "next/link";
import { Search } from "lucide-react";
import { Button, Card, Input, Vazio, buttonClass, inputClass } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { valorDoEstoque } from "@/lib/estoque";
import { contarPecasSemControle, listarPecasEstoque, precisaRepor } from "@/lib/estoque-pecas";
import { margem, qtdTexto } from "@/lib/estoque-formato";
import { cn, formatBRL } from "@/lib/utils";
import { pct, Saldo } from "./saldo";

export const metadata = { title: "Estoque" };

const FILTROS = { todas: "Todas", minimo: "Abaixo do mínimo", negativo: "Sem estoque ou negativo" } as const;
type Filtro = keyof typeof FILTROS;

export default async function EstoquePage({ searchParams }: PageProps<"/estoque">) {
  const { oficina, pode } = await exigir("estoque");
  const valores = pode("verValores");
  // O catálogo é tela de configuração (dono e gerente)
  const admin = pode("configurar");
  const sp = await searchParams;
  const p = (k: string) => {
    const x = sp[k];
    return ((Array.isArray(x) ? x[0] : x) ?? "").trim();
  };
  const filtro: Filtro = p("filtro") in FILTROS ? (p("filtro") as Filtro) : "todas";
  const busca = p("q").slice(0, 60);

  const [pecas, semControle, valorTotal] = await Promise.all([
    listarPecasEstoque(oficina.id),
    contarPecasSemControle(oficina.id),
    valores ? valorDoEstoque(oficina.id) : Promise.resolve(0),
  ]);
  const abaixo = pecas.filter((x) => x.minimo > 0 && x.saldo >= 0 && x.saldo <= x.minimo).length;
  const negativas = pecas.filter((x) => x.saldo < 0).length;

  const termos = busca.toLowerCase().split(/\s+/).filter(Boolean);
  const lista = pecas.filter((x) => {
    if (filtro === "minimo" && !precisaRepor(x)) return false;
    if (filtro === "negativo" && x.saldo > 0) return false;
    if (!termos.length) return true;
    const texto = [x.descricao, x.codigo, x.marca, x.gtin].filter(Boolean).join(" ").toLowerCase();
    return termos.every((t) => texto.includes(t));
  });
  const filtrando = filtro !== "todas" || !!busca;

  const chips = [
    ...(valores ? [{ label: "Valor em estoque", valor: formatBRL(valorTotal), href: null, tom: "" }] : []),
    { label: "Abaixo do mínimo", valor: String(abaixo), href: "/estoque?filtro=minimo", tom: abaixo > 0 ? "text-warn" : "" },
    { label: "Saldo negativo", valor: String(negativas), href: "/estoque?filtro=negativo", tom: negativas > 0 ? "text-danger" : "" },
  ];
  const linkCatalogo = "/configuracoes/catalogo?tipo=peca";

  return (
    <div className="flex flex-col gap-5">
      <ul className={cn("grid grid-cols-2 gap-3", valores && "lg:grid-cols-3")} aria-label="Resumo">
        {chips.map((c, i) => {
          const conteudo = (
            <>
              <span className="text-[13px] text-muted">{c.label}</span>
              <span className={cn("text-lg font-semibold tabular-nums", c.tom)}>{c.valor}</span>
            </>
          );
          const cls = "flex h-full flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 shadow-card";
          return (
            <li key={c.label} className={cn(valores && i === 0 && "col-span-2 lg:col-span-1")}>
              {c.href ? (
                <Link href={c.href} className={cn(cls, "hover:bg-subtle")}>
                  {conteudo}
                </Link>
              ) : (
                <div className={cls}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>

      <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input name="q" defaultValue={busca} placeholder="Descrição, código, marca ou código de barras" className="h-10 pl-9" />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Mostrar</span>
          <select name="filtro" defaultValue={filtro} className={cn(inputClass, "h-10 cursor-pointer")}>
            {Object.entries(FILTROS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button variant="primary" className="h-10 flex-1">
            Filtrar
          </Button>
          {filtrando && (
            <Link href="/estoque" className={buttonClass("ghost", "h-10")}>
              Limpar
            </Link>
          )}
        </div>
      </form>

      <Card className="overflow-hidden">
        {lista.length === 0 ? (
          <Vazio titulo={filtrando ? "Nenhuma peça com esses filtros" : "Nenhuma peça com controle de estoque"}>
            {!filtrando &&
              (admin ? (
                <>
                  Marque “Controlar estoque” nas peças do{" "}
                  <Link href={linkCatalogo} className="font-medium text-foreground underline">
                    catálogo
                  </Link>
                  .
                </>
              ) : (
                "Peça ao dono ou gerente para marcar “Controlar estoque” nas peças do catálogo."
              ))}
          </Vazio>
        ) : (
          <>
            {/* Celular: cartões */}
            <ul className="divide-y divide-border md:hidden">
              {lista.map((x) => (
                <li key={x.id} className="relative flex flex-col gap-1 px-4 py-3 hover:bg-subtle">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/estoque/${x.id}`} className="font-medium after:absolute after:inset-0">
                      {x.descricao}
                    </Link>
                    <Saldo saldo={x.saldo} minimo={x.minimo} unidade={x.unidade} className="shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[13px] text-muted">
                    {x.codigo && <span>Cód. {x.codigo}</span>}
                    {x.marca && <span>{x.marca}</span>}
                    {x.localizacao && <span>{x.localizacao}</span>}
                    {x.minimo > 0 && <span>Mín. {qtdTexto(x.minimo, x.unidade)}</span>}
                    {x.saldo < 0 && <span className="font-medium text-danger">Saldo negativo</span>}
                  </div>
                  {valores && (
                    <div className="flex flex-wrap gap-x-3 text-[13px] text-foreground-2">
                      <span>Custo {formatBRL(x.custoMedio)}</span>
                      <span>Venda {formatBRL(x.venda)}</span>
                      <span>Margem {pct(margem(x.venda, x.custoMedio))}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* Tela grande: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Código</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Descrição</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Saldo</th>
                    <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Mínimo</th>
                    {valores && (
                      <>
                        <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Custo médio</th>
                        <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Venda</th>
                        <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Margem</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((x) => (
                    <tr key={x.id} className="relative hover:bg-subtle [&:not(:last-child)>td]:border-b [&>td]:border-border">
                      <td className="whitespace-nowrap px-4 py-3 text-foreground-2">{x.codigo ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Link href={`/estoque/${x.id}`} className="font-medium after:absolute after:inset-0">
                          {x.descricao}
                        </Link>
                        {(x.marca || x.localizacao) && (
                          <span className="flex flex-wrap gap-x-2 text-[13px] text-muted">
                            {x.marca && <span>{x.marca}</span>}
                            {x.localizacao && <span>{x.localizacao}</span>}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Saldo saldo={x.saldo} minimo={x.minimo} unidade={x.unidade} />
                        {x.saldo < 0 && <span className="block text-[12px] font-medium text-danger">Negativo</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground-2">{x.minimo > 0 ? qtdTexto(x.minimo, x.unidade) : "—"}</td>
                      {valores && (
                        <>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{x.custoMedio > 0 ? formatBRL(x.custoMedio) : "—"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatBRL(x.venda)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground-2">{pct(margem(x.venda, x.custoMedio))}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {(admin || semControle > 0) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          {semControle > 0 &&
            (admin ? (
              <Link href={linkCatalogo} className="underline-offset-4 hover:text-foreground hover:underline">
                {semControle} {semControle === 1 ? "peça do catálogo sem controle de estoque" : "peças do catálogo sem controle de estoque"}
              </Link>
            ) : (
              <span>{semControle} {semControle === 1 ? "peça do catálogo sem controle de estoque" : "peças do catálogo sem controle de estoque"}</span>
            ))}
          {admin && (
            <Link href={linkCatalogo} className="font-medium text-foreground-2 underline-offset-4 hover:underline">
              Configurar peças no catálogo
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
