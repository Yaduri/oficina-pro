CREATE TABLE "links_documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"token" text NOT NULL,
	"tipo" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_documento_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "links_documento" ADD CONSTRAINT "links_documento_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "links_documento_ref_uq" ON "links_documento" USING btree ("tipo","ref_id");