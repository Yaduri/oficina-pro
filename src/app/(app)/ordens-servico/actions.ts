"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContexto } from "@/lib/oficina";
import { atualizarStatusOS } from "@/lib/queries";

const schema = z.object({
  osId: z.uuid(),
  status: z.enum(["diagnostico", "aguardando_aprovacao", "aguardando_peca", "em_execucao", "pronto", "entregue", "cancelada"]),
});

export async function moverOS(osId: string, status: string) {
  const parsed = schema.safeParse({ osId, status });
  if (!parsed.success) return { ok: false, erro: "Dados inválidos" };

  const { oficina, empresas } = await getContexto();
  const ok = await atualizarStatusOS(oficina.id, empresas.map((e) => e.id), parsed.data.osId, parsed.data.status);
  if (!ok) return { ok: false, erro: "OS não encontrada" };

  revalidatePath("/ordens-servico");
  revalidatePath("/inicio");
  return { ok: true };
}
