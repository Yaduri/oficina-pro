"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Placa, buttonClass } from "@/components/ui";
import { BotaoWhatsApp } from "@/components/botao-whatsapp";
import { MODELO_POR_TIPO, type PendenciaMensagem } from "@/lib/mensagens";
import { cn } from "@/lib/utils";
import { dispensarMensagem } from "./actions";

export type ItemFila = PendenciaMensagem & { placa: string | null; veiculo: string };

/** Um item da fila: quem, por quê, o texto e as ações (enviar, abrir, dispensar) */
export function ItemFilaMensagem({ p }: { p: ItemFila }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  const semConsentimento = !!MODELO_POR_TIPO[p.tipo]?.marketing && !p.aceitaWhatsapp;
  const registro = { tipo: p.tipo, clienteId: p.clienteId, ...p.refs };

  function dispensar() {
    if (!confirm("Tirar da fila sem enviar?")) return;
    setErro(undefined);
    start(async () => {
      const r = await dispensarMensagem(registro);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <li className={cn("flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5", pending && "opacity-60")}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {p.placa && <Placa placa={p.placa} />}
          <span className="font-medium">{p.clienteNome ?? "Sem cliente"}</span>
          {p.veiculo && <span className="text-[13px] text-muted">{p.veiculo}</span>}
        </div>
        <p className="text-[13px]">
          {p.titulo}
          {p.detalhe && <span className="text-muted"> · {p.detalhe}</span>}
        </p>
        {(semConsentimento || !p.telefone) && (
          <div className="flex flex-wrap gap-1.5">
            {semConsentimento && <Badge tom="warn">Sem consentimento</Badge>}
            {!p.telefone && <Badge>Sem telefone</Badge>}
          </div>
        )}
        <p className="line-clamp-2 text-[13px] text-foreground-2" title={p.texto}>
          {p.texto}
        </p>
        {erro && <p className="text-[13px] text-danger">{erro}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <BotaoWhatsApp
          telefone={p.telefone}
          texto={p.texto}
          registro={registro}
          variant="primary"
          label="Enviar"
          confirmar={semConsentimento ? "Este cliente não autorizou mensagens de relacionamento. Enviar mesmo assim?" : undefined}
        />
        {p.href && (
          <Link href={p.href} className={buttonClass("secondary")}>
            Abrir
          </Link>
        )}
        <button type="button" onClick={dispensar} disabled={pending} className={buttonClass("ghost", "text-[13px] text-muted")}>
          Dispensar
        </button>
      </div>
    </li>
  );
}
