import "server-only";
import { revalidatePath } from "next/cache";
import type { DB } from "@/db";
import { sincronizarEstoqueOS } from "@/lib/estoque";

/**
 * Acerta o estoque depois de mudar itens ou status de uma OS. Erro de estoque nunca
 * impede a ação na OS: fica só no log (a próxima mudança na OS acerta de novo).
 * `db`: conexão a usar (páginas públicas passam a do sistema); sem ela, a do usuário logado.
 */
export async function sincronizarEstoqueDaOS(oficinaId: string, osId: string, criadoPor: string | null, db?: DB) {
  try {
    if (db) await db.transaction((tx) => sincronizarEstoqueOS(oficinaId, osId, criadoPor, tx));
    else await sincronizarEstoqueOS(oficinaId, osId, criadoPor);
    revalidatePath("/estoque", "layout");
  } catch (e) {
    console.error("Estoque: falha ao sincronizar a OS", osId, e);
  }
}
