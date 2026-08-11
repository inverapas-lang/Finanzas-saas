-- =====================================================================
-- 0001_core_schema.sql
-- Núcleo: usuarios, espacios financieros, membresías y permisos.
-- Requiere Supabase (auth.users ya existe, gestionado por Supabase Auth).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
create type rol_miembro as enum ('owner', 'usuario', 'asesor', 'invitado');
create type tipo_movimiento as enum ('ingreso', 'gasto');
create type periodicidad as enum ('unico', 'semanal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual');
create type tipo_cuenta as enum ('corriente', 'ahorro', 'inversion', 'efectivo');
create type tipo_activo as enum ('vivienda', 'fondo', 'accion', 'etf', 'deposito', 'efectivo', 'otro');
create type tipo_pasivo as enum ('hipoteca', 'prestamo_personal', 'prestamo_vehiculo', 'deuda_tarjeta', 'otro');
create type fuente_valoracion as enum ('manual', 'api_externa');
create type entidad_documental as enum ('ingreso', 'gasto', 'activo', 'pasivo');
create type tipo_ajuste_escenario as enum ('nuevo_ingreso', 'nuevo_gasto', 'baja_ingreso', 'baja_gasto', 'amortizacion_extra', 'nuevo_pasivo', 'nuevo_activo');

-- ---------------------------------------------------------------------
-- usuarios: perfil de aplicación 1:1 con auth.users (Supabase Auth)
-- ---------------------------------------------------------------------
create table public.usuarios (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null,
    nombre text not null,
    mfa_enabled boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.usuarios is 'Perfil de aplicación asociado 1:1 a auth.users. No almacena contraseñas: eso lo gestiona Supabase Auth.';

-- ---------------------------------------------------------------------
-- espacios_financieros: unidad de aislamiento multi-tenant
-- ---------------------------------------------------------------------
create table public.espacios_financieros (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    moneda_base char(3) not null default 'EUR',
    created_by uuid not null references public.usuarios (id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.espacios_financieros is 'Tenant: contenedor aislado de todos los datos financieros de un cliente (individual o compartido).';
comment on column public.espacios_financieros.moneda_base is 'Código ISO 4217. Moneda usada para agregados de dashboard/patrimonio.';

-- ---------------------------------------------------------------------
-- miembros_espacio: quién tiene acceso a cada espacio y con qué rol/permisos
-- ---------------------------------------------------------------------
create table public.miembros_espacio (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    usuario_id uuid not null references public.usuarios (id) on delete cascade,
    rol rol_miembro not null default 'usuario',
    -- Permisos granulares que complementan el rol. Claves esperadas:
    -- 'ingresos:editar', 'gastos:editar', 'presupuestos:editar',
    -- 'activos_pasivos:editar', 'usuarios:administrar', 'documentos:editar'
    permisos jsonb not null default '{}'::jsonb,
    invitado_por uuid references public.usuarios (id),
    created_at timestamptz not null default now(),
    unique (espacio_id, usuario_id)
);

comment on table public.miembros_espacio is 'Relación usuario<->espacio con rol y permisos granulares. El owner tiene siempre todos los permisos implícitamente.';

create index idx_miembros_espacio_usuario on public.miembros_espacio (usuario_id);
create index idx_miembros_espacio_espacio on public.miembros_espacio (espacio_id);

-- Al crear un miembro, si no se especifican permisos, se rellenan por defecto según el rol.
create or replace function public.f_default_permisos_por_rol()
returns trigger
language plpgsql
as $$
begin
    if new.permisos is null or new.permisos = '{}'::jsonb then
        new.permisos := case new.rol
            when 'owner' then '{"ingresos:editar": true, "gastos:editar": true, "presupuestos:editar": true, "activos_pasivos:editar": true, "usuarios:administrar": true, "documentos:editar": true}'::jsonb
            when 'usuario' then '{"ingresos:editar": true, "gastos:editar": true, "presupuestos:editar": true, "activos_pasivos:editar": true, "usuarios:administrar": false, "documentos:editar": true}'::jsonb
            when 'asesor' then '{"ingresos:editar": false, "gastos:editar": false, "presupuestos:editar": false, "activos_pasivos:editar": false, "usuarios:administrar": false, "documentos:editar": false}'::jsonb
            when 'invitado' then '{"ingresos:editar": false, "gastos:editar": false, "presupuestos:editar": false, "activos_pasivos:editar": false, "usuarios:administrar": false, "documentos:editar": false}'::jsonb
        end;
    end if;
    return new;
end;
$$;

create trigger trg_default_permisos
    before insert on public.miembros_espacio
    for each row execute function public.f_default_permisos_por_rol();

-- ---------------------------------------------------------------------
-- Funciones de autorización reutilizadas por las políticas RLS de todas
-- las tablas de negocio (se definen aquí porque dependen de miembros_espacio)
-- ---------------------------------------------------------------------
create or replace function public.es_miembro(p_espacio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.miembros_espacio m
        where m.espacio_id = p_espacio_id
          and m.usuario_id = auth.uid()
    );
$$;

create or replace function public.tiene_permiso(p_espacio_id uuid, p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.miembros_espacio m
        where m.espacio_id = p_espacio_id
          and m.usuario_id = auth.uid()
          and (m.rol = 'owner' or (m.permisos ->> p_permiso)::boolean is true)
    );
$$;

comment on function public.es_miembro is 'Devuelve true si el usuario autenticado pertenece al espacio (cualquier rol). Usado para políticas SELECT.';
comment on function public.tiene_permiso is 'Devuelve true si el usuario autenticado es owner del espacio o tiene el permiso concreto en su JSON de permisos. Usado para políticas INSERT/UPDATE/DELETE.';

-- ---------------------------------------------------------------------
-- RLS: usuarios, espacios_financieros, miembros_espacio
-- ---------------------------------------------------------------------
alter table public.usuarios enable row level security;
alter table public.espacios_financieros enable row level security;
alter table public.miembros_espacio enable row level security;

create policy usuarios_select_propio on public.usuarios
    for select using (id = auth.uid());

create policy usuarios_update_propio on public.usuarios
    for update using (id = auth.uid());

create policy espacios_select_miembro on public.espacios_financieros
    for select using (public.es_miembro(id));

create policy espacios_insert_autenticado on public.espacios_financieros
    for insert with check (created_by = auth.uid());

create policy espacios_update_owner on public.espacios_financieros
    for update using (public.tiene_permiso(id, 'usuarios:administrar'));

create policy miembros_select_miembro on public.miembros_espacio
    for select using (public.es_miembro(espacio_id));

create policy miembros_insert_admin on public.miembros_espacio
    for insert with check (public.tiene_permiso(espacio_id, 'usuarios:administrar'));

create policy miembros_update_admin on public.miembros_espacio
    for update using (public.tiene_permiso(espacio_id, 'usuarios:administrar'));

create policy miembros_delete_admin on public.miembros_espacio
    for delete using (public.tiene_permiso(espacio_id, 'usuarios:administrar'));
