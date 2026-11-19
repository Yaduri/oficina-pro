import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Card, Input, Vazio, buttonClass } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { listarFornecedores } from "@/lib/compras";
import { formatDocumento, formatTelefone } from "@/lib/utils";

export const metadata = { title: "Fornecedores" };

export default async function FornecedoresPage({ searchParams }: PageProps<"/estoque/fornecedores">) {
  const { oficina } = await exigir("estoque");
  const sp = await searchParams;
  const busca = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 60) || undefined;
  const arquivados = sp.arquivados === "1";
  const lista = await listarFornecedores(oficina.id, { busca, arquivados });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form role="search" className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="q" className="sr-only">
            Buscar fornecedor
          </label>
          {arquivados && <input type="hidden" name="arquivados" value="1" />}
          <Input id="q" name="q" defaultValue={busca} placeholder="Nome, CNPJ, telefone ou contato" className="pl-9" />
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={arquivados ? "/estoque/fornecedores" : "/estoque/fornecedores?arquivados=1"}
            className="text-[13px] text-muted underline hover:text-foreground"
          >
            {arquivados ? "Ver ativos" : "Ver arquivados"}
          </Link>
          <Link href="/estoque/fornecedores/novo" className={buttonClass("primary")}>
            <Plus />
            Novo fornecedor
          </Link>
        </div>
      </div>

      <Card>
        {lista.length === 0 ? (
          busca ? (
            <Vazio titulo={`Nenhum fornecedor encontrado para “${busca}”`} />
          ) : (
            <Vazio titulo={arquivados ? "Nenhum fornecedor arquivado" : "Nenhum fornecedor cadastrado"} />
          )
        ) : (
          <ul className="divide-y divide-border">
            {lista.map((f) => (
              <li key={f.id}>
                <Link href={`/estoque/fornecedores/${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.nomeFantasia || f.nome}</p>
                    <p className="truncate text-[13px] text-muted">
                      {[f.nomeFantasia ? f.nome : null, formatDocumento(f.cpfCnpj), formatTelefone(f.telefone), f.contato].filter(Boolean).join(" · ") ||
                        "Sem contato"}
                    </p>
                  </div>
                  {f.cidade && <span className="hidden text-[13px] text-muted sm:block">{[f.cidade, f.uf].filter(Boolean).join("/")}</span>}
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
