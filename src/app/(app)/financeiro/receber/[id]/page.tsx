import { DetalheLancamento } from "../../_lancamentos/detalhe";

export const metadata = { title: "A receber" };

export default async function Page({ params }: PageProps<"/financeiro/receber/[id]">) {
  const { id } = await params;
  return <DetalheLancamento tipo="receber" id={id} />;
}
