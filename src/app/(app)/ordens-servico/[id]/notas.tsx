"use client";

import { useState } from "react";
import Link from "next/link";
import { FileCode2, FileText, Receipt } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { STATUS_NOTA_LABEL } from "@/lib/fiscal/tipos";
import type { StatusNotaFiscal } from "@/db/schema";
import { formatBRL } from "@/lib/utils";
import { EmitirNfseForm, type DadosIniciaisNfse } from "@/app/(app)/notas/emitir-form";

export type ResumoNotaOS = {
  id: string;
  numeroNota: string | null;
  numeroDps: number;
  status: StatusNotaFiscal;
  ambiente: "homologacao" | "producao";
  valorLiquido: number;
  temXml: boolean;
  ultimaMensagem: string | null;
};

export function NotasOS({
  osId,
  notas,
  podeEmitir,
  dadosEmissao,
}: {
  osId: string;
  notas: ResumoNotaOS[];
  podeEmitir: boolean;
  dadosEmissao: DadosIniciaisNfse | null;
}) {
  const [emitindo, setEmitindo] = useState(false);
  const temAutorizada = notas.some((n) => n.status === "autorizada");

  return (
    <Card>
      <CardHeader
        title="Nota fiscal (NFS-e)"
        action={
          podeEmitir && !emitindo && dadosEmissao ? (
            <Button type="button" variant={temAutorizada ? "secondary" : "primary"} onClick={() => setEmitindo(true)}>
              <Receipt />
              {temAutorizada ? "Emitir outra NFS-e" : "Emitir NFS-e"}
            </Button>
          ) : null
        }
      />

      {emitindo && dadosEmissao && (
        <div className="border-b border-border bg-subtle/40 px-5 py-4">
          <EmitirNfseForm
            inicial={dadosEmissao}
            redirecionar={false}
            onSucesso={() => setEmitindo(false)}
            onCancelar={() => setEmitindo(false)}
          />
        </div>
      )}

      {notas.length === 0 && !emitindo ? (
        <div className="px-5 py-4 text-[13px] text-muted">
          {dadosEmissao && dadosEmissao.valorServicos <= 0 ? (
            <p>Esta OS não tem itens de serviço (apenas peças) para emissão de NFS-e.</p>
          ) : (
            <p>
              Nenhuma nota fiscal emitida para esta OS.{" "}
              {podeEmitir && (
                <Link href={`/notas/nova?osId=${osId}`} className="font-medium text-foreground underline underline-offset-4">
                  Abrir tela de emissão
                </Link>
              )}
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {notas.map((n) => {
            const st = STATUS_NOTA_LABEL[n.status];
            return (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/notas/${n.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {n.numeroNota ? `NFS-e nº ${n.numeroNota}` : `DPS #${n.numeroDps}`}
                    </Link>
                    <Badge tom={st.tom}>{st.label}</Badge>
                    {n.ambiente === "homologacao" && <Badge tom="warn">Homologação</Badge>}
                  </div>
                  {n.ultimaMensagem && n.status !== "autorizada" && (
                    <p className="mt-0.5 truncate text-xs text-danger">{n.ultimaMensagem}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatBRL(n.valorLiquido)}</span>
                  <a
                    href={`/notas/${n.id}/danfse`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-subtle"
                  >
                    <FileText className="size-3.5" aria-hidden />
                    PDF
                  </a>
                  {n.temXml && (
                    <a
                      href={`/notas/${n.id}/xml`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-subtle"
                    >
                      <FileCode2 className="size-3.5" aria-hidden />
                      XML
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
