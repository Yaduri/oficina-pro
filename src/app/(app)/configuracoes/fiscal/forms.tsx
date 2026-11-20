"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, FileKey2, Loader2, Search, ShieldAlert, Trash2, Upload } from "lucide-react";
import { Badge, Button, Campo, Card, Erro, Input, Select } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { CODIGOS_SERVICO_OFICINA } from "@/lib/fiscal/tipos";
import type { AmbienteFiscal, DadosIbsCbs, ProvedorFiscalTipo } from "@/db/schema";
import { formatData, formatDocumento } from "@/lib/utils";
import { enviarCertificadoA1, excluirCertificadoA1, salvarConfiguracaoFiscal, type FiscalConfigState } from "./actions";

type ResumoCertificado = {
  titular: string;
  cnpj: string | null;
  serial: string | null;
  validoDe: Date | null;
  validoAte: Date | null;
  situacao: "nao_cadastrado" | "valido" | "vencendo" | "vencido";
  diasRestantes: number | null;
} | null;

export function CertificadoForm({
  certificado,
  cnpjOficina,
}: {
  certificado: ResumoCertificado;
  cnpjOficina: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [removendo, startRemover] = useTransition();
  const [nomeArq, setNomeArq] = useState<string>("");
  const { state, pending, onSubmit } = useFormAction(async (prev: FiscalConfigState, data: FormData) => {
    const r = await enviarCertificadoA1(prev, data);
    if (r?.ok) {
      formRef.current?.reset();
      setNomeArq("");
    }
    return r;
  });

  const cnpjDivergente =
    certificado?.cnpj && cnpjOficina && certificado.cnpj !== cnpjOficina.replace(/[^0-9A-Za-z]/g, "");

  return (
    <Card>
      <div className="flex flex-col gap-5 px-5 py-5">
        {certificado ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-subtle/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                {certificado.situacao === "valido" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
                ) : (
                  <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                )}
                <div>
                  <p className="font-semibold">{certificado.titular}</p>
                  <p className="text-[13px] text-muted">
                    {certificado.cnpj ? `CNPJ ${formatDocumento(certificado.cnpj)}` : "CNPJ não encontrado no certificado"}
                    {certificado.validoAte && ` · Válido até ${formatData(certificado.validoAte)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {certificado.situacao === "valido" && <Badge tom="ok">Válido ({certificado.diasRestantes}d)</Badge>}
                {certificado.situacao === "vencendo" && (
                  <Badge tom="warn">Vence em {certificado.diasRestantes} {certificado.diasRestantes === 1 ? "dia" : "dias"}</Badge>
                )}
                {certificado.situacao === "vencido" && <Badge tom="danger">Vencido</Badge>}
                <Button
                  type="button"
                  variant="ghost"
                  className="px-2 hover:text-danger"
                  disabled={removendo}
                  onClick={() => {
                    if (confirm("Remover o certificado digital A1 cadastrado? Não será possível emitir notas até enviar outro.")) {
                      startRemover(() => {
                        void excluirCertificadoA1();
                      });
                    }
                  }}
                  aria-label="Remover certificado A1"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {cnpjDivergente && (
              <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px]">
                O CNPJ do certificado ({formatDocumento(certificado.cnpj)}) difere do CNPJ da oficina ({formatDocumento(cnpjOficina)}).
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border px-4 py-3.5 text-[13px] text-muted">
            <FileKey2 className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p>
              Nenhum certificado A1 cadastrado. Envie o arquivo <strong>.pfx</strong> ou <strong>.p12</strong> do e-CNPJ da oficina para assinar e transmitir a NFS-e Nacional. O arquivo e a senha são guardados criptografados.
            </p>
          </div>
        )}

        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label={certificado ? "Trocar arquivo (.pfx ou .p12)" : "Arquivo do certificado (.pfx ou .p12)"} htmlFor="cert-arq">
              <label
                htmlFor="cert-arq"
                className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-foreground-2 hover:bg-subtle"
              >
                <Upload className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="truncate">{nomeArq || "Escolher arquivo .pfx / .p12"}</span>
                <input
                  id="cert-arq"
                  name="certificado"
                  type="file"
                  accept=".pfx,.p12,application/x-pkcs12"
                  className="sr-only"
                  onChange={(e) => setNomeArq(e.target.files?.[0]?.name ?? "")}
                  required
                />
              </label>
            </Campo>
            <Campo label="Senha do certificado" htmlFor="cert-senha">
              <Input id="cert-senha" name="senha" type="password" autoComplete="off" placeholder="Senha do arquivo A1" required />
            </Campo>
          </div>

          <Erro>{state?.erro}</Erro>
          {state?.aviso && <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px]">{state.aviso}</p>}
          {state?.ok && !pending && <p role="status" className="text-[13px] text-ok">Certificado A1 validado e salvo com criptografia.</p>}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Validando…" : certificado ? "Substituir certificado" : "Validar e salvar certificado"}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

export function ParametrosFiscaisForm({
  inicial,
  cepOficina,
}: {
  inicial: {
    provedor: ProvedorFiscalTipo;
    ambiente: AmbienteFiscal;
    codigoMunicipioIbge: string;
    serieDps: string;
    proximoNumeroDps: number;
    codigoTribNacionalPadrao: string;
    codigoTribMunicipalPadrao: string;
    aliquotaIss: number | null;
    issRetidoPadrao: boolean;
    optanteSimplesNacional: "1" | "2" | "3";
    regimeApuracaoSn: "1" | "2" | "3";
    regimeEspecialTrib: string;
    incluirIbsCbs: boolean;
    ibsCbsPadrao: DadosIbsCbs | null;
  };
  cepOficina: string | null;
}) {
  const { state, pending, onSubmit } = useFormAction(salvarConfiguracaoFiscal);
  const [ibge, setIbge] = useState(inicial.codigoMunicipioIbge);
  const [buscandoIbge, setBuscandoIbge] = useState(false);
  const [erroIbge, setErroIbge] = useState<string | null>(null);
  const [optSimples, setOptSimples] = useState<"1" | "2" | "3">(inicial.optanteSimplesNacional);
  const [incluirIbs, setIncluirIbs] = useState(inicial.incluirIbsCbs);
  const [codTrib, setCodTrib] = useState(inicial.codigoTribNacionalPadrao);

  async function buscarIbgePeloCep() {
    const cep = (cepOficina ?? "").replace(/\D/g, "");
    if (cep.length !== 8) {
      setErroIbge("Cadastre o CEP da oficina na aba Oficina primeiro.");
      return;
    }
    setBuscandoIbge(true);
    setErroIbge(null);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = (await r.json()) as { ibge?: string; localidade?: string; uf?: string; erro?: boolean };
      if (j.erro || !j.ibge) setErroIbge("Não encontramos o código IBGE para esse CEP.");
      else setIbge(j.ibge);
    } catch {
      setErroIbge("Não foi possível consultar o ViaCEP agora.");
    } finally {
      setBuscandoIbge(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-6 px-5 py-5">
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Integração e ambiente</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Emissão de NFS-e" htmlFor="fis-provedor">
                <Select id="fis-provedor" name="provedor" defaultValue={inicial.provedor}>
                  <option value="nfse_nacional">NFS-e Nacional (direto gov.br, sem provedor pago)</option>
                  <option value="focus_nfe" disabled>
                    Focus NFe (reservado para NF-e/NFC-e de peças)
                  </option>
                </Select>
              </Campo>
              <Campo label="Ambiente" htmlFor="fis-ambiente">
                <Select id="fis-ambiente" name="ambiente" defaultValue={inicial.ambiente}>
                  <option value="homologacao">Homologação (Produção Restrita — testes)</option>
                  <option value="producao">Produção (notas com validade fiscal)</option>
                </Select>
              </Campo>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Município e numeração da DPS</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo label="Código IBGE do município" hint="(7 dígitos)" htmlFor="fis-ibge">
                <div className="flex gap-1.5">
                  <Input
                    id="fis-ibge"
                    name="codigoMunicipioIbge"
                    inputMode="numeric"
                    maxLength={7}
                    placeholder="3550308"
                    value={ibge}
                    onChange={(e) => setIbge(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  />
                  <Button type="button" onClick={buscarIbgePeloCep} disabled={buscandoIbge} title="Preencher pelo CEP da oficina" className="shrink-0 px-2.5">
                    {buscandoIbge ? <Loader2 className="animate-spin" /> : <Search />}
                  </Button>
                </div>
                {erroIbge && <p className="text-xs text-danger">{erroIbge}</p>}
              </Campo>
              <Campo label="Série da DPS" hint="(5 dígitos)" htmlFor="fis-serie">
                <Input id="fis-serie" name="serieDps" inputMode="numeric" maxLength={5} defaultValue={inicial.serieDps} required />
              </Campo>
              <Campo label="Próximo nº da DPS" htmlFor="fis-num">
                <Input id="fis-num" name="proximoNumeroDps" type="number" inputMode="numeric" min={1} defaultValue={inicial.proximoNumeroDps} required />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Tributação de serviços (ISSQN)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Código de tributação nacional (LC 116)" hint="(6 dígitos)" htmlFor="fis-ctrib">
                <Input
                  id="fis-ctrib"
                  name="codigoTribNacionalPadrao"
                  inputMode="numeric"
                  maxLength={6}
                  value={codTrib}
                  onChange={(e) => setCodTrib(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {CODIGOS_SERVICO_OFICINA.slice(0, 3).map((c) => (
                    <button
                      key={c.codigo}
                      type="button"
                      onClick={() => setCodTrib(c.codigo)}
                      className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:bg-subtle hover:text-foreground"
                      title={c.label}
                    >
                      {c.codigo}
                    </button>
                  ))}
                </div>
              </Campo>
              <Campo label="Código municipal" hint="(opcional — confirmar com contador)" htmlFor="fis-cmun">
                <Input id="fis-cmun" name="codigoTribMunicipalPadrao" maxLength={20} defaultValue={inicial.codigoTribMunicipalPadrao} />
              </Campo>
              <Campo label="Optante pelo Simples Nacional" htmlFor="fis-opt">
                <Select id="fis-opt" name="optanteSimplesNacional" value={optSimples} onChange={(e) => setOptSimples(e.target.value as "1" | "2" | "3")}>
                  <option value="3">Sim — ME / EPP (Simples Nacional)</option>
                  <option value="2">Sim — MEI</option>
                  <option value="1">Não optante (Lucro Presumido / Real)</option>
                </Select>
              </Campo>
              <Campo label="Apuração dos tributos no SN" htmlFor="fis-apsn">
                <Select id="fis-apsn" name="regimeApuracaoSn" defaultValue={inicial.regimeApuracaoSn} disabled={optSimples !== "3"}>
                  <option value="1">Federais e ISS pelo Simples Nacional</option>
                  <option value="2">Federais pelo SN e ISS fora do SN</option>
                  <option value="3">Federais e ISS fora do SN</option>
                </Select>
              </Campo>
              <Campo label="Regime especial de tributação" htmlFor="fis-esp">
                <Select id="fis-esp" name="regimeEspecialTrib" defaultValue={inicial.regimeEspecialTrib}>
                  <option value="0">0 — Nenhum</option>
                  <option value="1">1 — Ato Cooperado</option>
                  <option value="2">2 — Estimativa</option>
                  <option value="3">3 — Sociedade de Profissionais</option>
                  <option value="4">4 — Cooperativa</option>
                  <option value="5">5 — MEI</option>
                  <option value="6">6 — ME / EPP (Simples Nacional)</option>
                </Select>
              </Campo>
              <Campo label="Alíquota padrão de ISS (%)" hint="(deixe vazio se o município/SN calcular)" htmlFor="fis-aliq">
                <Input
                  id="fis-aliq"
                  name="aliquotaIss"
                  inputMode="decimal"
                  placeholder="Ex.: 2,00 ou 5,00"
                  defaultValue={inicial.aliquotaIss != null ? String(inicial.aliquotaIss).replace(".", ",") : ""}
                />
              </Campo>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground-2">
              <input
                type="checkbox"
                name="issRetidoPadrao"
                defaultChecked={inicial.issRetidoPadrao}
                className="size-4 accent-zinc-900"
              />
              ISS retido pelo tomador por padrão (normalmente desmarcado para pessoa física)
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-4 border-t border-border pt-5">
            <legend className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Reforma Tributária — IBS / CBS (LC 214/2025)
            </legend>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground-2">
              <input
                type="checkbox"
                name="incluirIbsCbs"
                checked={incluirIbs}
                onChange={(e) => setIncluirIbs(e.target.checked)}
                className="size-4 accent-zinc-900"
              />
              Incluir bloco IBS/CBS no XML da DPS (versão 1.01 — ative conforme orientação do contador)
            </label>

            {incluirIbs && (
              <div className="grid gap-4 rounded-lg border border-border bg-subtle/40 p-4 sm:grid-cols-3">
                <Campo label="Finalidade (finNFSe)" htmlFor="ibs-fin">
                  <Select id="ibs-fin" name="finNFSe" defaultValue={inicial.ibsCbsPadrao?.finNFSe ?? "0"}>
                    <option value="0">0 — NFS-e regular</option>
                    <option value="1">1 — Crédito</option>
                    <option value="2">2 — Débito</option>
                  </Select>
                </Campo>
                <Campo label="Consumidor final" htmlFor="ibs-final">
                  <Select id="ibs-final" name="indFinal" defaultValue={inicial.ibsCbsPadrao?.indFinal ?? "1"}>
                    <option value="1">1 — Sim</option>
                    <option value="0">0 — Não</option>
                  </Select>
                </Campo>
                <Campo label="Indicador de operação (cIndOp)" htmlFor="ibs-op">
                  <Input id="ibs-op" name="cIndOp" maxLength={6} defaultValue={inicial.ibsCbsPadrao?.cIndOp ?? ""} placeholder="Opcional" />
                </Campo>
                <Campo label="CST IBS/CBS" htmlFor="ibs-cst">
                  <Input id="ibs-cst" name="cstIbsCbs" maxLength={3} defaultValue={inicial.ibsCbsPadrao?.cst ?? "000"} />
                </Campo>
                <Campo label="Classificação (cClassTrib)" htmlFor="ibs-clas">
                  <Input id="ibs-clas" name="cClassTrib" maxLength={6} defaultValue={inicial.ibsCbsPadrao?.cClassTrib ?? "000001"} />
                </Campo>
                <Campo label="Alíquota CBS (%)" htmlFor="ibs-pcbs">
                  <Input
                    id="ibs-pcbs"
                    name="pCbs"
                    inputMode="decimal"
                    placeholder="0,90"
                    defaultValue={inicial.ibsCbsPadrao?.pCbs != null ? String(inicial.ibsCbsPadrao.pCbs).replace(".", ",") : ""}
                  />
                </Campo>
                <Campo label="Alíquota IBS UF (%)" htmlFor="ibs-puf">
                  <Input
                    id="ibs-puf"
                    name="pIbsUf"
                    inputMode="decimal"
                    placeholder="0,10"
                    defaultValue={inicial.ibsCbsPadrao?.pIbsUf != null ? String(inicial.ibsCbsPadrao.pIbsUf).replace(".", ",") : ""}
                  />
                </Campo>
                <Campo label="Alíquota IBS Mun. (%)" htmlFor="ibs-pmun">
                  <Input
                    id="ibs-pmun"
                    name="pIbsMun"
                    inputMode="decimal"
                    placeholder="0,00"
                    defaultValue={inicial.ibsCbsPadrao?.pIbsMun != null ? String(inicial.ibsCbsPadrao.pIbsMun).replace(".", ",") : ""}
                  />
                </Campo>
              </div>
            )}
          </fieldset>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <Erro>{state?.erro}</Erro>
          <span role="status" className="text-[13px] text-ok sm:mr-auto">
            {state?.ok && !pending ? "Configurações fiscais salvas" : ""}
          </span>
          <Button variant="primary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar configurações fiscais"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
