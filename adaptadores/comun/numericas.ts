// Columnas numéricas de un export que pueden servir como estimación (puntos, horas, tallas en número).
// Sirve para que el cliente elija el campo de estimación cuando no se reconoce por su nombre.

import { leerCSV } from './csv.ts';
import { norm } from '../../nucleo/util.ts';

export interface ColumnaNumerica { columna: string; conValor: number; filas: number }

/** Identificadores, claves, sprints y fechas no son estimaciones aunque sean números. */
const NO_ESTIMACION = /\b(id|key|clave|sprint|sprints|parent|principal|padre|rank|orden|order|version|issue id|work item id|iid|number|numero)\b/;
const NUMERO = /^-?\d+([.,]\d+)?$/;

/** Columnas con al menos 5 valores y casi todos números. Se mira una muestra de filas. */
export function columnasNumericas(texto: string): ColumnaNumerica[] {
  const filas = leerCSV(texto.slice(0, 400000));
  if (filas.length < 2) return [];
  const cab = filas[0], muestra = filas.slice(1, 1000), out: ColumnaNumerica[] = [];
  const vistas = new Set<string>();
  cab.forEach((h, c) => {
    const nombre = h.trim();
    if (!nombre || vistas.has(nombre) || NO_ESTIMACION.test(norm(nombre))) return;
    vistas.add(nombre);
    let conValor = 0, numeros = 0;
    muestra.forEach((f) => { const v = (f[c] || '').trim(); if (v) { conValor++; if (NUMERO.test(v)) numeros++; } });
    if (conValor >= 5 && numeros / conValor >= 0.9) out.push({ columna: nombre, conValor, filas: muestra.length });
  });
  return out;
}
