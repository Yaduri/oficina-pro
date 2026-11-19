import { and, asc, eq, sql } from "drizzle-orm";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { descreverRegra, regraDo } from "@/lib/comissoes";
import { exigirAdmin } from "@/lib/oficina";
import { ABERTAS } from "@/lib/os";
import { AbasConfig } from "../abas";
import { FormTecnico, ListaTecnicos } from "./lista";

export const metadata = { title: "Técnicos" };

export default async function TecnicosPage() {
  const { oficina } = await exigirAdmin();
  const db = await getDb();
  const { tecnicos: t, ordensServico: os } = schema;
  const abertas = sql.join(
    ABERTAS.map((s) => sql`${s}`),
    sql`, `,
  );
  const rows = await db
    .select({
      id: t.id,
      nome: t.nome,
      ativo: t.ativo,
      comissaoServicoPct: t.comissaoServicoPct,
      comissaoPecaPct: t.comissaoPecaPct,
      comissaoFixaOs: t.comissaoFixaOs,
      total: sql<number>`count(${os.id})::int`,
      abertas: sql<number>`count(${os.id}) filter (where ${os.status} in (${abertas}))::int`,
    })
    .from(t)
    .leftJoin(os, eq(os.responsavelId, t.id))
    .where(and(eq(t.oficinaId, oficina.id)))
    .groupBy(t.id)
    .orderBy(sql`${t.ativo} desc`, asc(t.nome));
  const tecnicos = rows.map((r) => ({ ...r, regra: descreverRegra(regraDo(r)) }));

  return (
    <>
      <PageHeader title="Configurações" description="Aparecem como responsável da OS e não precisam de login." />
      <AbasConfig />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ListaTecnicos tecnicos={tecnicos} />
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Novo técnico" />
            <div className="p-5">
              <FormTecnico />
            </div>
          </Card>
          <p className="px-1 text-[13px] text-muted">
            Se o técnico também for usar o sistema, convide-o em Usuários com o papel Técnico.
          </p>
        </div>
      </div>
    </>
  );
}
