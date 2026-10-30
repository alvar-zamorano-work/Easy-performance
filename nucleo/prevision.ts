// Previsión por probabilidad desde el ritmo real (Monte Carlo). Se simulan miles de futuros posibles: cada semana
// futura repite una semana del histórico reciente elegida al azar. No usa fechas que escribe nadie ni constantes:
// solo lo que el equipo ha terminado de verdad. La semilla es fija, así la misma entrada da siempre la misma cifra.

export const SEMANAS_MUESTRA = 12;
export const MINIMO_SEMANAS = 6;
export const SIMULACIONES = 5000;
/** Más allá de dos años la previsión no dice nada útil. */
export const MAXIMO_SEMANAS = 104;

/** Generador pseudoaleatorio con semilla (mulberry32): reproducible en tests y entre recargas. */
function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const percentil = (ordenados: number[], p: number): number => ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.ceil(p * ordenados.length) - 1))];

/**
 * Semanas del histórico reciente que sirven para prever: las últimas `semanas` completas.
 * null si hay pocas semanas o si el equipo no ha terminado nada en ellas.
 */
export function muestraDeRitmo(serie: number[], semanas = SEMANAS_MUESTRA): number[] | null {
  const m = serie.slice(-semanas).filter((x) => Number.isFinite(x) && x >= 0);
  if (m.length < MINIMO_SEMANAS || !m.some((x) => x > 0)) return null;
  return m;
}

export interface PrevisionCuantas {
  semanas: number;
  /** Tareas que se terminan con un 85 % de probabilidad (al menos esas). */
  p85: number;
  /** La mitad de los futuros terminan esto o más. */
  p50: number;
  muestra: number;
}

/** Cuántas tareas se terminan en las próximas `semanas`. */
export function cuantasEnSemanas(muestra: number[], semanas: number, semilla = 1): PrevisionCuantas {
  const r = aleatorio(semilla), totales: number[] = [];
  for (let s = 0; s < SIMULACIONES; s++) {
    let total = 0;
    for (let w = 0; w < semanas; w++) total += muestra[Math.floor(r() * muestra.length)];
    totales.push(total);
  }
  totales.sort((a, b) => a - b);
  // "Al menos p85 con un 85 %" es el percentil 15 de los totales
  return { semanas, p85: percentil(totales, 0.15), p50: percentil(totales, 0.5), muestra: muestra.length };
}

export interface PrevisionCuando {
  tareas: number;
  /** Semanas en las que se terminan con un 85 % de probabilidad (como mucho esas). null si pasan de dos años. */
  p85: number | null;
  p50: number | null;
  muestra: number;
}

/** En cuántas semanas se terminan `tareas` tareas. */
export function cuandoTerminan(muestra: number[], tareas: number, semilla = 1): PrevisionCuando {
  if (tareas <= 0) return { tareas, p85: 0, p50: 0, muestra: muestra.length };
  const r = aleatorio(semilla), semanas: number[] = [];
  for (let s = 0; s < SIMULACIONES; s++) {
    let hechas = 0, w = 0;
    while (hechas < tareas && w <= MAXIMO_SEMANAS) { hechas += muestra[Math.floor(r() * muestra.length)]; w++; }
    semanas.push(hechas >= tareas ? w : Infinity);
  }
  semanas.sort((a, b) => a - b);
  const p = (q: number) => { const x = percentil(semanas, q); return Number.isFinite(x) && x <= MAXIMO_SEMANAS ? x : null; };
  return { tareas, p85: p(0.85), p50: p(0.5), muestra: muestra.length };
}
