import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { mapearFilasImportadas, type FilaImportada } from '../../../lib/importar';

const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5 MB, generoso para un Excel de movimientos

/**
 * POST /api/importar (multipart/form-data: campos "archivo" y "espacio_id")
 *
 * Lee un Excel con las mismas columnas que genera /api/exportar (formato
 * xlsx) — así exportar → editar/añadir filas → volver a importar funciona
 * sin fricción. Categoría y Cuenta se buscan por nombre exacto (sin
 * distinguir mayúsculas); si una categoría no existe, se crea automática;
 * si una cuenta no existe, el movimiento se crea sin cuenta asociada
 * (no se auto-crean cuentas: el nombre podría tener una errata y crear
 * una cuenta bancaria de más sería peor que dejarla vacía).
 *
 * Procesa TODAS las filas y devuelve un resumen — no para en el primer
 * error, para que el usuario vea de una vez todo lo que falló y pueda
 * corregirlo en un solo intento.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const archivo = formData.get('archivo');
    const espacio_id = formData.get('espacio_id');

    if (!(archivo instanceof File)) throw new ErrorApi(400, 'Falta el archivo');
    if (typeof espacio_id !== 'string') throw new ErrorApi(400, 'Falta espacio_id');
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      throw new ErrorApi(400, 'El archivo pesa más de 5 MB');
    }

    const bytes = await archivo.arrayBuffer();
    const libro = XLSX.read(bytes, { type: 'array', cellDates: true });
    const nombreHoja = libro.SheetNames[0];
    if (!nombreHoja) throw new ErrorApi(400, 'El archivo no tiene ninguna hoja');

    const filasCrudas: FilaImportada[] = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja]);
    if (filasCrudas.length === 0) {
      throw new ErrorApi(400, 'El archivo no tiene ninguna fila de datos (¿falta la cabecera o está vacío?)');
    }

    const resultados = mapearFilasImportadas(filasCrudas);
    const validos = resultados.filter((r) => r.ok && r.movimiento);
    const conError = resultados.filter((r) => !r.ok);

    const supabase = crearClienteSupabaseDeRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    // Cargamos categorías y cuentas existentes UNA vez, para resolver
    // nombre → id sin hacer una consulta por fila.
    const [{ data: categoriasExistentes }, { data: cuentasExistentes }] = await Promise.all([
      supabase.from('categorias').select('id, nombre, tipo').eq('espacio_id', espacio_id),
      supabase.from('cuentas_bancarias').select('id, nombre').eq('espacio_id', espacio_id),
    ]);

    const mapaCategoria = new Map(
      (categoriasExistentes ?? []).map((c) => [`${c.tipo}:${c.nombre.toLowerCase()}`, c.id])
    );
    const mapaCuenta = new Map((cuentasExistentes ?? []).map((c) => [c.nombre.toLowerCase(), c.id]));

    let creados = 0;
    const erroresInsercion: { numeroFila: number; error: string }[] = [];

    for (const resultado of validos) {
      const m = resultado.movimiento!;

      let categoriaId: string | null = null;
      if (m.categoriaNombre) {
        const clave = `${m.tipo}:${m.categoriaNombre.toLowerCase()}`;
        categoriaId = mapaCategoria.get(clave) ?? null;
        if (!categoriaId) {
          const { data: nuevaCategoria, error: errorCategoria } = await supabase
            .from('categorias')
            .insert({ espacio_id, tipo: m.tipo, nombre: m.categoriaNombre })
            .select('id')
            .single();
          if (errorCategoria) {
            erroresInsercion.push({
              numeroFila: resultado.numeroFila,
              error: `No se pudo crear la categoría "${m.categoriaNombre}": ${errorCategoria.message}`,
            });
            continue;
          }
          categoriaId = nuevaCategoria.id;
          mapaCategoria.set(clave, categoriaId);
        }
      }

      const cuentaId = m.cuentaNombre ? (mapaCuenta.get(m.cuentaNombre.toLowerCase()) ?? null) : null;

      const tabla = m.tipo === 'ingreso' ? 'ingresos' : 'gastos';
      const payload: Record<string, unknown> = {
        espacio_id,
        categoria_id: categoriaId,
        cuenta_id: cuentaId,
        descripcion: m.descripcion,
        fecha_prevista: m.fechaPrevista,
        importe_real: m.importeReal,
        created_by: user.id,
      };
      if (m.tipo === 'ingreso') {
        payload.importe_esperado = m.importe;
        payload.fecha_cobrada = m.fechaConfirmada;
      } else {
        payload.importe_previsto = m.importe;
        payload.fecha_pagada = m.fechaConfirmada;
      }

      const { error: errorInsercion } = await supabase.from(tabla).insert(payload);
      if (errorInsercion) {
        erroresInsercion.push({ numeroFila: resultado.numeroFila, error: errorInsercion.message });
        continue;
      }
      creados++;
    }

    return NextResponse.json({
      data: {
        totalFilas: filasCrudas.length,
        creados,
        erroresValidacion: conError.map((r) => ({ numeroFila: r.numeroFila, error: r.error })),
        erroresInsercion,
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
  console.error('Error inesperado en /api/importar:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
