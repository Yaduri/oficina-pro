import Link from "next/link";
import { Camera, ChevronRight, PenLine } from "lucide-react";
import { Card, PageHeader, Placa, Vazio, buttonClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { listarCheckins } from "@/lib/checkin-dados";
import { urlArquivo } from "@/lib/storage";
import { formatEntrada } from "@/lib/utils";

export const metadata = { title: "Check-in" };

export default async function CheckinsPage() {
  const { oficina } = await getContexto();
  const lista = await listarCheckins(oficina.id);

  return (
    <>
      <PageHeader
        title="Check-in"
        actions={
          <Link href="/check-in/novo" className={buttonClass("primary")}>
            <Camera />Novo check-in
          </Link>
        }
      />

      <Card>
        {lista.length === 0 ? (
          <Vazio titulo="Nenhum check-in ainda">
            Faça o check-in pelo celular quando o veículo chegar.
          </Vazio>
        ) : (
          <ul className="divide-y divide-border">
            {lista.map((c) => (
              <li key={c.id}>
                <Link href={`/check-in/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-subtle">
                    {c.fotos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado servido por /arquivos
                      <img src={urlArquivo(c.fotos[0])} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <Camera className="absolute inset-0 m-auto size-5 text-muted" strokeWidth={1.75} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Placa placa={c.placa} />
                      <span className="truncate font-medium">{[c.marca, c.modelo].filter(Boolean).join(" ")}</span>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-muted">
                      {formatEntrada(c.criadoEm)} · {c.cliente ?? "Sem cliente"} · {c.fotos.length} {c.fotos.length === 1 ? "foto" : "fotos"}
                      {c.assinado && (
                        <>
                          {" · "}
                          <PenLine className="inline size-3.5 align-[-2px]" aria-hidden /> assinado
                        </>
                      )}
                    </p>
                  </div>
                  <div className="hidden flex-col items-end gap-1 sm:flex">
                    {c.ordens.map((o) => (
                      <span key={o.id} className="text-[12px] font-medium text-foreground-2">
                        OS #{o.numero}
                      </span>
                    ))}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
