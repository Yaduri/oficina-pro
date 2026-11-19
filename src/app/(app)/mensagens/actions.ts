"use server";

import { getContexto } from "@/lib/oficina";
import { gravarMensagem, type DadosRegistro } from "@/lib/registro-mensagens";

export type RegistroState = { ok?: boolean; erro?: string };

/**
 * Registra a mensagem de WhatsApp aberta por quem clicou (o envio acontece no aparelho dele).
 * Os ids são conferidos com a oficina; efeitos por tipo em gravarMensagem.
 */
export async function registrarMensagem(dados: DadosRegistro): Promise<RegistroState> {
  return gravarMensagem(await getContexto(), dados);
}

/** Tira um item da fila sem enviar: grava uma linha com o texto TEXTO_DISPENSADA e sem telefone */
export async function dispensarMensagem(dados: Omit<DadosRegistro, "texto" | "telefone">): Promise<RegistroState> {
  return gravarMensagem(await getContexto(), { ...dados, texto: "-" }, { dispensada: true });
}
