# NFS-e Nacional — Certificado A1 e mTLS no Cloudflare Workers

A emissão direta na **NFS-e Nacional** (SEFIN Nacional — `sefin.nfse.gov.br` e `sefin.producaorestrita.nfse.gov.br`) exige **dois usos** do certificado digital ICP-Brasil A1 (`.pfx`/`.p12`):

1. **Assinatura XMLDSig da DPS e do cancelamento (`e101101`)**: feita diretamente no sistema (`src/lib/fiscal/xmldsig.ts`), usando o certificado A1 enviado em **Configurações → Fiscal** (guardado cifrado no banco). Funciona em Node.js e no Cloudflare Workers sem configuração adicional.
2. **Autenticação mútua na conexão HTTPS (mTLS)**: a SEFIN Nacional exige o certificado cliente na negociação TLS 1.2+.

## Como o transporte mTLS funciona por ambiente (`src/lib/fiscal/mtls.ts`)

### 1. Desenvolvimento local (`pnpm dev` / Node.js)
Usa `node:https` nativo com o certificado A1 salvo em **Configurações → Fiscal**. Basta cadastrar o `.pfx` e a senha pela tela — não precisa de nenhuma variável extra.

### 2. Produção / Homologação no Cloudflare Workers
O runtime do Cloudflare Workers (`workerd`) não permite passar chaves privadas arbitrárias para sockets `node:tls` em tempo de execução. Por isso, o sistema suporta **duas opções**:

#### Opção A — Binding nativo `MTLS_NFSE` no Cloudflare (grátis, ideal para 1 CNPJ por worker)
Quando o certificado A1 da oficina chegar:

1. Extraia `cert.pem` e `key.pem` do `.pfx` (com OpenSSL ou pelo script abaixo):
   ```bash
   openssl pkcs12 -in certificado.pfx -clcerts -nokeys -out cert.pem
   openssl pkcs12 -in certificado.pfx -nocerts -nodes -out key.pem
   ```
2. Envie o certificado para a Cloudflare (cria um ID seguro na conta):
   ```bash
   pnpm exec wrangler mtls-certificate upload --cert cert.pem --key key.pem --name oficina-a1-prod
   ```
3. Adicione o binding em `wrangler.jsonc` dentro do ambiente desejado (`homolog` ou `production`):
   ```jsonc
   "mtls_certificates": [
     { "binding": "MTLS_NFSE", "certificate_id": "<ID_RETORNADO_PELO_WRANGLER>" }
   ]
   ```
4. Publique normalmente (`pnpm cf:deploy:homolog` ou `pnpm cf:deploy:prod`) e apague os arquivos `.pem` locais.

#### Opção B — Proxy mTLS dinâmico (quando houver várias oficinas com CNPJs diferentes no mesmo worker)
Defina dois segredos no Cloudflare Workers:
- `NFSE_MTLS_PROXY_URL`: URL HTTPS de um micro-serviço Node.js/Go (VPS, Cloud Run, Fly.io ou Render) que recebe `{ url, method, headers, body, certPem, keyPem }` autenticado pelo cabeçalho `x-proxy-secret` e repassa a chamada via `https.request` com mTLS.
- `NFSE_MTLS_PROXY_SECRET`: token aleatório forte compartilhado entre o worker e o proxy.

## Fila automática de retentativas

Se a SEFIN Nacional estiver fora do ar (5xx / timeout), a nota fica na fila com retentativas exponenciais (1 min, 5 min, 15 min, 1 h, 4 h). Para disparar automaticamente em produção, configure um cron chamando:

```http
POST https://oficina.yagoduarte.com.br/api/fiscal/fila
Authorization: Bearer <CRON_SECRET>
```

Também há o botão **"Processar fila"** na tela `/notas`.
