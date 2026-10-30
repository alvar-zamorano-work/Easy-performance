// Fechas de cualquier export, con el orden día/mes deducido por fichero y los números de serie de Excel.
// Un fichero guardado desde Excel escribe las fechas con el formato del equipo de quien lo guarda:
// "29/10/2026 12:04" en España, "10/29/2026 12:04 PM" en Estados Unidos o, si la celda no tenía formato
// de fecha, el número de serie (46324,5). Leerlas mal no da error: da cifras equivocadas. Por eso se deduce
// el orden con todas las fechas del fichero y se comprueba después que el resultado tiene sentido.

import { leerFecha } from '../jira/fechas.ts';

export type OrdenFechas = 'dm' | 'md';

const NUMERICA = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP])?\.?\s?[mM]?\.?)?$/;
/** Número de serie de Excel (días desde el 30 de diciembre de 1899), con decimales para la hora. Entre 1982 y 2119. */
const SERIE = /^(\d{5})(?:[.,](\d+))?$/;

/**
 * Orden día/mes de las fechas numéricas de un fichero. Si algún primer número pasa de 12, es el día; si pasa el
 * segundo, el mes va primero. Si ninguna fecha lo decide, se toma día/mes salvo que lleven AM/PM o lo indique la pista.
 */
export function ordenFechas(valores: string[], pista: OrdenFechas | null = null): OrdenFechas {
  let primeroMayor = false, segundoMayor = false, ampm = false;
  for (const v of valores) {
    const m = NUMERICA.exec(String(v).trim());
    if (!m) continue;
    if (+m[1] > 12) primeroMayor = true;
    if (+m[2] > 12) segundoMayor = true;
    if (m[7]) ampm = true;
  }
  if (primeroMayor && !segundoMayor) return 'dm';
  if (segundoMayor && !primeroMayor) return 'md';
  return pista || (ampm ? 'md' : 'dm');
}

/** Fecha desde un número de serie de Excel (sistema 1900). */
export function desdeSerie(n: number): Date {
  const dias = Math.floor(n), ms = Math.round((n - dias) * 864e5);
  const d = new Date(1899, 11, 30 + dias);
  return new Date(d.getTime() + ms);
}

/** Lee una fecha con el orden del fichero: ISO, meses en texto (12/Oct/26), numérica en ese orden o número de serie. */
export function leerFechaOrden(entrada: unknown, orden: OrdenFechas): Date | null {
  const v = String(entrada ?? '').trim();
  if (!v) return null;
  const s = SERIE.exec(v);
  if (s) {
    const n = parseFloat(s[1] + (s[2] ? '.' + s[2] : ''));
    return n >= 30000 && n <= 80000 ? desdeSerie(n) : null;
  }
  const m = NUMERICA.exec(v);
  if (!m) return leerFecha(v);
  const [dia, mes] = orden === 'md' ? [+m[2], +m[1]] : [+m[1], +m[2]];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  let y = +m[3]; if (y < 100) y += 2000;
  let h = +(m[4] || 0);
  const ap = m[7] ? m[7].toLowerCase() : null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return new Date(y, mes - 1, dia, h, +(m[5] || 0), +(m[6] || 0));
}

/** ¿Hay fechas numéricas o de serie en estos valores? (para decir en el informe cómo se han leído) */
export const hayNumericas = (valores: string[]) => valores.some((v) => NUMERICA.test(String(v).trim()));
export const haySeries = (valores: string[]) => valores.some((v) => SERIE.test(String(v).trim()));
