"use client";

import { useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { linkMensagem, type TipoMensagem } from "@/lib/mensagens";
import { cn } from "@/lib/utils";
import { registrarMensagem } from "@/app/(app)/mensagens/actions";

export type RegistroWhatsApp = {
  tipo: TipoMensagem;
  clienteId?: string | null;
  veiculoId?: string | null;
  osId?: string | null;
  agendamentoId?: string | null;
  /** Lembrete de revisão, conta a receber, orçamento ou check-in, conforme o tipo */
  refId?: string | null;
};

/**
 * Abre o WhatsApp (wa.me) com o texto pronto em nova aba e registra a mensagem em paralelo.
 * Sem telefone válido, o WhatsApp abre para a pessoa escolher o contato.
 *
 * `variant="none"` não aplica o estilo de botão (para itens de menu: use `className`).
 * `confirmar`: pergunta antes de abrir (ex.: cliente sem consentimento para mensagens).
 */
export function BotaoWhatsApp({
  telefone,
  texto,
  registro,
  label,
  children,
  variant = "secondary",
  className,
  confirmar,
  onRegistrado,
  ...props
}: {
  telefone: string | null;
  texto: string;
  registro: RegistroWhatsApp;
  label?: ReactNode;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "none";
  className?: string;
  confirmar?: string;
  onRegistrado?: () => void;
} & Omit<ComponentProps<"a">, "href" | "onClick" | "children" | "target">) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();

  return (
    <a
      {...props}
      href={linkMensagem(telefone, texto)}
      target="_blank"
      rel="noreferrer"
      aria-busy={pending || undefined}
      title={erro ? `Não foi possível registrar: ${erro}` : props.title}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) {
          e.preventDefault();
          return;
        }
        setErro(undefined);
        start(async () => {
          const r = await registrarMensagem({ ...registro, telefone, texto });
          if (r.erro) setErro(r.erro);
          else onRegistrado?.();
        });
      }}
      className={variant === "none" ? cn(pending && "opacity-70", className) : buttonClass(variant, cn(pending && "opacity-70", className))}
    >
      {children ?? (
        <>
          <MessageCircle />
          {label ?? "WhatsApp"}
        </>
      )}
    </a>
  );
}
