# Revisão de Segurança — Oficina Pro (Fase 6.2)

Checklist e auditoria técnica realizada antes da abertura para múltiplas oficinas (20/11/2026).

## 1. Isolamento multi-tenant (Banco e Arquivos)
- **Row Level Security (RLS)** habilitado em **100% das 41 tabelas** em `public` (validado automaticamente no startup do PGlite e na suíte `pnpm test`).
- Todas as consultas de usuários logados rodam como papel `app_usuario` com `app.usuario` amarrado ao `userId` validado pelo Clerk no servidor.
- Tabela `rate_limits` isolada com policy `USING (false)` para `app_usuario` (acessível apenas pela conexão de sistema).
- Papéis públicos do Supabase (`anon`, `authenticated`) têm `REVOKE ALL` em todas as tabelas e sequências.
- Arquivos no R2/disco ficam sob prefixo `<oficinaId>/...` e `/arquivos/[...key]` confere pertencimento à oficina e restringe o papel `contador` a `fiscal/` e `logos/`.

## 2. Autenticação, Autorização e Papéis
- Permissões aplicadas **no servidor** em todas as Server Actions e Route Handlers (`src/lib/permissoes.ts`).
- Papel `contador` restrito a leitura de notas fiscais (`/notas`) e exportação ZIP; bloqueado no servidor em rotas operacionais (`/ordens-servico`, `/clientes`, `/agenda`, `/api/upload`, busca global).
- Nenhum membro pode alterar o próprio acesso; gerente não altera dono; oficina sempre mantém ao menos um dono ativo.

## 3. Criptografia e Segredos
- Chave da API Asaas e Certificado Digital A1 (`.pfx`, senha, PEM e chave privada) cifrados em repouso com **AES-256-GCM** (`src/lib/cripto.ts`, `CHAVE_CRIPTOGRAFIA` de 32 bytes).
- Comparação de tokens de webhook e `CRON_SECRET` via `timingSafeEqual` (sem vazamento por tempo).
- Exportação da conta (LGPD) exclui chaves de API, webhooks e certificados privados.
- **Ação pendente fora do código:** girar a chave de desenvolvimento do Clerk (exposta no histórico anterior do chat) e preencher `NEXT_PUBLIC_LEGAL_*` em `wrangler.jsonc`.

## 4. Proteção contra abuso e injeção
- **Rate limit distribuído no Postgres** (`src/lib/rate-limit.ts`) em todos os links públicos (`/orcamento/[token]`, `/portal/[token]`, `/pesquisa/[token]`, `/documento/[token]`), envios de formulário público, `/api/upload` e `/api/erros`.
- **Upload validado por magic bytes** (`src/lib/upload-validacao.ts`): rejeita arquivos cuja assinatura binária não seja JPEG, PNG, WebP ou PDF, bloqueando MIME spoofing/HTML/SVG.
- **Cabeçalhos HTTP de segurança** em `next.config.ts`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` e `Strict-Transport-Security`. Arquivos servidos por `/arquivos/` recebem `Content-Security-Policy: default-src 'none'; sandbox`.
- Queries 100% parametrizadas via Drizzle ORM; validação de entrada com Zod; escape rigoroso em XMLs fiscais (`escXml`).

## 5. Auditoria e LGPD
- Trilha de auditoria (`auditoria` + tela `/configuracoes/auditoria`) registra alterações de valores, descontos, cancelamentos, exclusões, estornos, emissões/cancelamentos de NFS-e, alterações de acesso e operações LGPD.
- Exportação dos dados de um cliente (ZIP) e exclusão/anonimização (art. 16 e 18 LGPD) na página do cliente.
- Exportação completa da conta (ZIP JSON + CSV) em Configurações → Oficina → Dados da conta e saída.
