import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";

/*
 * Registro de auditoria (Fase 6.2).
 * Registra alterações de valores, cancelamentos, exclusões, emissões/cancelamentos fiscais,
 * alterações de permissões e operações LGPD.
 */

export type EntradaAuditoria = {
  oficinaId: string;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  tabela: string;
  registroId?: string | null;
  acao: string;
  resumo: string;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  db?: DB;
};

export const ROTULO_TABELA_AUDITORIA: Record<string, string> = {
  ordens_servico: "Ordem de serviço",
  os_itens: "Item da OS",
  orcamentos: "Orçamento",
  lancamentos: "Financeiro",
  baixas: "Pagamento / baixa",
  notas_fiscais: "Nota fiscal",
  configuracoes_fiscais: "Configuração fiscal",
  clientes: "Cliente",
  veiculos: "Veículo",
  membros: "Usuário / acesso",
  oficinas: "Conta da oficina",
};

export const ROTULO_ACAO_AUDITORIA: Record<string, string> = {
  alterar_valor: "Alterou valor",
  desconto: "Alterou desconto",
  cancelar: "Cancelou",
  reabrir: "Reabriu",
  excluir: "Excluiu",
  estornar: "Estornou pagamento",
  emitir_nota: "Emitiu NFS-e",
  cancelar_nota: "Cancelou NFS-e",
  certificado: "Alterou certificado A1",
  alterar_acesso: "Alterou acesso",
  exportar_lgpd: "Exportou dados (LGPD)",
  anonimizar_lgpd: "Anonimizou/apagou (LGPD)",
  exportar_conta: "Exportou conta completa",
};

/**
 * Grava uma entrada na trilha de auditoria.
 * Falhas no registro são logadas mas nunca interrompem a operação principal do usuário.
 */
export async function registrarAuditoria(p: EntradaAuditoria): Promise<void> {
  try {
    const db = p.db ?? (await getDb());
    await db.insert(schema.auditoria).values({
      oficinaId: p.oficinaId,
      usuarioId: p.usuarioId ?? null,
      usuarioNome: p.usuarioNome ?? null,
      tabela: p.tabela,
      registroId: p.registroId ?? null,
      acao: p.acao,
      resumo: p.resumo.slice(0, 500),
      antes: p.antes ?? null,
      depois: p.depois ?? null,
    });
  } catch (e) {
    console.error("[auditoria] falha ao gravar registro:", e);
  }
}

export async function listarAuditoria(
  oficinaId: string,
  filtros?: { tabela?: string; acao?: string; busca?: string; limite?: number },
) {
  const db = await getDb();
  const conds = [eq(schema.auditoria.oficinaId, oficinaId)];
  if (filtros?.tabela) conds.push(eq(schema.auditoria.tabela, filtros.tabela));
  if (filtros?.acao) conds.push(eq(schema.auditoria.acao, filtros.acao));
  if (filtros?.busca?.trim()) {
    const like = `%${filtros.busca.trim().replace(/[%_\\]/g, "")}%`;
    conds.push(or(ilike(schema.auditoria.resumo, like), ilike(schema.auditoria.usuarioNome, like))!);
  }

  return db
    .select()
    .from(schema.auditoria)
    .where(and(...conds))
    .orderBy(desc(schema.auditoria.criadoEm))
    .limit(filtros?.limite ?? 150);
}
