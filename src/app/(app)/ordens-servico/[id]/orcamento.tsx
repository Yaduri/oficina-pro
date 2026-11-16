"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, MessageCircle, Send } from "lucide-react";
import { Badge, Button, Campo, Card, CardHeader, Erro, Select, Textarea, buttonClass, type Tom } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { cancelarOrcamento, enviarOrcamento } from "../actions";

export type ResumoOrcamento = {
  status: { label: string; tom: Tom };
  pendente: boolean;
  respondido: boolean;
  url: string;
  whatsapp: string;
  enviadoEm: string;
  validoAte: string;
  vencido: boolean;
  vistoEm: string | null;
  respondidoEm: string | null;
  respostaNome: string | null;
  respostaComentario: string | null;
  total: string;
  totalAprovado: string | null;
  recusados: number;
  desatualizado: boolean;
};

export function OrcamentoOS({
  osId,
  orcamento,
  podeEnviar,
  semItens,
}: {
  osId: string;
  orcamento: ResumoOrcamento | null;
  podeEnviar: boolean;
  semItens: boolean;
}) {
  const [novo, setNovo] = useState(false);
  const mostrarForm = podeEnviar && (!orcamento || novo);

  return (
    <Card>
      <CardHeader title="Orçamento" action={orcamento && <Badge tom={orcamento.status.tom}>{orcamento.status.label}</Badge>} />
      <div className="flex flex-col gap-4 px-5 py-4">
        {orcamento && <Detalhes osId={osId} o={orcamento} />}

        {mostrarForm ? (
          <EnviarForm osId={osId} semItens={semItens} reenvio={!!orcamento} onDone={() => setNovo(false)} onCancel={orcamento ? () => setNovo(false) : undefined} />
        ) : (
          podeEnviar && (
            <Button className="self-start" onClick={() => setNovo(true)}>
              <Send />
              {orcamento?.pendente ? "Gerar link atualizado" : "Enviar novo orçamento"}
            </Button>
          )
        )}
        {!orcamento && !podeEnviar && <p className="text-[13px] text-muted">Nenhum orçamento enviado.</p>}
      </div>
    </Card>
  );
}

function Detalhes({ osId, o }: { osId: string; o: ResumoOrcamento }) {
  const [copiado, setCopiado] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {o.desatualizado && o.pendente && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-foreground">
          Os itens mudaram depois do envio. Gere um link atualizado para o cliente ver os valores certos.
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted">Enviado</dt>
        <dd>{o.enviadoEm}</dd>
        <dt className="text-muted">Valor</dt>
        <dd className="tabular-nums">{o.total}</dd>
        {o.pendente && (
          <>
            <dt className="text-muted">Validade</dt>
            <dd className={o.vencido ? "text-danger" : undefined}>{o.vencido ? `Venceu em ${o.validoAte}` : `Até ${o.validoAte}`}</dd>
            <dt className="text-muted">Cliente</dt>
            <dd>{o.vistoEm ? `Abriu o link ${o.vistoEm}` : "Ainda não abriu o link"}</dd>
          </>
        )}
        {o.respondido && (
          <>
            <dt className="text-muted">Resposta</dt>
            <dd>
              {o.respostaNome}, {o.respondidoEm}
            </dd>
            {o.totalAprovado && (
              <>
                <dt className="text-muted">Aprovado</dt>
                <dd className="font-medium tabular-nums">{o.totalAprovado}</dd>
              </>
            )}
            {o.recusados > 0 && (
              <>
                <dt className="text-muted">Recusados</dt>
                <dd>
                  {o.recusados} {o.recusados === 1 ? "item" : "itens"}
                </dd>
              </>
            )}
          </>
        )}
      </dl>

      {o.respostaComentario && (
        <blockquote className="whitespace-pre-line rounded-md border-l-2 border-border-strong bg-subtle px-3 py-2 text-[13px]">
          {o.respostaComentario}
        </blockquote>
      )}

      {o.pendente && !o.vencido && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-subtle px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground-2" title={o.url}>
              {o.url}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={o.whatsapp} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
              <MessageCircle />
              Enviar no WhatsApp
            </a>
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(o.url);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
            >
              {copiado ? <Check /> : <Copy />}
              {copiado ? "Copiado" : "Copiar link"}
            </Button>
            <a href={o.url} target="_blank" rel="noreferrer" className={buttonClass("ghost", "px-2.5")} aria-label="Abrir página do cliente" title="Abrir página do cliente">
              <ExternalLink />
            </a>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Cancelar este link? O cliente não poderá mais responder por ele.")) start(() => cancelarOrcamento(osId));
            }}
            className="self-start text-[13px] text-muted underline-offset-4 hover:text-danger hover:underline disabled:opacity-50"
          >
            Cancelar link
          </button>
        </div>
      )}
    </div>
  );
}

function EnviarForm({
  osId,
  semItens,
  reenvio,
  onDone,
  onCancel,
}: {
  osId: string;
  semItens: boolean;
  reenvio: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { state, pending, onSubmit } = useFormAction(async (prev: Awaited<ReturnType<typeof enviarOrcamento>>, form: FormData) => {
    const r = await enviarOrcamento(osId, prev, form);
    if (r?.ok) onDone();
    return r;
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {!reenvio && (
        <p className="text-[13px] text-muted">
          O cliente recebe um link, vê as peças e serviços e aprova pelo celular, item por item. A OS passa para
          “Aguardando aprovação” e, quando ele aprova, vai para “Em execução”.
        </p>
      )}
      <Campo label="Observações para o cliente" hint="(opcional)" htmlFor="obs-orcamento">
        <Textarea id="obs-orcamento" name="observacao" rows={2} className="min-h-16" placeholder="Ex.: garantia de 90 dias, prazo de 2 dias úteis" />
      </Campo>
      <Campo label="Validade" htmlFor="dias-orcamento">
        <Select id="dias-orcamento" name="dias" defaultValue="15" className="h-10">
          <option value="3">3 dias</option>
          <option value="7">7 dias</option>
          <option value="15">15 dias</option>
          <option value="30">30 dias</option>
        </Select>
      </Campo>
      <Erro>{state?.erro}</Erro>
      {semItens && <p className="text-[13px] text-muted">Adicione peças ou serviços para enviar o orçamento.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending || semItens}>
          <Send />
          {pending ? "Gerando…" : "Gerar link do orçamento"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
