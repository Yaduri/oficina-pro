import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import { STATUS_COMPRA, comprasDaOS, dataBR } from "@/lib/compras";
import { hojeSP } from "@/lib/financeiro";
import { cn, formatData } from "@/lib/utils";

/** Pedidos de compra ligados à OS (para quem tem acesso ao estoque) */
export async function ComprasOS({ oficinaId, osId, podePedir }: { oficinaId: string; osId: string; podePedir: boolean }) {
  const lista = await comprasDaOS(oficinaId, osId);
  if (lista.length === 0 && !podePedir) return null;
  const hoje = hojeSP();
  return (
    <Card>
      <CardHeader
        title="Compras de peças"
        action={
          podePedir && (
            <Link href={`/estoque/compras/nova?os=${osId}`} className={buttonClass("secondary", "h-8")}>
              <Plus />
              Pedir peças
            </Link>
          )
        }
      />
      {lista.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-muted">Nenhum pedido para esta OS.</p>
      ) : (
        <ul className="divide-y divide-border">
          {lista.map((c) => {
            const atrasada = c.status === "pedido" && !!c.previsaoEm && c.previsaoEm < hoje;
            return (
              <li key={c.id} className="relative flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-subtle">
                <Link href={`/estoque/compras/${c.id}`} className="min-w-0 text-sm after:absolute after:inset-0">
                  <span className="font-medium">#{c.numero}</span>{" "}
                  <span className="text-foreground-2">{c.fornecedorFantasia || c.fornecedor || "Sem fornecedor"}</span>
                  <span className={cn("block text-[12px] text-muted", atrasada && "font-medium text-danger")}>
                    {c.status === "recebida" && c.recebidaEm
                      ? `Chegou em ${formatData(c.recebidaEm)}`
                      : c.status === "pedido" && c.previsaoEm
                        ? `Previsão ${dataBR(c.previsaoEm)}`
                        : c.status === "pedido"
                          ? "Sem previsão"
                          : ""}
                  </span>
                </Link>
                <Badge tom={atrasada ? "danger" : STATUS_COMPRA[c.status].tom}>{atrasada ? "Atrasado" : STATUS_COMPRA[c.status].label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
