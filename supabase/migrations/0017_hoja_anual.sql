-- =====================================================================
-- 0017_hoja_anual.sql
-- Soporte para la "hoja anual" (/dashboard/hoja-anual), la réplica de la
-- hoja de presupuesto del Excel del usuario: ingresos y gastos en una sola
-- tabla, concepto x mes, con un bloque de resultados debajo.
--
-- 1. `formula` en ingresos/gastos: en el Excel muchas celdas son sumas
--    escritas a mano (=2100,74+3379,32). Se guarda el resultado en los
--    importes de siempre (el resto de la app no cambia) y, aparte, la
--    expresión tal cual la escribió el usuario, para enseñársela de nuevo
--    al editar la celda.
-- 2. `hoja_anual_config`: lo que el Excel tenía como filas a mano o como
--    fórmulas que apuntan a filas concretas (forecast mensual, saldo
--    inicial de cuentas, qué categorías son "amortizaciones anticipadas"
--    o "ingresos sin trabajo"...). Una fila por espacio y año, en jsonb
--    porque son ajustes de presentación que validará la API, no datos que
--    se consulten por SQL.
-- =====================================================================

alter table public.ingresos add column formula text;
alter table public.gastos add column formula text;

create table public.hoja_anual_config (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    anio integer not null check (anio between 2000 and 2100),
    configuracion jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (espacio_id, anio)
);

alter table public.hoja_anual_config enable row level security;

-- Mismo criterio que vistas_guardadas: afecta a ingresos y gastos a la vez.
create policy hoja_anual_config_select on public.hoja_anual_config
    for select using (public.es_miembro(espacio_id));
create policy hoja_anual_config_insert on public.hoja_anual_config
    for insert with check (
        public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar')
    );
create policy hoja_anual_config_update on public.hoja_anual_config
    for update using (
        public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar')
    );
create policy hoja_anual_config_delete on public.hoja_anual_config
    for delete using (
        public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar')
    );

create trigger trg_set_updated_at before update on public.hoja_anual_config
    for each row execute function public.f_set_updated_at();
