-- =====================================================================
-- 0010_metas_ahorro.sql
-- Metas de ahorro: objetivos con importe/fecha objetivo y progreso
-- manual (mismo patrón que activos.valor_actual: el usuario actualiza
-- el importe conseguido a mano, sin agregación automática de saldos).
-- =====================================================================

create table public.metas_ahorro (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    nombre text not null,
    importe_objetivo numeric(14, 2) not null check (importe_objetivo > 0),
    importe_actual numeric(14, 2) not null default 0 check (importe_actual >= 0),
    moneda char(3) not null default 'EUR',
    fecha_objetivo date,
    cuenta_id uuid references public.cuentas_bancarias (id) on delete set null,
    notas text,
    activa boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_metas_ahorro_espacio on public.metas_ahorro (espacio_id);

alter table public.metas_ahorro enable row level security;

-- Mismo permiso que activos/pasivos: las metas de ahorro son patrimonio,
-- no un movimiento de caja, y no justifican un permiso granular propio.
create policy metas_ahorro_select on public.metas_ahorro
    for select using (public.es_miembro(espacio_id));
create policy metas_ahorro_insert on public.metas_ahorro
    for insert with check (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy metas_ahorro_update on public.metas_ahorro
    for update using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy metas_ahorro_delete on public.metas_ahorro
    for delete using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));

create trigger trg_set_updated_at before update on public.metas_ahorro
    for each row execute function public.f_set_updated_at();
