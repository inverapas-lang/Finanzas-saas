import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ejecutarHerramienta, escaparLike } from './herramientas-asistente';

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';
const GASTO_ID = '22222222-2222-2222-2222-222222222222';
const CATEGORIA_ID = '33333333-3333-3333-3333-333333333333';

type Filtro = [string, ...unknown[]];
type Respuesta = { data: unknown; error: unknown };

/**
 * Supabase falso: cualquier cadena de métodos (select/eq/ilike/order...)
 * se registra en `filtros` y, al hacer await o maybeSingle(), devuelve lo
 * que diga `responder` según la tabla y los filtros usados.
 */
function supabaseFalso(responder: (tabla: string, filtros: Filtro[], uno: boolean) => Respuesta) {
  const llamadas: { tabla: string; filtros: Filtro[] }[] = [];
  const cliente = {
    from(tabla: string) {
      const filtros: Filtro[] = [];
      llamadas.push({ tabla, filtros });
      const builder: unknown = new Proxy(
        {},
        {
          get(_, prop: string) {
            if (prop === 'then') {
              return (ok: (r: Respuesta) => unknown, ko: (e: unknown) => unknown) =>
                Promise.resolve(responder(tabla, filtros, false)).then(ok, ko);
            }
            if (prop === 'maybeSingle') return () => Promise.resolve(responder(tabla, filtros, true));
            return (...args: unknown[]) => {
              filtros.push([prop, ...args]);
              return builder;
            };
          },
        }
      );
      return builder;
    },
  };
  return { supabase: cliente as unknown as SupabaseClient, llamadas };
}

const CATEGORIAS = [{ id: CATEGORIA_ID, nombre: 'Suministros', tipo: 'gasto', categoria_padre_id: null }];

describe('ejecutarHerramienta: proponer_cambios', () => {
  it('rellena "antes" con lo que hay en la base de datos, no con lo que diga la IA', async () => {
    const { supabase } = supabaseFalso((tabla, _f, uno) => {
      if (tabla === 'gastos' && uno) {
        return {
          data: {
            descripcion: 'Luz',
            fecha_prevista: '2026-10-01',
            importe_previsto: 92.4,
            importe_real: null,
            categoria_id: CATEGORIA_ID,
          },
          error: null,
        };
      }
      if (tabla === 'categorias' && uno) {
        return { data: { id: CATEGORIA_ID, tipo: 'gasto', espacio_id: ESPACIO_ID }, error: null };
      }
      if (tabla === 'categorias') return { data: CATEGORIAS, error: null };
      return { data: null, error: null };
    });

    const r = await ejecutarHerramienta(supabase, ESPACIO_ID, 'proponer_cambios', {
      resumen: 'Ajusto la luz',
      cambios: [
        {
          accion: 'modificar',
          entidad: 'gasto',
          id: GASTO_ID,
          valores: { importe_previsto: 85, categoria_id: CATEGORIA_ID },
        },
      ],
    });

    expect(r.esError).toBe(false);
    expect(r.propuesta?.cambios[0]).toMatchObject({
      antes: { importe_previsto: 92.4, categoria_id: CATEGORIA_ID },
      etiqueta: 'Luz · 2026-10-01',
    });
    expect(r.propuesta?.categorias).toEqual({ [CATEGORIA_ID]: 'Suministros' });
    expect(r.contenido).toContain('NO está aplicada');
  });

  it('rechaza ids que no existen en el espacio y lo devuelve como error para la IA', async () => {
    const { supabase, llamadas } = supabaseFalso(() => ({ data: null, error: null }));

    const r = await ejecutarHerramienta(supabase, ESPACIO_ID, 'proponer_cambios', {
      resumen: 'Borro un gasto',
      cambios: [{ accion: 'eliminar', entidad: 'gasto', id: GASTO_ID }],
    });

    expect(r.esError).toBe(true);
    expect(r.contenido).toMatch(/no existe ningún gasto/);
    expect(r.propuesta).toBeUndefined();
    // La búsqueda del registro se filtra siempre por el espacio activo.
    const busqueda = llamadas.find((l) => l.tabla === 'gastos');
    expect(busqueda?.filtros).toContainEqual(['eq', 'espacio_id', ESPACIO_ID]);
  });

  it('al crear un valor de patrimonio que ya existe, pide usar modificar con su id', async () => {
    const { supabase } = supabaseFalso((tabla, _f, uno) =>
      tabla === 'patrimonio_historico_item' && uno ? { data: { id: 'item-1' }, error: null } : { data: [], error: null }
    );

    const r = await ejecutarHerramienta(supabase, ESPACIO_ID, 'proponer_cambios', {
      resumen: 'Saldo de octubre',
      cambios: [
        {
          accion: 'crear',
          entidad: 'patrimonio_item',
          valores: { mes: '2026-10-01', bloque: 'cuenta', concepto: 'Cta Santander', valor: 1500 },
        },
      ],
    });

    expect(r.esError).toBe(true);
    expect(r.contenido).toMatch(/usa "modificar" con ese id/);
    expect(r.contenido).toContain('item-1');
  });

  it('devuelve los errores de formato a la IA sin tocar la base de datos', async () => {
    const { supabase, llamadas } = supabaseFalso(() => ({ data: null, error: null }));
    const r = await ejecutarHerramienta(supabase, ESPACIO_ID, 'proponer_cambios', {
      resumen: 'x',
      cambios: [{ accion: 'modificar', entidad: 'gasto', id: GASTO_ID, valores: { importe_previsto: -1 } }],
    });
    expect(r.esError).toBe(true);
    expect(llamadas).toHaveLength(0);
  });
});

describe('ejecutarHerramienta: consultas', () => {
  it('buscar_movimientos marca truncado, añade el nombre de categoría y escapa el texto', async () => {
    const filas = [
      { id: 'a', descripcion: 'Luz', categoria_id: CATEGORIA_ID },
      { id: 'b', descripcion: 'Luz', categoria_id: null },
      { id: 'c', descripcion: 'Luz', categoria_id: null },
    ];
    const { supabase, llamadas } = supabaseFalso((tabla) =>
      tabla === 'gastos' ? { data: filas, error: null } : { data: CATEGORIAS, error: null }
    );

    const r = await ejecutarHerramienta(supabase, ESPACIO_ID, 'buscar_movimientos', {
      tipo: 'gasto',
      texto: '50%',
      limite: 2,
    });

    const datos = JSON.parse(r.contenido);
    expect(datos.truncado).toBe(true);
    expect(datos.movimientos).toHaveLength(2);
    expect(datos.movimientos[0].categoria).toBe('Suministros');
    const filtrosGastos = llamadas.find((l) => l.tabla === 'gastos')!.filtros;
    expect(filtrosGastos).toContainEqual(['ilike', 'descripcion', '%50\\%%']);
    expect(filtrosGastos).toContainEqual(['limit', 3]);
  });

  it('totales_movimientos usa el importe real si existe y agrupa por mes', async () => {
    const filas = [
      { fecha_prevista: '2026-01-05', importe: 100, importe_real: 120, categoria_id: null },
      { fecha_prevista: '2026-01-20', importe: 50, importe_real: null, categoria_id: null },
      { fecha_prevista: '2026-02-01', importe: 10, importe_real: null, categoria_id: null },
    ];
    const { supabase } = supabaseFalso((tabla) =>
      tabla === 'gastos' ? { data: filas, error: null } : { data: [], error: null }
    );

    const r = await ejecutarHerramienta(supabase, ESPACIO_ID, 'totales_movimientos', {
      tipo: 'gasto',
      desde: '2026-01-01',
      hasta: '2026-02-28',
      agrupar_por: 'mes',
    });

    expect(JSON.parse(r.contenido)).toEqual({
      total_general: 180,
      movimientos: 3,
      grupos: [
        { mes: '2026-01', total: 170, movimientos: 2 },
        { mes: '2026-02', total: 10, movimientos: 1 },
      ],
    });
  });

  it('una entrada inválida vuelve como error, no como excepción', async () => {
    const { supabase } = supabaseFalso(() => ({ data: [], error: null }));
    const r = await ejecutarHerramienta(supabase, ESPACIO_ID, 'totales_movimientos', {
      tipo: 'gasto',
      desde: 'enero',
      hasta: '2026-02-28',
      agrupar_por: 'mes',
    });
    expect(r).toEqual({ contenido: 'desde debe tener formato YYYY-MM-DD', esError: true });
  });

  it('una herramienta desconocida es un error', async () => {
    const { supabase } = supabaseFalso(() => ({ data: [], error: null }));
    const r = await ejecutarHerramienta(supabase, ESPACIO_ID, 'borrar_todo', {});
    expect(r.esError).toBe(true);
  });
});

describe('escaparLike', () => {
  it('escapa %, _ y la barra invertida', () => {
    expect(escaparLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});
