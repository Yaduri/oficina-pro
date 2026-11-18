import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { exigirAdmin } from "@/lib/oficina";
import { formatTempo, listarCatalogo } from "@/lib/catalogo";
import { cn } from "@/lib/utils";
import { AbasConfig } from "../abas";
import { FormItemCatalogo, ListaCatalogo } from "./lista";

export const metadata = { title: "Serviços e peças" };

export default async function CatalogoPage({ searchParams }: PageProps<"/configuracoes/catalogo">) {
  const { tipo: t } = await searchParams;
  const tipo = t === "peca" ? "peca" : "servico";
  const { oficina } = await exigirAdmin();
  const itens = (await listarCatalogo(oficina.id, { tipo })).map((i) => ({ ...i, tempo: formatTempo(i.tempoMinutos) }));

  return (
    <>
      <PageHeader title="Configurações" description="Serviços e peças com preço, para lançar na OS sem digitar tudo de novo." />
      <AbasConfig />

      <div className="flex gap-1 rounded-md bg-subtle p-1 text-[13px] font-medium sm:w-fit">
        {(
          [
            ["servico", "Serviços"],
            ["peca", "Peças"],
          ] as const
        ).map(([valor, label]) => (
          <Link
            key={valor}
            href={valor === "servico" ? "/configuracoes/catalogo" : "/configuracoes/catalogo?tipo=peca"}
            aria-current={tipo === valor ? "page" : undefined}
            className={cn(
              "flex-1 rounded px-4 py-1.5 text-center sm:flex-none",
              tipo === valor ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ListaCatalogo tipo={tipo} itens={itens} />
        <Card>
          <CardHeader title={tipo === "servico" ? "Novo serviço" : "Nova peça"} />
          <div className="p-5">
            <FormItemCatalogo key={tipo} tipo={tipo} />
          </div>
        </Card>
      </div>
    </>
  );
}
