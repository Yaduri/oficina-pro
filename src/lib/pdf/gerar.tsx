import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { ItemOrcamento } from "@/db/schema";
import { schema } from "@/db";
import { identificacao } from "@/lib/identificacao";
import { calcularTotais, totalSelecionado } from "@/lib/os-total";
import { STATUS } from "@/lib/os";
import { STATUS_ORCAMENTO, orcamentoDesatualizado } from "@/lib/orcamento";
import { ESTADOS, agrupar } from "@/lib/checklist";
import { ROTULO_POSICAO, rotuloCombustivel, type Posicao } from "@/lib/checkin";
import { nomeCombustivel } from "@/lib/veiculo";
import { TERMO_PADRAO } from "@/lib/textos";
import { formatData, formatDocumento, formatEndereco, formatTelefone } from "@/lib/utils";
import { COR, type Identificacao, type ItemPdf } from "./base";
import { OSPdf, OrcamentoPdf, TermoPdf } from "./documentos";
import { imagemPdf } from "./imagens";

type Oficina = typeof schema.oficinas.$inferSelect;
type OS = typeof schema.ordensServico.$inferSelect;
type Veiculo = typeof schema.veiculos.$inferSelect;
type Cliente = typeof schema.clientes.$inferSelect;
type Orcamento = typeof schema.orcamentos.$inferSelect;
type ItemOS = { id: string; tipo: "peca" | "servico"; descricao: string; quantidade: number; valorUnitario: number; recusado: boolean };

const TZ = "America/Sao_Paulo";
const dataHora = (d: Date) =>
  `${formatData(d)} às ${d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}`;
const km = (n: number | null | undefined) => (n != null ? `${n.toLocaleString("pt-BR")} km` : null);

/** Responde o PDF para abrir no navegador (ou baixar com ?baixar=1) */
export async function respostaPdf(doc: ReactElement, nomeArquivo: string, baixar = false) {
  // O tipo do @react-pdf espera exatamente <Document>; os componentes daqui devolvem um
  const buffer = await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
  const nome = nomeArquivo.replace(/[^\w.-]+/g, "-");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${baixar ? "attachment" : "inline"}; filename="${nome}"`,
      "cache-control": "private, no-store",
    },
  });
}

function ident(oficina: Oficina): Identificacao {
  const i = identificacao(oficina);
  return { titulo: i.titulo, razaoSocial: i.razaoSocial, cnpj: i.cnpj, endereco: i.endereco, telefone: i.telefone, email: i.email };
}

const logoDa = (oficina: Oficina) => imagemPdf(oficina.logoKey, { largura: 240, png: true });

function pessoa(c: Cliente | null) {
  if (!c) return null;
  return {
    nome: c.nome,
    documento: c.documento ? formatDocumento(c.documento) : null,
    telefone: c.telefone ? formatTelefone(c.telefone) : null,
    endereco: formatEndereco(c),
  };
}

function veiculoPdf(v: Veiculo, kmTexto?: string | null) {
  return {
    placa: v.placa,
    descricao: [v.marca, v.modelo].filter(Boolean).join(" "),
    ano: v.ano,
    cor: v.cor,
    km: kmTexto !== undefined ? kmTexto : km(v.km),
    chassi: v.chassi,
    combustivel: nomeCombustivel(v.combustivel),
  };
}

/* ---------- Orçamento ---------- */

type DadosOrcamento = {
  oficina: Oficina;
  os: OS;
  veiculo: Veiculo;
  cliente: Cliente | null;
  /** Último orçamento enviado (nulo = ainda não enviado) */
  orcamento: Orcamento | null;
  /** Itens atuais da OS — usados quando não há envio ou ele está desatualizado */
  itensAtuais?: ItemOS[];
  link?: string | null;
};

export async function documentoOrcamento(d: DadosOrcamento) {
  const { oficina, os, orcamento } = d;
  const descontoOS = { percentual: os.descontoPercentual != null ? Number(os.descontoPercentual) : null, valor: Number(os.descontoValor) };
  const atuais = (d.itensAtuais ?? []).map((i) => ({ ...i, recusado: false }));

  // Usa o que foi enviado ao cliente, a não ser que a OS tenha mudado depois
  const usarEnvio =
    !!orcamento &&
    orcamento.status !== "substituido" &&
    (!d.itensAtuais ||
      (!orcamentoDesatualizado(orcamento.itens, atuais) &&
        Math.abs(calcularTotais(atuais, descontoOS).desconto - Number(orcamento.desconto)) <= 0.009));

  let itens: ItemPdf[];
  let base: ItemOrcamento[];
  let desconto: number;
  let emitido: Date;
  let validoAte: Date;
  let situacao: string | null = null;
  let resposta: string | null = null;

  if (usarEnvio && orcamento) {
    base = orcamento.itens;
    desconto = Number(orcamento.desconto);
    emitido = orcamento.criadoEm;
    validoAte = orcamento.validoAte;
    const respondido = ["aprovado", "parcial", "recusado"].includes(orcamento.status);
    const aprovados = new Set(orcamento.itensAprovados ?? []);
    situacao = STATUS_ORCAMENTO[orcamento.status].label;
    itens = base.map((i) => ({
      ...i,
      marca: respondido ? (aprovados.has(i.id) ? { texto: "Aprovado", cor: COR.ok } : { texto: "Recusado", cor: COR.perigo }) : null,
      riscado: respondido && !aprovados.has(i.id),
    }));
    if (respondido && orcamento.respondidoEm) {
      const sel = totalSelecionado(base, aprovados, desconto);
      const quem = orcamento.respostaNome ? ` por ${orcamento.respostaNome}` : "";
      resposta =
        orcamento.status === "recusado"
          ? `Recusado em ${dataHora(orcamento.respondidoEm)}${quem}.`
          : `${orcamento.status === "aprovado" ? "Aprovado" : "Aprovado em parte"} em ${dataHora(orcamento.respondidoEm)}${quem}. Total aprovado: ${sel.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`;
      if (orcamento.respostaComentario) resposta += ` Comentário: “${orcamento.respostaComentario}”`;
    }
  } else {
    base = atuais.map(({ id, tipo, descricao, quantidade, valorUnitario }) => ({ id, tipo, descricao, quantidade, valorUnitario }));
    desconto = calcularTotais(atuais, descontoOS).desconto;
    emitido = new Date();
    validoAte = new Date(emitido.getTime() + oficina.validadeOrcamentoDias * 86_400_000);
    itens = base.map((i) => ({ ...i }));
  }

  const bruto = base.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const pecas = base.filter((i) => i.tipo === "peca").reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const totais = { pecas, servicos: bruto - pecas, desconto, total: Math.max(bruto - desconto, 0) };

  return (
    <OrcamentoPdf
      id={ident(oficina)}
      logo={await logoDa(oficina)}
      numeroOS={os.numero}
      emitidoEm={formatData(emitido)}
      validoAte={formatData(validoAte)}
      situacao={situacao}
      cliente={pessoa(d.cliente)}
      veiculo={veiculoPdf(d.veiculo, km(os.kmEntrada) ?? km(d.veiculo.km))}
      relato={os.descricao}
      itens={itens}
      totais={totais}
      observacao={usarEnvio ? (orcamento?.observacao ?? null) : (oficina.obsOrcamento ?? null)}
      textoGarantia={oficina.textoGarantia}
      link={usarEnvio && orcamento?.status === "pendente" ? (d.link ?? null) : null}
      resposta={resposta}
    />
  );
}

/* ---------- Ordem de serviço ---------- */

type DadosOS = {
  oficina: Oficina;
  os: OS;
  veiculo: Veiculo;
  cliente: Cliente | null;
  responsavel: string | null;
  itens: ItemOS[];
  via: "cliente" | "oficina";
  valores: boolean;
  checklist: { descricao: string; estado: string | null; obs: string | null }[] | null;
  /** Nome de quem registrou a entrega */
  entreguePor: string | null;
};

export async function documentoOS(d: DadosOS) {
  const { os, oficina } = d;
  const desconto = { percentual: os.descontoPercentual != null ? Number(os.descontoPercentual) : null, valor: Number(os.descontoValor) };
  const t = calcularTotais(d.itens, desconto);
  const validos = d.itens.filter((i) => !i.recusado);
  const [logo, assinatura] = await Promise.all([logoDa(oficina), imagemPdf(os.entregaAssinaturaKey, { largura: 600, png: true })]);
  const problemas = (d.checklist ?? [])
    .filter((i) => i.estado === "problema" || i.estado === "nao_tem")
    .map((i) => `${i.descricao}: ${i.estado === "problema" ? "com problema" : "não tem"}${i.obs ? ` (${i.obs})` : ""}`);

  return (
    <OSPdf
      id={ident(oficina)}
      logo={logo}
      via={d.via}
      numero={os.numero}
      status={STATUS[os.status].label}
      entrada={dataHora(os.entradaEm)}
      previsao={os.previsaoEntregaEm ? formatData(os.previsaoEntregaEm) : null}
      entregue={os.entregueEm ? dataHora(os.entregueEm) : null}
      cliente={pessoa(d.cliente)}
      veiculo={veiculoPdf(d.veiculo, null)}
      relato={os.descricao}
      responsavel={d.responsavel}
      valores={d.valores}
      itens={validos.map((i) => ({ ...i }))}
      totais={{ pecas: t.pecas, servicos: t.servicos, desconto: t.desconto, total: t.total }}
      recusados={d.itens.length - validos.length}
      kmEntrada={km(os.kmEntrada)}
      kmSaida={km(os.kmSaida)}
      garantiaAte={os.garantiaAte ? formatData(os.garantiaAte) : null}
      textoGarantia={oficina.textoGarantia}
      entregaObs={os.entregaObs}
      entreguePor={d.entreguePor}
      assinaturaRetirada={assinatura}
      checklistProblemas={problemas}
    />
  );
}

/* ---------- Termo de entrada ---------- */

type DadosTermo = {
  oficina: Oficina;
  checkin: typeof schema.checkins.$inferSelect;
  veiculo: Veiculo;
  cliente: Cliente | null;
  fotos: { key: string; posicao: string }[];
  ordens: number[];
};

export async function documentoTermo(d: DadosTermo) {
  const { oficina, checkin } = d;
  const id = ident(oficina);
  const [logo, assinatura, fotos] = await Promise.all([
    logoDa(oficina),
    imagemPdf(checkin.assinaturaKey, { largura: 600, png: true }),
    Promise.all(d.fotos.map(async (f) => ({ imagem: await imagemPdf(f.key, { largura: 700 }), rotulo: ROTULO_POSICAO[f.posicao as Posicao] ?? f.posicao }))),
  ]);

  return (
    <TermoPdf
      id={id}
      logo={logo}
      data={dataHora(checkin.criadoEm)}
      ordens={d.ordens.length ? `OS nº ${d.ordens.join(", ")}` : null}
      cliente={pessoa(d.cliente)}
      veiculo={veiculoPdf(d.veiculo, km(checkin.km))}
      relato={checkin.relato}
      combustivel={rotuloCombustivel(checkin.combustivel)}
      avarias={checkin.avarias}
      objetos={checkin.objetos}
      checklist={agrupar(checkin.checklist ?? []).map((g) => ({
        grupo: g.grupo,
        itens: g.itens.map((i) => ({
          descricao: i.descricao,
          estado: i.estado ? ESTADOS[i.estado].curto : "Não verificado",
          obs: i.obs,
          problema: i.estado === "problema",
        })),
      }))}
      fotos={fotos.filter((f): f is { imagem: NonNullable<typeof f.imagem>; rotulo: string } => !!f.imagem)}
      termo={checkin.termo ?? oficina.textoTermoCheckin ?? TERMO_PADRAO}
      assinatura={assinatura}
    />
  );
}
