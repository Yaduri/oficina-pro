import { ListaLancamentos } from "../_lancamentos/lista";

export const metadata = { title: "A pagar" };

export default function Page({ searchParams }: PageProps<"/financeiro/pagar">) {
  return <ListaLancamentos tipo="pagar" searchParams={searchParams} />;
}
