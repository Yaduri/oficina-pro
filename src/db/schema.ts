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
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Modelo de dados — ver docs/arquitetura.md, seção 3.
 * Regra: toda tabela tem oficina_id; financeiro/fiscal e OS têm também empresa_id.
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

export const tipoEmpresa = pgEnum("tipo_empresa", ["mecanica", "eletrica", "outra"]);
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

/* ---------- Oficina (tenant) e empresas (CNPJs) ---------- */

export const oficinas = pgTable("oficinas", {
  id: id(),
  /** Organization do Clerk; em contas sem organização usa "user_<id>" */
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  nome: text("nome").notNull(),
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
  criadoEm: criadoEm(),
});

export const empresas = pgTable(
  "empresas",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    tipo: tipoEmpresa("tipo").notNull(),
    /** Nome curto usado no sistema (ex.: "Mecânica") */
    nome: text("nome").notNull(),
    razaoSocial: text("razao_social"),
    nomeFantasia: text("nome_fantasia"),
    /** Só caracteres 0-9/A-Z (aceita o CNPJ alfanumérico) */
    cnpj: text("cnpj"),
    regime: regimeTributario("regime"),
    inscricaoMunicipal: text("inscricao_municipal"),
    inscricaoEstadual: text("inscricao_estadual"),
    telefone: text("telefone"),
    email: text("email"),
    /** Falso = usa o endereço da oficina */
    enderecoProprio: boolean("endereco_proprio").notNull().default(false),
    ...endereco(),
    criadoEm: criadoEm(),
  },
  (t) => [index("empresas_oficina_idx").on(t.oficinaId)],
);

/**
 * Usuário (login do Clerk) que faz parte da oficina, com um papel.
 * todasEmpresas = vê todos os CNPJs; senão, só os de membro_empresas.
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
    todasEmpresas: boolean("todas_empresas").notNull().default(true),
    ativo: boolean("ativo").notNull().default(true),
    /** Última vez que abriu o sino: o que é mais novo conta como não lido */
    notificacoesLidasEm: timestamp("notificacoes_lidas_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("membros_oficina_usuario_uq").on(t.oficinaId, t.clerkUserId), index("membros_usuario_idx").on(t.clerkUserId)],
);

export const membroEmpresas = pgTable(
  "membro_empresas",
  {
    membroId: uuid("membro_id").notNull().references(() => membros.id, { onDelete: "cascade" }),
    empresaId: uuid("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.membroId, t.empresaId] })],
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
    todasEmpresas: boolean("todas_empresas").notNull().default(true),
    empresaIds: jsonb("empresa_ids").$type<string[]>().notNull().default([]),
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
  empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
  nome: text("nome").notNull(),
  ativo: boolean("ativo").notNull().default(true),
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
    /** Empresa que presta o serviço / vende a peça; nulo = a empresa da OS */
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
    /** Serviço: tempo padrão em minutos */
    tempoMinutos: integer("tempo_minutos"),
    /** Serviço: código da lista de serviços municipal (NFS-e) */
    codigoServicoMunicipal: text("codigo_servico_municipal"),
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
 * Recepção do veículo (feita no celular). Um check-in pode gerar uma OS por empresa
 * (ex.: o carro entra para a mecânica e para a elétrica ao mesmo tempo).
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
    criadoEm: criadoEm(),
  },
  (t) => [index("checkins_oficina_idx").on(t.oficinaId, t.criadoEm)],
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
    /** Empresa dona da OS (decisão: cada OS pertence a uma empresa) */
    empresaId: uuid("empresa_id").notNull().references(() => empresas.id),
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
    /** Padrão = empresa da OS; difere apenas em OS mista */
    empresaId: uuid("empresa_id").notNull().references(() => empresas.id),
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
    /** Nulo = qualquer empresa */
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
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

/* ---------- Relações ---------- */

export const oficinasRelations = relations(oficinas, ({ many }) => ({ empresas: many(empresas) }));
export const empresasRelations = relations(empresas, ({ one }) => ({
  oficina: one(oficinas, { fields: [empresas.oficinaId], references: [oficinas.id] }),
}));
export const ordensServicoRelations = relations(ordensServico, ({ one, many }) => ({
  empresa: one(empresas, { fields: [ordensServico.empresaId], references: [empresas.id] }),
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
