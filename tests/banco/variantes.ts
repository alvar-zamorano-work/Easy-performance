// Variantes de un export de Jira para el banco de exports: cada una cambia una sola cosa
// de las que cambian de un cliente a otro (idioma, separador, fechas, unidades, columnas, estados).

import { leerCSV } from '../../adaptadores/comun/csv.ts';
import type { FicheroEntrada } from '../../nucleo/modelo.ts';

export interface Tabla { cab: string[]; filas: string[][] }

export function aTabla(texto: string): Tabla {
  const f = leerCSV(texto);
  return { cab: f[0], filas: f.slice(1) };
}

export function aCSV(t: Tabla, sep = ',', fin = '\n'): string {
  const campo = (v: string) => (v.includes(sep) || v.includes('"') || v.includes('\n') || v.includes('\r') ? '"' + v.replace(/"/g, '""') + '"' : v);
  return [t.cab, ...t.filas].map((f) => f.map(campo).join(sep)).join(fin) + fin;
}

export function fichero(nombre: string, t: Tabla, sep?: string, fin?: string): FicheroEntrada {
  return { nombre, texto: aCSV(t, sep, fin) };
}

const copia = (t: Tabla): Tabla => ({ cab: [...t.cab], filas: t.filas.map((f) => [...f]) });
const idx = (t: Tabla, nombre: string) => t.cab.map((h, i) => (h === nombre ? i : -1)).filter((i) => i >= 0);

/** Cambia los valores de una columna con una función. */
export function cambiarColumna(t: Tabla, nombre: string, fn: (v: string) => string): Tabla {
  const c = copia(t), is = idx(c, nombre);
  if (!is.length) throw new Error('No existe la columna ' + nombre);
  c.filas.forEach((f) => is.forEach((i) => { f[i] = fn(f[i] || ''); }));
  return c;
}

export function quitarColumna(t: Tabla, nombre: string): Tabla {
  const is = new Set(idx(t, nombre));
  if (!is.size) throw new Error('No existe la columna ' + nombre);
  return { cab: t.cab.filter((_, i) => !is.has(i)), filas: t.filas.map((f) => f.filter((_, i) => !is.has(i))) };
}

export function renombrarCabeceras(t: Tabla, mapa: Record<string, string>): Tabla {
  return { cab: t.cab.map((h) => mapa[h] ?? h), filas: t.filas };
}

const MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const FECHA_JIRA = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2}) (\d{1,2}):(\d{2}) (AM|PM)$/;

function partes(v: string) {
  const m = v.match(FECHA_JIRA);
  if (!m) return null;
  let h = +m[4];
  if (m[6] === 'PM' && h < 12) h += 12;
  if (m[6] === 'AM' && h === 12) h = 0;
  return { d: +m[1], mes: MESES_EN.indexOf(m[2]), a: 2000 + +m[3], h, min: +m[5] };
}
const dos = (n: number) => String(n).padStart(2, '0');

/** "12/Oct/26 8:12 PM" -> "12/oct./26 20:12" (Jira en castellano). */
export function fechaCastellano(v: string): string {
  const p = partes(v);
  return p ? `${dos(p.d)}/${MESES_ES[p.mes]}./${String(p.a).slice(2)} ${p.h}:${dos(p.min)}` : v;
}

/** "12/Oct/26 8:12 PM" -> "12/10/2026 20:12". */
export function fechaNumerica(v: string): string {
  const p = partes(v);
  return p ? `${dos(p.d)}/${dos(p.mes + 1)}/${p.a} ${dos(p.h)}:${dos(p.min)}` : v;
}

export const COLUMNAS_FECHA = ['Created', 'Updated', 'Resolved', 'Status category changed'];

export const CABECERAS_CASTELLANO: Record<string, string> = {
  'Summary': 'Resumen', 'Issue key': 'Clave de incidencia', 'Issue id': 'ID de la incidencia', 'Issue Type': 'Tipo de incidencia',
  'Status': 'Estado', 'Project key': 'Clave del proyecto', 'Project name': 'Nombre del proyecto', 'Project type': 'Tipo de proyecto',
  'Priority': 'Prioridad', 'Resolution': 'Resolución', 'Assignee': 'Persona asignada', 'Reporter': 'Informador',
  'Created': 'Creada', 'Updated': 'Actualizada', 'Resolved': 'Resuelta', 'Components': 'Componentes', 'Labels': 'Etiquetas',
  'Description': 'Descripción', 'Custom field (Story Points)': 'Campo personalizado (Puntos de historia)',
  'Custom field (Team)': 'Campo personalizado (Equipo)', 'Sprint': 'Sprint',
  'Custom field ([CHART] Date of First Response)': 'Campo personalizado ([CHART] Fecha de primera respuesta)',
  'Custom field ([CHART] Time in Status)': 'Campo personalizado ([CHART] Tiempo en estado)',
  'Parent': 'Principal', 'Parent key': 'Clave del principal', 'Parent summary': 'Resumen del principal',
  'Status category': 'Categoría de estado', 'Status category changed': 'Cambio de categoría de estado',
};
export const ESTADOS_CASTELLANO: Record<string, string> = {
  'To Do': 'Tareas por hacer', 'In Progress': 'En curso', 'In Review': 'En revisión', 'Blocked': 'Bloqueado', 'Done': 'Listo',
};
export const CATEGORIAS_CASTELLANO: Record<string, string> = { 'To Do': 'Por hacer', 'In Progress': 'En curso', 'Done': 'Listo' };
export const PRIORIDADES_CASTELLANO: Record<string, string> = { 'Highest': 'Más alta', 'Critical': 'Crítica', 'High': 'Alta', 'Medium': 'Media', 'Low': 'Baja', 'Lowest': 'Más baja' };
export const TIPOS_CASTELLANO: Record<string, string> = { 'Story': 'Historia', 'Bug': 'Error', 'Task': 'Tarea', 'Epic': 'Épica', 'Sub-task': 'Subtarea' };
export const RESOLUCIONES_CASTELLANO: Record<string, string> = { 'Done': 'Finalizada', "Won't Do": 'No se hará', 'Duplicate': 'Duplicado' };

const traducir = (mapa: Record<string, string>) => (v: string) => mapa[v] ?? v;

/** Export de un Jira en castellano: cabeceras, fechas, estados, categorías, prioridades, tipos y resoluciones. */
export function enCastellano(t: Tabla): Tabla {
  let c = t;
  COLUMNAS_FECHA.forEach((col) => { c = cambiarColumna(c, col, fechaCastellano); });
  c = cambiarColumna(c, 'Status', traducir(ESTADOS_CASTELLANO));
  c = cambiarColumna(c, 'Status category', traducir(CATEGORIAS_CASTELLANO));
  c = cambiarColumna(c, 'Priority', traducir(PRIORIDADES_CASTELLANO));
  c = cambiarColumna(c, 'Issue Type', traducir(TIPOS_CASTELLANO));
  c = cambiarColumna(c, 'Resolution', traducir(RESOLUCIONES_CASTELLANO));
  return renombrarCabeceras(c, CABECERAS_CASTELLANO);
}
