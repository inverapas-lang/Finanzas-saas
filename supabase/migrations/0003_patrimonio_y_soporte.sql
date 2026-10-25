-- =====================================================================
-- 0003_patrimonio_y_soporte.sql
-- Activos, pasivos, cuadro de amortización, documentos, escenarios,
-- notificaciones y auditoría.
-- =====================================================================

-- ---------------------------------------------------------------------
-- activos
-- ---------------------------------------------------------------------
create table public.activos (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    tipo tipo_activo not null,
    nombre text not null,
    valor_actual numeric(14, 2) not null,
    moneda char(3) not null default 'EUR',
    fecha_valoracion date not null default current_date,
    fuente_valoracion fuente_valoracion not null default 'manual',
    rentabilidad_estimada numeric(6, 4), -- ej. 0.0350 = 3.5% anual
    notas text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_activos_espacio on public.activos (espacio_id);

-- ---------------------------------------------------------------------
-- pasivos: hipotecas, préstamos, deudas
-- ---------------------------------------------------------------------
create table public.pasivos (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    tipo tipo_pasivo not null,
    nombre text not null,
    capital_inicial numeric(14, 2) not null,
    capital_pendiente numeric(14, 2) not null,
    moneda char(3) not null default 'EUR',
    tipo_interes_anual numeric(6, 4) not null, -- ej. 0.0310 = 3.1%
    cuota numeric(14, 2) not null,
    fecha_inicio date not null,
    plazo_meses integer not null check (plazo_meses > 0),
    tasacion_notas text,
    activo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_capital_pendiente check (capital_pendiente >= 0 and capital_pendiente <= capital_inicial)
);

create index idx_pasivos_espacio on public.pasivos (espacio_id);

-- ---------------------------------------------------------------------
-- cuadro_amortizacion: una fila por cuota, generada por el motor de cálculo
-- (paquete packages/loan-engine). No se edita a mano.
-- ---------------------------------------------------------------------
create table public.cuadro_amortizacion (
    id uuid primary key default gen_random_uuid(),
    pasivo_id uuid not null references public.pasivos (id) on delete cascade,
    numero_cuota integer not null,
    fecha date not null,
    cuota numeric(14, 2) not null,
    capital numeric(14, 2) not null,
    intereses numeric(14, 2) not null,
    capital_pendiente numeric(14, 2) not null,
    es_amortizacion_extra boolean not null default false,
    created_at timestamptz not null default now(),
    unique (pasivo_id, numero_cuota)
);

create index idx_cuadro_pasivo on public.cuadro_amortizacion (pasivo_id, numero_cuota);

-- ---------------------------------------------------------------------
-- documentos: adjuntos polimórficos (ingreso/gasto/activo/pasivo)
-- ---------------------------------------------------------------------
create table public.documentos (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    entidad_tipo entidad_documental not null,
    entidad_id uuid not null,
    url_storage text not null,
    nombre_archivo text not null,
    tipo_mime text not null,
    tamano_bytes bigint,
    subido_por uuid not null references public.usuarios (id),
    created_at timestamptz not null default now()
);

create index idx_documentos_entidad on public.documentos (entidad_tipo, entidad_id);
create index idx_documentos_espacio on public.documentos (espacio_id);

-- ---------------------------------------------------------------------
-- escenarios: simulaciones "qué pasaría si"
-- ---------------------------------------------------------------------
create table public.escenarios (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    nombre text not null,
    descripcion text,
    base_en_fecha date not null default current_date,
    created_by uuid not null references public.usuarios (id),
    created_at timestamptz not null default now()
);

create table public.escenario_ajustes (
    id uuid primary key default gen_random_uuid(),
    escenario_id uuid not null references public.escenarios (id) on delete cascade,
    tipo_ajuste tipo_ajuste_escenario not null,
    -- referencia opcional a una entidad real que el ajuste modifica (ej. un pasivo existente al simular amortización extra)
    entidad_referencia_id uuid,
    valor_nuevo jsonb not null, -- payload libre validado en la capa de aplicación según tipo_ajuste
    created_at timestamptz not null default now()
);

create index idx_escenarios_espacio on public.escenarios (espacio_id);
create index idx_escenario_ajustes_escenario on public.escenario_ajustes (escenario_id);

-- ---------------------------------------------------------------------
-- notificaciones
-- ---------------------------------------------------------------------
create table public.notificaciones (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null references public.usuarios (id) on delete cascade,
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    tipo text not null check (tipo in ('pago_proximo', 'cobro_pendiente', 'desviacion_presupuesto', 'gasto_anomalo', 'falta_liquidez')),
    mensaje text not null,
    leido boolean not null default false,
    entidad_tipo text,
    entidad_id uuid,
    created_at timestamptz not null default now()
);

create index idx_notificaciones_usuario on public.notificaciones (usuario_id, leido);

-- ---------------------------------------------------------------------
-- auditoria: trazabilidad de acciones sensibles (varios usuarios por espacio)
-- ---------------------------------------------------------------------
create table public.auditoria (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    usuario_id uuid references public.usuarios (id),
    accion text not null, -- ej. 'crear', 'editar', 'eliminar', 'invitar_usuario'
    entidad text not null, -- ej. 'gasto', 'pasivo', 'miembro_espacio'
    entidad_id uuid,
    detalle jsonb,
    created_at timestamptz not null default now()
);

create index idx_auditoria_espacio_fecha on public.auditoria (espacio_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.activos enable row level security;
alter table public.pasivos enable row level security;
alter table public.cuadro_amortizacion enable row level security;
alter table public.documentos enable row level security;
alter table public.escenarios enable row level security;
alter table public.escenario_ajustes enable row level security;
alter table public.notificaciones enable row level security;
alter table public.auditoria enable row level security;

create policy activos_select on public.activos for select using (public.es_miembro(espacio_id));
create policy activos_insert on public.activos for insert with check (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy activos_update on public.activos for update using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy activos_delete on public.activos for delete using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));

create policy pasivos_select on public.pasivos for select using (public.es_miembro(espacio_id));
create policy pasivos_insert on public.pasivos for insert with check (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy pasivos_update on public.pasivos for update using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy pasivos_delete on public.pasivos for delete using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));

-- cuadro_amortizacion no tiene espacio_id directo: se resuelve vía el pasivo padre
create policy cuadro_select on public.cuadro_amortizacion for select
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.es_miembro(p.espacio_id)));
create policy cuadro_insert on public.cuadro_amortizacion for insert
    with check (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));
create policy cuadro_update on public.cuadro_amortizacion for update
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));
create policy cuadro_delete on public.cuadro_amortizacion for delete
    using (exists (select 1 from public.pasivos p where p.id = pasivo_id and public.tiene_permiso(p.espacio_id, 'activos_pasivos:editar')));

create policy documentos_select on public.documentos for select using (public.es_miembro(espacio_id));
create policy documentos_insert on public.documentos for insert with check (public.tiene_permiso(espacio_id, 'documentos:editar'));
create policy documentos_delete on public.documentos for delete using (public.tiene_permiso(espacio_id, 'documentos:editar'));

create policy escenarios_select on public.escenarios for select using (public.es_miembro(espacio_id));
create policy escenarios_insert on public.escenarios for insert with check (public.es_miembro(espacio_id));
create policy escenarios_update on public.escenarios for update using (public.es_miembro(espacio_id));
create policy escenarios_delete on public.escenarios for delete using (public.es_miembro(espacio_id));

create policy escenario_ajustes_select on public.escenario_ajustes for select
    using (exists (select 1 from public.escenarios e where e.id = escenario_id and public.es_miembro(e.espacio_id)));
create policy escenario_ajustes_insert on public.escenario_ajustes for insert
    with check (exists (select 1 from public.escenarios e where e.id = escenario_id and public.es_miembro(e.espacio_id)));
create policy escenario_ajustes_delete on public.escenario_ajustes for delete
    using (exists (select 1 from public.escenarios e where e.id = escenario_id and public.es_miembro(e.espacio_id)));

create policy notificaciones_select on public.notificaciones for select using (usuario_id = auth.uid());
create policy notificaciones_update on public.notificaciones for update using (usuario_id = auth.uid());

create policy auditoria_select on public.auditoria for select using (public.es_miembro(espacio_id));
-- La auditoría solo la inserta el backend con service role (bypassa RLS); no se expone insert a clientes.
