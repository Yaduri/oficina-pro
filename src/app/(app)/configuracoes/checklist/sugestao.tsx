"use client";

import { useTransition } from "react";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui";
import { adicionarSugestao } from "./actions";

export function Sugestao({ discreto = false }: { discreto?: boolean }) {
  const [pending, start] = useTransition();
  if (discreto) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => adicionarSugestao())}
        className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
      >
        {pending ? "Adicionando…" : "Completar com a sugestão"}
      </button>
    );
  }
  return (
    <Button variant="primary" disabled={pending} onClick={() => start(() => adicionarSugestao())}>
      <ListPlus />
      {pending ? "Adicionando…" : "Usar a sugestão"}
    </Button>
  );
}
