import { describe, expect, it } from 'vitest';
import { validarPayloadChat } from './validacion-chat';

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

describe('validarPayloadChat', () => {
  it('admite mensajes del asistente largos (llevan la nota de la propuesta)', () => {
    const payload = validarPayloadChat({
      espacio_id: ESPACIO_ID,
      mensajes: [
        { rol: 'usuario', contenido: 'hola' },
        { rol: 'asistente', contenido: 'x'.repeat(15000) },
        { rol: 'usuario', contenido: 'sigue' },
      ],
    });
    expect(payload.mensajes).toHaveLength(3);
  });

  it('mantiene el límite corto para los mensajes del usuario', () => {
    expect(() =>
      validarPayloadChat({
        espacio_id: ESPACIO_ID,
        mensajes: [{ rol: 'usuario', contenido: 'x'.repeat(4001) }],
      })
    ).toThrow(/4000/);
  });

  it('exige que el último mensaje sea del usuario', () => {
    expect(() =>
      validarPayloadChat({
        espacio_id: ESPACIO_ID,
        mensajes: [{ rol: 'asistente', contenido: 'hola' }],
      })
    ).toThrow(/último mensaje/);
  });
});
