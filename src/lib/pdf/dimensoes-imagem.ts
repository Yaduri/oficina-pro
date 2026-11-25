/**
 * Largura e altura (px) de uma imagem PNG, JPEG ou WebP lendo só o cabeçalho dos bytes.
 * Puro, sem sharp: roda igual em Node e no Cloudflare Workers.
 * Devolve null se o formato não for reconhecido ou o arquivo estiver truncado.
 */
export type Dimensoes = { largura: number; altura: number };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

const valida = (largura: number, altura: number): Dimensoes | null => (largura > 0 && altura > 0 ? { largura, altura } : null);

function png(b: Uint8Array): Dimensoes | null {
  // Assinatura (8) + tamanho do chunk (4) + "IHDR" (4) + largura (4) + altura (4)
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return valida(u32be(b, 16), u32be(b, 20));
}

function jpeg(b: Uint8Array): Dimensoes | null {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1];
    // Preenchimento (0xFF repetido) e marcadores sem tamanho
    if (marcador === 0xff) {
      i++;
      continue;
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marcador === 0xd9 || marcador === 0xda) return null; // fim / início dos dados sem ter achado SOF
    const tamanho = u16be(b, i + 2);
    if (tamanho < 2) return null;
    // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC)
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      if (i + 9 > b.length) return null;
      return valida(u16be(b, i + 7), u16be(b, i + 5));
    }
    i += 2 + tamanho;
  }
  return null;
}

function webp(b: Uint8Array): Dimensoes | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X") return valida(u24le(b, 24) + 1, u24le(b, 27) + 1);
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return valida((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8 ") {
    // Quadro-chave: 3 bytes de tag + código de início 9D 01 2A
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return valida(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  return null;
}

export function dimensoesImagem(bytes: Uint8Array): Dimensoes | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return png(b);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpeg(b);
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return webp(b);
  return null;
}

/** Logo a partir desta proporção (largura/altura) é tratado como faixa/banner */
const PROPORCAO_FAIXA = 1.6;
const LOGO_LADO = 52;
const FAIXA_MAX_LARGURA = 200;
const FAIXA_MAX_ALTURA = 56;

/**
 * Tamanho do logo no cabeçalho conforme a proporção dos bytes que vão para o PDF.
 * Quadrado/alto (ou formato desconhecido): caixa de 52×52 ao lado dos dados, como sempre.
 * Faixa/banner: até 200×56 pt mantendo a proporção, com os dados da oficina embaixo.
 */
export function caixaDoLogo(bytes: Uint8Array): { largura: number; altura: number; faixa: boolean } {
  const d = dimensoesImagem(bytes);
  const proporcao = d ? d.largura / d.altura : 1;
  if (proporcao < PROPORCAO_FAIXA) return { largura: LOGO_LADO, altura: LOGO_LADO, faixa: false };
  const largura = Math.min(FAIXA_MAX_LARGURA, FAIXA_MAX_ALTURA * proporcao);
  return { largura, altura: largura / proporcao, faixa: true };
}
