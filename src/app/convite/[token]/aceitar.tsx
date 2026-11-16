"use client";

import { useState, useTransition } from "react";
import { Button, Erro } from "@/components/ui";
import { aceitarConvite } from "./actions";

export function Aceitar({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();

  return (
    <div className="flex flex-col gap-3">
      <Erro>{erro}</Erro>
      <Button
        variant="primary"
        className="h-11"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await aceitarConvite(token);
            if (r?.erro) setErro(r.erro);
          })
        }
      >
        {pending ? "Entrando…" : "Aceitar convite"}
      </Button>
    </div>
  );
}
