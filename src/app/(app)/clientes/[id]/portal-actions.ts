"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { garantirPortal } from "@/lib/relacionamento";
import { urlBase } from "@/lib/orcamento";
import { identificacao } from "@/lib/identificacao";
import { montarMensagem, primeiroNome, textoModelo } from "@/lib/mensagens";

/** Link do portal do cliente (cria na primeira vez) e o texto do WhatsApp com o modelo "portal" */
export async function linkPortal(clienteId: string): Promise<{ erro: string } | { url: string; texto: string }> {
  const ctx = await getContexto();
  if (!ctx.pode("cadastros")) return { erro: "Seu usuário não tem permissão para isso" };
  if (!z.uuid().safeParse(clienteId).success) return { erro: "Cliente não encontrado" };
  const db = await getDb();
  const [c] = await db
    .select({ id: schema.clientes.id, nome: schema.clientes.nome, arquivadoEm: schema.clientes.arquivadoEm })
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, clienteId), eq(schema.clientes.oficinaId, ctx.oficina.id)));
  if (!c) return { erro: "Cliente não encontrado" };
  if (c.arquivadoEm) return { erro: "Cliente arquivado não tem portal" };
  const token = await garantirPortal(ctx.oficina.id, c.id);
  const url = `${await urlBase()}/portal/${token}`;
  const texto = montarMensagem(textoModelo(ctx.oficina.modelosMensagem, "portal"), {
    cliente: primeiroNome(c.nome),
    portal: url,
    oficina: identificacao(ctx.oficina).titulo,
  });
  return { url, texto };
}
