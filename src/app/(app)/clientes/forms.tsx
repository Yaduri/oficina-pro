"use client";

import { useEffect, useRef, useState } from "react";
import { useFormAction } from "@/lib/use-form-action";
import { Button, Campo, Erro, Input, Select, Textarea } from "@/components/ui";
import { CamposEndereco } from "@/components/campos-endereco";
import type { Cliente, Veiculo } from "@/lib/cadastros";
import { COMBUSTIVEIS } from "@/lib/veiculo";
import { formatDocumento, formatTelefone } from "@/lib/utils";
import { atualizarCliente, criarCliente, salvarVeiculo, type FormState } from "./actions";

/* ---------- Campos ---------- */

function CamposCliente({ cliente }: { cliente?: Cliente }) {
  const [tipo, setTipo] = useState<"pf" | "pj">(cliente?.tipoPessoa ?? "pf");
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <Campo label="Tipo" htmlFor="tipoPessoa" className="sm:col-span-2">
        <Select id="tipoPessoa" name="tipoPessoa" value={tipo} onChange={(e) => setTipo(e.target.value as "pf" | "pj")}>
          <option value="pf">Pessoa física</option>
          <option value="pj">Empresa</option>
        </Select>
      </Campo>
      <Campo label={tipo === "pf" ? "Nome completo" : "Razão social / nome"} htmlFor="nome" className="sm:col-span-4">
        <Input id="nome" name="nome" defaultValue={cliente?.nome} required autoComplete="off" />
      </Campo>
      <Campo label={tipo === "pf" ? "CPF" : "CNPJ"} hint="(opcional)" htmlFor="documento" className="sm:col-span-2">
        <Input
          id="documento"
          name="documento"
          inputMode="numeric"
          defaultValue={formatDocumento(cliente?.documento)}
          placeholder={tipo === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
        />
      </Campo>
      <Campo label="WhatsApp / telefone" htmlFor="telefone" className="sm:col-span-2">
        <Input id="telefone" name="telefone" type="tel" inputMode="tel" defaultValue={formatTelefone(cliente?.telefone)} placeholder="(11) 98765-4321" />
      </Campo>
      <Campo label="E-mail" hint="(opcional)" htmlFor="email" className="sm:col-span-2">
        <Input id="email" name="email" type="email" defaultValue={cliente?.email ?? ""} />
      </Campo>
      <label className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5 text-[13px] sm:col-span-6">
        <input type="checkbox" name="aceitaWhatsapp" defaultChecked={cliente?.aceitaWhatsapp} className="mt-0.5 size-4 shrink-0 accent-zinc-900" />
        <span>
          <span className="font-medium">Cliente aceita receber mensagens pelo WhatsApp</span>
          <span className="block text-muted">
            Avisos de orçamento e de veículo pronto, lembretes de revisão (LGPD).
            {cliente?.aceitaWhatsappEm && ` Consentimento registrado em ${new Date(cliente.aceitaWhatsappEm).toLocaleDateString("pt-BR")}.`}
          </span>
        </span>
      </label>
      <details className="group sm:col-span-6" open={temExtras(cliente) || undefined}>
        <summary className="cursor-pointer select-none text-[13px] font-medium text-foreground-2 hover:text-foreground">
          Endereço, aniversário e observações
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <CamposEndereco inicial={cliente} idPrefixo={cliente ? `cli-${cliente.id}` : "cli-novo"} />
          <div className="grid gap-4 sm:grid-cols-6">
            <Campo label="Data de nascimento" hint="(opcional)" htmlFor="nascimento" className="sm:col-span-2">
              <Input id="nascimento" name="nascimento" type="date" defaultValue={cliente?.nascimento ?? ""} />
            </Campo>
            <Campo label="Observações" hint="(opcional)" htmlFor="observacoes" className="sm:col-span-4">
              <Textarea id="observacoes" name="observacoes" rows={2} className="min-h-10" defaultValue={cliente?.observacoes ?? ""} />
            </Campo>
          </div>
        </div>
      </details>
    </div>
  );
}

const temExtras = (c?: Cliente) => !!(c && (c.cep || c.logradouro || c.cidade || c.nascimento || c.observacoes));

export function CamposVeiculo({ veiculo, prefixo = "", obrigatorio = true }: { veiculo?: Veiculo; prefixo?: string; obrigatorio?: boolean }) {
  const id = (n: string) => `${prefixo}${n}${veiculo ? `_${veiculo.id}` : ""}`;
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <Campo label="Placa" htmlFor={id("placa")} className="sm:col-span-2">
        <Input
          id={id("placa")}
          name={`${prefixo}placa`}
          defaultValue={veiculo?.placa}
          required={obrigatorio}
          placeholder="ABC1D23"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={8}
          className="uppercase tracking-wider"
        />
      </Campo>
      <Campo label="Marca" htmlFor={id("marca")} className="sm:col-span-2">
        <Input id={id("marca")} name={`${prefixo}marca`} defaultValue={veiculo?.marca ?? ""} placeholder="Chevrolet" />
      </Campo>
      <Campo label="Modelo" htmlFor={id("modelo")} className="sm:col-span-2">
        <Input id={id("modelo")} name={`${prefixo}modelo`} defaultValue={veiculo?.modelo} required={obrigatorio} placeholder="Onix 1.0 LT" />
      </Campo>
      <Campo label="Ano" htmlFor={id("ano")} className="sm:col-span-2">
        <Input id={id("ano")} name={`${prefixo}ano`} inputMode="numeric" maxLength={4} defaultValue={veiculo?.ano ?? ""} />
      </Campo>
      <Campo label="Cor" htmlFor={id("cor")} className="sm:col-span-2">
        <Input id={id("cor")} name={`${prefixo}cor`} defaultValue={veiculo?.cor ?? ""} />
      </Campo>
      <Campo label="Km atual" htmlFor={id("km")} className="sm:col-span-2">
        <Input id={id("km")} name={`${prefixo}km`} inputMode="numeric" defaultValue={veiculo?.km ?? ""} />
      </Campo>
      <Campo label="Combustível" htmlFor={id("combustivel")} className="sm:col-span-2">
        <Select id={id("combustivel")} name={`${prefixo}combustivel`} defaultValue={veiculo?.combustivel ?? ""}>
          <option value="">—</option>
          {COMBUSTIVEIS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.label}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo label="Chassi" hint="(opcional)" htmlFor={id("chassi")} className="sm:col-span-2">
        <Input
          id={id("chassi")}
          name={`${prefixo}chassi`}
          defaultValue={veiculo?.chassi ?? ""}
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          className="uppercase"
        />
      </Campo>
      <Campo label="Motor" hint="(opcional)" htmlFor={id("motor")} className="sm:col-span-2">
        <Input id={id("motor")} name={`${prefixo}motor`} defaultValue={veiculo?.motor ?? ""} placeholder="1.0 12V / nº do motor" />
      </Campo>
    </div>
  );
}

function Salvo({ state, pending }: { state: FormState; pending: boolean }) {
  return (
    <span role="status" className="text-[13px] text-ok">
      {state?.ok && !pending ? "Alterações salvas" : ""}
    </span>
  );
}

/* ---------- Formulários ---------- */

export function NovoClienteForm() {
  const { state, pending, onSubmit } = useFormAction(criarCliente);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold">Dados do cliente</h2>
        <CamposCliente />
      </section>
      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-[15px] font-semibold">Veículo</h2>
          <p className="text-[13px] text-muted">Opcional. Outros veículos podem ser adicionados depois.</p>
        </div>
        <CamposVeiculo prefixo="v_" obrigatorio={false} />
      </section>
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2.5">
        <Button variant="primary" disabled={pending}>{pending ? "Salvando…" : "Cadastrar cliente"}</Button>
      </div>
    </form>
  );
}

export function EditarClienteForm({ cliente }: { cliente: Cliente }) {
  const { state, pending, onSubmit } = useFormAction(atualizarCliente.bind(null, cliente.id));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <CamposCliente cliente={cliente} />
      <Erro>{state?.erro}</Erro>
      <div className="flex items-center justify-end gap-3">
        <Salvo state={state} pending={pending} />
        <Button variant="primary" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</Button>
      </div>
    </form>
  );
}

export function VeiculoForm({ clienteId, veiculo, onDone }: { clienteId: string; veiculo?: Veiculo; onDone?: () => void }) {
  const { state, pending, onSubmit } = useFormAction(salvarVeiculo.bind(null, clienteId, veiculo?.id ?? null));
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (!veiculo) form.current?.reset();
      onDone?.();
    }
  }, [state, veiculo, onDone]);
  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-4">
      <CamposVeiculo veiculo={veiculo} />
      <Erro>{state?.erro}</Erro>
      <div className="flex items-center justify-end gap-2.5">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" disabled={pending}>
          {pending ? "Salvando…" : veiculo ? "Salvar veículo" : "Adicionar veículo"}
        </Button>
      </div>
    </form>
  );
}
