// Columnas de texto con pocos valores distintos que sirven para repartir el trabajo (tipo de requisito, línea de negocio...).
// Sirve para que el cliente elija el campo de reparto. Nunca se proponen columnas de personas ni de texto libre.

import { leerCSV } from './csv.ts';
import { norm } from '../../nucleo/util.ts';

export interface ColumnaCategorica { columna: string; valores: number; conValor: number; filas: number }

const PERSONAS = /\b(assignee|reporter|creator|watchers?|asignad|responsable|informador|creador|observador|autor|author|revisor|reviewer|user|usuario|email|correo)\b/;
const TEXTO_LIBRE = /\b(summary|resumen|description|descripcion|comment|comentario|title|titulo|key|clave|id|link|vinculo|enlace|attachment|adjunto)\b/;

/** Columnas con entre 2 y 15 valores distintos, presentes en al menos la mitad de las filas de la muestra. */
export function columnasCategoricas(texto: string): ColumnaCategorica[] {
  const filas = leerCSV(texto.slice(0, 400000));
  if (filas.length < 2) return [];
  const cab = filas[0], muestra = filas.slice(1, 1000), out: ColumnaCategorica[] = [];
  const vistas = new Set<string>();
  cab.forEach((h, c) => {
    const nombre = String(h || '').trim(), n = norm(nombre);
    if (!nombre || vistas.has(nombre) || PERSONAS.test(n) || TEXTO_LIBRE.test(n)) return;
    vistas.add(nombre);
    const distintos = new Set<string>();
    let conValor = 0, numeros = 0;
    muestra.forEach((f) => { const v = String(f[c] || '').trim(); if (v) { conValor++; distintos.add(v); if (/^-?\d+([.,]\d+)?$/.test(v)) numeros++; } });
    // Las columnas numéricas (puntos, horas) no sirven para repartir
    if (conValor && numeros / conValor >= 0.9) return;
    if (distintos.size >= 2 && distintos.size <= 15 && conValor >= muestra.length * 0.5) out.push({ columna: nombre, valores: distintos.size, conValor, filas: muestra.length });
  });
  return out;
}
