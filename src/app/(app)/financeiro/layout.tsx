import { PageHeader } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { garantirPadroes, gerarRecorrencias } from "@/lib/financeiro";
import { AbasFinanceiro } from "./abas";

/** Financeiro: só para quem tem a permissão "financeiro" (dono, gerente, financeiro) */
export default async function FinanceiroLayout({ children }: LayoutProps<"/financeiro">) {
  const { oficina } = await exigir("financeiro");
  await garantirPadroes(oficina.id);
  await gerarRecorrencias(oficina.id);
  return (
    <>
      <PageHeader title="Financeiro" />
      <AbasFinanceiro />
      {children}
    </>
  );
}
