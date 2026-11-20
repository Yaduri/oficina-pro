CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"usuario_id" text,
	"usuario_nome" text,
	"tabela" text NOT NULL,
	"registro_id" text,
	"acao" text NOT NULL,
	"resumo" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"chave" text PRIMARY KEY NOT NULL,
	"contagem" integer DEFAULT 1 NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_oficina_data_idx" ON "auditoria" USING btree ("oficina_id","criado_em");--> statement-breakpoint
CREATE INDEX "auditoria_oficina_tabela_idx" ON "auditoria" USING btree ("oficina_id","tabela","criado_em");--> statement-breakpoint
CREATE INDEX "rate_limits_expira_idx" ON "rate_limits" USING btree ("expira_em");--> statement-breakpoint
ALTER TABLE "public"."auditoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY isolamento_oficina ON "public"."auditoria" TO app_usuario
  USING (oficina_id IN (SELECT unnest(public.app_oficinas())))
  WITH CHECK (oficina_id IN (SELECT unnest(public.app_oficinas())));--> statement-breakpoint
-- rate_limits é usada apenas pelo sistema (getDbSistema); usuários logados não têm acesso direto
CREATE POLICY somente_sistema ON "public"."rate_limits" TO app_usuario
  USING (false)
  WITH CHECK (false);--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "public"."auditoria" TO app_usuario;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.auditoria, public.rate_limits FROM anon, authenticated';
  END IF;
END $$;
