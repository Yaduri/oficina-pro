import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// O app é dinâmico (dados por oficina, login em toda página): não usamos o cache incremental
// do Next (ISR) nem R2/KV para ele. Se um dia houver páginas estáticas com revalidate,
// configure aqui o r2IncrementalCache (veja docs/deploy.md).
export default defineCloudflareConfig({});
