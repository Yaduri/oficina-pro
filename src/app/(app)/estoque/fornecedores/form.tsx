"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useFormAction } from "@/lib/use-form-action";
import { Button, Campo, Erro, Input, Select, Textarea } from "@/components/ui";
import { CamposEndereco } from "@/components/campos-endereco";
import { formatDocumento, formatTelefone } from "@/lib/utils";
import {
  arquivarFornecedor,
  atualizarFornecedor,
  criarFornecedor,
  excluirFornecedor,
  type FormState,
  type Simples,
} from "./actions";

export type FornecedorForm = {
  id: string;
  tipoPessoa: "pf" | "pj";
  nome: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  inscricaoEstadual: string | null;
  telefone: string | null;
  email: string | null;
  contato: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
};

function Campos({ f }: { f?: FornecedorForm }) {
  const [tipo, setTipo] = useState<"pf" | "pj">(f?.tipoPessoa ?? "pj");
  const p = f ? `forn-${f.id}` : "forn-novo";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-6">
        <Campo label="Tipo" htmlFor={`${p}-tipo`} className="sm:col-span-2">
          <Select id={`${p}-tipo`} name="tipoPessoa" value={tipo} onChange={(e) => setTipo(e.target.value as "pf" | "pj")}>
            <option value="pj">Empresa</option>
            <option value="pf">Pessoa física</option>
          </Select>
        </Campo>
        <Campo label={tipo === "pj" ? "Razão social" : "Nome"} htmlFor={`${p}-nome`} className="sm:col-span-4">
          <Input id={`${p}-nome`} name="nome" defaultValue={f?.nome} required autoComplete="off" />
        </Campo>
        {tipo === "pj" && (
          <Campo label="Nome fantasia" htmlFor={`${p}-fantasia`} className="sm:col-span-3">
            <Input id={`${p}-fantasia`} name="nomeFantasia" defaultValue={f?.nomeFantasia ?? ""} autoComplete="off" />
          </Campo>
        )}
        <Campo label={tipo === "pj" ? "CNPJ" : "CPF"} hint="(opcional)" htmlFor={`${p}-doc`} className={tipo === "pj" ? "sm:col-span-3" : "sm:col-span-2"}>
          <Input
            id={`${p}-doc`}
            name="cpfCnpj"
            inputMode={tipo === "pf" ? "numeric" : "text"}
            defaultValue={formatDocumento(f?.cpfCnpj)}
            placeholder={tipo === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
          />
        </Campo>
        {tipo === "pj" && (
          <Campo label="Inscrição estadual" hint="(opcional)" htmlFor={`${p}-ie`} className="sm:col-span-2">
            <Input id={`${p}-ie`} name="inscricaoEstadual" defaultValue={f?.inscricaoEstadual ?? ""} />
          </Campo>
        )}
        <Campo label="Telefone" htmlFor={`${p}-tel`} className="sm:col-span-2">
          <Input id={`${p}-tel`} name="telefone" type="tel" inputMode="tel" defaultValue={formatTelefone(f?.telefone)} placeholder="(11) 3333-4444" />
        </Campo>
        <Campo label="E-mail" hint="(opcional)" htmlFor={`${p}-email`} className="sm:col-span-2">
          <Input id={`${p}-email`} name="email" type="email" defaultValue={f?.email ?? ""} />
        </Campo>
        <Campo label="Contato" hint="(vendedor)" htmlFor={`${p}-contato`} className="sm:col-span-2">
          <Input id={`${p}-contato`} name="contato" defaultValue={f?.contato ?? ""} autoComplete="off" />
        </Campo>
      </div>
      <CamposEndereco inicial={f} idPrefixo={p} />
      <Campo label="Observações" hint="(opcional)" htmlFor={`${p}-obs`}>
        <Textarea id={`${p}-obs`} name="observacoes" rows={2} className="min-h-16" defaultValue={f?.observacoes ?? ""} />
      </Campo>
    </div>
  );
}

export function NovoFornecedorForm() {
  const { state, pending, onSubmit } = useFormAction(criarFornecedor);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Campos />
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end">
        <Button variant="primary" disabled={pending}>
          {pending ? "Salvando…" : "Cadastrar fornecedor"}
        </Button>
      </div>
    </form>
  );
}

export function EditarFornecedorForm({ fornecedor }: { fornecedor: FornecedorForm }) {
  const { state, pending, onSubmit } = useFormAction<FormState>(atualizarFornecedor.bind(null, fornecedor.id));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Campos f={fornecedor} />
      <Erro>{state?.erro}</Erro>
      <div className="flex items-center justify-end gap-3">
        <span role="status" className="text-[13px] text-ok">
          {state?.ok && !pending ? "Alterações salvas" : ""}
        </span>
        <Button variant="primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

/** Arquivar/reativar e excluir (excluir só sem compras; com compras, arquiva) */
export function AcoesFornecedor({ id, nome, ativo, temCompras }: { id: string; nome: string; ativo: boolean; temCompras: boolean }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  const rodar = (fn: () => Promise<Simples>) => {
    setErro(undefined);
    start(async () => {
      const r = await fn();
      if (r?.erro) setErro(r.erro);
    });
  };
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-2">
        {ativo ? (
          <Button
            disabled={pending}
            onClick={() => confirm(`Arquivar ${nome}? Some das listas, mas as compras continuam.`) && rodar(() => arquivarFornecedor(id, true))}
          >
            <Archive />
            Arquivar
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => rodar(() => arquivarFornecedor(id, false))}>
            <ArchiveRestore />
            Reativar
          </Button>
        )}
        {!temCompras && (
          <Button
            variant="ghost"
            className="text-danger hover:text-danger"
            disabled={pending}
            onClick={() => confirm(`Excluir ${nome} definitivamente? Isso não pode ser desfeito.`) && rodar(() => excluirFornecedor(id))}
          >
            <Trash2 />
            Excluir
          </Button>
        )}
      </div>
      {erro && <p className="text-[13px] text-danger">{erro}</p>}
    </div>
  );
}
