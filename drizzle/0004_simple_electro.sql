CREATE TABLE "cobrancas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"lancamento_id" uuid NOT NULL,
	"provedor" text DEFAULT 'asaas' NOT NULL,
	"ambiente" text NOT NULL,
	"externo_id" text NOT NULL,
	"cliente_externo_id" text NOT NULL,
	"cliente_id" uuid,
	"status" text NOT NULL,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"tipo" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"vencimento" date NOT NULL,
	"link_pagamento" text,
	"pix_copia_e_cola" text,
	"valor_liquido" numeric(12, 2),
	"forma_paga" text,
	"pago_em" date,
	"baixa_id" uuid,
	"cancelada_em" timestamp with time zone,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateways_pagamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"provedor" text DEFAULT 'asaas' NOT NULL,
	"ambiente" text NOT NULL,
	"api_key_cifrada" text NOT NULL,
	"api_key_final" text NOT NULL,
	"webhook_token" text NOT NULL,
	"webhook_id" text,
	"conta_id" uuid,
	"titular" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateways_pagamento_oficina_id_unique" UNIQUE("oficina_id")
);
--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_baixa_id_baixas_id_fk" FOREIGN KEY ("baixa_id") REFERENCES "public"."baixas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways_pagamento" ADD CONSTRAINT "gateways_pagamento_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways_pagamento" ADD CONSTRAINT "gateways_pagamento_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_externo_idx" ON "cobrancas" USING btree ("provedor","externo_id");--> statement-breakpoint
CREATE INDEX "cobrancas_lancamento_idx" ON "cobrancas" USING btree ("lancamento_id");--> statement-breakpoint
CREATE INDEX "cobrancas_cliente_idx" ON "cobrancas" USING btree ("oficina_id","cliente_id","ambiente");