"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Avatar, Button, Campo, Card, CardHeader, EmpresaTag, Erro, Input, Select, Vazio, type TipoEmpresa } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { alternarTecnico, excluirTecnico, salvarTecnico } from "./actions";

type Tecnico = { id: string; nome: string; empresaId: string | null; ativo: boolean; abertas: number; total: number };
type Empresa = { id: string; nome: string; tipo: TipoEmpresa };

export function FormTecnico({ tecnico, empresas, onDone }: { tecnico?: Tecnico; empresas: Empresa[]; onDone?: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useFormAction(salvarTecnico.bind(null, tecnico?.id ?? null));
  useEffect(() => {
    if (!state?.ok) return;
    if (tecnico) onDone?.();
    else {
      form.current?.reset();
      form.current?.querySelector<HTMLInputElement>("[name=nome]")?.focus();
    }
  }, [state, tecnico, onDone]);
  const pid = tecnico?.id ?? "novo";

  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3">
      <Campo label="Nome" htmlFor={`tec-${pid}-nome`}>
        <Input id={`tec-${pid}-nome`} name="nome" defaultValue={tecnico?.nome} required autoComplete="off" />
      </Campo>
      {empresas.length > 1 && (
        <Campo label="Empresa" htmlFor={`tec-${pid}-emp`}>
          <Select id={`tec-${pid}-emp`} name="empresaId" defaultValue={tecnico?.empresaId ?? ""}>
            <option value="">As duas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" disabled={pending}>
          {!tecnico && <Plus />}
          {pending ? "Salvando…" : tecnico ? "Salvar" : "Adicionar técnico"}
        </Button>
      </div>
    </form>
  );
}

export function ListaTecnicos({ tecnicos, empresas }: { tecnicos: Tecnico[]; empresas: Empresa[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <Card className="min-w-0">
      <CardHeader title="Técnicos" action={<span className="text-[13px] text-muted">{tecnicos.filter((t) => t.ativo).length} ativos</span>} />
      {tecnicos.length === 0 ? (
        <Vazio titulo="Nenhum técnico cadastrado">
          Cadastre quem trabalha nos carros para escolher o responsável de cada OS. Técnicos não precisam ter login.
        </Vazio>
      ) : (
        <ul className={cn("divide-y divide-border", pending && "opacity-60")}>
          {tecnicos.map((t) => {
            const empresa = empresas.find((e) => e.id === t.empresaId);
            if (editando === t.id) {
              return (
                <li key={t.id} className="bg-subtle/60 px-4 py-4 sm:px-5">
                  <FormTecnico tecnico={t} empresas={empresas} onDone={() => setEditando(null)} />
                </li>
              );
            }
            return (
              <li key={t.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5", !t.ativo && "text-muted")}>
                <Avatar nome={t.nome} />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="font-medium">{t.nome}</p>
                  <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    {empresa ? <EmpresaTag tipo={empresa.tipo} nome={empresa.nome} /> : empresas.length > 1 && <span>As duas empresas</span>}
                    <span>
                      {t.abertas > 0 ? `${t.abertas} OS em andamento · ` : ""}
                      {t.total} OS no total
                    </span>
                    {!t.ativo && <span>Desativado</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <label className="flex cursor-pointer items-center gap-1.5 px-1.5 text-[12px] text-muted" title={t.ativo ? "Aparece para escolher na OS" : "Não aparece na OS"}>
                    <input
                      type="checkbox"
                      checked={t.ativo}
                      onChange={(e) => start(() => alternarTecnico(t.id, e.target.checked))}
                      className="size-4 accent-zinc-900"
                      aria-label={`${t.nome} ativo`}
                    />
                    Ativo
                  </label>
                  <Button variant="ghost" className="px-2" onClick={() => setEditando(t.id)} aria-label={`Editar ${t.nome}`}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 hover:text-danger"
                    aria-label={`Excluir ${t.nome}`}
                    onClick={() => {
                      const msg =
                        t.total > 0
                          ? `${t.nome} já foi responsável por OS, então será só desativado (o histórico continua). Continuar?`
                          : `Excluir ${t.nome}?`;
                      if (!confirm(msg)) return;
                      setAviso(undefined);
                      start(async () => {
                        const r = await excluirTecnico(t.id);
                        if (r?.desativado) setAviso(`${t.nome} foi desativado.`);
                      });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {aviso && (
        <p role="status" className="border-t border-border px-5 py-3 text-[13px] text-muted">
          {aviso}
        </p>
      )}
    </Card>
  );
}
