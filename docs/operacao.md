# Operação — Backup, Monitoramento e Manutenção (Fase 6.3)

## 1. Backup diário automático e teste de restauração

O plano gratuito do Supabase não permite baixar backups automáticos. O projeto inclui backup lógico consistente (`REPEATABLE READ`), compactado em GZip, verificado por SHA-256 e cifrado com AES-256-GCM (`CHAVE_CRIPTOGRAFIA`), enviado para o Cloudflare R2 em `backups/<ambiente>/backup-AAAA-MM-DD.json.gz.enc`.

### Comandos manuais
```bash
pnpm db:backup:prod      # Faz backup da produção e envia ao R2
pnpm db:test-restore     # Restaura o backup mais recente num PGlite limpo e valida contagens + RLS
```

### Automação diária (GitHub Actions)
O workflow [`.github/workflows/operacao-diaria.yml`](../.github/workflows/operacao-diaria.yml) roda diariamente às **03:00 BRT**, executa o backup, testa a restauração imediatamente, verifica `/api/saude` e, aos domingos, limpa fotos órfãs no R2.

Configure em **GitHub → Settings → Secrets and variables → Actions**:
- `PROD_DATABASE_URL`: string de conexão Session Pooler (porta 5432) do Supabase de produção
- `PROD_CHAVE_CRIPTOGRAFIA`: mesma chave 32 bytes base64 de produção
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PROD_R2_BUCKET`
- `PROD_CRON_SECRET`: mesmo valor de `CRON_SECRET` nos segredos do Worker

## 2. Monitoramento e aviso de erros

- **Healthcheck:** `GET https://oficina.yagoduarte.com.br/api/saude` (retorna HTTP 200 com latência do banco ou 503 se o banco cair — pronto para UptimeRobot/BetterStack).
- **Erros em produção:** `src/app/error.tsx`, `src/app/global-error.tsx` e `src/lib/monitoramento.ts` enviam alertas com cooldown de 5 minutos (sem spam) quando uma das variáveis abaixo estiver configurada nos segredos do Cloudflare Workers:
  - `ALERTA_WEBHOOK_URL`: URL de webhook do Discord, Slack ou ntfy
  - `SENTRY_DSN`: DSN de um projeto Sentry (envio HTTP leve, sem SDK pesado no Worker)

## 3. Limpeza de fotos órfãs no R2

Remove fotos de check-ins abandonados, fotos de OS ou anexos com mais de 24h que não constam no banco. **Nunca** remove arquivos em `*/fiscal/*` nem `backups/`.

```bash
# Prévia segura (não apaga nada):
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://oficina.yagoduarte.com.br/api/operacao/limpar-orfas?dryRun=1"

# Execução real:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://oficina.yagoduarte.com.br/api/operacao/limpar-orfas"
```
