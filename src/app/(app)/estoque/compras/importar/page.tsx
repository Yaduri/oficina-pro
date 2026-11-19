import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigir } from "@/lib/oficina";
import { opcoesPagamento, pecasParaCompra } from "@/lib/compras";
import { ImportarNota } from "./revisao";

export const metadata = { title: "Importar XML da nota" };

export default async function ImportarPage() {
  const { oficina } = await exigir("estoque");
  const [pecas, opcoes] = await Promise.all([pecasParaCompra(oficina.id), opcoesPagamento(oficina.id)]);
  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <Link href="/estoque/compras" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Compras e entradas
      </Link>
      <h2 className="text-[17px] font-semibold">Importar XML da nota</h2>
      <ImportarNota pecas={pecas} opcoes={opcoes} />
    </div>
  );
}
