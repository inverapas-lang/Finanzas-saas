-- =====================================================================
-- 0002_movimientos.sql
-- Cuentas, categorías, reglas recurrentes, ingresos, gastos, presupuestos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- cuentas_bancarias
-- ---------------------------------------------------------------------
create table public.cuentas_bancarias (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    nombre text not null,
    entidad text,
    tipo tipo_cuenta not null default 'corriente',
    moneda char(3) not null default 'EUR',
    saldo_actual numeric(14, 2) not null default 0,
    activa boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_cuentas_espacio on public.cuentas_bancarias (espacio_id);

-- ---------------------------------------------------------------------
-- categorias: jerárquica (categoría > subcategoría), por espacio
-- ---------------------------------------------------------------------
create table public.categorias (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    tipo tipo_movimiento not null,
    nombre text not null,
    categoria_padre_id uuid references public.categorias (id) on delete set null,
    color text,
    icono text,
    orden integer not null default 0,
    created_at timestamptz not null default now(),
    unique (espacio_id, tipo, nombre, categoria_padre_id)
);

create index idx_categorias_espacio on public.categorias (espacio_id);
create index idx_categorias_padre on public.categorias (categoria_padre_id);

-- Evita que una categoría sea su propio ancestro (protección básica anti-ciclo)
alter table public.categorias
    add constraint chk_categoria_no_autopadre check (id <> categoria_padre_id);

-- ---------------------------------------------------------------------
-- reglas_recurrentes: plantillas que generan ingresos/gastos futuros
-- ---------------------------------------------------------------------
create table public.reglas_recurrentes (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    tipo tipo_movimiento not null,
    categoria_id uuid references public.categorias (id),
    cuenta_id uuid references public.cuentas_bancarias (id),
    descripcion text not null,
    importe numeric(14, 2) not null,
    moneda char(3) not null default 'EUR',
    periodicidad periodicidad not null,
    fecha_inicio date not null,
    fecha_fin date,
    activa boolean not null default true,
    created_at timestamptz not null default now(),
    constraint chk_recurrente_fechas check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create index idx_reglas_espacio on public.reglas_recurrentes (espacio_id);

-- ---------------------------------------------------------------------
-- ingresos
-- ---------------------------------------------------------------------
create table public.ingresos (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    categoria_id uuid references public.categorias (id),
    cuenta_id uuid references public.cuentas_bancarias (id),
    regla_recurrente_id uuid references public.reglas_recurrentes (id) on delete set null,
    descripcion text not null,
    importe_esperado numeric(14, 2) not null,
    importe_real numeric(14, 2),
    moneda char(3) not null default 'EUR',
    fecha_prevista date not null,
    fecha_cobrada date,
    periodicidad periodicidad not null default 'unico',
    observaciones text,
    created_by uuid not null references public.usuarios (id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_ingresos_espacio_fecha on public.ingresos (espacio_id, fecha_prevista);
create index idx_ingresos_categoria on public.ingresos (categoria_id);
create index idx_ingresos_cuenta on public.ingresos (cuenta_id);

-- ---------------------------------------------------------------------
-- gastos
-- ---------------------------------------------------------------------
create table public.gastos (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    categoria_id uuid references public.categorias (id),
    subcategoria_id uuid references public.categorias (id),
    cuenta_id uuid references public.cuentas_bancarias (id),
    regla_recurrente_id uuid references public.reglas_recurrentes (id) on delete set null,
    descripcion text not null,
    importe_previsto numeric(14, 2) not null,
    importe_real numeric(14, 2),
    moneda char(3) not null default 'EUR',
    fecha_prevista date not null,
    fecha_pagada date,
    periodicidad periodicidad not null default 'unico',
    notas text,
    created_by uuid not null references public.usuarios (id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_gastos_espacio_fecha on public.gastos (espacio_id, fecha_prevista);
create index idx_gastos_categoria on public.gastos (categoria_id);
create index idx_gastos_cuenta on public.gastos (cuenta_id);

-- ---------------------------------------------------------------------
-- presupuestos: planificación por categoría y periodo
-- ---------------------------------------------------------------------
create table public.presupuestos (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    categoria_id uuid not null references public.categorias (id),
    periodo_tipo text not null check (periodo_tipo in ('mensual', 'anual')),
    periodo_inicio date not null, -- primer día del mes o del año presupuestado
    importe_planificado numeric(14, 2) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (espacio_id, categoria_id, periodo_tipo, periodo_inicio)
);

create index idx_presupuestos_espacio on public.presupuestos (espacio_id, periodo_inicio);

-- ---------------------------------------------------------------------
-- tipos_cambio: soporte multidivisa para agregados
-- ---------------------------------------------------------------------
create table public.tipos_cambio (
    id uuid primary key default gen_random_uuid(),
    moneda_origen char(3) not null,
    moneda_destino char(3) not null,
    fecha date not null,
    tasa numeric(18, 8) not null,
    created_at timestamptz not null default now(),
    unique (moneda_origen, moneda_destino, fecha)
);

comment on table public.tipos_cambio is 'Tabla global (no depende de espacio_id) alimentada diariamente por un job externo de tipos de cambio.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.cuentas_bancarias enable row level security;
alter table public.categorias enable row level security;
alter table public.reglas_recurrentes enable row level security;
alter table public.ingresos enable row level security;
alter table public.gastos enable row level security;
alter table public.presupuestos enable row level security;
alter table public.tipos_cambio enable row level security;

-- tipos_cambio: lectura para cualquier usuario autenticado, escritura solo backend (service role)
create policy tipos_cambio_select_autenticado on public.tipos_cambio
    for select using (auth.role() = 'authenticated');

-- Patrón repetido para cada tabla de negocio con espacio_id:
--   SELECT  -> es_miembro(espacio_id)
--   INSERT  -> tiene_permiso(espacio_id, '<permiso>:editar')
--   UPDATE  -> tiene_permiso(espacio_id, '<permiso>:editar')
--   DELETE  -> tiene_permiso(espacio_id, '<permiso>:editar')

create policy cuentas_select on public.cuentas_bancarias for select using (public.es_miembro(espacio_id));
create policy cuentas_insert on public.cuentas_bancarias for insert with check (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy cuentas_update on public.cuentas_bancarias for update using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy cuentas_delete on public.cuentas_bancarias for delete using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));

create policy categorias_select on public.categorias for select using (public.es_miembro(espacio_id));
create policy categorias_insert on public.categorias for insert with check (public.es_miembro(espacio_id));
create policy categorias_update on public.categorias for update using (public.es_miembro(espacio_id));
create policy categorias_delete on public.categorias for delete using (public.es_miembro(espacio_id));

create policy reglas_select on public.reglas_recurrentes for select using (public.es_miembro(espacio_id));
create policy reglas_insert on public.reglas_recurrentes for insert with check (public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar'));
create policy reglas_update on public.reglas_recurrentes for update using (public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar'));
create policy reglas_delete on public.reglas_recurrentes for delete using (public.tiene_permiso(espacio_id, 'ingresos:editar') or public.tiene_permiso(espacio_id, 'gastos:editar'));

create policy ingresos_select on public.ingresos for select using (public.es_miembro(espacio_id));
create policy ingresos_insert on public.ingresos for insert with check (public.tiene_permiso(espacio_id, 'ingresos:editar'));
create policy ingresos_update on public.ingresos for update using (public.tiene_permiso(espacio_id, 'ingresos:editar'));
create policy ingresos_delete on public.ingresos for delete using (public.tiene_permiso(espacio_id, 'ingresos:editar'));

create policy gastos_select on public.gastos for select using (public.es_miembro(espacio_id));
create policy gastos_insert on public.gastos for insert with check (public.tiene_permiso(espacio_id, 'gastos:editar'));
create policy gastos_update on public.gastos for update using (public.tiene_permiso(espacio_id, 'gastos:editar'));
create policy gastos_delete on public.gastos for delete using (public.tiene_permiso(espacio_id, 'gastos:editar'));

create policy presupuestos_select on public.presupuestos for select using (public.es_miembro(espacio_id));
create policy presupuestos_insert on public.presupuestos for insert with check (public.tiene_permiso(espacio_id, 'presupuestos:editar'));
create policy presupuestos_update on public.presupuestos for update using (public.tiene_permiso(espacio_id, 'presupuestos:editar'));
create policy presupuestos_delete on public.presupuestos for delete using (public.tiene_permiso(espacio_id, 'presupuestos:editar'));
