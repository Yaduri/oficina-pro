"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { podeGerenciarPapel, type Papel } from "@/lib/permissoes";

export type UsuarioState = { erro?: string; ok?: boolean } | undefined;

const papelEnum = z.enum(["dono", "gerente", "financeiro", "atendente", "tecnico"], { error: "Escolha o papel" });
const DIAS_CONVITE = 7;

/** Lê papel + empresas do formulário e confere se quem está alterando pode dar esse acesso */
async function lerAcesso(form: FormData) {
  const ctx = await getContexto();
  if (!ctx.pode("usuarios")) return { erro: "Seu usuário não pode gerenciar usuários" } as const;
  const papel = papelEnum.safeParse(form.get("papel"));
  if (!papel.success) return { erro: papel.error.issues[0].message } as const;
  if (!podeGerenciarPapel(ctx.papel, papel.data)) return { erro: "Só um dono pode dar o papel de dono" } as const;

  // Ninguém dá acesso a uma empresa que ele próprio não vê
  const todasDaOficina = ctx.empresas.length === ctx.oficina.empresas.length;
  const todas = form.get("todasEmpresas") === "on" && todasDaOficina;
  const visiveis = new Set(ctx.empresas.map((e) => e.id));
  const empresaIds = todas ? [] : form.getAll("empresas").map(String).filter((id) => visiveis.has(id));
  if (!todas && empresaIds.length === 0) return { erro: "Escolha ao menos uma empresa" } as const;
  return { ctx, papel: papel.data, todas, empresaIds } as const;
}

function revalidar() {
  revalidatePath("/configuracoes/usuarios");
}

/* ---------- Convites ---------- */

export async function criarConvite(_prev: UsuarioState, form: FormData): Promise<UsuarioState> {
  const nome = z.string().trim().min(2, "Informe o nome de quem vai receber o convite").max(80).safeParse(form.get("nome") ?? "");
  if (!nome.success) return { erro: nome.error.issues[0].message };
  const r = await lerAcesso(form);
  if ("erro" in r) return { erro: r.erro };

  const db = await getDb();
  await db.insert(schema.convites).values({
    oficinaId: r.ctx.oficina.id,
    token: randomBytes(24).toString("base64url"),
    nome: nome.data,
    papel: r.papel,
    todasEmpresas: r.todas,
    empresaIds: r.empresaIds,
    criadoPor: r.ctx.userId,
    expiraEm: new Date(Date.now() + DIAS_CONVITE * 86_400_000),
  });
  revalidar();
  return { ok: true };
}

export async function cancelarConvite(conviteId: string) {
  if (!z.uuid().safeParse(conviteId).success) return;
  const ctx = await getContexto();
  if (!ctx.pode("usuarios")) return;
  const db = await getDb();
  await db
    .update(schema.convites)
    .set({ canceladoEm: new Date() })
    .where(
      and(
        eq(schema.convites.id, conviteId),
        eq(schema.convites.oficinaId, ctx.oficina.id),
        isNull(schema.convites.aceitoEm),
        isNull(schema.convites.canceladoEm),
      ),
    );
  revalidar();
}

/* ---------- Membros ---------- */

/** Membro da oficina que o usuário atual pode alterar (não pode alterar a si mesmo) */
async function membroAlteravel(membroId: string) {
  if (!z.uuid().safeParse(membroId).success) return { erro: "Usuário não encontrado" } as const;
  const ctx = await getContexto();
  if (!ctx.pode("usuarios")) return { erro: "Seu usuário não pode gerenciar usuários" } as const;
  const db = await getDb();
  const [m] = await db
    .select()
    .from(schema.membros)
    .where(and(eq(schema.membros.id, membroId), eq(schema.membros.oficinaId, ctx.oficina.id)));
  if (!m) return { erro: "Usuário não encontrado" } as const;
  if (m.clerkUserId === ctx.userId) return { erro: "Você não pode alterar o seu próprio acesso" } as const;
  if (!podeGerenciarPapel(ctx.papel, m.papel)) return { erro: "Só um dono pode alterar outro dono" } as const;
  return { ctx, db, m } as const;
}

/** A oficina precisa continuar com ao menos um dono ativo */
async function sobraDono(db: DB, oficinaId: string, exceto: string) {
  const [outro] = await db
    .select({ id: schema.membros.id })
    .from(schema.membros)
    .where(
      and(
        eq(schema.membros.oficinaId, oficinaId),
        eq(schema.membros.papel, "dono"),
        eq(schema.membros.ativo, true),
        ne(schema.membros.id, exceto),
      ),
    )
    .limit(1);
  return !!outro;
}

export async function atualizarMembro(membroId: string, _prev: UsuarioState, form: FormData): Promise<UsuarioState> {
  const alvo = await membroAlteravel(membroId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const r = await lerAcesso(form);
  if ("erro" in r) return { erro: r.erro };
  const { db, m } = alvo;

  if (m.papel === "dono" && r.papel !== "dono" && !(await sobraDono(db, m.oficinaId, m.id))) {
    return { erro: "A oficina precisa ter ao menos um dono" };
  }

  await db.transaction(async (tx) => {
    await tx.update(schema.membros).set({ papel: r.papel as Papel, todasEmpresas: r.todas }).where(eq(schema.membros.id, m.id));
    await tx.delete(schema.membroEmpresas).where(eq(schema.membroEmpresas.membroId, m.id));
    if (r.empresaIds.length > 0) {
      await tx.insert(schema.membroEmpresas).values(r.empresaIds.map((empresaId) => ({ membroId: m.id, empresaId })));
    }
  });
  revalidar();
  return { ok: true };
}

export async function alterarAtivo(membroId: string, ativo: boolean): Promise<UsuarioState> {
  const alvo = await membroAlteravel(membroId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { db, m } = alvo;
  if (!ativo && m.papel === "dono" && !(await sobraDono(db, m.oficinaId, m.id))) {
    return { erro: "A oficina precisa ter ao menos um dono ativo" };
  }
  await db.update(schema.membros).set({ ativo }).where(eq(schema.membros.id, m.id));
  revalidar();
  return { ok: true };
}
