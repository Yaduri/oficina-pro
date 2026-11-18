"use server";

import { z } from "zod";
import { getContexto } from "@/lib/oficina";
import { obterOS } from "@/lib/queries";
import { obterCheckin } from "@/lib/checkin-dados";
import { urlBase } from "@/lib/orcamento";
import { linkPublico } from "@/lib/pdf/carregar";
import { linkWhatsApp } from "@/lib/utils";

/**
 * Link do WhatsApp com a mensagem e o endereço público do PDF (OS na via do cliente ou
 * termo de entrada). Sem telefone do cliente, devolve só o link do PDF para copiar.
 */
export async function enviarDocumento(tipo: "os" | "termo", id: string): Promise<{ erro?: string; whatsapp?: string | null; url?: string }> {
  if (!z.uuid().safeParse(id).success || (tipo !== "os" && tipo !== "termo")) return { erro: "Documento não encontrado" };
  const ctx = await getContexto();

  let telefone: string | null = null;
  let mensagem = "";
  if (tipo === "os") {
    if (!ctx.pode("verValores")) return { erro: "Seu usuário não tem permissão para isso" };
    const d = await obterOS(ctx.oficina.id, id);
    if (!d) return { erro: "OS não encontrada" };
    telefone = d.cliente?.telefone ?? null;
    const nome = d.cliente ? `, ${d.cliente.nome.split(" ")[0]}` : "";
    const veiculo = [d.veiculo.marca, d.veiculo.modelo].filter(Boolean).join(" ");
    mensagem = `Olá${nome}! Segue a ordem de serviço nº ${d.os.numero} do seu ${veiculo} (${d.veiculo.placa}):`;
  } else {
    const d = await obterCheckin(ctx.oficina.id, id);
    if (!d) return { erro: "Check-in não encontrado" };
    telefone = d.cliente?.telefone ?? null;
    const nome = d.cliente ? `, ${d.cliente.nome.split(" ")[0]}` : "";
    mensagem = `Olá${nome}! Segue o termo de entrada do veículo ${d.veiculo.placa}, com as fotos e o checklist da chegada:`;
  }

  const token = await linkPublico(ctx.oficina.id, tipo, id);
  if (!token) return { erro: "Não foi possível gerar o link" };
  const url = `${await urlBase()}/documento/${token}`;
  const wa = linkWhatsApp(telefone);
  return { url, whatsapp: wa ? `${wa}?text=${encodeURIComponent(`${mensagem} ${url}`)}` : null };
}
