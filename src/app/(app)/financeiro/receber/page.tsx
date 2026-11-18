import { ListaLancamentos } from "../_lancamentos/lista";

export const metadata = { title: "A receber" };

export default function Page({ searchParams }: PageProps<"/financeiro/receber">) {
  return <ListaLancamentos tipo="receber" searchParams={searchParams} />;
}
