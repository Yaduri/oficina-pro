import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { empresasFiltradas } from "@/lib/oficina";
import { obterVeiculo, opcoesClientes } from "@/lib/cadastros";
import type { ResultadoPlaca } from "@/app/(app)/ordens-servico/actions";
import { CheckinForm } from "./checkin-form";
import { TERMO_PADRAO } from "@/lib/textos";

export const metadata = { title: "Novo check-in" };

export default async function NovoCheckinPage({ searchParams }: PageProps<"/check-in/novo">) {
  const sp = await searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const { oficina, empresas, selecionada } = await empresasFiltradas(param("empresa"));
  const clientes = await opcoesClientes(oficina.id);

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
      <Link href="/check-in" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />Check-in
      </Link>
      <PageHeader title="Novo check-in" description="Registre a chegada do veículo. Ao final, as OS são abertas automaticamente." />
      <Card className="p-5 sm:p-6">
        <CheckinForm
          empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
          empresaPadrao={selecionada?.id}
          clientes={clientes}
          inicial={inicial}
          termo={oficina.textoTermoCheckin ?? TERMO_PADRAO}
        />
      </Card>
    </div>
  );
}
