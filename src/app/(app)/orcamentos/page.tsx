import Link from "next/link";
import { ChevronRight, Eye } from "lucide-react";
import { Badge, Card, EmpresaTag, PageHeader, Placa, Vazio } from "@/components/ui";
import { empresasFiltradas } from "@/lib/oficina";
import { STATUS_ORCAMENTO, listarOrcamentos } from "@/lib/orcamento";
import { formatBRL, formatEntrada } from "@/lib/utils";

export const metadata = { title: "Orçamentos" };

export default async function OrcamentosPage({ searchParams }: PageProps<"/orcamentos">) {
  const { empresa } = await searchParams;
  const { oficina, empresaIds } = await empresasFiltradas(empresa);
  const lista = await listarOrcamentos(oficina.id, empresaIds);
  const pendentes = lista.filter((o) => o.status === "pendente");
  const outros = lista.filter((o) => o.status !== "pendente");

  return (
    <>
      <PageHeader
        title="Orçamentos"
        description="Orçamentos enviados por link para o cliente aprovar. Para enviar um, abra a OS e use o cartão Orçamento."
      />

      {lista.length === 0 ? (
        <Card>
          <Vazio titulo="Nenhum orçamento enviado">
            Lance as peças e serviços na OS e gere o link do orçamento. O cliente aprova pelo celular.
          </Vazio>
        </Card>
      ) : (
        <>
          <Secao titulo="Aguardando o cliente" itens={pendentes} vazio="Nenhum orçamento aguardando resposta." />
          {outros.length > 0 && <Secao titulo="Respondidos e anteriores" itens={outros} />}
        </>
      )}
    </>
  );
}

type Linha = Awaited<ReturnType<typeof listarOrcamentos>>[number];

function Secao({ titulo, itens, vazio }: { titulo: string; itens: Linha[]; vazio?: string }) {
  const agora = new Date();
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold">
        {titulo} <span className="font-normal text-muted">{itens.length}</span>
      </h2>
      <Card>
        {itens.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted">{vazio}</p>
        ) : (
          <ul className="divide-y divide-border">
            {itens.map((o) => (
              <li key={o.id}>
                <Link href={`/ordens-servico/${o.osId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">OS #{o.numero}</span>
                      <Placa placa={o.placa} />
                      <span className="truncate text-foreground-2">{[o.marca, o.modelo].filter(Boolean).join(" ")}</span>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-muted">
                      {o.cliente ?? "Sem cliente"} · enviado {formatEntrada(o.criadoEm, agora).toLowerCase()}
                      {o.status === "pendente" && o.vistoEm && (
                        <>
                          {" · "}
                          <Eye className="inline size-3.5 align-[-2px]" aria-hidden /> visto
                        </>
                      )}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <EmpresaTag tipo={o.empresaTipo} nome={o.empresaNome} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-medium tabular-nums">{formatBRL(Number(o.total))}</span>
                    <Badge tom={STATUS_ORCAMENTO[o.status].tom}>{STATUS_ORCAMENTO[o.status].label}</Badge>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
