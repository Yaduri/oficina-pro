CREATE TABLE "compra_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compra_id" uuid NOT NULL,
	"catalogo_item_id" uuid,
	"codigo_fornecedor" text,
	"descricao" text NOT NULL,
	"ncm" text,
	"gtin" text,
	"unidade" text,
	"quantidade" numeric(12, 3) NOT NULL,
	"valor_unitario" numeric(12, 4) NOT NULL,
	"custo_unitario" numeric(12, 4) DEFAULT '0' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"status" text DEFAULT 'pedido' NOT NULL,
	"fornecedor_id" uuid,
	"os_id" uuid,
	"previsao_em" date,
	"recebida_em" timestamp with time zone,
	"nota_numero" text,
	"nota_serie" text,
	"nota_chave" text,
	"nota_emissao" date,
	"xml_key" text,
	"valor_produtos" numeric(12, 2) DEFAULT '0' NOT NULL,
	"frete" numeric(12, 2) DEFAULT '0' NOT NULL,
	"desconto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"outros" numeric(12, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"observacao" text,
	"criado_por" text,
	"cancelada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estoque_movimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"catalogo_item_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"quantidade" numeric(12, 3) NOT NULL,
	"custo_unitario" numeric(12, 4) DEFAULT '0' NOT NULL,
	"saldo_apos" numeric(12, 3) NOT NULL,
	"custo_medio_apos" numeric(12, 4) NOT NULL,
	"os_id" uuid,
	"os_item_id" uuid,
	"compra_id" uuid,
	"motivo" text,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fornecedor_codigos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"catalogo_item_id" uuid NOT NULL,
	"fator" numeric(12, 4) DEFAULT '1' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo_pessoa" "tipo_pessoa" DEFAULT 'pj' NOT NULL,
	"nome" text NOT NULL,
	"nome_fantasia" text,
	"cpf_cnpj" text,
	"inscricao_estadual" text,
	"telefone" text,
	"email" text,
	"contato" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "controla_estoque" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "unidade" text DEFAULT 'UN' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "estoque_atual" numeric(12, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "estoque_minimo" numeric(12, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "custo_medio" numeric(12, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "localizacao" text;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "marca" text;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "gtin" text;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "ncm" text;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "fornecedor_id" uuid;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "compra_id" uuid;--> statement-breakpoint
ALTER TABLE "compra_itens" ADD CONSTRAINT "compra_itens_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_itens" ADD CONSTRAINT "compra_itens_catalogo_item_id_catalogo_itens_id_fk" FOREIGN KEY ("catalogo_item_id") REFERENCES "public"."catalogo_itens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_catalogo_item_id_catalogo_itens_id_fk" FOREIGN KEY ("catalogo_item_id") REFERENCES "public"."catalogo_itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor_codigos" ADD CONSTRAINT "fornecedor_codigos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor_codigos" ADD CONSTRAINT "fornecedor_codigos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor_codigos" ADD CONSTRAINT "fornecedor_codigos_catalogo_item_id_catalogo_itens_id_fk" FOREIGN KEY ("catalogo_item_id") REFERENCES "public"."catalogo_itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compra_itens_compra_idx" ON "compra_itens" USING btree ("compra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compras_numero_uq" ON "compras" USING btree ("oficina_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "compras_chave_uq" ON "compras" USING btree ("oficina_id","nota_chave");--> statement-breakpoint
CREATE INDEX "compras_status_idx" ON "compras" USING btree ("oficina_id","status");--> statement-breakpoint
CREATE INDEX "compras_os_idx" ON "compras" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "estoque_mov_item_idx" ON "estoque_movimentos" USING btree ("catalogo_item_id","criado_em");--> statement-breakpoint
CREATE INDEX "estoque_mov_os_idx" ON "estoque_movimentos" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "estoque_mov_os_item_idx" ON "estoque_movimentos" USING btree ("os_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedor_codigos_uq" ON "fornecedor_codigos" USING btree ("fornecedor_id","codigo");--> statement-breakpoint
CREATE INDEX "fornecedores_oficina_idx" ON "fornecedores" USING btree ("oficina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedores_doc_uq" ON "fornecedores" USING btree ("oficina_id","cpf_cnpj");--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE set null ON UPDATE no action;