import "server-only";
import { createHash, createSign, createVerify } from "node:crypto";
import { certPemParaBase64Limpo } from "./certificado";

/*
 * Assinatura XMLDSig (Enveloped + C14N) para a NFS-e Nacional (DPS e pedRegEvento).
 * Implementada sobre node:crypto (nativo em Node.js e Cloudflare Workers), sem dependências
 * DOM/C++ externas. Como os XMLs de DPS e pedRegEvento são gerados por nós em forma já
 * canônica (UTF-8, sem espaços extras, tags fechadas explicitamente, sem comentários), o
 * algoritmo C14N propaga exatamente o namespace padrão do elemento raiz na tag assinada.
 */

export type AlgoritmoAssinatura = "sha1" | "sha256";

const URIS = {
  c14n: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  enveloped: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
  xmldsig: "http://www.w3.org/2000/09/xmldsig#",
  sha1: {
    digest: "http://www.w3.org/2000/09/xmldsig#sha1",
    signature: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    nodeHash: "sha1",
    nodeSign: "RSA-SHA1",
  },
  sha256: {
    digest: "http://www.w3.org/2001/04/xmlenc#sha256",
    signature: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    nodeHash: "sha256",
    nodeSign: "RSA-SHA256",
  },
} as const;

/**
 * Propaga o namespace padrão `xmlns="..."` do elemento raiz para o elemento alvo da referência,
 * respeitando a ordenação canônica de atributos do C14N (namespace declarations vêm antes de atributos normais).
 */
function canonicalizarElementoAlvo(elementoXml: string, defaultNamespace: string): string {
  // Em C14N, atributos de namespace vêm primeiro (xmlns="..."), seguidos dos demais em ordem lexicográfica
  return elementoXml.replace(/^<([A-Za-z_][\w:.-]*)(\s[^>]*)?>/, (_m, tag: string, attrs?: string) => {
    if (attrs && /\bxmlns=/.test(attrs)) return `<${tag}${attrs}>`;
    return `<${tag} xmlns="${defaultNamespace}"${attrs ?? ""}>`;
  });
}

/**
 * Assina um documento XML da NFS-e Nacional (<DPS> ou <pedRegEvento>) usando XMLDSig Enveloped.
 *
 * @param xmlRaiz XML canônico completo contendo `<tagAlvo Id="...">...</tagAlvo>` dentro da raiz
 * @param tagAlvo Nome da tag interna assinada ("infDPS" ou "infPedReg")
 * @param idAlvo Valor exato do atributo `Id` da tag alvo (sem `#`)
 * @param defaultNamespace Namespace padrão do documento raiz ("http://www.sped.fazenda.gov.br/nfse")
 * @param certPem Certificado X.509 em PEM
 * @param keyPem Chave privada RSA em PEM
 * @param algoritmo Padrão "sha1" (amplamente aceito pela SEFIN Nacional; suporta "sha256")
 */
export function assinarXmlNfse(p: {
  xmlRaiz: string;
  tagAlvo: "infDPS" | "infPedReg";
  idAlvo: string;
  defaultNamespace: string;
  certPem: string;
  keyPem: string;
  algoritmo?: AlgoritmoAssinatura;
}): string {
  const alg = URIS[p.algoritmo ?? "sha1"];
  const reAlvo = new RegExp(`<${p.tagAlvo}\\b[^>]*\\bId="${p.idAlvo}"[^>]*>[\\s\\S]*?<\\/${p.tagAlvo}>`);
  const match = p.xmlRaiz.match(reAlvo);
  if (!match) {
    throw new Error(`Elemento <${p.tagAlvo} Id="${p.idAlvo}"> não encontrado no XML para assinatura.`);
  }

  // 1. Canonicaliza o elemento alvo e calcula o DigestValue
  const alvoCanonico = canonicalizarElementoAlvo(match[0], p.defaultNamespace);
  const digestValue = createHash(alg.nodeHash).update(alvoCanonico, "utf8").digest("base64");

  // 2. Monta o <SignedInfo> em forma canônica (sem quebras nem indentação)
  // Nota: para a assinatura de <SignedInfo>, C14N exige o namespace herdado `xmlns="http://www.w3.org/2000/09/xmldsig#"`
  const signedInfoConteudo =
    `<CanonicalizationMethod Algorithm="${URIS.c14n}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${alg.signature}"></SignatureMethod>` +
    `<Reference URI="#${p.idAlvo}">` +
    `<Transforms>` +
    `<Transform Algorithm="${URIS.enveloped}"></Transform>` +
    `<Transform Algorithm="${URIS.c14n}"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="${alg.digest}"></DigestMethod>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>`;

  const signedInfoCanonico = `<SignedInfo xmlns="${URIS.xmldsig}">${signedInfoConteudo}</SignedInfo>`;

  // 3. Assina o <SignedInfo> canonicalizado com a chave privada RSA
  const signer = createSign(alg.nodeSign);
  signer.update(signedInfoCanonico, "utf8");
  signer.end();
  const signatureValue = signer.sign(p.keyPem, "base64");

  // 4. Monta o bloco <Signature> limpo (somente X509Certificate em KeyInfo, como exige a SEFIN Nacional)
  const x509 = certPemParaBase64Limpo(p.certPem);
  const blocoAssinatura =
    `<Signature xmlns="${URIS.xmldsig}">` +
    `<SignedInfo>${signedInfoConteudo}</SignedInfo>` +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${x509}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  // 5. Insere <Signature> imediatamente após </tagAlvo> (irmã de infDPS/infPedReg dentro da tag raiz)
  const fechamento = `</${p.tagAlvo}>`;
  const idx = p.xmlRaiz.lastIndexOf(fechamento);
  if (idx === -1) throw new Error(`Fechamento ${fechamento} não encontrado no XML.`);
  const pos = idx + fechamento.length;
  return p.xmlRaiz.slice(0, pos) + blocoAssinatura + p.xmlRaiz.slice(pos);
}

/** Verifica localmente a integridade da assinatura XMLDSig gerada (usado em testes/diagnóstico) */
export function verificarAssinaturaXml(xmlAssinado: string, tagAlvo: "infDPS" | "infPedReg", defaultNamespace: string): boolean {
  const idMatch = xmlAssinado.match(new RegExp(`<${tagAlvo}\\b[^>]*\\bId="([^"]+)"`));
  const digestMatch = xmlAssinado.match(/<DigestValue>([^<]+)<\/DigestValue>/);
  const sigMatch = xmlAssinado.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
  const certMatch = xmlAssinado.match(/<X509Certificate>([^<]+)<\/X509Certificate>/);
  const signedInfoMatch = xmlAssinado.match(/<SignedInfo>([\s\S]*?)<\/SignedInfo>/);
  const isSha256 = /rsa-sha256/.test(xmlAssinado);
  if (!idMatch || !digestMatch || !sigMatch || !certMatch || !signedInfoMatch) return false;

  const alg = URIS[isSha256 ? "sha256" : "sha1"];
  const alvoMatch = xmlAssinado.match(new RegExp(`<${tagAlvo}\\b[^>]*\\bId="${idMatch[1]}"[^>]*>[\\s\\S]*?<\\/${tagAlvo}>`));
  if (!alvoMatch) return false;

  const alvoCanonico = canonicalizarElementoAlvo(alvoMatch[0], defaultNamespace);
  const digestCalculado = createHash(alg.nodeHash).update(alvoCanonico, "utf8").digest("base64");
  if (digestCalculado !== digestMatch[1]) return false;

  const signedInfoCanonico = `<SignedInfo xmlns="${URIS.xmldsig}">${signedInfoMatch[1]}</SignedInfo>`;
  const pem = `-----BEGIN CERTIFICATE-----\n${certMatch[1].match(/.{1,64}/g)?.join("\n") ?? certMatch[1]}\n-----END CERTIFICATE-----`;
  const verifier = createVerify(alg.nodeSign);
  verifier.update(signedInfoCanonico, "utf8");
  verifier.end();
  return verifier.verify(pem, sigMatch[1], "base64");
}
