# Plano de implementação — Oficina Pro

Plano completo para levar o sistema do estado atual até a versão final, sem lacunas.
Complementa [arquitetura.md](arquitetura.md) (o "o quê" e o "porquê"); aqui está o "em que ordem" e o "quando está pronto".

**Legenda:** `[x]` pronto · `[ ]` a fazer · Tamanho: **P** (uma sessão curta), **M** (uma sessão), **G** (duas ou mais sessões)
**Regra de pronto para todo item:** funciona no celular e no computador, valida os dados no servidor, respeita a oficina do usuário, foi testado no navegador e os dados de teste foram apagados.

---

## Situação atual (16/11/2026)

- [x] Base: Next.js 16, Clerk (login), Drizzle + PGlite local, visual definido (design B)
- [x] Cadastro inicial da oficina (nome e CNPJ)
- [x] Clientes (PF/PJ, validação de CPF/CNPJ, telefone, WhatsApp) e veículos (placa Mercosul)
- [x] Ordens de serviço: nova OS, quadro por status, tela da OS, itens de peça/serviço, totais
- [x] Check-in pelo celular: fotos comprimidas, km, combustível, avarias, objetos, assinatura; cada check-in abre uma OS
- [x] Arquivos no Cloudflare R2 (testado)
- [x] Orçamento com link de aprovação (aprovação total, parcial ou recusa, sem login)
- [x] Configurações da oficina e dos dados fiscais (1.1)
- [x] Usuários, papéis e convites (1.2)
- [x] Checklist configurável no check-in (1.3)
- [x] Ajustes da OS: edição, desconto, transferência, entrega, lista, histórico e fotos (1.5)

---

## Fase 1 — Operação completa da oficina

Objetivo: os dois sócios e a equipe conseguem tocar o dia a dia inteiro no sistema.

### 1.1 Configurações da oficina — **M**
- [x] Tela **Configurações** (só dono/gerente)
- [x] Oficina: nome, telefone, WhatsApp, endereço (CEP com preenchimento automático), logo (R2)
- [x] Dados fiscais: razão social, nome fantasia, CNPJ (validação, inclusive o CNPJ alfanumérico), IE, IM, regime tributário
- [x] Textos padrão: garantia de serviço, termo do check-in, observação padrão do orçamento, validade padrão do orçamento
- [x] Dados usados no orçamento por link e no termo de entrada (PDFs na etapa 1.4)
- [x] O check-in guarda a cópia do termo que o cliente leu ao assinar

### 1.2 Usuários, papéis e acessos — **G**
- [x] Acessos no nosso banco (`membros`, `convites`), sem Organizations do Clerk — ver arquitetura §4.1
- [x] Convite por link de uso único (7 dias), enviado pelo WhatsApp, escolhendo o papel
- [x] Lista de usuários: alterar papel/acesso, desativar e reativar; convites pendentes com copiar/WhatsApp/cancelar
- [x] Permissões aplicadas no servidor em todas as ações (técnico não vê valores, não abre OS, não lança itens, não entrega/cancela; financeiro não abre OS)
- [x] Menu e botões escondidos conforme o papel
- [x] Regras: ninguém altera o próprio acesso, gerente não mexe em dono, a oficina sempre tem um dono ativo
- [x] Tela de acesso desativado
- [ ] ~~Webhook do Clerk~~ — não é mais necessário (nome/e-mail copiados ao aceitar o convite)
- [x] Técnicos sem login continuam cadastráveis (Configurações → Técnicos, feito na 1.6)

### 1.3 Checklist configurável no check-in — **M**
- [x] Configurações → Checklist: itens agrupados, ativar/desativar, ordenar, remover
- [x] Sugestão inicial com um clique (itens do veículo, painel e elétrica, verificações)
- [x] No check-in: cada item OK / Com problema / Não tem, observação no problema, "marcar os restantes como OK"
- [x] Mostrar no termo de entrada e na OS (resumo do que tem problema ou falta); PDF na etapa 1.4
- [x] Mudança no checklist não altera check-ins antigos (cópia no momento do registro)

### 1.4 PDFs — **M**
- [x] Geração no servidor com logo e dados do CNPJ (@react-pdf/renderer; fotos reduzidas com sharp)
- [x] PDF do **orçamento** (botão na OS e na página do cliente; mostra aprovado/recusado depois da resposta)
- [x] PDF da **OS** (via da oficina e via do cliente, com assinatura de retirada)
- [x] PDF do **termo de entrada** (check-in com fotos e checklist)
- [x] Enviar PDF pelo WhatsApp (link público com token) e baixar

### 1.5 Ajustes da OS — **M**
- [x] Editar relato, responsável, km de entrada e previsão de entrega
- [x] Editar item (tipo, descrição, quantidade, valor)
- [x] Desconto na OS (valor ou %); vai junto no orçamento e é aplicado proporcionalmente na aprovação parcial
- [x] Entrega do veículo: km de saída, garantia (padrão configurável), observação e assinatura de retirada
- [x] Visualização em **lista** com filtros (status, período, técnico, busca) além do quadro
- [x] Histórico de alterações da OS (inclusive a resposta do cliente pelo link)
- [x] Fotos durante o serviço (peça trocada, antes/depois), pelo celular

### 1.6 Cadastros que faltam — **M**
- [x] Excluir/arquivar cliente e veículo (só exclui o que nunca teve OS nem check-in; o resto é arquivado; volta sozinho se o veículo voltar à oficina)
- [x] Transferir veículo para outro dono (mantendo o histórico no veículo; página do veículo com OS e trocas de dono)
- [x] Cliente: endereço com CEP, aniversário, consentimento LGPD para contato por WhatsApp (com data), observações
- [x] Veículo: chassi, motor, combustível
- [x] **Catálogo de serviços**: descrição, valor, tempo padrão, código de serviço municipal
- [x] **Catálogo de peças** (base que o estoque usa na Fase 4): código, descrição, preço de venda
- [x] Na OS e na Nova OS: buscar no catálogo ao lançar item, com preço preenchido (e continuar podendo digitar livre)
- [x] Tela de técnicos: cadastrar, editar, ativar/desativar

### 1.7 Agenda — **M**
- [x] Agendamentos por dia/semana e por técnico (aviso de conflito de horário do técnico)
- [x] Agendar a partir do cliente/veículo; converter agendamento em check-in (já preenchido); confirmar, faltou, cancelar, lembrete por WhatsApp
- [x] Entregas previstas das OS aparecem na agenda
- [x] Início mostra os agendamentos do dia e as entregas previstas

### 1.8 Busca, notificações e início — **M**
- [x] Busca global (placa, cliente, telefone, nº da OS, modelo) no topo, com Ctrl+K ou "/"
- [x] Notificações no sino: orçamento aprovado/recusado, orçamento visto, OS parada há 3 dias, peça atrasada, entrega atrasada
- [x] Previsão da peça (editar OS) e "Avisar cliente" quando a OS fica pronta (registra o aviso)
- [x] Início com indicadores reais (pátio, aguardando aprovação, prontos e clientes não avisados, faturamento do mês e do dia pelas OS entregues; agendados hoje para quem não vê valores) — trocar para o financeiro na Fase 2

### 1.8b Um CNPJ por conta (mudança de 18/11/2026) — **M**
- [x] A oficina passa a ser o CNPJ: dados fiscais nas Configurações; sai a tabela de empresas e todo `empresa_id`
- [x] Sem seletor de empresa no topo, sem etiquetas de mecânica/elétrica, sem OS mista e sem transferir OS
- [x] Check-in abre uma OS; usuários sem escolha de empresas; catálogo, agenda e técnicos sem campo de empresa
- [x] Cada login pertence a uma única oficina (convite recusa quem já está em outra)
- [x] Migrações reunidas numa só (nada publicado ainda) e banco de desenvolvimento zerado

### 1.9 Celular como app (PWA) — **P**
- [x] Ícone na tela inicial, abre em tela cheia (manifesto com atalhos, iPhone e Android, margens do notch, cartão "Instalar app" no Início)
- [x] Página "Sem internet" pelo service worker (não guarda páginas logadas, ações nem arquivos)
- [x] Check-in tolera internet ruim: reenvio automático das fotos, "Registrar entrada" espera as fotos e envia sozinho quando a conexão volta, sem duplicar (chave de envio)
- [x] Rascunho do check-in salvo no celular (recupera depois de recarregar a página ou voltar da câmera)
- [ ] Limpar do R2 as fotos de rascunhos descartados (arquivos sem uso) — tarefa periódica na Fase 6

---

## Fase 2 — Financeiro

Objetivo: caixa, contas e relatórios da oficina.

### 2.1 Recebimento na entrega — **G**
- [x] Ao entregar a OS: registrar pagamento (dinheiro, PIX, débito, crédito, boleto, a prazo), parcelas e taxa da maquininha
- [x] Gera **contas a receber** automaticamente; baixa automática quando à vista
- [x] Recibo (PDF)

### 2.2 Contas a receber e a pagar — **G**
- [x] Lançamentos com vencimento, categoria, centro de custo, anexo (boleto/nota no R2)
- [x] Contas recorrentes (aluguel, energia, internet)
- [x] Baixa parcial, juros/multa, estorno
- [x] Alertas de vencimento

### 2.3 Caixa e bancos — **M**
- [x] Contas bancárias e caixa físico
- [x] Abertura/fechamento de caixa diário com conferência
- [x] Transferência entre contas
- [x] Conciliação por arquivo OFX do banco

### 2.4 Relatórios financeiros — **M**
- [x] Fluxo de caixa (realizado e previsto)
- [x] DRE simplificada
- [x] Faturamento por período, por serviço, por técnico, ticket médio
- [x] Exportar para Excel/CSV

### 2.5 Cobrança online — **M**
- [x] Gateway: Asaas, uma conta por oficina (chave de API guardada cifrada com `CHAVE_CRIPTOGRAFIA`)
- [x] PIX, boleto ou cartão com QR Code e link de pagamento na conta a receber e nas parcelas da OS
- [x] Baixa automática por webhook na conta "Asaas", com a tarifa como taxa; estorno desfaz a baixa
- [ ] Em produção: definir `CHAVE_CRIPTOGRAFIA` no servidor e conectar a chave de produção do Asaas

### 2.6 Comissões — **M**
- [x] Regra por técnico (% sobre serviço, sobre peça, ou valor fixo)
- [x] Apuração por período e fechamento; gera conta a pagar

---

## Fase 3 — Fiscal (via API)

Objetivo: emitir as notas sem sair do sistema. Base, emissão direta na NFS-e Nacional, contador e reforma tributária implementados em 20/11/2026; faltam apenas os testes na produção restrita com o certificado A1 real e as confirmações do contador (regime, alíquota ISS, peças).

### 3.1 Integração base — **G**
- [x] Camada `ProvedorFiscal` (interface única) para poder trocar de provedor sem reescrever o sistema (`src/lib/fiscal/`)
- [x] NFS-e: **emissão direta na NFS-e Nacional** (API do gov.br, sem provedor pago): DPS em XML assinada com o certificado A1 (XMLDSig C14N), envio com mTLS (`node:https` local, binding `MTLS_NFSE` no Cloudflare Workers ou proxy mTLS), consulta, cancelamento (`e101101`) e substituição; ambiente de produção restrita (homologação) configurável
- [x] Peças (3.3), se houver: provedor (Focus NFe) preparado pela mesma interface (`provedor-focus.ts`)
- [x] Cadastro da oficina (CNPJ) com o **certificado A1** (upload `.pfx`/`.p12` validado e guardado criptografado, aviso de vencimento na tela e no sino)
- [x] Ambientes: homologação (produção restrita) para testes e produção
- [x] Fila de emissão com tentativas automáticas (backoff exponencial + `/api/fiscal/fila` + botão "Processar fila") e webhook de retorno (`/api/webhooks/fiscal/[oficinaId]`)
- [x] Guardar XML (DPS, NFS-e e cancelamento) e PDF (DANFSe) de cada nota no R2 (organizados por ano/mês para guarda de 5 anos)

### 3.2 NFS-e (serviços) — **G**
- [x] Emitir a partir da OS entregue (itens de serviço com desconto proporcional e discriminação automática) ou avulsa
- [x] Código de serviço (LC 116, item 14.01), alíquota de ISS, ISS retido e retenções federais (PIS, COFINS, CSLL, IRRF, INSS)
- [x] Padrão nacional implementado (código municipal opcional configurável após confirmar com o contador)
- [x] Cancelamento (`e101101`) e substituição (`<subst>`) com regeneração do DANFSe
- [x] Envio ao cliente por WhatsApp (link público do DANFSe + modelo editável) e e-mail; notas autorizadas também aparecem no Portal do Cliente
- [ ] Testar emissão, consulta e cancelamento na produção restrita da SEFIN Nacional assim que o certificado A1 da oficina chegar (e configurar mTLS no Cloudflare conforme `docs/fiscal-mtls.md`)

### 3.3 NF-e / NFC-e (peças) — **G**, só se vendem peças
- [ ] NCM, CFOP, CST/CSOSN por produto (no catálogo de peças)
- [ ] NFC-e para consumidor final no balcão; NF-e para empresa/fora do estado
- [ ] Carta de correção, cancelamento, inutilização de numeração
- [ ] Contingência

### 3.4 Contador — **P**
- [x] Exportação mensal (XMLs + DANFSe PDFs + relatório CSV), em ZIP (`/notas/exportar`)
- [x] Acesso de leitura para o contador (papel `contador`, convidável em Configurações → Usuários)

### 3.5 Reforma tributária — **P**
- [x] Campos de IBS/CBS na DPS v1.01 (LC 214/2025 / NT 009: `finNFSe`, `indFinal`, `cIndOp`, `CST`, `cClassTrib`, alíquotas), ativáveis em Configurações → Fiscal conforme orientação do contador

---

## Fase 4 — Estoque e compras

### 4.1 Estoque — **G**
- [x] Peça do catálogo com "Controlar estoque": saldo, mínimo, custo médio, unidade, localização, marca, código de barras e NCM; estoque inicial no cadastro
- [x] Entrada manual e **por XML da nota do fornecedor** (cadastra/vincula peças, aprende o código do fornecedor com fator de conversão, rateia frete, IPI e ST no custo, duplicatas viram contas a pagar)
- [x] Saída automática quando a OS sai do orçamento (aprovada em diante); volta ao estoque se o item for removido, recusado ou a OS cancelada. Saldo pode ficar negativo, com aviso
- [x] Estoque mínimo e reposição (sugestão de compra que vira pedido)
- [x] Inventário (contagem e ajuste com motivo) e ajuste avulso com histórico de movimentações
- [x] Custo médio e margem por peça; valor em estoque

### 4.2 Compras e fornecedores — **M**
- [x] Cadastro de fornecedores
- [x] Pedido de compra; a partir da OS ela fica "Aguardando peça" (se já aprovada) com previsão; chegada registrada na OS
- [x] Recebimento gera conta a pagar (parcelas ou já paga); estorno da entrada devolve estoque, custo médio e cancela as contas em aberto

---

## Fase 5 — Comunicação e crescimento

### 5.1 WhatsApp — **G**
- [x] Provedor: por enquanto **sem integração direta**, só wa.me (o texto abre no WhatsApp de quem clicou, sem custo por mensagem). A API oficial fica para depois
- [x] Mensagens: orçamento pronto, orçamento respondido (o cliente avisa a oficina pela página do orçamento), carro pronto, lembrete de agendamento, pós-venda com a pesquisa, revisão, portal e cliente inativo
- [x] Modelos editáveis (Configurações → Mensagens, com variáveis e prévia); registro de cada envio (quem, para quem, texto)
- [x] Fila "Mensagens": o que falta enviar (prontos não avisados, agendamentos de hoje e amanhã, orçamentos sem resposta, pós-venda, revisões), com dispensar e histórico de enviadas; consentimento LGPD conferido nas mensagens de relacionamento
- [ ] Integração com a API oficial do WhatsApp (envio automático), quando os sócios decidirem

### 5.2 Relacionamento — **M**
- [x] Lembrete de revisão por km/tempo: serviço do catálogo com "repetir a cada", criado na entrega da OS, km estimado pela média de uso; revisões na página do veículo
- [x] Pesquisa de satisfação após a entrega (link público, nota de 0 a 10 e comentário; aparece na OS e no sino)
- [x] Portal do cliente (link): veículos, histórico de OS com PDF, orçamento pendente e próximas revisões; notas fiscais entram com a Fase 3

### 5.3 Relatórios gerenciais — **M**
- [x] Serviços e peças mais vendidos, tempo médio no pátio, produtividade por técnico, taxa de aprovação de orçamentos, clientes inativos (com mensagem de reativação) e satisfação (NPS), com exportação CSV

---

## Fase 6 — Publicação e operação

Pode ser feita a qualquer momento para um ambiente de testes; a abertura para uso real segue a decisão de vocês.

### 6.1 Infraestrutura — **M**
- [x] Supabase: projetos `oficina-pro` (produção) e `oficina-pro-homolog` em São Paulo (plano grátis)
- [x] **Row Level Security** (migração 0008): cada consulta do usuário logado roda com o papel `app_usuario` e só vê a oficina dele; páginas públicas por token, webhook, cadastro inicial e convite usam `getDbSistema()` com filtro explícito. O dev avisa se uma tabela nova ficar sem policy
- [x] Deploy preparado para Cloudflare Workers (OpenNext, Hyperdrive sem cache, Images no lugar do sharp nos PDFs), com homologação e produção em `wrangler.jsonc`; passo a passo em `docs/deploy.md`
- [x] Plano Workers Paid assinado (o worker tem ~3,6 MiB; o grátis aceita 3 MiB)
- [x] `wrangler login`; buckets e tokens R2 por ambiente; segredos em `.env.secrets.*.json` (sobem no deploy)
- [x] Supabase, Hyperdrive (Session pooler 5432) e Clerk de produção com DNS, nos dois ambientes
- [ ] Trocar a chave do Clerk de desenvolvimento (exposta no chat); credenciais próprias do Google no Clerk de produção; dados de `NEXT_PUBLIC_LEGAL_*`
- [x] Homologação (hoficina.yagoduarte.com.br) testada: login, check-in com fotos no R2, OS, orçamento público e PDFs. Produção (oficina.yagoduarte.com.br) publicada em 20/11/2026

### 6.2 Segurança e LGPD — **M**
- [x] Log de auditoria (alteração de valores, descontos, cancelamentos, exclusões, estornos, notas, acessos e ações LGPD — tabela `auditoria` + tela `/configuracoes/auditoria`)
- [x] Limite de tentativas nas páginas públicas (orçamento, portal, pesquisa, documentos) e no upload (`/api/upload`, com validação de magic bytes), persistido no Postgres (`rate_limits`)
- [x] Política de privacidade e termos de uso (/privacidade, /termos; preencher `NEXT_PUBLIC_LEGAL_*` antes de publicar e revisar com advogado)
- [x] Exportar/apagar (ou anonimizar, quando há histórico fiscal/operacional) dados de um cliente a pedido (`/clientes/[id]/lgpd`); exportação completa da conta ao cancelar (`/configuracoes/exportar`)
- [x] Revisão de segurança completa (`docs/revisao-seguranca.md`: headers HTTP, CSP sandbox em `/arquivos`, magic bytes no upload, bloqueio do papel contador)

### 6.3 Operação — **P**
- [x] Backup diário automático e teste de restauração (`scripts/backup.mjs`, `scripts/testar-restauracao.mjs` e workflow `.github/workflows/operacao-diaria.yml`; configurar segredos no GitHub Actions)
- [x] Monitoramento de erros e alerta (`src/lib/monitoramento.ts`, `error.tsx`, `global-error.tsx`, `/api/erros` e healthcheck `/api/saude`; suporta `ALERTA_WEBHOOK_URL` e `SENTRY_DSN`)
- [x] Limpeza de fotos órfãs (check-ins abandonados > 24h no R2 via `POST /api/operacao/limpar-orfas`, sem tocar em `*/fiscal/*`)

### 6.4 Qualidade — contínuo
- [x] Testes automáticos dos fluxos críticos (`pnpm test` em `tests/fluxos-criticos.test.mts`: RLS multi-tenant, check-in/OS/orçamento, entrega+pagamento/estorno, emissão fiscal/XMLDSig/ZIP, segurança e LGPD)
- [x] Revisão de acessibilidade e desempenho no celular (link "Pular para o conteúdo", `touch-action: manipulation`, `font-display: swap`) e otimização do banco (pipelining em `postgresDoUsuario` + JOIN único em `getContexto()`)

---

## Decisões pendentes

| Decisão | Com quem | Bloqueia |
|---|---|---|
| Vendem peças ou só serviço? | Sócios + contador | 3.3 |
| Regime tributário do CNPJ | Contador | 1.1, Fase 3 |
| ~~Município usa NFS-e nacional?~~ | **Sim** (20/11/2026) | — |
| Certificado A1 do CNPJ | Sócios | Fase 3 (inclusive testes em homologação de NF-e) |
| ~~Provedor fiscal~~ | **Decidido (20/11/2026):** NFS-e emitida direto na NFS-e Nacional, sem provedor; Focus NFe só se houver NF-e/NFC-e de peças | — |
| Provedor de WhatsApp (API oficial) | Sócios | Envio automático (5.1 já funciona por wa.me) |
| Uso próprio ou vender para outras oficinas? | Sócios | Planos/assinatura (fora deste plano) |

### Provedor fiscal — situação pesquisada em 16/11/2026
- **Focus NFe** (recomendado): 30 dias de teste grátis em todos os planos e token de homologação. Plano **Start** R$ 119,90/mês com até 3 CNPJs e 100 documentos por CNPJ. Inclui NFS-e, NF-e e NFC-e.
- **PlugNotas (TecnoSpeed)**: sandbox público com token fixo, sem cadastro — bom para desenvolver, mas as respostas são simuladas. Preço sob consulta.
- **Nuvem Fiscal**: há relatos (fórum do Projeto ACBr, abr/2026) de desativação do serviço e migração para a ACBr API. Evitar até confirmar.

---

## Ordem de execução

1. **Fase 1** na ordem 1.1 → 1.2 → 1.3 → 1.5 → 1.6 → 1.4 → 1.7 → 1.8 → 1.9 (configurações e usuários primeiro porque alimentam todo o resto; PDFs depois dos dados que eles mostram)
2. **Fase 2** inteira (2.5 quando o gateway for escolhido)
3. **Fase 4** (o estoque alimenta os dados de produto que a NF-e precisa)
4. **Fase 3** assim que o contador responder — pode começar em paralelo em homologação
5. **Fase 5**
6. **Fase 6** — o ambiente de testes pode subir antes, para os sócios usarem e darem retorno durante as fases

Cada item vira um commit próprio, testado no navegador, com os dados de teste apagados ao final.
