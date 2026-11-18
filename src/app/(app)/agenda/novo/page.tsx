import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { DIA_RE, diaSP } from "@/lib/agenda-datas";
import { dadosDoFormulario } from "../carregar-form";
import { FormAgendamento } from "../form";

export const metadata = { title: "Novo agendamento" };

export default async function NovoAgendamentoPage({ searchParams }: PageProps<"/agenda/novo">) {
  await exigir("abrirOS");
  const sp = await searchParams;
  const p = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const dia = DIA_RE.test(p("data")) ? p("data") : diaSP(new Date());
  const d = await dadosDoFormulario(p("veiculo"));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={`/agenda?data=${dia}`} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Agenda
      </Link>
      <PageHeader title="Novo agendamento" description="Veículo novo é cadastrado junto, com o cliente." />
      <Card className="p-5 sm:p-6">
        <FormAgendamento
          id={null}
          valores={{ dia, hora: "08:00", duracao: 60, titulo: "", detalhe: "", tecnicoId: "" }}
          inicial={d.inicial}
          clientes={d.clientes}
          tecnicos={d.tecnicos}
          catalogo={d.catalogo}
        />
      </Card>
    </div>
  );
}
