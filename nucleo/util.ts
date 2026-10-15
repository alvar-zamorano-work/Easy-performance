// Utilidades sin dependencias: texto, estadística y fechas.
// Portadas tal cual del motor de la v0 para que los resultados sean idénticos.

export const DIA = 864e5;

export function sinAcentos(s: unknown): string {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function norm(h: unknown): string {
  return sinAcentos(h == null ? '' : h).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Nombre de columna sin el envoltorio "Custom field (...)". */
export function interior(h: unknown): string {
  const n = norm(h);
  const m = n.match(/^(custom field|campo personalizado)\s*\((.*)\)$/);
  return m ? m[2].trim() : n;
}

type Num = number | null | undefined;

function ordenar(a: number[]): number[] {
  return a.slice().sort((x, y) => x - y);
}

export function cuantil(arr: Num[], q: number): number | null {
  let a = arr.filter((v): v is number => v != null && !isNaN(v));
  if (!a.length) return null;
  a = ordenar(a);
  const p = (a.length - 1) * q, i = Math.floor(p), f = p - i;
  return i + 1 < a.length ? a[i] + (a[i + 1] - a[i]) * f : a[i];
}

export function media(arr: Num[]): number | null {
  const a = arr.filter((v): v is number => v != null && !isNaN(v));
  if (!a.length) return null;
  let s = 0;
  a.forEach((v) => { s += v; });
  return s / a.length;
}

/** Desviación típica muestral. Como en la v0, recorre la lista sin filtrar. */
export function desv(a: number[]): number | null {
  const m = media(a);
  if (m == null || a.length < 2) return null;
  let s = 0;
  a.forEach((v) => { s += (v - m) * (v - m); });
  return Math.sqrt(s / (a.length - 1));
}

function rangos(a: number[]): number[] {
  const idx = a.map((v, i) => [v, i] as [number, number]).sort((x, y) => x[0] - y[0]);
  const r = new Array<number>(a.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const rango = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = rango;
    i = j + 1;
  }
  return r;
}

/** Correlación de rangos de Spearman. */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  const rx = rangos(xs), ry = rangos(ys), mx = media(rx)!, my = media(ry)!;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < rx.length; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sx += (rx[i] - mx) * (rx[i] - mx);
    sy += (ry[i] - my) * (ry[i] - my);
  }
  return (sx && sy) ? sxy / Math.sqrt(sx * sy) : null;
}

/** Lunes de la semana de d, a medianoche local. */
export function inicioSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function sumarDias(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

export function diaLaborableAnterior(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (n > 0) {
    x.setDate(x.getDate() - 1);
    if (x.getDay() !== 0 && x.getDay() !== 6) n--;
  }
  return x;
}
