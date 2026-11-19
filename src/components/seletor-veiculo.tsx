"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button, Campo, Erro, Input, Placa, Select } from "@/components/ui";
import { formatPlaca, formatTelefone } from "@/lib/utils";
import { buscarPlaca, type ResultadoPlaca } from "@/app/(app)/ordens-servico/actions";

export type ClienteOpcao = { id: string; nome: string; telefone: string | null };

/**
 * Escolha do veículo pela placa: mostra o veículo já cadastrado ou os campos para cadastrar
 * um novo (com cliente existente ou novo). Gera os campos veiculoId / placa / marca / modelo /
 * clienteId / clienteNome / clienteTelefone lidos por prepararVeiculo() no servidor.
 */
export function SeletorVeiculo({
  clientes,
  inicial,
  onChange,
  inicialClienteId = "",
}: {
  clientes: ClienteOpcao[];
  inicial: ResultadoPlaca | null;
  onChange?: (r: ResultadoPlaca | null) => void;
  /** Cliente já escolhido para a placa nova (ao recuperar um rascunho) */
  inicialClienteId?: string;
}) {
  const [placa, setPlaca] = useState(inicial && inicial.status !== "invalida" ? inicial.placa : "");
  const [resultado, setResultadoState] = useState<ResultadoPlaca | null>(inicial);
  const [buscando, startBusca] = useTransition();
  const [clienteId, setClienteId] = useState(inicialClienteId);

  const setResultado = (r: ResultadoPlaca | null) => {
    setResultadoState(r);
    onChange?.(r);
  };
  const buscar = () => {
    if (!placa.trim()) return;
    startBusca(async () => setResultado(await buscarPlaca(placa)));
  };

  const encontrado = resultado?.status === "encontrada" ? resultado : null;
  const novo = resultado?.status === "nova";

  return (
    <>
        {encontrado ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-subtle p-3">
            <input type="hidden" name="veiculoId" value={encontrado.veiculo.id} />
            <Placa placa={encontrado.placa} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{[encontrado.veiculo.marca, encontrado.veiculo.modelo, encontrado.veiculo.ano].filter(Boolean).join(" ")}</p>
              <p className="text-[13px] text-muted">
                {encontrado.cliente
                  ? [encontrado.cliente.nome, formatTelefone(encontrado.cliente.telefone)].filter(Boolean).join(" · ")
                  : "Sem cliente vinculado"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setResultado(null);
                setPlaca("");
              }}
            >
              <X />Trocar
            </Button>
          </div>
        ) : (
          <>
            <input type="hidden" name="veiculoId" value="" />
            <Campo label="Placa" htmlFor="placa">
              <div className="flex gap-2">
                <Input
                  id="placa"
                  name="placa"
                  value={placa}
                  onChange={(e) => {
                    setPlaca(e.target.value);
                    if (resultado) setResultado(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      buscar();
                    }
                  }}
                  onBlur={() => !resultado && buscar()}
                  placeholder="ABC1D23"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={8}
                  className="max-w-48 uppercase tracking-wider"
                  autoFocus
                  required
                />
                <Button type="button" onClick={buscar} disabled={buscando}>
                  <Search />{buscando ? "Buscando…" : "Buscar"}
                </Button>
              </div>
            </Campo>
            {resultado?.status === "invalida" && <Erro>Placa inválida. Use o formato ABC1D23 ou ABC1234.</Erro>}

            {novo && (
              <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border-strong p-4">
                <p className="text-[13px] text-muted">
                  Placa <strong className="text-foreground">{formatPlaca(placa)}</strong> não cadastrada. Preencha os dados para cadastrar o veículo.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo label="Marca" htmlFor="marca">
                    <Input id="marca" name="marca" placeholder="Volkswagen" />
                  </Campo>
                  <Campo label="Modelo" htmlFor="modelo">
                    <Input id="modelo" name="modelo" placeholder="Gol 1.6" required />
                  </Campo>
                </div>
                <Campo label="Cliente" htmlFor="clienteId">
                  <Select id="clienteId" name="clienteId" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                    <option value="">+ Novo cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                        {c.telefone ? ` · ${formatTelefone(c.telefone)}` : ""}
                      </option>
                    ))}
                  </Select>
                </Campo>
                {clienteId === "" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo label="Nome do cliente" htmlFor="clienteNome">
                      <Input id="clienteNome" name="clienteNome" required autoComplete="off" />
                    </Campo>
                    <Campo label="WhatsApp / telefone" htmlFor="clienteTelefone">
                      <Input id="clienteTelefone" name="clienteTelefone" type="tel" inputMode="tel" placeholder="(11) 98765-4321" />
                    </Campo>
                  </div>
                )}
              </div>
            )}
          </>
        )}
    </>
  );
}
