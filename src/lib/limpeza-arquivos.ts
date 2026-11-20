import "server-only";
import { isNotNull } from "drizzle-orm";
import { getDbSistema, schema } from "@/db";
import { listarArquivos, removerArquivo } from "@/lib/storage";

/*
 * Limpeza de arquivos órfãos no R2 / disco local (Fase 6.3).
 * Remove fotos de check-ins abandonados, fotos de OS descartadas ou anexos nunca salvos
 * que tenham mais de `idadeMinimaHoras` (padrão 24h) e não sejam referenciados no banco.
 *
 * Regra de ouro: NUNCA toca em backups/ nem na pasta fiscal/ (obrigação legal de 5 anos).
 */

const PASTAS_LIMPAVEIS = new Set(["checkins", "os", "logos", "financeiro"]);

export type ResultadoLimpezaOrfas = {
  analisados: number;
  orfasEncontradas: number;
  removidos: number;
  bytesLiberados: number;
  dryRun: boolean;
  amostraChaves: string[];
};

export async function limparArquivosOrfaos(opts?: {
  idadeMinimaHoras?: number;
  dryRun?: boolean;
  limiteRemocoes?: number;
}): Promise<ResultadoLimpezaOrfas> {
  const idadeMinimaHoras = opts?.idadeMinimaHoras ?? 24;
  const dryRun = opts?.dryRun ?? false;
  const limiteRemocoes = opts?.limiteRemocoes ?? 500;
  const corte = Date.now() - idadeMinimaHoras * 3_600_000;

  const db = await getDbSistema();
  const [ckFotos, ckAss, osFotos, osAss, logos, anexos] = await Promise.all([
    db.select({ k: schema.checkinFotos.key }).from(schema.checkinFotos),
    db.select({ k: schema.checkins.assinaturaKey }).from(schema.checkins).where(isNotNull(schema.checkins.assinaturaKey)),
    db.select({ k: schema.osFotos.key }).from(schema.osFotos),
    db.select({ k: schema.ordensServico.entregaAssinaturaKey }).from(schema.ordensServico).where(isNotNull(schema.ordensServico.entregaAssinaturaKey)),
    db.select({ k: schema.oficinas.logoKey }).from(schema.oficinas).where(isNotNull(schema.oficinas.logoKey)),
    db.select({ k: schema.lancamentos.anexoKey }).from(schema.lancamentos).where(isNotNull(schema.lancamentos.anexoKey)),
  ]);

  const emUso = new Set<string>();
  for (const l of [ckFotos, ckAss, osFotos, osAss, logos, anexos]) {
    for (const r of l) if (r.k) emUso.add(r.k);
  }

  const objetos = await listarArquivos("");
  let analisados = 0;
  let orfasEncontradas = 0;
  let removidos = 0;
  let bytesLiberados = 0;
  const amostraChaves: string[] = [];

  for (const obj of objetos) {
    // Formato esperado: <oficinaId>/<pasta>/...
    const partes = obj.key.split("/");
    const pasta = partes[1];
    if (partes.length < 3 || !PASTAS_LIMPAVEIS.has(pasta)) continue;

    analisados++;
    if (obj.modificadoEm.getTime() > corte) continue; // Recente (< 24h): pode estar em check-in aberto
    if (emUso.has(obj.key)) continue;

    orfasEncontradas++;
    if (amostraChaves.length < 20) amostraChaves.push(obj.key);

    if (!dryRun && removidos < limiteRemocoes) {
      await removerArquivo(obj.key);
      removidos++;
      bytesLiberados += obj.tamanho;
    }
  }

  return { analisados, orfasEncontradas, removidos, bytesLiberados, dryRun, amostraChaves };
}
