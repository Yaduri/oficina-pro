-- Row Level Security (Fase 6.1): cada oficina só enxerga os próprios dados, garantido no banco.
-- O app conecta como dono das tabelas e, em cada consulta de um usuário logado, troca para o papel
-- app_usuario com app.usuario = id do Clerk (src/db/index.ts). Webhooks, páginas públicas por token
-- e o cadastro inicial usam a conexão do sistema (getDbSistema), que não passa pelo RLS.
-- Tabela nova: habilitar RLS e criar a policy na própria migração (o dev avisa se faltar).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_usuario') THEN
    CREATE ROLE app_usuario NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT app_usuario TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_usuario;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_usuario;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_usuario;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_usuario;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_usuario;
--> statement-breakpoint
-- Oficinas do usuário da consulta (membro ativo). SECURITY DEFINER: lê membros sem passar pelo RLS.
CREATE OR REPLACE FUNCTION public.app_oficinas() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(array_agg(oficina_id), '{}'::uuid[])
  FROM membros
  WHERE clerk_user_id = nullif(current_setting('app.usuario', true), '') AND ativo
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_oficinas() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_oficinas() TO app_usuario;
--> statement-breakpoint
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  -- Tabelas com oficina_id (exceto membros, tratada abaixo)
  FOR t IN
    SELECT c.table_name AS tablename FROM information_schema.columns c
    JOIN pg_tables p ON p.tablename = c.table_name AND p.schemaname = 'public'
    WHERE c.table_schema = 'public' AND c.column_name = 'oficina_id' AND c.table_name <> 'membros'
  LOOP
    EXECUTE format(
      'CREATE POLICY isolamento_oficina ON public.%I TO app_usuario
         USING (oficina_id IN (SELECT unnest(public.app_oficinas())))
         WITH CHECK (oficina_id IN (SELECT unnest(public.app_oficinas())))',
      t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE POLICY isolamento_oficina ON public.oficinas TO app_usuario
  USING (id IN (SELECT unnest(public.app_oficinas())))
  WITH CHECK (id IN (SELECT unnest(public.app_oficinas())));
--> statement-breakpoint
-- Membros: os da oficina e as próprias participações (inclusive desativadas, para a tela "sem acesso")
CREATE POLICY isolamento_oficina ON public.membros TO app_usuario
  USING (oficina_id IN (SELECT unnest(public.app_oficinas())) OR clerk_user_id = nullif(current_setting('app.usuario', true), ''))
  WITH CHECK (oficina_id IN (SELECT unnest(public.app_oficinas())));
--> statement-breakpoint
-- Tabelas filhas sem oficina_id: valem as regras da tabela-mãe (a subconsulta também passa pelo RLS)
CREATE POLICY isolamento_oficina ON public.checkin_fotos TO app_usuario
  USING (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id));
--> statement-breakpoint
CREATE POLICY isolamento_oficina ON public.os_fotos TO app_usuario
  USING (EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id));
--> statement-breakpoint
CREATE POLICY isolamento_oficina ON public.os_itens TO app_usuario
  USING (EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id));
--> statement-breakpoint
CREATE POLICY isolamento_oficina ON public.compra_itens TO app_usuario
  USING (EXISTS (SELECT 1 FROM public.compras c WHERE c.id = compra_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.compras c WHERE c.id = compra_id));
--> statement-breakpoint
-- Supabase: a API pública (anon/authenticated) não acessa nenhuma tabela
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  END IF;
END $$;
