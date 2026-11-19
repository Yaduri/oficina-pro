"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Input, Label } from "@/components/ui";
import { criarOficina } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(criarOficina, undefined);

  return (
    <form action={action} className="mt-8 flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome da oficina</Label>
        <Input id="nome" name="nome" placeholder="Ex.: Auto Center Silva" required autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cnpj">
          CNPJ <span className="font-normal text-muted">(pode preencher depois)</span>
        </Label>
        <Input id="cnpj" name="cnpj" placeholder="00.000.000/0000-00" autoCapitalize="characters" spellCheck={false} />
      </div>
      <p className="text-[13px] text-muted">Depois você completa razão social, endereço e logo em Configurações.</p>

      {state?.erro && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {state.erro}
        </p>
      )}

      <Button variant="primary" className="h-11 text-[15px]" disabled={pending}>
        {pending ? "Criando…" : "Criar oficina"}
      </Button>
      <p className="-mt-3 text-center text-[12px] text-muted">
        Ao criar a oficina, você concorda com os{" "}
        <Link href="/termos" target="_blank" className="underline underline-offset-2 hover:text-foreground">
          Termos de uso
        </Link>{" "}
        e a{" "}
        <Link href="/privacidade" target="_blank" className="underline underline-offset-2 hover:text-foreground">
          Política de privacidade
        </Link>
        .
      </p>
    </form>
  );
}
