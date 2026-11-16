"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Campo, Card, CardHeader, Erro, Input, Textarea } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { editarDadosOS } from "../edicao";

/** "Problema relatado" com edição de relato, responsável, km de entrada e previsão de entrega */
export function DadosOS({
  osId,
  descricao,
  responsavel,
  kmEntrada,
  previsao,
  tecnicos,
  editavel,
}: {
  osId: string;
  descricao: string;
  responsavel: string | null;
  kmEntrada: number | null;
  /** AAAA-MM-DD */
  previsao: string | null;
  tecnicos: string[];
  editavel: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const { state, pending, onSubmit } = useFormAction(async (prev: Awaited<ReturnType<typeof editarDadosOS>>, form: FormData) => {
    const r = await editarDadosOS(osId, prev, form);
    if (r?.ok) setEditando(false);
    return r;
  });

  return (
    <Card>
      <CardHeader
        title="Problema relatado"
        action={
          editavel &&
          !editando && (
            <Button variant="ghost" className="-my-1.5 h-8 px-2.5 text-[13px]" onClick={() => setEditando(true)}>
              <Pencil />
              Editar
            </Button>
          )
        }
      />
      {editando ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4 px-5 py-4">
          <Campo label="Problema relatado pelo cliente" htmlFor="os-descricao">
            <Textarea id="os-descricao" name="descricao" defaultValue={descricao} required minLength={3} rows={3} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Responsável" htmlFor="os-responsavel">
              <Input id="os-responsavel" name="responsavel" list="os-tecnicos" defaultValue={responsavel ?? ""} placeholder="Nome do técnico" />
              <datalist id="os-tecnicos">
                {tecnicos.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Km de entrada" htmlFor="os-km">
              <Input id="os-km" name="kmEntrada" inputMode="numeric" defaultValue={kmEntrada != null ? String(kmEntrada) : ""} />
            </Campo>
            <Campo label="Previsão de entrega" htmlFor="os-previsao">
              <Input id="os-previsao" name="previsaoEntrega" type="date" defaultValue={previsao ?? ""} />
            </Campo>
          </div>
          <Erro>{state?.erro}</Erro>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-line px-5 py-4">{descricao}</p>
      )}
    </Card>
  );
}
