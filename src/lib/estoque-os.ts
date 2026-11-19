import "server-only";
import { revalidatePath } from "next/cache";
import { sincronizarEstoqueOS } from "@/lib/estoque";

/**
 * Acerta o estoque depois de mudar itens ou status de uma OS. Erro de estoque nunca
 * impede a ação na OS: fica só no log (a próxima mudança na OS acerta de novo).
 */
export async function sincronizarEstoqueDaOS(oficinaId: string, osId: string, criadoPor: string | null) {
  try {
    await sincronizarEstoqueOS(oficinaId, osId, criadoPor);
    revalidatePath("/estoque", "layout");
  } catch (e) {
    console.error("Estoque: falha ao sincronizar a OS", osId, e);
  }
}
