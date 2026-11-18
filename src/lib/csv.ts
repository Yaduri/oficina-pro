/*
 * CSV para o Excel em português: separador ";", vírgula decimal e UTF-8 com BOM
 * (sem o BOM o Excel abre os acentos errados).
 */

export type Celula = string | number | null | undefined;

/** Centavos → "1234,56" (sem separador de milhar, para o Excel ler como número) */
export const csvValor = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Número qualquer → "1,5" */
export const csvNumero = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

function celula(v: Celula) {
  const s = v == null ? "" : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCsv(cabecalho: string[], linhas: Celula[][]) {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

export function respostaCsv(nome: string, conteudo: string) {
  return new Response(conteudo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
