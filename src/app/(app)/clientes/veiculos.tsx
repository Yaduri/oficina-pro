"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Wrench } from "lucide-react";
import { Button, Placa, buttonClass } from "@/components/ui";
import type { Veiculo } from "@/lib/cadastros";
import { VeiculoForm } from "./forms";

export function ListaVeiculos({ clienteId, veiculos }: { clienteId: string; veiculos: Veiculo[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [novo, setNovo] = useState(veiculos.length === 0);

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
                <Placa placa={v.placa} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{[v.marca, v.modelo].filter(Boolean).join(" ")}</p>
                  <p className="text-[13px] text-muted">
                    {[v.ano, v.cor, v.km != null ? `${v.km.toLocaleString("pt-BR")} km` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" className="px-2.5" onClick={() => setEditando(v.id)} aria-label={`Editar veículo ${v.placa}`}>
                    <Pencil />
                  </Button>
                  <Link href={`/ordens-servico/nova?veiculo=${v.id}`} className={buttonClass("secondary")}>
                    <Wrench />Abrir OS
                  </Link>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
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
    </div>
  );
}
