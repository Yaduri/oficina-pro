"use client";

import { useState, useTransition } from "react";
import { Ban, Check, Copy, Mail, RefreshCw, Replace, Send } from "lucide-react";
import { BotaoWhatsApp } from "@/components/botao-whatsapp";
import { Button, Campo, Erro, Input, Select, buttonClass } from "@/components/ui";
import { MOTIVOS_CANCELAMENTO_NFSE } from "@/lib/fiscal/tipos";
import type { StatusNotaFiscal } from "@/db/schema";
import { useFormAction } from "@/lib/use-form-action";
import { cancelarNotaAction, consultarNotaAction, reenviarNotaAction, type NotaActionState } from "../actions";
import { EmitirNfseForm, type DadosIniciaisNfse } from "../emitir-form";

export function CopiarChave({ chave }: { chave: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 px-2 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(chave);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? <Check /> : <Copy />}
      {copiado ? "Copiada" : "Copiar chave"}
    </Button>
  );
}

export function AcoesNota({
  notaId,
  osId,
  clienteId,
  status,
  chaveAcesso,
  podeEmitir,
  podeMensagens,
  tomadorTelefone,
  tomadorEmail,
  textoWhatsapp,
  assuntoEmail,
  corpoEmail,
  dadosSubstituicao,
}: {
  notaId: string;
  osId: string | null;
  clienteId: string | null;
  status: StatusNotaFiscal;
  chaveAcesso: string | null;
  podeEmitir: boolean;
  podeMensagens: boolean;
  tomadorTelefone: string | null;
  tomadorEmail: string | null;
  textoWhatsapp: string;
  assuntoEmail: string;
  corpoEmail: string;
  dadosSubstituicao: DadosIniciaisNfse | null;
}) {
  const [modo, setModo] = useState<"nenhum" | "cancelar" | "substituir">("nenhum");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, start] = useTransition();

  const cancelarForm = useFormAction(async (prev: NotaActionState, data: FormData) => {
    const r = await cancelarNotaAction(notaId, osId, prev, data);
    if (r?.ok) setModo("nenhum");
    return r;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "autorizada" && podeMensagens && (
          <BotaoWhatsApp
            variant="primary"
            telefone={tomadorTelefone}
            texto={textoWhatsapp}
            label="Enviar por WhatsApp"
            registro={{ tipo: "nota_fiscal", clienteId, osId, refId: notaId }}
          />
        )}

        {status === "autorizada" && (
          <a
            href={`mailto:${encodeURIComponent(tomadorEmail ?? "")}?subject=${encodeURIComponent(assuntoEmail)}&body=${encodeURIComponent(corpoEmail)}`}
            className={buttonClass("secondary")}
          >
            <Mail />
            Enviar por e-mail
          </a>
        )}

        {podeEmitir && (status === "fila" || status === "rejeitada") && (
          <Button
            type="button"
            variant="primary"
            disabled={pending}
            onClick={() => {
              setMsg(null);
              start(async () => {
                const r = await reenviarNotaAction(notaId, osId);
                if (r?.ok) setMsg({ tipo: "ok", texto: r.mensagem ?? "Transmitida." });
                else if (r?.erro) setMsg({ tipo: "erro", texto: r.erro });
              });
            }}
          >
            <Send />
            {pending ? "Transmitindo…" : "Tentar transmitir novamente"}
          </Button>
        )}

        {podeEmitir && chaveAcesso && (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setMsg(null);
              start(async () => {
                const r = await consultarNotaAction(notaId, osId);
                if (r?.ok) setMsg({ tipo: "ok", texto: r.mensagem ?? "Sincronizado." });
                else if (r?.erro) setMsg({ tipo: "erro", texto: r.erro });
              });
            }}
          >
            <RefreshCw className={pending ? "animate-spin" : ""} />
            Consultar SEFIN
          </Button>
        )}

        {podeEmitir && status === "autorizada" && dadosSubstituicao && (
          <Button type="button" onClick={() => setModo(modo === "substituir" ? "nenhum" : "substituir")}>
            <Replace />
            Substituir NFS-e
          </Button>
        )}

        {podeEmitir && status === "autorizada" && (
          <Button type="button" variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setModo(modo === "cancelar" ? "nenhum" : "cancelar")}>
            <Ban />
            Cancelar NFS-e
          </Button>
        )}
      </div>

      {msg && (
        <p className={msg.tipo === "erro" ? "text-[13px] text-danger" : "text-[13px] text-ok"}>
          {msg.texto}
        </p>
      )}

      {modo === "cancelar" && (
        <form onSubmit={cancelarForm.onSubmit} className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger-soft/30 p-4">
          <p className="text-[14px] font-semibold text-danger">Cancelar NFS-e na SEFIN Nacional (Evento e101101)</p>
          <p className="text-[13px] text-foreground-2">
            Esta ação registra o cancelamento junto à NFS-e Nacional e não pode ser desfeita.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Código do motivo" htmlFor="canc-cod">
              <Select id="canc-cod" name="codigoMotivo" defaultValue="1" required>
                {MOTIVOS_CANCELAMENTO_NFSE.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Justificativa" hint="(mínimo 15 caracteres)" htmlFor="canc-mot">
              <Input id="canc-mot" name="motivo" required minLength={15} maxLength={255} placeholder="Ex.: Erro nos dados do tomador na emissão" />
            </Campo>
          </div>
          <Erro>{cancelarForm.state?.erro}</Erro>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModo("nenhum")}>
              Voltar
            </Button>
            <Button type="submit" variant="primary" disabled={cancelarForm.pending} className="bg-danger hover:bg-danger/90">
              {cancelarForm.pending ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </div>
        </form>
      )}

      {modo === "substituir" && dadosSubstituicao && (
        <div className="rounded-lg border border-border bg-card p-5">
          <EmitirNfseForm inicial={dadosSubstituicao} onCancelar={() => setModo("nenhum")} />
        </div>
      )}
    </div>
  );
}
