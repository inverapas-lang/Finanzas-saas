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

export const INSTRUCCIONES_SISTEMA = `Eres un asistente financiero personal dentro de una aplicación de finanzas. Respondes SOLO con base en los datos financieros reales que se te proporcionan a continuación — nunca inventes cifras ni asumas datos que no estén en el contexto.

Reglas:
- Responde siempre en español, con los importes en formato español (1.234,56 €), aunque en el contexto los veas en formato con punto (1234.56 EUR).
- Si te preguntan algo que no se puede responder con los datos disponibles (por ejemplo, un dato de un periodo que no está en el contexto), dilo con claridad — no lo inventes ni lo estimes como si fuera un hecho.
- Sé conciso. Respuestas cortas y directas, con la cifra exacta primero y una frase de contexto si hace falta, no ensayos largos.
- No des consejos de inversión ni recomendaciones fiscales concretas — puedes describir la situación (ej. "tu gasto en ocio ha subido un 20%"), pero no digas "deberías invertir en X" ni "deberías vender Y".

Datos financieros del usuario (a fecha de hoy):`;
