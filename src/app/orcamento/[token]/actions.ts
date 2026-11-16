"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { TOKEN_RE } from "@/lib/orcamento";
import { registrarEvento } from "@/lib/os-acesso";

export type RespostaState = { erro?: string } | undefined;

/** Resposta do cliente pelo link público (sem login — o token é a autorização). */
export async function responderOrcamento(token: string, _prev: RespostaState, form: FormData): Promise<RespostaState> {
  if (!TOKEN_RE.test(token)) return { erro: "Link inválido" };
  const dados = z
    .object({
      decisao: z.enum(["aprovar", "recusar"]),
      nome: z.string().trim().min(2, "Informe seu nome").max(120),
      comentario: z.string().trim().max(1000, "Comentário muito longo"),
      itens: z.array(z.string()).max(500),
    })
    .safeParse({
      decisao: form.get("decisao"),
      nome: String(form.get("nome") ?? ""),
      comentario: String(form.get("comentario") ?? ""),
      itens: form.getAll("itens").map(String),
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const db = await getDb();
  const [orc] = await db.select().from(schema.orcamentos).where(eq(schema.orcamentos.token, token));
  if (!orc) return { erro: "Orçamento não encontrado" };
  if (orc.status !== "pendente") return { erro: "Este orçamento já foi respondido ou foi substituído por um novo" };
  if (orc.validoAte < new Date()) return { erro: "Este orçamento venceu. Peça um novo à oficina." };

  const enviados = orc.itens.map((i) => i.id);
  const aprovados = dados.data.decisao === "recusar" ? [] : enviados.filter((id) => dados.data.itens.includes(id));
  if (dados.data.decisao === "aprovar" && aprovados.length === 0) return { erro: "Marque ao menos um item para aprovar" };
  const status = aprovados.length === 0 ? "recusado" : aprovados.length === enviados.length ? "aprovado" : "parcial";

  const ok = await db.transaction(async (tx) => {
    // Condição em status garante uma única resposta mesmo com cliques duplos
    const res = await tx
      .update(schema.orcamentos)
      .set({
        status,
        respondidoEm: new Date(),
        respostaNome: dados.data.nome,
        respostaComentario: dados.data.comentario || null,
        itensAprovados: aprovados,
      })
      .where(and(eq(schema.orcamentos.id, orc.id), eq(schema.orcamentos.status, "pendente")))
      .returning({ id: schema.orcamentos.id });
    if (res.length === 0) return false;

    const recusados = enviados.filter((id) => !aprovados.includes(id));
    if (recusados.length > 0) {
      await tx
        .update(schema.osItens)
        .set({ recusado: true })
        .where(and(eq(schema.osItens.osId, orc.osId), inArray(schema.osItens.id, recusados)));
    }
    if (aprovados.length > 0) {
      await tx
        .update(schema.osItens)
        .set({ recusado: false })
        .where(and(eq(schema.osItens.osId, orc.osId), inArray(schema.osItens.id, aprovados)));
      // Aprovado: a OS segue para execução
      await tx
        .update(schema.ordensServico)
        .set({ status: "em_execucao" })
        .where(
          and(
            eq(schema.ordensServico.id, orc.osId),
            notInArray(schema.ordensServico.status, ["entregue", "cancelada", "pronto"]),
          ),
        );
    }
    return true;
  });
  if (!ok) return { erro: "Este orçamento já foi respondido" };

  const frase = status === "aprovado" ? "aprovou o orçamento" : status === "parcial" ? "aprovou parte do orçamento" : "recusou o orçamento";
  await registrarEvento(db, orc.oficinaId, orc.osId, `${dados.data.nome} ${frase} pelo link`, null);
  revalidatePath(`/orcamento/${token}`);
  revalidatePath(`/ordens-servico/${orc.osId}`);
  revalidatePath("/ordens-servico");
  revalidatePath("/orcamentos");
  revalidatePath("/inicio");
  return undefined;
}
