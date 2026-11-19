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

Objetivo: emitir as notas sem sair do sistema. **Bloqueada pelas respostas do contador** (ver Decisões pendentes).

### 3.1 Integração base — **G**
- [ ] Camada `ProvedorFiscal` (interface única) para poder trocar de provedor sem reescrever o sistema
- [ ] Implementação **PlugNotas** (sandbox público, sem cadastro) para desenvolver e testar o fluxo
- [ ] Implementação **Focus NFe** (homologação e depois produção) quando houver os certificados A1; o provedor é escolhido nas Configurações
- [ ] Cadastro da oficina (CNPJ) no provedor com o **certificado A1** (upload criptografado, aviso de vencimento)
- [ ] Ambientes: homologação para testes e produção
- [ ] Fila de emissão com tentativas automáticas e webhook de retorno
- [ ] Guardar XML e PDF de cada nota no R2 (obrigatório guardar por 5 anos)

### 3.2 NFS-e (serviços) — **G**
- [ ] Emitir a partir da OS entregue (itens de serviço)
- [ ] Código de serviço (LC 116, item 14.01), alíquota de ISS, retenções
- [ ] Padrão nacional ou do município (confirmar com o contador)
- [ ] Cancelamento e substituição dentro do prazo
- [ ] Envio automático por e-mail/WhatsApp ao cliente

### 3.3 NF-e / NFC-e (peças) — **G**, só se vendem peças
- [ ] NCM, CFOP, CST/CSOSN por produto (no catálogo de peças)
- [ ] NFC-e para consumidor final no balcão; NF-e para empresa/fora do estado
- [ ] Carta de correção, cancelamento, inutilização de numeração
- [ ] Contingência

### 3.4 Contador — **P**
- [ ] Exportação mensal (XMLs + relatório), em ZIP
- [ ] Acesso de leitura para o contador (papel próprio)

### 3.5 Reforma tributária — **P**
- [ ] Campos de IBS/CBS conforme as notas técnicas em vigor no momento da implementação

---

## Fase 4 — Estoque e compras

### 4.1 Estoque — **G**
- [ ] Entrada manual e **por XML da nota do fornecedor** (cadastra/atualiza peças e custo)
- [ ] Baixa automática ao usar a peça na OS; devolução ao remover item
- [ ] Estoque mínimo e lista de compras
- [ ] Inventário (contagem e ajuste com motivo)
- [ ] Custo médio e margem por peça

### 4.2 Compras e fornecedores — **M**
- [ ] Cadastro de fornecedores
- [ ] Pedido de compra; OS fica "Aguardando peça" com previsão
- [ ] Entrada da compra gera conta a pagar

---

## Fase 5 — Comunicação e crescimento

### 5.1 WhatsApp automático — **G**
- [ ] Escolher provedor (API oficial do WhatsApp/Meta ou intermediário) — custo por mensagem
- [ ] Mensagens: orçamento pronto, orçamento aprovado (para a oficina), carro pronto, lembrete de agendamento, pós-venda
- [ ] Modelos de mensagem editáveis; registro do que foi enviado

### 5.2 Relacionamento — **M**
- [ ] Lembrete de revisão por km/tempo (ex.: troca de óleo a cada 6 meses ou 10.000 km)
- [ ] Pesquisa de satisfação após a entrega
- [ ] Portal do cliente (link): histórico do veículo, orçamentos, OS e notas

### 5.3 Relatórios gerenciais — **M**
- [ ] Serviços mais vendidos, tempo médio no pátio, produtividade por técnico, taxa de aprovação de orçamentos, clientes inativos

---

## Fase 6 — Publicação e operação

Pode ser feita a qualquer momento para um ambiente de testes; a abertura para uso real segue a decisão de vocês.

### 6.1 Infraestrutura — **M**
- [ ] Banco de produção (Supabase) com migrações automáticas
- [ ] **Row Level Security** no banco (isolamento por oficina, conforme arquitetura §4.2)
- [ ] Clerk em modo produção com domínio próprio (gerar novas chaves; a secret atual foi exposta no chat e deve ser trocada)
- [ ] Deploy (Cloudflare ou Vercel), domínio e HTTPS; `APP_URL` configurado
- [ ] Bucket R2 de produção separado do de testes
- [ ] Ambiente de **homologação** (cópia do sistema para testar antes de liberar mudanças)

### 6.2 Segurança e LGPD — **M**
- [ ] Log de auditoria (alteração de valores, cancelamentos, exclusões, notas)
- [ ] Limite de tentativas nas páginas públicas (orçamento) e no upload
- [x] Política de privacidade e termos de uso (/privacidade, /termos; preencher `NEXT_PUBLIC_LEGAL_*` antes de publicar e revisar com advogado)
- [ ] Exportar/apagar dados de um cliente a pedido; exportação da conta ao cancelar (prometida nos termos: 30 dias)
- [ ] Revisão de segurança completa antes de abrir

### 6.3 Operação — **P**
- [ ] Backup diário automático e teste de restauração
- [ ] Monitoramento de erros e alerta
- [ ] Limpeza de fotos órfãs (check-ins abandonados)

### 6.4 Qualidade — contínuo
- [ ] Testes automáticos dos fluxos críticos (check-in, orçamento, entrega + pagamento, emissão de nota)
- [ ] Revisão de acessibilidade e desempenho no celular

---

## Decisões pendentes

| Decisão | Com quem | Bloqueia |
|---|---|---|
| Vendem peças ou só serviço? | Sócios + contador | 3.3, 4.1 |
| Regime tributário do CNPJ | Contador | 1.1, Fase 3 |
| Município usa NFS-e nacional? | Contador / prefeitura | 3.2 |
| Certificado A1 do CNPJ | Sócios | Fase 3 (inclusive testes em homologação de NF-e) |
| Estoque separado ou compartilhado? | Sócios | 4.1 |
| ~~Provedor fiscal~~ | **Decidido:** desenvolver no sandbox do PlugNotas; produção na Focus NFe quando houver os certificados | — |
| Provedor de WhatsApp | Sócios | 5.1 |
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
