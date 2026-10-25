-- =====================================================================
-- 0009_documentos_storage.sql
-- Bucket de Supabase Storage para documentos adjuntos (facturas,
-- contratos, escrituras...) y sus políticas de seguridad.
--
-- Convención de ruta obligatoria para cada archivo subido:
--   {espacio_id}/{entidad_tipo}/{entidad_id}/{nombre_unico}
-- El primer segmento de la ruta SIEMPRE debe ser el espacio_id — las
-- políticas de abajo dependen de esto para saber a qué espacio
-- pertenece cada archivo y aplicar los mismos permisos que ya usamos
-- en el resto de la aplicación (es_miembro / tiene_permiso).
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- No se pone `comment on table storage.objects` aquí: esa tabla es del
-- propio sistema de Supabase Storage, y el rol con el que corren las
-- migraciones no es su dueño (falla con "must be owner of table objects").
-- Las políticas de abajo sí se pueden crear sin ser el dueño de la tabla.

create policy documentos_storage_select on storage.objects
    for select
    using (
        bucket_id = 'documentos'
        and public.es_miembro((storage.foldername(name))[1]::uuid)
    );

create policy documentos_storage_insert on storage.objects
    for insert
    with check (
        bucket_id = 'documentos'
        and public.tiene_permiso((storage.foldername(name))[1]::uuid, 'documentos:editar')
    );

create policy documentos_storage_delete on storage.objects
    for delete
    using (
        bucket_id = 'documentos'
        and public.tiene_permiso((storage.foldername(name))[1]::uuid, 'documentos:editar')
    );

-- Límite razonable de tamaño (10 MB) para no permitir subidas descontroladas
-- que disparen el consumo de almacenamiento del plan gratuito.
update storage.buckets set file_size_limit = 10485760 where id = 'documentos';
