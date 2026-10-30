// Fila de títulos de un export. Muchos exports guardados desde Excel traen filas encima de los títulos
// ("Displaying 2784 issues at ...", el nombre del filtro, filas vacías). Se busca la fila que mejor
// encaja con las columnas conocidas de la plataforma entre las primeras filas del fichero.

import type { MapaColumnas } from './describir.ts';
import { norm } from '../../nucleo/util.ts';

export const FILAS_A_MIRAR = 30;

export interface Cabecera {
  /** Índice de la fila de títulos, o -1 si ninguna tiene la columna de clave. */
  indice: number;
  mapa: MapaColumnas;
  /** Fila más parecida a una de títulos aunque no tenga clave: sirve para elegir columnas a mano. */
  probable: number;
}

/** Busca la fila de títulos: la que tiene clave y más columnas reconocidas; si ninguna tiene clave, la más probable. */
export function buscarCabecera(filas: string[][], mapear: (cab: string[]) => MapaColumnas): Cabecera {
  let mejor = -1, mejorPuntos = -1, mejorMapa: MapaColumnas = {}, probable = 0, probablePuntos = -1;
  const hasta = Math.min(filas.length, FILAS_A_MIRAR);
  for (let i = 0; i < hasta; i++) {
    const fila = filas[i] || [];
    const mapa = mapear(fila);
    const puntos = Object.keys(mapa).length;
    if (mapa.clave != null && puntos > mejorPuntos) { mejor = i; mejorPuntos = puntos; mejorMapa = mapa; }
    // Fila probable: muchas celdas con texto corto y distinto, como unos títulos
    const textos = fila.map((x) => String(x || '').trim()).filter((x) => x && x.length <= 60 && !/^[\d.,:/\s-]+$/.test(x));
    const p = new Set(textos.map(norm)).size + puntos * 3;
    if (p > probablePuntos) { probable = i; probablePuntos = p; }
  }
  return { indice: mejor, mapa: mejorMapa, probable: mejor >= 0 ? mejor : probable };
}

/** Aplica la elección manual de columnas (campo -> nombre de columna) sobre el mapa automático. */
export function aplicarColumnas(mapa: MapaColumnas, cab: string[], columnas: Record<string, string> | undefined): MapaColumnas {
  if (!columnas) return mapa;
  const out: MapaColumnas = { ...mapa };
  Object.keys(columnas).forEach((campo) => {
    const nombre = columnas[campo];
    if (!nombre) return; // sin elegir: se queda lo que haya detectado la página
    const i = cab.findIndex((h) => String(h).trim() === nombre);
    if (i >= 0) out[campo] = Array.isArray(out[campo]) ? [i] : i;
  });
  return out;
}
