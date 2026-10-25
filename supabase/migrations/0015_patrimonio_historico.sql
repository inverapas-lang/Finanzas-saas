-- =====================================================================
-- 0015_patrimonio_historico.sql
-- Histórico mensual de patrimonio neto: una fila por espacio y mes con
-- los grandes bloques (cuentas, inversiones líquidas, inversiones
-- líquidas pero "intocables" como fondos de jubilación/emergencia,
-- inversiones ilíquidas, deuda). activos/pasivos/cuentas_bancarias ya
-- guardan el valor ACTUAL de cada elemento, pero no un histórico — esta
-- tabla es justo eso: una fotografía mensual de los totales, igual que
-- llevaría alguien a mano en una hoja de cálculo.
--
-- Se guardan los totales por bloque, no el valor de cada cuenta/activo
-- individual: así se puede cargar un histórico de meses pasados sin
-- tener que reconstruir cada cuenta/activo/pasivo tal y como existía
-- ese mes (que además podría haber desaparecido o cambiado de nombre
-- desde entonces). El patrimonio neto se calcula en la aplicación
-- (suma de bloques - deuda), no se guarda aquí.
-- =====================================================================

create table public.patrimonio_historico (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    mes date not null, -- siempre día 1 del mes, ej. 2026-01-01
    total_cuentas numeric(14, 2) not null default 0,
    total_inversiones_liquidas numeric(14, 2) not null default 0,
    total_inversiones_intocables numeric(14, 2) not null default 0,
    total_inversiones_iliquidas numeric(14, 2) not null default 0,
    total_deuda numeric(14, 2) not null default 0,
    notas text,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (espacio_id, mes)
);

create index idx_patrimonio_historico_espacio on public.patrimonio_historico (espacio_id, mes);

alter table public.patrimonio_historico enable row level security;

-- Mismo permiso que activos/pasivos: esto es patrimonio, no un
-- movimiento de caja, y no justifica un permiso granular propio.
create policy patrimonio_historico_select on public.patrimonio_historico
    for select using (public.es_miembro(espacio_id));
create policy patrimonio_historico_insert on public.patrimonio_historico
    for insert with check (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy patrimonio_historico_update on public.patrimonio_historico
    for update using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy patrimonio_historico_delete on public.patrimonio_historico
    for delete using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));

create trigger trg_set_updated_at before update on public.patrimonio_historico
    for each row execute function public.f_set_updated_at();
