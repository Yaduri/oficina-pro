ALTER TABLE "agendamentos" ADD COLUMN "veiculo_id" uuid;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "tecnico_id" uuid;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "duracao_min" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "status" text DEFAULT 'agendado' NOT NULL;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "checkin_id" uuid;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "criado_por" text;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tecnico_id_tecnicos_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."tecnicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE set null ON UPDATE no action;