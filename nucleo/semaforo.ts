// Semáforo y tendencia de una medida frente a la historia del propio equipo (o a sus límites).

import { Tx } from './idioma.ts';
import { formatear } from './formato.ts';
import { cuantil } from './util.ts';
import type { DefSemaforo } from './catalogo.ts';
import type { EstadoPor, EstadoReferencia, Limites, Rango, Revisar, Semaforo, Tendencia } from './tipos.ts';

/** Cambio mínimo con sentido para cada medida: evita que una variación mínima cambie el semáforo. */
export const DELTA_MIN: Record<string, number> = {
  ciclo: 1, total: 2, espera: 0.05, errores: 0.05, bugs: 0.5, retrabajo: 0.05, arrastradas: 0.05, regularidad: 0.1,
  entregas: 1, velocidad: 3, pendiente: 3, wip: 1, primera: 4, estimacion: 0.1, edad: 1, throughput: 0.5, valor: 0.05, carga: 3,
};

export function tendencia(actual: number | null | undefined, previo: number | null | undefined, dir: 'mas' | 'menos' | null): Tendencia | null {
  if (actual == null || previo == null) return null;
  const base = Math.abs(previo) < 1e-9 ? 1 : Math.abs(previo);
  const cambio = (actual - previo) / base;
  if (Math.abs(cambio) < 0.1) return { sentido: 'estable', cambio };
  const sube = cambio > 0;
  if (!dir) return { sentido: sube ? 'sube' : 'baja', cambio };
  const mejora = dir === 'menos' ? !sube : sube;
  return { sentido: mejora ? 'mejora' : 'empeora', cambio, sube };
}

interface Resultado { estado: Semaforo; texto: string; por?: EstadoPor; limite?: number | null; lado?: 'mejor'; revisar?: Revisar }

/** Medidas en las que cero quiere decir que no había actividad (no que todo fuera bien). */
const ACTIVIDAD: Record<string, 1> = { entregas: 1, velocidad: 1, throughput: 1 };

/**
 * Cuándo la comparación con lo normal no es de fiar: lo normal era cero (no había actividad de este tipo) o el valor
 * es más del triple de lo normal por el lado bueno, lo típico de una limpieza del tablero o de un cambio en cómo se registra.
 */
export function revisarComparacion(id: string, v: number | null | undefined, ref: Rango | undefined, def: DefSemaforo): Revisar | null {
  if (v == null || !ref || !def.dir) return null;
  const delta = DELTA_MIN[id] || 0;
  if (ACTIVIDAD[id] && ref.hi === 0 && ref.lo === 0 && Math.abs(v) >= Math.max(delta, 1e-9)) return 'cero';
  if (def.dir === 'mas' && ref.hi > 0 && v > 3 * ref.hi && v - ref.hi >= 2 * delta) return 'salto';
  return null;
}

/** Valores de la referencia: las R semanas antes de la ventana actual, sin las semanas en que el equipo aún no entregaba. */
export function valoresReferencia(serie: (number | null)[] | null | undefined, L: number, win: number, R: number, desde = 0): number[] {
  const out: number[] = [];
  if (!serie) return out;
  const ini = Math.max(0, L - win - R + 1, desde), fin = Math.max(0, L - win + 1);
  for (let i = ini; i < fin; i++) { const x = serie[i]; if (x != null) out.push(x); }
  return out;
}

/** Semanas sin entregas al principio del export a partir de las que se considera que el equipo empezó más tarde. */
export const ARRANQUE_TARDIO = 3;

/**
 * Primera semana de la referencia. Si el equipo empezó a entregar bastante después del principio del export,
 * la referencia empieza cuando una ventana de `win` semanas ya cae entera dentro de su vida: antes no hay
 * "lo normal" del equipo, solo su ausencia. Un arranque en las primeras semanas (semana parcial, export a mitad) no cambia nada.
 */
export function inicioReferencia(entregas: number[], win: number): number {
  const primera = entregas.findIndex((x) => x > 0);
  if (primera < 0) return entregas.length;
  return primera >= ARRANQUE_TARDIO ? primera + Math.max(1, win) - 1 : 0;
}

export function estadoMedida(id: string, v: number | null | undefined, ref: Rango | undefined, limEquipo: Limites | null, def: DefSemaforo): Resultado {
  if (v == null) return { estado: 'sin', texto: Tx('Not enough data in recent weeks.', 'Sin datos suficientes en las últimas semanas.') };
  if (!def.dir) return { estado: 'neutro', texto: '' };
  const orden: Record<string, number> = { bien: 0, atencion: 1, critico: 2 };
  const fmt = (x: number) => formatear(x, def.formato);
  function absoluto(lim: Limites | null | undefined, por: EstadoPor): Resultado | null {
    if (!lim || (lim.atencion == null && lim.critico == null)) return null;
    if (def.dir === 'menos') {
      if (lim.critico != null && v! >= lim.critico) return { estado: 'critico', texto: Tx('At or above the critical limit of ', 'Llega al límite crítico de ') + fmt(lim.critico) + '.', por, limite: lim.critico };
      if (lim.atencion != null && v! >= lim.atencion) return { estado: 'atencion', texto: Tx('At or above the attention limit of ', 'Llega al límite de atención de ') + fmt(lim.atencion) + '.', por, limite: lim.atencion };
    } else {
      if (lim.critico != null && v! <= lim.critico) return { estado: 'critico', texto: Tx('At or below the critical limit of ', 'Está por debajo del límite crítico de ') + fmt(lim.critico) + '.', por, limite: lim.critico };
      if (lim.atencion != null && v! <= lim.atencion) return { estado: 'atencion', texto: Tx('At or below the attention limit of ', 'Está por debajo del límite de atención de ') + fmt(lim.atencion) + '.', por, limite: lim.atencion };
    }
    return { estado: 'bien', texto: Tx('Within the limits set for this team.', 'Dentro de los límites del equipo.'), por, limite: null };
  }
  if (limEquipo) return absoluto(limEquipo, 'limite_equipo') || { estado: 'bien', texto: '', por: 'limite_equipo', limite: null };
  let rel: Resultado | null = null;
  if (ref) {
    const rango = Tx('its usual range (', 'su rango habitual (') + fmt(ref.lo) + Tx(' to ', ' a ') + fmt(ref.hi) + ')';
    const borde = def.dir === 'menos' ? ref.hi : ref.lo;
    const tol = Math.max(Math.abs(borde) * 0.25, DELTA_MIN[id] || 0);
    const margen = Math.max(Math.abs(borde) * 0.1, (DELTA_MIN[id] || 0) / 2);
    if (def.dir === 'menos') {
      if (v < ref.lo - margen) rel = { estado: 'bien', texto: Tx('Better than ', 'Mejor que ') + rango + '.', por: 'banda', lado: 'mejor' };
      else if (v <= ref.hi + margen) rel = { estado: 'bien', texto: Tx('Within ', 'Dentro de ') + rango + '.', por: 'banda' };
      else if (v <= ref.hi + margen + tol) rel = { estado: 'atencion', texto: Tx('Worse than ', 'Peor que ') + rango + '.', por: 'banda' };
      else rel = { estado: 'critico', texto: Tx('Much worse than ', 'Bastante peor que ') + rango + '.', por: 'banda' };
    } else {
      if (v > ref.hi + margen) rel = { estado: 'bien', texto: Tx('Better than ', 'Mejor que ') + rango + '.', por: 'banda', lado: 'mejor' };
      else if (v >= ref.lo - margen) rel = { estado: 'bien', texto: Tx('Within ', 'Dentro de ') + rango + '.', por: 'banda' };
      else if (v >= ref.lo - margen - tol) rel = { estado: 'atencion', texto: Tx('Worse than ', 'Peor que ') + rango + '.', por: 'banda' };
      else rel = { estado: 'critico', texto: Tx('Much worse than ', 'Bastante peor que ') + rango + '.', por: 'banda' };
    }
  }
  const abs = absoluto(def.limites, 'limite');
  // Comparación dudosa: no da alerta por la banda. Un límite fijo superado sigue mandando.
  const rev = revisarComparacion(id, v, ref, def);
  if (rev) {
    if (abs && abs.estado !== 'bien') return abs;
    const texto = rev === 'cero'
      ? Tx('Its normal was zero: in the reference weeks the team had no activity of this kind. Check whether the way work is recorded has changed before comparing.', 'Lo normal era cero: en las semanas de referencia el equipo no tenía actividad de este tipo. Comprueba si ha cambiado cómo se registra el trabajo antes de comparar.')
      : Tx('More than three times its usual range (', 'Más del triple de su rango habitual (') + fmt(ref!.lo) + Tx(' to ', ' a ') + fmt(ref!.hi) + Tx('). Check whether it was a board clean-up or a change in how work is recorded.', '). Comprueba si fue una limpieza del tablero o un cambio en cómo se registra el trabajo.');
    return { estado: 'sin', texto, por: 'banda', revisar: rev };
  }
  const cands = [rel, abs].filter((x): x is Resultado => !!x);
  if (!cands.length) return { estado: 'sin', texto: Tx('Not enough weeks yet to know what is normal for this team.', 'Aún no hay semanas suficientes para saber qué es lo habitual en este equipo.') };
  // Gana el peor. Si empatan, manda la banda del equipo (es la que se ve en la tarjeta).
  cands.sort((a, b) => orden[b.estado] - orden[a.estado] || (a.por === 'banda' ? -1 : 1));
  return cands[0];
}

/** Estado de la referencia: establecida con las semanas completas, provisional con banda pero menos semanas. */
export function estadoReferencia(ref: Rango | undefined, semanas: number): EstadoReferencia {
  if (!ref) return 'sin';
  return ref.n >= semanas ? 'establecida' : 'provisional';
}

/** Rango habitual (percentiles 15, 50 y 85) a partir de los valores de referencia. */
export function rangoDe(refVals: number[]): Rango | undefined {
  if (refVals.length < 6) return undefined;
  return { lo: cuantil(refVals, 0.15)!, hi: cuantil(refVals, 0.85)!, med: cuantil(refVals, 0.5)!, n: refVals.length };
}
