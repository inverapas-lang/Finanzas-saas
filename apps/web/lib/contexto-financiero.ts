export interface DatosFinancieros {
  fecha: string;
  patrimonio: {
    totalActivos: number;
    totalPasivos: number;
    patrimonioNeto: number;
  };
  activos: { nombre: string; tipo: string; valorActual: number }[];
  pasivos: {
    nombre: string;
    tipo: string;
    capitalPendiente: number;
    cuota: number;
    tipoInteresAnual: number;
  }[];
  proyeccionMes: {
    totalEstimadoIngresos: number;
    totalEstimadoGastos: number;
    saldoEstimado: number;
  };
  gastosPorCategoriaUltimos3Meses: { categoria: string; total: number }[];
  presupuestos: { categoria: string; planificado: number; gastado: number }[];
}

/**
 * Formatea los datos financieros del usuario en un bloque de texto para
 * el prompt del sistema. Función PURA (sin llamadas a Supabase ni a
 * ninguna API) — separada a propósito para poder verificarla con tests
 * reales sin depender de una base de datos ni de la API de Anthropic.
 *
 * Los importes van con punto decimal (no coma), sin símbolo de moneda:
 * es el formato que mejor entiende un modelo de lenguaje sin ambigüedad.
 * La IA se encarga de traducirlo a formato español (1.234,56 €) en su
 * respuesta — así se lo pedimos en el prompt del sistema.
 */
export function formatearContextoFinanciero(datos: DatosFinancieros): string {
  const secciones: string[] = [];

  secciones.push(`Fecha de hoy: ${datos.fecha}`);

  secciones.push(
    [
      '## Patrimonio',
      `Total activos: ${datos.patrimonio.totalActivos.toFixed(2)} EUR`,
      `Total pasivos (pendiente): ${datos.patrimonio.totalPasivos.toFixed(2)} EUR`,
      `Patrimonio neto: ${datos.patrimonio.patrimonioNeto.toFixed(2)} EUR`,
    ].join('\n')
  );

  if (datos.activos.length > 0) {
    const lineas = datos.activos.map(
      (a) => `- ${a.nombre} (${a.tipo}): ${a.valorActual.toFixed(2)} EUR`
    );
    secciones.push(['## Activos', ...lineas].join('\n'));
  }

  if (datos.pasivos.length > 0) {
    const lineas = datos.pasivos.map(
      (p) =>
        `- ${p.nombre} (${p.tipo}): pendiente ${p.capitalPendiente.toFixed(2)} EUR, cuota ${p.cuota.toFixed(2)} EUR/mes, tipo ${(p.tipoInteresAnual * 100).toFixed(2)}%`
    );
    secciones.push(['## Préstamos e hipotecas', ...lineas].join('\n'));
  }

  secciones.push(
    [
      '## Proyección de este mes',
      `Ingresos estimados: ${datos.proyeccionMes.totalEstimadoIngresos.toFixed(2)} EUR`,
      `Gastos estimados: ${datos.proyeccionMes.totalEstimadoGastos.toFixed(2)} EUR`,
      `Saldo estimado: ${datos.proyeccionMes.saldoEstimado.toFixed(2)} EUR`,
    ].join('\n')
  );

  if (datos.gastosPorCategoriaUltimos3Meses.length > 0) {
    const lineas = datos.gastosPorCategoriaUltimos3Meses
      .sort((a, b) => b.total - a.total)
      .map((g) => `- ${g.categoria}: ${g.total.toFixed(2)} EUR`);
    secciones.push(['## Gasto por categoría (últimos 3 meses)', ...lineas].join('\n'));
  }

  if (datos.presupuestos.length > 0) {
    const lineas = datos.presupuestos.map((p) => {
      const desviacion = p.gastado - p.planificado;
      const estado = desviacion > 0 ? `SUPERADO en ${desviacion.toFixed(2)} EUR` : 'dentro de lo planificado';
      return `- ${p.categoria}: planificado ${p.planificado.toFixed(2)} EUR, gastado ${p.gastado.toFixed(2)} EUR (${estado})`;
    });
    secciones.push(['## Presupuestos activos', ...lineas].join('\n'));
  }

  return secciones.join('\n\n');
}

export const INSTRUCCIONES_SISTEMA = `Eres el asistente financiero personal de una aplicación de finanzas. Respondes preguntas sobre los números reales del usuario y, cuando te lo pide, le ayudas a ajustarlos.

Datos:
- Más abajo tienes un resumen de la situación actual. Para cualquier otra cosa (meses concretos, años anteriores, detalle de movimientos, histórico de patrimonio) consulta con las herramientas en vez de suponer. Nunca inventes cifras: si algo no está en los datos, dilo.
- Para totales y comparativas usa totales_movimientos; para ver o localizar registros concretos, buscar_movimientos o consultar_patrimonio. Si el usuario nombra una categoría, búscala con listar_categorias.

Cambios:
- Solo puedes proponer cambios con proponer_cambios; no tienes forma de escribir directamente. El usuario ve cada cambio con su valor actual y el nuevo, y decide si lo aplica. Hasta que lo haga, los datos no han cambiado: no digas lo contrario.
- Propón cambios solo cuando el usuario pida ajustar, corregir, añadir o borrar algo. Si la petición es ambigua (qué registro, qué importe, qué meses), pregunta antes de proponer.
- Antes de proponer, localiza con las herramientas los registros exactos y usa sus ids reales. Reúne todos los cambios de una petición en una sola propuesta.
- En el historial, las notas entre corchetes del tipo [Propuesta aplicada…] o [Propuesta descartada…] indican lo que hizo el usuario con una propuesta anterior.

Estilo:
- Responde siempre en español, con importes en formato español (1.234,56 €), aunque en los datos los veas con punto (1234.56).
- Sé conciso: la cifra exacta primero y, si hace falta, una frase de contexto.
- No des consejos de inversión ni recomendaciones fiscales concretas. Puedes describir la situación ("tu gasto en ocio ha subido un 20%"), pero no digas "deberías invertir en X" ni "deberías vender Y".

Resumen financiero del usuario (a fecha de hoy):`;
