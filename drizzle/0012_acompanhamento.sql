-- Link de acompanhamento da OS (/acompanhamento/<token>): fotos do serviço que o cliente pode ver
-- e histórico de status com data e hora (sem textos internos, que ficam em os_eventos).

ALTER TABLE "os_fotos" ADD COLUMN "visivel_cliente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "os_status_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oficina_id" uuid NOT NULL,
	"os_id" uuid NOT NULL,
	"status" "status_os" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "os_status_historico" ADD CONSTRAINT "os_status_historico_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_status_historico" ADD CONSTRAINT "os_status_historico_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_status_historico_os_idx" ON "os_status_historico" USING btree ("os_id","criado_em");--> statement-breakpoint
ALTER TABLE "public"."os_status_historico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY isolamento_oficina ON "public"."os_status_historico" TO app_usuario
  USING (oficina_id IN (SELECT unnest(public.app_oficinas())))
  WITH CHECK (oficina_id IN (SELECT unnest(public.app_oficinas())));--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "public"."os_status_historico" TO app_usuario;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.os_status_historico FROM anon, authenticated';
  END IF;
END $$;
--> statement-breakpoint
-- Toda mudança de status (quadro, orçamento, aprovação pelo link, compra, entrega, check-in...)
-- fica registrada pelo próprio banco, sem depender de cada ação lembrar de gravar.
-- Roda com o papel de quem alterou a OS: o RLS confere a oficina da linha nova.
CREATE OR REPLACE FUNCTION public.registrar_status_os() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.os_status_historico (oficina_id, os_id, status, criado_em)
    VALUES (NEW.oficina_id, NEW.id, NEW.status, coalesce(NEW.entrada_em, now()));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.os_status_historico (oficina_id, os_id, status)
    VALUES (NEW.oficina_id, NEW.id, NEW.status);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER os_status_historico_trg
  AFTER INSERT OR UPDATE OF status ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.registrar_status_os();
--> statement-breakpoint
-- Histórico das OS que já existiam: entrada, envio do orçamento, aprovação pelo link,
-- mudanças pelo quadro (texto "Status: A → B" de os_eventos) e entrega.
INSERT INTO public.os_status_historico (oficina_id, os_id, status, criado_em)
SELECT o.oficina_id, o.id, 'diagnostico', o.entrada_em FROM public.ordens_servico o;
--> statement-breakpoint
INSERT INTO public.os_status_historico (oficina_id, os_id, status, criado_em)
SELECT o.oficina_id, o.id, 'aguardando_aprovacao', o.aprovacao_enviada_em
FROM public.ordens_servico o WHERE o.aprovacao_enviada_em IS NOT NULL;
--> statement-breakpoint
INSERT INTO public.os_status_historico (oficina_id, os_id, status, criado_em)
SELECT r.oficina_id, r.os_id, 'em_execucao', r.respondido_em
FROM public.orcamentos r WHERE r.status IN ('aprovado', 'parcial') AND r.respondido_em IS NOT NULL;
--> statement-breakpoint
INSERT INTO public.os_status_historico (oficina_id, os_id, status, criado_em)
SELECT e.oficina_id, e.os_id, s.status::status_os, e.criado_em
FROM public.os_eventos e
JOIN (VALUES
  ('Em diagnóstico', 'diagnostico'),
  ('Aguardando aprovação', 'aguardando_aprovacao'),
  ('Aguardando peça', 'aguardando_peca'),
  ('Em execução', 'em_execucao'),
  ('Pronto', 'pronto'),
  ('Entregue', 'entregue'),
  ('Cancelada', 'cancelada')
) AS s(label, status) ON s.label = split_part(e.descricao, ' → ', 2)
WHERE e.descricao LIKE 'Status: % → %';
--> statement-breakpoint
INSERT INTO public.os_status_historico (oficina_id, os_id, status, criado_em)
SELECT o.oficina_id, o.id, 'entregue', o.entregue_em
FROM public.ordens_servico o WHERE o.status = 'entregue' AND o.entregue_em IS NOT NULL;
