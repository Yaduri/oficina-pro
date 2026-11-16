"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getContexto } from "@/lib/oficina";
import { TERMO_PADRAO } from "@/lib/textos";
import { gravarVeiculo, prepararVeiculo, proximoNumeroOS } from "@/lib/veiculo-form";
import { soDigitos } from "@/lib/utils";
import { POSICOES } from "@/lib/checkin";

export type CheckinState = { erro?: string } | undefined;

const texto = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => v || null);

const checkinSchema = z.object({
  empresaIds: z.array(z.uuid()).min(1, "Escolha pelo menos uma empresa (gera uma OS para cada)"),
  km: z
    .string()
    .transform(soDigitos)
    .transform((v) => (v ? Number(v) : null)),
  combustivel: z
    .string()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 8), "Nível de combustível inválido"),
  relato: z.string().trim().min(3, "Descreva o que o cliente relatou"),
  avarias: texto,
  objetos: texto,
  fotos: z
    .array(z.object({ posicao: z.enum(POSICOES), key: z.string().min(1) }))
    .max(30, "Máximo de 30 fotos"),
  assinaturaKey: z.string(),
});

const f = (form: FormData, k: string) => String(form.get(k) ?? "");

export async function criarCheckin(_prev: CheckinState, form: FormData): Promise<CheckinState> {
  const { oficina, empresas, userId } = await getContexto();

  let fotos: unknown = [];
  try {
    fotos = JSON.parse(f(form, "fotos") || "[]");
  } catch {
    return { erro: "Fotos inválidas" };
  }
  const parsed = checkinSchema.safeParse({
    empresaIds: form.getAll("empresaIds").map(String),
    km: f(form, "km"),
    combustivel: f(form, "combustivel"),
    relato: f(form, "relato"),
    avarias: f(form, "avarias"),
    objetos: f(form, "objetos"),
    fotos,
    assinaturaKey: f(form, "assinaturaKey"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.empresaIds.some((id) => !empresas.some((e) => e.id === id))) return { erro: "Empresa não permitida" };
  // Só aceita arquivos enviados para esta oficina
  const prefixo = `${oficina.id}/checkins/`;
  if (d.fotos.some((ft) => !ft.key.startsWith(prefixo)) || (d.assinaturaKey && !d.assinaturaKey.startsWith(prefixo))) {
    return { erro: "Arquivo inválido" };
  }

  const prep = await prepararVeiculo(oficina.id, form);
  if ("erro" in prep) return prep;

  const db = await getDb();
  const checkinId = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DB;
    const { veiculoId, clienteId } = await gravarVeiculo(tx, oficina.id, prep.ok, d.km);

    const [checkin] = await tx
      .insert(schema.checkins)
      .values({
        oficinaId: oficina.id,
        veiculoId,
        clienteId,
        km: d.km,
        combustivel: d.combustivel,
        relato: d.relato,
        avarias: d.avarias,
        objetos: d.objetos,
        assinaturaKey: d.assinaturaKey || null,
        termo: d.assinaturaKey ? (oficina.textoTermoCheckin ?? TERMO_PADRAO) : null,
        criadoPor: userId,
      })
      .returning({ id: schema.checkins.id });

    if (d.fotos.length > 0) {
      await tx
        .insert(schema.checkinFotos)
        .values(d.fotos.map((ft, i) => ({ checkinId: checkin.id, posicao: ft.posicao, key: ft.key, ordem: i })));
    }

    // Uma OS por empresa escolhida, já ligada ao check-in
    let numero = await proximoNumeroOS(tx, oficina.id);
    for (const empresaId of d.empresaIds) {
      await tx.insert(schema.ordensServico).values({
        oficinaId: oficina.id,
        empresaId,
        numero: numero++,
        checkinId: checkin.id,
        veiculoId,
        clienteId,
        descricao: d.relato,
        kmEntrada: d.km,
      });
    }
    return checkin.id;
  });

  revalidatePath("/check-in");
  revalidatePath("/ordens-servico");
  revalidatePath("/inicio");
  revalidatePath("/clientes");
  redirect(`/check-in/${checkinId}`);
}
