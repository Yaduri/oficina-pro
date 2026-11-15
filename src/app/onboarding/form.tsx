"use client";

import { useActionState } from "react";
import { Button, Input, Label, inputClass } from "@/components/ui";
import { criarOficina } from "./actions";

const padrao = [
  { nome: "Mecânica", tipo: "mecanica" },
  { nome: "Autoelétrica", tipo: "eletrica" },
];

export function OnboardingForm() {
  const [state, action, pending] = useActionState(criarOficina, undefined);

  return (
    <form action={action} className="mt-8 flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nomeOficina">Nome da oficina</Label>
        <Input id="nomeOficina" name="nomeOficina" placeholder="Ex.: Auto Center Silva" required autoFocus />
      </div>

      {padrao.map((e, i) => (
        <fieldset key={i} className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-[13px] font-semibold">Empresa {i + 1}{i === 1 && <span className="font-normal text-muted"> (opcional)</span>}</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`empresa_${i}_nome`}>Nome</Label>
              <Input id={`empresa_${i}_nome`} name={`empresa_${i}_nome`} defaultValue={e.nome} required={i === 0} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`empresa_${i}_tipo`}>Tipo</Label>
              <select id={`empresa_${i}_tipo`} name={`empresa_${i}_tipo`} defaultValue={e.tipo} className={inputClass}>
                <option value="mecanica">Mecânica</option>
                <option value="eletrica">Elétrica</option>
                <option value="outra">Outra</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`empresa_${i}_cnpj`}>CNPJ <span className="font-normal text-muted">(pode preencher depois)</span></Label>
            <Input id={`empresa_${i}_cnpj`} name={`empresa_${i}_cnpj`} inputMode="numeric" placeholder="00.000.000/0000-00" />
          </div>
        </fieldset>
      ))}


      {state?.erro && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {state.erro}
        </p>
      )}

      <Button variant="primary" className="h-11 text-[15px]" disabled={pending}>
        {pending ? "Criando…" : "Criar oficina"}
      </Button>
    </form>
  );
}
