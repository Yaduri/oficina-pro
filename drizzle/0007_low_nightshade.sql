CREATE TABLE "lembretes_revisao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"catalogo_item_id" uuid,
	"os_id" uuid,
	"descricao" text NOT NULL,
	"intervalo_meses" integer,
	"intervalo_km" integer,
	"ultima_data" date,
	"ultimo_km" integer,
	"proxima_data" date,
	"proximo_km" integer,
	"avisado_em" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"cliente_id" uuid,
	"veiculo_id" uuid,
	"os_id" uuid,
	"agendamento_id" uuid,
	"ref_id" uuid,
	"telefone" text,
	"texto" text NOT NULL,
	"enviado_por" text,
	"enviado_por_nome" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pesquisas_satisfacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"os_id" uuid NOT NULL,
	"token" text NOT NULL,
	"nota" integer,
	"comentario" text,
	"respondido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pesquisas_satisfacao_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "revisao_meses" integer;--> statement-breakpoint
ALTER TABLE "catalogo_itens" ADD COLUMN "revisao_km" integer;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "modelos_mensagem" jsonb;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "pos_venda_dias" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "lembretes_revisao" ADD CONSTRAINT "lembretes_revisao_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembretes_revisao" ADD CONSTRAINT "lembretes_revisao_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembretes_revisao" ADD CONSTRAINT "lembretes_revisao_catalogo_item_id_catalogo_itens_id_fk" FOREIGN KEY ("catalogo_item_id") REFERENCES "public"."catalogo_itens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembretes_revisao" ADD CONSTRAINT "lembretes_revisao_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_agendamento_id_agendamentos_id_fk" FOREIGN KEY ("agendamento_id") REFERENCES "public"."agendamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesquisas_satisfacao" ADD CONSTRAINT "pesquisas_satisfacao_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesquisas_satisfacao" ADD CONSTRAINT "pesquisas_satisfacao_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revisoes_oficina_idx" ON "lembretes_revisao" USING btree ("oficina_id","proxima_data");--> statement-breakpoint
CREATE INDEX "revisoes_veiculo_idx" ON "lembretes_revisao" USING btree ("veiculo_id");--> statement-breakpoint
CREATE INDEX "mensagens_oficina_idx" ON "mensagens" USING btree ("oficina_id","criado_em");--> statement-breakpoint
CREATE INDEX "mensagens_cliente_idx" ON "mensagens" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "mensagens_os_idx" ON "mensagens" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "mensagens_ref_idx" ON "mensagens" USING btree ("tipo","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pesquisas_os_uq" ON "pesquisas_satisfacao" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "pesquisas_oficina_idx" ON "pesquisas_satisfacao" USING btree ("oficina_id","respondido_em");