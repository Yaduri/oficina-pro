"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, Input } from "@/components/ui";
import { comprimir, enviarArquivo } from "@/lib/upload-cliente";
import { cn } from "@/lib/utils";
import { adicionarFotoOS, mostrarFotoAoCliente, removerFotoOS } from "../edicao";

type Foto = {
  id: string;
  url: string;
  legenda: string | null;
  quando: string;
  podeRemover: boolean;
  /** Aparece no link de acompanhamento do cliente */
  visivelCliente: boolean;
  podeMostrar: boolean;
};

/** Fotos tiradas durante o serviço (peça trocada, antes/depois) */
export function FotosServico({ osId, fotos, podeAdicionar }: { osId: string; fotos: Foto[]; podeAdicionar: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [legenda, setLegenda] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pending, start] = useTransition();

  async function escolher(files: FileList | null) {
    if (!files?.length) return;
    setErro(undefined);
    setEnviando(true);
    try {
      for (const file of Array.from(files)) {
        const key = await enviarArquivo(await comprimir(file), "os");
        const r = await adicionarFotoOS(osId, key, legenda);
        if (r?.erro) throw new Error(r.erro);
      }
      setLegenda("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no envio");
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader title="Fotos do serviço" action={fotos.length > 0 && <span className="text-[13px] text-muted">{fotos.length}</span>} />
      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
          {fotos.map((f) => (
            <li key={f.id} className={cn("flex flex-col gap-1", pending && "opacity-60")}>
              <div className="relative">
                <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-md border border-border bg-subtle">
                  {/* eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado servido por /arquivos */}
                  <img src={f.url} alt={f.legenda ?? "Foto do serviço"} className="size-full object-cover" loading="lazy" />
                </a>
                {f.podeRemover && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Remover esta foto?")) start(() => removerFotoOS(osId, f.id).then(() => undefined));
                    }}
                    className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md bg-card/90 text-foreground-2 shadow-card hover:text-danger"
                    aria-label="Remover foto"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <span className="text-[12px] text-muted">{[f.legenda, f.quando].filter(Boolean).join(" · ")}</span>
              {f.podeMostrar ? (
                <button
                  type="button"
                  aria-pressed={f.visivelCliente}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setErro(undefined);
                      const r = await mostrarFotoAoCliente(osId, f.id, !f.visivelCliente);
                      if (r?.erro) setErro(r.erro);
                    })
                  }
                  title={f.visivelCliente ? "A foto e a legenda aparecem no link de acompanhamento" : "Só a oficina vê esta foto"}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 self-start rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50",
                    f.visivelCliente ? "border-ok/40 bg-ok-soft text-ok" : "border-border bg-card text-foreground-2 hover:bg-subtle",
                  )}
                >
                  {f.visivelCliente ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
                  {f.visivelCliente ? "Cliente vê" : "Mostrar ao cliente"}
                </button>
              ) : (
                f.visivelCliente && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-ok">
                    <Eye className="size-3.5" aria-hidden />
                    Cliente vê
                  </span>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {erro && !podeAdicionar && <p className="px-4 pb-4 text-[13px] text-danger sm:px-5">{erro}</p>}
      {podeAdicionar && (
        <div className={cn("flex flex-col gap-2 px-4 pb-4 sm:px-5", fotos.length === 0 && "pt-4")}>
          {fotos.length === 0 && <p className="text-[13px] text-muted">Registre a peça trocada, o antes e depois ou o que encontrou no diagnóstico.</p>}
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Legenda da foto"
              placeholder="Legenda (opcional), ex.: pastilha antiga"
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              maxLength={120}
              className="h-10 min-w-0 flex-1 basis-48"
            />
            <Button type="button" disabled={enviando} onClick={() => input.current?.click()} className="h-10">
              {enviando ? <Loader2 className="animate-spin" /> : <Camera />}
              {enviando ? "Enviando…" : "Tirar ou escolher foto"}
            </Button>
          </div>
          {erro && <p className="text-[13px] text-danger">{erro}</p>}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => escolher(e.target.files)}
          />
        </div>
      )}
    </Card>
  );
}
