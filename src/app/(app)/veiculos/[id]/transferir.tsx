"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button, Campo, Erro, Input } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatTelefone, soDigitos } from "@/lib/utils";
import { transferirVeiculo } from "../../clientes/actions";

type Opcao = { id: string; nome: string; telefone: string | null };

/** Passa o veículo para outro dono (cliente existente ou novo) */
export function TransferirVeiculo({ veiculoId, donoAtual, clientes }: { veiculoId: string; donoAtual: string | null; clientes: Opcao[] }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<Opcao | null>(null);
  const [novo, setNovo] = useState(false);
  const { state, pending, onSubmit } = useFormAction(transferirVeiculo.bind(null, veiculoId));

  const achados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    const dig = soDigitos(q);
    return clientes
      .filter((c) => c.id !== donoAtual && (c.nome.toLowerCase().includes(q) || (dig.length >= 3 && c.telefone?.includes(dig))))
      .slice(0, 8);
  }, [busca, clientes, donoAtual]);

  if (!aberto) {
    return (
      <Button variant="secondary" onClick={() => setAberto(true)}>
        <ArrowRightLeft />
        Transferir para outro dono
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-md border border-border bg-subtle/60 p-4">
      <p className="text-[13px] text-foreground-2">
        As OS antigas continuam no nome do dono anterior.
      </p>
      {escolhido ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
          <span>
            <span className="font-medium">{escolhido.nome}</span>
            {escolhido.telefone && <span className="text-[13px] text-muted"> · {formatTelefone(escolhido.telefone)}</span>}
          </span>
          <Button type="button" variant="ghost" onClick={() => setEscolhido(null)}>
            Trocar
          </Button>
          <input type="hidden" name="clienteId" value={escolhido.id} />
        </div>
      ) : novo ? (
        <div key="novo" className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome do novo dono" htmlFor="tv-nome">
            <Input id="tv-nome" name="novoNome" required autoFocus autoComplete="off" />
          </Campo>
          <Campo label="WhatsApp / telefone" htmlFor="tv-tel">
            <Input id="tv-tel" name="novoTelefone" type="tel" inputMode="tel" placeholder="(11) 98765-4321" />
          </Campo>
          <button type="button" className="w-fit text-[13px] text-muted underline sm:col-span-2" onClick={() => setNovo(false)}>
            Escolher um cliente já cadastrado
          </button>
        </div>
      ) : (
        <div key="busca" className="flex flex-col gap-2">
          <Campo label="Novo dono" htmlFor="tv-busca">
            <Input
              id="tv-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente por nome ou telefone"
              autoFocus
              autoComplete="off"
            />
          </Campo>
          {achados.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
              {achados.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setEscolhido(c)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-subtle">
                    <span className="font-medium">{c.nome}</span>
                    <span className="text-[13px] text-muted">{formatTelefone(c.telefone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {busca.trim().length >= 2 && achados.length === 0 && <p className="text-[13px] text-muted">Nenhum cliente encontrado.</p>}
          <button type="button" className="w-fit text-[13px] text-muted underline" onClick={() => setNovo(true)}>
            O novo dono ainda não é cliente
          </button>
        </div>
      )}
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setAberto(false);
            setEscolhido(null);
            setNovo(false);
            setBusca("");
          }}
        >
          Cancelar
        </Button>
        <Button variant="primary" disabled={pending || (!escolhido && !novo)} className={cn(pending && "opacity-70")}>
          {pending ? "Transferindo…" : "Confirmar transferência"}
        </Button>
      </div>
    </form>
  );
}
