import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` gera as migrações a partir de src/db/schema.ts.
// `pnpm db:migrate` aplica no Postgres de DATABASE_URL (Supabase).
// Em desenvolvimento sem DATABASE_URL, o app aplica as migrações no PGlite sozinho.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
