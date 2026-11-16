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
ALTER TABLE "oficinas" ADD COLUMN "garantia_dias" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD COLUMN "desconto" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "previsao_entrega_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "desconto_percentual" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "desconto_valor" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "km_saida" integer;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "garantia_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "entrega_obs" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "entrega_assinatura_key" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "entregue_por" text;--> statement-breakpoint
ALTER TABLE "os_eventos" ADD CONSTRAINT "os_eventos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_eventos" ADD CONSTRAINT "os_eventos_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_fotos" ADD CONSTRAINT "os_fotos_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_eventos_os_idx" ON "os_eventos" USING btree ("os_id","criado_em");--> statement-breakpoint
CREATE INDEX "os_fotos_os_idx" ON "os_fotos" USING btree ("os_id");