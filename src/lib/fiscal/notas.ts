import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { getDb, getDbSistema, schema, type DB } from "@/db";
import { cifrar, decifrar, iguais, tokenAleatorio } from "@/lib/cripto";
import { gerarCsv, type Celula } from "@/lib/csv";
import { diaSP } from "@/lib/agenda-datas";
import { calcularTotais } from "@/lib/os-total";
import { obterOS } from "@/lib/queries";
import { lerArquivo, salvarArquivo } from "@/lib/storage";
import { ident, logoDa } from "@/lib/pdf/gerar";
import { formatDocumento } from "@/lib/utils";
import { avaliarValidadeCertificado, lerCertificadoA1 } from "./certificado";
import { renderizarDanfseBuffer, type DanfseProps } from "./danfse-pdf";
import { montarIdDps } from "./dps-xml";
import { obterProvedorFiscal } from "./provedor-focus";
import type { CertificadoDescriptografado, EntradaEmissaoNfse } from "./tipos";
import { criarZip, type EntradaZip } from "./zip";
import type {
  AmbienteFiscal,
  DadosIbsCbs,
  ProvedorFiscalTipo,
  RetencoesFiscais,
  StatusNotaFiscal,
} from "@/db/schema";

/*
 * Camada de negócio do módulo Fiscal (Fase 3).
 * - Configuração fiscal + certificado A1 (cifrado com CHAVE_CRIPTOGRAFIA)
 * - Preparação de NFS-e a partir da OS entregue (serviços + desconto proporcional)
 * - Emissão direta na NFS-e Nacional, fila de tentativas (backoff exponencial) e webhook
 * - Guarda obrigatória de XMLs e DANFSe PDF no R2 (mínimo 5 anos)
 * - Cancelamento (e101101), substituição e exportação mensal em ZIP para o contador
 */

const { configuracoesFiscais: cfgs, notasFiscais: notas, ordensServico: osTable, veiculos, oficinas, osEventos } = schema;

export type ConfigFiscal = typeof cfgs.$inferSelect;
export type NotaFiscal = typeof notas.$inferSelect;

const MAX_TENTATIVAS = 5;
const BACKOFF_MINUTOS = [1, 5, 15, 60, 240];

/** ISO com offset de Brasília (-03:00), no formato exigido pela SEFIN Nacional */
export function agoraIsoBrasilia(d = new Date()): string {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}-03:00`;
}

const arred = (n: number) => Math.round(n * 100) / 100;
const decStr = (n: number) => arred(n).toFixed(2);

/** Chave no R2 organizada por ano/mês para guarda legal de 5 anos */
function chaveR2Fiscal(oficinaId: string, competencia: string, notaId: string, sufixo: string) {
  const [ano, mes] = competencia.split("-");
  return `${oficinaId}/fiscal/${ano || "2026"}/${mes || "01"}/${notaId}-${sufixo}`;
}

async function lerArquivoBuffer(key: string): Promise<Buffer | null> {
  const arq = await lerArquivo(key);
  if (!arq) return null;
  if (Buffer.isBuffer(arq.body)) return arq.body;
  const reader = arq.body.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/* ---------- Configuração fiscal e certificado A1 ---------- */

export async function obterConfigFiscal(oficinaId: string, conexao?: DB): Promise<ConfigFiscal | null> {
  const db = conexao ?? (await getDb());
  const [c] = await db.select().from(cfgs).where(eq(cfgs.oficinaId, oficinaId));
  return c ?? null;
}

/** Resumo seguro da configuração fiscal para exibir na UI (sem nenhum dado cifrado) */
export async function resumoConfigFiscal(oficinaId: string) {
  const c = await obterConfigFiscal(oficinaId);
  const validade = avaliarValidadeCertificado(c?.certValidoAte);
  return {
    existe: !!c,
    provedor: c?.provedor ?? ("nfse_nacional" as ProvedorFiscalTipo),
    ambiente: c?.ambiente ?? ("homologacao" as AmbienteFiscal),
    certificado: c?.certPemCifrado
      ? {
          titular: c.certTitular ?? "Certificado A1",
          cnpj: c.certCnpj,
          serial: c.certSerial,
          validoDe: c.certValidoDe,
          validoAte: c.certValidoAte,
          situacao: validade.situacao,
          diasRestantes: validade.diasRestantes,
        }
      : null,
    codigoMunicipioIbge: c?.codigoMunicipioIbge ?? "",
    serieDps: c?.serieDps ?? "00001",
    proximoNumeroDps: c?.proximoNumeroDps ?? 1,
    codigoTribNacionalPadrao: c?.codigoTribNacionalPadrao ?? "140101",
    codigoTribMunicipalPadrao: c?.codigoTribMunicipalPadrao ?? "",
    aliquotaIss: c?.aliquotaIss != null ? Number(c.aliquotaIss) : null,
    issRetidoPadrao: c?.issRetidoPadrao ?? false,
    optanteSimplesNacional: (c?.optanteSimplesNacional as "1" | "2" | "3") ?? "3",
    regimeApuracaoSn: (c?.regimeApuracaoSn as "1" | "2" | "3") ?? "1",
    regimeEspecialTrib: c?.regimeEspecialTrib ?? "0",
    incluirIbsCbs: c?.incluirIbsCbs ?? false,
    ibsCbsPadrao: c?.ibsCbsPadrao ?? null,
    provedorTokenFinal: c?.provedorTokenFinal ?? null,
  };
}

export async function salvarParametrosFiscais(
  oficinaId: string,
  dados: {
    provedor: ProvedorFiscalTipo;
    ambiente: AmbienteFiscal;
    codigoMunicipioIbge: string | null;
    serieDps: string;
    proximoNumeroDps: number;
    codigoTribNacionalPadrao: string;
    codigoTribMunicipalPadrao: string | null;
    aliquotaIss: number | null;
    issRetidoPadrao: boolean;
    optanteSimplesNacional: "1" | "2" | "3";
    regimeApuracaoSn: "1" | "2" | "3";
    regimeEspecialTrib: string;
    incluirIbsCbs: boolean;
    ibsCbsPadrao: DadosIbsCbs | null;
  },
) {
  const db = await getDb();
  const atual = await obterConfigFiscal(oficinaId, db);
  const valores = {
    provedor: dados.provedor,
    ambiente: dados.ambiente,
    codigoMunicipioIbge: dados.codigoMunicipioIbge,
    serieDps: dados.serieDps.padStart(5, "0").slice(-5),
    proximoNumeroDps: Math.max(1, dados.proximoNumeroDps),
    codigoTribNacionalPadrao: dados.codigoTribNacionalPadrao.replace(/\D/g, "").padStart(6, "0").slice(0, 6),
    codigoTribMunicipalPadrao: dados.codigoTribMunicipalPadrao,
    aliquotaIss: dados.aliquotaIss != null ? decStr(dados.aliquotaIss) : null,
    issRetidoPadrao: dados.issRetidoPadrao,
    optanteSimplesNacional: dados.optanteSimplesNacional,
    regimeApuracaoSn: dados.regimeApuracaoSn,
    regimeEspecialTrib: dados.regimeEspecialTrib,
    incluirIbsCbs: dados.incluirIbsCbs,
    ibsCbsPadrao: dados.ibsCbsPadrao,
    atualizadoEm: new Date(),
  };

  if (atual) {
    await db.update(cfgs).set(valores).where(eq(cfgs.id, atual.id));
  } else {
    await db.insert(cfgs).values({ oficinaId, webhookToken: tokenAleatorio(), ...valores });
  }
}

export async function salvarCertificadoA1(oficinaId: string, pfxBytes: Uint8Array, senha: string) {
  const info = lerCertificadoA1(pfxBytes, senha);
  const db = await getDb();
  const atual = await obterConfigFiscal(oficinaId, db);

  const valores = {
    certPfxCifrado: cifrar(Buffer.from(pfxBytes).toString("base64")),
    certSenhaCifrada: cifrar(senha),
    certPemCifrado: cifrar(info.certPem),
    certChaveCifrada: cifrar(info.keyPem),
    certTitular: info.titular,
    certCnpj: info.cnpj,
    certSerial: info.serial,
    certValidoDe: info.validoDe,
    certValidoAte: info.validoAte,
    atualizadoEm: new Date(),
  };

  if (atual) {
    await db.update(cfgs).set(valores).where(eq(cfgs.id, atual.id));
  } else {
    await db.insert(cfgs).values({ oficinaId, webhookToken: tokenAleatorio(), ...valores });
  }
  return info;
}

export async function removerCertificadoA1(oficinaId: string) {
  const db = await getDb();
  await db
    .update(cfgs)
    .set({
      certPfxCifrado: null,
      certSenhaCifrada: null,
      certPemCifrado: null,
      certChaveCifrada: null,
      certTitular: null,
      certCnpj: null,
      certSerial: null,
      certValidoDe: null,
      certValidoAte: null,
      atualizadoEm: new Date(),
    })
    .where(eq(cfgs.oficinaId, oficinaId));
}

function decifrarCertificado(cfg: ConfigFiscal | null): CertificadoDescriptografado | null {
  if (!cfg?.certPemCifrado || !cfg.certChaveCifrada) return null;
  return {
    certPem: decifrar(cfg.certPemCifrado),
    keyPem: decifrar(cfg.certChaveCifrada),
    pfxBase64: cfg.certPfxCifrado ? decifrar(cfg.certPfxCifrado) : undefined,
    senha: cfg.certSenhaCifrada ? decifrar(cfg.certSenhaCifrada) : undefined,
  };
}

/** Alerta para o sino de notificações (vence em <= 30 dias ou vencido) */
export async function alertaCertificado(oficinaId: string) {
  const cfg = await obterConfigFiscal(oficinaId);
  if (!cfg?.certValidoAte) return null;
  const av = avaliarValidadeCertificado(cfg.certValidoAte);
  if (av.situacao !== "vencendo" && av.situacao !== "vencido") return null;
  return {
    situacao: av.situacao,
    diasRestantes: av.diasRestantes!,
    validoAte: cfg.certValidoAte,
    titular: cfg.certTitular ?? "Certificado A1",
  };
}

/* ---------- Preparação de NFS-e a partir da OS ---------- */

export async function prepararNfseDaOS(oficinaId: string, osId: string) {
  const [dados, cfg] = await Promise.all([obterOS(oficinaId, osId), obterConfigFiscal(oficinaId)]);
  if (!dados) return null;

  const { os, itens, cliente, veiculo } = dados;
  const desconto = {
    percentual: os.descontoPercentual != null ? Number(os.descontoPercentual) : null,
    valor: Number(os.descontoValor),
  };
  const totais = calcularTotais(itens, desconto);
  const servicosAtivos = itens.filter((i) => i.tipo === "servico" && !i.recusado);

  // Desconto proporcional sobre serviços (mesma regra do orçamento parcial)
  const descontoServicos = totais.bruto > 0 ? arred((totais.desconto * totais.servicos) / totais.bruto) : 0;

  // Código de serviço: se algum serviço do catálogo tiver código municipal/nacional, aproveita o primeiro
  let codigoTrib = cfg?.codigoTribNacionalPadrao ?? "140101";
  const catalogoIds = servicosAtivos.map((i) => i.catalogoItemId).filter((x): x is string => !!x);
  if (catalogoIds.length > 0) {
    const db = await getDb();
    const cats = await db
      .select({ cod: schema.catalogoItens.codigoServicoMunicipal })
      .from(schema.catalogoItens)
      .where(and(eq(schema.catalogoItens.oficinaId, oficinaId), inArray(schema.catalogoItens.id, catalogoIds)));
    const achado = cats.find((c) => c.cod?.trim())?.cod?.replace(/\D/g, "");
    if (achado && achado.length === 4) codigoTrib = `${achado}01`;
    else if (achado && achado.length === 6) codigoTrib = achado;
  }

  // Discriminação legível listando todos os serviços executados + identificação do veículo/OS
  const linhasServicos = servicosAtivos.map((s) => {
    const sub = s.quantidade * s.valorUnitario;
    const qtd = s.quantidade !== 1 ? `${s.quantidade}x ` : "";
    return `- ${qtd}${s.descricao}: R$ ${sub.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  });
  const veicDesc = [veiculo.marca, veiculo.modelo].filter(Boolean).join(" ");
  const cabecalho = `Serviços prestados na OS #${os.numero} — Veículo ${veicDesc} (Placa ${veiculo.placa}).`;
  const discriminacao = linhasServicos.length > 0 ? `${cabecalho}\n${linhasServicos.join("\n")}` : `${cabecalho}\n${os.descricao}`;

  return {
    osId: os.id,
    osNumero: os.numero,
    osStatus: os.status,
    valorServicos: totais.servicos,
    valorDesconto: descontoServicos,
    competencia: os.entregueEm ? diaSP(os.entregueEm) : diaSP(new Date()),
    codigoTribNacional: codigoTrib,
    codigoTribMunicipal: cfg?.codigoTribMunicipalPadrao ?? "",
    aliquotaIss: cfg?.aliquotaIss != null ? Number(cfg.aliquotaIss) : null,
    issRetido: cfg?.issRetidoPadrao ?? false,
    discriminacao,
    tomador: {
      clienteId: cliente?.id ?? null,
      nome: cliente?.nome ?? "",
      documento: cliente?.documento ?? "",
      email: cliente?.email ?? "",
      telefone: cliente?.telefone ?? "",
      cep: cliente?.cep ?? "",
      logradouro: cliente?.logradouro ?? "",
      numero: cliente?.numero ?? "",
      complemento: cliente?.complemento ?? "",
      bairro: cliente?.bairro ?? "",
      cidade: cliente?.cidade ?? "",
      uf: cliente?.uf ?? "",
    },
    temCertificado: !!cfg?.certPemCifrado,
    certificadoVencido: cfg?.certValidoAte ? cfg.certValidoAte < new Date() : false,
    codigoMunicipioIbge: cfg?.codigoMunicipioIbge ?? "",
    ambiente: cfg?.ambiente ?? ("homologacao" as AmbienteFiscal),
  };
}

/* ---------- Geração de DANFSe PDF e guarda no R2 ---------- */

async function montarPropsDanfse(
  db: DB,
  oficina: typeof oficinas.$inferSelect,
  nota: NotaFiscal,
): Promise<DanfseProps> {
  let numeroOS: number | null = null;
  if (nota.osId) {
    const [o] = await db.select({ numero: osTable.numero }).from(osTable).where(eq(osTable.id, nota.osId));
    numeroOS = o?.numero ?? null;
  }
  const endToma = nota.tomadorEndereco;
  const endTexto = endToma
    ? [
        [endToma.logradouro, endToma.numero].filter(Boolean).join(", "),
        endToma.complemento,
        endToma.bairro,
        [endToma.cidade, endToma.uf].filter(Boolean).join("/"),
      ]
        .filter(Boolean)
        .join(" · ") || null
    : null;

  return {
    id: ident(oficina),
    logo: await logoDa(oficina),
    inscricaoMunicipal: oficina.inscricaoMunicipal,
    ambiente: nota.ambiente,
    status: nota.status,
    numeroNota: nota.numeroNota,
    serieDps: nota.serieDps,
    numeroDps: nota.numeroDps,
    chaveAcesso: nota.chaveAcesso,
    codigoVerificacao: nota.codigoVerificacao,
    competencia: nota.competencia,
    emitidaEm: nota.emitidaEm ?? nota.criadoEm,
    numeroOS,
    tomador: {
      nome: nota.tomadorNome,
      documento: nota.tomadorDocumento,
      email: nota.tomadorEmail,
      telefone: nota.tomadorTelefone,
      endereco: endTexto,
    },
    codigoTribNacional: nota.codigoTribNacional,
    codigoTribMunicipal: nota.codigoTribMunicipal,
    discriminacao: nota.discriminacao,
    valorServicos: Number(nota.valorServicos),
    valorDesconto: Number(nota.valorDesconto),
    baseCalculo: Number(nota.baseCalculo),
    aliquotaIss: nota.aliquotaIss != null ? Number(nota.aliquotaIss) : null,
    valorIss: Number(nota.valorIss),
    issRetido: nota.issRetido,
    valorRetencoes: Number(nota.valorRetencoes),
    valorLiquido: Number(nota.valorLiquido),
    retencoes: nota.retencoes,
    ibsCbs: nota.ibsCbs,
    motivoCancelamento: nota.motivoCancelamento,
    canceladaEm: nota.canceladaEm,
  };
}

export async function obterOuGerarDanfsePdf(oficinaId: string, notaId: string, conexao?: DB): Promise<{ buffer: Buffer; nome: string } | null> {
  const db = conexao ?? (await getDb());
  const [nota] = await db.select().from(notas).where(and(eq(notas.id, notaId), eq(notas.oficinaId, oficinaId)));
  if (!nota) return null;
  const nome = `DANFSe-${nota.numeroNota ?? `DPS-${nota.numeroDps}`}.pdf`;
  if (nota.pdfKey) {
    const salvo = await lerArquivoBuffer(nota.pdfKey);
    if (salvo) return { buffer: salvo, nome };
  }
  const [oficina] = await db.select().from(oficinas).where(eq(oficinas.id, oficinaId));
  if (!oficina) return null;
  const props = await montarPropsDanfse(db, oficina, nota);
  const buffer = await renderizarDanfseBuffer(props);
  return { buffer, nome };
}

/* ---------- Emissão, Fila e Reenvio ---------- */

export type InputNovaNfse = {
  oficinaId: string;
  osId?: string | null;
  clienteId?: string | null;
  competencia: string;
  valorServicos: number;
  valorDesconto?: number;
  aliquotaIss?: number | null;
  issRetido?: boolean;
  retencoes?: RetencoesFiscais | null;
  codigoTribNacional: string;
  codigoTribMunicipal?: string | null;
  discriminacao: string;
  tomador: {
    nome: string;
    documento?: string | null;
    email?: string | null;
    telefone?: string | null;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    codigoIbge?: string | null;
  };
  substituicao?: {
    notaAnteriorId: string;
    chaveSubstituida: string;
    codigoMotivo: "01" | "02" | "03" | "04" | "05" | "99";
    motivo: string;
  } | null;
  criadoPor: string | null;
  usuarioNome?: string | null;
};

/** Resolve o código IBGE (7 dígitos) a partir do CEP usando ViaCEP quando não informado */
async function resolverIbgePorCep(cep: string | null | undefined): Promise<string | null> {
  const limpo = (cep ?? "").replace(/\D/g, "");
  if (limpo.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { ibge?: string; erro?: boolean };
    return !j.erro && j.ibge && /^\d{7}$/.test(j.ibge) ? j.ibge : null;
  } catch {
    return null;
  }
}

export async function criarEEmitirNfse(input: InputNovaNfse): Promise<{ ok: true; notaId: string; status: StatusNotaFiscal; mensagem?: string } | { ok: false; erro: string }> {
  const db = await getDb();
  const [oficina] = await db.select().from(oficinas).where(eq(oficinas.id, input.oficinaId));
  if (!oficina) return { ok: false, erro: "Oficina não encontrada." };
  if (!oficina.cnpj) return { ok: false, erro: "Cadastre o CNPJ da oficina em Configurações → Oficina antes de emitir notas." };

  const cfg = await obterConfigFiscal(input.oficinaId, db);
  if (!cfg) {
    return { ok: false, erro: "Configure o módulo fiscal em Configurações → Fiscal antes de emitir notas." };
  }
  const cLocEmi = cfg.codigoMunicipioIbge || (await resolverIbgePorCep(oficina.cep));
  if (!cLocEmi) {
    return { ok: false, erro: "Informe o código IBGE do município emissor em Configurações → Fiscal." };
  }
  if (!cfg.codigoMunicipioIbge) {
    await db.update(cfgs).set({ codigoMunicipioIbge: cLocEmi }).where(eq(cfgs.id, cfg.id));
  }

  const valorServicos = arred(input.valorServicos);
  if (valorServicos <= 0) return { ok: false, erro: "O valor dos serviços deve ser maior que zero." };
  const valorDesconto = arred(Math.min(valorServicos, Math.max(0, input.valorDesconto ?? 0)));
  const baseCalculo = arred(valorServicos - valorDesconto);
  const aliquotaIss = input.aliquotaIss != null && input.aliquotaIss >= 0 ? arred(input.aliquotaIss) : null;
  const valorIss = aliquotaIss != null ? arred((baseCalculo * aliquotaIss) / 100) : 0;
  const ret = input.retencoes ?? null;
  const totalRetFed = ret
    ? arred((ret.pis ?? 0) + (ret.cofins ?? 0) + (ret.csll ?? 0) + (ret.irrf ?? 0) + (ret.inss ?? 0))
    : 0;
  const valorRetencoes = arred(totalRetFed + (input.issRetido ? valorIss : 0));
  const valorLiquido = arred(Math.max(0, baseCalculo - valorRetencoes));

  const tomadorIbge = input.tomador.codigoIbge || (await resolverIbgePorCep(input.tomador.cep));
  const ibsCbs: DadosIbsCbs | null = cfg.incluirIbsCbs ? (cfg.ibsCbsPadrao ?? { finNFSe: "0", indFinal: "1", cst: "000", cClassTrib: "000001" }) : null;

  // Reserva número da DPS atomicamente com lock FOR UPDATE
  const criada = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(cfgs).where(eq(cfgs.id, cfg.id)).for("update");
    const numeroDps = locked.proximoNumeroDps;
    const serieDps = locked.serieDps;
    const idDps = montarIdDps({
      codigoMunicipioEmissor: cLocEmi,
      documentoEmitente: oficina.cnpj!,
      serieDps,
      numeroDps,
    });

    await tx
      .update(cfgs)
      .set({ proximoNumeroDps: numeroDps + 1, atualizadoEm: new Date() })
      .where(eq(cfgs.id, locked.id));

    const [nova] = await tx
      .insert(notas)
      .values({
        oficinaId: input.oficinaId,
        osId: input.osId ?? null,
        clienteId: input.clienteId ?? null,
        tipo: "nfse",
        provedor: locked.provedor,
        ambiente: locked.ambiente,
        status: "fila",
        serieDps,
        numeroDps,
        idDps,
        competencia: input.competencia,
        valorServicos: decStr(valorServicos),
        valorDesconto: decStr(valorDesconto),
        baseCalculo: decStr(baseCalculo),
        aliquotaIss: aliquotaIss != null ? decStr(aliquotaIss) : null,
        valorIss: decStr(valorIss),
        issRetido: !!input.issRetido,
        valorRetencoes: decStr(valorRetencoes),
        valorLiquido: decStr(valorLiquido),
        codigoTribNacional: input.codigoTribNacional.replace(/\D/g, "").padStart(6, "0").slice(0, 6),
        codigoTribMunicipal: input.codigoTribMunicipal?.trim() || null,
        discriminacao: input.discriminacao.trim(),
        tomadorNome: input.tomador.nome.trim(),
        tomadorDocumento: input.tomador.documento?.replace(/[^0-9A-Za-z]/g, "").toUpperCase() || null,
        tomadorEmail: input.tomador.email?.trim() || null,
        tomadorTelefone: input.tomador.telefone?.replace(/\D/g, "") || null,
        tomadorEndereco: {
          cep: input.tomador.cep?.replace(/\D/g, "") || null,
          logradouro: input.tomador.logradouro?.trim() || null,
          numero: input.tomador.numero?.trim() || null,
          complemento: input.tomador.complemento?.trim() || null,
          bairro: input.tomador.bairro?.trim() || null,
          cidade: input.tomador.cidade?.trim() || null,
          uf: input.tomador.uf?.trim().toUpperCase() || null,
          codigoIbge: tomadorIbge,
        },
        retencoes: ret,
        ibsCbs,
        substituiNotaId: input.substituicao?.notaAnteriorId ?? null,
        criadoPor: input.criadoPor,
      })
      .returning();

    return nova;
  });

  // Dispara transmissão imediata (se houver falha transitória, permanece na fila com backoff)
  const resultado = await transmitirNota(input.oficinaId, criada.id, {
    substituicao: input.substituicao ?? null,
    usuarioNome: input.usuarioNome,
    usuarioId: input.criadoPor,
  });

  return { ok: true, notaId: criada.id, status: resultado.status, mensagem: resultado.mensagem };
}

export async function transmitirNota(
  oficinaId: string,
  notaId: string,
  opts?: {
    substituicao?: { notaAnteriorId: string; chaveSubstituida: string; codigoMotivo: "01" | "02" | "03" | "04" | "05" | "99"; motivo: string } | null;
    usuarioId?: string | null;
    usuarioNome?: string | null;
    conexao?: DB;
  },
): Promise<{ status: StatusNotaFiscal; mensagem?: string }> {
  const db = opts?.conexao ?? (await getDb());
  const [[nota], [oficina], cfg] = await Promise.all([
    db.select().from(notas).where(and(eq(notas.id, notaId), eq(notas.oficinaId, oficinaId))),
    db.select().from(oficinas).where(eq(oficinas.id, oficinaId)),
    obterConfigFiscal(oficinaId, db),
  ]);
  if (!nota || !oficina || !cfg) return { status: "rejeitada", mensagem: "Nota ou configuração não encontrada." };
  if (nota.status === "autorizada" || nota.status === "cancelada") {
    return { status: nota.status };
  }

  await db.update(notas).set({ status: "processando", atualizadoEm: new Date() }).where(eq(notas.id, nota.id));

  const cLocEmi = cfg.codigoMunicipioIbge || "3550308";
  const entrada: EntradaEmissaoNfse = {
    notaId: nota.id,
    ambiente: nota.ambiente,
    serieDps: nota.serieDps,
    numeroDps: nota.numeroDps,
    competencia: nota.competencia,
    emitidaEmIso: agoraIsoBrasilia(),
    codigoMunicipioEmissor: cLocEmi,
    prestador: {
      cnpj: oficina.cnpj ?? "",
      inscricaoMunicipal: oficina.inscricaoMunicipal,
      razaoSocial: oficina.razaoSocial || oficina.nome,
      endereco: {
        cep: oficina.cep,
        logradouro: oficina.logradouro,
        numero: oficina.numero,
        complemento: oficina.complemento,
        bairro: oficina.bairro,
        cidade: oficina.cidade,
        uf: oficina.uf,
        codigoIbge: cLocEmi,
      },
      telefone: oficina.telefone,
      email: oficina.email,
      optanteSimplesNacional: (cfg.optanteSimplesNacional as "1" | "2" | "3") || "3",
      regimeApuracaoSn: (cfg.regimeApuracaoSn as "1" | "2" | "3") || "1",
      regimeEspecialTrib: cfg.regimeEspecialTrib || "0",
    },
    tomador: {
      nome: nota.tomadorNome,
      documento: nota.tomadorDocumento,
      email: nota.tomadorEmail,
      telefone: nota.tomadorTelefone,
      endereco: nota.tomadorEndereco ?? undefined,
    },
    servico: {
      codigoMunicipioPrestacao: cLocEmi,
      codigoTribNacional: nota.codigoTribNacional,
      codigoTribMunicipal: nota.codigoTribMunicipal,
      discriminacao: nota.discriminacao,
    },
    valores: {
      valorServicos: Number(nota.valorServicos),
      valorDesconto: Number(nota.valorDesconto),
      aliquotaIss: nota.aliquotaIss != null ? Number(nota.aliquotaIss) : null,
      issRetido: nota.issRetido,
      retencoes: nota.retencoes,
    },
    ibsCbs: nota.ibsCbs,
    substituicao: opts?.substituicao
      ? {
          chaveSubstituida: opts.substituicao.chaveSubstituida,
          codigoMotivo: opts.substituicao.codigoMotivo,
          motivo: opts.substituicao.motivo,
        }
      : null,
  };

  const provedor = obterProvedorFiscal(nota.provedor);
  const cert = decifrarCertificado(cfg);
  const ctxProvedor = {
    oficinaId,
    ambiente: nota.ambiente,
    certificado: cert,
    tokenProvedor: cfg.provedorTokenCifrado ? decifrar(cfg.provedorTokenCifrado) : null,
  };

  const res = await provedor.emitirNfse(entrada, ctxProvedor);

  // Salva XML da DPS (mesmo em rejeição ou fila, para auditoria e diagnóstico)
  let xmlDpsKey = nota.xmlDpsKey;
  if (res.xmlDpsAssinado) {
    xmlDpsKey = chaveR2Fiscal(oficinaId, nota.competencia, nota.id, "dps.xml");
    await salvarArquivo(xmlDpsKey, Buffer.from(res.xmlDpsAssinado, "utf8").buffer, "application/xml; charset=utf-8").catch(() => undefined);
  }

  const tentativas = nota.tentativas + 1;
  const agora = new Date();

  if (res.situacao === "autorizada") {
    const xmlNotaKey = chaveR2Fiscal(oficinaId, nota.competencia, nota.id, "nfse.xml");
    await salvarArquivo(xmlNotaKey, Buffer.from(res.xmlNfse, "utf8").buffer, "application/xml; charset=utf-8");

    const notaAtualizada: NotaFiscal = {
      ...nota,
      status: "autorizada",
      chaveAcesso: res.chaveAcesso,
      numeroNota: res.numeroNota,
      codigoVerificacao: res.codigoVerificacao,
      protocolo: res.protocolo,
      apiRef: res.apiRef ?? null,
      emitidaEm: agora,
      xmlDpsKey,
      xmlNotaKey,
      tentativas,
      proximaTentativaEm: null,
      ultimaMensagem: null,
      erros: null,
      atualizadoEm: agora,
    };

    // Baixa DANFSe oficial da ADN ou gera DANFSe próprio em PDF e guarda no R2 (5 anos)
    const pdfOficial = provedor.baixarDanfse && res.chaveAcesso ? await provedor.baixarDanfse(res.chaveAcesso, ctxProvedor) : null;
    const pdfBuffer = pdfOficial ?? (await renderizarDanfseBuffer(await montarPropsDanfse(db, oficina, notaAtualizada)));
    const pdfKey = chaveR2Fiscal(oficinaId, nota.competencia, nota.id, "danfse.pdf");
    await salvarArquivo(
      pdfKey,
      pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength) as ArrayBuffer,
      "application/pdf",
    );

    await db
      .update(notas)
      .set({
        status: "autorizada",
        chaveAcesso: res.chaveAcesso,
        numeroNota: res.numeroNota,
        codigoVerificacao: res.codigoVerificacao,
        protocolo: res.protocolo,
        apiRef: res.apiRef ?? null,
        emitidaEm: agora,
        xmlDpsKey,
        xmlNotaKey,
        pdfKey,
        tentativas,
        proximaTentativaEm: null,
        ultimaMensagem: null,
        erros: null,
        atualizadoEm: agora,
      })
      .where(eq(notas.id, nota.id));

    // Se foi substituição, marca a nota anterior como substituída e regenera o PDF dela
    if (nota.substituiNotaId) {
      await db
        .update(notas)
        .set({ status: "substituida", substituidaPorId: nota.id, atualizadoEm: agora })
        .where(and(eq(notas.id, nota.substituiNotaId), eq(notas.oficinaId, oficinaId)));
      const [ant] = await db.select().from(notas).where(eq(notas.id, nota.substituiNotaId));
      if (ant) {
        const pdfAnt = await renderizarDanfseBuffer(await montarPropsDanfse(db, oficina, ant));
        const antPdfKey = chaveR2Fiscal(oficinaId, ant.competencia, ant.id, "danfse.pdf");
        await salvarArquivo(
          antPdfKey,
          pdfAnt.buffer.slice(pdfAnt.byteOffset, pdfAnt.byteOffset + pdfAnt.byteLength) as ArrayBuffer,
          "application/pdf",
        ).catch(() => undefined);
      }
    }

    // Registra no histórico da OS
    if (nota.osId) {
      await db.insert(osEventos).values({
        oficinaId,
        osId: nota.osId,
        descricao: `NFS-e${res.numeroNota ? ` nº ${res.numeroNota}` : ""} emitida (${nota.ambiente === "homologacao" ? "homologação" : "produção"})`,
        usuarioId: opts?.usuarioId ?? null,
        usuarioNome: opts?.usuarioNome ?? "Sistema",
      });
    }

    return { status: "autorizada" };
  }

  if (res.situacao === "transitorio") {
    const minutos = BACKOFF_MINUTOS[Math.min(tentativas - 1, BACKOFF_MINUTOS.length - 1)];
    const proxima = tentativas < MAX_TENTATIVAS ? new Date(agora.getTime() + minutos * 60_000) : null;
    await db
      .update(notas)
      .set({
        status: "fila",
        xmlDpsKey,
        tentativas,
        proximaTentativaEm: proxima,
        ultimaMensagem: res.mensagem,
        erros: res.erros ?? [{ mensagem: res.mensagem }],
        atualizadoEm: agora,
      })
      .where(eq(notas.id, nota.id));
    return { status: "fila", mensagem: res.mensagem };
  }

  // Rejeitada pelo fisco
  await db
    .update(notas)
    .set({
      status: "rejeitada",
      xmlDpsKey,
      tentativas,
      proximaTentativaEm: null,
      ultimaMensagem: res.mensagem,
      erros: res.erros,
      atualizadoEm: agora,
    })
    .where(eq(notas.id, nota.id));
  return { status: "rejeitada", mensagem: res.mensagem };
}

/** Processa a fila de notas com falha transitória (chamável pela UI ou via cron /api/fiscal/fila) */
export async function processarFilaFiscal(oficinaId?: string) {
  const db = oficinaId ? await getDb() : await getDbSistema();
  const agora = new Date();
  const condicoes = [
    eq(notas.status, "fila"),
    or(lte(notas.proximaTentativaEm, agora), sql`${notas.proximaTentativaEm} IS NULL`),
  ];
  if (oficinaId) condicoes.push(eq(notas.oficinaId, oficinaId));

  const pendentes = await db
    .select({ id: notas.id, oficinaId: notas.oficinaId })
    .from(notas)
    .where(and(...condicoes))
    .limit(20);

  let autorizadas = 0;
  let falhas = 0;
  for (const p of pendentes) {
    const r = await transmitirNota(p.oficinaId, p.id, { conexao: db });
    if (r.status === "autorizada") autorizadas++;
    else falhas++;
  }
  return { processadas: pendentes.length, autorizadas, falhas };
}

/* ---------- Consulta e Cancelamento ---------- */

export async function consultarNotaNaSefin(oficinaId: string, notaId: string): Promise<{ ok: true; status: StatusNotaFiscal } | { ok: false; erro: string }> {
  const db = await getDb();
  const [[nota], cfg] = await Promise.all([
    db.select().from(notas).where(and(eq(notas.id, notaId), eq(notas.oficinaId, oficinaId))),
    obterConfigFiscal(oficinaId, db),
  ]);
  if (!nota) return { ok: false, erro: "Nota não encontrada." };
  if (!nota.chaveAcesso) return { ok: false, erro: "Esta nota ainda não possui chave de acesso para consulta." };
  if (!cfg) return { ok: false, erro: "Configuração fiscal não encontrada." };

  const provedor = obterProvedorFiscal(nota.provedor);
  const res = await provedor.consultarNfse(nota.chaveAcesso, {
    oficinaId,
    ambiente: nota.ambiente,
    certificado: decifrarCertificado(cfg),
    tokenProvedor: cfg.provedorTokenCifrado ? decifrar(cfg.provedorTokenCifrado) : null,
  });

  if (!res.ok) return { ok: false, erro: res.mensagem };

  let xmlNotaKey = nota.xmlNotaKey;
  if (res.xmlNfse) {
    xmlNotaKey = chaveR2Fiscal(oficinaId, nota.competencia, nota.id, "nfse.xml");
    await salvarArquivo(xmlNotaKey, Buffer.from(res.xmlNfse, "utf8").buffer, "application/xml; charset=utf-8").catch(() => undefined);
  }

  await db
    .update(notas)
    .set({
      status: res.status,
      numeroNota: res.numeroNota ?? nota.numeroNota,
      codigoVerificacao: res.codigoVerificacao ?? nota.codigoVerificacao,
      xmlNotaKey,
      atualizadoEm: new Date(),
    })
    .where(eq(notas.id, nota.id));

  return { ok: true, status: res.status };
}

export async function cancelarNotaFiscal(p: {
  oficinaId: string;
  notaId: string;
  codigoMotivo: "1" | "2" | "9";
  motivo: string;
  usuarioId: string;
  usuarioNome: string | null;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const db = await getDb();
  const [[nota], [oficina], cfg] = await Promise.all([
    db.select().from(notas).where(and(eq(notas.id, p.notaId), eq(notas.oficinaId, p.oficinaId))),
    db.select().from(oficinas).where(eq(oficinas.id, p.oficinaId)),
    obterConfigFiscal(p.oficinaId, db),
  ]);
  if (!nota || !oficina || !cfg) return { ok: false, erro: "Nota ou configuração não encontrada." };
  if (nota.status !== "autorizada") return { ok: false, erro: "Só é possível cancelar uma nota autorizada." };
  if (!nota.chaveAcesso) return { ok: false, erro: "Nota sem chave de acesso registrada." };
  if (!oficina.cnpj) return { ok: false, erro: "CNPJ da oficina não cadastrado." };

  const provedor = obterProvedorFiscal(nota.provedor);
  const res = await provedor.cancelarNfse(
    {
      ambiente: nota.ambiente,
      cnpjAutor: oficina.cnpj,
      chaveAcesso: nota.chaveAcesso,
      codigoMotivo: p.codigoMotivo,
      motivo: p.motivo,
      dhEventoIso: agoraIsoBrasilia(),
    },
    {
      oficinaId: p.oficinaId,
      ambiente: nota.ambiente,
      certificado: decifrarCertificado(cfg),
      tokenProvedor: cfg.provedorTokenCifrado ? decifrar(cfg.provedorTokenCifrado) : null,
    },
  );

  if (!res.ok) return { ok: false, erro: res.mensagem };

  const agora = new Date();
  const xmlCancelamentoKey = chaveR2Fiscal(p.oficinaId, nota.competencia, nota.id, "canc.xml");
  await salvarArquivo(xmlCancelamentoKey, Buffer.from(res.xmlRetorno || res.xmlEventoAssinado, "utf8").buffer, "application/xml; charset=utf-8");

  const notaCancelada: NotaFiscal = {
    ...nota,
    status: "cancelada",
    canceladaEm: agora,
    canceladaPor: p.usuarioId,
    codigoMotivoCancelamento: p.codigoMotivo,
    motivoCancelamento: p.motivo.trim(),
    xmlCancelamentoKey,
    atualizadoEm: agora,
  };

  // Regenera DANFSe com carimbo de CANCELADA
  const pdfBuf = await renderizarDanfseBuffer(await montarPropsDanfse(db, oficina, notaCancelada));
  const pdfKey = chaveR2Fiscal(p.oficinaId, nota.competencia, nota.id, "danfse.pdf");
  await salvarArquivo(
    pdfKey,
    pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength) as ArrayBuffer,
    "application/pdf",
  );

  await db
    .update(notas)
    .set({
      status: "cancelada",
      canceladaEm: agora,
      canceladaPor: p.usuarioId,
      codigoMotivoCancelamento: p.codigoMotivo,
      motivoCancelamento: p.motivo.trim(),
      xmlCancelamentoKey,
      pdfKey,
      atualizadoEm: agora,
    })
    .where(eq(notas.id, nota.id));

  if (nota.osId) {
    await db.insert(osEventos).values({
      oficinaId: p.oficinaId,
      osId: nota.osId,
      descricao: `NFS-e${nota.numeroNota ? ` nº ${nota.numeroNota}` : ""} cancelada: ${p.motivo.trim()}`,
      usuarioId: p.usuarioId,
      usuarioNome: p.usuarioNome ?? "Usuário",
    });
  }

  return { ok: true };
}

/* ---------- Consultas para telas ---------- */

export async function listarNotas(
  oficinaId: string,
  filtros?: { mes?: string; status?: string; busca?: string },
) {
  const db = await getDb();
  const conds = [eq(notas.oficinaId, oficinaId)];
  if (filtros?.mes && /^\d{4}-\d{2}$/.test(filtros.mes)) {
    const [ano, mes] = filtros.mes.split("-").map(Number);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    conds.push(gte(notas.competencia, `${filtros.mes}-01`), lte(notas.competencia, `${filtros.mes}-${String(ultimoDia).padStart(2, "0")}`));
  }
  if (filtros?.status && ["fila", "processando", "autorizada", "rejeitada", "cancelada", "substituida"].includes(filtros.status)) {
    conds.push(eq(notas.status, filtros.status as StatusNotaFiscal));
  }

  const rows = await db
    .select({
      nota: notas,
      osNumero: osTable.numero,
      placa: veiculos.placa,
    })
    .from(notas)
    .leftJoin(osTable, eq(osTable.id, notas.osId))
    .leftJoin(veiculos, eq(veiculos.id, osTable.veiculoId))
    .where(and(...conds))
    .orderBy(desc(notas.criadoEm))
    .limit(300);

  const q = filtros?.busca?.trim().toLowerCase();
  const filtradas = q
    ? rows.filter(
        (r) =>
          r.nota.tomadorNome.toLowerCase().includes(q) ||
          (r.nota.tomadorDocumento ?? "").toLowerCase().includes(q) ||
          (r.nota.numeroNota ?? "").toLowerCase().includes(q) ||
          (r.nota.chaveAcesso ?? "").toLowerCase().includes(q) ||
          (r.placa ?? "").toLowerCase().includes(q) ||
          (r.osNumero != null && String(r.osNumero).includes(q)),
      )
    : rows;

  return filtradas;
}

export async function notasDaOS(oficinaId: string, osId: string) {
  const db = await getDb();
  return db
    .select()
    .from(notas)
    .where(and(eq(notas.oficinaId, oficinaId), eq(notas.osId, osId)))
    .orderBy(desc(notas.criadoEm));
}

export async function obterNotaDetalhe(oficinaId: string, notaId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      nota: notas,
      osNumero: osTable.numero,
      placa: veiculos.placa,
      veiculoMarca: veiculos.marca,
      veiculoModelo: veiculos.modelo,
    })
    .from(notas)
    .leftJoin(osTable, eq(osTable.id, notas.osId))
    .leftJoin(veiculos, eq(veiculos.id, osTable.veiculoId))
    .where(and(eq(notas.id, notaId), eq(notas.oficinaId, oficinaId)));
  return row ?? null;
}

/* ---------- Pacote mensal do contador (3.4 — ZIP) ---------- */

export async function gerarPacoteContadorZip(oficinaId: string, mes: string): Promise<{ buffer: Buffer; nome: string; totalNotas: number }> {
  const db = await getDb();
  const [oficina] = await db.select().from(oficinas).where(eq(oficinas.id, oficinaId));
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const inicio = `${mes}-01`;
  const fim = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

  const lista = await db
    .select({ nota: notas, osNumero: osTable.numero })
    .from(notas)
    .leftJoin(osTable, eq(osTable.id, notas.osId))
    .where(
      and(
        eq(notas.oficinaId, oficinaId),
        gte(notas.competencia, inicio),
        lte(notas.competencia, fim),
        inArray(notas.status, ["autorizada", "cancelada", "substituida"]),
      ),
    )
    .orderBy(notas.competencia, notas.numeroDps);

  const entradas: EntradaZip[] = [];
  const cabecalhoCsv = [
    "Competência",
    "Emissão",
    "Status",
    "Ambiente",
    "Nº NFS-e",
    "Série/DPS",
    "Chave de acesso",
    "OS",
    "Tomador",
    "CPF/CNPJ",
    "Cód. Serviço",
    "Valor Serviços",
    "Desconto",
    "Base ISS",
    "Alíquota ISS (%)",
    "Valor ISS",
    "ISS Retido",
    "Retenções",
    "Valor Líquido",
    "IBS/CBS CST",
    "Motivo Cancelamento",
  ];
  const linhasCsv: Celula[][] = [];

  for (const { nota, osNumero } of lista) {
    const idArq = nota.numeroNota || `DPS-${nota.serieDps}-${nota.numeroDps}`;
    linhasCsv.push([
      nota.competencia,
      nota.emitidaEm ? nota.emitidaEm.toISOString() : "",
      nota.status,
      nota.ambiente,
      nota.numeroNota ?? "",
      `${nota.serieDps}/${nota.numeroDps}`,
      nota.chaveAcesso ?? "",
      osNumero ?? "",
      nota.tomadorNome,
      nota.tomadorDocumento ? formatDocumento(nota.tomadorDocumento) : "",
      nota.codigoTribNacional,
      nota.valorServicos,
      nota.valorDesconto,
      nota.baseCalculo,
      nota.aliquotaIss ?? "",
      nota.valorIss,
      nota.issRetido ? "Sim" : "Não",
      nota.valorRetencoes,
      nota.valorLiquido,
      nota.ibsCbs?.cst ?? "",
      nota.motivoCancelamento ?? "",
    ]);

    if (nota.xmlNotaKey) {
      const xml = await lerArquivoBuffer(nota.xmlNotaKey);
      if (xml) entradas.push({ nome: `xmls/${nota.status}/${idArq}-nfse.xml`, dados: xml });
    } else if (nota.xmlDpsKey) {
      const xml = await lerArquivoBuffer(nota.xmlDpsKey);
      if (xml) entradas.push({ nome: `xmls/${nota.status}/${idArq}-dps.xml`, dados: xml });
    }
    if (nota.xmlCancelamentoKey) {
      const xmlCanc = await lerArquivoBuffer(nota.xmlCancelamentoKey);
      if (xmlCanc) entradas.push({ nome: `xmls/cancelamentos/${idArq}-cancelamento.xml`, dados: xmlCanc });
    }
    if (nota.pdfKey) {
      const pdf = await lerArquivoBuffer(nota.pdfKey);
      if (pdf) entradas.push({ nome: `pdfs/${idArq}-danfse.pdf`, dados: pdf });
    }
  }

  entradas.push({ nome: `relatorio-notas-${mes}.csv`, dados: gerarCsv(cabecalhoCsv, linhasCsv) });
  entradas.push({
    nome: "LEIA-ME.txt",
    dados: [
      `Pacote fiscal mensal — ${oficina?.razaoSocial || oficina?.nome || "Oficina"}`,
      oficina?.cnpj ? `CNPJ: ${formatDocumento(oficina.cnpj)}` : null,
      `Competência: ${mes}`,
      `Total de documentos incluídos: ${lista.length}`,
      `Autorizadas: ${lista.filter((x) => x.nota.status === "autorizada").length}`,
      `Canceladas: ${lista.filter((x) => x.nota.status === "cancelada").length}`,
      `Substituídas: ${lista.filter((x) => x.nota.status === "substituida").length}`,
      `Gerado em: ${agoraIsoBrasilia()}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const cnpjArq = (oficina?.cnpj ?? "oficina").replace(/[^0-9A-Za-z]/g, "");
  return {
    buffer: criarZip(entradas),
    nome: `fiscal-${cnpjArq}-${mes}.zip`,
    totalNotas: lista.length,
  };
}

/* ---------- Webhook de provedor externo (3.1 / 3.3 futuro) ---------- */

export async function webhookFiscalAutorizado(oficinaId: string, token: string | null) {
  const cfg = await obterConfigFiscal(oficinaId, await getDbSistema());
  return !!(cfg?.webhookToken && token && iguais(token, cfg.webhookToken));
}

export async function processarWebhookFiscal(
  oficinaId: string,
  payload: { ref?: string; status?: string; numero?: string; chave?: string; mensagem?: string },
) {
  if (!payload.ref) return;
  const db = await getDbSistema();
  const [nota] = await db
    .select()
    .from(notas)
    .where(and(eq(notas.oficinaId, oficinaId), eq(notas.apiRef, payload.ref)));
  if (!nota) return;

  const mapa: Record<string, StatusNotaFiscal> = {
    autorizado: "autorizada",
    autorizada: "autorizada",
    cancelado: "cancelada",
    cancelada: "cancelada",
    erro_autorizacao: "rejeitada",
    rejeitada: "rejeitada",
  };
  const novoStatus = payload.status ? mapa[payload.status.toLowerCase()] : undefined;
  if (!novoStatus) return;

  await db
    .update(notas)
    .set({
      status: novoStatus,
      numeroNota: payload.numero ?? nota.numeroNota,
      chaveAcesso: payload.chave ?? nota.chaveAcesso,
      ultimaMensagem: payload.mensagem ?? nota.ultimaMensagem,
      atualizadoEm: new Date(),
    })
    .where(eq(notas.id, nota.id));
}

/** Notas autorizadas de um conjunto de OS (usado no Portal do Cliente) */
export async function notasAutorizadasDasOS(oficinaId: string, osIds: string[], conexao?: DB) {
  if (osIds.length === 0) return [];
  const db = conexao ?? (await getDb());
  return db
    .select({
      id: notas.id,
      osId: notas.osId,
      numeroNota: notas.numeroNota,
      numeroDps: notas.numeroDps,
      ambiente: notas.ambiente,
      valorLiquido: notas.valorLiquido,
      emitidaEm: notas.emitidaEm,
    })
    .from(notas)
    .where(
      and(
        eq(notas.oficinaId, oficinaId),
        inArray(notas.osId, osIds),
        eq(notas.status, "autorizada"),
        isNotNull(notas.osId),
      ),
    )
    .orderBy(desc(notas.emitidaEm));
}
