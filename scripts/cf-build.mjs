// Build do worker do Cloudflare (OpenNext) para um ambiente: `node scripts/cf-build.mjs homolog|production`.
//
// - As variáveis NEXT_PUBLIC_* entram no JavaScript do navegador na hora do build, então vêm do
//   wrangler.jsonc (env.<ambiente>.vars), e não do .env.local de desenvolvimento.
// - O OpenNext embute no worker o conteúdo de .env/.env.local como valores padrão de process.env.
//   Aqui esse arquivo é zerado depois do build: em produção tudo vem de `vars` e `wrangler secret`.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseEnv } from "dotenv";
import ts from "typescript";

const ambiente = process.argv[2];
if (!["homolog", "production"].includes(ambiente)) {
  console.error("Uso: node scripts/cf-build.mjs homolog|production");
  process.exit(1);
}

const { config, error } = ts.parseConfigFileTextToJson("wrangler.jsonc", readFileSync("wrangler.jsonc", "utf8"));
if (error) throw new Error(`wrangler.jsonc inválido: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`);
const vars = config.env?.[ambiente]?.vars ?? {};

const env = { ...process.env, NEXTJS_ENV: "production", CF_BUILD: "1" };
if (process.platform === "win32") {
  // Corrige os symlinks que o OpenNext cria no Windows (ver scripts/symlink-windows.cjs)
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(path.resolve("scripts/symlink-windows.cjs"))}`.trim();
}
// NEXT_PUBLIC_* do .env.local não podem vazar para o build de produção
if (existsSync(".env.local")) {
  for (const k of Object.keys(parseEnv(readFileSync(".env.local")))) if (k.startsWith("NEXT_PUBLIC_") && !(k in process.env)) env[k] = "";
}
for (const [k, v] of Object.entries(vars)) {
  // Variável já definida no terminal tem prioridade (útil para testar o build sem as chaves reais)
  if (k.startsWith("NEXT_PUBLIC_") && !process.env[k]) env[k] = String(v);
}

const pk = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
if (!pk.startsWith("pk_")) {
  console.error(`Defina NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY em env.${ambiente}.vars no wrangler.jsonc (chave pk_... do Clerk).`);
  process.exit(1);
}
if (ambiente === "production" && !pk.startsWith("pk_live_")) console.warn("Aviso: produção sem chave pk_live_ do Clerk.");

const r = spawnSync("pnpm", ["exec", "opennextjs-cloudflare", "build", "--env", ambiente], { stdio: "inherit", env, shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

writeFileSync(".open-next/cloudflare/next-env.mjs", "export const production = {};\nexport const development = {};\nexport const test = {};\n");

// O pdfkit (usado pelo @react-pdf) carrega as fontes padrão (Helvetica...) com
// createRequire(import.meta.url)("#standard-fonts/..."), que não existe no Workers.
// Troca essas chamadas por imports estáticos, que o wrangler empacota no deploy.
const handler = ".open-next/server-functions/default/handler.mjs";
const requirePdf = createRequire(createRequire(path.resolve("package.json")).resolve("@react-pdf/renderer"));
const requirePdfkit = createRequire(requirePdf.resolve("pdfkit"));
const fontes = new Map();
let codigo = readFileSync(handler, "utf8").replace(/[A-Za-z_$][\w$]*\("#standard-fonts\/([A-Za-z]+)"\)/g, (_, nome) => {
  if (!fontes.has(nome)) fontes.set(nome, requirePdfkit.resolve(`pdfkit/standard-fonts/${nome}`));
  return `__fontePdf_${nome}`;
});
if (fontes.size === 0) {
  console.warn("Aviso: nenhuma fonte padrão do pdfkit encontrada no worker; confira se os PDFs funcionam (pnpm cf:preview).");
} else {
  const imports = [...fontes].map(([nome, arq]) => `import __fontePdf_${nome} from ${JSON.stringify(arq.split(path.sep).join("/"))};`);
  codigo = `${imports.join("\n")}\n${codigo}`;
}

// O yoga-layout (layout do @react-pdf) traz o wasm em base64 e o compila em tempo de execução,
// o que o Workers proíbe ("Wasm code generation disallowed by embedder"). Aqui o binário vira
// o arquivo yoga.wasm ao lado do handler, importado estaticamente (o wrangler o sobe já compilado,
// como WebAssembly.Module), e o loader do Emscripten recebe um `instantiateWasm` que o usa.
const marcaYoga = codigo.indexOf('yoga-wasm-base64-esm.js"(){');
const reYoga = /(\w+)\.ready=new Promise\(function\((\w+),(\w+)\)\{(\w+)=\2[,;](\w+)=\3\}\);/y;
const reBase64 = /"data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)"/y;
const iReady = marcaYoga < 0 ? -1 : codigo.slice(marcaYoga).search(/\w+\.ready=new Promise\(function/) + marcaYoga;
const iBase64 = marcaYoga < 0 ? -1 : codigo.indexOf('"data:application/octet-stream;base64,AGFzbQ', marcaYoga);
reYoga.lastIndex = iReady;
reBase64.lastIndex = iBase64;
const ready = iReady >= marcaYoga && marcaYoga >= 0 ? reYoga.exec(codigo) : null;
const base64 = iBase64 >= 0 ? reBase64.exec(codigo) : null;
if (!ready || !base64 || iBase64 < iReady || !base64[1].startsWith("AGFzbQ")) {
  console.error("Erro: não achei o loader do yoga-layout no worker; os PDFs falhariam no Workers. Revise o patch em scripts/cf-build.mjs.");
  process.exit(1);
}
writeFileSync(path.join(path.dirname(handler), "yoga.wasm"), Buffer.from(base64[1], "base64"));
const [trechoReady, mod, , , , rejeitar] = ready;
const gancho = `${mod}.instantiateWasm||(${mod}.instantiateWasm=function(i,ok){WebAssembly.instantiate(__yogaWasm,i).then(ok,${rejeitar});return{}});`;
// Troca de trás para frente para os índices continuarem válidos (o base64 vem depois do ready)
codigo =
  codigo.slice(0, iBase64) +
  '"data:application/octet-stream;base64,"' +
  codigo.slice(iBase64 + base64[0].length);
codigo = codigo.slice(0, iReady) + trechoReady + gancho + codigo.slice(iReady + trechoReady.length);
codigo = `import __yogaWasm from "./yoga.wasm";\n${codigo}`;
writeFileSync(handler, codigo);
console.log(`\nWorker pronto para "${ambiente}" em .open-next/ (sem valores de .env.local embutidos).`);
