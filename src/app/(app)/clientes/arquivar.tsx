"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { arquivarCliente, arquivarVeiculo, excluirCliente, excluirVeiculo, type Simples } from "./actions";

/**
 * Botões de arquivar/reativar e excluir de um cliente ou veículo.
 * Excluir só apaga de verdade o que nunca teve OS nem check-in; o resto é arquivado.
 */
export function AcoesArquivo({
  tipo,
  id,
  arquivado,
  temHistorico,
  rotulo,
  depoisDeExcluir,
}: {
  tipo: "cliente" | "veiculo";
  id: string;
  arquivado: boolean;
  /** Tem OS ou check-in: não pode ser excluído, só arquivado */
  temHistorico: boolean;
  /** Nome mostrado nas confirmações */
  rotulo: string;
  /** Para onde ir depois de excluir um veículo (cliente já redireciona sozinho) */
  depoisDeExcluir?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  const nome = tipo === "cliente" ? "cliente" : "veículo";

  function rodar(fn: () => Promise<Simples>, excluindo = false) {
    setErro(undefined);
    start(async () => {
      const r = await fn();
      if (r?.erro) return setErro(r.erro);
      if (excluindo && depoisDeExcluir && !r.arquivado) router.push(depoisDeExcluir);
    });
  }

  const arquivar = () =>
    rodar(() => (tipo === "cliente" ? arquivarCliente(id, !arquivado) : arquivarVeiculo(id, !arquivado)));

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-2">
        {arquivado ? (
          <Button variant="secondary" disabled={pending} onClick={arquivar}>
            <ArchiveRestore />
            Reativar {nome}
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  `Arquivar ${rotulo}? Some das listas e das buscas da Nova OS, mas o histórico continua. Dá para reativar depois.`,
                )
              )
                arquivar();
            }}
          >
            <Archive />
            Arquivar
          </Button>
        )}
        {!temHistorico && (
          <Button
            variant="ghost"
            className="text-danger hover:text-danger"
            disabled={pending}
            onClick={() => {
              const extra = tipo === "cliente" ? " Os veículos dele também serão excluídos." : "";
              if (confirm(`Excluir ${rotulo} definitivamente?${extra} Isso não pode ser desfeito.`)) {
                rodar(() => (tipo === "cliente" ? excluirCliente(id) : excluirVeiculo(id)), true);
              }
            }}
          >
            <Trash2 />
            Excluir
          </Button>
        )}
      </div>
      {temHistorico && !arquivado && (
        <p className="text-[12px] text-muted">Tem OS ou check-in registrados, por isso só pode ser arquivado.</p>
      )}
      {erro && <p className="text-[13px] text-danger">{erro}</p>}
    </div>
  );
}
