import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui";
import { exigirLogin, membroAtivo } from "@/lib/oficina";

export const metadata = { title: "Acesso desativado" };

export default async function SemAcessoPage() {
  const userId = await exigirLogin();
  if (await membroAtivo(userId)) redirect("/inicio");

  return (
    <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-14 sm:py-10">
      <Brand />
      <main className="m-auto w-full max-w-[440px] py-10">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-pop sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">Seu acesso foi desativado</h1>
          <p className="text-muted">
            Fale com quem administra a oficina para reativar. Se recebeu um convite novo, abra o link dele.
          </p>
          <SignOutButton redirectUrl="/sign-in">
            <Button className="self-start">Sair</Button>
          </SignOutButton>
        </div>
      </main>
    </div>
  );
}
