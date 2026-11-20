"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDbSistema, schema } from "@/db";
import { TOKEN_PESQUISA_RE } from "@/lib/relacionamento";
import { ipAtual, verificarLimite } from "@/lib/rate-limit";

export type PesquisaState = { erro?: string; ok?: boolean } | undefined;

/** Resposta do cliente pelo link público (sem login: o token é a autorização). Vale só a primeira. */
export async function responderPesquisa(token: string, _prev: PesquisaState, form: FormData): Promise<PesquisaState> {
  if (!TOKEN_PESQUISA_RE.test(token)) return { erro: "Link inválido" };
  const lim = await verificarLimite({ chave: `pesq-resp:${await ipAtual()}:${token.slice(0, 12)}`, limite: 10, janelaSeg: 600 });
  if (!lim.permitido) return { erro: `Muitas tentativas. Aguarde ${lim.retryAfterSeg} segundos e tente novamente.` };
  const dados = z
    .object({
      nota: z
        .string()
        .regex(/^(10|[0-9])$/, "Escolha uma nota de 0 a 10")
        .transform(Number),
      comentario: z.string().trim().max(1000, "Comentário muito longo"),
    })
    .safeParse({ nota: String(form.get("nota") ?? ""), comentario: String(form.get("comentario") ?? "") });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  // Sem login: conexão do sistema, filtrada pelo token
  const db = await getDbSistema();
  const t = schema.pesquisasSatisfacao;
  const [p] = await db
    .select({ id: t.id, respondidoEm: t.respondidoEm, status: schema.ordensServico.status })
    .from(t)
    .innerJoin(schema.ordensServico, and(eq(schema.ordensServico.id, t.osId), eq(schema.ordensServico.oficinaId, t.oficinaId)))
    .where(eq(t.token, token));
  if (!p) return { erro: "Pesquisa não encontrada" };
  if (p.respondidoEm) return { erro: "Esta pesquisa já foi respondida" };
  if (p.status === "cancelada") return { erro: "Esta ordem de serviço foi cancelada" };

  // Condição em respondidoEm garante uma única resposta mesmo com cliques duplos
  const res = await db
    .update(t)
    .set({ nota: dados.data.nota, comentario: dados.data.comentario || null, respondidoEm: new Date() })
    .where(and(eq(t.id, p.id), isNull(t.respondidoEm)))
    .returning({ id: t.id });
  if (res.length === 0) return { erro: "Esta pesquisa já foi respondida" };
  revalidatePath(`/pesquisa/${token}`);
  return { ok: true };
}
