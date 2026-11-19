"use client";

import { MessageCircle } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { registrarAvisoOficina } from "./actions";

/** Depois de responder: abre o WhatsApp da oficina com o modelo "Orçamento respondido" */
export function AvisarOficina({ token, href }: { token: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => void registrarAvisoOficina(token).catch(() => undefined)}
      className={buttonClass("primary", "self-start print:hidden")}
    >
      <MessageCircle />
      Avisar a oficina pelo WhatsApp
    </a>
  );
}
