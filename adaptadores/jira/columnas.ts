// Columnas del export CSV de Jira (inglés y castellano). Nunca se leen columnas de personas.

import { interior, norm } from '../../nucleo/util.ts';
import { leerCSV } from '../comun/csv.ts';

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

/** Columnas de vínculos entre tareas ("Outward issue link (Blocks)", "Vínculo de incidencia saliente (...)"). */
export function columnasDeEnlaces(cab: string[]): number[] {
  const out: number[] = [];
  cab.forEach((h, i) => { if (/^(outward|inward) issue link|^vinculo de (la )?incidencia|^enlace de (la )?incidencia/.test(norm(h))) out.push(i); });
  return out;
}

// ---------- Cómo se ha leído cada columna (la parte de la capa semántica que ya funciona con Jira) ----------

/** Columnas de personas o de texto libre con nombres. Se descartan siempre; ante la duda, también. */
const PERSONAS = ['assignee', 'reporter', 'creator', 'watchers', 'persona asignada', 'responsable', 'informador', 'creador', 'observadores', 'votantes', 'voters', 'project lead', 'responsable del proyecto'];
const TEXTO_CON_NOMBRES = ['comment', 'comments', 'comentario', 'comentarios', 'log work', 'registro de trabajo', 'attachment', 'archivo adjunto', 'adjuntos'];
const PARECE_PERSONA = /\b(user|usuario|email|correo|account id|id de cuenta)\b/;

/** Qué es cada campo, en palabras llanas. */
const QUE_ES: Record<string, string> = {
  clave: 'Task key', resumen: 'Title: only in memory, never in the package', descripcion: 'Description: only to check whether the ticket is well defined',
  tipo: 'Type: story, task, bug or other', estado: 'Status: mapped to one of the nine common statuses', categoria: 'Status category: helps when the name is not enough',
  cambioCategoria: 'Date of the last status change', creada: 'Creation date', actualizada: 'Date of the last update', resuelta: 'Done date',
  resolucion: 'Resolution: separates discarded from done', prioridad: 'Priority', componentes: 'Component', etiquetas: 'Labels',
  sprint: 'Sprints it went through: joined into a list', puntos: 'Estimate', equipo: 'Team field', tis: 'Time in each status',
  primera: 'Date of first response', padre: 'Epic it belongs to (title)', padreClave: 'Epic it belongs to (key)', proyecto: 'Project',
};
/** Campos de los que no se enseña un ejemplo: texto libre o valores ilegibles. */
const SIN_EJEMPLO: Record<string, 1> = { resumen: 1, descripcion: 1, tis: 1 };

export type AccionColumna = 'usa' | 'descarta' | 'ignora';
export interface ColumnaLeida {
  /** Nombre de la columna tal como viene en el export. */
  columna: string;
  /** Cuántas columnas tienen ese nombre (Sprint suele venir repetida). */
  veces: number;
  /** Campo del modelo al que va, o null si no se usa. */
  campo: string | null;
  que: string;
  accion: AccionColumna;
  /** Un valor de ejemplo, solo de columnas que se usan y sin texto libre. Nunca de personas. */
  ejemplo: string | null;
}

/** Describe columna a columna cómo se lee un export de Jira: qué es, si se usa, se descarta o se ignora. */
export function describirColumnas(texto: string): ColumnaLeida[] {
  // Basta con la cabecera y unas filas para los ejemplos
  const filas = leerCSV(texto.slice(0, 200000));
  if (!filas.length) return [];
  const cab = filas[0];
  const mapa = mapearColumnas(cab);
  // Los ejemplos salen de tareas de trabajo, no de épicas ni subtareas
  const iTipo = typeof mapa.tipo === 'number' ? mapa.tipo : -1;
  const todas = filas.slice(1, 400);
  const trabajo = iTipo < 0 ? todas : todas.filter((f) => !/epic|epica|sub/.test(norm(f[iTipo])));
  const muestra = trabajo.length ? trabajo : todas;
  const campoDe: Record<number, string> = {};
  Object.keys(mapa).forEach((campo) => { const v = mapa[campo]; (Array.isArray(v) ? v : [v]).forEach((i) => { campoDe[i] = campo; }); });
  const out: ColumnaLeida[] = [], vistas: Record<string, ColumnaLeida> = {};
  cab.forEach((h, i) => {
    const nombre = String(h).trim();
    if (vistas[nombre]) { vistas[nombre].veces++; return; }
    const n = norm(nombre), x = interior(nombre);
    const persona = PERSONAS.some((p) => n === p || x === p || n.startsWith(p + ' ')) || PARECE_PERSONA.test(n);
    const conNombres = TEXTO_CON_NOMBRES.some((p) => n === p || x === p || n.startsWith(p + ' '));
    const campo = persona || conNombres ? null : campoDe[i] || null;
    let ejemplo: string | null = null;
    if (campo && !SIN_EJEMPLO[campo]) {
      const fila = muestra.find((f) => f[i] && String(f[i]).trim());
      if (fila) { const v = String(fila[i]).trim().replace(/\s+/g, ' '); ejemplo = v.length > 32 ? v.slice(0, 31) + '…' : v; }
    }
    const c: ColumnaLeida = {
      columna: nombre, veces: 1, campo, ejemplo,
      que: persona ? 'Person' : conNombres ? 'Text that may contain names' : campo ? QUE_ES[campo] : 'Not recognised',
      accion: persona || conNombres ? 'descarta' : campo ? 'usa' : 'ignora',
    };
    vistas[nombre] = c;
    out.push(c);
  });
  return out;
}
