import { describe, expect, it } from 'vitest';
import { MAX_CAMBIOS_POR_PROPUESTA, validarPropuesta } from './validacion-propuesta';

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';
const CATEGORIA_ID = '33333333-3333-3333-3333-333333333333';

function propuesta(cambios: unknown[]) {
  return { resumen: 'Ajuste de prueba', cambios };
}

describe('validarPropuesta', () => {
  it('acepta modificar el importe de un gasto', () => {
    const r = validarPropuesta(
      propuesta([{ accion: 'modificar', entidad: 'gasto', id: ID, valores: { importe_previsto: 85.5 } }]),
      ESPACIO_ID
    );
    expect(r.cambios).toEqual([
      { accion: 'modificar', entidad: 'gasto', id: ID, valores: { importe_previsto: 85.5 } },
    ]);
  });

  it('acepta crear un ingreso con los campos obligatorios', () => {
    const r = validarPropuesta(
      propuesta([
        {
          accion: 'crear',
          entidad: 'ingreso',
          valores: { descripcion: 'Nómina', importe_esperado: 2000, fecha_prevista: '2026-10-01' },
        },
      ]),
      ESPACIO_ID
    );
    expect(r.cambios[0].id).toBeNull();
  });

  it('ignora los valores al eliminar', () => {
    const r = validarPropuesta(
      propuesta([{ accion: 'eliminar', entidad: 'gasto', id: ID, valores: { importe_previsto: 1 } }]),
      ESPACIO_ID
    );
    expect(r.cambios[0].valores).toEqual({});
  });

  it('rechaza crear un gasto sin importe, con el índice del cambio en el mensaje', () => {
    expect(() =>
      validarPropuesta(
        propuesta([
          { accion: 'eliminar', entidad: 'gasto', id: ID },
          { accion: 'crear', entidad: 'gasto', valores: { descripcion: 'X', fecha_prevista: '2026-10-01' } },
        ]),
        ESPACIO_ID
      )
    ).toThrow(/cambios\[1\].*importe_previsto/);
  });

  it('rechaza campos que no se pueden tocar (p. ej. espacio_id)', () => {
    expect(() =>
      validarPropuesta(
        propuesta([{ accion: 'modificar', entidad: 'gasto', id: ID, valores: { espacio_id: ESPACIO_ID } }]),
        ESPACIO_ID
      )
    ).toThrow(/espacio_id/);
  });

  it('no deja cambiar mes/bloque/concepto de un valor de patrimonio existente', () => {
    expect(() =>
      validarPropuesta(
        propuesta([{ accion: 'modificar', entidad: 'patrimonio_item', id: ID, valores: { concepto: 'Otro' } }]),
        ESPACIO_ID
      )
    ).toThrow(/concepto/);
  });

  it('exige mes a día 1 al crear un valor de patrimonio', () => {
    expect(() =>
      validarPropuesta(
        propuesta([
          {
            accion: 'crear',
            entidad: 'patrimonio_item',
            valores: { mes: '2026-10-15', bloque: 'cuenta', concepto: 'Cta', valor: 100 },
          },
        ]),
        ESPACIO_ID
      )
    ).toThrow(/día 1/);
  });

  it('rechaza importes negativos y fechas mal formadas al modificar', () => {
    expect(() =>
      validarPropuesta(
        propuesta([{ accion: 'modificar', entidad: 'gasto', id: ID, valores: { importe_real: -3 } }]),
        ESPACIO_ID
      )
    ).toThrow(/importe_real/);
    expect(() =>
      validarPropuesta(
        propuesta([{ accion: 'modificar', entidad: 'ingreso', id: ID, valores: { fecha_cobrada: '1/10/2026' } }]),
        ESPACIO_ID
      )
    ).toThrow(/fecha_cobrada/);
  });

  it('exige id en modificar/eliminar y lo prohíbe en crear', () => {
    expect(() =>
      validarPropuesta(propuesta([{ accion: 'eliminar', entidad: 'gasto' }]), ESPACIO_ID)
    ).toThrow(/id/);
    expect(() =>
      validarPropuesta(
        propuesta([
          {
            accion: 'crear',
            entidad: 'gasto',
            id: ID,
            valores: { descripcion: 'X', importe_previsto: 1, fecha_prevista: '2026-10-01' },
          },
        ]),
        ESPACIO_ID
      )
    ).toThrow(/no lleva id/);
  });

  it('valida que categoria_id sea un UUID al modificar', () => {
    expect(() =>
      validarPropuesta(
        propuesta([{ accion: 'modificar', entidad: 'gasto', id: ID, valores: { categoria_id: 'Luz' } }]),
        ESPACIO_ID
      )
    ).toThrow(/categoria_id/);
    expect(
      validarPropuesta(
        propuesta([{ accion: 'modificar', entidad: 'gasto', id: ID, valores: { categoria_id: CATEGORIA_ID } }]),
        ESPACIO_ID
      ).cambios[0].valores.categoria_id
    ).toBe(CATEGORIA_ID);
  });

  it('exige resumen y entre 1 y el máximo de cambios', () => {
    expect(() => validarPropuesta({ resumen: '', cambios: [] }, ESPACIO_ID)).toThrow(/resumen/);
    expect(() => validarPropuesta(propuesta([]), ESPACIO_ID)).toThrow(/al menos un cambio/);
    const muchos = Array.from({ length: MAX_CAMBIOS_POR_PROPUESTA + 1 }, () => ({
      accion: 'eliminar',
      entidad: 'gasto',
      id: ID,
    }));
    expect(() => validarPropuesta(propuesta(muchos), ESPACIO_ID)).toThrow(/máximo/);
  });
});
