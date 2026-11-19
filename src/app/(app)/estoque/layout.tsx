import { PageHeader } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { AbasEstoque } from "./abas";

/** Estoque e compras: dono, gerente, financeiro e atendente */
export default async function EstoqueLayout({ children }: LayoutProps<"/estoque">) {
  await exigir("estoque");
  return (
    <>
      <PageHeader title="Estoque" />
      <AbasEstoque />
      {children}
    </>
  );
}
