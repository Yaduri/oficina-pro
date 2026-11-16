CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"token" text NOT NULL,
	"nome" text NOT NULL,
	"papel" "papel" NOT NULL,
	"todas_empresas" boolean DEFAULT true NOT NULL,
	"empresa_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"aceito_em" timestamp with time zone,
	"aceito_por" text,
	"cancelado_em" timestamp with time zone,
	CONSTRAINT "convites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "membro_empresas" (
	"membro_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	CONSTRAINT "membro_empresas_membro_id_empresa_id_pk" PRIMARY KEY("membro_id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"nome" text,
	"email" text,
	"papel" "papel" NOT NULL,
	"todas_empresas" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membro_empresas" ADD CONSTRAINT "membro_empresas_membro_id_membros_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."membros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membro_empresas" ADD CONSTRAINT "membro_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "convites_oficina_idx" ON "convites" USING btree ("oficina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membros_oficina_usuario_uq" ON "membros" USING btree ("oficina_id","clerk_user_id");--> statement-breakpoint
CREATE INDEX "membros_usuario_idx" ON "membros" USING btree ("clerk_user_id");--> statement-breakpoint
-- Migra os acessos antigos (uma linha por empresa) para membros (uma linha por usuário)
INSERT INTO "membros" ("oficina_id", "clerk_user_id", "papel", "todas_empresas", "criado_em")
SELECT "oficina_id", "clerk_user_id",
  (array_agg("papel" ORDER BY array_position(ARRAY['dono','gerente','financeiro','atendente','tecnico']::"papel"[], "papel")))[1],
  bool_or("empresa_id" IS NULL),
  min("criado_em")
FROM "usuario_acessos"
GROUP BY "oficina_id", "clerk_user_id";--> statement-breakpoint
INSERT INTO "membro_empresas" ("membro_id", "empresa_id")
SELECT DISTINCT m."id", a."empresa_id"
FROM "usuario_acessos" a
JOIN "membros" m ON m."oficina_id" = a."oficina_id" AND m."clerk_user_id" = a."clerk_user_id"
WHERE a."empresa_id" IS NOT NULL AND NOT m."todas_empresas";
