import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, CalendarPlus, Camera, Wrench } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, Placa, Vazio, buttonClass } from "@/components/ui";
import { getContexto } from "@/lib/oficina";
import { historicoVeiculo, obterVeiculo, opcoesClientes, usoDoVeiculo } from "@/lib/cadastros";
import { STATUS } from "@/lib/os";
import { nomeCombustivel } from "@/lib/veiculo";
import { formatBRL, formatData, formatTelefone } from "@/lib/utils";
import { AcoesArquivo } from "../../clientes/arquivar";
import { TransferirVeiculo } from "./transferir";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: PageProps<"/veiculos/[id]">) {
  const { id } = await params;
  const { oficina } = await getContexto();
  const r = UUID.test(id) ? await obterVeiculo(oficina.id, id) : null;
  return { title: r ? `${r.veiculo.placa} · ${r.veiculo.modelo}` : "Veículo" };
}

export default async function VeiculoPage({ params }: PageProps<"/veiculos/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { oficina, pode } = await getContexto();
  const r = await obterVeiculo(oficina.id, id);
  if (!r) notFound();
  const { veiculo: v, cliente } = r;
  const editavel = pode("cadastros");
  const [hist, uso, clientes] = await Promise.all([
    historicoVeiculo(oficina.id, v.id),
    usoDoVeiculo(oficina.id, v.id),
    editavel ? opcoesClientes(oficina.id) : [],
  ]);

  const dados = [
    ["Marca", v.marca],
    ["Modelo", v.modelo],
    ["Ano", v.ano],
    ["Cor", v.cor],
    ["Km atual", v.km != null ? `${v.km.toLocaleString("pt-BR")} km` : null],
    ["Combustível", nomeCombustivel(v.combustivel)],
    ["Chassi", v.chassi],
    ["Motor", v.motor],
  ] as const;

  return (
    <>
      <Link
        href={cliente ? `/clientes/${cliente.id}` : "/clientes"}
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {cliente?.nome ?? "Clientes"}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Placa placa={v.placa} />
            {[v.marca, v.modelo].filter(Boolean).join(" ")}
            {v.arquivadoEm && <Badge tom="neutro">Arquivado</Badge>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {pode("abrirOS") && (
              <Link href={`/agenda/novo?veiculo=${v.id}`} className={buttonClass("secondary")}>
                <CalendarPlus />
                Agendar
              </Link>
            )}
            {pode("checkin") && (
              <Link href={`/check-in/novo?veiculo=${v.id}`} className={buttonClass("secondary")}>
                <Camera />
                Check-in
              </Link>
            )}
            {pode("abrirOS") && (
              <Link href={`/ordens-servico/nova?veiculo=${v.id}`} className={buttonClass("primary")}>
                <Wrench />
                Abrir OS
              </Link>
            )}
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Dono atual" />
            <div className="flex flex-col gap-4 p-5">
              {cliente ? (
                <Link href={`/clientes/${cliente.id}`} className="w-fit hover:underline">
                  <span className="font-medium">{cliente.nome}</span>
                  {cliente.telefone && <span className="text-[13px] text-muted"> · {formatTelefone(cliente.telefone)}</span>}
                </Link>
              ) : (
                <p className="text-[13px] text-muted">Sem dono cadastrado.</p>
              )}
              {editavel && <TransferirVeiculo veiculoId={v.id} donoAtual={cliente?.id ?? null} clientes={clientes} />}
            </div>
          </Card>

          <Card>
            <CardHeader title="Dados do veículo" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-5 text-sm">
              {dados.map(([rotulo, valor]) => (
                <div key={rotulo} className="contents">
                  <dt className="text-muted">{rotulo}</dt>
                  <dd className="min-w-0 break-words">{valor ?? <span className="text-muted">—</span>}</dd>
                </div>
              ))}
            </dl>
            {editavel && cliente && (
              <p className="border-t border-border px-5 py-3 text-[13px] text-muted">
                Para editar, use o lápis do veículo no{" "}
                <Link href={`/clientes/${cliente.id}`} className="underline">
                  cadastro do cliente
                </Link>
                .
              </p>
            )}
          </Card>

          {editavel && (
            <Card>
              <CardHeader title="Arquivar ou excluir" />
              <div className="p-5">
                <AcoesArquivo
                  tipo="veiculo"
                  id={v.id}
                  arquivado={!!v.arquivadoEm}
                  temHistorico={uso > 0}
                  rotulo={`o veículo ${v.placa}`}
                  depoisDeExcluir={cliente ? `/clientes/${cliente.id}` : "/clientes"}
                />
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Histórico de serviços" action={<span className="text-[13px] text-muted">{hist.ordens.length} OS</span>} />
            {hist.ordens.length === 0 ? (
              <Vazio titulo="Nenhuma OS para este veículo" />
            ) : (
              <ul className="divide-y divide-border">
                {hist.ordens.map((o) => (
                  <li key={o.id}>
                    <Link href={`/ordens-servico/${o.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-subtle sm:px-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium">OS #{o.numero}</span>
                        <span className="text-[13px] text-muted">
                          {formatData(o.entradaEm)}
                          {o.kmEntrada != null && ` · ${o.kmEntrada.toLocaleString("pt-BR")} km`}
                        </span>
                        <span className="ml-auto font-semibold tabular-nums">{pode("verValores") && o.total > 0 ? formatBRL(o.total) : ""}</span>
                      </div>
                      <p className="text-[13px] text-foreground-2">{o.descricao}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tom={STATUS[o.status].tom}>{STATUS[o.status].label}</Badge>
                        {o.cliente && cliente && o.cliente !== cliente.nome && (
                          <span className="text-[12px] text-muted">Dono na época: {o.cliente}</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {hist.trocas.length > 0 && (
            <Card>
              <CardHeader title="Trocas de dono" />
              <ul className="divide-y divide-border">
                {hist.trocas.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3 text-[13px] sm:px-5">
                    <ArrowRightLeft className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    <div>
                      <p>
                        {t.deNome ?? "Sem dono"} → <span className="font-medium">{t.paraNome ?? "—"}</span>
                      </p>
                      <p className="text-muted">
                        {formatData(t.criadoEm)}
                        {t.por && ` · por ${t.por}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
