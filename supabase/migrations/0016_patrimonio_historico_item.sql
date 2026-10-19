-- =====================================================================
-- 0016_patrimonio_historico_item.sql
-- Detalle línea a línea del histórico de patrimonio: una fila por
-- espacio, mes, bloque (cuenta / inversión líquida / inversión
-- intocable / inversión ilíquida / deuda) y concepto concreto (p. ej.
-- "Cta Santander", "Revolut Piso Alicante", "Cannabis", "Nissan").
--
-- patrimonio_historico (migración 0015) solo guarda 5 TOTALES por mes
-- y bloque — suficiente para ver la evolución global, pero no permite
-- filtrar ni graficar por una cuenta/inversión/deuda concreta como sí
-- se puede en la hoja de cálculo de origen. Esta tabla añade justo ese
-- nivel de detalle; patrimonio_historico se deja tal cual (no se migra
-- ni se borra) porque sigue siendo válida como entrada rápida de solo
-- totales para quien no quiera llevar el detalle por concepto.
-- =====================================================================

create table public.patrimonio_historico_item (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    mes date not null, -- siempre día 1 del mes, ej. 2026-01-01
    bloque text not null check (
        bloque in ('cuenta', 'inversion_liquida', 'inversion_intocable', 'inversion_iliquida', 'deuda')
    ),
    concepto text not null,
    valor numeric(14, 2) not null default 0,
    notas text,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (espacio_id, mes, bloque, concepto)
);

create index idx_patrimonio_historico_item_espacio on public.patrimonio_historico_item (espacio_id, mes);

alter table public.patrimonio_historico_item enable row level security;

-- Mismo permiso que patrimonio_historico/activos/pasivos.
create policy patrimonio_historico_item_select on public.patrimonio_historico_item
    for select using (public.es_miembro(espacio_id));
create policy patrimonio_historico_item_insert on public.patrimonio_historico_item
    for insert with check (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy patrimonio_historico_item_update on public.patrimonio_historico_item
    for update using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy patrimonio_historico_item_delete on public.patrimonio_historico_item
    for delete using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));

create trigger trg_set_updated_at before update on public.patrimonio_historico_item
    for each row execute function public.f_set_updated_at();
