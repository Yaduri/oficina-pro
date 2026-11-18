"use client";

import { useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui";
import type { AcaoState } from "./actions";

/** Botão que chama uma ação do servidor (já com os argumentos), com confirmação opcional */
export function BotaoAcao({
  acao,
  confirmar,
  children,
  variant = "secondary",
  className,
  rotulo,
}: {
  acao: () => Promise<AcaoState>;
  confirmar?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  /** aria-label, quando o texto visível não basta */
  rotulo?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={pending}
      aria-label={rotulo}
      aria-busy={pending || undefined}
      onClick={() => {
        if (confirmar && !confirm(confirmar)) return;
        start(async () => {
          const r = await acao();
          if (r?.erro) alert(r.erro);
        });
      }}
    >
      {children}
    </Button>
  );
}
