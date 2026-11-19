"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button, Erro, Label, Textarea } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { responderPesquisa } from "./actions";

const NOTAS = Array.from({ length: 11 }, (_, i) => i);

export function FormularioPesquisa({ token, oficina }: { token: string; oficina: string }) {
  const { state, pending, onSubmit } = useFormAction(responderPesquisa.bind(null, token));
  const [nota, setNota] = useState<number | null>(null);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-lg border border-border bg-card p-4 shadow-card sm:p-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[16px] font-semibold">De 0 a 10, quanto você recomendaria a {oficina} a um amigo?</legend>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
          {NOTAS.map((n) => (
            <label
              key={n}
              className={cn(
                "flex h-12 cursor-pointer items-center justify-center rounded-md border text-[17px] font-semibold tabular-nums transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary sm:h-11",
                nota === n ? "border-primary bg-primary text-white" : "border-border bg-card hover:bg-subtle",
              )}
            >
              <input type="radio" name="nota" value={n} checked={nota === n} onChange={() => setNota(n)} className="sr-only" required />
              {n}
            </label>
          ))}
        </div>
        <div className="flex justify-between text-[12px] text-muted">
          <span>Nada provável</span>
          <span>Muito provável</span>
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="comentario">
          Comentário <span className="font-normal text-muted">(opcional)</span>
        </Label>
        <Textarea id="comentario" name="comentario" rows={3} maxLength={1000} placeholder="Conte o que foi bom ou o que podemos melhorar" />
      </div>
      <Erro>{state?.erro}</Erro>
      <Button type="submit" variant="primary" disabled={pending || nota === null} className="h-12 text-[15px] sm:h-10 sm:w-fit sm:self-end sm:text-sm">
        <Send />
        {pending ? "Enviando…" : "Enviar resposta"}
      </Button>
    </form>
  );
}
