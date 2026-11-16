"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

/* ---------- Assinatura ---------- */

export type AssinaturaHandle = { vazia: () => boolean; exportar: () => Promise<Blob | null> };

export function Assinatura({ ref }: { ref: React.Ref<AssinaturaHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vazia, setVazia] = useState(true);

  // Ajusta a resolução do canvas ao tamanho na tela (nítido em celulares)
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
    // ResizeObserver também cobre o canvas que começa escondido (ex.: dentro de uma janela fechada)
    const obs = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      if (r.width > 0 && Math.round(r.width * (window.devicePixelRatio || 1)) !== c.width) ajustar();
    });
    obs.observe(c);
    return () => obs.disconnect();
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
