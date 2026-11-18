"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { Button, Card } from "@/components/ui";

/* ---------- Service worker ---------- */

/**
 * Registra o /sw.js (página "Sem internet").
 * Em produção registra sempre. Em desenvolvimento só com a flag no navegador:
 *   localStorage.setItem("sw-dev", "1")  → recarregue a página
 *   localStorage.removeItem("sw-dev")    → recarregue para desregistrar
 */
export function RegistrarSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const ativo = process.env.NODE_ENV === "production" || localStorage.getItem("sw-dev") === "1";
    if (ativo) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    } else {
      // Dev sem a flag: remove um SW que tenha ficado de testes anteriores
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    }
  }, []);
  return null;
}

/* ---------- Instalar app ---------- */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const CHAVE = "instalar-app-dispensado";
const ouvintes = new Set<() => void>();
let pedido: BeforeInstallPromptEvent | null = null;
const avisar = () => ouvintes.forEach((f) => f());

// O evento chega cedo (às vezes antes da hidratação): guardamos aqui, ao carregar o módulo.
// Este módulo entra no layout raiz pelo RegistrarSW, então é carregado em toda página.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // esconde a barrinha do Chrome; o cartão do Início oferece a instalação
    pedido = e as BeforeInstallPromptEvent;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    pedido = null;
    avisar();
  });
}

function assinar(f: () => void) {
  ouvintes.add(f);
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", f);
  return () => {
    ouvintes.delete(f);
    mq.removeEventListener("change", f);
  };
}

type Estado = "nada" | "instalar" | "ios";

function lerEstado(): Estado {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || localStorage.getItem(CHAVE) === "1") return "nada";
  if (pedido) return "instalar";
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "nada";
}

/** Cartão discreto para instalar o app (Android/Chrome) ou instruções no iPhone/iPad */
export function InstalarApp() {
  const estado = useSyncExternalStore(assinar, lerEstado, () => "nada" as Estado);
  if (estado === "nada") return null;

  function dispensar() {
    localStorage.setItem(CHAVE, "1");
    avisar();
  }

  async function instalar() {
    const e = pedido;
    if (!e) return;
    await e.prompt();
    await e.userChoice.catch(() => undefined);
    pedido = null; // o pedido só pode ser usado uma vez
    avisar();
  }

  return (
    <Card className="flex items-start gap-3.5 px-5 py-4 sm:items-center">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-subtle text-foreground-2">
        <Smartphone className="size-[18px]" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="font-medium">Use o Oficina Pro como app</div>
          {estado === "ios" ? (
            <p className="text-[13px] text-muted">
              Toque em <Share className="inline size-3.5 -translate-y-px" aria-label="Compartilhar" /> Compartilhar e
              depois em <span className="font-medium text-foreground-2">Adicionar à Tela de Início</span>.
            </p>
          ) : (
            <p className="text-[13px] text-muted">Ícone na tela inicial e abre em tela cheia, sem a barra do navegador.</p>
          )}
        </div>
        {estado === "instalar" && (
          <Button variant="primary" className="self-start sm:self-auto" onClick={instalar}>
            <Download /> Instalar app
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        title="Dispensar"
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted hover:bg-subtle hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </Card>
  );
}
