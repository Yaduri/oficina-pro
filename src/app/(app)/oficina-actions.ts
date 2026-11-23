"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { definirOficinaAtivaCookie, oficinaDaRequisicao } from "@/lib/oficina-ativa";
import { pode, type Acao } from "@/lib/permissoes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rotas permitidas para manter o usuário na mesma seção ao trocar de oficina (mesmas permissões do Topbar) */
const RETORNOS_PERMITIDOS: Record<string, Acao> = {
  "/check-in/novo": "checkin",
  "/check-in": "checkin",
  "/ordens-servico": "checkin",
  "/agenda": "checkin",
  "/clientes": "checkin",
  "/notas": "fiscal",
  "/inicio": "checkin",
};

/**
 * Troca a oficina ativa do usuário logado, gravando o cookie de preferência e redirecionando
 * para uma rota compatível com o papel dele na oficina de destino.
 */
export async function trocarOficina(oficinaId: string, retorno?: string): Promise<{ erro?: string }> {
  if (typeof oficinaId !== "string" || !UUID_RE.test(oficinaId)) return { erro: "Oficina inválida" };

  const { vinculos } = await oficinaDaRequisicao();
  const alvo = vinculos.find((v) => v.oficina.id === oficinaId);
  if (!alvo) return { erro: "Você não tem acesso a esta oficina" };

  await definirOficinaAtivaCookie(oficinaId);
  revalidatePath("/", "layout");

  const papelDestino = alvo.membro.papel;
  let destino = papelDestino === "contador" ? "/notas" : "/inicio";
  if (papelDestino !== "contador" && typeof retorno === "string" && Object.hasOwn(RETORNOS_PERMITIDOS, retorno)) {
    const acao = RETORNOS_PERMITIDOS[retorno];
    if (pode(papelDestino, acao)) destino = retorno;
  }

  redirect(destino);
}
