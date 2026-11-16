"use server";

import { revalidatePath } from "next/cache";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { exigirAdmin } from "@/lib/oficina";
import { listarChecklist } from "@/lib/checklist-dados";
import { SUGESTAO_CHECKLIST } from "@/lib/checklist";

export type ChecklistState = { erro?: string; ok?: boolean } | undefined;

const { checklistItens } = schema;

function revalidar() {
  revalidatePath("/configuracoes/checklist");
  revalidatePath("/check-in/novo");
}

async function proximaOrdem(oficinaId: string) {
  const db = await getDb();
  const [r] = await db.select({ m: max(checklistItens.ordem) }).from(checklistItens).where(eq(checklistItens.oficinaId, oficinaId));
  return (r?.m ?? -1) + 1;
}

export async function adicionarItemChecklist(_prev: ChecklistState, form: FormData): Promise<ChecklistState> {
  const { oficina } = await exigirAdmin();
  const dados = z
    .object({
      grupo: z.string().trim().min(2, "Informe o grupo (ex.: Itens do veículo)").max(40, "Grupo muito longo"),
      descricao: z.string().trim().min(2, "Informe o item").max(80, "Item muito longo"),
    })
    .safeParse({ grupo: form.get("grupo") ?? "", descricao: form.get("descricao") ?? "" });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const db = await getDb();
  const existentes = await listarChecklist(oficina.id);
  const repetido = existentes.some(
    (i) => i.grupo.toLowerCase() === dados.data.grupo.toLowerCase() && i.descricao.toLowerCase() === dados.data.descricao.toLowerCase(),
  );
  if (repetido) return { erro: "Esse item já está na lista" };
  // Reaproveita a grafia de um grupo que já existe
  const grupo = existentes.find((i) => i.grupo.toLowerCase() === dados.data.grupo.toLowerCase())?.grupo ?? dados.data.grupo;

  await db.insert(checklistItens).values({ oficinaId: oficina.id, grupo, descricao: dados.data.descricao, ordem: await proximaOrdem(oficina.id) });
  revalidar();
  return { ok: true };
}

/** Adiciona os itens sugeridos que ainda não estão na lista */
export async function adicionarSugestao() {
  const { oficina } = await exigirAdmin();
  const db = await getDb();
  const existentes = await listarChecklist(oficina.id);
  const chave = (g: string, d: string) => `${g}|${d}`.toLowerCase();
  const tem = new Set(existentes.map((i) => chave(i.grupo, i.descricao)));
  let ordem = await proximaOrdem(oficina.id);
  const novos = SUGESTAO_CHECKLIST.flatMap((g) =>
    g.itens.filter((d) => !tem.has(chave(g.grupo, d))).map((descricao) => ({ oficinaId: oficina.id, grupo: g.grupo, descricao, ordem: ordem++ })),
  );
  if (novos.length > 0) await db.insert(checklistItens).values(novos);
  revalidar();
}

async function itemDaOficina(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { oficina } = await exigirAdmin();
  const db = await getDb();
  const [item] = await db.select().from(checklistItens).where(and(eq(checklistItens.id, id), eq(checklistItens.oficinaId, oficina.id)));
  return item ? { db, item, oficina } : null;
}

export async function alternarItemChecklist(id: string, ativo: boolean) {
  const r = await itemDaOficina(id);
  if (!r) return;
  await r.db.update(checklistItens).set({ ativo }).where(eq(checklistItens.id, id));
  revalidar();
}

export async function removerItemChecklist(id: string) {
  const r = await itemDaOficina(id);
  if (!r) return;
  // Check-ins antigos guardam a própria cópia do checklist: apagar aqui não afeta o histórico
  await r.db.delete(checklistItens).where(eq(checklistItens.id, id));
  revalidar();
}

/** Sobe ou desce o item dentro do grupo dele */
export async function moverItemChecklist(id: string, direcao: "cima" | "baixo") {
  const r = await itemDaOficina(id);
  if (!r) return;
  const doGrupo = (await listarChecklist(r.oficina.id)).filter((i) => i.grupo === r.item.grupo);
  const pos = doGrupo.findIndex((i) => i.id === id);
  const vizinho = doGrupo[direcao === "cima" ? pos - 1 : pos + 1];
  if (!vizinho) return;
  // Ordens iguais (itens antigos) também precisam trocar de lugar
  const [a, b] = vizinho.ordem === r.item.ordem ? [r.item.ordem + (direcao === "cima" ? -1 : 1), r.item.ordem] : [vizinho.ordem, r.item.ordem];
  await r.db.transaction(async (tx) => {
    await tx.update(checklistItens).set({ ordem: a }).where(eq(checklistItens.id, r.item.id));
    await tx.update(checklistItens).set({ ordem: b }).where(eq(checklistItens.id, vizinho.id));
  });
  revalidar();
}
