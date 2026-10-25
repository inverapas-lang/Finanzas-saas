import { describe, expect, it } from 'vitest';
import {
  construirPeticionCambio,
  formatearValorCampo,
  notaParaHistorial,
  tituloCambio,
} from './aplicar-propuesta';
import type { CambioPropuesto, PropuestaCambios } from './tipos-propuesta';

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';

const modificarGasto: CambioPropuesto = {
  accion: 'modificar',
  entidad: 'gasto',
  id: ID,
  valores: { importe_previsto: 85 },
  antes: { importe_previsto: 92.4 },
  etiqueta: 'Luz · 2026-10-01',
};

describe('construirPeticionCambio', () => {
  it('modificar -> PATCH a la ruta del registro, sin espacio_id', () => {
    expect(construirPeticionCambio(modificarGasto, ESPACIO_ID)).toEqual({
      metodo: 'PATCH',
      url: `/api/gastos/${ID}`,
      cuerpo: { importe_previsto: 85 },
    });
  });

  it('crear -> POST a la colección con el espacio activo', () => {
    const peticion = construirPeticionCambio(
      {
        accion: 'crear',
        entidad: 'patrimonio_item',
        id: null,
        valores: { mes: '2026-10-01', bloque: 'cuenta', concepto: 'Cta', valor: 10 },
        antes: null,
        etiqueta: 'Cta · 2026-10',
      },
      ESPACIO_ID
    );
    expect(peticion.metodo).toBe('POST');
    expect(peticion.url).toBe('/api/patrimonio-historico-item');
    expect(peticion.cuerpo?.espacio_id).toBe(ESPACIO_ID);
  });

  it('eliminar -> DELETE sin cuerpo', () => {
    expect(
      construirPeticionCambio({ ...modificarGasto, entidad: 'ingreso', accion: 'eliminar', valores: {} }, ESPACIO_ID)
    ).toEqual({ metodo: 'DELETE', url: `/api/ingresos/${ID}`, cuerpo: null });
  });
});

describe('notaParaHistorial', () => {
  const propuesta: PropuestaCambios = { resumen: 'Ajusto la luz', cambios: [modificarGasto], categorias: {} };

  it('incluye el id y los valores para que la IA sepa qué propuso', () => {
    const nota = notaParaHistorial(propuesta, 'pendiente');
    expect(nota).toContain('[Propuesta pendiente');
    expect(nota).toContain(ID);
    expect(nota).toContain('"importe_previsto":85');
  });

  it('distingue aplicada sin errores, con errores y descartada', () => {
    expect(notaParaHistorial(propuesta, 'aplicada', [{ ok: true }])).toContain('todos los cambios se guardaron');
    const conError = notaParaHistorial(propuesta, 'aplicada', [{ ok: false, error: 'Sin permiso' }]);
    expect(conError).toContain('1 de 1 cambios fallaron');
    expect(conError).toContain('ERROR: Sin permiso');
    expect(notaParaHistorial(propuesta, 'descartada')).toContain('descartada');
  });
});

describe('formateo para la tarjeta', () => {
  it('formatea importes en euros al estilo español y muestra el nombre de la categoría', () => {
    // \s: Intl separa la cifra y el símbolo con un espacio duro (U+00A0).
    expect(formatearValorCampo('importe_previsto', 1234.5)).toMatch(/^1\.234,50\s€$/);
    expect(formatearValorCampo('valor', '85')).toMatch(/^85,00\s€$/);
    expect(formatearValorCampo('categoria_id', 'abc', { abc: 'Suministros' })).toBe('Suministros');
    expect(formatearValorCampo('notas', null)).toBe('—');
  });

  it('describe el cambio con verbo, entidad y etiqueta', () => {
    expect(tituloCambio(modificarGasto)).toBe('Modificar gasto: Luz · 2026-10-01');
  });
});
