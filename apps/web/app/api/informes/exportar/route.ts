import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { validarPayloadExportarTablas } from '../../../../lib/validacion-exportar-tablas';
import { generarXLSXTablas, generarPDFTablas } from '../../../../lib/exportar-tablas';

/**
 * POST /api/informes/exportar
 *
 * Recibe tablas YA AGREGADAS por el cliente (Informes/Gráficos calculan
 * totales, desgloses por categoría y por mes reutilizando
 * lib/agregaciones-informes.ts) y las convierte a un archivo descargable.
 * No lee nada de la base de datos — solo exige sesión válida para que no
 * cualquiera pueda usar el servidor para generar archivos gratis.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadExportarTablas(body);

    const supabase = crearClienteSupabaseDeRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const nombreArchivo = payload.titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita acentos para un nombre de archivo sin sorpresas
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (payload.formato === 'xlsx') {
      const buffer = generarXLSXTablas(payload.hojas);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${nombreArchivo}.xlsx"`,
        },
      });
    }

    const pdf = await generarPDFTablas(payload.titulo, payload.hojas);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}.pdf"`,
      },
    });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/informes/exportar:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
