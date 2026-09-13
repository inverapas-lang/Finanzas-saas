-- =====================================================================
-- 0011_integraciones_bancarias.sql
-- Conexión con bancos españoles vía un agregador Open Banking/PSD2
-- (GoCardless Bank Account Data — no hablamos directamente con cada
-- banco: eso exigiría ser una entidad AISP registrada ante el Banco de
-- España). Guarda la vinculación (conexiones_bancarias), enlaza cuentas
-- existentes/nuevas con la cuenta externa, y registra qué transacciones
-- del banco ya se han importado para no duplicarlas en cada sincronización.
-- =====================================================================

create type proveedor_banco as enum ('gocardless');
create type estado_conexion_bancaria as enum ('pendiente', 'vinculada', 'expirada', 'error', 'revocada');

create table public.conexiones_bancarias (
    id uuid primary key default gen_random_uuid(),
    espacio_id uuid not null references public.espacios_financieros (id) on delete cascade,
    proveedor proveedor_banco not null default 'gocardless',
    institucion_id text not null,
    institucion_nombre text not null,
    requisition_id text not null unique,
    estado estado_conexion_bancaria not null default 'pendiente',
    max_historical_days integer not null default 90,
    error_mensaje text,
    created_by uuid not null references public.usuarios (id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_conexiones_bancarias_espacio on public.conexiones_bancarias (espacio_id);

alter table public.cuentas_bancarias
    add column conexion_bancaria_id uuid references public.conexiones_bancarias (id) on delete set null,
    add column cuenta_externa_id text,
    add column iban text,
    add column ultima_sincronizacion timestamptz;

-- Evita vincular la misma cuenta externa dos veces dentro de la misma conexión.
create unique index idx_cuentas_bancarias_externa on public.cuentas_bancarias (conexion_bancaria_id, cuenta_externa_id)
    where conexion_bancaria_id is not null;

create table public.transacciones_externas (
    id uuid primary key default gen_random_uuid(),
    cuenta_bancaria_id uuid not null references public.cuentas_bancarias (id) on delete cascade,
    transaccion_externa_id text not null,
    ingreso_id uuid references public.ingresos (id) on delete set null,
    gasto_id uuid references public.gastos (id) on delete set null,
    importe numeric(14, 2) not null,
    fecha date not null,
    descripcion text,
    created_at timestamptz not null default now(),
    constraint uq_transaccion_externa unique (cuenta_bancaria_id, transaccion_externa_id)
);

create index idx_transacciones_externas_cuenta on public.transacciones_externas (cuenta_bancaria_id);

alter table public.conexiones_bancarias enable row level security;
alter table public.transacciones_externas enable row level security;

create policy conexiones_bancarias_select on public.conexiones_bancarias
    for select using (public.es_miembro(espacio_id));
create policy conexiones_bancarias_insert on public.conexiones_bancarias
    for insert with check (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy conexiones_bancarias_update on public.conexiones_bancarias
    for update using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));
create policy conexiones_bancarias_delete on public.conexiones_bancarias
    for delete using (public.tiene_permiso(espacio_id, 'activos_pasivos:editar'));

-- transacciones_externas no tiene espacio_id propio: se resuelve vía la
-- cuenta bancaria a la que pertenece (mismo patrón que cuadro_amortizacion
-- respecto a pasivos en la migración 0003).
create policy transacciones_externas_select on public.transacciones_externas
    for select using (
        exists (
            select 1 from public.cuentas_bancarias cb
            where cb.id = transacciones_externas.cuenta_bancaria_id
              and public.es_miembro(cb.espacio_id)
        )
    );
create policy transacciones_externas_insert on public.transacciones_externas
    for insert with check (
        exists (
            select 1 from public.cuentas_bancarias cb
            where cb.id = transacciones_externas.cuenta_bancaria_id
              and public.tiene_permiso(cb.espacio_id, 'activos_pasivos:editar')
        )
    );
create policy transacciones_externas_delete on public.transacciones_externas
    for delete using (
        exists (
            select 1 from public.cuentas_bancarias cb
            where cb.id = transacciones_externas.cuenta_bancaria_id
              and public.tiene_permiso(cb.espacio_id, 'activos_pasivos:editar')
        )
    );

create trigger trg_set_updated_at before update on public.conexiones_bancarias
    for each row execute function public.f_set_updated_at();
