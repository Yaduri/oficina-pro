import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres embutido usado em desenvolvimento) não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
  // Domínio de teste servido pelo Cloudflare Tunnel apontando para o `next dev`.
  allowedDevOrigins: ["oficinapro.yagoduarte.com.br"],
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
