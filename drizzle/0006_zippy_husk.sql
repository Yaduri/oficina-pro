DROP INDEX "compras_chave_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "compras_chave_uq" ON "compras" USING btree ("oficina_id","nota_chave") WHERE "compras"."status" <> 'cancelada';