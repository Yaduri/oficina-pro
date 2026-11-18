import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres embutido usado em desenvolvimento) não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
  // Domínio de teste servido pelo Cloudflare Tunnel apontando para o `next dev`.
  allowedDevOrigins: ["oficinapro.yagoduarte.com.br"],
  // Service worker: sempre a versão mais nova e só scripts do próprio site
  async headers() {
    return [
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
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
