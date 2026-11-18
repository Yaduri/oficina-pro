import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { obterAgendamento } from "@/lib/agenda";
import { diaSP, horaSP } from "@/lib/agenda-datas";
import { dadosDoFormulario } from "../carregar-form";
import { FormAgendamento } from "../form";

export const metadata = { title: "Editar agendamento" };

export default async function EditarAgendamentoPage({ params }: PageProps<"/agenda/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { oficina, empresas } = await exigir("abrirOS");
  const r = await obterAgendamento(oficina.id, id);
  if (!r || (r.agendamento.empresaId && !empresas.some((e) => e.id === r.agendamento.empresaId))) notFound();
  const a = r.agendamento;
  const d = await dadosDoFormulario(a.veiculoId);
  const dia = diaSP(a.inicio);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={`/agenda?data=${dia}`} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Agenda
      </Link>
      <PageHeader title="Editar agendamento" description="Mude o horário para remarcar." />
      <Card className="p-5 sm:p-6">
        <FormAgendamento
          id={a.id}
          valores={{
            dia,
            hora: horaSP(a.inicio),
            duracao: a.duracaoMin,
            titulo: a.titulo,
            detalhe: a.detalhe ?? "",
            empresaId: a.empresaId ?? "",
            tecnicoId: a.tecnicoId ?? "",
          }}
          inicial={d.inicial}
          clientes={d.clientes}
          empresas={d.empresas}
          tecnicos={d.tecnicos}
          catalogo={d.catalogo}
        />
      </Card>
    </div>
  );
}
