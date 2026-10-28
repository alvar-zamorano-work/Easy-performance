// Formato de cifras y fechas para los textos (inglés, en-GB).

export type Formato = 'pct' | 'dias' | 'horas' | 'dec' | 'num' | 'eur';

export function formatear(x: number | null | undefined, formato?: string | null): string {
  if (x == null || isNaN(x)) return 'no data';
  const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-GB');
  if (formato === 'pct') return Math.round(x * 100) + '%';
  if (formato === 'dias') return n1(x) + (Math.abs(x - 1) < 0.05 ? ' day' : ' days');
  if (formato === 'horas') return n1(x) + ' h';
  // Símbolo delante y separador de miles con coma, sin decimales
  if (formato === 'eur') return '€' + String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (formato === 'dec') return (Math.round(x * 100) / 100).toLocaleString('en-GB');
  return n1(x);
}

const MESES_CORTOS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fechaCorta(d: Date): string {
  return d.getDate() + ' ' + MESES_CORTOS[d.getMonth()] + ' ' + d.getFullYear();
}
