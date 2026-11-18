import { DetalheLancamento } from "../../_lancamentos/detalhe";

export const metadata = { title: "A pagar" };

export default async function Page({ params }: PageProps<"/financeiro/pagar/[id]">) {
  const { id } = await params;
  return <DetalheLancamento tipo="pagar" id={id} />;
}
