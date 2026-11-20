"use client";

import { useEffect } from "react";

export default function GlobalError({
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
        mensagem: error.message || "Erro crítico global",
        stack: error.stack,
        rota: typeof window !== "undefined" ? window.location.pathname : undefined,
        digest: error.digest,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1rem", textAlign: "center", color: "#18181b" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Algo deu errado</h1>
        <p style={{ color: "#52525b", marginTop: "0.5rem" }}>
          Ocorreu um erro inesperado. O problema foi registrado automaticamente.
        </p>
        {error.digest && <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#71717a" }}>Código: {error.digest}</p>}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1.25rem",
            padding: "0.6rem 1.2rem",
            borderRadius: "6px",
            background: "#18181b",
            color: "#fff",
            border: 0,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Recarregar
        </button>
      </body>
    </html>
  );
}
