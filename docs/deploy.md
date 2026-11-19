# Deploy no Cloudflare Workers

O app roda no Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`).
Banco: Supabase (São Paulo) atrás do Hyperdrive. Arquivos: R2. Login: Clerk.

| Ambiente | Worker | Endereço | Supabase |
| --- | --- | --- | --- |
| homolog | `oficina-pro-homolog` | https://homolog.yagoduarte.com.br | `oficina-pro-homolog` |
| production | `oficina-pro` | https://app.yagoduarte.com.br | `oficina-pro` |

Tudo fica em `wrangler.jsonc` (bindings, domínios, variáveis públicas). Segredos só via `wrangler secret`.

**Plano:** o worker tem ~3,7 MiB comprimido. O plano gratuito aceita até 3 MiB; precisa do **Workers Paid** (US$ 5/mês, limite de 10 MiB).
Para conferir o tamanho: `pnpm cf:build:homolog` e depois `pnpm wrangler deploy --dry-run --env homolog` (linha `Total Upload ... gzip:`).

## 1. Login no Cloudflare

```sh
pnpm wrangler login
```

## 2. Banco: Supabase + Hyperdrive (uma vez por ambiente)

1. No Supabase, projeto `oficina-pro-homolog`: **Project Settings → Database → Reset database password**. Guarde a senha só com você.
2. Botão **Connect** → copie duas strings (com a senha no lugar de `[YOUR-PASSWORD]`):
   - **Transaction pooler** (porta **6543**): vai para o Hyperdrive.
   - **Session pooler** (porta **5432**): para as migrações.
3. Crie o Hyperdrive **no seu terminal** (a senha não passa por chat nem pelo git). Cache **desligado** é obrigatório: com cache, uma consulta de uma oficina poderia ser devolvida para outra (RLS) e telas mostrariam dados velhos.

   ```sh
   pnpm wrangler hyperdrive create oficina-pro-homolog --caching-disabled --connection-string="postgresql://postgres.<ref>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
   ```

4. Copie o `id` impresso para `env.homolog.hyperdrive[0].id` no `wrangler.jsonc` (troque `COLE_AQUI_O_ID_DO_HYPERDRIVE_HOMOLOG`). O id não é segredo.
5. Crie o arquivo `.env.migracao.homolog` (já ignorado pelo git) com a string do **Session pooler**:

   ```
   DATABASE_URL=postgresql://postgres.<ref>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```

Repita para produção (`oficina-pro`, `COLE_AQUI_O_ID_DO_HYPERDRIVE_PROD`, `.env.migracao.prod`).

## 3. Clerk

- **Homologação:** pode usar a instância de desenvolvimento do Clerk (chaves `pk_test_`/`sk_test_`); ela funciona em qualquer domínio.
- **Produção:** no painel do Clerk, crie a instância de **Production** com o domínio `yagoduarte.com.br` (app em `app.yagoduarte.com.br`). O Clerk mostra registros DNS (CNAME de `clerk.`, `accounts.`, `clkmail.` e os de DKIM). Crie-os no DNS do Cloudflare com o **proxy desligado (nuvem cinza)** e espere o Clerk validar. Configure de novo os provedores de login (Google etc.) na instância de produção.
- Copie a **publishable key** (`pk_...`) para `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` em `env.<ambiente>.vars` no `wrangler.jsonc`. Ela é pública e entra no build.

Preencha também, em `vars`, `NEXT_PUBLIC_LEGAL_RESPONSAVEL`, `NEXT_PUBLIC_LEGAL_EMAIL` e `NEXT_PUBLIC_LEGAL_FORO` (Termos e Privacidade).
Variáveis `NEXT_PUBLIC_*` entram no build: mudou, faça deploy de novo.

## 4. Segredos (por ambiente)

Cada comando pede o valor no terminal. Para produção, troque `--env homolog` por `--env production`.

```sh
pnpm wrangler secret put CLERK_SECRET_KEY --env homolog
pnpm wrangler secret put CHAVE_CRIPTOGRAFIA --env homolog
pnpm wrangler secret put R2_ACCOUNT_ID --env homolog
pnpm wrangler secret put R2_ACCESS_KEY_ID --env homolog
pnpm wrangler secret put R2_SECRET_ACCESS_KEY --env homolog
pnpm wrangler secret put R2_BUCKET --env homolog
```

- `CHAVE_CRIPTOGRAFIA`: gere uma por ambiente (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) e guarde: sem ela as chaves do Asaas salvas no banco não abrem mais.
- R2: um bucket privado por ambiente e um token de API do R2 com leitura e escrita nele. Sem as 4 variáveis do R2 os uploads falham no Workers (não há disco).
- `APP_URL` já está em `vars` no `wrangler.jsonc`. `DATABASE_URL` não é usada no Workers (o banco vem do binding `HYPERDRIVE`).
- Conferir: `pnpm wrangler secret list --env homolog`.

## 5. Deploy

```sh
pnpm cf:deploy:homolog   # migra o banco de homolog, faz o build e publica
```

Teste em https://homolog.yagoduarte.com.br: login, abrir uma OS, check-in com foto e **gerar um PDF** (com fotos e logo).
Logs ao vivo: `pnpm wrangler tail oficina-pro-homolog`.

Depois, produção:

```sh
pnpm cf:deploy:prod
```

Na primeira vez o wrangler cria o domínio personalizado (`custom_domain`) e o certificado; pode levar alguns minutos.
Não pode existir outro registro DNS com o mesmo nome (`app` / `homolog`) na zona.

Passos soltos, se precisar: `pnpm db:migrate:homolog`, `pnpm cf:build:homolog`, `pnpm cf:preview` (roda o worker local, sem banco), `pnpm exec opennextjs-cloudflare deploy --env homolog`.

## Como funciona (para manutenção)

- `scripts/cf-build.mjs`: build com `CF_BUILD=1`. Lê as `NEXT_PUBLIC_*` do `wrangler.jsonc` (não do `.env.local`), não embute o `.env.local` no worker e troca o carregamento das fontes padrão do pdfkit (que usa `createRequire`, inexistente no Workers) por imports estáticos.
- `next.config.ts` com `CF_BUILD=1`: PGlite e sharp viram stubs (`scripts/cf-sem-*.mjs`) e saem do worker. `.data/` nunca entra em build.
- `src/db/index.ts`: no Workers cria o cliente postgres-js por requisição (conexões não podem ser reaproveitadas entre requisições) usando o binding `HYPERDRIVE`; o pool fica no Hyperdrive. Em `next dev` continua o PGlite.
- `src/lib/pdf/imagens.ts`: no Workers usa o binding `IMAGES` (Cloudflare Images) para reduzir as fotos do PDF; sem cota/binding, usa o JPEG/PNG original (as fotos já chegam do celular em JPEG ≤ 1600 px). Em Node continua o sharp.
- Windows: o OpenNext avisa que não é totalmente compatível. O build funciona com a correção de symlinks em `scripts/symlink-windows.cjs`; se algo estranho aparecer, rode o build no WSL ou num CI Linux.
- O `proxy.ts` (Clerk) roda como "Node middleware", suporte ainda experimental no OpenNext.
