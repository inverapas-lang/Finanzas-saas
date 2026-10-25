-- =====================================================================
-- 0006_revisiones_tipo_interes.sql
-- Historial de revisiones de tipo de interés de una hipoteca variable o
-- mixta. Cada fila es un hecho real: "en esta fecha, el índice publicado
-- valía X, y con el diferencial de esta hipoteca el tipo aplicado pasó a
-- ser Y". La aplicación (o tú a mano) introduce estos valores cuando
-- ocurren de verdad — esta tabla NUNCA se rellena automáticamente con
-- valores de Euribor traídos de ninguna fuente externa sin tu conocimiento.
-- =====================================================================

create table public.revisiones_tipo_interes (
    id uuid primary key default gen_random_uuid(),
    pasivo_id uuid not null references public.pasivos (id) on delete cascade,
    numero_cuota integer not null, -- cuota desde la que aplica esta revisión
    fecha date not null,
    indicador_valor numeric(6, 4), -- valor publicado del índice ese día (ej. Euribor 12M = 0.0335). Null si tipo fijo puro.
    tipo_total_aplicado numeric(6, 4) not null, -- indicador_valor + diferencial de la hipoteca, ya resuelto
    notas text,
    created_by uuid not null references public.usuarios (id),
    created_at timestamptz not null default now(),
    unique (pasivo_id, numero_cuota)
);

comment on table public.revisiones_tipo_interes is 'Historial real de revisiones de tipo de interés de una hipoteca variable/mixta. Alimenta cambiosTipoInteres del motor de amortización (packages/loan-engine).';
comment on column public.revisiones_tipo_interes.indicador_valor is 'Valor del índice de referencia (ej. Euribor) publicado en la fecha de revisión. Introducido a mano o desde un import, nunca generado automáticamente por el sistema.';
comment on column public.revisiones_tipo_interes.tipo_total_aplicado is 'Tipo de interés total resultante (indicador_valor + diferencial), el que de verdad se usa en el cálculo de la cuota.';

create index idx_revisiones_pasivo on public.revisiones_tipo_interes (pasivo_id, numero_cuota);

alter table public.revisiones_tipo_interes enable row level security;

create policy revisiones_select on public.revisiones_tipo_interes for select
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.es_miembro(p.espacio_id)));
create policy revisiones_insert on public.revisiones_tipo_interes for insert
    with check (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));
create policy revisiones_update on public.revisiones_tipo_interes for update
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));
create policy revisiones_delete on public.revisiones_tipo_interes for delete
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));
