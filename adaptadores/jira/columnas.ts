// Columnas del export CSV de Jira (inglés y castellano). Nunca se leen columnas de personas.

import { Tx, idioma } from '../../nucleo/idioma.ts';
import { interior, norm } from '../../nucleo/util.ts';
import { describir, ejemplosDeColumnas, type ColumnaLeida } from '../comun/describir.ts';
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
  // Jira Server / Data Center: la épica va en "Epic Link" (la clave en el CSV, el nombre en el Excel) y los enlaces en una lista
  epicLink: ['epic link', 'enlace de epica', 'enlace a la epica', 'vinculo de epica'],
  epicNombre: ['epic name', 'nombre de epica', 'nombre de la epica'],
  idTarea: ['issue id', 'work item id', 'id de la incidencia', 'id de incidencia', 'id del elemento de trabajo'],
  enlacesLista: ['linked issues', 'linked work items', 'incidencias enlazadas', 'elementos de trabajo vinculados'],
  // Fecha en que empezó el trabajo: ningún export de Jira la trae con un nombre fijo; solo se usa si se elige a mano
  empezada: [],
};

/** Clave de una tarea de Jira (PROJ-123). */
export const esClaveJira = (v: unknown): boolean => /^[A-Z][A-Z0-9_]*-\d+$/i.test(String(v ?? '').trim());

/**
 * Separadores de los campos con varios valores cuando vienen en una sola celda (Jira Server / Data Center los junta
 * con comas en el Excel; Jira Cloud pone una columna por valor). Las etiquetas de Jira no llevan espacios.
 */
const SEPARADOR: Record<string, RegExp> = { sprint: /,\s+/, componentes: /,\s+/, etiquetas: /[,;\s]+/ };
export function partirValores(campo: string, v: string, unaCelda = true): string[] {
  const t = v.trim();
  // Export "Data pipeline" de Jira Data Center: los valores múltiples van como una lista JSON en la celda
  if (t.startsWith('[') && t.endsWith(']')) {
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return j.filter((x) => x != null).map((x) => String(typeof x === 'object' ? (x.name ?? x.value ?? '') : x).trim()).filter(Boolean);
    } catch { /* no es JSON ("[Q3] Sprint 1"): se trata como texto */ }
  }
  // En un CSV cada valor va en su columna: una coma es parte del nombre ("Sprint 12 (Oct 1, 2026)")
  const sep = unaCelda ? SEPARADOR[campo] : undefined;
  return (sep ? t.split(sep) : [t]).map((x) => x.trim()).filter(Boolean);
}

/** Clave de tarea en una lista de enlaces ("A-2, A-3", "[C-4]"). */
export const clavesEnTexto = (v: string): string[] => String(v || '').split(/[\s,;\[\]()]+/).filter(esClaveJira).map((x) => x.toUpperCase());

/** Columna con datos que no se usa y podría servir para un campo: se avisa para que alguien decida. */
export interface ColumnaSugerida { columna: string; campo: string }

/** Pistas por el título: a qué campo podría ir una columna que no se ha reconocido. */
const PISTAS: [RegExp, string][] = [
  [/time in status|tiempo en estado|status history|historial de estados|transition/, 'tis'],
  [/status category chang|cambio de categoria|last status change|ultimo cambio de estado/, 'cambioCategoria'],
  [/first response|primera respuesta/, 'primera'],
  [/\b(start|started|begin|inicio|comienzo|in progress|en curso|commit\w*)\b/, 'empezada'],
  [/\b(resolved|resolution date|done date|closed|completed|fecha de fin|terminad\w*|cerrad\w*)\b/, 'resuelta'],
  [/epic|epica|\bparent\b|\bpadre\b|\bprincipal\b/, 'padreClave'],
  [/\b(sprint|sprints|iteration|iteracion)\b/, 'sprint'],
  [/story ?points?|\bestimat\w*|\bestimacion\b|\bpuntos\b|\beffort\b|\besfuerzo\b/, 'puntos'],
  [/\b(team|teams|equipo|equipos|squad|squads)\b/, 'equipo'],
  [/\b(issue type|work type|tipo)\b/, 'tipo'],
  [/\b(status|estado)\b/, 'estado'],
];
/** Fechas que no son del flujo de trabajo: no se sugieren. */
const FECHA_IGNORADA = /last viewed|ultima vista|ultima visualizacion|\bbirth|nacimiento/;

/**
 * Columnas con datos que no se usan y, por su título o por lo que traen, podrían servir para un campo que la lectura
 * no tiene (o tiene vacío). Nunca columnas de personas o de texto libre. Las fechas sin pista clara se sugieren
 * como "fecha" sin campo: alguien tiene que decir si alguna es, por ejemplo, la fecha real de inicio.
 */
/** Fechas planificadas: no son el inicio real del trabajo, así que no se proponen como fecha de inicio. */
const PLANIFICADA = /target|planned|planificad|baseline|objetivo|\bdue\b|vencimiento|sprint start|inicio del sprint|forecast|previst|bigpicture|roadmap|plan\b/;
/** Tiempos en segundos de Jira (estimación original, restante, imputado): no son puntos de historia. */
const NO_ES_ESTIMACION = /original estimate|remaining estimate|time spent|tiempo invertido|estimacion original|estimacion restante|work ratio|progress|σ|\bsum\b/;

export function sugerirColumnas(cab: string[], filas: string[][], mapa: MapaColumnas, esPrivada: (h: string) => boolean, esFecha: (v: string) => boolean, excluir: Set<string> = new Set()): ColumnaSugerida[] {
  const usadas = new Set<number>(); Object.values(mapa).forEach((v) => ([] as number[]).concat(v).forEach((i) => usadas.add(i)));
  const conValor = (i: number) => filas.slice(1).some((f) => String(f[i] ?? '').trim() && !valorVacio(f[i]));
  const campoVacio = (campo: string) => mapa[campo] == null || !([] as number[]).concat(mapa[campo]).some(conValor);
  const out: ColumnaSugerida[] = [];
  cab.forEach((h, i) => {
    const titulo = String(h).trim();
    // Una columna repetida con el mismo título que una que ya se usa (dos "Due Date") no es un campo nuevo
    if (!titulo || usadas.has(i) || [...usadas].some((u) => String(cab[u]).trim() === titulo) || esPrivada(titulo) || !conValor(i)) return;
    const x = interior(titulo);
    const muestra = filas.slice(1).map((f) => String(f[i] ?? '').trim()).filter((v) => v && !valorVacio(v)).slice(0, 200);
    const fechas = muestra.filter(esFecha).length / muestra.length >= 0.8;
    const numeros = muestra.filter((v) => /^-?\d+([.,]\d+)?$/.test(v)).length / muestra.length >= 0.8;
    const claves = muestra.filter(esClaveJira).length / muestra.length >= 0.6;
    for (const [re, campo] of PISTAS) {
      if (!re.test(x)) continue;
      // Campo que alguien ha dicho que no se use: no se vuelve a proponer
      if (excluir.has(campo) || (campo === 'padreClave' && excluir.has('epicLink'))) return;
      if (campo === 'tis' && !muestra.some((v) => v.includes('_*:*_'))) continue;
      if (campo === 'empezada' && PLANIFICADA.test(x)) break;
      if (campo === 'puntos' && NO_ES_ESTIMACION.test(x)) break;
      // Que lo que trae encaje con el campo: fechas para las fechas, números para la estimación, claves para la épica
      if (['empezada', 'resuelta', 'cambioCategoria', 'primera'].includes(campo) && !fechas) continue;
      if (campo === 'puntos' && !numeros) continue;
      if (campo === 'padreClave' && claves) { if (mapa.padreClave == null) out.push({ columna: titulo, campo }); return; }
      if (campo === 'padreClave' && !claves) { if (!fechas && !numeros && campoVacio('padreClave') && campoVacio('epicLink')) out.push({ columna: titulo, campo: 'epicLink' }); return; }
      if (campo === 'equipo' && (numeros || fechas)) continue;
      if (campo !== 'empezada' && !campoVacio(campo)) return;
      if (campo === 'empezada' && mapa.empezada != null) return;
      out.push({ columna: titulo, campo });
      return;
    }
    if (fechas && !FECHA_IGNORADA.test(x)) out.push({ columna: titulo, campo: 'fecha' });
  });
  return out;
}

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
  vence: 'Due date: for the epics view', epicLink: 'Epic it belongs to (key or name)', epicNombre: 'Name of the epic: to find it from its tasks',
  enlacesLista: 'Linked tasks: counted', empezada: 'Date the work started: chosen by hand', idTarea: 'Internal id: to find the epic when Epic Link brings it',
};
const QUE_ES_ES: Record<string, string> = {
  clave: 'Clave de la tarea', resumen: 'Título: solo en memoria, no sale en el paquete', descripcion: 'Descripción: solo para ver si el ticket está bien definido',
  tipo: 'Tipo: historia, tarea, bug u otro', estado: 'Estado: se traduce a uno de los nueve comunes', categoria: 'Categoría del estado: ayuda si el nombre no basta',
  cambioCategoria: 'Fecha del último cambio de estado', creada: 'Fecha de creación', actualizada: 'Fecha de la última actualización', resuelta: 'Fecha de terminado',
  resolucion: 'Resolución: separa lo descartado de lo terminado', prioridad: 'Prioridad', componentes: 'Componente', etiquetas: 'Etiquetas',
  sprint: 'Sprints por los que pasó: se juntan en una lista', puntos: 'Estimación', equipo: 'Campo de equipo', tis: 'Tiempo en cada estado',
  primera: 'Fecha de la primera respuesta', padre: 'Épica a la que pertenece (título)', padreClave: 'Épica a la que pertenece (clave)', proyecto: 'Proyecto',
  vence: 'Fecha de vencimiento: para la vista de épicas', epicLink: 'Épica a la que pertenece (clave o nombre)', epicNombre: 'Nombre de la épica: para encontrarla desde sus tareas',
  enlacesLista: 'Tareas enlazadas: se cuentan', empezada: 'Fecha en que empezó el trabajo: elegida a mano', idTarea: 'Id interno: para encontrar la épica cuando Epic Link trae el id',
};
const queEs = (campo: string) => (idioma() === 'es' ? QUE_ES_ES[campo] : QUE_ES[campo]);
/** Describe columna a columna cómo se lee un export de Jira: qué es, si se usa, se descarta o se ignora. */
export function describirColumnas(texto: string, columnas?: Record<string, string>): ColumnaLeida[] {
  // Con las columnas que ha usado la lectura (elegidas a mano o la de equipo que se eligió por sus datos)
  return describir(texto, (cab) => aplicarColumnas(mapearColumnas(cab), cab, columnas), queEs);
}

/** Ejemplos de los valores de cada columna de un export de Jira (para la revisión de columnas). */
export const ejemplosColumnasJira = (texto: string) => ejemplosDeColumnas(texto, mapearColumnas);
