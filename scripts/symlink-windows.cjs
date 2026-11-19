/* eslint-disable @typescript-eslint/no-require-imports -- carregado com node --require (CommonJS) */
// Só no Windows, durante `pnpm cf:build:*`: o OpenNext copia os symlinks do pnpm sem dizer o tipo,
// e o Windows cria link de ARQUIVO apontando para pasta ("Acesso negado" no bundle).
// Aqui links sem tipo cujo alvo é (ou será) uma pasta viram links de pasta.
const fs = require("node:fs");
const path = require("node:path");

const original = fs.symlinkSync;
fs.symlinkSync = function symlinkSync(alvo, caminho, tipo) {
  if (!tipo && process.platform === "win32") {
    try {
      tipo = fs.statSync(path.resolve(path.dirname(String(caminho)), String(alvo))).isDirectory() ? "dir" : "file";
    } catch {
      // Alvo ainda não copiado: pacotes do pnpm (node_modules/<pacote>) são sempre pastas
      tipo = path.extname(String(alvo)) && !/node_modules[\/](@[^\/]+[\/])?[^\/]+$/.test(String(alvo)) ? "file" : "dir";
    }
  }
  return original.call(this, alvo, caminho, tipo);
};
