"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, Pencil, Plus, Wrench } from "lucide-react";
import { Button, Placa, buttonClass } from "@/components/ui";
import type { Veiculo } from "@/lib/cadastros";
import { VeiculoForm } from "./forms";

export function ListaVeiculos({
  clienteId,
  veiculos,
  arquivados = [],
  editavel = true,
  abrirOS = true,
}: {
  clienteId: string;
  veiculos: Veiculo[];
  arquivados?: Veiculo[];
  editavel?: boolean;
  abrirOS?: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [novo, setNovo] = useState(editavel && veiculos.length === 0);

  return (
    <div className="flex flex-col">
      {veiculos.length === 0 && !novo && <p className="px-5 py-6 text-[13px] text-muted">Nenhum veículo cadastrado.</p>}
      <ul className="divide-y divide-border">
        {veiculos.map((v) => (
          <li key={v.id} className="px-4 py-3 sm:px-5">
            {editando === v.id ? (
              <div className="py-2">
                <VeiculoForm clienteId={clienteId} veiculo={v} onDone={() => setEditando(null)} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/veiculos/${v.id}`} className="group flex min-w-0 flex-1 items-center gap-3" title="Ver histórico do veículo">
                  <Placa placa={v.placa} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium group-hover:underline">{[v.marca, v.modelo].filter(Boolean).join(" ")}</p>
                    <p className="text-[13px] text-muted">
                      {[v.ano, v.cor, v.km != null ? `${v.km.toLocaleString("pt-BR")} km` : null].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </Link>
                <div className="flex gap-1.5">
                  {editavel && (
                    <Button variant="ghost" className="px-2.5" onClick={() => setEditando(v.id)} aria-label={`Editar veículo ${v.placa}`}>
                      <Pencil />
                    </Button>
                  )}
                  <Link href={`/check-in/novo?veiculo=${v.id}`} className={buttonClass("ghost", "px-2.5")} aria-label={`Check-in do veículo ${v.placa}`} title="Check-in">
                    <Camera />
                  </Link>
                  {abrirOS && (
                    <Link href={`/ordens-servico/nova?veiculo=${v.id}`} className={buttonClass("secondary")}>
                      <Wrench />Abrir OS
                    </Link>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {arquivados.length > 0 && (
        <details className="border-t border-border px-4 py-3 sm:px-5">
          <summary className="cursor-pointer select-none text-[13px] text-muted hover:text-foreground">
            {arquivados.length} {arquivados.length === 1 ? "veículo arquivado" : "veículos arquivados"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {arquivados.map((v) => (
              <li key={v.id}>
                <Link href={`/veiculos/${v.id}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-foreground-2 hover:bg-subtle">
                  <Placa placa={v.placa} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{[v.marca, v.modelo].filter(Boolean).join(" ")}</span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      {editavel && (
      <div className="border-t border-border px-4 py-3 sm:px-5">
        {novo ? (
          <div className="py-2">
            <h3 className="mb-3 text-[13px] font-semibold">Novo veículo</h3>
            <VeiculoForm clienteId={clienteId} onDone={veiculos.length > 0 ? () => setNovo(false) : undefined} />
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setNovo(true)}>
            <Plus />Adicionar veículo
          </Button>
        )}
      </div>
      )}
    </div>
  );
}
