"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Campo, Erro, Input, Textarea, inputClass } from "@/components/ui";
import { SeletorVeiculo } from "@/components/seletor-veiculo";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatBRL, parseValor } from "@/lib/utils";
import { criarOS, type ResultadoPlaca } from "../actions";

type Item = { chave: number; tipo: "peca" | "servico"; descricao: string; quantidade: string; valor: string };

export function NovaOSForm({
  empresas,
  empresaPadrao,
  clientes,
  tecnicos,
  inicial,
}: {
  empresas: { id: string; nome: string }[];
  empresaPadrao: string;
  clientes: { id: string; nome: string; telefone: string | null }[];
  tecnicos: string[];
  inicial: ResultadoPlaca | null;
}) {
  const { state, pending, onSubmit } = useFormAction(criarOS);
  const [resultado, setResultado] = useState<ResultadoPlaca | null>(inicial);
  const [itens, setItens] = useState<Item[]>([]);
  const [seq, setSeq] = useState(1);

  const addItem = (tipo: Item["tipo"]) => {
    setItens((l) => [...l, { chave: seq, tipo, descricao: "", quantidade: "1", valor: "" }]);
    setSeq((n) => n + 1);
  };
  const setItem = (chave: number, patch: Partial<Item>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...patch } : i)));
  const total = itens.reduce((s, i) => {
    const q = parseValor(i.quantidade);
    const v = parseValor(i.valor);
    return s + (Number.isFinite(q) && Number.isFinite(v) ? q * v : 0);
  }, 0);

  const encontrado = resultado?.status === "encontrada" ? resultado : null;
  const novo = resultado?.status === "nova";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Empresa */}
      {empresas.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-foreground-2">Empresa da OS</legend>
          <div className="flex flex-wrap gap-2">
            {empresas.map((e) => (
              <label
                key={e.id}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-white px-3.5 has-checked:border-primary has-checked:ring-3 has-checked:ring-zinc-900/10"
              >
                <input type="radio" name="empresaId" value={e.id} defaultChecked={e.id === empresaPadrao} className="accent-zinc-900" required />
                {e.nome}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="empresaId" value={empresas[0]?.id} />
      )}

      {/* Veículo */}
      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold">Veículo e cliente</h2>

        <SeletorVeiculo clientes={clientes} inicial={inicial} onChange={setResultado} />
      </section>

      {/* Atendimento */}
      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold">Atendimento</h2>
        <Campo label="Problema relatado pelo cliente" htmlFor="descricao">
          <Textarea id="descricao" name="descricao" required rows={3} placeholder="Ex.: bateria descarrega à noite, luz da injeção acesa" />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Km de entrada" htmlFor="kmEntrada" hint="(opcional)">
            <Input
              id="kmEntrada"
              name="kmEntrada"
              inputMode="numeric"
              placeholder={encontrado?.veiculo.km ? `Último: ${encontrado.veiculo.km.toLocaleString("pt-BR")}` : ""}
            />
          </Campo>
          <Campo label="Responsável" htmlFor="responsavel" hint="(opcional)">
            <Input id="responsavel" name="responsavel" list="tecnicos" autoComplete="off" placeholder="Nome do mecânico / eletricista" />
            <datalist id="tecnicos">
              {tecnicos.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Campo>
        </div>
      </section>

      {/* Itens */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-[15px] font-semibold">Peças e serviços</h2>
          <p className="text-[13px] text-muted">Opcional agora. Dá para lançar depois do diagnóstico.</p>
        </div>
        <input type="hidden" name="itens" value={JSON.stringify(itens.map(({ tipo, descricao, quantidade, valor }) => ({ tipo, descricao, quantidade, valor })))} />
        {itens.length > 0 && (
          <ul className="flex flex-col gap-2">
            {itens.map((i) => (
              <li key={i.chave} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[110px_1fr_80px_120px_auto] sm:items-center sm:border-0 sm:p-0">
                <select
                  aria-label="Tipo"
                  value={i.tipo}
                  onChange={(e) => setItem(i.chave, { tipo: e.target.value as Item["tipo"] })}
                  className={cn(inputClass, "col-span-2 h-10 sm:col-span-1")}
                >
                  <option value="servico">Serviço</option>
                  <option value="peca">Peça</option>
                </select>
                <Input
                  aria-label="Descrição"
                  value={i.descricao}
                  onChange={(e) => setItem(i.chave, { descricao: e.target.value })}
                  placeholder={i.tipo === "peca" ? "Ex.: Bateria 60Ah" : "Ex.: Troca de bateria"}
                  className="col-span-2 h-10 sm:col-span-1"
                  required
                />
                <div className="col-span-2 grid grid-cols-[80px_1fr_auto] gap-2 sm:contents">
                  <Input aria-label="Quantidade" value={i.quantidade} onChange={(e) => setItem(i.chave, { quantidade: e.target.value })} inputMode="decimal" className="h-10 text-right" />
                  <Input aria-label="Valor unitário (R$)" value={i.valor} onChange={(e) => setItem(i.chave, { valor: e.target.value })} inputMode="decimal" placeholder="R$ 0,00" className="h-10 text-right" required />
                  <Button type="button" variant="ghost" className="h-10 px-2.5" onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} aria-label="Remover item">
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => addItem("servico")}>
            <Plus />Serviço
          </Button>
          <Button type="button" onClick={() => addItem("peca")}>
            <Plus />Peça
          </Button>
          {itens.length > 0 && (
            <span className="ml-auto text-[15px]">
              Total <strong className="tabular-nums">{formatBRL(total)}</strong>
            </span>
          )}
        </div>
      </section>

      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end border-t border-border pt-5">
        <Button variant="primary" className="h-11 px-5 text-[15px]" disabled={pending || (!encontrado && !novo)}>
          {pending ? "Abrindo…" : "Abrir OS"}
        </Button>
      </div>
    </form>
  );
}
