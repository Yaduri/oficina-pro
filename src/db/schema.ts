import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
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
 * Regra: toda tabela tem oficina_id; financeiro/fiscal e OS têm também empresa_id.
 */

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();

export const tipoEmpresa = pgEnum("tipo_empresa", ["mecanica", "eletrica", "outra"]);
export const papel = pgEnum("papel", ["dono", "gerente", "atendente", "tecnico", "financeiro"]);
export const tipoPessoa = pgEnum("tipo_pessoa", ["pf", "pj"]);
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

/* ---------- Oficina (tenant) e empresas (CNPJs) ---------- */

export const oficinas = pgTable("oficinas", {
  id: id(),
  /** Organization do Clerk; em contas sem organização usa "user_<id>" */
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  nome: text("nome").notNull(),
  criadoEm: criadoEm(),
});

export const empresas = pgTable(
  "empresas",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    tipo: tipoEmpresa("tipo").notNull(),
    nome: text("nome").notNull(),
    razaoSocial: text("razao_social"),
    cnpj: text("cnpj"),
    regime: text("regime"),
    inscricaoMunicipal: text("inscricao_municipal"),
    inscricaoEstadual: text("inscricao_estadual"),
    criadoEm: criadoEm(),
  },
  (t) => [index("empresas_oficina_idx").on(t.oficinaId)],
);

/** Acesso de usuário (Clerk) por empresa. empresa_id nulo = todas as empresas da oficina. */
export const usuarioAcessos = pgTable(
  "usuario_acessos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
    papel: papel("papel").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("acessos_usuario_idx").on(t.clerkUserId, t.oficinaId)],
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
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("veiculos_placa_oficina_uq").on(t.oficinaId, t.placa)],
);

/* ---------- Operacional ---------- */

export const ordensServico = pgTable(
  "ordens_servico",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    /** Empresa dona da OS (decisão: cada OS pertence a uma empresa) */
    empresaId: uuid("empresa_id").notNull().references(() => empresas.id),
    numero: integer("numero").notNull(),
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
    concluido: boolean("concluido").notNull().default(false),
    criadoEm: criadoEm(),
  },
  (t) => [index("os_itens_os_idx").on(t.osId)],
);

export const agendamentos = pgTable(
  "agendamentos",
  {
    id: id(),
    oficinaId: uuid("oficina_id").notNull().references(() => oficinas.id, { onDelete: "cascade" }),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    titulo: text("titulo").notNull(),
    detalhe: text("detalhe"),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    tipo: text("tipo").notNull().default("servico"), // servico | entrega
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
