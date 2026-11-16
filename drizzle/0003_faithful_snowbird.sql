CREATE TYPE "public"."regime_tributario" AS ENUM('mei', 'simples', 'presumido', 'real');--> statement-breakpoint
ALTER TABLE "empresas" ALTER COLUMN "regime" SET DATA TYPE "public"."regime_tributario" USING "regime"::"public"."regime_tributario";--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "termo" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "nome_fantasia" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "endereco_proprio" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "logradouro" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "numero" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "bairro" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "uf" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "logradouro" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "numero" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "bairro" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "uf" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "texto_garantia" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "texto_termo_checkin" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "obs_orcamento" text;--> statement-breakpoint
ALTER TABLE "oficinas" ADD COLUMN "validade_orcamento_dias" integer DEFAULT 15 NOT NULL;