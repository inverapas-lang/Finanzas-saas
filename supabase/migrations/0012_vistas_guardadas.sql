-- =====================================================================
-- 0012_vistas_guardadas.sql
-- Gráficos "fijados": el usuario configura un gráfico en /dashboard/graficos
-- (qué métrica, rango de fechas, tipo) y lo guarda para que aparezca ya
-- montado la próxima vez que entre, recalculado con los datos del momento
-- (no es una foto fija) — por eso `configuracion` guarda un rango
-- relativo ('ultimos_6_meses', etc.) cuando aplica, en vez de fechas fijas.
-- =====================================================================

create table public.vistas_guardadas (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    nombre text not null,
    configuracion jsonb not null,
    orden integer not null default 0,
    created_by uuid not null references public.usuarios (id),
    created_at timestamptz not null default now()
);

create index idx_vistas_guardadas_espacio on public.vistas_guardadas (espacio_id);

alter table public.vistas_guardadas enable row level security;

-- Mismo criterio que reglas_recurrentes: toca tanto ingresos como gastos,
-- así que basta con tener permiso de edición sobre cualquiera de los dos.
create policy vistas_guardadas_select on public.vistas_guardadas
    for select using (public.es_miembro(espacio_id));
create policy vistas_guardadas_insert on public.vistas_guardadas
    for insert with check (
        public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar')
    );
create policy vistas_guardadas_update on public.vistas_guardadas
    for update using (
        public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar')
    );
create policy vistas_guardadas_delete on public.vistas_guardadas
    for delete using (
        public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar')
    );
