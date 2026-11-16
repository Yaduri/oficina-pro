"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

/** Imprimir / salvar o orçamento em PDF pelo navegador */
export function Imprimir() {
  return (
    <Button type="button" variant="ghost" className="print:hidden" onClick={() => window.print()}>
      <Printer />
      Salvar PDF
    </Button>
  );
}
