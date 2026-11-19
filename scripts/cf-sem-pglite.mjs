// Substitui o @electric-sql/pglite no build do Cloudflare (scripts/cf-build.mjs).
// O PGlite só é usado em desenvolvimento sem DATABASE_URL; no Workers o banco vem do Hyperdrive.
export class PGlite {
  constructor() {
    throw new Error("PGlite não está disponível no Cloudflare Workers. Configure o binding HYPERDRIVE.");
  }
}

// drizzle-orm/pglite importa `types` (só usado com o PGlite de verdade)
export const types = {};
