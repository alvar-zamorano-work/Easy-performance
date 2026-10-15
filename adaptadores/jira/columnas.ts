// Columnas del export CSV de Jira (inglés y castellano). Nunca se leen columnas de personas.

import { interior, norm } from '../../nucleo/util.ts';

export const ALIAS: Record<string, string[]> = {
  clave: ['issue key', 'work item key', 'key', 'clave', 'clave de incidencia', 'clave de la incidencia', 'clave del elemento de trabajo', 'clave de elemento de trabajo'],
  resumen: ['summary', 'resumen'],
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
  equipo: ['team', 'equipo', 'team name', 'nombre del equipo'],
  tis: ['[chart] time in status', 'time in status', 'tiempo en estado', '[chart] tiempo en estado'],
  primera: ['[chart] date of first response', 'date of first response', 'fecha de primera respuesta', '[chart] fecha de primera respuesta'],
  padre: ['parent summary', 'resumen del principal', 'resumen principal', 'resumen del elemento principal'],
  proyecto: ['project name', 'nombre del proyecto', 'proyecto'],
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
