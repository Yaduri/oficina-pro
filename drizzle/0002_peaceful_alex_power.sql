CREATE TABLE "baixas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"lancamento_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"juros" numeric(12, 2) DEFAULT '0' NOT NULL,
	"multa" numeric(12, 2) DEFAULT '0' NOT NULL,
	"desconto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxa" numeric(12, 2) DEFAULT '0' NOT NULL,
	"forma" text,
	"observacao" text,
	"estornada_em" timestamp with time zone,
	"estornada_por" text,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caixa_sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aberto_por" text,
	"valor_abertura" numeric(12, 2) NOT NULL,
	"fechado_em" timestamp with time zone,
	"fechado_por" text,
	"valor_esperado" numeric(12, 2),
	"valor_contado" numeric(12, 2),
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "categorias_financeiras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"grupo_dre" text NOT NULL,
	"sistema" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comissoes_fechamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tecnico_id" uuid NOT NULL,
	"de" date NOT NULL,
	"ate" date NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"detalhes" jsonb NOT NULL,
	"lancamento_id" uuid,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_financeiras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"saldo_inicial" numeric(12, 2) DEFAULT '0' NOT NULL,
	"saldo_inicial_em" date DEFAULT now() NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extrato_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"fitid" text NOT NULL,
	"data" date NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"descricao" text,
	"baixa_id" uuid,
	"transferencia_id" uuid,
	"ignorado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"categoria_id" uuid,
	"conta_id" uuid,
	"cliente_id" uuid,
	"fornecedor" text,
	"tecnico_id" uuid,
	"os_id" uuid,
	"centro_custo" text,
	"valor" numeric(12, 2) NOT NULL,
	"valor_pago" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vencimento" date NOT NULL,
	"competencia" date NOT NULL,
	"parcela" integer DEFAULT 1 NOT NULL,
	"parcelas" integer DEFAULT 1 NOT NULL,
	"grupo" uuid,
	"forma" text,
	"status" text DEFAULT 'aberto' NOT NULL,
	"anexo_key" text,
	"recorrencia_id" uuid,
	"observacao" text,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recorrencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"categoria_id" uuid,
	"conta_id" uuid,
	"fornecedor" text,
	"valor" numeric(12, 2) NOT NULL,
	"dia" integer NOT NULL,
	"inicio" date NOT NULL,
	"fim" date,
	"gerado_ate" date,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transferencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"de_conta_id" uuid NOT NULL,
	"para_conta_id" uuid NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"data" date NOT NULL,
	"descricao" text,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "taxas_cartao" jsonb;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "comissao_servico_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "comissao_peca_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "comissao_fixa_os" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_sessoes" ADD CONSTRAINT "caixa_sessoes_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_sessoes" ADD CONSTRAINT "caixa_sessoes_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissoes_fechamentos" ADD CONSTRAINT "comissoes_fechamentos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissoes_fechamentos" ADD CONSTRAINT "comissoes_fechamentos_tecnico_id_tecnicos_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."tecnicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissoes_fechamentos" ADD CONSTRAINT "comissoes_fechamentos_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_financeiras" ADD CONSTRAINT "contas_financeiras_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extrato_itens" ADD CONSTRAINT "extrato_itens_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extrato_itens" ADD CONSTRAINT "extrato_itens_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extrato_itens" ADD CONSTRAINT "extrato_itens_baixa_id_baixas_id_fk" FOREIGN KEY ("baixa_id") REFERENCES "public"."baixas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extrato_itens" ADD CONSTRAINT "extrato_itens_transferencia_id_transferencias_id_fk" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tecnico_id_tecnicos_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."tecnicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_de_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("de_conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_para_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("para_conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "baixas_conta_idx" ON "baixas" USING btree ("conta_id","data");--> statement-breakpoint
CREATE INDEX "baixas_lanc_idx" ON "baixas" USING btree ("lancamento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extrato_fitid_uq" ON "extrato_itens" USING btree ("conta_id","fitid");--> statement-breakpoint
CREATE INDEX "lancamentos_venc_idx" ON "lancamentos" USING btree ("oficina_id","tipo","status","vencimento");--> statement-breakpoint
CREATE INDEX "lancamentos_os_idx" ON "lancamentos" USING btree ("os_id");