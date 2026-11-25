import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";

import { caixaDoLogo, dimensoesImagem } from "../src/lib/pdf/dimensoes-imagem";
import { mesmoNome } from "../src/lib/identificacao";

/**
 * Cabeçalho dos PDFs: dimensões do logo sem sharp (roda no Workers), layout de logo em faixa
 * e nome da oficina sem repetição.
 */

const imagem = (largura: number, altura: number) =>
  sharp({ create: { width: largura, height: altura, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } });

describe("dimensoesImagem", () => {
  it("lê PNG, JPEG e WebP (com e sem perdas) gerados pelo sharp", async () => {
    assert.deepEqual(dimensoesImagem(await imagem(500, 100).png().toBuffer()), { largura: 500, altura: 100 });
    assert.deepEqual(dimensoesImagem(await imagem(321, 123).jpeg().toBuffer()), { largura: 321, altura: 123 });
    assert.deepEqual(dimensoesImagem(await imagem(321, 123).jpeg({ progressive: true }).toBuffer()), { largura: 321, altura: 123 });
    assert.deepEqual(dimensoesImagem(await imagem(301, 77).webp().toBuffer()), { largura: 301, altura: 77 });
    assert.deepEqual(dimensoesImagem(await imagem(301, 77).webp({ lossless: true }).toBuffer()), { largura: 301, altura: 77 });
    const comAlfa = await sharp({ create: { width: 90, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } })
      .webp()
      .toBuffer();
    assert.deepEqual(dimensoesImagem(comAlfa), { largura: 90, altura: 40 });
  });

  it("JPEG com EXIF antes do SOF", async () => {
    const b = await imagem(640, 480).jpeg().withMetadata({ orientation: 1 }).toBuffer();
    assert.deepEqual(dimensoesImagem(b), { largura: 640, altura: 480 });
  });

  it("devolve null para formato desconhecido ou arquivo truncado", async () => {
    assert.equal(dimensoesImagem(new Uint8Array([])), null);
    assert.equal(dimensoesImagem(Buffer.from("GIF89a....")), null);
    const png = await imagem(10, 10).png().toBuffer();
    assert.equal(dimensoesImagem(png.subarray(0, 20)), null);
    const jpg = await imagem(10, 10).jpeg().toBuffer();
    assert.equal(dimensoesImagem(jpg.subarray(0, 30)), null);
  });
});

describe("caixaDoLogo", () => {
  const logo = (l: number, a: number) => imagem(l, a).png().toBuffer();

  it("logo quadrado ou alto mantém a caixa de 52×52 ao lado dos dados", async () => {
    assert.deepEqual(caixaDoLogo(await logo(300, 300)), { largura: 52, altura: 52, faixa: false });
    assert.deepEqual(caixaDoLogo(await logo(200, 600)), { largura: 52, altura: 52, faixa: false });
    assert.deepEqual(caixaDoLogo(Buffer.from("x")), { largura: 52, altura: 52, faixa: false });
  });

  it("logo em faixa ganha até 200×56 pt mantendo a proporção", async () => {
    assert.deepEqual(caixaDoLogo(await logo(600, 120)), { largura: 200, altura: 40, faixa: true }); // 5:1
    assert.deepEqual(caixaDoLogo(await logo(600, 200)), { largura: 168, altura: 56, faixa: true }); // 3:1
    const c = caixaDoLogo(await logo(160, 100))!; // 1,6:1
    assert.equal(c.faixa, true);
    assert.ok(c.largura <= 200 && c.altura <= 56);
  });
});

describe("mesmoNome", () => {
  it("ignora espaços, maiúsculas e acentos", () => {
    assert.ok(mesmoNome("Yago Duarte Autoelétrica", "  YAGO  duarte AUTOELETRICA "));
    assert.ok(!mesmoNome("Yago Duarte Autoelétrica", "Y D Autoelétrica LTDA"));
  });
});
