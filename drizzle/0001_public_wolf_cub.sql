CREATE TABLE "checkin_fotos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkin_id" uuid NOT NULL,
	"posicao" text NOT NULL,
	"key" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"cliente_id" uuid,
	"km" integer,
	"combustivel" integer,
	"relato" text NOT NULL,
	"avarias" text,
	"objetos" text,
	"assinatura_key" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "checkin_id" uuid;--> statement-breakpoint
ALTER TABLE "checkin_fotos" ADD CONSTRAINT "checkin_fotos_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkin_fotos_checkin_idx" ON "checkin_fotos" USING btree ("checkin_id");--> statement-breakpoint
CREATE INDEX "checkins_oficina_idx" ON "checkins" USING btree ("oficina_id","criado_em");--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE set null ON UPDATE no action;