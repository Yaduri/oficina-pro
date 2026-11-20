ALTER TYPE "public"."papel" ADD VALUE 'contador';--> statement-breakpoint
CREATE TABLE "configuracoes_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"provedor" text DEFAULT 'nfse_nacional' NOT NULL,
	"ambiente" text DEFAULT 'homologacao' NOT NULL,
	"cert_pfx_cifrado" text,
	"cert_senha_cifrada" text,
	"cert_pem_cifrado" text,
	"cert_chave_cifrada" text,
	"cert_titular" text,
	"cert_cnpj" text,
	"cert_serial" text,
	"cert_valido_de" timestamp with time zone,
	"cert_valido_ate" timestamp with time zone,
	"codigo_municipio_ibge" text,
	"serie_dps" text DEFAULT '00001' NOT NULL,
	"proximo_numero_dps" integer DEFAULT 1 NOT NULL,
	"codigo_trib_nacional_padrao" text DEFAULT '140101' NOT NULL,
	"codigo_trib_municipal_padrao" text,
	"aliquota_iss" numeric(5, 2),
	"iss_retido_padrao" boolean DEFAULT false NOT NULL,
	"optante_simples_nacional" text DEFAULT '3' NOT NULL,
	"regime_apuracao_sn" text DEFAULT '1' NOT NULL,
	"regime_especial_trib" text DEFAULT '0' NOT NULL,
	"retencoes_padrao" jsonb,
	"incluir_ibs_cbs" boolean DEFAULT false NOT NULL,
	"ibs_cbs_padrao" jsonb,
	"provedor_token_cifrado" text,
	"provedor_token_final" text,
	"webhook_token" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracoes_fiscais_oficina_id_unique" UNIQUE("oficina_id")
);
--> statement-breakpoint
CREATE TABLE "notas_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"os_id" uuid,
	"cliente_id" uuid,
	"tipo" text DEFAULT 'nfse' NOT NULL,
	"provedor" text DEFAULT 'nfse_nacional' NOT NULL,
	"ambiente" text DEFAULT 'homologacao' NOT NULL,
	"status" text DEFAULT 'fila' NOT NULL,
	"serie_dps" text NOT NULL,
	"numero_dps" integer NOT NULL,
	"id_dps" text NOT NULL,
	"numero_nota" text,
	"chave_acesso" text,
	"codigo_verificacao" text,
	"protocolo" text,
	"api_ref" text,
	"competencia" date NOT NULL,
	"emitida_em" timestamp with time zone,
	"valor_servicos" numeric(12, 2) NOT NULL,
	"valor_desconto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"base_calculo" numeric(12, 2) NOT NULL,
	"aliquota_iss" numeric(5, 2),
	"valor_iss" numeric(12, 2) DEFAULT '0' NOT NULL,
	"iss_retido" boolean DEFAULT false NOT NULL,
	"valor_retencoes" numeric(12, 2) DEFAULT '0' NOT NULL,
	"valor_liquido" numeric(12, 2) NOT NULL,
	"codigo_trib_nacional" text NOT NULL,
	"codigo_trib_municipal" text,
	"discriminacao" text NOT NULL,
	"tomador_nome" text NOT NULL,
	"tomador_documento" text,
	"tomador_email" text,
	"tomador_telefone" text,
	"tomador_endereco" jsonb,
	"retencoes" jsonb,
	"ibs_cbs" jsonb,
	"xml_dps_key" text,
	"xml_nota_key" text,
	"xml_cancelamento_key" text,
	"pdf_key" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"proxima_tentativa_em" timestamp with time zone,
	"ultima_mensagem" text,
	"erros" jsonb,
	"cancelada_em" timestamp with time zone,
	"cancelada_por" text,
	"codigo_motivo_cancelamento" text,
	"motivo_cancelamento" text,
	"substitui_nota_id" uuid,
	"substituida_por_id" uuid,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configuracoes_fiscais" ADD CONSTRAINT "configuracoes_fiscais_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_dps_uq" ON "notas_fiscais" USING btree ("oficina_id","ambiente","id_dps");--> statement-breakpoint
CREATE INDEX "notas_oficina_data_idx" ON "notas_fiscais" USING btree ("oficina_id","criado_em");--> statement-breakpoint
CREATE INDEX "notas_oficina_status_idx" ON "notas_fiscais" USING btree ("oficina_id","status");--> statement-breakpoint
CREATE INDEX "notas_os_idx" ON "notas_fiscais" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "notas_chave_idx" ON "notas_fiscais" USING btree ("chave_acesso");--> statement-breakpoint
ALTER TABLE "public"."configuracoes_fiscais" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."notas_fiscais" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY isolamento_oficina ON "public"."configuracoes_fiscais" TO app_usuario
  USING (oficina_id IN (SELECT unnest(public.app_oficinas())))
  WITH CHECK (oficina_id IN (SELECT unnest(public.app_oficinas())));--> statement-breakpoint
CREATE POLICY isolamento_oficina ON "public"."notas_fiscais" TO app_usuario
  USING (oficina_id IN (SELECT unnest(public.app_oficinas())))
  WITH CHECK (oficina_id IN (SELECT unnest(public.app_oficinas())));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."configuracoes_fiscais", "public"."notas_fiscais" TO app_usuario;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.configuracoes_fiscais, public.notas_fiscais FROM anon, authenticated';
  END IF;
END $$;
