// Columnas del export CSV de Jira (inglés y castellano). Nunca se leen columnas de personas.

import { Tx, idioma } from '../../nucleo/idioma.ts';
import { interior, norm } from '../../nucleo/util.ts';
import { describir, type ColumnaLeida } from '../comun/describir.ts';
import { aplicarColumnas } from '../comun/cabecera.ts';
export type { ColumnaLeida, AccionColumna } from '../comun/describir.ts';

export const ALIAS: Record<string, string[]> = {
  clave: ['issue key', 'work item key', 'key', 'clave', 'clave de incidencia', 'clave de la incidencia', 'clave del elemento de trabajo', 'clave de elemento de trabajo'],
  resumen: ['summary', 'resumen'],
  descripcion: ['description', 'descripcion'],
  tipo: ['issue type', 'work type', 'work item type', 'tipo de incidencia', 'tipo de trabajo', 'tipo de elemento de trabajo', 'tipo de la incidencia'],
  estado: ['status', 'estado'],
  categoria: ['status category', 'categoria de estado', 'categoria del estado'],
  cambioCategoria: ['status category changed', 'cambio de categoria de estado', 'categoria de estado cambiada', 'fecha de cambio de categoria de estado'],
  creada: ['created', 'creada', 'creado', 'fecha de creacion'],
  actualizada: ['updated', 'actualizada', 'actualizado', 'fecha de actualizacion'],
  resuelta: ['resolved', 'resuelta', 'resuelto', 'fecha de resolucion'],
  resolucion: ['resolution', 'resolucion'],
  prioridad: ['priority', 'prioridad'],
  componentes: ['components', 'component/s', 'componentes', 'componente/s', 'componente'],
  etiquetas: ['labels', 'etiquetas'],
  sprint: ['sprint', 'sprints'],
  puntos: ['story points', 'story point estimate', 'puntos de historia', 'estimacion de puntos de historia', 'story points estimate', 'estimacion de story points'],
  equipo: ['team', 'equipo', 'team name', 'nombre del equipo', 'assigned team', 'equipo asignado', 'squad', 'delivery team', 'scrum team'],
  tis: ['[chart] time in status', 'time in status', 'tiempo en estado', '[chart] tiempo en estado'],
  primera: ['[chart] date of first response', 'date of first response', 'fecha de primera respuesta', '[chart] fecha de primera respuesta'],
  padre: ['parent summary', 'resumen del principal', 'resumen principal', 'resumen del elemento principal'],
  padreClave: ['parent key', 'clave del principal', 'clave principal', 'clave del elemento principal'],
  proyecto: ['project name', 'nombre del proyecto', 'proyecto', 'project'],
  vence: ['due date', 'fecha de vencimiento', 'vencimiento', 'fecha limite', 'fecha de entrega'],
};

/** Campos que pueden venir en varias columnas con el mismo nombre (por ejemplo, Sprint). */
export const MULTIPLES: Record<string, 1> = { componentes: 1, etiquetas: 1, sprint: 1 };

export type MapaColumnas = Record<string, number | number[]>;

export function mapearColumnas(cab: string[]): MapaColumnas {
  const mapa: MapaColumnas = {};
  const nombres = cab.map((h) => ({ n: norm(h), i: interior(h) }));
  Object.keys(ALIAS).forEach((campo) => {
    const lista = ALIAS[campo], encontrados: number[] = [];
    for (let a = 0; a < lista.length && !encontrados.length; a++) {
      nombres.forEach((x, idx) => { if (x.n === lista[a] || x.i === lista[a]) encontrados.push(idx); });
    }
    if (encontrados.length) mapa[campo] = MULTIPLES[campo] ? encontrados : encontrados[0];
  });
  return mapa;
}

/** Valor con el que Jira escribe un campo de lista vacío en el export de Excel. No es un equipo. */
const VACIOS = new Set(['none', '(none)']);
export const valorVacio = (v: unknown): boolean => VACIOS.has(norm(v));

/** Títulos que hablan de equipo aunque no estén en la lista ("Assigned Scrum Team", "Delivery Squad"...). */
const PARECE_EQUIPO = /\b(team|teams|equipo|equipos|squad|squads)\b/;
/** Títulos de personas o de datos sobre el equipo, no del equipo ("Team Lead", "Team Size", "Team Role"...). */
const NO_ES_EQUIPO = /\b(lead|leads|leader|manager|owner|owners|member|members|lider|responsable|miembro|miembros|persona|people|user|users|usuario|email|correo|size|tamano|role|rol|capacity|capacidad|approval|aprobacion|id)\b/;
const NUMERO = /^-?\d+([.,]\d+)?$/;

export interface EleccionEquipo { i: number | undefined; descartada: string | null }

/**
 * Columna de equipo: la que da el nombre, salvo que venga vacía. Un export con todos los campos puede traer el campo
 * "Team" del sistema con "None" en todas las filas y los equipos reales en otra columna ("Assigned Team"). Solo en ese
 * caso (menos del 10 % de las tareas con valor) se busca otra: primero una de la lista de nombres conocidos, luego una
 * cuyo título habla de equipo, nunca una de personas ni una numérica. Se cuentan solo las filas de trabajo (con clave,
 * sin épicas ni subtareas), que son las que se miden.
 */
export function elegirColumnaEquipo(cab: string[], filas: string[][], actual: number | undefined, idx: { clave?: number; tipo?: number } = {}): EleccionEquipo {
  const trabajo = filas.slice(1).filter((f) => (idx.clave == null || String(f[idx.clave] ?? '').trim())
    && (idx.tipo == null || !/epic|epica|sub/.test(norm(f[idx.tipo]))));
  const n = trabajo.length;
  if (!n) return { i: actual, descartada: null };
  const datos = (i: number) => {
    const vals = trabajo.map((f) => String(f[i] ?? '').trim()).filter((v) => v && !valorVacio(v));
    return { cobertura: vals.length / n, distintos: new Set(vals.map((v) => v.toLocaleLowerCase('es'))).size, numerica: vals.length > 0 && vals.filter((v) => NUMERO.test(v)).length / vals.length >= 0.8 };
  };
  if (actual != null && datos(actual).cobertura >= 0.1) return { i: actual, descartada: null };
  const conocidos = new Set(ALIAS.equipo);
  const candidatas = cab.map((h, i) => ({ i, x: interior(h), h: norm(h) }))
    .filter((c) => c.i !== actual && !NO_ES_EQUIPO.test(c.x) && (conocidos.has(c.x) || conocidos.has(c.h) || PARECE_EQUIPO.test(c.x)))
    .map((c) => ({ i: c.i, conocida: conocidos.has(c.x) || conocidos.has(c.h), ...datos(c.i) }))
    // Una de la lista vale con un solo equipo (export de un equipo); una que solo lo parece tiene que distinguir al menos dos
    .filter((c) => !c.numerica && c.cobertura >= 0.5 && (c.conocida || c.distintos >= 2));
  const mejor = candidatas.sort((a, b) => Number(b.conocida) - Number(a.conocida) || b.cobertura - a.cobertura || a.i - b.i)[0];
  if (!mejor) return { i: actual, descartada: null };
  return { i: mejor.i, descartada: actual != null ? String(cab[actual]).trim() : null };
}

/** Columnas de vínculos entre tareas ("Outward issue link (Blocks)", "Vínculo de incidencia saliente (...)"). */
export function columnasDeEnlaces(cab: string[]): number[] {
  const out: number[] = [];
  cab.forEach((h, i) => { if (/^(outward|inward) issue link|^vinculo de (la )?incidencia|^enlace de (la )?incidencia/.test(norm(h))) out.push(i); });
  return out;
}

// ---------- Cómo se ha leído cada columna ----------

/** Qué es cada campo, en palabras llanas. */
const QUE_ES: Record<string, string> = {
  clave: 'Task key', resumen: 'Title: only in memory, never in the package', descripcion: 'Description: only to check whether the ticket is well defined',
  tipo: 'Type: story, task, bug or other', estado: 'Status: mapped to one of the nine common statuses', categoria: 'Status category: helps when the name is not enough',
  cambioCategoria: 'Date of the last status change', creada: 'Creation date', actualizada: 'Date of the last update', resuelta: 'Done date',
  resolucion: 'Resolution: separates discarded from done', prioridad: 'Priority', componentes: 'Component', etiquetas: 'Labels',
  sprint: 'Sprints it went through: joined into a list', puntos: 'Estimate', equipo: 'Team field', tis: 'Time in each status',
  primera: 'Date of first response', padre: 'Epic it belongs to (title)', padreClave: 'Epic it belongs to (key)', proyecto: 'Project',
  vence: 'Due date: for the epics view',
};
const QUE_ES_ES: Record<string, string> = {
  clave: 'Clave de la tarea', resumen: 'Título: solo en memoria, no sale en el paquete', descripcion: 'Descripción: solo para ver si el ticket está bien definido',
  tipo: 'Tipo: historia, tarea, bug u otro', estado: 'Estado: se traduce a uno de los nueve comunes', categoria: 'Categoría del estado: ayuda si el nombre no basta',
  cambioCategoria: 'Fecha del último cambio de estado', creada: 'Fecha de creación', actualizada: 'Fecha de la última actualización', resuelta: 'Fecha de terminado',
  resolucion: 'Resolución: separa lo descartado de lo terminado', prioridad: 'Prioridad', componentes: 'Componente', etiquetas: 'Etiquetas',
  sprint: 'Sprints por los que pasó: se juntan en una lista', puntos: 'Estimación', equipo: 'Campo de equipo', tis: 'Tiempo en cada estado',
  primera: 'Fecha de la primera respuesta', padre: 'Épica a la que pertenece (título)', padreClave: 'Épica a la que pertenece (clave)', proyecto: 'Proyecto',
  vence: 'Fecha de vencimiento: para la vista de épicas',
};
const queEs = (campo: string) => (idioma() === 'es' ? QUE_ES_ES[campo] : QUE_ES[campo]);
/** Describe columna a columna cómo se lee un export de Jira: qué es, si se usa, se descarta o se ignora. */
export function describirColumnas(texto: string, columnas?: Record<string, string>): ColumnaLeida[] {
  // Con las columnas que ha usado la lectura (elegidas a mano o la de equipo que se eligió por sus datos)
  return describir(texto, (cab) => aplicarColumnas(mapearColumnas(cab), cab, columnas), queEs);
}
