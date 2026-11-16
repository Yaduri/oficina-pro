import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { NovoClienteForm } from "../forms";

export const metadata = { title: "Novo cliente" };

export default async function NovoClientePage() {
  await getContexto();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/clientes" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />Clientes
      </Link>
      <PageHeader title="Novo cliente" />
      <Card className="p-5 sm:p-6">
        <NovoClienteForm />
      </Card>
    </div>
  );
}
