import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Card, CardHeader, Vazio } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { ehUuid } from "@/lib/os-acesso";
import { TIPOS_MOVIMENTO } from "@/lib/estoque";
import { movimentosDaPeca, obterPeca } from "@/lib/estoque-pecas";
import { margem, qtdTexto } from "@/lib/estoque-formato";
import { horaSP } from "@/lib/agenda-datas";
import { cn, formatBRL, formatData } from "@/lib/utils";
import { pct, Saldo } from "../saldo";
import { AjustarEstoque } from "./ajustar";

export const metadata = { title: "Peça" };

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[12px] font-medium text-muted">{rotulo}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

const comSinal = (n: number, unidade: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${qtdTexto(Math.abs(n), unidade)}`;

export default async function PecaEstoquePage({ params }: PageProps<"/estoque/[id]">) {
  const { id } = await params;
  const { oficina, pode } = await exigir("estoque");
  if (!ehUuid(id)) notFound();
  const peca = await obterPeca(oficina.id, id);
  if (!peca) notFound();
  const movimentos = await movimentosDaPeca(oficina.id, id);
  const valores = pode("verValores");
  const m = margem(peca.venda, peca.custoMedio);

  const origem = (x: (typeof movimentos)[number]) =>
    x.osId ? (
      <Link href={`/ordens-servico/${x.osId}`} className="font-medium text-foreground underline-offset-4 hover:underline">
        OS #{x.osNumero}
      </Link>
    ) : x.compraId ? (
      <Link href={`/estoque/compras/${x.compraId}`} className="font-medium text-foreground underline-offset-4 hover:underline">
        Compra #{x.compraNumero}
      </Link>
    ) : null;
  // Motivo de saída/devolução pela OS repete "OS #n": não mostra de novo
  const motivo = (x: (typeof movimentos)[number]) => (x.osId && x.motivo?.startsWith("OS #") ? null : x.motivo);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/estoque" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-foreground-2 hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Peças
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold">{peca.descricao}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!peca.controlaEstoque && <Badge tom="warn">Sem controle de estoque</Badge>}
            {!peca.ativo && <Badge>Desativada</Badge>}
            {peca.saldo < 0 && <Badge tom="danger">Saldo negativo</Badge>}
          </div>
        </div>
        {peca.controlaEstoque && <AjustarEstoque id={peca.id} saldo={peca.saldo} unidade={peca.unidade} custo={valores} />}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 p-5">
            <Item rotulo="Saldo">
              <Saldo saldo={peca.saldo} minimo={peca.minimo} unidade={peca.unidade} className="text-lg" />
            </Item>
            <Item rotulo="Mínimo">{peca.minimo > 0 ? qtdTexto(peca.minimo, peca.unidade) : "Não definido"}</Item>
            {valores && (
              <>
                <Item rotulo="Custo médio">{peca.custoMedio > 0 ? formatBRL(peca.custoMedio) : "Sem custo"}</Item>
                <Item rotulo="Preço de venda">{formatBRL(peca.venda)}</Item>
                <Item rotulo="Margem">{pct(m)}</Item>
                <Item rotulo="Valor em estoque">{formatBRL(Math.max(peca.saldo, 0) * peca.custoMedio)}</Item>
              </>
            )}
            {peca.codigo && <Item rotulo="Código">{peca.codigo}</Item>}
            {peca.marca && <Item rotulo="Marca">{peca.marca}</Item>}
            {peca.localizacao && <Item rotulo="Localização">{peca.localizacao}</Item>}
            <Item rotulo="Unidade">{peca.unidade}</Item>
            {peca.gtin && <Item rotulo="Código de barras">{peca.gtin}</Item>}
            {peca.ncm && <Item rotulo="NCM">{peca.ncm}</Item>}
          </dl>
          {pode("configurar") && (
            <div className="border-t border-border px-5 py-3 text-[13px]">
              <Link href="/configuracoes/catalogo?tipo=peca" className="font-medium text-foreground-2 underline-offset-4 hover:underline">
                Alterar no catálogo
              </Link>
            </div>
          )}
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Movimentações" action={<span className="text-[13px] text-muted">{movimentos.length}</span>} />
          {movimentos.length === 0 ? (
            <Vazio titulo="Nenhuma movimentação" />
          ) : (
            <>
              {/* Celular: cartões */}
              <ul className="divide-y divide-border md:hidden">
                {movimentos.map((x) => (
                  <li key={x.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{TIPOS_MOVIMENTO[x.tipo]}</span>
                      <span className={cn("shrink-0 font-semibold tabular-nums", x.quantidade < 0 ? "text-foreground-2" : "text-ok")}>
                        {comSinal(x.quantidade, peca.unidade)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[13px] text-muted">
                      <span>
                        {formatData(x.criadoEm)} {horaSP(x.criadoEm)}
                      </span>
                      {origem(x)}
                      {motivo(x) && <span>{motivo(x)}</span>}
                      {x.criadoPor && <span>{x.criadoPor}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[13px] text-foreground-2">
                      <span>Saldo após {qtdTexto(x.saldoApos, peca.unidade)}</span>
                      {valores && <span>Custo {formatBRL(x.custoUnitario)}</span>}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Tela grande: tabela */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Data</th>
                      <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Movimento</th>
                      <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Qtd.</th>
                      {valores && <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Custo</th>}
                      <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 text-right font-medium">Saldo após</th>
                      <th className="border-b border-border bg-zinc-50/60 px-4 py-2.5 font-medium">Por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map((x) => (
                      <tr key={x.id} className="align-top [&:not(:last-child)>td]:border-b [&>td]:border-border">
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground-2">
                          {formatData(x.criadoEm)}
                          <span className="block text-[12px] text-muted">{horaSP(x.criadoEm)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{TIPOS_MOVIMENTO[x.tipo]}</span>
                          {(origem(x) || motivo(x)) && (
                            <span className="flex flex-wrap gap-x-2 text-[13px] text-muted">
                              {origem(x)}
                              {motivo(x) && <span>{motivo(x)}</span>}
                            </span>
                          )}
                        </td>
                        <td className={cn("whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums", x.quantidade > 0 && "text-ok")}>
                          {comSinal(x.quantidade, peca.unidade)}
                        </td>
                        {valores && <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground-2">{formatBRL(x.custoUnitario)}</td>}
                        <td className={cn("whitespace-nowrap px-4 py-3 text-right tabular-nums", x.saldoApos < 0 && "font-medium text-danger")}>
                          {qtdTexto(x.saldoApos, peca.unidade)}
                        </td>
                        <td className="px-4 py-3 text-foreground-2">{x.criadoPor ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
