ALTER TABLE "checkins" ADD COLUMN "chave_envio" text;--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_chave_envio_uq" ON "checkins" USING btree ("oficina_id","chave_envio");