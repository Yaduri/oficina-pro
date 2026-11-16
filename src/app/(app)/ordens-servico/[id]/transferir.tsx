"use client";

import { useState, useTransition } from "react";
import { inputClass, type TipoEmpresa } from "@/components/ui";
import { cn } from "@/lib/utils";
import { transferirOS } from "../edicao";

/** Troca a empresa (CNPJ) da OS enquanto ela está aberta */
export function TransferirOS({ osId, empresaAtual, empresas }: { osId: string; empresaAtual: string; empresas: { id: string; nome: string; tipo: TipoEmpresa }[] }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Empresa da OS"
        value={empresaAtual}
        disabled={pending}
        onChange={(e) => {
          const destino = empresas.find((x) => x.id === e.target.value);
          if (!destino || !confirm(`Transferir a OS para ${destino.nome}? Os itens da empresa atual passam junto.`)) return;
          setErro(undefined);
          start(async () => {
            const r = await transferirOS(osId, destino.id);
            if (r?.erro) setErro(r.erro);
          });
        }}
        className={cn(inputClass, "h-8 w-auto cursor-pointer px-2 text-[13px]")}
      >
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </div>
  );
}
