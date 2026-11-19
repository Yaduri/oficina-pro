"use client";

import { useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Badge, Button, Card, Erro, Input, Textarea } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import {
  LABEL_VARIAVEL,
  MODELOS,
  montarMensagem,
  textoModelo,
  variaveisDesconhecidas,
  type ModeloMensagem,
  type VariaveisMensagem,
} from "@/lib/mensagens";
import { salvarModelosMensagem } from "./actions";

export function ModelosForm({
  modelos,
  posVendaDias,
  exemplo,
}: {
  modelos: Partial<Record<string, string>> | null;
  posVendaDias: number;
  exemplo: VariaveisMensagem;
}) {
  const { state, pending, onSubmit } = useFormAction(salvarModelosMensagem);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {MODELOS.map((m) => (
        <Modelo key={m.tipo} modelo={m} inicial={textoModelo(modelos, m.tipo)} exemplo={exemplo}>
          {m.tipo === "pos_venda" && (
            <label className="flex flex-wrap items-center gap-2 text-[13px] text-foreground-2">
              Aparece na fila
              <Input
                name="posVendaDias"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                defaultValue={posVendaDias}
                required
                className="h-9 w-20"
                aria-label="Dias depois da entrega"
              />
              dias depois da entrega
            </label>
          )}
        </Modelo>
      ))}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-card sm:flex-row sm:items-center sm:justify-end">
        <Erro>{state?.erro}</Erro>
        <span role="status" className="text-[13px] text-ok sm:mr-auto">
          {state?.ok && !pending ? "Modelos salvos" : ""}
        </span>
        <Button variant="primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar modelos"}
        </Button>
      </div>
    </form>
  );
}

function Modelo({
  modelo: m,
  inicial,
  exemplo,
  children,
}: {
  modelo: ModeloMensagem;
  inicial: string;
  exemplo: VariaveisMensagem;
  children?: ReactNode;
}) {
  const [texto, setTexto] = useState(inicial);
  const campo = useRef<HTMLTextAreaElement>(null);
  const id = `modelo-${m.tipo}`;
  const desconhecidas = variaveisDesconhecidas(texto, m.variaveis);
  const alterado = texto.trim() !== m.padrao;

  function inserir(v: string) {
    const el = campo.current;
    const marca = `{${v}}`;
    if (!el) return setTexto((t) => t + marca);
    const ini = el.selectionStart ?? texto.length;
    const fim = el.selectionEnd ?? texto.length;
    const novo = texto.slice(0, ini) + marca + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
              {m.label}
              {m.marketing && <Badge>Só para quem autorizou</Badge>}
            </label>
            <p className="text-[13px] text-muted">{m.quando}</p>
          </div>
          {alterado && (
            <Button type="button" variant="ghost" className="h-8 px-2 text-[13px]" onClick={() => setTexto(m.padrao)}>
              <RotateCcw />
              Voltar ao padrão
            </Button>
          )}
        </div>

        <Textarea
          ref={campo}
          id={id}
          name={`modelo_${m.tipo}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={1000}
          required
        />

        <div className="flex flex-wrap gap-1.5" aria-label="Inserir variável">
          {m.variaveis.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => inserir(v)}
              className="rounded-full border border-border px-2.5 py-1 text-[12px] font-medium text-foreground-2 hover:bg-subtle"
            >
              {LABEL_VARIAVEL[v]}
            </button>
          ))}
        </div>

        {desconhecidas.length > 0 && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px]">
            Não reconhecido: {desconhecidas.map((v) => `{${v}}`).join(", ")}. Use os botões acima para inserir as variáveis.
          </p>
        )}

        <div className="rounded-md bg-subtle px-3 py-2.5 text-[13px]">
          <span className="mb-0.5 block text-[12px] font-medium text-muted">Prévia</span>
          <p className="whitespace-pre-line">{montarMensagem(texto, exemplo) || "—"}</p>
        </div>

        {children}
      </div>
    </Card>
  );
}
