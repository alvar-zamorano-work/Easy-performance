// Semáforo y tendencia de una medida frente a la historia del propio equipo (o a sus límites).

import { Tx } from './idioma.ts';
import { formatear } from './formato.ts';
import { cuantil } from './util.ts';
import type { DefSemaforo } from './catalogo.ts';
import type { EstadoPor, EstadoReferencia, Limites, Rango, Semaforo, Tendencia } from './tipos.ts';

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

interface Resultado { estado: Semaforo; texto: string; por?: EstadoPor; limite?: number | null }

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
      if (v <= ref.hi + margen) rel = { estado: 'bien', texto: Tx('Within ', 'Dentro de ') + rango + Tx(' or better.', ' o mejor.'), por: 'banda' };
      else if (v <= ref.hi + margen + tol) rel = { estado: 'atencion', texto: Tx('Worse than ', 'Peor que ') + rango + '.', por: 'banda' };
      else rel = { estado: 'critico', texto: Tx('Much worse than ', 'Bastante peor que ') + rango + '.', por: 'banda' };
    } else {
      if (v >= ref.lo - margen) rel = { estado: 'bien', texto: Tx('Within ', 'Dentro de ') + rango + Tx(' or better.', ' o mejor.'), por: 'banda' };
      else if (v >= ref.lo - margen - tol) rel = { estado: 'atencion', texto: Tx('Worse than ', 'Peor que ') + rango + '.', por: 'banda' };
      else rel = { estado: 'critico', texto: Tx('Much worse than ', 'Bastante peor que ') + rango + '.', por: 'banda' };
    }
  }
  const abs = absoluto(def.limites, 'limite');
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
