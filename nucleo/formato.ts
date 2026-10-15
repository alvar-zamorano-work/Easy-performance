// Formato de cifras y fechas para los textos (castellano de España).

export type Formato = 'pct' | 'dias' | 'horas' | 'dec' | 'num';

export function formatear(x: number | null | undefined, formato?: string | null): string {
  if (x == null || isNaN(x)) return 'sin datos';
  const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
  if (formato === 'pct') return Math.round(x * 100) + '%';
  if (formato === 'dias') return n1(x) + (Math.abs(x - 1) < 0.05 ? ' día' : ' días');
  if (formato === 'horas') return n1(x) + ' h';
  if (formato === 'dec') return (Math.round(x * 100) / 100).toLocaleString('es-ES');
  return n1(x);
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fechaCorta(d: Date): string {
  return d.getDate() + ' ' + MESES_CORTOS[d.getMonth()] + ' ' + d.getFullYear();
}
