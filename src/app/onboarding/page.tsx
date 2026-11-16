import { redirect } from "next/navigation";
import { exigirLogin, membroAtivo } from "@/lib/oficina";
import { Brand } from "@/components/brand";
import { OnboardingForm } from "./form";

export const metadata = { title: "Cadastrar oficina" };

export default async function OnboardingPage() {
  const userId = await exigirLogin();
  if (await membroAtivo(userId)) redirect("/inicio");

  return (
    <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-14 sm:py-10">
      <Brand />
      <main className="mx-auto my-10 w-full max-w-[560px] rounded-xl border border-border bg-card p-6 shadow-pop sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight">Cadastre sua oficina</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          Uma oficina pode ter mais de uma empresa (CNPJ). Cada empresa tem suas próprias ordens de serviço, notas e
          financeiro.
        </p>
        <OnboardingForm />
        <p className="mt-6 border-t border-border pt-4 text-[13px] text-muted">
          Foi convidado por uma oficina? Não cadastre outra: abra de novo o link do convite que você recebeu.
        </p>
      </main>
    </div>
  );
}
