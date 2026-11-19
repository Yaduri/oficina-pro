"use client";

import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Badge, Button, Campo, Erro, Input, Select, buttonClass } from "@/components/ui";
import { formatBRL } from "@/lib/utils";
import { BotaoWhatsApp } from "@/components/botao-whatsapp";
import { carregarCobranca, gerarCobrancaAcao, operarCobranca, qrCodeCobranca, type CobrancaState } from "./cobranca-actions";
import type { CobrancaVisivel, DadosCobranca } from "./cobranca-dados";

const brl = (c: number) => formatBRL(c / 100);
/** "AAAA-MM-DD" → "DD/MM/AAAA" */
const dataBR = (d: string) => d.split("-").reverse().join("/");

type QrCode = { imagem: string; copiaECola: string; expiraEm: string | null } | null;

/**
 * Painel de cobrança online (Asaas) de uma conta a receber.
 * Sem `inicial`, carrega os dados ao montar (ex.: aberto pela OS).
 */
export function CobrancaOnline({ lancamentoId, inicial }: { lancamentoId: string; inicial?: DadosCobranca }) {
  const [dados, setDados] = useState<DadosCobranca | undefined>(inicial);
  const [erro, setErro] = useState<string>();
  const [pending, start] = useTransition();

  useEffect(() => {
    if (inicial) return;
    let vivo = true;
    carregarCobranca(lancamentoId).then((r) => {
      if (!vivo) return;
      if (r?.dados) setDados(r.dados);
      setErro(r?.erro);
    });
    return () => {
      vivo = false;
    };
  }, [lancamentoId, inicial]);

  function aplicar(r: CobrancaState) {
    if (r?.dados) setDados(r.dados);
    setErro(r?.erro);
  }

  function operar(cobrancaId: string, op: "atualizar" | "cancelar" | "simular") {
    if (op === "cancelar" && !confirm("Cancelar esta cobrança? O link e o PIX deixam de valer.")) return;
    setErro(undefined);
    start(async () => aplicar(await operarCobranca(lancamentoId, cobrancaId, op)));
  }

  function gerar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErro(undefined);
    start(async () => aplicar(await gerarCobrancaAcao(lancamentoId, undefined, form)));
  }

  if (!dados) {
    return erro ? <Erro>{erro}</Erro> : <p className="text-[13px] text-muted">Carregando…</p>;
  }

  const { pendente, historico } = dados;

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      {pendente ? (
        <Pendente
          c={pendente}
          dados={dados}
          pending={pending}
          onAtualizar={() => operar(pendente.id, "atualizar")}
          onCancelar={() => operar(pendente.id, "cancelar")}
          onSimular={() => operar(pendente.id, "simular")}
        />
      ) : dados.emAberto ? (
        <NovaCobranca dados={dados} pending={pending} onSubmit={gerar} />
      ) : null}

      <Erro>{erro}</Erro>

      {historico.length > 0 && (
        <div>
          <h3 className="mb-1.5 font-medium text-foreground-2">Cobranças anteriores</h3>
          <ul className="flex flex-col gap-1.5">
            {historico.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-foreground-2">
                  {dataBR(c.criadoEm)} · {c.tipo} · <span className="tabular-nums">{brl(c.valor)}</span>
                  {c.pagoEm && <> · paga em {dataBR(c.pagoEm)}</>}
                </span>
                <Badge tom={c.tom}>{c.situacaoLabel}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NovaCobranca({ dados, pending, onSubmit }: { dados: DadosCobranca; pending: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  const uid = useId();
  if (!dados.ambiente) {
    return (
      <p className="text-foreground-2">
        Para cobrar por PIX ou link de pagamento,{" "}
        <Link href="/financeiro/configuracoes" className="font-medium text-foreground underline">
          conecte a conta do Asaas
        </Link>
        .
      </p>
    );
  }
  if (!dados.cliente) return <p className="text-foreground-2">Escolha o cliente desta conta para gerar a cobrança.</p>;
  if (dados.aberto < 500) return <p className="text-foreground-2">O Asaas só cobra a partir de R$ 5,00.</p>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-foreground-2">
        Cobrança de <span className="font-medium text-foreground tabular-nums">{brl(dados.aberto)}</span> para {dados.cliente.nome}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Forma" htmlFor={`${uid}-tipo`}>
          <Select id={`${uid}-tipo`} name="tipo" defaultValue="PIX">
            {dados.tipos.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label="Vencimento" htmlFor={`${uid}-venc`}>
          <Input id={`${uid}-venc`} name="vencimento" type="date" min={dados.hoje} defaultValue={dados.vencimentoPadrao} required />
        </Campo>
        {!dados.cliente.temDocumento && (
          <Campo label="CPF ou CNPJ do cliente" htmlFor={`${uid}-doc`}>
            <Input id={`${uid}-doc`} name="documento" inputMode="numeric" autoComplete="off" required />
          </Campo>
        )}
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Gerando…" : "Gerar cobrança"}
        </Button>
      </div>
    </form>
  );
}

function Pendente({
  c,
  dados,
  pending,
  onAtualizar,
  onCancelar,
  onSimular,
}: {
  c: CobrancaVisivel;
  dados: DadosCobranca;
  pending: boolean;
  onAtualizar: () => void;
  onCancelar: () => void;
  onSimular: () => void;
}) {
  // QR Code buscado no Asaas ao abrir; guardado junto com o id da cobrança a que pertence
  const [qr, setQr] = useState<{ id: string; qr: QrCode }>();
  useEffect(() => {
    if (!c.temPix) return;
    let vivo = true;
    qrCodeCobranca(c.id).then((r) => {
      if (vivo) setQr({ id: c.id, qr: r });
    });
    return () => {
      vivo = false;
    };
  }, [c.id, c.temPix]);
  const qrAtual = qr?.id === c.id ? qr.qr : undefined;
  const copiaECola = qrAtual?.copiaECola ?? c.pixCopiaECola;

  const nome = dados.cliente?.nome.split(" ")[0];
  const textoWhats = c.linkPagamento && `Olá${nome ? `, ${nome}` : ""}. Segue o link para pagamento de ${brl(c.valor)}: ${c.linkPagamento}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold tabular-nums">{brl(c.valor)}</p>
          <p className="text-foreground-2">
            {c.tipo} · vence {dataBR(c.vencimento)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.vencida && <Badge tom="danger">Vencida</Badge>}
          <Badge tom={c.tom}>{c.situacaoLabel}</Badge>
        </div>
      </div>

      {c.temPix && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="grid size-40 shrink-0 place-items-center rounded-md border border-border bg-white">
            {qrAtual ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem base64 vinda do Asaas
              <img src={qrAtual.imagem} alt="QR Code PIX da cobrança" className="size-full rounded-md object-contain p-1.5" />
            ) : (
              <span className="px-3 text-center text-xs text-muted">{qrAtual === null ? "QR Code indisponível" : "Carregando QR Code…"}</span>
            )}
          </div>
          {copiaECola && (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="font-medium text-foreground-2">PIX copia e cola</span>
              <p className="break-all rounded-md bg-subtle px-2.5 py-2 font-mono text-xs">{copiaECola}</p>
              <div>
                <BotaoCopiar texto={copiaECola} rotulo="Copiar PIX" />
              </div>
            </div>
          )}
        </div>
      )}

      {c.linkPagamento && (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-foreground-2">Link de pagamento</span>
          <p className="truncate rounded-md bg-subtle px-2.5 py-2 text-xs">{c.linkPagamento}</p>
          <div className="flex flex-wrap gap-2">
            {textoWhats && (
              <BotaoWhatsApp
                telefone={dados.cliente?.telefone ?? null}
                texto={textoWhats}
                registro={{ tipo: "cobranca", refId: dados.lancamentoId, osId: dados.osId }}
                variant="primary"
                label="Enviar pelo WhatsApp"
              />
            )}
            <BotaoCopiar texto={c.linkPagamento} rotulo="Copiar link" />
            <a href={c.linkPagamento} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <ExternalLink />
              Abrir
            </a>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="button" onClick={onAtualizar} disabled={pending} aria-busy={pending || undefined}>
          <RefreshCw />
          Atualizar
        </Button>
        {dados.ambiente === "sandbox" && (
          <Button type="button" onClick={onSimular} disabled={pending}>
            Simular pagamento (teste)
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancelar} disabled={pending}>
          Cancelar cobrança
        </Button>
      </div>
    </div>
  );
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? <Check /> : <Copy />}
      {copiado ? "Copiado" : rotulo}
    </Button>
  );
}
