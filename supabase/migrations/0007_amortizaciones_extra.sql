-- =====================================================================
-- 0007_amortizaciones_extra.sql
-- Registro de amortizaciones anticipadas REALES (dinero de más que ya se
-- ha aportado para reducir capital), análogo a revisiones_tipo_interes
-- pero para el otro tipo de evento real que afecta al cuadro.
-- =====================================================================

create type estrategia_amortizacion_extra as enum ('reducir_cuota', 'reducir_plazo');

create table public.amortizaciones_extra (
    id uuid primary key default gen_random_uuid(),
    pasivo_id uuid not null references public.pasivos (id) on delete cascade,
    numero_cuota integer not null, -- cuota tras la que se aplica
    fecha date not null,
    importe numeric(14, 2) not null check (importe > 0),
    estrategia estrategia_amortizacion_extra not null,
    notas text,
    created_by uuid not null references public.usuarios (id),
    created_at timestamptz not null default now()
);

comment on table public.amortizaciones_extra is 'Amortizaciones anticipadas reales ya realizadas (no simulaciones). Alimenta amortizacionesExtra del motor de amortización (packages/loan-engine) al regenerar el cuadro.';

create index idx_amortizaciones_extra_pasivo on public.amortizaciones_extra (pasivo_id, numero_cuota);

alter table public.amortizaciones_extra enable row level security;

create policy amortizaciones_extra_select on public.amortizaciones_extra for select
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.es_miembro(p.espacio_id)));
create policy amortizaciones_extra_insert on public.amortizaciones_extra for insert
    with check (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));
create policy amortizaciones_extra_update on public.amortizaciones_extra for update
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));
create policy amortizaciones_extra_delete on public.amortizaciones_extra for delete
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));
