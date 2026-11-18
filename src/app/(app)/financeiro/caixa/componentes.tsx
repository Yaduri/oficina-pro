"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeftRight, Check, EyeOff, Plus, Trash2, Undo2, Upload, X } from "lucide-react";
import { Button, Campo, Erro, Input, Select, Textarea } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatBRL, parseValor } from "@/lib/utils";
import {
  abrirCaixa,
  conciliar,
  criarDoExtrato,
  fecharCaixa,
  ignorarItem,
  importarOfx,
  removerTransferencia,
  transferir,
  type CaixaState,
} from "./actions";

const brl = (c: number) => formatBRL(c / 100);
const valorTxt = (reais: number) => reais.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Janela (dialog nativo) ---------- */

function Janela({
  id,
  titulo,
  aberta,
  onFechar,
  children,
}: {
  id: string;
  titulo: string;
  aberta: boolean;
  onFechar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    if (!aberta && d.open) d.close();
  }, [aberta]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titulo`}
      onClose={onFechar}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-zinc-950/40"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id={`${id}-titulo`} className="text-[17px] font-semibold">
          {titulo}
        </h2>
        <Button type="button" variant="ghost" className="px-2" onClick={onFechar} aria-label="Fechar">
          <X />
        </Button>
      </div>
      {aberta && children}
    </dialog>
  );
}

/** Rodapé padrão das janelas */
function Rodape({ onCancelar, pending, rotulo }: { onCancelar: () => void; pending: boolean; rotulo: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
      <Button type="button" variant="ghost" onClick={onCancelar}>
        Cancelar
      </Button>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Salvando…" : rotulo}
      </Button>
    </div>
  );
}

/** Fecha a janela quando a action termina com sucesso */
function useFecharAoSalvar(state: CaixaState, fechar: () => void) {
  useEffect(() => {
    if (state?.ok) fechar();
  }, [state, fechar]);
}

/* ---------- Transferência ---------- */

export function Transferir({ contas, hoje }: { contas: { id: string; nome: string }[]; hoje: string }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <Button onClick={() => setAberta(true)}>
        <ArrowLeftRight />
        Transferir entre contas
      </Button>
      <Janela id="transf" titulo="Transferir entre contas" aberta={aberta} onFechar={() => setAberta(false)}>
        <FormTransferir contas={contas} hoje={hoje} fechar={() => setAberta(false)} />
      </Janela>
    </>
  );
}

function FormTransferir({ contas, hoje, fechar }: { contas: { id: string; nome: string }[]; hoje: string; fechar: () => void }) {
  const { state, pending, onSubmit } = useFormAction(transferir);
  useFecharAoSalvar(state, fechar);
  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="De" htmlFor="tr-de">
            <Select id="tr-de" name="deContaId" defaultValue={contas[0]?.id} required>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Para" htmlFor="tr-para">
            <Select id="tr-para" name="paraContaId" defaultValue={contas[1]?.id} required>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Valor" htmlFor="tr-valor">
            <Input id="tr-valor" name="valor" inputMode="decimal" placeholder="R$ 0,00" required className="text-right" />
          </Campo>
          <Campo label="Data" htmlFor="tr-data">
            <Input id="tr-data" name="data" type="date" defaultValue={hoje} required />
          </Campo>
        </div>
        <Campo label="Descrição" hint="(opcional)" htmlFor="tr-desc">
          <Input id="tr-desc" name="descricao" placeholder="Ex.: depósito do caixa no banco" maxLength={200} />
        </Campo>
        <Erro>{state?.erro}</Erro>
      </div>
      <Rodape onCancelar={fechar} pending={pending} rotulo="Transferir" />
    </form>
  );
}

export function RemoverTransferencia({ id, descricao }: { id: string; descricao: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="shrink-0 px-2 hover:text-danger"
      disabled={pending}
      aria-label={`Excluir transferência “${descricao}”`}
      onClick={() => {
        if (confirm("Excluir esta transferência? O valor volta para a conta de origem.")) start(() => removerTransferencia(id));
      }}
    >
      <Trash2 />
    </Button>
  );
}

/* ---------- Caixa do dia ---------- */

export function AbrirCaixa({
  contaId,
  sugestao,
  saldoSistema,
  ultimoContado,
}: {
  contaId: string;
  /** Em reais */
  sugestao: number;
  /** Em centavos */
  saldoSistema: number;
  ultimoContado: number | null;
}) {
  const { state, pending, onSubmit } = useFormAction(abrirCaixa.bind(null, contaId));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        Conte o dinheiro da gaveta e informe o valor para começar o dia.{" "}
        {ultimoContado != null ? `No último fechamento havia ${formatBRL(ultimoContado)}.` : `Saldo no sistema: ${brl(saldoSistema)}.`}
      </p>
      <Campo label="Valor de abertura (troco)" htmlFor="cx-abertura">
        <Input id="cx-abertura" name="valorAbertura" inputMode="decimal" defaultValue={valorTxt(Math.max(sugestao, 0))} className="text-right" />
      </Campo>
      <Campo label="Observação" hint="(opcional)" htmlFor="cx-obs-ab">
        <Input id="cx-obs-ab" name="observacao" maxLength={500} />
      </Campo>
      <Erro>{state?.erro}</Erro>
      <Button type="submit" variant="primary" disabled={pending} className="self-end">
        {pending ? "Abrindo…" : "Abrir caixa"}
      </Button>
    </form>
  );
}

export function FecharCaixa({ sessaoId, esperado }: { sessaoId: string; esperado: number }) {
  const { state, pending, onSubmit } = useFormAction(fecharCaixa.bind(null, sessaoId));
  const [contado, setContado] = useState("");
  const n = parseValor(contado);
  const dif = contado.trim() && Number.isFinite(n) ? Math.round(n * 100) - esperado : null;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 border-t border-border pt-4">
      <Campo label="Valor contado na gaveta" htmlFor="cx-contado">
        <Input
          id="cx-contado"
          name="valorContado"
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={contado}
          onChange={(e) => setContado(e.target.value)}
          required
          className="text-right"
          aria-describedby="cx-dif"
        />
      </Campo>
      <p id="cx-dif" aria-live="polite" className={cn("text-[13px] font-medium", dif === null ? "text-muted" : dif === 0 ? "text-ok" : dif > 0 ? "text-info" : "text-danger")}>
        {dif === null ? "Conte o dinheiro e digite o total." : dif === 0 ? "Confere com o esperado." : dif > 0 ? `Sobra de ${brl(dif)}` : `Falta de ${brl(-dif)}`}
      </p>
      <Campo label="Observação" hint={dif ? "(obrigatória quando há diferença)" : "(opcional)"} htmlFor="cx-obs">
        <Textarea id="cx-obs" name="observacao" rows={2} className="min-h-16" maxLength={500} required={!!dif} />
      </Campo>
      <Erro>{state?.erro}</Erro>
      <Button type="submit" variant="primary" disabled={pending} className="self-end">
        {pending ? "Fechando…" : "Fechar caixa"}
      </Button>
    </form>
  );
}

/* ---------- Conciliação ---------- */

/** Lê o arquivo no navegador (UTF-8 ou Windows-1252, comum nos bancos) e envia o texto */
export function ImportarOfx({ contaId }: { contaId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<CaixaState>();

  async function ler(arquivo: File) {
    setRes(undefined);
    if (arquivo.size > 900_000) return setRes({ erro: "Arquivo muito grande. Exporte um período menor." });
    const buf = await arquivo.arrayBuffer();
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      texto = new TextDecoder("windows-1252").decode(buf);
    }
    start(async () => {
      setRes(await importarOfx(contaId, texto));
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-hover focus-within:ring-3 focus-within:ring-zinc-900/20", pending && "opacity-50")}>
          <Upload className="size-4" aria-hidden />
          {pending ? "Importando…" : "Importar extrato OFX"}
          <input
            ref={input}
            type="file"
            accept=".ofx,.OFX,application/x-ofx"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const a = e.target.files?.[0];
              if (a) void ler(a);
            }}
          />
        </label>
        <span className="text-[13px] text-muted">Linhas já importadas são puladas.</span>
      </div>
      <Erro>{res?.erro}</Erro>
      {res?.msg && (
        <p role="status" className="rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok">
          {res.msg}
        </p>
      )}
    </div>
  );
}

type Opcao = { chave: string; rotulo: string };
type Cat = { id: string; nome: string };

export function AcoesConciliacao({
  item,
  opcoes,
  categorias,
}: {
  item: { id: string; data: string; valor: number; descricao: string | null };
  opcoes: Opcao[];
  categorias: Cat[];
}) {
  const [escolha, setEscolha] = useState(opcoes[0]?.chave ?? "");
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string>();
  const [criando, setCriando] = useState(false);

  return (
    <div className="flex flex-col gap-2 pl-0 sm:pl-15">
      {opcoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-3 py-2">
          <span className="text-[13px] text-muted">Sugestão:</span>
          {opcoes.length === 1 ? (
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{opcoes[0].rotulo}</span>
          ) : (
            <Select
              aria-label="Lançamento do sistema para conciliar"
              value={escolha}
              onChange={(e) => setEscolha(e.target.value)}
              className="h-9 min-w-0 flex-1 text-[13px]"
            >
              {opcoes.map((o) => (
                <option key={o.chave} value={o.chave}>
                  {o.rotulo}
                </option>
              ))}
            </Select>
          )}
          <Button
            variant="primary"
            className="h-8"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await conciliar(item.id, escolha);
                setErro(r?.erro);
              })
            }
          >
            <Check />
            Conciliar
          </Button>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button className="h-8" onClick={() => setCriando(true)} disabled={pending}>
          <Plus />
          Criar lançamento
        </Button>
        <Button variant="ghost" className="h-8" disabled={pending} onClick={() => start(() => ignorarItem(item.id, true))}>
          <EyeOff />
          Ignorar
        </Button>
      </div>
      <Erro>{erro}</Erro>
      <Janela
        id={`criar-${item.id}`}
        titulo={item.valor >= 0 ? "Novo recebimento" : "Novo pagamento"}
        aberta={criando}
        onFechar={() => setCriando(false)}
      >
        <FormCriar item={item} categorias={categorias} fechar={() => setCriando(false)} />
      </Janela>
    </div>
  );
}

function FormCriar({
  item,
  categorias,
  fechar,
}: {
  item: { id: string; data: string; valor: number; descricao: string | null };
  categorias: Cat[];
  fechar: () => void;
}) {
  const { state, pending, onSubmit } = useFormAction(criarDoExtrato.bind(null, item.id));
  useFecharAoSalvar(state, fechar);
  const pid = `cr-${item.id}`;
  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-[13px] text-muted">
          {item.data.split("-").reverse().join("/")} · <strong className="text-foreground tabular-nums">{brl(Math.abs(item.valor))}</strong>. Fica
          registrado como já {item.valor >= 0 ? "recebido" : "pago"} nesta conta e conciliado com a linha do banco.
        </p>
        <Campo label="Descrição" htmlFor={`${pid}-desc`}>
          <Input id={`${pid}-desc`} name="descricao" defaultValue={item.descricao?.slice(0, 200) ?? ""} required maxLength={200} />
        </Campo>
        <Campo label="Categoria" htmlFor={`${pid}-cat`}>
          <Select id={`${pid}-cat`} name="categoriaId" required defaultValue="">
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
        <Erro>{state?.erro}</Erro>
      </div>
      <Rodape onCancelar={fechar} pending={pending} rotulo="Criar e conciliar" />
    </form>
  );
}

export function DesfazerConciliacao({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" className="h-8" disabled={pending} onClick={() => start(() => ignorarItem(id, false))}>
      <Undo2 />
      Desfazer
    </Button>
  );
}
