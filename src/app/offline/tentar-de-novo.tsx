"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui";

/** Recarrega o endereço atual (o SW serve /offline no lugar da tela que falhou) */
export function TentarDeNovo() {
  return (
    <Button variant="primary" onClick={() => window.location.reload()}>
      <RotateCw /> Tentar de novo
    </Button>
  );
}
