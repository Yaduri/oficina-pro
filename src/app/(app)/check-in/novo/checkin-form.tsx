"use client";

import { startTransition, useActionState, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from "react";
import { Camera, Check, ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button, Campo, Erro, Input, Textarea } from "@/components/ui";
import { SeletorVeiculo, type ClienteOpcao } from "@/components/seletor-veiculo";
import { FOTOS_PADRAO, ROTULO_POSICAO, type Posicao } from "@/lib/checkin";
import { cn } from "@/lib/utils";
import type { ResultadoPlaca } from "@/app/(app)/ordens-servico/actions";
import { criarCheckin } from "../actions";

/* ---------- Upload ---------- */

/** Reduz a foto no próprio celular (máx. 1600 px, JPEG 80%) antes de enviar */
async function comprimir(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
    if (blob) return blob;
  } catch {
    // formato que o navegador não decodifica: tenta enviar o original
  }
  return file;
}

async function enviar(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("arquivo", blob, "foto");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as { key?: string; erro?: string };
  if (!res.ok || !json.key) throw new Error(json.erro ?? "Falha no envio");
  return json.key;
}

type Foto = {
  id: number;
  posicao: Posicao;
  preview?: string;
  key?: string;
  status: "vazia" | "enviando" | "ok" | "erro";
  erro?: string;
  arquivo?: Blob;
};

/* ---------- Formulário ---------- */

export function CheckinForm({
  empresas,
  empresaPadrao,
  clientes,
  inicial,
}: {
  empresas: { id: string; nome: string }[];
  empresaPadrao?: string;
  clientes: ClienteOpcao[];
  inicial: ResultadoPlaca | null;
}) {
  const [state, dispatch, pending] = useActionState(criarCheckin, undefined);
  const [resultado, setResultado] = useState<ResultadoPlaca | null>(inicial);
  const [fotos, setFotos] = useState<Foto[]>(() => FOTOS_PADRAO.map((posicao, i) => ({ id: i, posicao, status: "vazia" })));
  const [seq, setSeq] = useState(FOTOS_PADRAO.length);
  const [combustivel, setCombustivel] = useState<string>("");
  const [erroLocal, setErroLocal] = useState<string>();
  const [finalizando, setFinalizando] = useState(false);
  const assinatura = useRef<AssinaturaHandle>(null);

  // Libera as prévias da memória ao sair
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const atualizar = (id: number, patch: Partial<Foto>) => setFotos((l) => l.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  async function escolher(id: number, file: File | undefined) {
    if (!file) return;
    const blob = await comprimir(file);
    const preview = URL.createObjectURL(blob);
    previews.current.push(preview);
    atualizar(id, { preview, arquivo: blob, status: "enviando", erro: undefined, key: undefined });
    try {
      atualizar(id, { key: await enviar(blob), status: "ok" });
    } catch (e) {
      atualizar(id, { status: "erro", erro: e instanceof Error ? e.message : "Falha no envio" });
    }
  }

  async function reenviar(f: Foto) {
    if (!f.arquivo) return;
    atualizar(f.id, { status: "enviando", erro: undefined });
    try {
      atualizar(f.id, { key: await enviar(f.arquivo), status: "ok" });
    } catch (e) {
      atualizar(f.id, { status: "erro", erro: e instanceof Error ? e.message : "Falha no envio" });
    }
  }

  function adicionarExtra(posicao: Posicao) {
    setFotos((l) => [...l, { id: seq, posicao, status: "vazia" }]);
    setSeq((n) => n + 1);
  }

  const enviando = fotos.some((f) => f.status === "enviando");
  const faltando = fotos.filter((f) => FOTOS_PADRAO.includes(f.posicao) && f.status !== "ok").length;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroLocal(undefined);
    if (enviando) return setErroLocal("Aguarde o envio das fotos terminar.");
    if (fotos.some((f) => f.status === "erro")) return setErroLocal("Alguma foto falhou no envio. Toque em “Tentar de novo” ou remova a foto.");
    if (faltando > 0 && !confirm(`Faltam ${faltando} das ${FOTOS_PADRAO.length} fotos padrão. Registrar mesmo assim?`)) return;
    if (assinatura.current?.vazia() && !confirm("O cliente não assinou. Registrar mesmo assim?")) return;

    const dados = new FormData(e.currentTarget);
    dados.set("fotos", JSON.stringify(fotos.filter((f) => f.key).map((f) => ({ posicao: f.posicao, key: f.key }))));
    setFinalizando(true);
    try {
      const blob = await assinatura.current?.exportar();
      dados.set("assinaturaKey", blob ? await enviar(blob) : "");
    } catch {
      setFinalizando(false);
      return setErroLocal("Não foi possível enviar a assinatura. Tente de novo.");
    }
    setFinalizando(false);
    startTransition(() => dispatch(dados));
  }

  const ocupado = pending || finalizando;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8 pb-24 sm:pb-0">
      <Secao n={1} titulo="Veículo e cliente">
        <SeletorVeiculo clientes={clientes} inicial={inicial} onChange={setResultado} />
      </Secao>

      <Secao n={2} titulo="Fotos de chegada" descricao="Toque para abrir a câmera. As fotos são reduzidas no celular antes do envio.">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fotos.map((f) => (
            <li key={f.id}>
              <SlotFoto
                foto={f}
                onEscolher={(file) => escolher(f.id, file)}
                onReenviar={() => reenviar(f)}
                onRemover={
                  FOTOS_PADRAO.includes(f.posicao)
                    ? () => atualizar(f.id, { status: "vazia", preview: undefined, key: undefined, arquivo: undefined })
                    : () => setFotos((l) => l.filter((x) => x.id !== f.id))
                }
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => adicionarExtra("avaria")}>
            <ImagePlus />Foto de avaria
          </Button>
          <Button type="button" variant="ghost" onClick={() => adicionarExtra("outra")}>
            <ImagePlus />Outra foto
          </Button>
        </div>
      </Secao>

      <Secao n={3} titulo="Estado na chegada">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Km atual" htmlFor="km">
            <Input
              id="km"
              name="km"
              inputMode="numeric"
              placeholder={resultado?.status === "encontrada" && resultado.veiculo.km ? `Último: ${resultado.veiculo.km.toLocaleString("pt-BR")}` : ""}
            />
          </Campo>
          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-medium text-foreground-2">Combustível</legend>
            <input type="hidden" name="combustivel" value={combustivel} />
            <div className="grid grid-cols-5 overflow-hidden rounded-md border border-border-strong" role="radiogroup" aria-label="Nível de combustível">
              {[
                ["0", "Res."],
                ["2", "1/4"],
                ["4", "1/2"],
                ["6", "3/4"],
                ["8", "Cheio"],
              ].map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={combustivel === v}
                  onClick={() => setCombustivel(combustivel === v ? "" : v)}
                  className={cn(
                    "h-11 border-l border-border-strong text-sm font-medium first:border-l-0",
                    combustivel === v ? "bg-primary text-white" : "bg-white text-foreground-2 hover:bg-subtle",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <Campo label="Avarias já existentes" htmlFor="avarias" hint="(riscos, amassados, vidros, rodas)">
          <Textarea id="avarias" name="avarias" rows={2} placeholder="Ex.: risco na porta traseira direita, para-choque trincado" />
        </Campo>
        <Campo label="Objetos deixados no veículo" htmlFor="objetos" hint="(opcional)">
          <Input id="objetos" name="objetos" placeholder="Ex.: estepe, macaco, cadeirinha, documentos" />
        </Campo>
      </Secao>

      <Secao n={4} titulo="Serviço">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-foreground-2">
            Para qual empresa? <span className="font-normal text-muted">Uma OS é aberta para cada empresa marcada.</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {empresas.map((e) => (
              <label
                key={e.id}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-white px-3.5 has-checked:border-primary has-checked:ring-3 has-checked:ring-zinc-900/10"
              >
                <input
                  type="checkbox"
                  name="empresaIds"
                  value={e.id}
                  defaultChecked={empresas.length === 1 || e.id === empresaPadrao}
                  className="size-4 accent-zinc-900"
                />
                {e.nome}
              </label>
            ))}
          </div>
        </fieldset>
        <Campo label="O que o cliente relatou" htmlFor="relato">
          <Textarea id="relato" name="relato" rows={3} required placeholder="Ex.: carro falhando quando frio, luz da bateria acende" />
        </Campo>
      </Secao>

      <Secao n={5} titulo="Assinatura do cliente" descricao="O cliente confirma o estado do veículo e os objetos deixados.">
        <Assinatura ref={assinatura} />
      </Secao>

      <Erro>{erroLocal ?? state?.erro}</Erro>

      {/* No celular o botão fica fixo no rodapé */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex items-center justify-end gap-3">
          {enviando && (
            <span className="flex items-center gap-1.5 text-[13px] text-muted">
              <Loader2 className="size-4 animate-spin" />Enviando fotos…
            </span>
          )}
          <Button variant="primary" className="h-11 w-full px-5 text-[15px] sm:w-auto" disabled={ocupado || !resultado || resultado.status === "invalida"}>
            {ocupado ? "Registrando…" : "Registrar entrada"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Secao({ n, titulo, descricao, children }: { n: number; titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-white">{n}</span>
        <div>
          <h2 className="text-[15px] font-semibold leading-6">{titulo}</h2>
          {descricao && <p className="text-[13px] text-muted">{descricao}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:pl-9">{children}</div>
    </section>
  );
}

/* ---------- Foto ---------- */

function SlotFoto({
  foto,
  onEscolher,
  onReenviar,
  onRemover,
}: {
  foto: Foto;
  onEscolher: (f: File | undefined) => void;
  onReenviar: () => void;
  onRemover: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const rotulo = ROTULO_POSICAO[foto.posicao];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-subtle">
        {foto.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
          <img src={foto.preview} alt={rotulo} className="size-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border-strong text-[13px] font-medium text-foreground-2 hover:bg-zinc-100"
          >
            <Camera className="size-6 text-muted" strokeWidth={1.75} />
            Tirar foto
          </button>
        )}
        {foto.status === "enviando" && (
          <span className="absolute inset-0 grid place-items-center bg-white/60">
            <Loader2 className="size-6 animate-spin text-foreground-2" aria-label="Enviando" />
          </span>
        )}
        {foto.status === "ok" && (
          <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-ok text-white" aria-label="Enviada">
            <Check className="size-4" />
          </span>
        )}
        {foto.preview && foto.status !== "enviando" && (
          <div className="absolute bottom-1.5 right-1.5 flex gap-1.5">
            <button type="button" onClick={() => input.current?.click()} className="grid size-9 place-items-center rounded-full bg-white/90 shadow-card" aria-label={`Trocar foto: ${rotulo}`}>
              <Camera className="size-4" />
            </button>
            <button type="button" onClick={onRemover} className="grid size-9 place-items-center rounded-full bg-white/90 shadow-card" aria-label={`Remover foto: ${rotulo}`}>
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
        {!foto.preview && !FOTOS_PADRAO.includes(foto.posicao) && (
          <button type="button" onClick={onRemover} className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white/90" aria-label="Remover espaço de foto">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="truncate font-medium">{rotulo}</span>
        {foto.status === "erro" && (
          <button type="button" onClick={onReenviar} className="flex shrink-0 items-center gap-1 text-danger underline">
            <RotateCcw className="size-3.5" />Tentar de novo
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={rotulo}
        onChange={(e) => {
          onEscolher(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ---------- Assinatura ---------- */

type AssinaturaHandle = { vazia: () => boolean; exportar: () => Promise<Blob | null> };

function Assinatura({ ref }: { ref: React.Ref<AssinaturaHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vazia, setVazia] = useState(true);

  // Ajusta a resolução do canvas à tela (nítido em celulares)
  useEffect(() => {
    const c = canvas.current!;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#18181b";
      setVazia(true);
    };
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, []);

  const ponto = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const limpar = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setVazia(true);
  };

  // Expõe vazia() e exportar() ao formulário
  useImperativeHandle(
    ref,
    () => ({
      vazia: () => vazia,
      exportar: () =>
        vazia ? Promise.resolve(null) : new Promise<Blob | null>((res) => canvas.current!.toBlob((b) => res(b), "image/png")),
    }),
    [vazia],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={canvas}
          className="h-44 w-full touch-none rounded-lg border border-border-strong bg-white"
          aria-label="Área para o cliente assinar com o dedo"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            desenhando.current = true;
            ultimo.current = ponto(e);
          }}
          onPointerMove={(e) => {
            if (!desenhando.current || !ultimo.current) return;
            const p = ponto(e);
            const ctx = canvas.current!.getContext("2d")!;
            ctx.beginPath();
            ctx.moveTo(ultimo.current.x, ultimo.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ultimo.current = p;
            if (vazia) setVazia(false);
          }}
          onPointerUp={() => {
            desenhando.current = false;
            ultimo.current = null;
          }}
          onPointerCancel={() => {
            desenhando.current = false;
          }}
        />
        {vazia && (
          <span className="pointer-events-none absolute inset-x-0 bottom-8 mx-6 border-t border-dashed border-border-strong pt-1 text-center text-xs text-muted">
            Assine aqui
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={limpar} disabled={vazia}>
          <RotateCcw />Limpar
        </Button>
      </div>
    </div>
  );
}
