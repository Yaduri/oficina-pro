import { Suspense } from "react";
import { getContexto } from "@/lib/oficina";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { oficina, papel } = await getContexto();

  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense>
        <Topbar oficina={oficina.nomeFantasia || oficina.nome} papel={papel} />
      </Suspense>
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-6 px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-8 sm:pb-[calc(2rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
