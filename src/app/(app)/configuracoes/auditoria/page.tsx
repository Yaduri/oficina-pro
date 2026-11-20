import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge, Card, PageHeader, Vazio } from "@/components/ui";
import { listarAuditoria, ROTULO_ACAO_AUDITORIA, ROTULO_TABELA_AUDITORIA } from "@/lib/auditoria";
import { exigirAdmin } from "@/lib/oficina";
import { formatEntrada } from "@/lib/utils";
import { AbasConfig } from "../abas";

export const metadata = { title: "Auditoria" };

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tabela?: string; busca?: string }>;
}) {
  const { oficina } = await exigirAdmin();
  const sp = await searchParams;
  const tabela = sp.tabela && Object.hasOwn(ROTULO_TABELA_AUDITORIA, sp.tabela) ? sp.tabela : undefined;
  const busca = sp.busca?.trim() || undefined;
  const registros = await listarAuditoria(oficina.id, { tabela, busca });

  return (
    <>
      <PageHeader title="Configurações" description="Registro de auditoria: quem alterou valores, cancelou, excluiu, emitiu notas ou executou ações LGPD." />

      <AbasConfig />

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Link
          href="/configuracoes/auditoria"
          className={`rounded-full border px-3 py-1 font-medium ${!tabela ? "border-foreground bg-foreground text-white" : "border-border text-foreground-2 hover:bg-subtle"}`}
        >
          Tudo
        </Link>
        {Object.entries(ROTULO_TABELA_AUDITORIA).map(([k, label]) => (
          <Link
            key={k}
            href={`/configuracoes/auditoria?tabela=${k}`}
            className={`rounded-full border px-3 py-1 font-medium ${tabela === k ? "border-foreground bg-foreground text-white" : "border-border text-foreground-2 hover:bg-subtle"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {registros.length === 0 ? (
          <Vazio titulo="Nenhum evento de auditoria registrado">
            Alterações de valores, descontos, cancelamentos, exclusões, estornos, notas fiscais e ações LGPD aparecem aqui automaticamente.
          </Vazio>
        ) : (
          <ul className="divide-y divide-border">
            {registros.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5 px-4 py-3.5 text-[13px] sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-muted" aria-hidden />
                  <Badge tom="neutro">{ROTULO_TABELA_AUDITORIA[r.tabela] ?? r.tabela}</Badge>
                  <Badge tom={r.acao.includes("cancel") || r.acao.includes("exclu") || r.acao.includes("estorn") || r.acao.includes("anonim") ? "warn" : "info"}>
                    {ROTULO_ACAO_AUDITORIA[r.acao] ?? r.acao}
                  </Badge>
                  <span className="ml-auto text-xs text-muted">{formatEntrada(r.criadoEm)}</span>
                </div>
                <p className="font-medium text-foreground">{r.resumo}</p>
                <p className="text-xs text-muted">Por {r.usuarioNome || r.usuarioId || "Sistema"}</p>
                {(r.antes || r.depois) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">Ver detalhes (antes / depois)</summary>
                    <div className="mt-2 grid gap-2 rounded-md bg-subtle p-3 font-mono text-[11px] sm:grid-cols-2">
                      {r.antes && (
                        <div>
                          <div className="mb-1 font-sans text-[11px] font-semibold text-muted">Antes</div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(r.antes, null, 2)}</pre>
                        </div>
                      )}
                      {r.depois && (
                        <div>
                          <div className="mb-1 font-sans text-[11px] font-semibold text-muted">Depois</div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(r.depois, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
