import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { checklistItens } = schema;

export async function listarChecklist(oficinaId: string, somenteAtivos = false) {
  const db = await getDb();
  return db
    .select()
    .from(checklistItens)
    .where(somenteAtivos ? and(eq(checklistItens.oficinaId, oficinaId), eq(checklistItens.ativo, true)) : eq(checklistItens.oficinaId, oficinaId))
    .orderBy(asc(checklistItens.ordem), asc(checklistItens.criadoEm));
}
