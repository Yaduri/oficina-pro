CREATE TYPE "public"."status_orcamento" AS ENUM('pendente', 'aprovado', 'parcial', 'recusado', 'substituido');--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"os_id" uuid NOT NULL,
	"token" text NOT NULL,
	"itens" jsonb NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"observacao" text,
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
ALTER TABLE "os_itens" ADD COLUMN "recusado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orcamentos_os_idx" ON "orcamentos" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "orcamentos_oficina_idx" ON "orcamentos" USING btree ("oficina_id","criado_em");