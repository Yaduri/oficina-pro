import { EmBreve } from "@/components/em-breve";
import { exigir } from "@/lib/oficina";

export const metadata = { title: "Financeiro" };

export default async function Page() {
  await exigir("financeiro");
  return <EmBreve titulo="Financeiro" descricao="Contas a receber e a pagar, caixa e notas fiscais separados por CNPJ." />;
}
