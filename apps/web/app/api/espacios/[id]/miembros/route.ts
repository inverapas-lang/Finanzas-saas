import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../lib/supabase-server';

interface Contexto {
  params: Promise<{ id: string }>; // id del espacio
}

const ROLES_INVITABLES = ['usuario', 'asesor', 'invitado'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id: espacioId } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);

    const { data, error } = await supabase
      .from('miembros_espacio')
      .select('id, usuario_id, rol, permisos, created_at, usuarios!inner(email, nombre)')
      .eq('espacio_id', espacioId)
      .order('created_at', { ascending: true });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

/**
 * POST /api/espacios/:id/miembros
 * Invita a un usuario YA REGISTRADO a este espacio, por email.
 * Body: { email: string, rol: 'usuario' | 'asesor' | 'invitado' }
 *
 * No crea cuentas nuevas ni envía ningún email de invitación — eso
 * requeriría la service role de Supabase, que nunca se usa desde el
 * navegador. La persona invitada debe haberse registrado ya ella misma.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  try {
    const { id: espacioId } = await params;
    const body = await request.json();

    if (typeof body.email !== 'string' || !EMAIL_REGEX.test(body.email)) {
      throw new ErrorApi(400, 'email no es válido');
    }
    if (typeof body.rol !== 'string' || !ROLES_INVITABLES.includes(body.rol)) {
      throw new ErrorApi(400, `rol debe ser uno de: ${ROLES_INVITABLES.join(', ')}`);
    }

    const supabase = crearClienteSupabaseDeRequest(request);

    const { data: usuarioId, error: errorBusqueda } = await supabase.rpc('buscar_usuario_por_email', {
      p_email: body.email,
    });

    if (errorBusqueda) throw new ErrorApi(500, errorBusqueda.message);
    if (!usuarioId) {
      throw new ErrorApi(
        404,
        'No hay ninguna cuenta con ese email todavía. Esa persona debe registrarse primero en la aplicación antes de que puedas invitarla.'
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('miembros_espacio')
      .insert({
        espacio_id: espacioId,
        usuario_id: usuarioId,
        rol: body.rol,
        invitado_por: user?.id ?? null,
      })
      .select('id, usuario_id, rol, created_at')
      .single();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para invitar usuarios a este espacio');
      }
      if (error.code === '23505') {
        throw new ErrorApi(409, 'Esa persona ya es miembro de este espacio');
      }
      throw new ErrorApi(400, error.message);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/espacios/[id]/miembros:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
