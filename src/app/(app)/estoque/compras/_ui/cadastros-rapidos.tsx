"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button, Campo, Erro, Input, Select } from "@/components/ui";
import { UNIDADES } from "@/lib/estoque-formato";
import { parseValor } from "@/lib/utils";
import { criarFornecedorRapido } from "../../fornecedores/actions";
import { criarPecaRapida, type PecaRapida } from "../actions";

/** Janela simples com título, conteúdo e botões */
function Janela({
  titulo,
  botao,
  children,
  onSubmit,
  pending,
  erro,
  dialogRef,
}: {
  titulo: string;
  botao: ReactNode;
  children: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  erro?: string;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  const uid = useId();
  return (
    <>
      {botao}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${uid}-t`}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-zinc-950/40"
      >
        <form onSubmit={onSubmit} className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id={`${uid}-t`} className="text-[17px] font-semibold">
              {titulo}
            </h2>
            <Button type="button" variant="ghost" className="px-2" onClick={() => dialogRef.current?.close()} aria-label="Fechar">
              <X />
            </Button>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            {children}
            <Erro>{erro}</Erro>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Salvando…" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Cadastro rápido de fornecedor (os demais dados ficam na tela do fornecedor) */
export function NovoFornecedorRapido({ onCriado }: { onCriado: (f: { id: string; nome: string }) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  const [tipo, setTipo] = useState<"pj" | "pf">("pj");
  return (
    <Janela
      titulo="Novo fornecedor"
      dialogRef={ref}
      pending={pending}
      erro={erro}
      botao={
        <Button type="button" variant="ghost" className="h-10 px-2.5" onClick={() => (setErro(undefined), ref.current?.showModal())}>
          <Plus />
          Novo
        </Button>
      }
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        start(async () => {
          const r = await criarFornecedorRapido({
            tipoPessoa: tipo,
            nome: String(f.get("nome") ?? ""),
            cpfCnpj: String(f.get("cpfCnpj") ?? ""),
            telefone: String(f.get("telefone") ?? ""),
          });
          if ("erro" in r) return setErro(r.erro);
          form.reset();
          ref.current?.close();
          onCriado(r);
        });
      }}
    >
      <Campo label="Tipo" htmlFor={`${uid}-tipo`}>
        <Select id={`${uid}-tipo`} value={tipo} onChange={(e) => setTipo(e.target.value as "pj" | "pf")}>
          <option value="pj">Empresa</option>
          <option value="pf">Pessoa física</option>
        </Select>
      </Campo>
      <Campo label={tipo === "pj" ? "Razão social ou nome" : "Nome"} htmlFor={`${uid}-nome`}>
        <Input id={`${uid}-nome`} name="nome" required autoComplete="off" />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label={tipo === "pj" ? "CNPJ" : "CPF"} hint="(opcional)" htmlFor={`${uid}-doc`}>
          <Input id={`${uid}-doc`} name="cpfCnpj" autoComplete="off" />
        </Campo>
        <Campo label="Telefone" hint="(opcional)" htmlFor={`${uid}-tel`}>
          <Input id={`${uid}-tel`} name="telefone" type="tel" inputMode="tel" />
        </Campo>
      </div>
    </Janela>
  );
}

/** Cadastro rápido de peça que controla estoque */
export function NovaPecaRapida({ onCriada, rotulo = "Peça nova" }: { onCriada: (p: PecaRapida) => void; rotulo?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  return (
    <Janela
      titulo="Nova peça"
      dialogRef={ref}
      pending={pending}
      erro={erro}
      botao={
        <Button type="button" variant="ghost" onClick={() => (setErro(undefined), ref.current?.showModal())}>
          <Plus />
          {rotulo}
        </Button>
      }
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        const valor = parseValor(String(f.get("valor") ?? ""));
        if (!Number.isFinite(valor) || valor < 0) return setErro("Preço de venda inválido");
        start(async () => {
          const r = await criarPecaRapida({
            descricao: String(f.get("descricao") ?? ""),
            codigo: String(f.get("codigo") ?? ""),
            unidade: String(f.get("unidade") ?? "UN") as (typeof UNIDADES)[number],
            valor,
          });
          if ("erro" in r) return setErro(r.erro);
          form.reset();
          ref.current?.close();
          onCriada(r);
        });
      }}
    >
      <Campo label="Descrição" htmlFor={`${uid}-desc`}>
        <Input id={`${uid}-desc`} name="descricao" required autoComplete="off" />
      </Campo>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Campo label="Código" hint="(opcional)" htmlFor={`${uid}-cod`} className="col-span-2 sm:col-span-1">
          <Input id={`${uid}-cod`} name="codigo" autoComplete="off" />
        </Campo>
        <Campo label="Unidade" htmlFor={`${uid}-un`}>
          <Select id={`${uid}-un`} name="unidade" defaultValue="UN">
            {UNIDADES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Campo>
        <Campo label="Preço de venda" htmlFor={`${uid}-valor`}>
          <Input id={`${uid}-valor`} name="valor" inputMode="decimal" placeholder="0,00" required />
        </Campo>
      </div>
    </Janela>
  );
}
