"use client";

import { useState, useTransition } from "react";
import { Check, Copy, MessageCircle, Pencil, UserPlus } from "lucide-react";
import { Avatar, Badge, Button, Campo, Erro, Input, buttonClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { PAPEIS, type Papel } from "@/lib/permissoes";
import { cn } from "@/lib/utils";
import { alterarAtivo, atualizarMembro, cancelarConvite, criarConvite } from "./actions";

/* ---------- Papel ---------- */

function CamposAcesso({
  papeis,
  inicial,
}: {
  papeis: Papel[];
  inicial?: { papel: Papel };
}) {

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-medium text-foreground-2">Papel</legend>
        {papeis.map((p) => (
          <label
            key={p}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-subtle has-[:checked]:border-primary has-[:checked]:bg-subtle"
          >
            <input
              type="radio"
              name="papel"
              value={p}
              defaultChecked={(inicial?.papel ?? "atendente") === p}
              className="mt-0.5 size-4 cursor-pointer accent-zinc-900"
              required
            />
            <span>
              <span className="block text-sm font-medium">{PAPEIS[p].label}</span>
              <span className="block text-[13px] text-muted">{PAPEIS[p].descricao}</span>
            </span>
          </label>
        ))}
      </fieldset>

    </div>
  );
}

/* ---------- Convidar ---------- */

export function ConvidarForm({ papeis }: { papeis: Papel[] }) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState(0);
  const { state, pending, onSubmit } = useFormAction(async (prev: Awaited<ReturnType<typeof criarConvite>>, form: FormData) => {
    const r = await criarConvite(prev, form);
    if (r?.ok) {
      setAberto(false);
      setChave((k) => k + 1);
    }
    return r;
  });

  if (!aberto) {
    return (
      <Button variant="primary" onClick={() => setAberto(true)}>
        <UserPlus />
        Convidar pessoa
      </Button>
    );
  }

  return (
    <form key={chave} onSubmit={onSubmit} className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 shadow-card">
      <div>
        <h3 className="text-[15px] font-semibold">Novo convite</h3>
        <p className="text-[13px] text-muted">
          A pessoa entra com a conta dela ou cria uma. O link vale 7 dias e só pode ser usado uma vez.
        </p>
      </div>
      <Campo label="Nome" hint="(para identificar o convite)" htmlFor="cv-nome">
        <Input id="cv-nome" name="nome" required minLength={2} maxLength={80} placeholder="Ex.: João (sócio)" />
      </Campo>
      <CamposAcesso papeis={papeis} />
      <Erro>{state?.erro}</Erro>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Gerando…" : "Gerar link do convite"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function ConvitePendente({
  id,
  nome,
  papel,
  expira,
  url,
  whatsapp,
  podeCancelar,
}: {
  id: string;
  nome: string;
  papel: Papel;
  expira: string;
  url: string;
  whatsapp: string;
  podeCancelar: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const [pending, start] = useTransition();

  return (
    <li className={cn("flex flex-col gap-3 px-4 py-3.5 sm:px-5", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{nome}</span>
        <span className="text-[13px] text-muted">
          {PAPEIS[papel].label} · vale até {expira}
        </span>
      </div>
      <div className="flex min-w-0 items-center rounded-md border border-border bg-subtle px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground-2" title={url}>
          {url}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={whatsapp} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
          <MessageCircle />
          Enviar no WhatsApp
        </a>
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          {copiado ? <Check /> : <Copy />}
          {copiado ? "Copiado" : "Copiar link"}
        </Button>
        {podeCancelar && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`Cancelar o convite de ${nome}?`)) start(() => cancelarConvite(id));
            }}
            className="ml-auto text-[13px] text-muted underline-offset-4 hover:text-danger hover:underline"
          >
            Cancelar convite
          </button>
        )}
      </div>
    </li>
  );
}

/* ---------- Membro ---------- */

export function MembroLinha({
  membro,
  voce,
  editavel,
  papeis,
}: {
  membro: { id: string; nome: string | null; email: string | null; papel: Papel; ativo: boolean };
  voce: boolean;
  editavel: boolean;
  papeis: Papel[];
}) {
  const [editando, setEditando] = useState(false);
  const [pending, start] = useTransition();
  const [erroAtivo, setErroAtivo] = useState<string>();
  const { state, pending: salvando, onSubmit } = useFormAction(async (prev: Awaited<ReturnType<typeof atualizarMembro>>, form: FormData) => {
    const r = await atualizarMembro(membro.id, prev, form);
    if (r?.ok) setEditando(false);
    return r;
  });
  const nome = membro.nome || membro.email || "Usuário";

  return (
    <li className={cn("flex flex-col gap-3 px-4 py-3.5 sm:px-5", (pending || !membro.ativo) && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar nome={nome} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-medium">
            <span className="truncate">{nome}</span>
            {voce && <span className="text-[13px] font-normal text-muted">(você)</span>}
            {!membro.ativo && <Badge tom="danger">Desativado</Badge>}
          </p>
          <p className="truncate text-[13px] text-muted">
            {[membro.nome && membro.email, PAPEIS[membro.papel].label].filter(Boolean).join(" · ")}
          </p>
        </div>
        {editavel && !editando && (
          <div className="flex items-center gap-1.5">
            {membro.ativo && (
              <Button variant="ghost" className="px-2.5" onClick={() => setEditando(true)} aria-label={`Alterar acesso de ${nome}`}>
                <Pencil />
              </Button>
            )}
            <Button
              disabled={pending}
              onClick={() => {
                const ativar = !membro.ativo;
                if (!ativar && !confirm(`Desativar ${nome}? A pessoa deixa de acessar a oficina na hora.`)) return;
                setErroAtivo(undefined);
                start(async () => {
                  const r = await alterarAtivo(membro.id, ativar);
                  if (r?.erro) setErroAtivo(r.erro);
                });
              }}
            >
              {membro.ativo ? "Desativar" : "Reativar"}
            </Button>
          </div>
        )}
      </div>
      <Erro>{erroAtivo}</Erro>

      {editando && (
        <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-lg border border-border bg-subtle/60 p-4">
          <CamposAcesso papeis={papeis} inicial={membro} />
          <Erro>{state?.erro}</Erro>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar acesso"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
