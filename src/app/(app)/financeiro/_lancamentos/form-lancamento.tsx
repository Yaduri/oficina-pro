"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Paperclip, Pencil, Plus, X } from "lucide-react";
import { Button, Campo, Erro, Input, Select, Textarea } from "@/components/ui";
import { comprimir, enviarArquivo } from "@/lib/upload-cliente";
import { cn, formatBRL, parseValor } from "@/lib/utils";
import { criarLancamento, editarLancamento, type AcaoState } from "./actions";
import type { OpcoesForm } from "./tipos";

export type ValoresIniciais = {
  descricao: string;
  /** "123,45" */
  valor: string;
  categoriaId: string | null;
  clienteId: string | null;
  fornecedor: string | null;
  contaId: string | null;
  forma: string | null;
  vencimento: string;
  competencia: string;
  centroCusto: string | null;
  observacao: string | null;
  anexoKey: string | null;
  /** Já pago (em reais), para avisar que o valor não pode ficar abaixo */
  valorPago: number;
};

type Props = {
  tipo: "receber" | "pagar";
  opcoes: OpcoesForm;
  /** Edição de um lançamento existente */
  editar?: { id: string; valores: ValoresIniciais };
};

const MAX_ANEXO = 8 * 1024 * 1024;

/** Botão + janela de novo lançamento (ou edição, com `editar`) */
export function FormLancamento(props: Props) {
  const { tipo, editar } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const acao = editar ? editarLancamento.bind(null, editar.id) : criarLancamento.bind(null, tipo);
  const [state, dispatch, pending] = useActionState<AcaoState, FormData>(acao, undefined);
  const [enviando, setEnviando] = useState(false);
  const [erroLocal, setErroLocal] = useState<string>();
  // Novo formulário (campos limpos) depois de salvar
  const [versao, setVersao] = useState(0);
  const tratado = useRef<AcaoState>(undefined);

  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  function aoFechar() {
    if (state?.ok && tratado.current !== state && !editar) {
      tratado.current = state;
      setVersao((x) => x + 1);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroLocal(undefined);
    const dados = new FormData(e.currentTarget);
    const arquivo = dados.get("arquivo");
    dados.delete("arquivo");
    let anexoKey = dados.get("removerAnexo") === "on" ? "" : (editar?.valores.anexoKey ?? "");
    if (arquivo instanceof File && arquivo.size > 0) {
      const ehPdf = arquivo.type === "application/pdf";
      if (!ehPdf && !arquivo.type.startsWith("image/")) return setErroLocal("O anexo deve ser um PDF ou uma foto");
      setEnviando(true);
      try {
        const blob = ehPdf ? arquivo : await comprimir(arquivo);
        if (blob.size > MAX_ANEXO) throw new Error("O anexo passa de 8 MB");
        anexoKey = await enviarArquivo(blob, "financeiro");
      } catch (err) {
        setEnviando(false);
        return setErroLocal(err instanceof Error ? err.message : "Não foi possível enviar o anexo. Tente de novo.");
      }
      setEnviando(false);
    }
    dados.set("anexoKey", anexoKey);
    startTransition(() => dispatch(dados));
  }

  const ocupado = pending || enviando;
  const titulo = editar ? "Editar lançamento" : tipo === "receber" ? "Nova conta a receber" : "Nova conta a pagar";

  return (
    <>
      {editar ? (
        <Button onClick={() => dialog.current?.showModal()}>
          <Pencil />
          Editar
        </Button>
      ) : (
        <Button variant="primary" onClick={() => dialog.current?.showModal()}>
          <Plus />
          Novo lançamento
        </Button>
      )}
      <dialog
        ref={dialog}
        onClose={aoFechar}
        aria-labelledby={`${uid}-titulo`}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-zinc-950/40"
      >
        <form onSubmit={onSubmit} className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id={`${uid}-titulo`} className="text-[17px] font-semibold">
              {titulo}
            </h2>
            <Button type="button" variant="ghost" className="px-2" onClick={() => dialog.current?.close()} aria-label="Fechar">
              <X />
            </Button>
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            <Campos key={versao} {...props} uid={uid} />
            <Erro>{erroLocal ?? state?.erro}</Erro>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={ocupado}>
              {enviando ? "Enviando anexo…" : pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function Campos({ tipo, opcoes, editar, uid }: Props & { uid: string }) {
  const { hoje, categorias, contas, clientes, fornecedores, centrosCusto, formas } = opcoes;
  const v = editar?.valores;
  const receber = tipo === "receber";
  const id = (k: string) => `${uid}-${k}`;
  const [modo, setModo] = useState<"unica" | "parcelada" | "recorrente">("unica");
  const [valorTxt, setValorTxt] = useState(v?.valor ?? "");
  const [nParcelas, setNParcelas] = useState("2");
  const [vencimento, setVencimento] = useState(v?.vencimento ?? hoje);

  const total = parseValor(valorTxt);
  const n = Math.max(2, Math.min(60, Math.trunc(Number(nParcelas)) || 2));
  const dia = Number(vencimento.slice(8, 10)) || null;

  return (
    <>
      <Campo label="Descrição" htmlFor={id("descricao")}>
        <Input
          id={id("descricao")}
          name="descricao"
          required
          maxLength={200}
          defaultValue={v?.descricao}
          placeholder={receber ? "Ex.: Serviço de frota — Transportes Silva" : "Ex.: Aluguel do galpão"}
        />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          label={modo === "parcelada" ? "Valor total (R$)" : "Valor (R$)"}
          htmlFor={id("valor")}
          hint={v && v.valorPago > 0 ? `(já pago ${formatBRL(v.valorPago)})` : undefined}
        >
          <Input
            id={id("valor")}
            name="valor"
            inputMode="decimal"
            required
            placeholder="0,00"
            value={valorTxt}
            onChange={(e) => setValorTxt(e.target.value)}
          />
        </Campo>
        <Campo label="Categoria" htmlFor={id("categoria")}>
          <Select id={id("categoria")} name="categoriaId" required defaultValue={v?.categoriaId ?? ""}>
            <option value="" disabled>
              Escolha…
            </option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      {receber ? (
        <Campo label="Cliente" hint="(opcional)" htmlFor={id("cliente")}>
          <Select id={id("cliente")} name="clienteId" defaultValue={v?.clienteId ?? ""}>
            <option value="">Sem cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Campo>
      ) : (
        <Campo label="Fornecedor" hint="(opcional)" htmlFor={id("fornecedor")}>
          <Input id={id("fornecedor")} name="fornecedor" maxLength={120} list={id("fornecedores")} defaultValue={v?.fornecedor ?? ""} />
          <datalist id={id("fornecedores")}>
            {fornecedores.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label={modo === "parcelada" ? "Vencimento da 1ª parcela" : modo === "recorrente" ? "Primeiro vencimento" : "Vencimento"} htmlFor={id("venc")}>
          <Input id={id("venc")} name="vencimento" type="date" required value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </Campo>
        <Campo label="Competência" hint="(opcional; padrão: vencimento)" htmlFor={id("comp")}>
          <Input id={id("comp")} name="competencia" type="date" defaultValue={v && v.competencia !== v.vencimento ? v.competencia : ""} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Forma de pagamento" hint="(opcional)" htmlFor={id("forma")}>
          <Select id={id("forma")} name="forma" defaultValue={v?.forma ?? ""}>
            <option value="">Não definida</option>
            {formas.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.label}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label={receber ? "Conta para receber" : "Conta para pagar"} hint="(opcional)" htmlFor={id("conta")}>
          <Select id={id("conta")} name="contaId" defaultValue={v?.contaId ?? ""}>
            <option value="">Não definida</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      <Campo label="Centro de custo" hint="(opcional)" htmlFor={id("cc")}>
        <Input
          id={id("cc")}
          name="centroCusto"
          maxLength={80}
          list={id("centros")}
          defaultValue={v?.centroCusto ?? ""}
          placeholder="Ex.: Oficina, Administrativo"
        />
        <datalist id={id("centros")}>
          {centrosCusto.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </Campo>

      {!editar && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 text-[13px] font-medium text-foreground-2">Como é esse lançamento</legend>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-subtle p-1">
            {(
              [
                ["unica", "Única"],
                ["parcelada", "Parcelada"],
                ["recorrente", "Todo mês"],
              ] as const
            ).map(([valor, label]) => (
              <label
                key={valor}
                className={cn(
                  "flex h-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-zinc-900/20",
                  modo === valor ? "bg-card shadow-card" : "text-foreground-2",
                )}
              >
                <input type="radio" name="modo" value={valor} checked={modo === valor} onChange={() => setModo(valor)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {modo === "parcelada" && (
            <div className="grid items-end gap-3 sm:grid-cols-[10rem_1fr]">
              <Campo label="Nº de parcelas" htmlFor={id("parcelas")}>
                <Input
                  id={id("parcelas")}
                  name="parcelas"
                  type="number"
                  min={2}
                  max={60}
                  required
                  value={nParcelas}
                  onChange={(e) => setNParcelas(e.target.value)}
                />
              </Campo>
              <p className="pb-3 text-[13px] text-muted" aria-live="polite">
                {Number.isFinite(total) && total > 0 ? `${n}× de ${formatBRL(Math.floor((total * 100) / n) / 100)}` : `${n} parcelas`}
                {dia ? `, todo dia ${dia} (mês a mês)` : ""}
              </p>
            </div>
          )}
          {modo === "recorrente" && (
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <Campo label="Termina em" hint="(opcional)" htmlFor={id("fim")}>
                <Input id={id("fim")} name="recFim" type="date" min={vencimento} />
              </Campo>
              <p className="pb-3 text-[13px] text-muted">
                Repete todo mês{dia ? ` no dia ${dia}` : ""}. Os lançamentos são criados até o fim do mês que vem.
              </p>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("anexo")} className="text-[13px] font-medium text-foreground-2">
          Anexo <span className="font-normal text-muted">(boleto ou nota: PDF ou foto, até 8 MB)</span>
        </label>
        {v?.anexoKey && (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <a href={`/arquivos/${v.anexoKey}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">
              <Paperclip className="size-3.5" aria-hidden />
              Ver anexo atual
            </a>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" name="removerAnexo" className="size-4" />
              Remover
            </label>
          </div>
        )}
        <input
          id={id("anexo")}
          name="arquivo"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-card file:px-3 file:text-sm file:font-medium"
        />
      </div>

      <Campo label="Observação" hint="(opcional)" htmlFor={id("obs")}>
        <Textarea id={id("obs")} name="observacao" rows={2} className="min-h-16" maxLength={1000} defaultValue={v?.observacao ?? ""} />
      </Campo>

      {!editar && (
        <label className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm">
          <input type="checkbox" name="jaPago" className="mt-0.5 size-4" />
          <span>
            <span className="font-medium">
              {modo === "unica" ? (receber ? "Já foi recebido" : "Já está pago") : receber ? "A 1ª parcela já foi recebida" : "A 1ª parcela já está paga"}
            </span>
            <span className="block text-[13px] text-muted">Registra o pagamento com a data de hoje, na conta escolhida acima.</span>
          </span>
        </label>
      )}
    </>
  );
}
