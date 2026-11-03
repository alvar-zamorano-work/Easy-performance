// Tipos de tarea corregibles por el cliente. El adaptador propone un tipo para cada tipo de origen ("Story", "Defect"...)
// y aquí se aplica lo que decide el cliente: su mapeo de tipos y, si la usa, la etiqueta que marca un bug.
// Épicas y subtareas ya salen del cálculo en el adaptador, así que solo se eligen tipos de trabajo.

import { norm } from './util.ts';
import type { Lectura, Tarea, TipoTarea } from './modelo.ts';

export interface ReglasTipo {
  /** Tipo de origen -> tipo común, solo los que el cliente ha cambiado. */
  mapeoTipos?: Record<string, TipoTarea> | null;
  /** Etiqueta que marca una tarea como bug aunque su tipo diga otra cosa. */
  etiquetaBug?: string | null;
}

export const TIPOS_ELEGIBLES: TipoTarea[] = ['historia', 'error', 'tarea', 'otro'];

export interface TipoDeOrigen { tipo_origen: string; n: number; propuesto: TipoTarea; tipo: TipoTarea; cambiado: boolean }

/** Tipos de origen de las tareas medidas, con el tipo que propone el adaptador y el que queda tras las reglas. */
export function tiposDeOrigen(lectura: Lectura, reglas: ReglasTipo = {}): TipoDeOrigen[] {
  const cuenta = new Map<string, { n: number; votos: Record<string, number> }>();
  lectura.tareas.forEach((t) => {
    const k = t.tipo_origen || '';
    const c = cuenta.get(k) || { n: 0, votos: {} };
    c.n++; c.votos[t.tipo] = (c.votos[t.tipo] || 0) + 1;
    cuenta.set(k, c);
  });
  const mapeo = reglas.mapeoTipos || {};
  return [...cuenta.entries()].map(([k, c]) => {
    const propuesto = Object.keys(c.votos).sort((a, b) => c.votos[b] - c.votos[a])[0] as TipoTarea;
    const elegido = mapeo[k] && TIPOS_ELEGIBLES.includes(mapeo[k]) ? mapeo[k] : null;
    return { tipo_origen: k, n: c.n, propuesto, tipo: elegido || propuesto, cambiado: !!elegido && elegido !== propuesto };
  }).sort((a, b) => b.n - a.n || a.tipo_origen.localeCompare(b.tipo_origen));
}

/** Etiquetas de las tareas medidas con cuántas tareas tiene cada una, para elegir la que marca un bug. */
export function etiquetasDe(lectura: Lectura): { etiqueta: string; n: number }[] {
  const cuenta = new Map<string, number>();
  lectura.tareas.forEach((t) => { new Set(t.etiquetas).forEach((e) => { if (e) cuenta.set(e, (cuenta.get(e) || 0) + 1); }); });
  return [...cuenta.entries()].map(([etiqueta, n]) => ({ etiqueta, n })).sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta));
}

/** Tipo de una tarea según las reglas del cliente. */
export function tipoConReglas(t: Tarea, reglas: ReglasTipo): TipoTarea {
  if (t.tipo === 'epica' || t.tipo === 'subtarea') return t.tipo;
  const etiqueta = norm(reglas.etiquetaBug || '');
  if (etiqueta && t.etiquetas.some((e) => norm(e) === etiqueta)) return 'error';
  const elegido = (reglas.mapeoTipos || {})[t.tipo_origen || ''];
  return elegido && TIPOS_ELEGIBLES.includes(elegido) ? elegido : t.tipo;
}

/**
 * Lectura con los tipos del cliente. Si no hay nada que cambiar, devuelve la misma lectura.
 * Nunca modifica la original: las tareas que cambian son copias.
 */
export function aplicarReglasTipo(lectura: Lectura, reglas: ReglasTipo = {}): Lectura {
  const hayMapeo = reglas.mapeoTipos && Object.keys(reglas.mapeoTipos).length > 0;
  if (!hayMapeo && !norm(reglas.etiquetaBug || '')) return lectura;
  let cambios = 0;
  const tareas = lectura.tareas.map((t) => {
    const tipo = tipoConReglas(t, reglas);
    if (tipo === t.tipo) return t;
    cambios++;
    return { ...t, tipo };
  });
  return cambios ? { ...lectura, tareas } : lectura;
}
