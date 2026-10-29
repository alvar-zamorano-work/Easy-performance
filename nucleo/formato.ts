// Formato de cifras y fechas para los textos, en el idioma del núcleo (inglés por defecto, en-GB; castellano, es-ES).

import { Tx, idioma, regional } from './idioma.ts';
export type Formato = 'pct' | 'dias' | 'horas' | 'dec' | 'num' | 'eur';

/** Porcentaje ya redondeado a texto: "25%" en inglés, "25 %" (con espacio fino que no se parte) en castellano. */
export const conPorcentaje = (n: string | number): string => (idioma() === 'es' ? n + ' %' : n + '%');

export function formatear(x: number | null | undefined, formato?: string | null): string {
  if (x == null || isNaN(x)) return Tx('no data', 'sin datos');
  const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString(regional());
  if (formato === 'pct') return conPorcentaje(Math.round(x * 100));
  if (formato === 'dias') return n1(x) + (Math.abs(x - 1) < 0.05 ? Tx(' day', ' día') : Tx(' days', ' días'));
  if (formato === 'horas') return n1(x) + ' h';
  // Sin decimales. En inglés, símbolo delante y miles con coma; en castellano, símbolo detrás y miles con punto.
  if (formato === 'eur') {
    const m = String(Math.round(x));
    return idioma() === 'es' ? m.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €' : '€' + m.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  if (formato === 'dec') return (Math.round(x * 100) / 100).toLocaleString(regional());
  return n1(x);
}

const MESES_CORTOS = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] };

export function fechaCorta(d: Date): string {
  return d.getDate() + ' ' + MESES_CORTOS[idioma()][d.getMonth()] + ' ' + d.getFullYear();
}
