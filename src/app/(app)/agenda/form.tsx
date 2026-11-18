"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Campo, Erro, Input, Select, Textarea } from "@/components/ui";
import { SeletorVeiculo, type ClienteOpcao } from "@/components/seletor-veiculo";
import { BuscaCatalogo, type OpcaoCatalogo } from "@/components/busca-catalogo";
import { useFormAction } from "@/lib/use-form-action";
import { formatDuracao } from "@/lib/agenda-datas";
import type { ResultadoPlaca } from "@/app/(app)/ordens-servico/actions";
import { salvarAgendamento } from "./actions";

const DURACOES = [30, 45, 60, 90, 120, 180, 240, 300, 480];

export type ValoresAgendamento = {
  dia: string;
  hora: string;
  duracao: number;
  titulo: string;
  detalhe: string;
  tecnicoId: string;
};

export function FormAgendamento({
  id,
  valores,
  inicial,
  clientes,
  tecnicos,
  catalogo,
}: {
  /** Nulo = novo agendamento */
  id: string | null;
  valores: ValoresAgendamento;
  inicial: ResultadoPlaca | null;
  clientes: ClienteOpcao[];
  tecnicos: { id: string; nome: string }[];
  catalogo: OpcaoCatalogo[];
}) {
  const { state, pending, onSubmit } = useFormAction(salvarAgendamento.bind(null, id));
  const [titulo, setTitulo] = useState(valores.titulo);
  const [duracao, setDuracao] = useState(valores.duracao);
  const duracoes = DURACOES.includes(duracao) ? DURACOES : [...DURACOES, duracao].sort((a, b) => a - b);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Veículo</h2>
        <SeletorVeiculo clientes={clientes} inicial={inicial} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold">Serviço e horário</h2>
        <Campo label="O que vai ser feito" htmlFor="ag-titulo">
          {catalogo.length > 0 ? (
            <BuscaCatalogo
              name="titulo"
              catalogo={catalogo}
              value={titulo}
              onChange={setTitulo}
              onEscolher={(c) => {
                setTitulo(c.descricao);
                if (c.tempoMinutos) setDuracao(c.tempoMinutos);
              }}
              placeholder="Ex.: revisão 40 mil km, ou buscar no catálogo"
            />
          ) : (
            <Input id="ag-titulo" name="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ex.: revisão 40 mil km" />
          )}
        </Campo>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Campo label="Data" htmlFor="ag-dia">
            <Input id="ag-dia" name="dia" type="date" defaultValue={valores.dia} required />
          </Campo>
          <Campo label="Horário" htmlFor="ag-hora">
            <Input id="ag-hora" name="hora" type="time" step={900} defaultValue={valores.hora} required />
          </Campo>
          <Campo label="Duração" htmlFor="ag-duracao" className="col-span-2 sm:col-span-1">
            <Select id="ag-duracao" name="duracao" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
              {duracoes.map((m) => (
                <option key={m} value={m}>
                  {formatDuracao(m)}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Técnico" hint="(opcional)" htmlFor="ag-tecnico">
            <Select id="ag-tecnico" name="tecnicoId" defaultValue={valores.tecnicoId}>
              <option value="">Sem técnico definido</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        <Campo label="Observações" hint="(opcional)" htmlFor="ag-detalhe">
          <Textarea id="ag-detalhe" name="detalhe" rows={2} className="min-h-16" defaultValue={valores.detalhe} placeholder="Ex.: cliente vai esperar na oficina" />
        </Campo>
      </section>

      {state?.conflito && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-warn/30 bg-warn-soft p-4 text-[14px]">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {state.conflito} <span className="text-foreground-2">Escolha outro horário ou salve assim mesmo.</span>
            </span>
          </p>
          <div>
            <Button type="submit" name="ignorarConflito" value="1" disabled={pending}>
              Salvar mesmo assim
            </Button>
          </div>
        </div>
      )}
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2.5">
        <Button variant="primary" disabled={pending}>
          {pending ? "Salvando…" : id ? "Salvar alterações" : "Agendar"}
        </Button>
      </div>
    </form>
  );
}
