import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Modelo de dados — ver docs/arquitetura.md, seção 3.
 * Regra: toda tabela tem oficina_id. Cada oficina é uma empresa com um único CNPJ.
 */

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();

/** Colunas de endereço (CEP só com dígitos, UF com 2 letras) */
const endereco = () => ({
  cep: text("cep"),
  logradouro: text("logradouro"),
  numero: text("numero"),
  complemento: text("complemento"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  uf: text("uf"),
});

export const papel = pgEnum("papel", ["dono", "gerente", "atendente", "tecnico", "financeiro"]);
export const tipoPessoa = pgEnum("tipo_pessoa", ["pf", "pj"]);
export const regimeTributario = pgEnum("regime_tributario", ["mei", "simples", "presumido", "real"]);
export const statusOS = pgEnum("status_os", [
  "diagnostico",
  "aguardando_aprovacao",
  "aguardando_peca",
  "em_execucao",
  "pronto",
  "entregue",
  "cancelada",
]);
export const tipoItem = pgEnum("tipo_item", ["peca", "servico"]);
export const statusOrcamento = pgEnum("status_orcamento", ["pendente", "aprovado", "parcial", "recusado", "substituido"]);

/* ---------- Oficina (tenant = um CNPJ) ---------- */

export const oficinas = pgTable("oficinas", {
  id: id(),
  /** Organization do Clerk; em contas sem organização usa "user_<id>" */
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  /** Nome usado no sistema e nos documentos quando não há nome fantasia */
  nome: text("nome").notNull(),
  razaoSocial: text("razao_social"),
  nomeFantasia: text("nome_fantasia"),
  /** Só caracteres 0-9/A-Z (aceita o CNPJ alfanumérico) */
  cnpj: text("cnpj"),
  regime: regimeTributario("regime"),
  inscricaoMunicipal: text("inscricao_municipal"),
  inscricaoEstadual: text("inscricao_estadual"),
  telefone: text("telefone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  ...endereco(),
  /** Chave da logo no armazenamento */
  logoKey: text("logo_key"),
  /** Textos padrão usados no orçamento, termo de entrada e PDFs */
  textoGarantia: text("texto_garantia"),
  textoTermoCheckin: text("texto_termo_checkin"),
  obsOrcamento: text("obs_orcamento"),
  validadeOrcamentoDias: integer("validade_orcamento_dias").notNull().default(15),
  /** Garantia padrão sugerida na entrega do veículo */
  garantiaDias: integer("garantia_dias").notNull().default(90),
  /** Taxas da maquininha (%), sugeridas ao receber por cartão */
  taxasCartao: jsonb("taxas_cartao").$type<{ debito: number; credito: number; creditoParcelado: number }>(),
  criadoEm: criadoEm(),
});

/**
 * Usuário (login do Clerk) que faz parte da oficina, com um papel.
 */
export const membros = pgTable(
  "membros",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    /** Cópia do nome/e-mail do Clerk para exibir na lista */
    nome: text("nome"),
    email: text("email"),
    papel: papel("papel").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    /** Última vez que abriu o sino: o que é mais novo conta como não lido */
    notificacoesLidasEm: timestamp("notificacoes_lidas_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("membros_oficina_usuario_uq").on(t.oficinaId, t.clerkUserId), index("membros_usuario_idx").on(t.clerkUserId)],
);

/** Convite por link (enviado pelo WhatsApp). Quem abre, entra/cria a conta e aceita. */
export const convites = pgTable(
  "convites",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    /** Para quem é (só para identificar na lista) */
    nome: text("nome").notNull(),
    papel: papel("papel").notNull(),
    criadoPor: text("criado_por").notNull(),
    criadoEm: criadoEm(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    aceitoEm: timestamp("aceito_em", { withTimezone: true }),
    aceitoPor: text("aceito_por"),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
  },
  (t) => [index("convites_oficina_idx").on(t.oficinaId)],
);

/** Mecânicos/eletricistas — podem não ter login. */
export const tecnicos = pgTable("tecnicos", {
  id: id(),
  oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  /** Comissão: % sobre serviços, % sobre peças e/ou valor fixo por OS entregue (nulos = sem comissão) */
  comissaoServicoPct: numeric("comissao_servico_pct", { precision: 5, scale: 2 }),
  comissaoPecaPct: numeric("comissao_peca_pct", { precision: 5, scale: 2 }),
  comissaoFixaOs: numeric("comissao_fixa_os", { precision: 12, scale: 2 }),
  criadoEm: criadoEm(),
});

/* ---------- Cadastros ---------- */

export const clientes = pgTable(
  "clientes",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    tipoPessoa: tipoPessoa("tipo_pessoa").notNull().default("pf"),
    nome: text("nome").notNull(),
    documento: text("documento"),
    telefone: text("telefone"),
    email: text("email"),
    ...endereco(),
    /** Só dia e mês importam (lembrete de aniversário) */
    nascimento: date("nascimento"),
    /** LGPD: consentimento para receber mensagens por WhatsApp */
    aceitaWhatsapp: boolean("aceita_whatsapp").notNull().default(false),
    aceitaWhatsappEm: timestamp("aceita_whatsapp_em", { withTimezone: true }),
    observacoes: text("observacoes"),
    arquivadoEm: timestamp("arquivado_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [index("clientes_oficina_idx").on(t.oficinaId)],
);

export const veiculos = pgTable(
  "veiculos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    placa: text("placa").notNull(),
    marca: text("marca"),
    modelo: text("modelo").notNull(),
    ano: integer("ano"),
    cor: text("cor"),
    km: integer("km"),
    chassi: text("chassi"),
    motor: text("motor"),
    combustivel: text("combustivel"),
    arquivadoEm: timestamp("arquivado_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("veiculos_placa_oficina_uq").on(t.oficinaId, t.placa)],
);

/** Troca de dono do veículo (as OS antigas continuam com o cliente da época) */
export const veiculoTransferencias = pgTable(
  "veiculo_transferencias",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    veiculoId: uuid("veiculo_id").notNull().references(() => veiculos.id, { onDelete: "cascade" }),
    deClienteId: uuid("de_cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    paraClienteId: uuid("para_cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    /** Nomes guardados para o histórico sobreviver à exclusão do cliente */
    deNome: text("de_nome"),
    paraNome: text("para_nome"),
    por: text("por"),
    criadoEm: criadoEm(),
  },
  (t) => [index("veiculo_transf_veiculo_idx").on(t.veiculoId)],
);

/** Catálogo de serviços e peças (base do estoque na Fase 4) */
export const catalogoItens = pgTable(
  "catalogo_itens",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    tipo: tipoItem("tipo").notNull(),
    codigo: text("codigo"),
    descricao: text("descricao").notNull(),
    valor: numeric("valor", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Serviço: tempo padrão em minutos */
    tempoMinutos: integer("tempo_minutos"),
    /** Serviço: código da lista de serviços municipal (NFS-e) */
    codigoServicoMunicipal: text("codigo_servico_municipal"),
    /* Peça: estoque (Fase 4). Saldo e custo médio só mudam por movimentos (lib/estoque.ts) */
    controlaEstoque: boolean("controla_estoque").notNull().default(false),
    unidade: text("unidade").notNull().default("UN"),
    estoqueAtual: numeric("estoque_atual", { precision: 12, scale: 3 }).notNull().default("0"),
    estoqueMinimo: numeric("estoque_minimo", { precision: 12, scale: 3 }).notNull().default("0"),
    custoMedio: numeric("custo_medio", { precision: 12, scale: 4 }).notNull().default("0"),
    /** Onde fica guardada (prateleira, gaveta) */
    localizacao: text("localizacao"),
    marca: text("marca"),
    /** Código de barras (GTIN/EAN) */
    gtin: text("gtin"),
    /** NCM (8 dígitos), usado na NF-e de peças (Fase 3) */
    ncm: text("ncm"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [index("catalogo_oficina_idx").on(t.oficinaId, t.tipo)],
);

/* ---------- Operacional ---------- */

/** Itens que a oficina confere na recepção do veículo (configuráveis) */
export const checklistItens = pgTable(
  "checklist_itens",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    grupo: text("grupo").notNull(),
    descricao: text("descricao").notNull(),
    ordem: integer("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [index("checklist_oficina_idx").on(t.oficinaId)],
);

/** ok = conferido, problema = com defeito/avaria, nao_tem = item ausente; null = não verificado */
export type EstadoChecklist = "ok" | "problema" | "nao_tem";
export type ItemChecklistRegistrado = {
  grupo: string;
  descricao: string;
  estado: EstadoChecklist | null;
  obs: string | null;
};

/**
 * Recepção do veículo (feita no celular). Cada check-in abre uma OS.
 */
export const checkins = pgTable(
  "checkins",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    veiculoId: uuid("veiculo_id").notNull().references(() => veiculos.id),
    clienteId: uuid("cliente_id").references(() => clientes.id),
    km: integer("km"),
    /** Nível de combustível em oitavos (0 = reserva, 8 = cheio) */
    combustivel: integer("combustivel"),
    relato: text("relato").notNull(),
    avarias: text("avarias"),
    objetos: text("objetos"),
    /** Chave do arquivo da assinatura do cliente no armazenamento */
    assinaturaKey: text("assinatura_key"),
    /** Texto do termo que o cliente viu ao assinar (cópia; mudanças nas Configurações não alteram) */
    termo: text("termo"),
    /** Checklist preenchido (cópia dos itens no momento do check-in) */
    checklist: jsonb("checklist").$type<ItemChecklistRegistrado[]>(),
    criadoPor: text("criado_por").notNull(),
    /** Chave gerada no celular: o mesmo envio repetido (internet ruim) não cria outro check-in */
    chaveEnvio: text("chave_envio"),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("checkins_oficina_idx").on(t.oficinaId, t.criadoEm),
    uniqueIndex("checkins_chave_envio_uq").on(t.oficinaId, t.chaveEnvio),
  ],
);

export const checkinFotos = pgTable(
  "checkin_fotos",
  {
    id: id(),
    checkinId: uuid("checkin_id").notNull().references(() => checkins.id, { onDelete: "cascade" }),
    /** frente | traseira | esquerda | direita | painel | avaria | outra */
    posicao: text("posicao").notNull(),
    key: text("key").notNull(),
    ordem: integer("ordem").notNull().default(0),
    criadoEm: criadoEm(),
  },
  (t) => [index("checkin_fotos_checkin_idx").on(t.checkinId)],
);

export const ordensServico = pgTable(
  "ordens_servico",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    checkinId: uuid("checkin_id").references(() => checkins.id, { onDelete: "set null" }),
    veiculoId: uuid("veiculo_id").notNull().references(() => veiculos.id),
    clienteId: uuid("cliente_id").references(() => clientes.id),
    responsavelId: uuid("responsavel_id").references(() => tecnicos.id, { onDelete: "set null" }),
    status: statusOS("status").notNull().default("diagnostico"),
    /** Relato do cliente / defeito */
    descricao: text("descricao").notNull(),
    kmEntrada: integer("km_entrada"),
    entradaEm: timestamp("entrada_em", { withTimezone: true }).notNull().defaultNow(),
    aprovacaoEnviadaEm: timestamp("aprovacao_enviada_em", { withTimezone: true }),
    previsaoPecaEm: timestamp("previsao_peca_em", { withTimezone: true }),
    clienteAvisadoEm: timestamp("cliente_avisado_em", { withTimezone: true }),
    entregueEm: timestamp("entregue_em", { withTimezone: true }),
    previsaoEntregaEm: timestamp("previsao_entrega_em", { withTimezone: true }),
    /** Desconto: percentual (sobre os itens não recusados) ou valor fixo */
    descontoPercentual: numeric("desconto_percentual", { precision: 5, scale: 2 }),
    descontoValor: numeric("desconto_valor", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Entrega do veículo */
    kmSaida: integer("km_saida"),
    garantiaAte: timestamp("garantia_ate", { withTimezone: true }),
    entregaObs: text("entrega_obs"),
    entregaAssinaturaKey: text("entrega_assinatura_key"),
    entreguePor: text("entregue_por"),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("os_numero_oficina_uq").on(t.oficinaId, t.numero),
    index("os_status_idx").on(t.oficinaId, t.status),
  ],
);

export const osItens = pgTable(
  "os_itens",
  {
    id: id(),
    osId: uuid("os_id").notNull().references(() => ordensServico.id, { onDelete: "cascade" }),
    tipo: tipoItem("tipo").notNull(),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 10, scale: 2 }).notNull().default("1"),
    valorUnitario: numeric("valor_unitario", { precision: 12, scale: 2 }).notNull(),
    /** Item escolhido do catálogo (o texto e o preço continuam editáveis) */
    catalogoItemId: uuid("catalogo_item_id").references(() => catalogoItens.id, { onDelete: "set null" }),
    concluido: boolean("concluido").notNull().default(false),
    /** Recusado pelo cliente no orçamento: fica na OS riscado e fora do total */
    recusado: boolean("recusado").notNull().default(false),
    criadoEm: criadoEm(),
  },
  (t) => [index("os_itens_os_idx").on(t.osId)],
);

/** Cópia dos itens no momento do envio — o cliente aprova exatamente o que viu. */
export type ItemOrcamento = {
  id: string;
  tipo: "peca" | "servico";
  descricao: string;
  quantidade: number;
  valorUnitario: number;
};

/**
 * Orçamento enviado ao cliente por link (sem login). Cada envio gera um novo registro;
 * o anterior pendente vira "substituido".
 */
export const orcamentos = pgTable(
  "orcamentos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    osId: uuid("os_id").notNull().references(() => ordensServico.id, { onDelete: "cascade" }),
    /** Segredo do link público /orcamento/<token> */
    token: text("token").notNull().unique(),
    itens: jsonb("itens").$type<ItemOrcamento[]>().notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    observacao: text("observacao"),
    /** Desconto em R$ sobre o total dos itens enviados */
    desconto: numeric("desconto", { precision: 12, scale: 2 }).notNull().default("0"),
    validoAte: timestamp("valido_ate", { withTimezone: true }).notNull(),
    status: statusOrcamento("status").notNull().default("pendente"),
    enviadoPor: text("enviado_por").notNull(),
    criadoEm: criadoEm(),
    /** Visualizado pelo cliente pela primeira vez */
    vistoEm: timestamp("visto_em", { withTimezone: true }),
    respondidoEm: timestamp("respondido_em", { withTimezone: true }),
    respostaNome: text("resposta_nome"),
    respostaComentario: text("resposta_comentario"),
    itensAprovados: jsonb("itens_aprovados").$type<string[]>(),
  },
  (t) => [index("orcamentos_os_idx").on(t.osId), index("orcamentos_oficina_idx").on(t.oficinaId, t.criadoEm)],
);

/**
 * Link público de um documento em PDF (OS ou termo de entrada) para mandar ao cliente
 * pelo WhatsApp. O token é o segredo; um link por documento, reaproveitado.
 */
export const linksDocumento = pgTable(
  "links_documento",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    tipo: text("tipo").$type<"os" | "termo">().notNull(),
    /** id da OS ou do check-in */
    refId: uuid("ref_id").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("links_documento_ref_uq").on(t.tipo, t.refId)],
);

/** Histórico da OS: quem fez o quê e quando */
export const osEventos = pgTable(
  "os_eventos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    osId: uuid("os_id").notNull().references(() => ordensServico.id, { onDelete: "cascade" }),
    descricao: text("descricao").notNull(),
    /** Id do Clerk; nulo quando foi o cliente (link do orçamento) */
    usuarioId: text("usuario_id"),
    usuarioNome: text("usuario_nome"),
    criadoEm: criadoEm(),
  },
  (t) => [index("os_eventos_os_idx").on(t.osId, t.criadoEm)],
);

/** Fotos tiradas durante o serviço (peça trocada, antes/depois) */
export const osFotos = pgTable(
  "os_fotos",
  {
    id: id(),
    osId: uuid("os_id").notNull().references(() => ordensServico.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    legenda: text("legenda"),
    criadoPor: text("criado_por").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("os_fotos_os_idx").on(t.osId)],
);

/**
 * Agendamento de serviço. O veículo (e o cliente) é cadastrado ao agendar; quando o carro
 * chega, o agendamento vira check-in (status "atendido" + checkinId).
 */
export const agendamentos = pgTable(
  "agendamentos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    veiculoId: uuid("veiculo_id").references(() => veiculos.id, { onDelete: "set null" }),
    tecnicoId: uuid("tecnico_id").references(() => tecnicos.id, { onDelete: "set null" }),
    /** O que vai ser feito (ex.: "Revisão 40 mil km") */
    titulo: text("titulo").notNull(),
    detalhe: text("detalhe"),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    duracaoMin: integer("duracao_min").notNull().default(60),
    status: text("status").$type<"agendado" | "confirmado" | "atendido" | "faltou" | "cancelado">().notNull().default("agendado"),
    checkinId: uuid("checkin_id").references(() => checkins.id, { onDelete: "set null" }),
    criadoPor: text("criado_por"),
    criadoEm: criadoEm(),
  },
  (t) => [index("agenda_inicio_idx").on(t.oficinaId, t.inicio)],
);

/* ---------- Financeiro ---------- */

/** Onde o dinheiro fica: caixa físico, conta no banco ou recebíveis da maquininha */
export const contasFinanceiras = pgTable("contas_financeiras", {
  id: id(),
  oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: text("tipo").$type<"caixa" | "banco" | "maquininha">().notNull(),
  saldoInicial: numeric("saldo_inicial", { precision: 12, scale: 2 }).notNull().default("0"),
  /** Data a partir da qual o saldo é calculado (AAAA-MM-DD) */
  saldoInicialEm: date("saldo_inicial_em").notNull().defaultNow(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
});

/** Categorias de receita e despesa; grupoDre agrupa as linhas da DRE */
export const categoriasFinanceiras = pgTable("categorias_financeiras", {
  id: id(),
  oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
  tipo: text("tipo").$type<"receita" | "despesa">().notNull(),
  nome: text("nome").notNull(),
  grupoDre: text("grupo_dre").notNull(),
  /** Usada automaticamente (servicos, pecas, taxas_cartao, comissoes): não pode ser removida */
  sistema: text("sistema"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
});

/** Conta a receber ou a pagar (um registro por parcela) */
export const lancamentos = pgTable(
  "lancamentos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    tipo: text("tipo").$type<"receber" | "pagar">().notNull(),
    descricao: text("descricao").notNull(),
    categoriaId: uuid("categoria_id").references(() => categoriasFinanceiras.id, { onDelete: "set null" }),
    /** Conta prevista para receber/pagar */
    contaId: uuid("conta_id").references(() => contasFinanceiras.id, { onDelete: "set null" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    /** Nome do fornecedor (texto livre; preenchido também quando há fornecedorId) */
    fornecedor: text("fornecedor"),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id, { onDelete: "set null" }),
    /** Conta a pagar gerada pela entrada de uma compra */
    compraId: uuid("compra_id").references(() => compras.id, { onDelete: "set null" }),
    tecnicoId: uuid("tecnico_id").references(() => tecnicos.id, { onDelete: "set null" }),
    osId: uuid("os_id").references(() => ordensServico.id, { onDelete: "set null" }),
    centroCusto: text("centro_custo"),
    valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
    /** Soma do principal já baixado (sem juros, multa ou desconto) */
    valorPago: numeric("valor_pago", { precision: 12, scale: 2 }).notNull().default("0"),
    vencimento: date("vencimento").notNull(),
    /** Data de referência para a DRE (padrão = vencimento; na OS = data da entrega) */
    competencia: date("competencia").notNull(),
    parcela: integer("parcela").notNull().default(1),
    parcelas: integer("parcelas").notNull().default(1),
    /** Liga as parcelas de um mesmo lançamento */
    grupo: uuid("grupo"),
    forma: text("forma"),
    status: text("status").$type<"aberto" | "parcial" | "pago" | "cancelado">().notNull().default("aberto"),
    anexoKey: text("anexo_key"),
    recorrenciaId: uuid("recorrencia_id"),
    observacao: text("observacao"),
    criadoPor: text("criado_por"),
    criadoEm: criadoEm(),
  },
  (t) => [index("lancamentos_venc_idx").on(t.oficinaId, t.tipo, t.status, t.vencimento), index("lancamentos_os_idx").on(t.osId)],
);

/** Pagamento (total ou parcial) de um lançamento; o estorno preenche estornadaEm */
export const baixas = pgTable(
  "baixas",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    lancamentoId: uuid("lancamento_id").notNull().references(() => lancamentos.id, { onDelete: "cascade" }),
    contaId: uuid("conta_id").notNull().references(() => contasFinanceiras.id),
    data: date("data").notNull(),
    /** Principal abatido do lançamento */
    valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
    juros: numeric("juros", { precision: 12, scale: 2 }).notNull().default("0"),
    multa: numeric("multa", { precision: 12, scale: 2 }).notNull().default("0"),
    desconto: numeric("desconto", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Taxa da maquininha descontada no recebimento */
    taxa: numeric("taxa", { precision: 12, scale: 2 }).notNull().default("0"),
    forma: text("forma"),
    observacao: text("observacao"),
    estornadaEm: timestamp("estornada_em", { withTimezone: true }),
    estornadaPor: text("estornada_por"),
    criadoPor: text("criado_por"),
    criadoEm: criadoEm(),
  },
  (t) => [index("baixas_conta_idx").on(t.contaId, t.data), index("baixas_lanc_idx").on(t.lancamentoId)],
);

export const transferencias = pgTable("transferencias", {
  id: id(),
  oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
  deContaId: uuid("de_conta_id").notNull().references(() => contasFinanceiras.id),
  paraContaId: uuid("para_conta_id").notNull().references(() => contasFinanceiras.id),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  data: date("data").notNull(),
  descricao: text("descricao"),
  criadoPor: text("criado_por"),
  criadoEm: criadoEm(),
});

/** Abertura e fechamento do caixa físico (conferência do dia) */
export const caixaSessoes = pgTable("caixa_sessoes", {
  id: id(),
  oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
  contaId: uuid("conta_id").notNull().references(() => contasFinanceiras.id),
  abertoEm: timestamp("aberto_em", { withTimezone: true }).notNull().defaultNow(),
  abertoPor: text("aberto_por"),
  valorAbertura: numeric("valor_abertura", { precision: 12, scale: 2 }).notNull(),
  fechadoEm: timestamp("fechado_em", { withTimezone: true }),
  fechadoPor: text("fechado_por"),
  valorEsperado: numeric("valor_esperado", { precision: 12, scale: 2 }),
  valorContado: numeric("valor_contado", { precision: 12, scale: 2 }),
  observacao: text("observacao"),
});

/** Conta recorrente (aluguel, energia…): gera um lançamento por mês */
export const recorrencias = pgTable("recorrencias", {
  id: id(),
  oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
  tipo: text("tipo").$type<"receber" | "pagar">().notNull(),
  descricao: text("descricao").notNull(),
  categoriaId: uuid("categoria_id").references(() => categoriasFinanceiras.id, { onDelete: "set null" }),
  contaId: uuid("conta_id").references(() => contasFinanceiras.id, { onDelete: "set null" }),
  fornecedor: text("fornecedor"),
  clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  forma: text("forma"),
  centroCusto: text("centro_custo"),
  observacao: text("observacao"),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  /** Dia do vencimento (1–31; meses mais curtos usam o último dia) */
  dia: integer("dia").notNull(),
  inicio: date("inicio").notNull(),
  fim: date("fim"),
  /** Último mês já gerado (AAAA-MM-01) */
  geradoAte: date("gerado_ate"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
});

/** Linhas do extrato do banco (OFX) para conciliação */
export const extratoItens = pgTable(
  "extrato_itens",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    contaId: uuid("conta_id").notNull().references(() => contasFinanceiras.id, { onDelete: "cascade" }),
    fitid: text("fitid").notNull(),
    data: date("data").notNull(),
    /** Positivo = entrada, negativo = saída */
    valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
    descricao: text("descricao"),
    baixaId: uuid("baixa_id").references(() => baixas.id, { onDelete: "set null" }),
    transferenciaId: uuid("transferencia_id").references(() => transferencias.id, { onDelete: "set null" }),
    ignorado: boolean("ignorado").notNull().default(false),
    importadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("extrato_fitid_uq").on(t.contaId, t.fitid)],
);

/** Fechamento de comissão de um técnico num período (gera conta a pagar) */
export const comissoesFechamentos = pgTable("comissoes_fechamentos", {
  id: id(),
  oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
  tecnicoId: uuid("tecnico_id").notNull().references(() => tecnicos.id),
  de: date("de").notNull(),
  ate: date("ate").notNull(),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  /** Cópia das OS consideradas */
  detalhes: jsonb("detalhes")
    .$type<{ osId: string; numero: number; entregueEm: string; servicos: number; pecas: number; comissao: number }[]>()
    .notNull(),
  lancamentoId: uuid("lancamento_id").references(() => lancamentos.id, { onDelete: "set null" }),
  criadoPor: text("criado_por"),
  criadoEm: criadoEm(),
});

/* ---------- Cobrança online (Fase 2.5) ---------- */

/** Conta da oficina no gateway de pagamento (hoje só Asaas). Uma por oficina. */
export const gatewaysPagamento = pgTable("gateways_pagamento", {
  id: id(),
  oficinaId: uuid("oficina_id")
    .notNull()
    .unique()
    .references(() => oficinas.id, { onDelete: "cascade" }),
  provedor: text("provedor").$type<"asaas">().notNull().default("asaas"),
  ambiente: text("ambiente").$type<"sandbox" | "producao">().notNull(),
  /** Chave da API cifrada (lib/cripto); nunca vai para o navegador */
  apiKeyCifrada: text("api_key_cifrada").notNull(),
  /** Final da chave, só para exibir ("…a1b2") */
  apiKeyFinal: text("api_key_final").notNull(),
  /** Token que o gateway manda no cabeçalho do webhook */
  webhookToken: text("webhook_token").notNull(),
  webhookId: text("webhook_id"),
  /** Conta financeira onde caem os recebimentos */
  contaId: uuid("conta_id").references(() => contasFinanceiras.id, { onDelete: "set null" }),
  /** Nome da conta no gateway (retornado ao validar a chave) */
  titular: text("titular"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Cobrança (PIX/boleto/link) gerada no gateway para uma conta a receber */
export const cobrancas = pgTable(
  "cobrancas",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    lancamentoId: uuid("lancamento_id").notNull().references(() => lancamentos.id, { onDelete: "cascade" }),
    provedor: text("provedor").$type<"asaas">().notNull().default("asaas"),
    ambiente: text("ambiente").$type<"sandbox" | "producao">().notNull(),
    /** id da cobrança no gateway (ex.: pay_123) */
    externoId: text("externo_id").notNull(),
    /** id do cliente no gateway, reaproveitado nas próximas cobranças do mesmo cliente */
    clienteExternoId: text("cliente_externo_id").notNull(),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    /** Status do gateway (PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED…) */
    status: text("status").notNull(),
    /** pendente | pago | cancelada | estornada (resumo para a tela) */
    situacao: text("situacao").$type<"pendente" | "pago" | "cancelada" | "estornada">().notNull().default("pendente"),
    /** UNDEFINED (cliente escolhe), PIX, BOLETO ou CREDIT_CARD */
    tipo: text("tipo").notNull(),
    valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
    vencimento: date("vencimento").notNull(),
    linkPagamento: text("link_pagamento"),
    pixCopiaECola: text("pix_copia_e_cola"),
    /** Valor líquido e forma usados quando foi paga */
    valorLiquido: numeric("valor_liquido", { precision: 12, scale: 2 }),
    formaPaga: text("forma_paga"),
    pagoEm: date("pago_em"),
    baixaId: uuid("baixa_id").references(() => baixas.id, { onDelete: "set null" }),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    criadoPor: text("criado_por"),
    criadoEm: criadoEm(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cobrancas_externo_idx").on(t.provedor, t.externoId),
    index("cobrancas_lancamento_idx").on(t.lancamentoId),
    index("cobrancas_cliente_idx").on(t.oficinaId, t.clienteId, t.ambiente),
  ],
);

/* ---------- Estoque e compras (Fase 4) ---------- */

export const fornecedores = pgTable(
  "fornecedores",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    tipoPessoa: tipoPessoa("tipo_pessoa").notNull().default("pj"),
    /** Razão social ou nome */
    nome: text("nome").notNull(),
    nomeFantasia: text("nome_fantasia"),
    /** Só dígitos */
    cpfCnpj: text("cpf_cnpj"),
    inscricaoEstadual: text("inscricao_estadual"),
    telefone: text("telefone"),
    email: text("email"),
    contato: text("contato"),
    ...endereco(),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [index("fornecedores_oficina_idx").on(t.oficinaId), uniqueIndex("fornecedores_doc_uq").on(t.oficinaId, t.cpfCnpj)],
);

/**
 * Código que o fornecedor usa para uma peça do catálogo (aprendido na entrada por XML).
 * `fator` converte a unidade do fornecedor para a do catálogo (ex.: caixa com 10 → 10).
 */
export const fornecedorCodigos = pgTable(
  "fornecedor_codigos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    fornecedorId: uuid("fornecedor_id").notNull().references(() => fornecedores.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    catalogoItemId: uuid("catalogo_item_id").notNull().references(() => catalogoItens.id, { onDelete: "cascade" }),
    fator: numeric("fator", { precision: 12, scale: 4 }).notNull().default("1"),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("fornecedor_codigos_uq").on(t.fornecedorId, t.codigo)],
);

/**
 * Compra de peças. Começa como pedido (ou já como entrada) e vira "recebida" quando a
 * mercadoria chega: aí entra no estoque e gera as contas a pagar.
 */
export const compras = pgTable(
  "compras",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    status: text("status").$type<"pedido" | "recebida" | "cancelada">().notNull().default("pedido"),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id, { onDelete: "set null" }),
    /** Pedido feito para atender uma OS (a OS fica "Aguardando peça") */
    osId: uuid("os_id").references(() => ordensServico.id, { onDelete: "set null" }),
    previsaoEm: date("previsao_em"),
    recebidaEm: timestamp("recebida_em", { withTimezone: true }),
    /** Nota do fornecedor */
    notaNumero: text("nota_numero"),
    notaSerie: text("nota_serie"),
    /** Chave de acesso (44 dígitos): impede importar a mesma nota duas vezes */
    notaChave: text("nota_chave"),
    notaEmissao: date("nota_emissao"),
    xmlKey: text("xml_key"),
    valorProdutos: numeric("valor_produtos", { precision: 12, scale: 2 }).notNull().default("0"),
    frete: numeric("frete", { precision: 12, scale: 2 }).notNull().default("0"),
    desconto: numeric("desconto", { precision: 12, scale: 2 }).notNull().default("0"),
    /** IPI, ST, seguro e outras despesas da nota (entram no custo) */
    outros: numeric("outros", { precision: 12, scale: 2 }).notNull().default("0"),
    valorTotal: numeric("valor_total", { precision: 12, scale: 2 }).notNull().default("0"),
    observacao: text("observacao"),
    criadoPor: text("criado_por"),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("compras_numero_uq").on(t.oficinaId, t.numero),
    // Nota estornada (compra cancelada) pode ser importada de novo
    uniqueIndex("compras_chave_uq").on(t.oficinaId, t.notaChave).where(sql`${t.status} <> 'cancelada'`),
    index("compras_status_idx").on(t.oficinaId, t.status),
    index("compras_os_idx").on(t.osId),
  ],
);

export const compraItens = pgTable(
  "compra_itens",
  {
    id: id(),
    compraId: uuid("compra_id").notNull().references(() => compras.id, { onDelete: "cascade" }),
    /** Peça do catálogo (obrigatória para receber; na importação pode começar vazia) */
    catalogoItemId: uuid("catalogo_item_id").references(() => catalogoItens.id, { onDelete: "set null" }),
    /** Como veio do fornecedor */
    codigoFornecedor: text("codigo_fornecedor"),
    descricao: text("descricao").notNull(),
    ncm: text("ncm"),
    gtin: text("gtin"),
    unidade: text("unidade"),
    /** Na unidade do catálogo (já multiplicada pelo fator) */
    quantidade: numeric("quantidade", { precision: 12, scale: 3 }).notNull(),
    /** Preço unitário na unidade do catálogo, como na nota */
    valorUnitario: numeric("valor_unitario", { precision: 12, scale: 4 }).notNull(),
    /** Custo unitário com frete, outros e desconto rateados (é o que entra no custo médio) */
    custoUnitario: numeric("custo_unitario", { precision: 12, scale: 4 }).notNull().default("0"),
    criadoEm: criadoEm(),
  },
  (t) => [index("compra_itens_compra_idx").on(t.compraId)],
);

/**
 * Cada entrada ou saída de uma peça. `quantidade` com sinal (+ entra, − sai).
 * Saída pela OS fica ligada ao item da OS (osItemId); a soma por item é o que já saiu.
 */
export const estoqueMovimentos = pgTable(
  "estoque_movimentos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    catalogoItemId: uuid("catalogo_item_id").notNull().references(() => catalogoItens.id, { onDelete: "cascade" }),
    tipo: text("tipo").$type<TipoMovimentoEstoque>().notNull(),
    quantidade: numeric("quantidade", { precision: 12, scale: 3 }).notNull(),
    /** Custo unitário do movimento (entrada: custo da compra; saída: custo médio do momento) */
    custoUnitario: numeric("custo_unitario", { precision: 12, scale: 4 }).notNull().default("0"),
    saldoApos: numeric("saldo_apos", { precision: 12, scale: 3 }).notNull(),
    custoMedioApos: numeric("custo_medio_apos", { precision: 12, scale: 4 }).notNull(),
    osId: uuid("os_id").references(() => ordensServico.id, { onDelete: "set null" }),
    /** Sem FK: o item pode ser removido da OS e o movimento de devolução continua apontando para ele */
    osItemId: uuid("os_item_id"),
    compraId: uuid("compra_id").references(() => compras.id, { onDelete: "set null" }),
    /** Ajuste e inventário: por que mudou */
    motivo: text("motivo"),
    criadoPor: text("criado_por"),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("estoque_mov_item_idx").on(t.catalogoItemId, t.criadoEm),
    index("estoque_mov_os_idx").on(t.osId),
    index("estoque_mov_os_item_idx").on(t.osItemId),
  ],
);

export type TipoMovimentoEstoque = "entrada" | "saida_os" | "devolucao_os" | "ajuste" | "estorno_compra";

/* ---------- Relações ---------- */

export const ordensServicoRelations = relations(ordensServico, ({ one, many }) => ({
  veiculo: one(veiculos, { fields: [ordensServico.veiculoId], references: [veiculos.id] }),
  cliente: one(clientes, { fields: [ordensServico.clienteId], references: [clientes.id] }),
  responsavel: one(tecnicos, { fields: [ordensServico.responsavelId], references: [tecnicos.id] }),
  itens: many(osItens),
}));
export const osItensRelations = relations(osItens, ({ one }) => ({
  os: one(ordensServico, { fields: [osItens.osId], references: [ordensServico.id] }),
}));
export const veiculosRelations = relations(veiculos, ({ one }) => ({
  cliente: one(clientes, { fields: [veiculos.clienteId], references: [clientes.id] }),
}));
