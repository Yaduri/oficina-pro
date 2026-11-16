import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { empresasFiltradas } from "@/lib/oficina";
import { obterVeiculo, opcoesClientes } from "@/lib/cadastros";
import type { ResultadoPlaca } from "../actions";
import { NovaOSForm } from "./nova-os-form";

export const metadata = { title: "Nova OS" };

export default async function NovaOSPage({ searchParams }: PageProps<"/ordens-servico/nova">) {
  const sp = await searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const { oficina, empresas, selecionada, pode } = await empresasFiltradas(param("empresa"));
  if (!pode("abrirOS")) redirect("/ordens-servico");

  const db = await getDb();
  const [clientes, tecnicos] = await Promise.all([
    opcoesClientes(oficina.id),
    db
      .select({ nome: schema.tecnicos.nome })
      .from(schema.tecnicos)
      .where(eq(schema.tecnicos.oficinaId, oficina.id))
      .orderBy(asc(schema.tecnicos.nome)),
  ]);

  // Vindo da ficha do cliente: veículo já escolhido
  let inicial: ResultadoPlaca | null = null;
  const veiculoId = param("veiculo");
  if (veiculoId && /^[0-9a-f-]{36}$/i.test(veiculoId)) {
    const r = await obterVeiculo(oficina.id, veiculoId);
    if (r) {
      inicial = {
        status: "encontrada",
        placa: r.veiculo.placa,
        veiculo: { id: r.veiculo.id, marca: r.veiculo.marca, modelo: r.veiculo.modelo, ano: r.veiculo.ano, km: r.veiculo.km },
        cliente: r.cliente ? { id: r.cliente.id, nome: r.cliente.nome, telefone: r.cliente.telefone } : null,
      };
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/ordens-servico" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />Ordens de serviço
      </Link>
      <PageHeader title="Nova OS" />
      <Card className="p-5 sm:p-6">
        <NovaOSForm
          empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
          empresaPadrao={selecionada?.id ?? empresas[0]?.id ?? ""}
          clientes={clientes}
          tecnicos={tecnicos.map((t) => t.nome)}
          inicial={inicial}
        />
      </Card>
    </div>
  );
}
