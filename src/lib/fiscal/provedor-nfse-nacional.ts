import "server-only";
import {
  NS_NFSE,
  gzipBase64ParaXml,
  lerDadosXmlNfse,
  montarXmlCancelamentoNfse,
  montarXmlDps,
  xmlParaGzipBase64,
} from "./dps-xml";
import { requisicaoMtls } from "./mtls";
import type {
  ContextoProvedor,
  EntradaCancelamentoNfse,
  EntradaEmissaoNfse,
  ProvedorFiscal,
  ResultadoCancelamentoNfse,
  ResultadoConsultaNfse,
  ResultadoEmissaoNfse,
} from "./tipos";
import type { AmbienteFiscal, ErroFiscalItem } from "@/db/schema";
import { assinarXmlNfse } from "./xmldsig";

/*
 * Provedor direto da NFS-e Nacional (SEFIN Nacional / ADN — api gov.br, sem provedor pago).
 *
 * Ambientes oficiais:
 * - Produção:            https://sefin.nfse.gov.br/SefinNacional
 * - Produção restrita:   https://sefin.producaorestrita.nfse.gov.br/SefinNacional
 * - ADN DANFSe (prod):   https://adn.nfse.gov.br/danfse/{chaveAcesso}
 * - ADN DANFSe (homol):  https://adn.producaorestrita.nfse.gov.br/danfse/{chaveAcesso}
 */

const URL_SEFIN: Record<AmbienteFiscal, string> = {
  producao: "https://sefin.nfse.gov.br/SefinNacional",
  homologacao: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
};

const URL_ADN: Record<AmbienteFiscal, string> = {
  producao: "https://adn.nfse.gov.br",
  homologacao: "https://adn.producaorestrita.nfse.gov.br",
};

type JsonSefin = {
  chaveAcesso?: string;
  idDps?: string;
  nfseXmlGZipB64?: string;
  eventoXmlGZipB64?: string;
  erros?: Array<{ Codigo?: string; codigo?: string; Descricao?: string; descricao?: string; Complemento?: string; complemento?: string }>;
  erro?: { Codigo?: string; codigo?: string; Descricao?: string; descricao?: string; Complemento?: string; complemento?: string };
  mensagem?: string;
  title?: string;
  detail?: string;
};

function parseJsonSeguro(texto: string): JsonSefin | null {
  try {
    return JSON.parse(texto) as JsonSefin;
  } catch {
    return null;
  }
}

function extrairErros(json: JsonSefin | null, status: number, bodyText: string): { mensagem: string; erros: ErroFiscalItem[] } {
  const lista: ErroFiscalItem[] = [];
  if (json?.erros?.length) {
    for (const e of json.erros) {
      const codigo = e.Codigo ?? e.codigo;
      const desc = e.Descricao ?? e.descricao ?? "Erro retornado pela SEFIN Nacional";
      const comp = e.Complemento ?? e.complemento;
      lista.push({ codigo, mensagem: comp ? `${desc} (${comp})` : desc });
    }
  } else if (json?.erro) {
    const e = json.erro;
    const codigo = e.Codigo ?? e.codigo;
    const desc = e.Descricao ?? e.descricao ?? "Erro retornado pela SEFIN Nacional";
    const comp = e.Complemento ?? e.complemento;
    lista.push({ codigo, mensagem: comp ? `${desc} (${comp})` : desc });
  } else if (json?.mensagem || json?.detail || json?.title) {
    lista.push({ mensagem: json.mensagem ?? json.detail ?? json.title ?? `Erro HTTP ${status}` });
  } else {
    const trecho = bodyText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
    lista.push({ mensagem: trecho || `Erro HTTP ${status} na SEFIN Nacional` });
  }
  const primeira = lista[0];
  const mensagem = primeira.codigo ? `[${primeira.codigo}] ${primeira.mensagem}` : primeira.mensagem;
  return { mensagem, erros: lista };
}

export const provedorNfseNacional: ProvedorFiscal = {
  nome: "nfse_nacional",

  async emitirNfse(entrada: EntradaEmissaoNfse, ctx: ContextoProvedor): Promise<ResultadoEmissaoNfse> {
    if (!ctx.certificado) {
      const { idDps, xml } = montarXmlDps(entrada);
      return {
        situacao: "transitorio",
        idDps,
        xmlDpsAssinado: xml,
        mensagem: "Certificado A1 não cadastrado. Cadastre o certificado em Configurações → Fiscal para transmitir.",
      };
    }

    const { idDps, xml } = montarXmlDps(entrada);
    const xmlDpsAssinado = assinarXmlNfse({
      xmlRaiz: xml,
      tagAlvo: "infDPS",
      idAlvo: idDps,
      defaultNamespace: NS_NFSE,
      certPem: ctx.certificado.certPem,
      keyPem: ctx.certificado.keyPem,
      algoritmo: "sha1",
    });

    const payload = JSON.stringify({ dpsXmlGZipB64: xmlParaGzipBase64(xmlDpsAssinado) });
    const url = `${URL_SEFIN[ctx.ambiente]}/nfse`;

    let res;
    try {
      res = await requisicaoMtls({
        url,
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: payload,
        certificado: ctx.certificado,
      });
    } catch (e) {
      return {
        situacao: "transitorio",
        idDps,
        xmlDpsAssinado,
        mensagem: e instanceof Error ? e.message : "Falha de comunicação com a SEFIN Nacional.",
      };
    }

    const json = parseJsonSeguro(res.bodyText);

    if (res.status >= 200 && res.status < 300 && json?.nfseXmlGZipB64) {
      const xmlNfse = gzipBase64ParaXml(json.nfseXmlGZipB64);
      const dados = lerDadosXmlNfse(xmlNfse);
      return {
        situacao: "autorizada",
        idDps,
        xmlDpsAssinado,
        chaveAcesso: json.chaveAcesso ?? dados.chaveAcesso ?? "",
        numeroNota: dados.numeroNota,
        codigoVerificacao: dados.codigoVerificacao,
        protocolo: dados.dataProcessamento,
        xmlNfse,
        apiRef: json.chaveAcesso ?? dados.chaveAcesso ?? idDps,
      };
    }

    const { mensagem, erros } = extrairErros(json, res.status, res.bodyText);

    // 429 / 5xx = erro transitório (mantém na fila para reenvio automático)
    if (res.status === 0 || res.status === 429 || res.status >= 500) {
      return { situacao: "transitorio", idDps, xmlDpsAssinado, mensagem, erros };
    }

    // 400 / 401 / 403 / 422 = rejeição fiscal ou erro de credencial/schema
    return { situacao: "rejeitada", idDps, xmlDpsAssinado, mensagem, erros };
  },

  async consultarNfse(chaveAcesso: string, ctx: ContextoProvedor): Promise<ResultadoConsultaNfse> {
    if (!ctx.certificado) {
      return { ok: false, transitorio: true, mensagem: "Certificado A1 não cadastrado." };
    }

    const url = `${URL_SEFIN[ctx.ambiente]}/nfse/${encodeURIComponent(chaveAcesso)}`;
    let res;
    try {
      res = await requisicaoMtls({
        url,
        method: "GET",
        headers: { accept: "application/json" },
        certificado: ctx.certificado,
      });
    } catch (e) {
      return {
        ok: false,
        transitorio: true,
        mensagem: e instanceof Error ? e.message : "Falha ao consultar a SEFIN Nacional.",
      };
    }

    const json = parseJsonSeguro(res.bodyText);
    if (res.status >= 200 && res.status < 300 && json?.nfseXmlGZipB64) {
      const xmlNfse = gzipBase64ParaXml(json.nfseXmlGZipB64);
      const dados = lerDadosXmlNfse(xmlNfse);
      const cancelada = /<cStat>101<\/cStat>|e101101|cancelad/i.test(xmlNfse);
      return {
        ok: true,
        status: cancelada ? "cancelada" : "autorizada",
        chaveAcesso: json.chaveAcesso ?? dados.chaveAcesso ?? chaveAcesso,
        numeroNota: dados.numeroNota,
        codigoVerificacao: dados.codigoVerificacao,
        xmlNfse,
      };
    }

    const { mensagem, erros } = extrairErros(json, res.status, res.bodyText);
    return { ok: false, transitorio: res.status === 429 || res.status >= 500, mensagem, erros };
  },

  async cancelarNfse(entrada: EntradaCancelamentoNfse, ctx: ContextoProvedor): Promise<ResultadoCancelamentoNfse> {
    if (!ctx.certificado) {
      return { ok: false, transitorio: true, mensagem: "Certificado A1 não cadastrado." };
    }

    const { idEvento, xml } = montarXmlCancelamentoNfse(entrada);
    const xmlEventoAssinado = assinarXmlNfse({
      xmlRaiz: xml,
      tagAlvo: "infPedReg",
      idAlvo: idEvento,
      defaultNamespace: NS_NFSE,
      certPem: ctx.certificado.certPem,
      keyPem: ctx.certificado.keyPem,
      algoritmo: "sha1",
    });

    const url = `${URL_SEFIN[ctx.ambiente]}/nfse/${encodeURIComponent(entrada.chaveAcesso)}/eventos`;
    const payload = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: xmlParaGzipBase64(xmlEventoAssinado) });

    let res;
    try {
      res = await requisicaoMtls({
        url,
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: payload,
        certificado: ctx.certificado,
      });
    } catch (e) {
      return {
        ok: false,
        transitorio: true,
        xmlEventoAssinado,
        mensagem: e instanceof Error ? e.message : "Falha de comunicação ao registrar cancelamento.",
      };
    }

    const json = parseJsonSeguro(res.bodyText);
    if (res.status >= 200 && res.status < 300) {
      const xmlRetorno = json?.eventoXmlGZipB64 ? gzipBase64ParaXml(json.eventoXmlGZipB64) : res.bodyText;
      return { ok: true, xmlEventoAssinado, xmlRetorno, protocolo: idEvento };
    }

    const { mensagem, erros } = extrairErros(json, res.status, res.bodyText);
    return {
      ok: false,
      transitorio: res.status === 429 || res.status >= 500,
      xmlEventoAssinado,
      mensagem,
      erros,
    };
  },

  async baixarDanfse(chaveAcesso: string, ctx: ContextoProvedor): Promise<Buffer | null> {
    if (!ctx.certificado) return null;
    try {
      const res = await requisicaoMtls({
        url: `${URL_ADN[ctx.ambiente]}/danfse/${encodeURIComponent(chaveAcesso)}`,
        method: "GET",
        headers: { accept: "application/pdf" },
        certificado: ctx.certificado,
        timeoutMs: 12_000,
      });
      if (res.status === 200 && res.contentType.includes("pdf") && res.bodyBuffer.byteLength > 500) {
        return res.bodyBuffer;
      }
      return null;
    } catch {
      return null;
    }
  },
};
