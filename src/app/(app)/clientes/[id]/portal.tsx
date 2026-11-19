"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, UserRound } from "lucide-react";
import { Button, Erro, Input } from "@/components/ui";
import { BotaoWhatsApp } from "@/components/botao-whatsapp";
import { linkPortal } from "./portal-actions";

/** Portal do cliente: gera o link na primeira vez e oferece copiar ou mandar pelo WhatsApp */
export function PortalCliente({ clienteId, telefone }: { clienteId: string; telefone: string | null }) {
  const [link, setLink] = useState<{ url: string; texto: string } | null>(null);
  const [erro, setErro] = useState<string>();
  const [copiado, setCopiado] = useState(false);
  const [pending, start] = useTransition();

  if (!link) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErro(undefined);
              const r = await linkPortal(clienteId);
              if ("erro" in r) setErro(r.erro);
              else setLink(r);
            })
          }
          className="w-fit"
        >
          <UserRound />
          {pending ? "Gerando link…" : "Portal do cliente"}
        </Button>
        <Erro>{erro}</Erro>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input value={link.url} readOnly aria-label="Link do portal do cliente" onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link.url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              setErro("Não foi possível copiar. Selecione o link e copie.");
            }
          }}
        >
          {copiado ? <Check /> : <Copy />}
          {copiado ? "Copiado" : "Copiar link"}
        </Button>
        <BotaoWhatsApp telefone={telefone} texto={link.texto} registro={{ tipo: "portal", clienteId }} label="Enviar pelo WhatsApp" />
        <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 px-2 text-[13px] text-muted hover:text-foreground">
          <ExternalLink className="size-4" aria-hidden />
          Abrir
        </a>
      </div>
      <Erro>{erro}</Erro>
    </div>
  );
}
