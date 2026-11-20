import type { NextConfig } from "next";

// Build para o Cloudflare Workers (scripts/cf-build.mjs): PGlite (só desenvolvimento) e sharp (binário nativo)
// saem do worker. Lá o banco vem do Hyperdrive e as imagens do PDF usam o Cloudflare Images (src/lib/pdf/imagens.ts).
const paraCloudflare = process.env.CF_BUILD === "1";

const nextConfig: NextConfig = {
  // PGlite (Postgres embutido usado em desenvolvimento) não deve ser empacotado.
  serverExternalPackages: paraCloudflare ? ["@react-pdf/renderer"] : ["@electric-sql/pglite", "@react-pdf/renderer"],
  // O banco e os arquivos locais de desenvolvimento (.data) nunca entram no build
  outputFileTracingExcludes: { "*": [".data/**"] },
  // Domínio de teste servido pelo Cloudflare Tunnel apontando para o `next dev`.
  allowedDevOrigins: ["oficinapro.yagoduarte.com.br"],
  // Service worker + cabeçalhos de segurança HTTP (Fase 6.2)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    resolveAlias: paraCloudflare ? { "@electric-sql/pglite": "./scripts/cf-sem-pglite.mjs", sharp: "./scripts/cf-sem-sharp.mjs" } : {},
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
