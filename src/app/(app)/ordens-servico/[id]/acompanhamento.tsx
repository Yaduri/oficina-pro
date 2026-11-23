"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button, Card, CardHeader, Erro } from "@/components/ui";
import { BotaoWhatsApp } from "@/components/botao-whatsapp";

/**
 * Link de acompanhamento da OS: o cliente aprova o orçamento, vê o andamento, as fotos marcadas
 * "Mostrar ao cliente" e, depois da entrega, os documentos. Um link por OS, que não expira.
 */
export function AcompanhamentoOS({
  osId,
  url,
  telefone,
  texto,
  podeEnviar,
  fotosVisiveis,
}: {
  osId: string;
  url: string;
  telefone: string | null;
  texto: string;
  podeEnviar: boolean;
  fotosVisiveis: number;
}) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string>();

  return (
    <Card>
      <CardHeader title="Link de acompanhamento" />
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-[13px] text-muted">
          O cliente aprova o orçamento e acompanha o serviço por este link.
          {fotosVisiveis > 0
            ? ` ${fotosVisiveis} ${fotosVisiveis === 1 ? "foto aparece" : "fotos aparecem"} para ele.`
            : " Nenhuma foto do serviço aparece para ele ainda."}
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-subtle px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground-2" title={url}>
            {url}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeEnviar && (
            <BotaoWhatsApp telefone={telefone} texto={texto} registro={{ tipo: "acompanhamento", osId }} label="Enviar no WhatsApp" />
          )}
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setErro(undefined);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              } catch {
                setErro("Não foi possível copiar. Selecione o link e copie.");
              }
            }}
          >
            {copiado ? <Check /> : <Copy />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 px-2 text-[13px] text-muted hover:text-foreground"
            title="Abrir a página do cliente"
          >
            <ExternalLink className="size-4" aria-hidden />
            Abrir
          </a>
        </div>
        <Erro>{erro}</Erro>
      </div>
    </Card>
  );
}
