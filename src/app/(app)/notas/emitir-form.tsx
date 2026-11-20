"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, FileCheck2 } from "lucide-react";
import { Badge, Button, Campo, Erro, Input, Select, Textarea } from "@/components/ui";
import { CODIGOS_SERVICO_OFICINA, MOTIVOS_SUBSTITUICAO_NFSE } from "@/lib/fiscal/tipos";
import { useFormAction } from "@/lib/use-form-action";
import { formatBRL, formatDocumento } from "@/lib/utils";
import { emitirNfseAction, type NotaActionState } from "./actions";

export type DadosIniciaisNfse = {
  osId?: string | null;
  clienteId?: string | null;
  competencia: string;
  valorServicos: number;
  valorDesconto: number;
  aliquotaIss: number | null;
  issRetido: boolean;
  codigoTribNacional: string;
  codigoTribMunicipal: string;
  discriminacao: string;
  tomador: {
    nome: string;
    documento: string;
    email: string;
    telefone: string;
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
  };
  ambiente: "homologacao" | "producao";
  temCertificado: boolean;
  certificadoVencido?: boolean;
  substituicao?: {
    notaAnteriorId: string;
    chaveSubstituida: string;
    numeroAnterior: string;
  } | null;
};

const brNum = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseDec(v: string) {
  const n = Number(v.replace(/[R$\s.]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function EmitirNfseForm({
  inicial,
  redirecionar = true,
  onSucesso,
  onCancelar,
}: {
  inicial: DadosIniciaisNfse;
  redirecionar?: boolean;
  onSucesso?: (notaId: string) => void;
  onCancelar?: () => void;
}) {
  const [valorServ, setValorServ] = useState(inicial.valorServicos > 0 ? brNum(inicial.valorServicos) : "");
  const [valorDesc, setValorDesc] = useState(inicial.valorDesconto > 0 ? brNum(inicial.valorDesconto) : "");
  const [aliq, setAliq] = useState(inicial.aliquotaIss != null ? brNum(inicial.aliquotaIss) : "");
  const [issRetido, setIssRetido] = useState(inicial.issRetido);
  const [codTrib, setCodTrib] = useState(inicial.codigoTribNacional || "140101");
  const [mostrarRetencoes, setMostrarRetencoes] = useState(false);

  const { state, pending, onSubmit } = useFormAction(async (prev: NotaActionState, data: FormData) => {
    const r = await emitirNfseAction(prev, data);
    if (r?.ok && r.notaId) onSucesso?.(r.notaId);
    return r;
  });

  const vServ = Math.max(0, parseDec(valorServ));
  const vDesc = Math.min(vServ, Math.max(0, parseDec(valorDesc)));
  const base = Math.max(0, vServ - vDesc);
  const pAliq = parseDec(aliq);
  const vIss = pAliq > 0 ? (base * pAliq) / 100 : 0;
  const vLiq = Math.max(0, base - (issRetido ? vIss : 0));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {inicial.osId && <input type="hidden" name="osId" value={inicial.osId} />}
      {inicial.clienteId && <input type="hidden" name="clienteId" value={inicial.clienteId} />}
      {redirecionar && <input type="hidden" name="redirecionar" value="1" />}
      {inicial.substituicao && (
        <>
          <input type="hidden" name="substituiNotaId" value={inicial.substituicao.notaAnteriorId} />
          <input type="hidden" name="chaveSubstituida" value={inicial.substituicao.chaveSubstituida} />
        </>
      )}

      {/* Avisos de ambiente e certificado */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tom={inicial.ambiente === "producao" ? "ok" : "warn"}>
          {inicial.ambiente === "producao" ? "Produção (valor fiscal)" : "Homologação (teste)"}
        </Badge>
        {!inicial.temCertificado && (
          <span className="text-danger">
            Certificado A1 não cadastrado —{" "}
            <Link href="/configuracoes/fiscal" className="font-medium underline">
              configurar agora
            </Link>
            . (Você ainda pode enfileirar a DPS para transmitir depois.)
          </span>
        )}
        {inicial.certificadoVencido && (
          <span className="text-danger">
            Certificado A1 vencido —{" "}
            <Link href="/configuracoes/fiscal" className="font-medium underline">
              atualizar certificado
            </Link>
            .
          </span>
        )}
      </div>

      {inicial.substituicao && (
        <div className="flex flex-col gap-3 rounded-lg border border-warn/40 bg-warn-soft/50 p-4">
          <p className="text-[13px] font-semibold">
            Substituindo NFS-e {inicial.substituicao.numeroAnterior}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Motivo da substituição" htmlFor="nf-subst-cod">
              <Select id="nf-subst-cod" name="codigoMotivoSubstituicao" defaultValue="99" required>
                {MOTIVOS_SUBSTITUICAO_NFSE.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Justificativa" htmlFor="nf-subst-mot">
              <Input id="nf-subst-mot" name="motivoSubstituicao" required minLength={10} placeholder="Ex.: Correção de valor ou discriminação do serviço" />
            </Campo>
          </div>
        </div>
      )}

      {/* Tomador */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Tomador (cliente)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome ou razão social" htmlFor="nf-toma-nome">
            <Input id="nf-toma-nome" name="tomadorNome" defaultValue={inicial.tomador.nome} required minLength={2} />
          </Campo>
          <Campo label="CPF ou CNPJ" hint="(recomendado)" htmlFor="nf-toma-doc">
            <Input
              id="nf-toma-doc"
              name="tomadorDocumento"
              defaultValue={formatDocumento(inicial.tomador.documento)}
              placeholder="000.000.000-00"
            />
          </Campo>
          <Campo label="E-mail" hint="(opcional)" htmlFor="nf-toma-email">
            <Input id="nf-toma-email" name="tomadorEmail" type="email" defaultValue={inicial.tomador.email} />
          </Campo>
          <Campo label="WhatsApp / Telefone" hint="(opcional)" htmlFor="nf-toma-tel">
            <Input id="nf-toma-tel" name="tomadorTelefone" defaultValue={inicial.tomador.telefone} />
          </Campo>
        </div>
        {/* Endereço do tomador repassado silenciosamente se existir no cadastro */}
        {inicial.tomador.cep && <input type="hidden" name="tomadorCep" value={inicial.tomador.cep} />}
        {inicial.tomador.logradouro && <input type="hidden" name="tomadorLogradouro" value={inicial.tomador.logradouro} />}
        {inicial.tomador.numero && <input type="hidden" name="tomadorNumero" value={inicial.tomador.numero} />}
        {inicial.tomador.complemento && <input type="hidden" name="tomadorComplemento" value={inicial.tomador.complemento} />}
        {inicial.tomador.bairro && <input type="hidden" name="tomadorBairro" value={inicial.tomador.bairro} />}
        {inicial.tomador.cidade && <input type="hidden" name="tomadorCidade" value={inicial.tomador.cidade} />}
        {inicial.tomador.uf && <input type="hidden" name="tomadorUf" value={inicial.tomador.uf} />}
      </fieldset>

      {/* Serviço e valores */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Serviço e valores</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Competência" htmlFor="nf-comp">
            <Input id="nf-comp" name="competencia" type="date" defaultValue={inicial.competencia} required />
          </Campo>
          <Campo label="Cód. Tributação Nacional" hint="(6 dígitos)" htmlFor="nf-ctrib">
            <Input
              id="nf-ctrib"
              name="codigoTribNacional"
              inputMode="numeric"
              maxLength={6}
              value={codTrib}
              onChange={(e) => setCodTrib(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </Campo>
          <Campo label="Cód. Municipal" hint="(opcional)" htmlFor="nf-cmun">
            <Input id="nf-cmun" name="codigoTribMunicipal" defaultValue={inicial.codigoTribMunicipal} />
          </Campo>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CODIGOS_SERVICO_OFICINA.map((c) => (
            <button
              key={c.codigo}
              type="button"
              onClick={() => setCodTrib(c.codigo)}
              className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted hover:bg-subtle hover:text-foreground"
              title={c.label}
            >
              {c.codigo}
            </button>
          ))}
        </div>

        <Campo label="Discriminação dos serviços" htmlFor="nf-desc">
          <Textarea id="nf-desc" name="discriminacao" rows={4} defaultValue={inicial.discriminacao} required minLength={5} maxLength={2000} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Valor dos serviços (R$)" htmlFor="nf-val">
            <Input
              id="nf-val"
              name="valorServicos"
              inputMode="decimal"
              value={valorServ}
              onChange={(e) => setValorServ(e.target.value)}
              placeholder="0,00"
              className="text-right tabular-nums"
              required
            />
          </Campo>
          <Campo label="Desconto (R$)" htmlFor="nf-desc-v">
            <Input
              id="nf-desc-v"
              name="valorDesconto"
              inputMode="decimal"
              value={valorDesc}
              onChange={(e) => setValorDesc(e.target.value)}
              placeholder="0,00"
              className="text-right tabular-nums"
            />
          </Campo>
          <Campo label="Alíquota ISS (%)" hint="(opcional no SN)" htmlFor="nf-aliq">
            <Input
              id="nf-aliq"
              name="aliquotaIss"
              inputMode="decimal"
              value={aliq}
              onChange={(e) => setAliq(e.target.value)}
              placeholder="Ex.: 2,00"
              className="text-right tabular-nums"
            />
          </Campo>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground-2">
          <input
            type="checkbox"
            name="issRetido"
            checked={issRetido}
            onChange={(e) => setIssRetido(e.target.checked)}
            className="size-4 accent-zinc-900"
          />
          ISS retido pelo tomador
        </label>

        {/* Retenções federais colapsáveis */}
        <div>
          <button
            type="button"
            onClick={() => setMostrarRetencoes((v) => !v)}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-foreground"
          >
            {mostrarRetencoes ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            Retenções federais (PIS, COFINS, CSLL, IRRF, INSS)
          </button>
          {mostrarRetencoes && (
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-border bg-subtle/40 p-3 sm:grid-cols-5">
              {(["pis", "cofins", "csll", "irrf", "inss"] as const).map((k) => (
                <Campo key={k} label={`${k.toUpperCase()} (R$)`} htmlFor={`nf-ret-${k}`}>
                  <Input id={`nf-ret-${k}`} name={`ret_${k}`} inputMode="decimal" placeholder="0,00" className="text-right tabular-nums" />
                </Campo>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      {/* Resumo calculado */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-subtle/60 px-4 py-3 text-[13px]">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>
            <span className="text-muted">Base:</span> <strong className="tabular-nums">{formatBRL(base)}</strong>
          </span>
          {vIss > 0 && (
            <span>
              <span className="text-muted">ISS{issRetido ? " (retido)" : ""}:</span>{" "}
              <strong className="tabular-nums">{formatBRL(vIss)}</strong>
            </span>
          )}
        </div>
        <span className="text-[14px]">
          <span className="text-muted">Líquido: </span>
          <strong className="tabular-nums">{formatBRL(vLiq)}</strong>
        </span>
      </div>

      <Erro>{state?.erro}</Erro>
      {state?.ok && state.mensagem && <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px]">{state.mensagem}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          <FileCheck2 />
          {pending ? "Transmitindo…" : inicial.substituicao ? "Emitir NFS-e substituta" : "Emitir NFS-e"}
        </Button>
      </div>
    </form>
  );
}
