-- =====================================================================
-- 0013_transacciones_externas_update.sql
-- La migración 0011 dejó políticas de select/insert/delete en
-- transacciones_externas pero se olvidó la de update. Hoy ningún código
-- actualiza esa tabla, pero sin esta política cualquier UPDATE futuro
-- fallaría en silencio (0 filas afectadas, sin error) en vez de dar un
-- 403 claro — mismo patrón que insert/delete, por coherencia.
-- =====================================================================

create policy transacciones_externas_update on public.transacciones_externas
    for update using (
        exists (
            select 1 from public.cuentas_bancarias cb
            where cb.id = transacciones_externas.cuenta_bancaria_id
              and public.tiene_permiso(cb.espacio_id, 'activos_pasivos:editar')
        )
    );
