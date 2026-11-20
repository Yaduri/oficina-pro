import "server-only";
import { deflateRawSync } from "node:zlib";

/*
 * Gerador de arquivo ZIP (PKZIP 2.0 com DEFLATE) em TypeScript puro.
 * Zero dependências externas; roda em Node.js e Cloudflare Workers (nodejs_compat).
 * Usado para o pacote mensal do contador (XMLs + relatório CSV).
 */

export type EntradaZip = {
  /** Caminho dentro do ZIP (ex.: "xmls/nfse-123.xml" ou "resumo-2026-11.csv") */
  nome: string;
  dados: Buffer | Uint8Array | string;
};

// Tabela CRC-32 padrão IEEE 802.3
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataHoraDos(d: Date): { hora: number; data: number } {
  const ano = Math.max(1980, d.getFullYear()) - 1980;
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const data = (ano << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, data };
}

export function criarZip(entradas: EntradaZip[], agora = new Date()): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  const { hora, data } = dataHoraDos(agora);
  let offset = 0;

  for (const e of entradas) {
    const nomeBuf = Buffer.from(e.nome.replace(/^\/+/, ""), "utf8");
    const bruto = typeof e.dados === "string" ? Buffer.from(e.dados, "utf8") : Buffer.from(e.dados);
    const comprimido = deflateRawSync(bruto, { level: 6 });
    const metodo = comprimido.length < bruto.length ? 8 : 0; // 8 = DEFLATE, 0 = STORE
    const payload = metodo === 8 ? comprimido : bruto;
    const crc = crc32(bruto);

    // Local file header (30 bytes + nome)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4); // version needed (2.0)
    lh.writeUInt16LE(0x0800, 6); // flag UTF-8
    lh.writeUInt16LE(metodo, 8);
    lh.writeUInt16LE(hora, 10);
    lh.writeUInt16LE(data, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(bruto.length, 22);
    lh.writeUInt16LE(nomeBuf.length, 26);
    lh.writeUInt16LE(0, 28); // extra length
    locais.push(lh, nomeBuf, payload);

    // Central directory header (46 bytes + nome)
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); // signature
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6); // version needed
    ch.writeUInt16LE(0x0800, 8); // flag UTF-8
    ch.writeUInt16LE(metodo, 10);
    ch.writeUInt16LE(hora, 12);
    ch.writeUInt16LE(data, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(bruto.length, 24);
    ch.writeUInt16LE(nomeBuf.length, 28);
    ch.writeUInt16LE(0, 30); // extra length
    ch.writeUInt16LE(0, 32); // comment length
    ch.writeUInt16LE(0, 34); // disk number
    ch.writeUInt16LE(0, 36); // internal attrs
    ch.writeUInt32LE(0, 38); // external attrs
    ch.writeUInt32LE(offset, 42); // relative offset
    centrais.push(ch, nomeBuf);

    offset += lh.length + nomeBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centrais);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entradas.length, 8);
  eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locais, centralDir, eocd]);
}
