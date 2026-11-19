"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button, Campo, Card, Erro, Input, Select, Textarea } from "@/components/ui";
import { CamposEndereco } from "@/components/campos-endereco";
import { useFormAction } from "@/lib/use-form-action";
import { formatDocumento, formatTelefone, type Endereco } from "@/lib/utils";
import { TERMO_PADRAO } from "@/lib/textos";
import { salvarFiscal, salvarOficina, salvarTextos, type ConfigState } from "./actions";

/* ---------- Peças comuns ---------- */

function Rodape({ state, pending }: { state: ConfigState; pending: boolean }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
      <Erro>{state?.erro}</Erro>
      <span role="status" className="text-[13px] text-ok sm:mr-auto">
        {state?.ok && !pending ? "Alterações salvas" : ""}
      </span>
      <Button variant="primary" disabled={pending}>
        {pending ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">{titulo}</legend>
      {children}
    </fieldset>
  );
}

/* ---------- Oficina ---------- */

type OficinaDados = Partial<Endereco> & {
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  logoKey: string | null;
};

export function OficinaForm({ oficina }: { oficina: OficinaDados }) {
  const { state, pending, onSubmit } = useFormAction(salvarOficina);

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-6 px-5 py-5">
          <LogoUpload inicial={oficina.logoKey} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nome da oficina" htmlFor="of-nome" className="sm:col-span-2">
              <Input id="of-nome" name="nome" defaultValue={oficina.nome} required minLength={2} />
            </Campo>
            <Campo label="Telefone" htmlFor="of-telefone">
              <Input id="of-telefone" name="telefone" type="tel" inputMode="tel" defaultValue={formatTelefone(oficina.telefone)} placeholder="(11) 3333-4444" />
            </Campo>
            <Campo label="WhatsApp" htmlFor="of-whatsapp">
              <Input id="of-whatsapp" name="whatsapp" type="tel" inputMode="tel" defaultValue={formatTelefone(oficina.whatsapp)} placeholder="(11) 98765-4321" />
            </Campo>
            <Campo label="E-mail" htmlFor="of-email" className="sm:col-span-2">
              <Input id="of-email" name="email" type="email" autoComplete="email" defaultValue={oficina.email ?? ""} />
            </Campo>
          </div>

          <Grupo titulo="Endereço">
            <CamposEndereco idPrefixo="of" inicial={oficina} />
          </Grupo>
        </div>
        <Rodape state={state} pending={pending} />
      </form>
    </Card>
  );
}

/** Reduz a logo para no máximo 600px mantendo a transparência (PNG) */
async function prepararLogo(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
    if (escala === 1 && file.size < 500_000) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const tipo = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, tipo, 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

function LogoUpload({ inicial }: { inicial: string | null }) {
  const [key, setKey] = useState(inicial ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function escolher(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("arquivo", await prepararLogo(file), "logo");
      form.append("pasta", "logos");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { key?: string; erro?: string };
      if (!res.ok || !json.key) throw new Error(json.erro ?? "Falha no envio");
      setKey(json.key);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no envio");
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <input type="hidden" name="logoKey" value={key} />
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-subtle">
        {enviando ? (
          <Loader2 className="size-5 animate-spin text-muted" aria-label="Enviando logo" />
        ) : key ? (
          // eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado servido por /arquivos
          <img src={`/arquivos/${key}`} alt="Logo da oficina" className="size-full object-contain p-1.5" />
        ) : (
          <ImagePlus className="size-6 text-muted" strokeWidth={1.75} aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-medium text-foreground-2">Logo</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={enviando} onClick={() => input.current?.click()}>
            {key ? "Trocar logo" : "Enviar logo"}
          </Button>
          {key && (
            <Button type="button" variant="ghost" className="px-2.5" onClick={() => setKey("")} aria-label="Remover logo">
              <Trash2 />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">PNG ou JPG. Salve para aplicar.</p>
        {erro && <p className="text-xs text-danger">{erro}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => escolher(e.target.files?.[0])}
      />
    </div>
  );
}

/* ---------- Dados fiscais (CNPJ) ---------- */

type DadosFiscais = {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnpj: string | null;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  regime: "mei" | "simples" | "presumido" | "real" | null;
};

export function FiscalForm({ fiscal }: { fiscal: DadosFiscais }) {
  const { state, pending, onSubmit } = useFormAction(salvarFiscal);
  const p = "fis";

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-6 px-5 py-5">
          <Grupo titulo="Identificação">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="CNPJ" htmlFor={`${p}-cnpj`}>
                <Input
                  id={`${p}-cnpj`}
                  name="cnpj"
                  defaultValue={formatDocumento(fiscal.cnpj)}
                  placeholder="00.000.000/0000-00"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </Campo>
              <Campo label="Razão social" htmlFor={`${p}-razao`}>
                <Input id={`${p}-razao`} name="razaoSocial" defaultValue={fiscal.razaoSocial ?? ""} />
              </Campo>
              <Campo label="Nome fantasia" hint="(aparece no topo dos documentos)" htmlFor={`${p}-fantasia`} className="sm:col-span-2">
                <Input id={`${p}-fantasia`} name="nomeFantasia" defaultValue={fiscal.nomeFantasia ?? ""} />
              </Campo>
            </div>
          </Grupo>

          <Grupo titulo="Tributação">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo label="Regime tributário" htmlFor={`${p}-regime`}>
                <Select id={`${p}-regime`} name="regime" defaultValue={fiscal.regime ?? ""}>
                  <option value="">Não informado</option>
                  <option value="mei">MEI</option>
                  <option value="simples">Simples Nacional</option>
                  <option value="presumido">Lucro Presumido</option>
                  <option value="real">Lucro Real</option>
                </Select>
              </Campo>
              <Campo label="Inscrição municipal" htmlFor={`${p}-im`}>
                <Input id={`${p}-im`} name="inscricaoMunicipal" defaultValue={fiscal.inscricaoMunicipal ?? ""} />
              </Campo>
              <Campo label="Inscrição estadual" htmlFor={`${p}-ie`}>
                <Input id={`${p}-ie`} name="inscricaoEstadual" defaultValue={fiscal.inscricaoEstadual ?? ""} placeholder="Isento, se não tiver" />
              </Campo>
            </div>
          </Grupo>
        </div>
        <Rodape state={state} pending={pending} />
      </form>
    </Card>
  );
}

/* ---------- Textos padrão ---------- */

type Textos = {
  textoGarantia: string | null;
  textoTermoCheckin: string | null;
  obsOrcamento: string | null;
  validadeOrcamentoDias: number;
  garantiaDias: number;
};

export function TextosForm({ textos }: { textos: Textos }) {
  const { state, pending, onSubmit } = useFormAction(salvarTextos);

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Campo label="Garantia dos serviços" htmlFor="tx-garantia">
            <Textarea
              id="tx-garantia"
              name="textoGarantia"
              rows={3}
              defaultValue={textos.textoGarantia ?? ""}
              placeholder="Ex.: Garantia de 90 dias para serviços e conforme o fabricante para peças, a partir da entrega do veículo."
            />
          </Campo>
          <Campo label="Garantia padrão" hint="(dias, sugerida na entrega)" htmlFor="tx-garantia-dias">
            <Input id="tx-garantia-dias" name="garantiaDias" type="number" inputMode="numeric" min={0} max={3650} defaultValue={textos.garantiaDias} required />
          </Campo>
          </div>
          <Campo label="Termo de entrada do veículo" hint="(aparece acima da assinatura no check-in)" htmlFor="tx-termo">
            <Textarea id="tx-termo" name="textoTermoCheckin" rows={3} defaultValue={textos.textoTermoCheckin ?? ""} placeholder={TERMO_PADRAO} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Campo label="Observação padrão do orçamento" htmlFor="tx-obs">
              <Textarea
                id="tx-obs"
                name="obsOrcamento"
                rows={2}
                className="min-h-16"
                defaultValue={textos.obsOrcamento ?? ""}
                placeholder="Ex.: Valores sujeitos à disponibilidade das peças."
              />
            </Campo>
            <Campo label="Validade do orçamento" hint="(dias)" htmlFor="tx-validade">
              <Input
                id="tx-validade"
                name="validadeOrcamentoDias"
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                defaultValue={textos.validadeOrcamentoDias}
                required
              />
            </Campo>
          </div>
        </div>
        <Rodape state={state} pending={pending} />
      </form>
    </Card>
  );
}
