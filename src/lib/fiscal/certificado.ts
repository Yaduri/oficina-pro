import "server-only";
import forge from "node-forge";

/*
 * Leitura de certificado digital ICP-Brasil A1 (.pfx / .p12) em JavaScript puro (node-forge),
 * compatível com Node.js e Cloudflare Workers (sem binários nativos).
 * No upload, validamos a senha e extraímos certPem + keyPem + metadados (titular, CNPJ, validade).
 */

export type DadosCertificadoA1 = {
  certPem: string;
  keyPem: string;
  titular: string;
  cnpj: string | null;
  serial: string;
  validoDe: Date;
  validoAte: Date;
  emissor: string | null;
};

/** Converte ArrayBuffer/Uint8Array em string binária esperada pelo node-forge */
function bytesParaBinario(bytes: Uint8Array): string {
  const partes: string[] = [];
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    partes.push(String.fromCharCode(...bytes.subarray(i, i + bloco)));
  }
  return partes.join("");
}

/**
 * Extrai o CNPJ de um certificado e-CNPJ ICP-Brasil:
 * 1) Subject CN no formato "RAZAO SOCIAL:12345678000199"
 * 2) Subject Alternative Name (OID 2.16.76.1.3.3 — padrão ICP-Brasil para CNPJ)
 */
function extrairCnpj(cert: forge.pki.Certificate, cn: string): string | null {
  const doCn = cn.match(/(?:^|[:\s-])(\d{14})(?:$|[^\d])/);
  if (doCn) return doCn[1];

  const san = cert.getExtension("subjectAltName") as { altNames?: Array<{ type: number; value?: unknown }> } | null;
  if (san?.altNames) {
    for (const alt of san.altNames) {
      const txt = typeof alt.value === "string" ? alt.value : JSON.stringify(alt.value ?? "");
      // Procura OID ICP-Brasil CNPJ (2.16.76.1.3.3) ou sequência de 14 dígitos no SAN
      const m = txt.match(/(\d{14})/);
      if (m) return m[1];
    }
  }
  return null;
}

/**
 * Faz o parse do arquivo .pfx/.p12 e valida chave privada + certificado.
 * Lança erro com mensagem amigável em português se a senha estiver incorreta ou o arquivo for inválido.
 */
export function lerCertificadoA1(pfxBytes: Uint8Array, senha: string): DadosCertificadoA1 {
  if (pfxBytes.byteLength < 100) {
    throw new Error("Arquivo de certificado inválido ou vazio.");
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(bytesParaBinario(pfxBytes));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/Invalid password|PKCS#12 MAC could not be verified/i.test(msg)) {
      throw new Error("Senha do certificado A1 incorreta.");
    }
    throw new Error("Não foi possível ler o arquivo .pfx/.p12. Confira se o arquivo está íntegro e a senha está correta.");
  }

  // Chave privada (shrouded key bag ou key bag)
  const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const plainBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const keyBag = [...shroudedBags, ...plainBags].find((b) => b.key);
  if (!keyBag?.key) {
    throw new Error("O arquivo não contém uma chave privada válida.");
  }

  // Certificados (seleciona o folha — o que corresponde à chave privada ou não é CA)
  const certBags = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).filter((b) => b.cert);
  if (certBags.length === 0) {
    throw new Error("O arquivo não contém certificado X.509.");
  }

  const keyPem = forge.pki.privateKeyToPem(keyBag.key);
  const pubKeyPem = forge.pki.publicKeyToPem(forge.pki.rsa.setPublicKey((keyBag.key as forge.pki.rsa.PrivateKey).n, (keyBag.key as forge.pki.rsa.PrivateKey).e));

  const folha =
    certBags.find((b) => {
      try {
        return forge.pki.publicKeyToPem(b.cert!.publicKey) === pubKeyPem;
      } catch {
        return false;
      }
    })?.cert ?? certBags[0].cert!;

  const certPem = forge.pki.certificateToPem(folha);
  const cnAttr = folha.subject.getField("CN");
  const titularRaw = typeof cnAttr?.value === "string" ? cnAttr.value : "Certificado A1";
  const titular = titularRaw.replace(/:\d{11,14}$/, "").trim() || titularRaw;
  const emissorAttr = folha.issuer.getField("CN") ?? folha.issuer.getField("O");
  const emissor = typeof emissorAttr?.value === "string" ? emissorAttr.value : null;

  return {
    certPem,
    keyPem,
    titular,
    cnpj: extrairCnpj(folha, titularRaw),
    serial: folha.serialNumber,
    validoDe: folha.validity.notBefore,
    validoAte: folha.validity.notAfter,
    emissor,
  };
}

/** Retira cabeçalhos PEM e quebras de linha para inserir em <X509Certificate> */
export function certPemParaBase64Limpo(certPem: string): string {
  return certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
}

export type SituacaoCertificado = "nao_cadastrado" | "valido" | "vencendo" | "vencido";

export function avaliarValidadeCertificado(validoAte: Date | null | undefined, agora = new Date()): {
  situacao: SituacaoCertificado;
  diasRestantes: number | null;
} {
  if (!validoAte) return { situacao: "nao_cadastrado", diasRestantes: null };
  const diffMs = validoAte.getTime() - agora.getTime();
  const diasRestantes = Math.ceil(diffMs / 86_400_000);
  if (diasRestantes <= 0) return { situacao: "vencido", diasRestantes };
  if (diasRestantes <= 30) return { situacao: "vencendo", diasRestantes };
  return { situacao: "valido", diasRestantes };
}
