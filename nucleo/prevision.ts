// Previsión por probabilidad desde el ritmo real (Monte Carlo). Se simulan miles de futuros posibles: cada semana
// futura repite una semana del histórico reciente elegida al azar. No usa fechas que escribe nadie ni constantes:
// solo lo que el equipo ha terminado de verdad. La semilla es fija, así la misma entrada da siempre la misma cifra.

export const SEMANAS_MUESTRA = 12;
/** Semanas desde la primera entrega del equipo, y cuántas de ellas con entregas, para poder prever. */
export const MINIMO_SEMANAS = 6;
export const MINIMO_CON_ENTREGAS = 3;
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
 * Semanas del histórico reciente que sirven para prever: las últimas `semanas` completas desde la primera entrega.
 * Las semanas anteriores a que el equipo entregara nada no cuentan: un equipo nuevo no tiene ritmo cero, aún no existía.
 * Las semanas sin entregas después de la primera sí cuentan: son ritmo real.
 * null si hay menos de 6 semanas desde la primera entrega o menos de 3 con entregas.
 */
export function muestraDeRitmo(serie: number[], semanas = SEMANAS_MUESTRA, minimo = MINIMO_SEMANAS, minimoConEntregas = MINIMO_CON_ENTREGAS): number[] | null {
  const limpia = serie.map((x) => (Number.isFinite(x) && x >= 0 ? x : 0));
  const primera = limpia.findIndex((x) => x > 0);
  if (primera < 0) return null;
  const m = limpia.slice(primera).slice(-semanas);
  if (m.length < minimo || m.filter((x) => x > 0).length < minimoConEntregas) return null;
  return m;
}

/** Semilla única para las preguntas de "cuándo": la misma pregunta da siempre la misma respuesta en toda la página. */
export const SEMILLA_CUANDO = 7;

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
