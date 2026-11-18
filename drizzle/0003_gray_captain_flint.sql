ALTER TABLE "recorrencias" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD COLUMN "forma" text;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD COLUMN "centro_custo" text;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;