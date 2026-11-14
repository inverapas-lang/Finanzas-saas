/**
 * Lo que el usuario escribe en una celda de la hoja anual, como en Excel:
 * un número ("1.234,56", "-136.57") o una fórmula aritmética que empieza
 * por "=" ("=2100,74+3379,32", "=-109,52*2-164,52", "=0,12*1000*85%").
 *
 * Se evalúa con un analizador propio (sumas, restas, productos, divisiones,
 * paréntesis y %) y nunca con eval: lo que se escribe en una celda no debe
 * poder ejecutar código.
 */

export interface ResultadoExpresion {
  valor: number;
  /** La fórmula normalizada a guardar, o null si era un número suelto. */
  formula: string | null;
}

/**
 * Convierte un número escrito a la española o a la inglesa. Con coma, la
 * coma es el decimal y los puntos son miles ("1.234,56"); sin coma, el
 * punto es el decimal ("136.57"), que es lo que pega el Excel.
 */
function normalizarNumero(texto: string): string {
  if (texto.includes(',')) return texto.replace(/\./g, '').replace(',', '.');
  return texto;
}

class Analizador {
  private pos = 0;
  constructor(private readonly texto: string) {}

  evaluar(): number {
    const valor = this.suma();
    this.espacios();
    if (this.pos < this.texto.length) throw new Error(`Carácter inesperado "${this.texto[this.pos]}"`);
    return valor;
  }

  private espacios() {
    while (this.texto[this.pos] === ' ') this.pos++;
  }

  private suma(): number {
    let valor = this.producto();
    for (;;) {
      this.espacios();
      const op = this.texto[this.pos];
      if (op !== '+' && op !== '-') return valor;
      this.pos++;
      const derecha = this.producto();
      valor = op === '+' ? valor + derecha : valor - derecha;
    }
  }

  private producto(): number {
    let valor = this.unario();
    for (;;) {
      this.espacios();
      const op = this.texto[this.pos];
      if (op !== '*' && op !== '/') return valor;
      this.pos++;
      const derecha = this.unario();
      if (op === '/' && derecha === 0) throw new Error('División por cero');
      valor = op === '*' ? valor * derecha : valor / derecha;
    }
  }

  private unario(): number {
    this.espacios();
    const c = this.texto[this.pos];
    if (c === '+' || c === '-') {
      this.pos++;
      const v = this.unario();
      return c === '-' ? -v : v;
    }
    return this.porcentaje();
  }

  private porcentaje(): number {
    let valor = this.primario();
    this.espacios();
    while (this.texto[this.pos] === '%') {
      this.pos++;
      valor /= 100;
      this.espacios();
    }
    return valor;
  }

  private primario(): number {
    this.espacios();
    if (this.texto[this.pos] === '(') {
      this.pos++;
      const valor = this.suma();
      this.espacios();
      if (this.texto[this.pos] !== ')') throw new Error('Falta cerrar un paréntesis');
      this.pos++;
      return valor;
    }
    const inicio = this.pos;
    while (this.pos < this.texto.length && /[0-9.,]/.test(this.texto[this.pos])) this.pos++;
    const crudo = this.texto.slice(inicio, this.pos);
    if (!crudo) throw new Error('Falta un número');
    const valor = Number(normalizarNumero(crudo));
    if (!Number.isFinite(valor)) throw new Error(`"${crudo}" no es un número`);
    return valor;
  }
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Devuelve null si la celda se ha dejado vacía. Lanza un Error con un
 * mensaje legible si la expresión no es válida.
 */
export function evaluarEntradaCelda(entrada: string): ResultadoExpresion | null {
  const texto = entrada.trim();
  if (texto === '' || texto === '=') return null;
  if (texto.length > 500) throw new Error('La fórmula es demasiado larga');

  const esFormula = texto.startsWith('=');
  const cuerpo = esFormula ? texto.slice(1) : texto;
  const valor = new Analizador(cuerpo).evaluar();
  if (!Number.isFinite(valor)) throw new Error('El resultado no es un número válido');

  // Una fórmula que es solo un número ("=50") no aporta nada que guardar.
  const formula = esFormula && !/^\s*[+-]?[0-9.,]+\s*$/.test(cuerpo) ? texto : null;
  return { valor: redondear2(valor), formula };
}
