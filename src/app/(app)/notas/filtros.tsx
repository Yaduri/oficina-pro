"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RefreshCw, Search } from "lucide-react";
import { Button, Input, Select, buttonClass } from "@/components/ui";
import { processarFilaAction } from "./actions";

export function FiltrosNotas({
  mes,
  status,
  busca,
  qtdFila,
  podeEmitir,
}: {
  mes: string;
  status: string;
  busca: string;
  qtdFila: number;
  podeEmitir: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(busca);
  const [msgFila, setMsgFila] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function navegar(prox: { mes?: string; status?: string; busca?: string }) {
    const p = new URLSearchParams();
    const m = prox.mes ?? mes;
    const s = prox.status ?? status;
    const b = prox.busca ?? q;
    if (m) p.set("mes", m);
    if (s) p.set("status", s);
    if (b.trim()) p.set("busca", b.trim());
    const qs = p.toString();
    router.push(qs ? `/notas?${qs}` : "/notas");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          type="month"
          aria-label="Competência"
          value={mes}
          onChange={(e) => navegar({ mes: e.target.value })}
          className="w-44"
        />
        <Select
          aria-label="Situação"
          value={status}
          onChange={(e) => navegar({ status: e.target.value })}
          className="w-40"
        >
          <option value="">Todas situações</option>
          <option value="autorizada">Autorizadas</option>
          <option value="fila">Na fila</option>
          <option value="rejeitada">Rejeitadas</option>
          <option value="cancelada">Canceladas</option>
          <option value="substituida">Substituídas</option>
        </Select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navegar({ busca: q });
          }}
          className="relative min-w-[200px] flex-1"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente, CPF/CNPJ, nº nota, OS ou placa"
            aria-label="Buscar notas"
            className="pl-9"
          />
        </form>
        <a
          href={`/notas/exportar?mes=${encodeURIComponent(mes)}`}
          className={buttonClass("secondary")}
          title="Baixar ZIP com XMLs, DANFSe em PDF e relatório CSV do mês"
        >
          <Archive />
          Exportar contador (ZIP)
        </a>
        {podeEmitir && qtdFila > 0 && (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setMsgFila(null);
              start(async () => {
                const r = await processarFilaAction();
                setMsgFila(r?.mensagem ?? r?.erro ?? null);
              });
            }}
          >
            <RefreshCw className={pending ? "animate-spin" : ""} />
            Processar fila ({qtdFila})
          </Button>
        )}
      </div>
      {msgFila && <p className="text-[13px] text-foreground-2">{msgFila}</p>}
    </div>
  );
}
