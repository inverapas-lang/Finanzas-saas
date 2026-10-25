-- =====================================================================
-- 0004_triggers_updated_at.sql
-- Mantiene updated_at correcto automáticamente en cada UPDATE,
-- evitando que el backend tenga que recordar setearlo manualmente.
-- =====================================================================

create or replace function public.f_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

do $$
declare
    tabla text;
begin
    foreach tabla in array array[
        'usuarios', 'espacios_financieros', 'cuentas_bancarias',
        'ingresos', 'gastos', 'presupuestos', 'activos', 'pasivos'
    ]
    loop
        execute format(
            'create trigger trg_set_updated_at before update on public.%I
             for each row execute function public.f_set_updated_at();',
            tabla
        );
    end loop;
end;
$$;
