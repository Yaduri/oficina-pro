import { Suspense } from "react";
import { getContexto } from "@/lib/oficina";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { oficina, empresas, papel } = await getContexto();
  const resumo = empresas.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo }));

  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense>
        <Topbar empresas={resumo} oficina={oficina.nome} papel={papel} />
      </Suspense>
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
