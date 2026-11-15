CREATE TYPE "public"."papel" AS ENUM('dono', 'gerente', 'atendente', 'tecnico', 'financeiro');--> statement-breakpoint
CREATE TYPE "public"."status_os" AS ENUM('diagnostico', 'aguardando_aprovacao', 'aguardando_peca', 'em_execucao', 'pronto', 'entregue', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_empresa" AS ENUM('mecanica', 'eletrica', 'outra');--> statement-breakpoint
CREATE TYPE "public"."tipo_item" AS ENUM('peca', 'servico');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('pf', 'pj');--> statement-breakpoint
CREATE TABLE "agendamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"empresa_id" uuid,
	"cliente_id" uuid,
	"titulo" text NOT NULL,
	"detalhe" text,
	"inicio" timestamp with time zone NOT NULL,
	"tipo" text DEFAULT 'servico' NOT NULL,
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
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo" "tipo_empresa" NOT NULL,
	"nome" text NOT NULL,
	"razao_social" text,
	"cnpj" text,
	"regime" text,
	"inscricao_municipal" text,
	"inscricao_estadual" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oficinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oficinas_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "ordens_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" integer NOT NULL,
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
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"os_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" "tipo_item" NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" numeric(10, 2) DEFAULT '1' NOT NULL,
	"valor_unitario" numeric(12, 2) NOT NULL,
	"concluido" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tecnicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"empresa_id" uuid,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_acessos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"empresa_id" uuid,
	"papel" "papel" NOT NULL,
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
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_responsavel_id_tecnicos_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."tecnicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_acessos" ADD CONSTRAINT "usuario_acessos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_acessos" ADD CONSTRAINT "usuario_acessos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_inicio_idx" ON "agendamentos" USING btree ("oficina_id","inicio");--> statement-breakpoint
CREATE INDEX "clientes_oficina_idx" ON "clientes" USING btree ("oficina_id");--> statement-breakpoint
CREATE INDEX "empresas_oficina_idx" ON "empresas" USING btree ("oficina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "os_numero_oficina_uq" ON "ordens_servico" USING btree ("oficina_id","numero");--> statement-breakpoint
CREATE INDEX "os_status_idx" ON "ordens_servico" USING btree ("oficina_id","status");--> statement-breakpoint
CREATE INDEX "os_itens_os_idx" ON "os_itens" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "acessos_usuario_idx" ON "usuario_acessos" USING btree ("clerk_user_id","oficina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "veiculos_placa_oficina_uq" ON "veiculos" USING btree ("oficina_id","placa");