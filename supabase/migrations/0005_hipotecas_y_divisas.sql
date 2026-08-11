-- =====================================================================
-- 0005_hipotecas_y_divisas.sql
-- Detalle de tipo de hipoteca (fijo/variable/mixto + indicador de
-- referencia) y soporte real de conversión de divisas para ingresos/gastos
-- cobrados o pagados en una moneda distinta a la del espacio financiero.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos enumerados nuevos
-- ---------------------------------------------------------------------
create type tipo_tasa_hipoteca as enum ('fijo', 'variable', 'mixto');
create type indicador_referencia_hipoteca as enum (
    'euribor_3m', 'euribor_6m', 'euribor_12m', 'otro', 'ninguno'
);

-- ---------------------------------------------------------------------
-- pasivos: detalle de hipoteca (solo aplica cuando tipo = 'hipoteca';
-- para préstamos personales/vehículo estas columnas quedan en null)
-- ---------------------------------------------------------------------
alter table public.pasivos
    add column tipo_tasa tipo_tasa_hipoteca,
    add column indicador_referencia indicador_referencia_hipoteca not null default 'ninguno',
    add column diferencial numeric(6, 4), -- puntos sobre el índice, ej. 0.0099 = Euribor + 0,99%
    add column meses_tramo_fijo integer; -- solo para 'mixto': cuántos meses iniciales son a tipo fijo

alter table public.pasivos
    add constraint chk_hipoteca_tiene_tipo_tasa check (
        tipo <> 'hipoteca' or tipo_tasa is not null
    ),
    add constraint chk_diferencial_solo_si_referenciado check (
        indicador_referencia = 'ninguno' or diferencial is not null
    ),
    add constraint chk_tramo_fijo_solo_si_mixto check (
        tipo_tasa <> 'mixto' or meses_tramo_fijo is not null
    ),
    add constraint chk_meses_tramo_fijo_positivo check (
        meses_tramo_fijo is null or meses_tramo_fijo > 0
    );

comment on column public.pasivos.tipo_tasa is 'Solo aplica a hipotecas. Null para préstamos personales/vehículo/deuda.';
comment on column public.pasivos.indicador_referencia is 'Índice al que está referenciada la parte variable, si la hay.';
comment on column public.pasivos.diferencial is 'Diferencial sobre el índice, como fracción (0,0099 = +0,99 puntos). NO es el tipo total.';
comment on column public.pasivos.meses_tramo_fijo is 'Solo para tipo_tasa=mixto: duración en meses del tramo a tipo fijo antes de pasar a variable.';

-- ---------------------------------------------------------------------
-- Conversión de divisas: columnas de snapshot en ingresos/gastos
-- ---------------------------------------------------------------------
alter table public.ingresos
    add column importe_real_moneda_base numeric(14, 2),
    add column tasa_cambio_aplicada numeric(18, 8);

alter table public.gastos
    add column importe_real_moneda_base numeric(14, 2),
    add column tasa_cambio_aplicada numeric(18, 8);

comment on column public.ingresos.importe_real_moneda_base is 'Snapshot: importe_real convertido a la moneda_base del espacio, al tipo de cambio del día de cobro. Se calcula una vez y no se recalcula si el tipo de cambio cambia después — es un hecho histórico de la transacción.';
comment on column public.ingresos.tasa_cambio_aplicada is 'Tipo de cambio exacto usado en la conversión, para poder auditar el cálculo.';

-- ---------------------------------------------------------------------
-- Función de conversión: busca el tipo de cambio del día exacto, o si no
-- existe (fin de semana/festivo de mercado), el del día hábil anterior
-- más reciente disponible. Devuelve NULL si no hay ningún tipo de cambio
-- registrado en absoluto (para que la aplicación sepa que la conversión
-- está pendiente, en vez de fallar o inventar un valor).
-- ---------------------------------------------------------------------
create or replace function public.convertir_a_moneda_base(
    p_importe numeric,
    p_moneda_origen char(3),
    p_moneda_destino char(3),
    p_fecha date
)
returns table (importe_convertido numeric, tasa_usada numeric)
language plpgsql
stable
as $$
declare
    v_tasa numeric;
begin
    if p_moneda_origen = p_moneda_destino then
        return query select p_importe, 1::numeric;
        return;
    end if;

    select tc.tasa into v_tasa
    from public.tipos_cambio tc
    where tc.moneda_origen = p_moneda_origen
      and tc.moneda_destino = p_moneda_destino
      and tc.fecha <= p_fecha
    order by tc.fecha desc
    limit 1;

    if v_tasa is null then
        return query select null::numeric, null::numeric;
        return;
    end if;

    return query select round(p_importe * v_tasa, 2), v_tasa;
end;
$$;

comment on function public.convertir_a_moneda_base is 'Convierte un importe a la moneda destino usando el tipo de cambio más reciente disponible en o antes de la fecha dada (fallback a día hábil anterior si el día exacto no tiene tipo publicado). Devuelve (null, null) si no hay ningún tipo de cambio registrado.';

-- ---------------------------------------------------------------------
-- Trigger: al confirmar el cobro de un ingreso (fecha_cobrada + importe_real
-- ya informados) en una moneda distinta a la del espacio, calcula y guarda
-- el snapshot en moneda base automáticamente.
-- ---------------------------------------------------------------------
create or replace function public.f_convertir_ingreso_moneda_base()
returns trigger
language plpgsql
as $$
declare
    v_moneda_base char(3);
    v_resultado record;
begin
    if new.importe_real is null or new.fecha_cobrada is null then
        new.importe_real_moneda_base := null;
        new.tasa_cambio_aplicada := null;
        return new;
    end if;

    select moneda_base into v_moneda_base
    from public.espacios_financieros
    where id = new.espacio_id;

    select * into v_resultado
    from public.convertir_a_moneda_base(new.importe_real, new.moneda, v_moneda_base, new.fecha_cobrada);

    new.importe_real_moneda_base := v_resultado.importe_convertido;
    new.tasa_cambio_aplicada := v_resultado.tasa_usada;
    return new;
end;
$$;

create trigger trg_convertir_ingreso_moneda_base
    before insert or update on public.ingresos
    for each row execute function public.f_convertir_ingreso_moneda_base();

-- Mismo trigger para gastos (ej. una factura pagada directamente en USD)
create or replace function public.f_convertir_gasto_moneda_base()
returns trigger
language plpgsql
as $$
declare
    v_moneda_base char(3);
    v_resultado record;
begin
    if new.importe_real is null or new.fecha_pagada is null then
        new.importe_real_moneda_base := null;
        new.tasa_cambio_aplicada := null;
        return new;
    end if;

    select moneda_base into v_moneda_base
    from public.espacios_financieros
    where id = new.espacio_id;

    select * into v_resultado
    from public.convertir_a_moneda_base(new.importe_real, new.moneda, v_moneda_base, new.fecha_pagada);

    new.importe_real_moneda_base := v_resultado.importe_convertido;
    new.tasa_cambio_aplicada := v_resultado.tasa_usada;
    return new;
end;
$$;

create trigger trg_convertir_gasto_moneda_base
    before insert or update on public.gastos
    for each row execute function public.f_convertir_gasto_moneda_base();
