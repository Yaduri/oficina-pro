# Sistema de Gestão para Oficinas Mecânicas e Autoelétricas — Arquitetura

> Documento vivo. Versão inicial: 15/11/2026.

Sistema 100% web, responsivo e instalável no celular (PWA), para oficinas mecânicas e autoelétricas.
Requisito central: **várias empresas (CNPJs) no mesmo espaço de trabalho**, com operação compartilhada e **financeiro/fiscal separados por CNPJ**.

Caso de uso de origem: uma autoelétrica e uma mecânica que dividem o mesmo espaço e o mesmo sistema, mas cada uma emite nota no próprio CNPJ.

---

## 1. Conceito central: Oficina → Empresas → Usuários

```
Oficina (tenant / espaço de trabalho)        = Organization no Clerk
 ├── Empresa A – Mecânica     (CNPJ A, certificado A1 próprio, financeiro próprio)
 ├── Empresa B – Autoelétrica (CNPJ B, certificado A1 próprio, financeiro próprio)
 └── Usuários (papel + acesso a uma ou mais empresas)
```

### Compartilhado (nível Oficina)
- Clientes e veículos
- Agenda, pátio e kanban de OS
- Check-in com fotos, checklist e assinatura
- Histórico do veículo

### Separado (nível Empresa / CNPJ)
- Itens de orçamento e OS (**cada item pertence a um CNPJ**)
- Notas fiscais (NFS-e, NF-e, NFC-e)
- Contas a receber e a pagar, caixa
- Estoque de peças (recomendado separado)
- Comissões e relatórios financeiros

### OS por empresa (decisão dos sócios)
**Regra geral: cada OS pertence a uma empresa.** Serviço de mecânica gera OS da Mecânica; serviço elétrico gera OS da Elétrica.

- A OS tem `empresa_id`. Todos os itens dela são, por padrão, dessa empresa.
- **Um mesmo check-in pode gerar mais de uma OS.** Se o carro chegou com problema mecânico e elétrico, a recepção é feita uma vez só (fotos, checklist, assinatura) e dela saem duas OS, uma por empresa, ligadas ao mesmo check-in. Assim o cliente não assina nada duas vezes e as fotos de entrada servem para as duas.
- Uma OS pode ser transferida para a outra empresa enquanto ainda não foi faturada (ex.: o diagnóstico mostrou que o problema era elétrico, não mecânico).

### OS mista (exceção)
Quando, eventualmente, mecânica e elétrica ficarem na mesma OS:
1. Cada item tem o campo **empresa responsável** (ex.: correia → Mecânica; alternador → Elétrica).
2. No faturamento o sistema separa automaticamente:
   - NFS-e + NF-e/NFC-e da Mecânica (somente itens dela)
   - NFS-e + NF-e/NFC-e da Elétrica (somente itens dela)
   - **Duas cobranças**, uma por CNPJ (dois PIX/links), cada uma com sua conta a receber.

### Cobrança (decisão dos sócios)
**Sem split de pagamento.** Cada cobrança pertence a um único CNPJ e cai na conta daquela empresa. Por isso cada empresa pode ter **sua própria conta no gateway**, inclusive em gateways diferentes, se preferirem.

### Papéis e permissões
Permissão = `usuário × empresa × papel`. Seletor no topo: **Mecânica | Elétrica | Visão geral**.

| Papel | Acesso |
|---|---|
| Dono/Sócio | Tudo da(s) empresa(s) dele; operacional compartilhado; financeiro do outro CNPJ só se liberado |
| Gerente/Atendente | Recepção, orçamento, OS; sem financeiro |
| Mecânico/Eletricista | Só as OS atribuídas a ele: checklist, fotos, apontamento de horas |
| Financeiro | Contas, notas e conciliação das empresas liberadas |

---

## 2. Módulos

### 2.1 Base
1. **Autenticação (Clerk)**: login por e-mail/senha, Google e código por e-mail; 2FA; convites; gestão de sessões e dispositivos.
2. **Configurações da oficina e das empresas**: dados de cada CNPJ, regime tributário, IM/IE, certificado A1 por empresa, logo, textos padrão (garantia, termos).
3. **Usuários e permissões** + **log de auditoria** (alteração de valores, cancelamento de notas etc.).

### 2.2 Cadastros
4. **Clientes**: PF/PJ, CPF/CNPJ, WhatsApp, endereço com CEP automático, consentimento LGPD.
5. **Veículos**: placa (consulta automática por API), marca/modelo/ano, chassi, cor, km, motor, FIPE opcional. O histórico acompanha o **veículo**, mesmo que ele troque de dono.
6. **Catálogo de serviços**: descrição, tempo padrão, valor, empresa responsável, código de serviço municipal (LC 116 – item 14.01).
7. **Peças/Produtos**: código, NCM, CFOP, custo, preço, fornecedor, estoque mínimo.
8. **Fornecedores**.

### 2.3 Operacional
9. **Agenda**: por box/mecânico, lembrete por WhatsApp.
10. **Recepção / Check-in (feito no celular)**:
    - Fotos de chegada (frente, traseira, laterais, painel com km/combustível, avarias), **comprimidas no celular antes do upload**
    - Marcação de avarias em diagrama do veículo
    - Km, nível de combustível, objetos deixados no carro, relato do cliente
    - **Assinatura do cliente na tela** e PDF do termo de entrada enviado por WhatsApp
11. **Checklist**: modelos configuráveis (elétrico, revisão mecânica…), itens OK / Atenção / Crítico com foto e observação. Item crítico vira item de orçamento com um toque.
12. **Orçamento**: peças e serviços por empresa, desconto, validade, versões; **link de aprovação** para o cliente (com fotos e checklist, aprovação item a item). Ao ser aprovado, vira OS.
13. **Ordem de Serviço**:
    - Kanban: Aguardando → Em diagnóstico → Aguardando aprovação → Aguardando peça → Em execução → Pronto → Entregue
    - Responsável por item, apontamento de horas
    - Fotos durante o serviço e da peça trocada
    - Serviços adicionais passam por nova aprovação via link
    - Check-out com fotos de saída, km e assinatura de retirada
    - Garantia por item (prazo e km)
14. **Histórico do veículo**: linha do tempo pesquisável pela placa.

### 2.4 Estoque e compras
15. **Estoque** por empresa: entrada por **importação do XML da NF-e do fornecedor**, baixa automática no faturamento, inventário, alerta de estoque mínimo.
16. **Compras**: pedidos a fornecedores e peças encomendadas para uma OS específica.

### 2.5 Financeiro (sempre por CNPJ)
17. **Contas a receber**: geradas pela OS, parcelamento, PIX/cartão/dinheiro/boleto, baixa.
18. **Contas a pagar** e **despesas rateadas** entre as empresas (aluguel, luz, internet divididos por percentual configurável).
19. **Caixa diário** por empresa.
20. **Cobrança integrada**: PIX com QR Code e link de pagamento, baixa automática via webhook.
21. **Comissões** por mecânico.
22. **DRE simplificado e fluxo de caixa** por empresa, com visão consolidada para quem tiver permissão.

### 2.6 Fiscal (por CNPJ, via API)
23. **NFS-e** (serviços), no padrão nacional, obrigatório a partir de 2026.
24. **NF-e / NFC-e** (venda de peças), que exige inscrição estadual.
25. Cancelamento, carta de correção, XML/PDF e envio automático ao cliente.
26. Exportação mensal de XMLs para o contador.
27. Reforma tributária (CBS/IBS): transição a partir de 2026, absorvida pelo provedor da API fiscal.

Provedores com suporte a **múltiplos CNPJs na mesma conta**: Focus NFe, PlugNotas (TecnoSpeed), Nuvem Fiscal, NFE.io.

### 2.7 Comunicação e extras
28. **WhatsApp**: orçamento, aprovação, veículo pronto, lembrete de revisão (km/data), pesquisa de satisfação (Meta Cloud API ou provedor como Z-API).
29. **Portal do cliente** (por link, sem login): status da OS, fotos, aprovação, pagamento.
30. **Dashboard**: pátio, OS por status, faturamento por empresa, ticket médio, serviços mais vendidos.
31. **Relatórios**: produtividade por mecânico, peças mais usadas, clientes inativos.

---

## 3. Modelo de dados (simplificado)

```
oficinas            (id, clerk_org_id, nome, plano)
empresas            (id, oficina_id, cnpj, razao_social, regime, im, ie,
                     certificado_ref, tipo: mecanica|eletrica)
usuarios            (id, clerk_user_id, nome, email)
usuario_acessos     (usuario_id, oficina_id, empresa_id NULL = todas, papel)

clientes            (id, oficina_id, ...)
veiculos            (id, oficina_id, cliente_id, placa, ...)

checkins            (id, oficina_id, veiculo_id, km, combustivel, assinatura_key, ...)
                     -- um check-in pode gerar várias OS (uma por empresa)
arquivos            (id, oficina_id, entidade, entidade_id, r2_key, tipo, tamanho, criado_por)
checklist_modelos / checklist_respostas

orcamentos          (id, oficina_id, empresa_id, checkin_id, veiculo_id, cliente_id,
                     status, versao, token_aprovacao)
ordens_servico      (id, oficina_id, empresa_id  ◄── empresa dona da OS,
                     checkin_id, orcamento_id, status, ...)
os_itens            (id, os_id, empresa_id  ◄── padrão = empresa da OS; difere só em OS mista,
                     tipo: peca|servico, produto_id, qtd, valor, mecanico_id, aprovado)

notas_fiscais       (id, empresa_id, os_id, tipo: nfse|nfe|nfce, status, chave,
                     xml_key, pdf_key, api_ref)
contas_receber      (id, empresa_id, os_id, valor, vencimento, status)
contas_pagar        (id, empresa_id, fornecedor_id, ...)
rateios             (despesa_id, empresa_id, percentual)
estoque_movimentos  (id, empresa_id, produto_id, qtd, origem)
auditoria           (id, oficina_id, usuario_id, tabela, acao, antes, depois, data)
```

Regras:
- Toda tabela tem `oficina_id`; as tabelas financeiras e fiscais têm também `empresa_id`.
- O isolamento é garantido **no banco** via Row Level Security (RLS), usando o `org_id` e o `sub` do token do Clerk (detalhes na seção 4.2).
- Arquivos guardam apenas a **chave do objeto no R2**, nunca uma URL pública.

---

## 4. Tecnologia

| Camada | Escolha | Observações |
|---|---|---|
| Frontend + backend | **Next.js (App Router) + TypeScript** | Server Actions / Route Handlers |
| UI | Tailwind CSS + shadcn/ui | Mobile-first |
| App no celular | **PWA** | Câmera via `<input capture>`, instalável, sem lojas |
| Autenticação | **Clerk** | Organizations = oficinas; componentes prontos; middleware Next.js |
| Banco de dados | **PostgreSQL (Supabase, só o banco)** | RLS com o JWT do Clerk via integração *third-party auth* |
| ORM / migrations | Drizzle | Leve e compatível com edge/Workers |
| Arquivos (fotos, PDFs, XMLs) | **Cloudflare R2** | Plano gratuito generoso e **sem custo de saída de dados** |
| Jobs / filas | Inngest (ou Cloudflare Queues) | Emissão de notas, webhooks, WhatsApp, retentativas |
| Fiscal | Focus NFe / PlugNotas / Nuvem Fiscal | Multi-CNPJ |
| Pagamentos | Asaas ou Mercado Pago | PIX, boleto, cartão; uma conta por CNPJ (sem split) |
| PDF | `@react-pdf/renderer` | Roda em serverless e Workers (Puppeteer não roda em Workers) |
| Deploy | **Cloudflare Workers** (recomendado) ou **Vercel** | Ver 4.4 |
| Monitoramento | Sentry | |

### 4.1 Autenticação com Clerk
- **Clerk Organization = Oficina.** Os membros da organização são os usuários da oficina.
- O papel geral (`org:admin`, `org:member`) vem do Clerk. O **acesso por empresa (CNPJ)** fica na tabela `usuario_acessos` do nosso banco, porque é regra de negócio e precisa participar do RLS e dos relatórios.
- Opcional: replicar os IDs das empresas permitidas em `publicMetadata` da membership para checagens rápidas na UI (a fonte da verdade continua sendo o banco).
- **Webhooks do Clerk** (`user.created`, `organizationMembership.created/deleted`…) sincronizam `usuarios` e `usuario_acessos`.
- `clerkMiddleware()` protege as rotas; as páginas públicas (link de aprovação de orçamento e portal do cliente) ficam fora do middleware e são acessadas por **token assinado**.
- Fluxo de cadastro: o dono cria a conta e a organização (oficina), cadastra as empresas e os CNPJs e convida o sócio e a equipe.

### 4.2 Banco + RLS com Clerk
- O Supabase aceita o Clerk como **provedor de autenticação de terceiros**: o token de sessão do Clerk é enviado ao banco e as policies leem `auth.jwt()->>'sub'` (usuário) e `auth.jwt()->>'org_id'` (oficina).
- Policy-base: `oficina_id = (select id from oficinas where clerk_org_id = auth.jwt()->>'org_id')`.
- Tabelas financeiras/fiscais: além disso, `empresa_id IN (empresas permitidas ao usuário em usuario_acessos)`.
- Alternativa sem Supabase: **Neon** (Postgres serverless, plano gratuito) com filtros aplicados na camada de dados. Funciona, mas perde a garantia do RLS: só faz sentido se a ideia for sair totalmente do Supabase.

### 4.3 Arquivos no Cloudflare R2
Plano gratuito (mensal): **10 GB armazenados, 1 milhão de operações de escrita (classe A), 10 milhões de leituras (classe B) e saída de dados gratuita**. Para fotos de veículos, que são muito visualizadas (cliente, link de aprovação, histórico), o egress zero é o fator decisivo.

Fluxo de upload:
1. O celular comprime a foto (ex.: `browser-image-compression`, ~1600px, WebP/JPEG ~300 KB).
2. O app pede ao servidor uma **URL pré-assinada (PUT)** para `oficinas/{oficina_id}/checkins/{id}/{uuid}.webp`.
3. Upload direto do navegador para o R2 (sem passar pelo servidor).
4. O servidor registra a linha em `arquivos`.
5. Visualização por **URL pré-assinada (GET) de curta duração**. O bucket fica privado.

Estimativa: ~15 fotos por veículo × 300 KB ≈ 4,5 MB por atendimento, ou seja, **~2.000 atendimentos cabem nos 10 GB gratuitos**. Acima disso o custo é baixo (centavos de dólar por GB/mês).

Alternativas, se necessário: Backblaze B2 (10 GB grátis, egress gratuito via Cloudflare) e UploadThing (mais simples, mas com plano gratuito menor).

### 4.4 Deploy: Cloudflare ou Vercel

| | Cloudflare Workers | Vercel |
|---|---|---|
| Next.js | Via adaptador **OpenNext** (`@opennextjs/cloudflare`) | Nativo, zero configuração |
| Plano gratuito | Permite uso comercial | Hobby **não permite uso comercial**; produção exige plano Pro |
| Custo em produção | Muito baixo (plano pago de entrada barato) | Pro por membro/mês |
| Integração com R2 | Binding direto, sem chaves | Via API S3 com chaves |
| Limitações | Algumas APIs Node indisponíveis (ex.: Puppeteer) | Praticamente nenhuma |

**Recomendação:** Cloudflare Workers + R2 em produção, pelo custo, pela permissão de uso comercial no plano gratuito e pela integração com o R2. A Vercel pode servir para *previews* durante o desenvolvimento. As escolhas de PDF (`react-pdf`) e ORM (Drizzle) já consideram as restrições do Workers.

---

## 5. Fases

1. **MVP operacional**: Clerk + organizações, oficina com 2 empresas, clientes, veículos, check-in com fotos (R2) e assinatura, checklist, orçamento com aprovação por link, OS em kanban, PDFs.
2. **Financeiro**: contas a receber e a pagar por CNPJ, caixa, rateio, PIX/link de pagamento, dashboard.
3. **Fiscal**: NFS-e + NF-e/NFC-e multi-CNPJ, envio automático, exportação para o contador.
4. **Crescimento**: estoque com XML, WhatsApp automatizado, lembretes de revisão, comissões, relatórios, portal do cliente.
5. **Produto SaaS** (se for vendido a outras oficinas): planos/assinatura, onboarding self-service, oficinas com 1..N CNPJs.

---

## 6. Pendências (definir com os sócios e o contador)

- [ ] Vendem peças ou só serviço? (NF-e/NFC-e e inscrição estadual)
- [ ] Regime tributário de cada CNPJ (MEI / Simples / Presumido)
- [ ] Município: confirmar adesão ao padrão nacional da NFS-e
- [x] ~~Cobrança: duas cobranças ou uma com split?~~ **Decidido:** OS separadas por empresa; em OS mista, duas cobranças (uma por CNPJ). Sem split.
- [ ] Estoque separado ou compartilhado? (recomendado: separado)
- [ ] Uso próprio ou produto para outras oficinas?
- [ ] Escolha do provedor fiscal e do gateway de pagamento
