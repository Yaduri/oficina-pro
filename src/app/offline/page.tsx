import { Brand } from "@/components/brand";
import { TentarDeNovo } from "./tentar-de-novo";

// Página que o service worker mostra quando não há internet (fica guardada no aparelho)
export const metadata = { title: "Sem internet" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col px-6 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-14 sm:pt-[calc(2.5rem+env(safe-area-inset-top))]">
      <Brand />
      <main className="m-auto w-full max-w-[440px] py-10">
        <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-6 shadow-pop sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">Sem internet</h1>
          <p className="text-muted">
            Não foi possível abrir esta tela. Confira o Wi-Fi ou os dados móveis e tente de novo.
          </p>
          <TentarDeNovo />
        </div>
      </main>
    </div>
  );
}
