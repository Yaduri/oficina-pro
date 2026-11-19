import Link from "next/link";
import { Badge, Card, CardHeader, Vazio } from "@/components/ui";
import { apurarComissoes, descreverRegra, listarFechamentos } from "@/lib/comissoes";
import { STATUS_LANCAMENTO, hojeSP, somarDiasData } from "@/lib/financeiro";
import { dataBR, lerPeriodo, rotuloPeriodo } from "@/lib/financeiro-relatorios";
import { exigir } from "@/lib/oficina";
import { cn } from "@/lib/utils";
import { BotaoCsv, FiltroPeriodo, Tabela, Td, Th, brl, trClass } from "../relatorios/componentes";
import { DesfazerFechamento, FecharComissao } from "./botoes";

export const metadata = { title: "Comissões" };

export default async function ComissoesPage({ searchParams }: PageProps<"/financeiro/comissoes">) {
  const sp = await searchParams;
  const p = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const { oficina, pode } = await exigir("financeiro");
  const periodo = lerPeriodo(p);
  const [{ apuracao, semRegra }, fechamentos] = await Promise.all([
    apurarComissoes(oficina.id, periodo.de, periodo.ate),
    listarFechamentos(oficina.id),
  ]);
  const vencimento = somarDiasData(hojeSP(), 5);
  const rotulo = rotuloPeriodo(periodo.de, periodo.ate);
  const linkRegras = pode("configurar") ? (
    <Link href="/configuracoes/tecnicos" className="font-medium text-foreground underline underline-offset-2">
      Configurações → Técnicos
    </Link>
  ) : (
    "Configurações → Técnicos (dono ou gerente)"
  );
  // Só mostra quem tem algo no período ou está ativo
  const visiveis = apuracao.filter((a) => a.tecnico.ativo || a.os.length > 0 || a.jaFechadas > 0);

  return (
    <>
      <FiltroPeriodo base="/financeiro/comissoes" periodo={periodo} />

      {visiveis.length === 0 ? (
        <Card>
          <Vazio titulo="Nenhum técnico com regra de comissão">
            Defina a comissão de cada técnico em {linkRegras}.
          </Vazio>
        </Card>
      ) : (
        visiveis.map((a) => (
          <Card key={a.tecnico.id} className="min-w-0 overflow-hidden">
            <CardHeader
              title={
                <span className="flex flex-col">
                  <span>
                    {a.tecnico.nome}
                    {!a.tecnico.ativo && <span className="ml-2 text-[13px] font-normal text-muted">(desativado)</span>}
                  </span>
                  <span className="text-[13px] font-normal text-muted">{descreverRegra(a.regra)}</span>
                </span>
              }
              action={
                <span className="text-right">
                  <span className="block text-[12px] text-muted">A fechar</span>
                  <span className="text-lg font-semibold tabular-nums">{brl(a.total)}</span>
                </span>
              }
            />
            {a.os.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">
                Nenhuma OS entregue a fechar em {rotulo}.
                {a.jaFechadas > 0 && ` ${a.jaFechadas} OS do período já ${a.jaFechadas === 1 ? "está" : "estão"} em fechamentos anteriores.`}
              </p>
            ) : (
              <>
                <Tabela legenda={`OS de ${a.tecnico.nome} a fechar`}>
                  <thead>
                    <tr>
                      <Th>OS</Th>
                      <Th>Entrega</Th>
                      <Th>Veículo</Th>
                      <Th num>Serviços</Th>
                      <Th num>Peças</Th>
                      <Th num>Comissão</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.os.map((o) => (
                      <tr key={o.id} className={cn(trClass, "hover:bg-subtle")}>
                        <Td>
                          <Link href={`/ordens-servico/${o.id}`} className="font-medium underline-offset-2 hover:underline">
                            #{o.numero}
                          </Link>
                        </Td>
                        <Td className="tabular-nums">{dataBR(o.dia)}</Td>
                        <Td className="text-foreground-2">
                          {o.placa}
                          {o.cliente && <span className="text-muted"> · {o.cliente}</span>}
                        </Td>
                        <Td num>{brl(o.servicos)}</Td>
                        <Td num>{brl(o.pecas)}</Td>
                        <Td num className="font-medium">
                          {brl(o.comissao)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border-strong font-semibold">
                      <Td>{a.os.length} OS</Td>
                      <Td />
                      <Td />
                      <Td num>{brl(a.servicos)}</Td>
                      <Td num>{brl(a.pecas)}</Td>
                      <Td num>{brl(a.total)}</Td>
                    </tr>
                  </tfoot>
                </Tabela>
                <div className="flex flex-col gap-2 border-t border-border px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
                  <p className="text-[13px] text-muted">
                    {a.jaFechadas > 0 && `${a.jaFechadas} OS do período já ${a.jaFechadas === 1 ? "foi fechada" : "foram fechadas"} antes. `}
                    Gera a conta a pagar &quot;Comissão {a.tecnico.nome} {rotulo}&quot;.
                  </p>
                  <FecharComissao
                    tecnicoId={a.tecnico.id}
                    nome={a.tecnico.nome}
                    de={periodo.de}
                    ate={periodo.ate}
                    total={a.total}
                    valor={brl(a.total)}
                    vencimento={vencimento}
                  />
                </div>
              </>
            )}
          </Card>
        ))
      )}

      {semRegra.length > 0 && (
        <p className="px-1 text-[13px] text-muted">
          Sem regra de comissão, com OS entregues no período: {semRegra.map((t) => `${t.nome} (${t.qtd} OS)`).join(", ")}. Defina em {linkRegras}.
        </p>
      )}
      <p className="px-1 text-[13px] text-muted">
        Base: OS entregues no período em que o técnico é o responsável, sem itens recusados e com o desconto da OS dividido proporcionalmente
        entre serviços e peças. Cada OS entra em um único fechamento.
      </p>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader title="Fechamentos" action={<BotaoCsv href="/financeiro/comissoes/csv" />} />
        {fechamentos.length === 0 ? (
          <Vazio titulo="Nenhum fechamento ainda">Ao fechar a comissão de um técnico, ela aparece aqui e em A pagar.</Vazio>
        ) : (
          <Tabela legenda="Fechamentos de comissão">
            <thead>
              <tr>
                <Th>Técnico</Th>
                <Th>Período</Th>
                <Th num>OS</Th>
                <Th num>Valor</Th>
                <Th>Conta a pagar</Th>
                <Th>
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {fechamentos.map((f) => {
                const st = f.status ? STATUS_LANCAMENTO[f.status] : null;
                return (
                  <tr key={f.id} className={trClass}>
                    <Td className="font-medium">{f.tecnico}</Td>
                    <Td>{rotuloPeriodo(f.de, f.ate)}</Td>
                    <Td num>{f.qtdOS}</Td>
                    <Td num>{brl(f.valor)}</Td>
                    <Td>
                      {f.lancamentoId && st ? (
                        <span className="flex items-center gap-2">
                          <Badge tom={st.tom}>{st.label}</Badge>
                          <Link
                            href={`/financeiro/pagar?lancamento=${f.lancamentoId}`}
                            className="text-[13px] text-foreground-2 underline underline-offset-2 hover:text-foreground"
                          >
                            {f.vencimento ? `Vence ${dataBR(f.vencimento)}` : "Ver"}
                          </Link>
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted">Removida</span>
                      )}
                    </Td>
                    <Td num>
                      {f.podeDesfazer ? (
                        <DesfazerFechamento id={f.id} rotulo={`de ${f.tecnico} (${rotuloPeriodo(f.de, f.ate)})`} />
                      ) : (
                        <span className="text-[12px] text-muted">Pago</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </Card>
    </>
  );
}
