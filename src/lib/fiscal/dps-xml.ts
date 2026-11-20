import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import type { EntradaCancelamentoNfse, EntradaEmissaoNfse } from "./tipos";

/*
 * Montagem e leitura de XMLs no padrão da NFS-e Nacional (SEFIN Nacional / ADN):
 * - DPS (Declaração de Prestação de Serviços): v1.00 e v1.01 (com grupo IBS/CBS da Reforma Tributária)
 * - Pedido de Registro de Evento (pedRegEvento): Cancelamento e101101
 * - Compactação GZip + Base64 para os campos dpsXmlGZipB64 / pedidoRegistroEventoXmlGZipB64
 */

export const NS_NFSE = "http://www.sped.fazenda.gov.br/nfse";
const VER_APLIC = "OficinaPro_1.0";

const soNum = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const pad = (v: string | number, tam: number) => String(v).replace(/[^0-9A-Za-z]/g, "").padStart(tam, "0").slice(-tam);
const dec = (n: number) => n.toFixed(2);

/** Escape rigoroso para texto XML UTF-8 */
export function escXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(nome: string, valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  return `<${nome}>${escXml(String(valor))}</${nome}>`;
}

function grupo(nome: string, conteudo: string): string {
  return conteudo ? `<${nome}>${conteudo}</${nome}>` : "";
}

/**
 * Monta o Id oficial da <infDPS> (45 caracteres):
 * "DPS" (3) + cLocEmi (7) + tpInsc (1: 2=CNPJ, 1=CPF) + inscFed (14) + serie (5) + nDPS (15)
 */
export function montarIdDps(p: {
  codigoMunicipioEmissor: string;
  documentoEmitente: string;
  serieDps: string;
  numeroDps: number;
}): string {
  const doc = p.documentoEmitente.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const tpInsc = doc.length <= 11 ? "1" : "2";
  return `DPS${pad(soNum(p.codigoMunicipioEmissor), 7)}${tpInsc}${pad(doc, 14)}${pad(soNum(p.serieDps), 5)}${pad(p.numeroDps, 15)}`;
}

/**
 * Monta o XML da DPS sem assinatura (pronto para passar por assinarXmlNfse).
 * Respeita rigorosamente a ordem dos elementos do XSD da NFS-e Nacional.
 */
export function montarXmlDps(entrada: EntradaEmissaoNfse): { idDps: string; xml: string } {
  const cnpjPrest = entrada.prestador.cnpj.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const cLocEmi = pad(soNum(entrada.codigoMunicipioEmissor), 7);
  const serie = pad(soNum(entrada.serieDps), 5);
  const idDps = montarIdDps({
    codigoMunicipioEmissor: cLocEmi,
    documentoEmitente: cnpjPrest,
    serieDps: serie,
    numeroDps: entrada.numeroDps,
  });

  const temIbsCbs = !!(entrada.ibsCbs && (entrada.ibsCbs.finNFSe || entrada.ibsCbs.cst || entrada.ibsCbs.cClassTrib));
  const versao = temIbsCbs ? "1.01" : "1.00";
  const tpAmb = entrada.ambiente === "producao" ? "1" : "2";

  // Substituição (opcional — se esta DPS substitui uma NFS-e anterior)
  const substXml = entrada.substituicao
    ? grupo(
        "subst",
        tag("chSubstda", soNum(entrada.substituicao.chaveSubstituida)) +
          tag("cMotivo", entrada.substituicao.codigoMotivo) +
          tag("xMotivo", entrada.substituicao.motivo.trim().slice(0, 255)),
      )
    : "";

  // Endereço do prestador (opcional na DPS quando tpEmit=1, incluído se completo)
  const endPrest = entrada.prestador.endereco;
  const endPrestXml =
    endPrest?.logradouro && endPrest?.bairro && endPrest?.cep
      ? grupo(
          "end",
          grupo("endNac", tag("cMun", pad(soNum(endPrest.codigoIbge || cLocEmi), 7)) + tag("CEP", pad(soNum(endPrest.cep), 8))) +
            tag("xLgr", endPrest.logradouro.trim().slice(0, 255)) +
            tag("nro", (endPrest.numero || "S/N").trim().slice(0, 60)) +
            tag("xCpl", endPrest.complemento?.trim().slice(0, 156)) +
            tag("xBairro", endPrest.bairro.trim().slice(0, 60)),
        )
      : "";

  // Regime tributário do prestador
  const regTribXml = grupo(
    "regTrib",
    tag("opSimpNac", entrada.prestador.optanteSimplesNacional) +
      (entrada.prestador.optanteSimplesNacional === "3" ? tag("regApTribSN", entrada.prestador.regimeApuracaoSn) : "") +
      tag("regEspTrib", entrada.prestador.regimeEspecialTrib || "0"),
  );

  // Prestador
  const fonePrest = soNum(entrada.prestador.telefone);
  const prestXml = grupo(
    "prest",
    tag("CNPJ", cnpjPrest) +
      tag("IM", entrada.prestador.inscricaoMunicipal?.trim().slice(0, 15)) +
      tag("xNome", entrada.prestador.razaoSocial.trim().slice(0, 300)) +
      endPrestXml +
      (fonePrest.length >= 6 ? tag("fone", fonePrest.slice(0, 20)) : "") +
      tag("email", entrada.prestador.email?.trim().slice(0, 80)) +
      regTribXml,
  );

  // Tomador (obrigatório quando há documento ou nome)
  const docToma = (entrada.tomador.documento ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const endToma = entrada.tomador.endereco;
  const endTomaXml =
    endToma?.logradouro && endToma?.bairro && endToma?.cep && endToma?.codigoIbge
      ? grupo(
          "end",
          grupo("endNac", tag("cMun", pad(soNum(endToma.codigoIbge), 7)) + tag("CEP", pad(soNum(endToma.cep), 8))) +
            tag("xLgr", endToma.logradouro.trim().slice(0, 255)) +
            tag("nro", (endToma.numero || "S/N").trim().slice(0, 60)) +
            tag("xCpl", endToma.complemento?.trim().slice(0, 156)) +
            tag("xBairro", endToma.bairro.trim().slice(0, 60)),
        )
      : "";
  const foneToma = soNum(entrada.tomador.telefone);
  const tomaXml =
    docToma || entrada.tomador.nome
      ? grupo(
          "toma",
          (docToma.length === 14 ? tag("CNPJ", docToma) : docToma.length === 11 ? tag("CPF", docToma) : "") +
            tag("xNome", entrada.tomador.nome.trim().slice(0, 300)) +
            endTomaXml +
            (foneToma.length >= 6 ? tag("fone", foneToma.slice(0, 20)) : "") +
            tag("email", entrada.tomador.email?.trim().slice(0, 80)),
        )
      : "";

  // Serviço
  const cLocPrest = pad(soNum(entrada.servico.codigoMunicipioPrestacao || cLocEmi), 7);
  const cTribNac = pad(soNum(entrada.servico.codigoTribNacional), 6);
  const servXml = grupo(
    "serv",
    grupo("locPrest", tag("cLocPrestacao", cLocPrest)) +
      grupo(
        "cServ",
        tag("cTribNac", cTribNac) +
          tag("cTribMun", entrada.servico.codigoTribMunicipal?.trim().slice(0, 20)) +
          tag("xDescServ", entrada.servico.discriminacao.trim().slice(0, 2000)),
      ),
  );

  // Valores e tributação
  const vServ = Math.max(0, entrada.valores.valorServicos);
  const vDesc = Math.max(0, Math.min(vServ, entrada.valores.valorDesconto));
  const vDescXml = vDesc > 0 ? grupo("vDescCondIncond", tag("vDescIncond", dec(vDesc))) : "";

  // Tributação municipal (ISSQN): 1 = Operação tributável; tpRetISSQN: 1 = Não retido, 2 = Retido pelo tomador
  const tpRetISSQN = entrada.valores.issRetido ? "2" : "1";
  const pAliqXml =
    entrada.valores.aliquotaIss != null && entrada.valores.aliquotaIss > 0
      ? tag("pAliq", dec(entrada.valores.aliquotaIss))
      : "";
  const tribMunXml = grupo("tribMun", tag("tribISSQN", "1") + tag("tpRetISSQN", tpRetISSQN) + pAliqXml);

  // Retenções federais (opcional)
  const ret = entrada.valores.retencoes;
  const piscofinsXml =
    ret && ((ret.pis ?? 0) > 0 || (ret.cofins ?? 0) > 0)
      ? grupo(
          "piscofins",
          tag("CST", "01") +
            ((ret.pis ?? 0) > 0 ? tag("vPis", dec(ret.pis!)) : "") +
            ((ret.cofins ?? 0) > 0 ? tag("vCofins", dec(ret.cofins!)) : "") +
            tag("tpRetPisCofins", "1"),
        )
      : "";
  const tribFedXml = ret
    ? grupo(
        "tribFed",
        piscofinsXml +
          ((ret.inss ?? 0) > 0 ? tag("vRetCP", dec(ret.inss!)) : "") +
          ((ret.irrf ?? 0) > 0 ? tag("vRetIRRF", dec(ret.irrf!)) : "") +
          ((ret.csll ?? 0) > 0 ? tag("vRetCSLL", dec(ret.csll!)) : ""),
      )
    : "";

  // Total aproximado de tributos (indTotTrib=0 quando não informado ou pTotTribSN para Simples)
  const totTribXml =
    entrada.prestador.optanteSimplesNacional === "2"
      ? grupo("totTrib", tag("indTotTrib", "0"))
      : entrada.prestador.optanteSimplesNacional === "3" && entrada.valores.aliquotaIss
        ? grupo("totTrib", tag("pTotTribSN", dec(entrada.valores.aliquotaIss)))
        : grupo("totTrib", tag("indTotTrib", "0"));

  const valoresXml = grupo(
    "valores",
    grupo("vServPrest", tag("vServ", dec(vServ))) + vDescXml + grupo("trib", tribMunXml + tribFedXml + totTribXml),
  );

  // Reforma Tributária (3.5 — IBS / CBS — LC 214/2025 / NT 009)
  const ibs = entrada.ibsCbs;
  const ibsCbsXml = temIbsCbs && ibs
    ? grupo(
        "IBSCBS",
        tag("finNFSe", ibs.finNFSe || "0") +
          tag("indFinal", ibs.indFinal || "1") +
          tag("cIndOp", ibs.cIndOp?.trim()) +
          grupo(
            "valores",
            grupo(
              "trib",
              grupo("gIBSCBS", tag("CST", ibs.cst || "000") + tag("cClassTrib", ibs.cClassTrib || "000001")),
            ),
          ),
      )
    : "";

  const infDPS =
    `<infDPS Id="${idDps}">` +
    tag("tpAmb", tpAmb) +
    tag("dhEmi", entrada.emitidaEmIso) +
    tag("verAplic", VER_APLIC) +
    tag("serie", serie) +
    tag("nDPS", entrada.numeroDps) +
    tag("dCompet", entrada.competencia) +
    tag("tpEmit", "1") +
    tag("cLocEmi", cLocEmi) +
    substXml +
    prestXml +
    tomaXml +
    servXml +
    valoresXml +
    ibsCbsXml +
    `</infDPS>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NS_NFSE}" versao="${versao}">${infDPS}</DPS>`;
  return { idDps, xml };
}

/**
 * Monta o XML de Pedido de Registro de Evento de Cancelamento (e101101) sem assinatura.
 * Id oficial: "PRE" + chNFSe (50) + "101101" (6) + nPedRegEvento (3) = 62 caracteres.
 */
export function montarXmlCancelamentoNfse(entrada: EntradaCancelamentoNfse): { idEvento: string; xml: string } {
  const chNFSe = pad(soNum(entrada.chaveAcesso), 50);
  const seq = entrada.sequencia ?? 1;
  const idEvento = `PRE${chNFSe}101101${pad(seq, 3)}`;
  const tpAmb = entrada.ambiente === "producao" ? "1" : "2";
  const cnpj = entrada.cnpjAutor.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

  const infPedReg =
    `<infPedReg Id="${idEvento}">` +
    tag("tpAmb", tpAmb) +
    tag("verAplic", VER_APLIC) +
    tag("dhEvento", entrada.dhEventoIso) +
    tag("CNPJAutor", cnpj) +
    tag("chNFSe", chNFSe) +
    tag("nPedRegEvento", seq) +
    grupo(
      "e101101",
      tag("xDesc", "Cancelamento de NFS-e") +
        tag("cMotivo", entrada.codigoMotivo) +
        tag("xMotivo", entrada.motivo.trim().slice(0, 255)),
    ) +
    `</infPedReg>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="${NS_NFSE}" versao="1.00">${infPedReg}</pedRegEvento>`;
  return { idEvento, xml };
}

/** Compacta XML UTF-8 com GZip e codifica em Base64 (dpsXmlGZipB64 / pedidoRegistroEventoXmlGZipB64) */
export function xmlParaGzipBase64(xml: string): string {
  return gzipSync(Buffer.from(xml, "utf8")).toString("base64");
}

/** Descompacta campo GZip+Base64 retornado pela SEFIN Nacional (nfseXmlGZipB64 / eventoXmlGZipB64) */
export function gzipBase64ParaXml(b64: string): string {
  return gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
}

/** Extrai chave de acesso, número da nota e código de verificação do XML autorizado da NFS-e */
export function lerDadosXmlNfse(xmlNfse: string): {
  chaveAcesso: string | null;
  numeroNota: string | null;
  codigoVerificacao: string | null;
  dataProcessamento: string | null;
} {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });
    const parsed = parser.parse(xmlNfse) as Record<string, unknown>;
    const nfse = (parsed.NFSe ?? parsed.nfse ?? parsed) as Record<string, unknown>;
    const inf = (nfse.infNFSe ?? nfse.infNfse) as Record<string, unknown> | undefined;
    const rawId = typeof inf?.["@_Id"] === "string" ? inf["@_Id"] : null;
    const chave = rawId ? rawId.replace(/^NFS/i, "") : null;
    const numeroNota = inf?.nNFSe != null ? String(inf.nNFSe) : null;
    const codigoVerificacao = inf?.nDFSe != null ? String(inf.nDFSe) : null;
    const dataProcessamento = typeof inf?.dhProc === "string" ? inf.dhProc : null;
    return { chaveAcesso: chave, numeroNota, codigoVerificacao, dataProcessamento };
  } catch {
    return { chaveAcesso: null, numeroNota: null, codigoVerificacao: null, dataProcessamento: null };
  }
}
