import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigir } from "@/lib/oficina";
import { ehUuid } from "@/lib/os-acesso";
import { opcoesFornecedores, opcoesPagamento, osParaCompra, pecasParaCompra } from "@/lib/compras";
import { NovaCompraForm, type ItemInicial } from "./form";

export async function generateMetadata({ searchParams }: PageProps<"/estoque/compras/nova">) {
  const sp = await searchParams;
  return { title: sp.tipo === "entrada" ? "Lançar entrada" : "Novo pedido de compra" };
}

/**
 * Novo pedido (ou entrada já recebida, com ?tipo=entrada).
 * Aceita ?pecas=<peçaId>:<qtd>,... (Reposição), ?os=<osId> e ?fornecedor=<id>.
 */
export default async function NovaCompraPage({ searchParams }: PageProps<"/estoque/compras/nova">) {
  const { oficina } = await exigir("estoque");
  const sp = await searchParams;
  const p = (k: string) => ((Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "").trim();
  const entrada = p("tipo") === "entrada";
  const osId = ehUuid(p("os")) ? p("os") : null;

  const [fornecedores, pecas, oss, pagamento] = await Promise.all([
    opcoesFornecedores(oficina.id),
    pecasParaCompra(oficina.id),
    osParaCompra(oficina.id, osId),
    opcoesPagamento(oficina.id),
  ]);

  const itens: ItemInicial[] = [];
  for (const par of p("pecas").split(",").slice(0, 200)) {
    const [id, q] = par.split(":");
    const peca = pecas.find((x) => x.id === id);
    const quantidade = Number(q);
    if (!peca || itens.some((i) => i.catalogoItemId === id)) continue;
    itens.push({ catalogoItemId: peca.id, quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1, valorUnitario: peca.custoMedio });
  }
  const fornecedorId = fornecedores.some((f) => f.id === p("fornecedor")) ? p("fornecedor") : null;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <Link href="/estoque/compras" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Compras e entradas
      </Link>
      <h2 className="text-[17px] font-semibold">{entrada ? "Lançar entrada" : "Novo pedido de compra"}</h2>
      <NovaCompraForm
        key={`${entrada}-${p("pecas")}-${osId}`}
        tipo={entrada ? "entrada" : "pedido"}
        fornecedores={fornecedores}
        pecas={pecas}
        oss={oss.map((o) => ({ id: o.id, rotulo: `OS #${o.numero} · ${o.placa} ${o.modelo}` }))}
        pagamento={pagamento}
        inicial={{ itens, osId: oss.some((o) => o.id === osId) ? osId : null, fornecedorId }}
      />
    </div>
  );
}
