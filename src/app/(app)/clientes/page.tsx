import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Avatar, Card, Input, PageHeader, Placa, Vazio, buttonClass } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { listarClientes } from "@/lib/cadastros";
import { formatDocumento, formatTelefone } from "@/lib/utils";

export const metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const sp = await searchParams;
  const busca = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const arquivados = sp.arquivados === "1";
  const { oficina, pode } = await exigir("checkin");
  const clientes = await listarClientes(oficina.id, busca, arquivados);

  return (
    <>
      <PageHeader
        title="Clientes"
        actions={
          pode("cadastros") && (
            <Link href="/clientes/novo" className={buttonClass("primary")}>
              <Plus />Novo cliente
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form role="search" className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="q" className="sr-only">Buscar cliente</label>
          {arquivados && <input type="hidden" name="arquivados" value="1" />}
          <Input id="q" name="q" defaultValue={busca} placeholder="Buscar por nome, placa, telefone ou CPF" className="pl-9" />
        </form>
        <Link href={arquivados ? "/clientes" : "/clientes?arquivados=1"} className="text-[13px] text-muted underline hover:text-foreground">
          {arquivados ? "Ver clientes ativos" : "Ver arquivados"}
        </Link>
      </div>
      {arquivados && <p className="-mt-2 text-[13px] text-muted">Mostrando clientes arquivados.</p>}

      <Card>
        {clientes.length === 0 ? (
          busca ? (
            <Vazio titulo={`Nenhum cliente encontrado para “${busca}”`}>
              <Link href={arquivados ? "/clientes?arquivados=1" : "/clientes"} className="underline">Limpar busca</Link>
            </Vazio>
          ) : arquivados ? (
            <Vazio titulo="Nenhum cliente arquivado" />
          ) : (
            <Vazio titulo="Nenhum cliente cadastrado">
              Cadastre o primeiro cliente com o veículo dele. Também é possível cadastrar ao abrir uma OS.
            </Vazio>
          )
        ) : (
          <ul className="divide-y divide-border">
            {clientes.map((c) => (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                  <Avatar nome={c.nome} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.nome}</p>
                    <p className="truncate text-[13px] text-muted">
                      {[formatTelefone(c.telefone), formatDocumento(c.documento)].filter(Boolean).join(" · ") || "Sem contato"}
                    </p>
                  </div>
                  <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                    {c.veiculos.slice(0, 3).map((v) => (
                      <Placa key={v.placa} placa={v.placa} />
                    ))}
                    {c.veiculos.length > 3 && <span className="self-center text-xs text-muted">+{c.veiculos.length - 3}</span>}
                  </div>
                  <span className="text-xs text-muted sm:hidden">
                    {c.veiculos.length} {c.veiculos.length === 1 ? "veículo" : "veículos"}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
