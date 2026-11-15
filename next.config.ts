import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres embutido usado em desenvolvimento) não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite"],
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
