"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Campo, Card, CardHeader, Erro, Input, Select } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatBRL } from "@/lib/utils";
import {
  alternarCategoria,
  conectarAsaasAction,
  desconectarAsaasAction,
  alternarConta,
  removerCategoria,
  removerConta,
  salvarCategoria,
  salvarConta,
  salvarTaxas,
} from "./actions";

const TIPOS = { caixa: "Caixa (dinheiro)", banco: "Conta no banco", maquininha: "Maquininha (a receber)" } as const;
type TipoConta = keyof typeof TIPOS;
const valorTxt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (d: string) => d.split("-").reverse().join("/");

/** Confirma, executa e mostra o erro/aviso que voltar */
function useAcao() {
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ erro?: string; info?: string }>();
  const rodar = (fn: () => Promise<{ erro?: string; desativada?: boolean } | undefined>, msgDesativada?: string) =>
    start(async () => {
      const r = await fn();
      setAviso(r?.erro ? { erro: r.erro } : r?.desativada ? { info: msgDesativada } : undefined);
    });
  return { pending, aviso, rodar };
}

function Aviso({ aviso }: { aviso?: { erro?: string; info?: string } }) {
  if (aviso?.erro) return <div className="px-4 pb-3 sm:px-5"><Erro>{aviso.erro}</Erro></div>;
  if (aviso?.info)
    return (
      <p role="status" className="mx-4 mb-3 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info sm:mx-5">
        {aviso.info}
      </p>
    );
  return null;
}

/* ---------- Contas ---------- */

type Conta = { id: string; nome: string; tipo: TipoConta; saldoInicial: number; saldoInicialEm: string; ativo: boolean };

function FormConta({ conta, hoje, onDone }: { conta?: Conta; hoje: string; onDone?: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useFormAction(salvarConta.bind(null, conta?.id ?? null));
  useEffect(() => {
    if (!state?.ok) return;
    if (conta) onDone?.();
    else form.current?.reset();
  }, [state, conta, onDone]);
  const pid = conta?.id ?? "nova-conta";
  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nome" htmlFor={`${pid}-nome`}>
          <Input id={`${pid}-nome`} name="nome" defaultValue={conta?.nome} required maxLength={60} placeholder="Ex.: Banco do Brasil" />
        </Campo>
        <Campo label="Tipo" htmlFor={`${pid}-tipo`}>
          <Select id={`${pid}-tipo`} name="tipo" defaultValue={conta?.tipo ?? "banco"}>
            {Object.entries(TIPOS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label="Saldo inicial" htmlFor={`${pid}-saldo`}>
          <Input
            id={`${pid}-saldo`}
            name="saldoInicial"
            inputMode="decimal"
            placeholder="R$ 0,00"
            defaultValue={conta ? valorTxt(conta.saldoInicial) : ""}
            className="text-right"
          />
        </Campo>
        <Campo label="Saldo em" htmlFor={`${pid}-desde`}>
          <Input id={`${pid}-desde`} name="saldoInicialEm" type="date" defaultValue={conta?.saldoInicialEm ?? hoje} required />
        </Campo>
      </div>
      <p className="text-[12px] text-muted">O saldo é calculado a partir dessa data: movimentos anteriores não contam.</p>
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" disabled={pending}>
          {!conta && <Plus />}
          {pending ? "Salvando…" : conta ? "Salvar" : "Adicionar conta"}
        </Button>
      </div>
    </form>
  );
}

export function ListaContas({ contas, hoje }: { contas: Conta[]; hoje: string }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const { pending, aviso, rodar } = useAcao();

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Contas"
        action={
          !nova && (
            <Button onClick={() => setNova(true)}>
              <Plus />
              Nova conta
            </Button>
          )
        }
      />
      {nova && (
        <div className="border-b border-border bg-subtle/60 px-4 py-4 sm:px-5">
          <FormConta hoje={hoje} onDone={() => setNova(false)} />
        </div>
      )}
      <ul className={cn("divide-y divide-border", pending && "opacity-60")}>
        {contas.map((c) =>
          editando === c.id ? (
            <li key={c.id} className="bg-subtle/60 px-4 py-4 sm:px-5">
              <FormConta conta={c} hoje={hoje} onDone={() => setEditando(null)} />
            </li>
          ) : (
            <li key={c.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5", !c.ativo && "text-muted")}>
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-medium">{c.nome}</p>
                <p className="text-[12px] text-muted">
                  {TIPOS[c.tipo]} · saldo inicial {formatBRL(c.saldoInicial)} em {dia(c.saldoInicialEm)}
                  {!c.ativo && " · Desativada"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <label className="flex cursor-pointer items-center gap-1.5 px-1.5 text-[12px] text-muted">
                  <input
                    type="checkbox"
                    checked={c.ativo}
                    onChange={(e) => rodar(() => alternarConta(c.id, e.target.checked))}
                    className="size-4 accent-zinc-900"
                    aria-label={`Conta “${c.nome}” ativa`}
                  />
                  Ativa
                </label>
                <Button variant="ghost" className="px-2" onClick={() => setEditando(c.id)} aria-label={`Editar ${c.nome}`}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  className="px-2 hover:text-danger"
                  aria-label={`Remover ${c.nome}`}
                  onClick={() => {
                    if (confirm(`Remover a conta “${c.nome}”? Se ela já tem movimentos, será só desativada.`))
                      rodar(() => removerConta(c.id), `“${c.nome}” tem movimentos: foi desativada em vez de removida.`);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>
      <Aviso aviso={aviso} />
    </Card>
  );
}

/* ---------- Categorias ---------- */

type Categoria = { id: string; tipo: "receita" | "despesa"; nome: string; grupoDre: string; sistema: boolean; ativo: boolean };
type Grupo = { id: string; label: string; tipo: string };

function FormCategoria({
  tipo,
  categoria,
  grupos,
  onDone,
}: {
  tipo: "receita" | "despesa";
  categoria?: Categoria;
  grupos: Grupo[];
  onDone?: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useFormAction(salvarCategoria.bind(null, categoria?.id ?? null));
  useEffect(() => {
    if (!state?.ok) return;
    if (categoria) onDone?.();
    else form.current?.reset();
  }, [state, categoria, onDone]);
  const pid = categoria?.id ?? `nova-cat-${tipo}`;
  const opcoes = grupos.filter((g) => g.tipo === tipo);
  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="tipo" value={tipo} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nome" htmlFor={`${pid}-nome`}>
          <Input id={`${pid}-nome`} name="nome" defaultValue={categoria?.nome} required maxLength={60} />
        </Campo>
        <Campo label="Grupo na DRE" htmlFor={`${pid}-grupo`}>
          <Select id={`${pid}-grupo`} name="grupoDre" defaultValue={categoria?.grupoDre ?? opcoes[opcoes.length - 1]?.id}>
            {opcoes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" disabled={pending}>
          {!categoria && <Plus />}
          {pending ? "Salvando…" : categoria ? "Salvar" : "Adicionar"}
        </Button>
      </div>
    </form>
  );
}

export function ListaCategorias({ categorias, grupos }: { categorias: Categoria[]; grupos: Grupo[] }) {
  const [tipo, setTipo] = useState<"receita" | "despesa">("despesa");
  const [editando, setEditando] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const { pending, aviso, rodar } = useAcao();
  const lista = categorias.filter((c) => c.tipo === tipo);
  const rotuloGrupo = (id: string) => grupos.find((g) => g.id === id)?.label ?? id;

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Categorias"
        action={
          !nova && (
            <Button onClick={() => setNova(true)}>
              <Plus />
              Nova categoria
            </Button>
          )
        }
      />
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <div role="group" aria-label="Tipo de categoria" className="flex gap-1 rounded-md bg-subtle p-1 text-[13px] font-medium sm:w-fit">
          {(
            [
              ["despesa", "Despesas"],
              ["receita", "Receitas"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={tipo === v}
              onClick={() => {
                setTipo(v);
                setEditando(null);
              }}
              className={cn(
                "flex-1 cursor-pointer rounded px-4 py-1.5 sm:flex-none",
                tipo === v ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {nova && (
        <div className="border-b border-border bg-subtle/60 px-4 py-4 sm:px-5">
          <FormCategoria key={tipo} tipo={tipo} grupos={grupos} onDone={() => setNova(false)} />
        </div>
      )}
      <ul className={cn("divide-y divide-border", pending && "opacity-60")}>
        {lista.map((c) =>
          editando === c.id ? (
            <li key={c.id} className="bg-subtle/60 px-4 py-4 sm:px-5">
              <FormCategoria tipo={c.tipo} categoria={c} grupos={grupos} onDone={() => setEditando(null)} />
            </li>
          ) : (
            <li key={c.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5", !c.ativo && "text-muted")}>
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex items-center gap-2 font-medium">
                  {c.nome}
                  {c.sistema && (
                    <Badge className="gap-1">
                      <Lock className="size-3" aria-hidden />
                      Sistema
                    </Badge>
                  )}
                </p>
                <p className="text-[12px] text-muted">
                  {rotuloGrupo(c.grupoDre)}
                  {!c.ativo && " · Desativada"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!c.sistema && (
                  <label className="flex cursor-pointer items-center gap-1.5 px-1.5 text-[12px] text-muted">
                    <input
                      type="checkbox"
                      checked={c.ativo}
                      onChange={(e) => rodar(() => alternarCategoria(c.id, e.target.checked))}
                      className="size-4 accent-zinc-900"
                      aria-label={`Categoria “${c.nome}” ativa`}
                    />
                    Ativa
                  </label>
                )}
                <Button variant="ghost" className="px-2" onClick={() => setEditando(c.id)} aria-label={`Editar ${c.nome}`}>
                  <Pencil />
                </Button>
                {!c.sistema && (
                  <Button
                    variant="ghost"
                    className="px-2 hover:text-danger"
                    aria-label={`Remover ${c.nome}`}
                    onClick={() => {
                      if (confirm(`Remover a categoria “${c.nome}”? Se já foi usada, será só desativada.`))
                        rodar(() => removerCategoria(c.id), `“${c.nome}” já foi usada: foi desativada em vez de removida.`);
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {lista.length === 0 && <p className="px-5 py-6 text-center text-[13px] text-muted">Nenhuma categoria.</p>}
      <Aviso aviso={aviso} />
    </Card>
  );
}

/* ---------- Taxas da maquininha ---------- */

export function FormTaxas({ taxas }: { taxas: { debito: number; credito: number; creditoParcelado: number } }) {
  const { state, pending, onSubmit } = useFormAction(salvarTaxas);
  const pct = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const campos = [
    ["debito", "Débito", taxas.debito],
    ["credito", "Crédito à vista", taxas.credito],
    ["creditoParcelado", "Crédito parcelado", taxas.creditoParcelado],
  ] as const;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-[13px] text-muted">Usadas para calcular a taxa ao receber em cartão (na entrega da OS). Entram como “Taxas de cartão” na DRE.</p>
      {campos.map(([nome, label, v]) => (
        <Campo key={nome} label={label} hint="(%)" htmlFor={`taxa-${nome}`}>
          <Input id={`taxa-${nome}`} name={nome} inputMode="decimal" defaultValue={pct(v)} className="text-right" aria-describedby="taxa-ajuda" />
        </Campo>
      ))}
      <p id="taxa-ajuda" className="sr-only">
        Percentual entre 0 e 30
      </p>
      <Erro>{state?.erro}</Erro>
      {state?.ok && (
        <p role="status" className="text-[13px] text-ok">
          Taxas salvas.
        </p>
      )}
      <Button variant="primary" disabled={pending} className="self-end">
        {pending ? "Salvando…" : "Salvar taxas"}
      </Button>
    </form>
  );
}

/* ---------- Cobrança online (Asaas) ---------- */

type GatewayResumo = {
  ambiente: "sandbox" | "producao";
  titular: string | null;
  apiKeyFinal: string;
  conta: string | null;
  webhookAtivo: boolean;
};

function FormAsaas({
  emailPadrao,
  onCancel,
  onConectado,
}: {
  emailPadrao: string;
  onCancel?: () => void;
  onConectado: (aviso?: string) => void;
}) {
  const { state, pending, onSubmit } = useFormAction(conectarAsaasAction);
  useEffect(() => {
    if (state?.ok) onConectado(state.aviso);
  }, [state, onConectado]);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-[13px] text-muted">
        A oficina precisa de uma conta própria no Asaas. A chave fica em Asaas › Integrações › Chave de API. Chaves de teste (sandbox) começam com
        $aact_hmlg_ e de produção com $aact_prod_.
      </p>
      <Campo label="Chave de API" htmlFor="asaas-chave">
        <Input id="asaas-chave" name="apiKey" type="password" required autoComplete="off" spellCheck={false} placeholder="$aact_…" />
      </Campo>
      <Campo label="E-mail para avisos de falha" htmlFor="asaas-email">
        <Input id="asaas-email" name="email" type="email" required defaultValue={emailPadrao} />
      </Campo>
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" disabled={pending}>
          {pending ? "Conectando…" : "Conectar"}
        </Button>
      </div>
    </form>
  );
}

export function CobrancaOnline({ gateway, emailPadrao }: { gateway: GatewayResumo | null; emailPadrao: string }) {
  const [trocando, setTrocando] = useState(false);
  const [aviso, setAviso] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [pending, start] = useTransition();

  // O aviso da conexão (ex.: webhook não criado) continua visível depois de conectado
  const conectado = useCallback((a?: string) => {
    setAviso(a);
    setErro(undefined);
    setTrocando(false);
  }, []);

  const desconectar = () => {
    if (!confirm("Desconectar o Asaas? As cobranças já geradas continuam registradas.")) return;
    start(async () => {
      const r = await desconectarAsaasAction();
      setErro(r?.erro);
      setAviso(undefined);
      setTrocando(false);
    });
  };

  return (
    <Card>
      <CardHeader title="Cobrança online" />
      <div className="flex flex-col gap-3 p-5">
        {gateway && !trocando ? (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-muted">Ambiente</dt>
              <dd>
                <Badge tom={gateway.ambiente === "producao" ? "ok" : "warn"}>{gateway.ambiente === "producao" ? "Produção" : "Sandbox (teste)"}</Badge>
              </dd>
              <dt className="text-muted">Titular</dt>
              <dd className="truncate">{gateway.titular ?? "Não informado"}</dd>
              <dt className="text-muted">Chave</dt>
              <dd className="tabular-nums">…{gateway.apiKeyFinal}</dd>
              <dt className="text-muted">Recebe em</dt>
              <dd className="truncate">{gateway.conta ?? "Conta não encontrada"}</dd>
              <dt className="text-muted">Aviso automático</dt>
              <dd>{gateway.webhookAtivo ? "Ativo" : "Inativo: use “Atualizar” na cobrança"}</dd>
            </dl>
            {aviso && (
              <p role="status" className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
                {aviso}
              </p>
            )}
            <Erro>{erro}</Erro>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={desconectar}>
                {pending ? "Desconectando…" : "Desconectar"}
              </Button>
              <Button type="button" disabled={pending} onClick={() => setTrocando(true)}>
                Trocar chave
              </Button>
            </div>
          </>
        ) : (
          <FormAsaas emailPadrao={emailPadrao} onCancel={gateway ? () => setTrocando(false) : undefined} onConectado={conectado} />
        )}
      </div>
    </Card>
  );
}
