CREATE TABLE "catalogo_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo" "tipo_item" NOT NULL,
	"codigo" text,
	"descricao" text NOT NULL,
	"valor" numeric(12, 2) DEFAULT '0' NOT NULL,
	"empresa_id" uuid,
	"tempo_minutos" integer,
	"codigo_servico_municipal" text,
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
ALTER TABLE "clientes" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "logradouro" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "numero" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "bairro" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "uf" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "nascimento" date;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "aceita_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "aceita_whatsapp_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "observacoes" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "arquivado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "os_itens" ADD COLUMN "catalogo_item_id" uuid;--> statement-breakpoint
ALTER TABLE "veiculos" ADD COLUMN "chassi" text;--> statement-breakpoint
ALTER TABLE "veiculos" ADD COLUMN "motor" text;--> statement-breakpoint
ALTER TABLE "veiculos" ADD COLUMN "combustivel" text;--> statement-breakpoint
ALTER TABLE "veiculos" ADD COLUMN "arquivado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD CONSTRAINT "catalogo_itens_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD CONSTRAINT "catalogo_itens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_transferencias" ADD CONSTRAINT "veiculo_transferencias_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_transferencias" ADD CONSTRAINT "veiculo_transferencias_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_transferencias" ADD CONSTRAINT "veiculo_transferencias_de_cliente_id_clientes_id_fk" FOREIGN KEY ("de_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_transferencias" ADD CONSTRAINT "veiculo_transferencias_para_cliente_id_clientes_id_fk" FOREIGN KEY ("para_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalogo_oficina_idx" ON "catalogo_itens" USING btree ("oficina_id","tipo");--> statement-breakpoint
CREATE INDEX "veiculo_transf_veiculo_idx" ON "veiculo_transferencias" USING btree ("veiculo_id");--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_catalogo_item_id_catalogo_itens_id_fk" FOREIGN KEY ("catalogo_item_id") REFERENCES "public"."catalogo_itens"("id") ON DELETE set null ON UPDATE no action;