-- =====================================================================
-- 0014_completar_registro.sql
-- Cierra un agujero de bootstrap que llevaba desde la migración 0001:
-- un usuario nuevo (recién dado de alta en Supabase Auth) NO PODÍA
-- completar su alta en la aplicación por sí mismo.
--
-- Motivo: la tabla `usuarios` no tiene ninguna política de INSERT (nadie
-- puede crear ni su propia fila), y `miembros_espacio_insert` exige
-- `tiene_permiso(espacio_id, 'usuarios:administrar')` — permiso que solo
-- da... una fila en `miembros_espacio`. El primer alta de cualquier
-- usuario es, por diseño de RLS, un huevo y la gallina irresoluble desde
-- el cliente. Hasta ahora se resolvía a mano por SQL en cada alta nueva
-- — inviable para un SaaS real con registro propio.
--
-- Esta función, ejecutada como `security definer` (salta RLS, pero solo
-- para EXACTAMENTE esta operación fija, nunca acceso arbitrario), crea
-- el perfil `usuarios` + un espacio propio + la membresía 'owner' la
-- primera vez que un usuario autenticado la llama. Es idempotente: si ya
-- tiene perfil, no toca nada y devuelve su espacio existente — así se
-- puede llamar sin miedo tanto justo tras el registro como en cada login
-- (cubre el caso de que Supabase Auth exija confirmar el email antes de
-- dar sesión: el alta real ocurre en el primer login que sí trae sesión).
-- =====================================================================

create or replace function public.completar_registro()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_email text;
    v_nombre text;
    v_nombre_espacio text;
    v_espacio_id uuid;
begin
    if v_uid is null then
        raise exception 'No autenticado';
    end if;

    if exists (select 1 from public.usuarios where id = v_uid) then
        select m.espacio_id into v_espacio_id
        from public.miembros_espacio m
        where m.usuario_id = v_uid
        order by m.created_at asc
        limit 1;
        return v_espacio_id;
    end if;

    select au.email,
           au.raw_user_meta_data ->> 'nombre',
           au.raw_user_meta_data ->> 'nombre_espacio'
      into v_email, v_nombre, v_nombre_espacio
    from auth.users au
    where au.id = v_uid;

    insert into public.usuarios (id, email, nombre)
    values (v_uid, v_email, coalesce(nullif(trim(v_nombre), ''), split_part(v_email, '@', 1)));

    insert into public.espacios_financieros (nombre, created_by)
    values (coalesce(nullif(trim(v_nombre_espacio), ''), 'Mi espacio'), v_uid)
    returning id into v_espacio_id;

    insert into public.miembros_espacio (espacio_id, usuario_id, rol)
    values (v_espacio_id, v_uid, 'owner');

    return v_espacio_id;
end;
$$;

comment on function public.completar_registro is 'Bootstrap idempotente del primer alta de un usuario: crea public.usuarios + un espacio propio + membresía owner si todavía no existen. security definer porque el INSERT normal en miembros_espacio exige ya tener el permiso que solo da esa misma fila. Debe llamarse desde el cliente justo tras signUp() (si ya hay sesión) y/o tras cada login, es un no-op seguro si el usuario ya tiene perfil.';

grant execute on function public.completar_registro() to authenticated;
