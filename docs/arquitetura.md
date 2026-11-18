# Sistema de Gestão para Oficinas — Arquitetura

> Documento vivo. Versão inicial: 15/11/2026.

Sistema 100% web, responsivo e instalável no celular (PWA), para oficinas (mecânica, autoelétrica ou as duas).
Requisito central: **cada conta é uma oficina com um único CNPJ**, com vários usuários acessando os mesmos dados conforme o papel de cada um.

> **Mudança de 18/11/2026:** a primeira versão previa várias empresas (CNPJs) na mesma conta, com OS e financeiro separados por CNPJ.
> Os sócios decidiram simplificar: **um CNPJ por conta**. Se duas empresas quiserem usar o sistema, cada uma tem a sua conta, com os próprios usuários e dados.

---

## 1. Conceito central: Oficina (um CNPJ) → Usuários

```
Oficina (tenant / conta)  = um CNPJ (razão social, regime, IM/IE, certificado A1, financeiro)
 └── Usuários (membros com papel: dono, gerente, financeiro, atendente, técnico)
```

- Tudo pertence à oficina: clientes, veículos, agenda, check-in, OS, orçamentos, catálogo, técnicos, financeiro e notas.
- Não há divisão por tipo de serviço: a OS tem peças e serviços, sem marcar se são de mecânica ou elétrica.
- **Cada login pertence a uma única oficina.** Quem já participa de uma oficina não consegue aceitar convite de outra com o mesmo e-mail.
- Cada check-in abre **uma** OS.

### Cobrança
Cada cobrança cai na conta da oficina (um CNPJ), sem split.

### Papéis e permissões
Permissão = `usuário × papel` dentro da oficina. As regras ficam em `src/lib/permissoes.ts` e são conferidas no servidor.

| Papel | Acesso |
|---|---|
| Dono | Tudo, inclusive usuários e configurações |
| Gerente | Tudo, menos alterar ou remover donos |
| Financeiro | Financeiro, notas e consulta das OS; não abre OS nem lança itens |
| Atendente | Recepção, clientes, check-in, OS, orçamentos e entrega |
| Técnico | Check-in e andamento das OS; não vê valores |

---

## 2. Módulos

### 2.1 Base
1. **Autenticação (Clerk)**: login por e-mail/senha, Google e código por e-mail; 2FA; convites; gestão de sessões e dispositivos.
2. **Configurações da oficina**: dados do CNPJ, regime tributário, IM/IE, certificado A1, logo, textos padrão (garantia, termos).
3. **Usuários e permissões** + **log de auditoria** (alteração de valores, cancelamento de notas etc.).

### 2.2 Cadastros
4. **Clientes**: PF/PJ, CPF/CNPJ, WhatsApp, endereço com CEP automático, consentimento LGPD.
5. **Veículos**: placa (consulta automática por API), marca/modelo/ano, chassi, cor, km, motor, FIPE opcional. O histórico acompanha o **veículo**, mesmo que ele troque de dono.
6. **Catálogo de serviços**: descrição, tempo padrão, valor, código de serviço municipal (LC 116 – item 14.01).
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
12. **Orçamento**: peças e serviços, desconto, validade, versões; **link de aprovação** para o cliente (com fotos e checklist, aprovação item a item). Ao ser aprovado, vira OS.
13. **Ordem de Serviço**:
    - Kanban: Aguardando → Em diagnóstico → Aguardando aprovação → Aguardando peça → Em execução → Pronto → Entregue
    - Responsável por item, apontamento de horas
    - Fotos durante o serviço e da peça trocada
    - Serviços adicionais passam por nova aprovação via link
    - Check-out com fotos de saída, km e assinatura de retirada
    - Garantia por item (prazo e km)
14. **Histórico do veículo**: linha do tempo pesquisável pela placa.

### 2.4 Estoque e compras
15. **Estoque**: entrada por **importação do XML da NF-e do fornecedor**, baixa automática no faturamento, inventário, alerta de estoque mínimo.
16. **Compras**: pedidos a fornecedores e peças encomendadas para uma OS específica.

### 2.5 Financeiro
17. **Contas a receber**: geradas pela OS, parcelamento, PIX/cartão/dinheiro/boleto, baixa.
18. **Contas a pagar** (aluguel, luz, fornecedores), com categorias.
19. **Caixa diário**.
20. **Cobrança integrada**: PIX com QR Code e link de pagamento, baixa automática via webhook.
21. **Comissões** por mecânico.
22. **DRE simplificado e fluxo de caixa**.

### 2.6 Fiscal (via API)
23. **NFS-e** (serviços), no padrão nacional, obrigatório a partir de 2026.
24. **NF-e / NFC-e** (venda de peças), que exige inscrição estadual.
25. Cancelamento, carta de correção, XML/PDF e envio automático ao cliente.
26. Exportação mensal de XMLs para o contador.
27. Reforma tributária (CBS/IBS): transição a partir de 2026, absorvida pelo provedor da API fiscal.

Provedores: Focus NFe, PlugNotas (TecnoSpeed), Nuvem Fiscal, NFE.io. Todos aceitam vários CNPJs numa mesma conta de integração, o que permite atender várias oficinas.

### 2.7 Comunicação e extras
28. **WhatsApp**: orçamento, aprovação, veículo pronto, lembrete de revisão (km/data), pesquisa de satisfação (Meta Cloud API ou provedor como Z-API).
29. **Portal do cliente** (por link, sem login): status da OS, fotos, aprovação, pagamento.
30. **Dashboard**: pátio, OS por status, faturamento, ticket médio, serviços mais vendidos.
31. **Relatórios**: produtividade por mecânico, peças mais usadas, clientes inativos.

---

## 3. Modelo de dados (simplificado)

```
oficinas            (id, nome, razao_social, nome_fantasia, cnpj, regime, im, ie,
                     endereço, logo_key, textos padrão, certificado_ref)
membros             (id, oficina_id, clerk_user_id, nome, email, papel, ativo)
convites            (id, oficina_id, token, nome, papel, expira_em, aceito_em)

clientes            (id, oficina_id, ...)
veiculos            (id, oficina_id, cliente_id, placa, ...)
veiculo_transferencias (veiculo_id, de_cliente_id, para_cliente_id, ...)

checkins            (id, oficina_id, veiculo_id, km, combustivel, assinatura_key, checklist, ...)
checkin_fotos       (checkin_id, posicao, key)
agendamentos        (id, oficina_id, veiculo_id, tecnico_id, inicio, duracao_min, status, checkin_id)

ordens_servico      (id, oficina_id, numero, checkin_id, veiculo_id, cliente_id, status, desconto, entrega, ...)
os_itens            (id, os_id, tipo: peca|servico, descricao, qtd, valor, catalogo_item_id, recusado)
orcamentos          (id, oficina_id, os_id, token, itens (cópia), total, status, ...)
catalogo_itens      (id, oficina_id, tipo, codigo, descricao, valor, tempo_minutos, codigo_servico_municipal)

notas_fiscais       (id, oficina_id, os_id, tipo: nfse|nfe|nfce, status, chave, xml_key, pdf_key, api_ref)
contas_receber      (id, oficina_id, os_id, valor, vencimento, status)
contas_pagar        (id, oficina_id, fornecedor_id, ...)
estoque_movimentos  (id, oficina_id, produto_id, qtd, origem)
auditoria           (id, oficina_id, usuario_id, tabela, acao, antes, depois, data)
```

Regras:
- Toda tabela tem `oficina_id`. Não existe mais `empresa_id`: a oficina é o CNPJ.
- O isolamento é garantido **no banco** via Row Level Security (RLS), usando o `sub` do token do Clerk (detalhes na seção 4.2).
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
| Fiscal | PlugNotas (sandbox para testes) → Focus NFe | Um CNPJ por oficina |
| Pagamentos | Asaas ou Mercado Pago | PIX, boleto, cartão; uma conta por oficina (sem split) |
| PDF | `@react-pdf/renderer` | Roda em serverless e Workers (Puppeteer não roda em Workers) |
| Deploy | **Cloudflare Workers** (recomendado) ou **Vercel** | Ver 4.4 |
| Monitoramento | Sentry | |

### 4.1 Autenticação com Clerk
- O Clerk cuida **só do login** (e-mail/senha, Google, código por e-mail, sessões).
- **Decisão (16/11/2026): a oficina e os acessos ficam no nosso banco, sem Organizations do Clerk.**
  - `membros`: usuário (id do Clerk) + oficina + papel (dono, gerente, financeiro, atendente, técnico) + ativo.
  - `convites`: link de uso único (vale 7 dias), enviado pelo WhatsApp. A pessoa abre, entra ou cria a conta e aceita.
  - Motivos: nada a configurar no painel do Clerk, convite pelo WhatsApp (como a oficina já trabalha) e sem limite de membros por organização do Clerk.
- As permissões de cada papel ficam em `src/lib/permissoes.ts` e são conferidas no servidor em toda ação.
- Páginas públicas (orçamento do cliente e convite) usam **token aleatório** no link e não exigem login.
- **Cada login pertence a uma única oficina** (decisão de 18/11/2026). O aceite de convite recusa quem já é membro ativo de outra oficina.

### 4.2 Banco + RLS com Clerk
- O Supabase aceita o Clerk como **provedor de autenticação de terceiros**: o token de sessão do Clerk é enviado ao banco e as policies leem `auth.jwt()->>'sub'` (usuário) e buscam a oficina dele em `membros`.
- Policy-base: `oficina_id IN (select oficina_id from membros where clerk_user_id = auth.jwt()->>'sub' and ativo)`.
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

1. **MVP operacional**: login (Clerk) + usuários e papéis, oficina com um CNPJ, clientes, veículos, check-in com fotos (R2) e assinatura, checklist, orçamento com aprovação por link, OS em kanban, PDFs.
2. **Financeiro**: contas a receber e a pagar, caixa, PIX/link de pagamento, dashboard.
3. **Fiscal**: NFS-e + NF-e/NFC-e, envio automático, exportação para o contador.
4. **Crescimento**: estoque com XML, WhatsApp automatizado, lembretes de revisão, comissões, relatórios, portal do cliente.
5. **Produto SaaS** (se for vendido a outras oficinas): planos/assinatura, cadastro self-service (já existe), uma conta por CNPJ.

---

## 6. Pendências (definir com os sócios e o contador)

- [ ] Vendem peças ou só serviço? (NF-e/NFC-e e inscrição estadual)
- [ ] Regime tributário do CNPJ (MEI / Simples / Presumido)
- [ ] Município: confirmar adesão ao padrão nacional da NFS-e
- [x] ~~Vários CNPJs na mesma conta?~~ **Decidido (18/11/2026):** não. Um CNPJ por conta, vários usuários por conta, cada login em uma conta só.
- [ ] Uso próprio ou produto para outras oficinas?
- [ ] Escolha do provedor fiscal e do gateway de pagamento
