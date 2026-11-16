"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

/** Impressão / salvar como PDF pelo navegador (termo de entrada) */
export function Imprimir() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer />Imprimir termo
    </Button>
  );
}
