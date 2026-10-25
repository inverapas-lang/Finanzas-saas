-- =====================================================================
-- 0008_invitaciones.sql
-- Permite invitar a un usuario existente a un espacio financiero por
-- email, sin romper el aislamiento de RLS entre usuarios.
--
-- Problema que resuelve: la política de usuarios_select_propio impide
-- que un usuario lea la fila de otro (correcto, es justo lo que da
-- seguridad). Pero para invitar a alguien por email hace falta poder
-- comprobar "¿existe una cuenta con este email?" sin exponer el resto
-- de la tabla usuarios a cualquiera. La función de abajo expone
-- ÚNICAMENTE el id (no el nombre, no si tiene MFA, nada más) y solo si
-- el email coincide EXACTO — no permite búsquedas parciales.
-- =====================================================================

create or replace function public.buscar_usuario_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id from public.usuarios where email = lower(trim(p_email)) limit 1;
$$;

comment on function public.buscar_usuario_por_email is 'Devuelve el id de un usuario por email exacto, o null si no existe. No expone ningún otro dato de la tabla usuarios. Usado únicamente para el flujo de invitar miembros a un espacio.';

grant execute on function public.buscar_usuario_por_email(text) to authenticated;

-- Normalizamos el email a minúsculas al guardar, para que la búsqueda
-- exacta de arriba funcione siempre independientemente de cómo lo haya
-- escrito cada uno al registrarse.
create or replace function public.f_normalizar_email()
returns trigger
language plpgsql
as $$
begin
    new.email := lower(trim(new.email));
    return new;
end;
$$;

create trigger trg_normalizar_email
    before insert or update on public.usuarios
    for each row execute function public.f_normalizar_email();

-- Aplicamos la normalización también a los emails ya existentes.
update public.usuarios set email = lower(trim(email));
