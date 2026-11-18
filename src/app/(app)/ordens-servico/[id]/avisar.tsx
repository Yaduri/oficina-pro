"use client";

import { useTransition } from "react";
import { BellRing, Check } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { marcarClienteAvisado } from "../edicao";

/**
 * "Avisar cliente": abre o WhatsApp com a mensagem de veículo pronto e registra o aviso
 * (o quadro e o Início passam a mostrar "cliente avisado").
 */
export function AvisarCliente({ osId, whatsapp, avisadoEm }: { osId: string; whatsapp: string; avisadoEm: string | null }) {
  const [pending, start] = useTransition();
  return (
    <a
      href={whatsapp}
      target="_blank"
      rel="noreferrer"
      onClick={() => start(() => marcarClienteAvisado(osId).then(() => undefined))}
      className={buttonClass(avisadoEm ? "secondary" : "primary", pending ? "opacity-70" : undefined)}
      title={avisadoEm ? `Cliente avisado em ${avisadoEm}` : undefined}
    >
      {avisadoEm ? <Check /> : <BellRing />}
      {avisadoEm ? "Avisar de novo" : "Avisar cliente"}
    </a>
  );
}
