"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/erros", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mensagem: error.message || "Erro inesperado na página",
        stack: error.stack,
        rota: typeof window !== "undefined" ? window.location.pathname : undefined,
        digest: error.digest,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-[20px] font-semibold">Algo deu errado</h1>
      <p className="text-[14px] text-muted">
        Ocorreu um erro inesperado ao carregar esta tela. O problema já foi registrado para análise.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted">Código: {error.digest}</p>}
      <div className="flex gap-2">
        <Button variant="primary" onClick={reset}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
