import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { NovoFornecedorForm } from "../form";

export const metadata = { title: "Novo fornecedor" };

export default async function NovoFornecedorPage() {
  await exigir("estoque");
  return (
    <div className="flex w-full max-w-3xl flex-col gap-5">
      <Link href="/estoque/fornecedores" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Fornecedores
      </Link>
      <h2 className="text-[17px] font-semibold">Novo fornecedor</h2>
      <Card className="p-5 sm:p-6">
        <NovoFornecedorForm />
      </Card>
    </div>
  );
}
