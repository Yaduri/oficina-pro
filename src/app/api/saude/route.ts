import { sql } from "drizzle-orm";
import { getDbSistema } from "@/db";

/*
 * Healthcheck da aplicação (Fase 6.3).
 * Verifica se o worker/Next responde e se a conexão com o Postgres/Supabase está saudável.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const inicio = Date.now();
  try {
    const db = await getDbSistema();
    await db.execute(sql`SELECT 1`);
    return Response.json(
      { ok: true, banco: "ok", latenciaMs: Date.now() - inicio, quando: new Date().toISOString() },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[saude] falha no banco:", e);
    return Response.json(
      { ok: false, banco: "erro", latenciaMs: Date.now() - inicio },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
