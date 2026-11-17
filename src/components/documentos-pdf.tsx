"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Copy, Download, FileText, Loader2, MessageCircle } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { enviarDocumento } from "@/app/pdf/actions";

export type DocumentoOpcao = { href: string; label: string; detalhe?: string };

/**
 * Menu "PDF": abre/baixa os documentos e envia o link pelo WhatsApp.
 * `enviar` = documento que vai para o cliente (OS na via do cliente ou termo).
 */
export function DocumentosPdf({
  documentos,
  enviar,
  rotulo = "PDF",
}: {
  documentos: DocumentoOpcao[];
  enviar?: { tipo: "os" | "termo"; id: string; label: string } | null;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ texto: string; url?: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function mandar() {
    if (!enviar) return;
    setAviso(null);
    // Abre a aba já no clique (senão o navegador bloqueia) e depois aponta para o WhatsApp
    const aba = window.open("", "_blank");
    start(async () => {
      const r = await enviarDocumento(enviar.tipo, enviar.id);
      if (r.erro || !r.url) {
        aba?.close();
        setAviso({ texto: r.erro ?? "Não foi possível gerar o link" });
        return;
      }
      if (r.whatsapp) {
        if (aba) aba.location.href = r.whatsapp;
        else window.location.href = r.whatsapp;
        setAberto(false);
      } else {
        aba?.close();
        setAviso({ texto: "O cliente não tem telefone cadastrado. Copie o link e envie como preferir:", url: r.url });
      }
    });
  }

  return (
    <div ref={raiz} className="relative">
      <button type="button" aria-expanded={aberto} aria-haspopup="menu" onClick={() => setAberto((a) => !a)} className={buttonClass("secondary")}>
        <FileText />
        {rotulo}
        <ChevronDown className={cn("transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div role="menu" className="absolute left-0 z-30 mt-1.5 w-[min(18rem,calc(100vw-2rem))] overflow-hidden sm:left-auto sm:right-0 rounded-lg border border-border bg-card py-1 shadow-pop">
          {documentos.map((d) => (
            <div key={d.href} className="flex items-stretch hover:bg-subtle">
              <a role="menuitem" href={d.href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 flex-col px-3 py-2" onClick={() => setAberto(false)}>
                <span className="text-sm">{d.label}</span>
                {d.detalhe && <span className="text-[12px] text-muted">{d.detalhe}</span>}
              </a>
              <a
                href={`${d.href}${d.href.includes("?") ? "&" : "?"}baixar=1`}
                className="grid w-10 place-items-center text-muted hover:text-foreground"
                aria-label={`Baixar ${d.label}`}
                title="Baixar"
                onClick={() => setAberto(false)}
              >
                <Download className="size-4" />
              </a>
            </div>
          ))}
          {enviar && (
            <>
              <div className="my-1 border-t border-border" />
              <button type="button" role="menuitem" onClick={mandar} disabled={pending} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-subtle disabled:opacity-60">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4 text-[#25D366]" />}
                {enviar.label}
              </button>
            </>
          )}
          {aviso && (
            <div className="border-t border-border px-3 py-2.5 text-[13px]">
              <p className="text-foreground-2">{aviso.texto}</p>
              {aviso.url && (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(aviso.url!);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2000);
                  }}
                  className="mt-1.5 inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                >
                  {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiado ? "Link copiado" : "Copiar link"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
