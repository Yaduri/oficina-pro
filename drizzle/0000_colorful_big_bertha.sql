CREATE TYPE "public"."papel" AS ENUM('dono', 'gerente', 'atendente', 'tecnico', 'financeiro');--> statement-breakpoint
CREATE TYPE "public"."regime_tributario" AS ENUM('mei', 'simples', 'presumido', 'real');--> statement-breakpoint
CREATE TYPE "public"."status_os" AS ENUM('diagnostico', 'aguardando_aprovacao', 'aguardando_peca', 'em_execucao', 'pronto', 'entregue', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."status_orcamento" AS ENUM('pendente', 'aprovado', 'parcial', 'recusado', 'substituido');--> statement-breakpoint
CREATE TYPE "public"."tipo_item" AS ENUM('peca', 'servico');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('pf', 'pj');--> statement-breakpoint
CREATE TABLE "agendamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"cliente_id" uuid,
	"veiculo_id" uuid,
	"tecnico_id" uuid,
	"titulo" text NOT NULL,
	"detalhe" text,
	"inicio" timestamp with time zone NOT NULL,
	"duracao_min" integer DEFAULT 60 NOT NULL,
	"status" text DEFAULT 'agendado' NOT NULL,
	"checkin_id" uuid,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogo_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo" "tipo_item" NOT NULL,
	"codigo" text,
	"descricao" text NOT NULL,
	"valor" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tempo_minutos" integer,
	"codigo_servico_municipal" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin_fotos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkin_id" uuid NOT NULL,
	"posicao" text NOT NULL,
	"key" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"cliente_id" uuid,
	"km" integer,
	"combustivel" integer,
	"relato" text NOT NULL,
	"avarias" text,
	"objetos" text,
	"assinatura_key" text,
	"termo" text,
	"checklist" jsonb,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"grupo" text NOT NULL,
	"descricao" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo_pessoa" "tipo_pessoa" DEFAULT 'pf' NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"telefone" text,
	"email" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"nascimento" date,
	"aceita_whatsapp" boolean DEFAULT false NOT NULL,
	"aceita_whatsapp_em" timestamp with time zone,
	"observacoes" text,
	"arquivado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"token" text NOT NULL,
	"nome" text NOT NULL,
	"papel" "papel" NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"aceito_em" timestamp with time zone,
	"aceito_por" text,
	"cancelado_em" timestamp with time zone,
	CONSTRAINT "convites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "links_documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"token" text NOT NULL,
	"tipo" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_documento_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"nome" text,
	"email" text,
	"papel" "papel" NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"notificacoes_lidas_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oficinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"nome" text NOT NULL,
	"razao_social" text,
	"nome_fantasia" text,
	"cnpj" text,
	"regime" "regime_tributario",
	"inscricao_municipal" text,
	"inscricao_estadual" text,
	"telefone" text,
	"whatsapp" text,
	"email" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"logo_key" text,
	"texto_garantia" text,
	"texto_termo_checkin" text,
	"obs_orcamento" text,
	"validade_orcamento_dias" integer DEFAULT 15 NOT NULL,
	"garantia_dias" integer DEFAULT 90 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oficinas_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"os_id" uuid NOT NULL,
	"token" text NOT NULL,
	"itens" jsonb NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"observacao" text,
	"desconto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"valido_ate" timestamp with time zone NOT NULL,
	"status" "status_orcamento" DEFAULT 'pendente' NOT NULL,
	"enviado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"visto_em" timestamp with time zone,
	"respondido_em" timestamp with time zone,
	"resposta_nome" text,
	"resposta_comentario" text,
	"itens_aprovados" jsonb,
	CONSTRAINT "orcamentos_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ordens_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"checkin_id" uuid,
	"veiculo_id" uuid NOT NULL,
	"cliente_id" uuid,
	"responsavel_id" uuid,
	"status" "status_os" DEFAULT 'diagnostico' NOT NULL,
	"descricao" text NOT NULL,
	"km_entrada" integer,
	"entrada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aprovacao_enviada_em" timestamp with time zone,
	"previsao_peca_em" timestamp with time zone,
	"cliente_avisado_em" timestamp with time zone,
	"entregue_em" timestamp with time zone,
	"previsao_entrega_em" timestamp with time zone,
	"desconto_percentual" numeric(5, 2),
	"desconto_valor" numeric(12, 2) DEFAULT '0' NOT NULL,
	"km_saida" integer,
	"garantia_ate" timestamp with time zone,
	"entrega_obs" text,
	"entrega_assinatura_key" text,
	"entregue_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"os_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"usuario_id" text,
	"usuario_nome" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_fotos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"os_id" uuid NOT NULL,
	"key" text NOT NULL,
	"legenda" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"os_id" uuid NOT NULL,
	"tipo" "tipo_item" NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" numeric(10, 2) DEFAULT '1' NOT NULL,
	"valor_unitario" numeric(12, 2) NOT NULL,
	"catalogo_item_id" uuid,
	"concluido" boolean DEFAULT false NOT NULL,
	"recusado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tecnicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veiculo_transferencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"de_cliente_id" uuid,
	"para_cliente_id" uuid,
	"de_nome" text,
	"para_nome" text,
	"por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veiculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"cliente_id" uuid,
	"placa" text NOT NULL,
	"marca" text,
	"modelo" text NOT NULL,
	"ano" integer,
	"cor" text,
	"km" integer,
	"chassi" text,
	"motor" text,
	"combustivel" text,
	"arquivado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tecnico_id_tecnicos_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."tecnicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD CONSTRAINT "catalogo_itens_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_fotos" ADD CONSTRAINT "checkin_fotos_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links_documento" ADD CONSTRAINT "links_documento_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_responsavel_id_tecnicos_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."tecnicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_eventos" ADD CONSTRAINT "os_eventos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_eventos" ADD CONSTRAINT "os_eventos_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_fotos" ADD CONSTRAINT "os_fotos_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_catalogo_item_id_catalogo_itens_id_fk" FOREIGN KEY ("catalogo_item_id") REFERENCES "public"."catalogo_itens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_transferencias" ADD CONSTRAINT "veiculo_transferencias_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_transferencias" ADD CONSTRAINT "veiculo_transferencias_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_transferencias" ADD CONSTRAINT "veiculo_transferencias_de_cliente_id_clientes_id_fk" FOREIGN KEY ("de_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_transferencias" ADD CONSTRAINT "veiculo_transferencias_para_cliente_id_clientes_id_fk" FOREIGN KEY ("para_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_inicio_idx" ON "agendamentos" USING btree ("oficina_id","inicio");--> statement-breakpoint
CREATE INDEX "catalogo_oficina_idx" ON "catalogo_itens" USING btree ("oficina_id","tipo");--> statement-breakpoint
CREATE INDEX "checkin_fotos_checkin_idx" ON "checkin_fotos" USING btree ("checkin_id");--> statement-breakpoint
CREATE INDEX "checkins_oficina_idx" ON "checkins" USING btree ("oficina_id","criado_em");--> statement-breakpoint
CREATE INDEX "checklist_oficina_idx" ON "checklist_itens" USING btree ("oficina_id");--> statement-breakpoint
CREATE INDEX "clientes_oficina_idx" ON "clientes" USING btree ("oficina_id");--> statement-breakpoint
CREATE INDEX "convites_oficina_idx" ON "convites" USING btree ("oficina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "links_documento_ref_uq" ON "links_documento" USING btree ("tipo","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membros_oficina_usuario_uq" ON "membros" USING btree ("oficina_id","clerk_user_id");--> statement-breakpoint
CREATE INDEX "membros_usuario_idx" ON "membros" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "orcamentos_os_idx" ON "orcamentos" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "orcamentos_oficina_idx" ON "orcamentos" USING btree ("oficina_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "os_numero_oficina_uq" ON "ordens_servico" USING btree ("oficina_id","numero");--> statement-breakpoint
CREATE INDEX "os_status_idx" ON "ordens_servico" USING btree ("oficina_id","status");--> statement-breakpoint
CREATE INDEX "os_eventos_os_idx" ON "os_eventos" USING btree ("os_id","criado_em");--> statement-breakpoint
CREATE INDEX "os_fotos_os_idx" ON "os_fotos" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "os_itens_os_idx" ON "os_itens" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "veiculo_transf_veiculo_idx" ON "veiculo_transferencias" USING btree ("veiculo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "veiculos_placa_oficina_uq" ON "veiculos" USING btree ("oficina_id","placa");