import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { chaveOficina } from "@/lib/oficina";
import { Brand } from "@/components/brand";
import { OnboardingForm } from "./form";

export const metadata = { title: "Cadastrar oficina" };

export default async function OnboardingPage() {
  const { chave } = await chaveOficina();
  const db = await getDb();
  const existente = await db.query.oficinas.findFirst({ where: eq(schema.oficinas.clerkOrgId, chave) });
  if (existente) redirect("/inicio");

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
      </main>
    </div>
  );
}
