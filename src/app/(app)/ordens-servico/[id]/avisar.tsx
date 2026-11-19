"use client";

import { BellRing, Check } from "lucide-react";
import { BotaoWhatsApp } from "@/components/botao-whatsapp";

/**
 * "Avisar cliente": abre o WhatsApp com o modelo "Veículo pronto" e registra a mensagem
 * (a OS fica como "cliente avisado" no quadro e no Início).
 */
export function AvisarCliente({
  osId,
  telefone,
  texto,
  avisadoEm,
}: {
  osId: string;
  telefone: string | null;
  texto: string;
  avisadoEm: string | null;
}) {
  return (
    <BotaoWhatsApp
      telefone={telefone}
      texto={texto}
      registro={{ tipo: "pronto", osId }}
      variant={avisadoEm ? "secondary" : "primary"}
      title={avisadoEm ? `Cliente avisado em ${avisadoEm}` : undefined}
    >
      {avisadoEm ? <Check /> : <BellRing />}
      {avisadoEm ? "Avisar de novo" : "Avisar cliente"}
    </BotaoWhatsApp>
  );
}
