"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Badge, Button, Campo, Card, CardHeader, Erro, Input } from "@/components/ui";
import { BotaoWhatsApp } from "@/components/botao-whatsapp";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { ativarRevisao, salvarRevisao } from "./revisoes-actions";

export type RevisaoItem = {
  id: string;
  descricao: string;
  intervaloMeses: number | null;
  intervaloKm: number | null;
  ultimaData: string | null;
  ultimoKm: number | null;
  proximaData: string | null;
  proximoKm: number | null;
  ativo: boolean;
  avisadoEm: string | null;
  osId: string | null;
  osNumero: number | null;
  situacao: "em_dia" | "chegando" | "vencida";
  previstaPara: string | null;
  kmEstimado: number | null;
  /** Texto do WhatsApp (modelo "revisao") */
  texto: string;
};

const SITUACAO = {
  em_dia: { label: "Em dia", tom: "ok" },
  chegando: { label: "Chegando", tom: "warn" },
  vencida: { label: "Vencida", tom: "danger" },
} as const;

const dia = (d: string) => d.split("-").reverse().join("/");
const km = (n: number) => `${n.toLocaleString("pt-BR")} km`;
const intervalo = (r: Pick<RevisaoItem, "intervaloMeses" | "intervaloKm">) =>
  [r.intervaloMeses && `${r.intervaloMeses} ${r.intervaloMeses === 1 ? "mês" : "meses"}`, r.intervaloKm && km(r.intervaloKm)]
    .filter(Boolean)
    .join(" ou ");

export function RevisoesVeiculo({
  veiculoId,
  itens,
  editavel,
  kmAtual,
  hoje,
  contato,
}: {
  veiculoId: string;
  itens: RevisaoItem[];
  editavel: boolean;
  kmAtual: number | null;
  hoje: string;
  contato: { clienteId: string; telefone: string | null; aceitaWhatsapp: boolean } | null;
}) {
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ativos = itens.filter((i) => i.ativo);
  const inativos = itens.filter((i) => !i.ativo);

  return (
    <Card>
      <CardHeader
        title="Revisões"
        action={
          editavel &&
          !novo && (
            <Button variant="ghost" onClick={() => setNovo(true)}>
              <Plus />
              Nova
            </Button>
          )
        }
      />
      {novo && (
        <div className="border-b border-border bg-subtle/60 px-4 py-4 sm:px-5">
          <FormRevisao veiculoId={veiculoId} kmAtual={kmAtual} hoje={hoje} onDone={() => setNovo(false)} />
        </div>
      )}
      {itens.length === 0 && !novo ? (
        <p className="px-5 py-4 text-[13px] text-muted">Nenhum lembrete. Serviços do catálogo com repetição criam lembretes na entrega da OS.</p>
      ) : (
        <ul className={cn("divide-y divide-border", pending && "opacity-60")}>
          {[...ativos, ...inativos].map((r) =>
            editando === r.id ? (
              <li key={r.id} className="bg-subtle/60 px-4 py-4 sm:px-5">
                <FormRevisao veiculoId={veiculoId} item={r} kmAtual={kmAtual} hoje={hoje} onDone={() => setEditando(null)} />
              </li>
            ) : (
              <li key={r.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:px-5", !r.ativo && "text-muted")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-medium", !r.ativo && "line-through")}>{r.descricao}</span>
                  {r.ativo ? (
                    <Badge tom={SITUACAO[r.situacao].tom}>{SITUACAO[r.situacao].label}</Badge>
                  ) : (
                    <Badge tom="neutro">Desativado</Badge>
                  )}
                  {r.ativo && r.avisadoEm && <span className="text-[12px] text-muted">Cliente avisado</span>}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[13px]">
                  <dt className="text-muted">Próxima</dt>
                  <dd>
                    {[r.proximaData && dia(r.proximaData), r.proximoKm != null && km(r.proximoKm)].filter(Boolean).join(" ou ") || "—"}
                    {r.ativo && r.previstaPara && r.previstaPara !== r.proximaData && (
                      <span className="text-muted"> · pelo uso, por volta de {dia(r.previstaPara)}</span>
                    )}
                  </dd>
                  <dt className="text-muted">Última vez</dt>
                  <dd>
                    {[r.ultimaData && dia(r.ultimaData), r.ultimoKm != null && km(r.ultimoKm)].filter(Boolean).join(" · ") || "—"}
                    {r.osId && r.osNumero != null && (
                      <>
                        {" · "}
                        <Link href={`/ordens-servico/${r.osId}`} className="underline-offset-4 hover:underline">
                          OS #{r.osNumero}
                        </Link>
                      </>
                    )}
                  </dd>
                  <dt className="text-muted">A cada</dt>
                  <dd>{intervalo(r) || "—"}</dd>
                </dl>
                <div className="flex flex-wrap items-center gap-1">
                  {r.ativo && contato && (
                    <BotaoWhatsApp
                      telefone={contato.telefone}
                      texto={r.texto}
                      registro={{ tipo: "revisao", clienteId: contato.clienteId, veiculoId, refId: r.id }}
                      variant="secondary"
                      confirmar={contato.aceitaWhatsapp ? undefined : "O cliente não deu consentimento para mensagens. Enviar mesmo assim?"}
                    />
                  )}
                  {editavel && (
                    <>
                      <Button variant="ghost" className="px-2" onClick={() => setEditando(r.id)} aria-label={`Editar ${r.descricao}`}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (r.ativo && !confirm(`Parar de lembrar “${r.descricao}”?`)) return;
                          start(async () => {
                            const res = await ativarRevisao(veiculoId, r.id, !r.ativo);
                            if (res?.erro) alert(res.erro);
                          });
                        }}
                      >
                        {r.ativo ? "Desativar" : "Reativar"}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}

function FormRevisao({
  veiculoId,
  item,
  kmAtual,
  hoje,
  onDone,
}: {
  veiculoId: string;
  item?: RevisaoItem;
  kmAtual: number | null;
  hoje: string;
  onDone: () => void;
}) {
  const { state, pending, onSubmit } = useFormAction(salvarRevisao.bind(null, veiculoId, item?.id ?? null));
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const pid = item?.id ?? "nova-revisao";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Campo label="Serviço" htmlFor={`${pid}-desc`}>
        <Input id={`${pid}-desc`} name="descricao" defaultValue={item?.descricao} required autoFocus={!item} placeholder="Troca de óleo e filtro" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="A cada (meses)" htmlFor={`${pid}-meses`}>
          <Input id={`${pid}-meses`} name="meses" inputMode="numeric" defaultValue={item?.intervaloMeses ?? ""} placeholder="6" />
        </Campo>
        <Campo label="A cada (km)" htmlFor={`${pid}-km`}>
          <Input id={`${pid}-km`} name="km" inputMode="numeric" defaultValue={item?.intervaloKm ?? ""} placeholder="10000" />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Última vez" htmlFor={`${pid}-data`}>
          <Input id={`${pid}-data`} name="ultimaData" type="date" max={hoje} defaultValue={item ? (item.ultimaData ?? "") : hoje} />
        </Campo>
        <Campo label="Km da última vez" htmlFor={`${pid}-ukm`}>
          <Input id={`${pid}-ukm`} name="ultimoKm" inputMode="numeric" defaultValue={item ? (item.ultimoKm ?? "") : (kmAtual ?? "")} />
        </Campo>
      </div>
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button variant="primary" disabled={pending}>
          {pending ? "Salvando…" : item ? "Salvar" : "Criar lembrete"}
        </Button>
      </div>
    </form>
  );
}
