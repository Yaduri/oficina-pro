"use client";

import { useState, useTransition } from "react";
import { Download, ShieldOff } from "lucide-react";
import { Button, Erro, buttonClass } from "@/components/ui";
import { anonimizarClienteAction } from "../actions";

export function AcoesLgpdCliente({
  clienteId,
  nome,
  temHistorico,
}: {
  clienteId: string;
  nome: string;
  temHistorico: boolean;
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  const [msg, setMsg] = useState<string>();

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-muted">
        Atenda solicitações do cliente previstas na LGPD: baixe uma cópia completa dos dados dele ou apague/anonimize seus dados pessoais.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={`/clientes/${clienteId}/lgpd`} className={buttonClass("secondary")}>
          <Download />
          Exportar dados do cliente (ZIP)
        </a>
        <Button
          type="button"
          variant="ghost"
          className="text-danger hover:bg-danger-soft"
          disabled={pending}
          onClick={() => {
            const texto = temHistorico
              ? `Anonimizar os dados pessoais de "${nome}" (LGPD)? Nome, CPF/CNPJ, telefone, e-mail, endereço e portal serão apagados; o histórico fiscal e das OS permanece anônimo por obrigação legal.`
              : `Apagar definitivamente "${nome}" e seus veículos a pedido (LGPD)? Esta ação não pode ser desfeita.`;
            if (!window.confirm(texto)) return;
            setErro(undefined);
            setMsg(undefined);
            start(async () => {
              const r = await anonimizarClienteAction(clienteId);
              if (r?.erro) setErro(r.erro);
              else if (r?.ok) setMsg("Dados pessoais anonimizados conforme a LGPD.");
            });
          }}
        >
          <ShieldOff />
          {pending ? "Processando…" : temHistorico ? "Anonimizar dados (LGPD)" : "Apagar dados (LGPD)"}
        </Button>
      </div>
      <Erro>{erro}</Erro>
      {msg && <p role="status" className="text-ok">{msg}</p>}
    </div>
  );
}
