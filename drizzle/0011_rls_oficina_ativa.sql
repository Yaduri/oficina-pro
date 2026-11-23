-- Atualiza app_oficinas() para suportar um mesmo login em múltiplas oficinas,
-- restringindo o RLS à oficina ativa da requisição (app.oficina) quando informada.
-- Sem app.oficina (uso interno de oficinaDaRequisicao para listar vínculos ativos),
-- devolve todas as oficinas ativas do usuário.

CREATE OR REPLACE FUNCTION public.app_oficinas() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH cfg AS (
    SELECT
      nullif(current_setting('app.usuario', true), '') AS usuario,
      nullif(current_setting('app.oficina', true), '') AS oficina
  )
  SELECT CASE
    WHEN cfg.usuario IS NULL THEN '{}'::uuid[]
    WHEN cfg.oficina IS NOT NULL
         AND cfg.oficina !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN '{}'::uuid[]
    ELSE coalesce(
      (
        SELECT array_agg(m.oficina_id)
        FROM membros m
        WHERE m.clerk_user_id = cfg.usuario
          AND m.ativo
          AND (cfg.oficina IS NULL OR m.oficina_id = cfg.oficina::uuid)
      ),
      '{}'::uuid[]
    )
  END
  FROM cfg
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_oficinas() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_oficinas() TO app_usuario;
