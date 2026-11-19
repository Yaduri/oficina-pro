import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { Badge, Card, CardHeader, Vazio, buttonClass } from "@/components/ui";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/oficina";
import { ehUuid } from "@/lib/os-acesso";
import { listarCompras } from "@/lib/compras";
import { hojeSP } from "@/lib/financeiro";
import { formatDocumento, formatTelefone } from "@/lib/utils";
import { AcoesFornecedor, EditarFornecedorForm } from "../form";
import { TabelaCompras } from "../../compras/_ui/tabela";

async function carregar(id: string) {
  if (!ehUuid(id)) return null;
  const { oficina } = await exigir("estoque");
  const db = await getDb();
  const [f] = await db
    .select()
    .from(schema.fornecedores)
    .where(and(eq(schema.fornecedores.id, id), eq(schema.fornecedores.oficinaId, oficina.id)));
  return f ? { f, oficina } : null;
}

export async function generateMetadata({ params }: PageProps<"/estoque/fornecedores/[id]">) {
  const r = await carregar((await params).id);
  return { title: r ? r.f.nomeFantasia || r.f.nome : "Fornecedor" };
}

export default async function FornecedorPage({ params }: PageProps<"/estoque/fornecedores/[id]">) {
  const r = await carregar((await params).id);
  if (!r) notFound();
  const { f, oficina } = r;
  const compras = await listarCompras(oficina.id, { status: "todas", fornecedorId: f.id });
  const nome = f.nomeFantasia || f.nome;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/estoque/fornecedores" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Fornecedores
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2.5 text-[17px] font-semibold">
            {nome}
            {!f.ativo && <Badge>Arquivado</Badge>}
          </h2>
          <p className="text-[13px] text-muted">
            {[f.nomeFantasia ? f.nome : null, formatDocumento(f.cpfCnpj), formatTelefone(f.telefone)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <AcoesFornecedor id={f.id} nome={nome} ativo={f.ativo} temCompras={compras.length > 0} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Dados do fornecedor" />
          <div className="p-5">
            <EditarFornecedorForm fornecedor={f} />
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader
            title="Compras"
            action={
              f.ativo && (
                <Link href={`/estoque/compras/nova?fornecedor=${f.id}`} className={buttonClass("secondary", "h-8")}>
                  <Plus />
                  Novo pedido
                </Link>
              )
            }
          />
          {compras.length === 0 ? <Vazio titulo="Nenhuma compra deste fornecedor" /> : <TabelaCompras lista={compras} hoje={hojeSP()} semFornecedor />}
        </Card>
      </div>
    </div>
  );
}
