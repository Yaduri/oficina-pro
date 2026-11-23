import { Suspense } from "react";
import { getContexto } from "@/lib/oficina";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { oficina, papel, oficinas } = await getContexto();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <Suspense>
        <Topbar oficina={oficina.nomeFantasia || oficina.nome} oficinaId={oficina.id} oficinas={oficinas} papel={papel} />
      </Suspense>
      <main id="conteudo" tabIndex={-1} className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-6 px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] outline-none sm:px-8 sm:pt-8 sm:pb-[calc(2rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
