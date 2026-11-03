// Cómo se ha leído cada columna de un export, para cualquier plataforma: qué es, si se usa, se descarta o se ignora.
// Las columnas de personas y de texto libre con nombres se descartan siempre; ante la duda, también.

import { Tx } from '../../nucleo/idioma.ts';
import { interior, norm } from '../../nucleo/util.ts';
import { leerCSV } from './csv.ts';
import { buscarCabecera } from './cabecera.ts';

export type MapaColumnas = Record<string, number | number[]>;

/** Mapa de columnas a partir de los alias de una plataforma: el primer alias que aparece manda. */
export function mapearConAlias(cab: string[], alias: Record<string, string[]>, multiples: Record<string, 1> = {}): MapaColumnas {
  const mapa: MapaColumnas = {};
  const nombres = cab.map((h) => ({ n: norm(h), i: interior(h) }));
  Object.keys(alias).forEach((campo) => {
    const lista = alias[campo], encontrados: number[] = [];
    for (let a = 0; a < lista.length && !encontrados.length; a++) {
      nombres.forEach((x, idx) => { if (x.n === lista[a] || x.i === lista[a]) encontrados.push(idx); });
    }
    if (encontrados.length) mapa[campo] = multiples[campo] ? encontrados : encontrados[0];
  });
  return mapa;
}

/** Columnas de personas o de texto libre con nombres. Se descartan siempre; ante la duda, también. */
const PERSONAS = ['assignee', 'reporter', 'creator', 'watchers', 'persona asignada', 'responsable', 'informador', 'creador', 'observadores', 'votantes', 'voters', 'project lead', 'responsable del proyecto',
  // Azure DevOps y GitLab
  'assigned to', 'asignado a', 'author', 'autor', 'author username', 'assignee username', 'reviewer', 'reviewers', 'revisor'];
const TEXTO_CON_NOMBRES = ['comment', 'comments', 'comentario', 'comentarios', 'log work', 'registro de trabajo', 'attachment', 'archivo adjunto', 'adjuntos'];
// Personas por su papel ("Team Lead", "Scrum Master", "Product Owner", "Approvers"...), sin confundir "Lead time"
const PARECE_PERSONA = /\b(user|usuario|username|email|correo|account id|id de cuenta)\b|\b(by|por)$|\b(team|tech|project|product|delivery|qa|dev|engineering|test)\s+lead\b|\blead (engineer|developer|dev)\b|^lead$|\b(leader|manager|owner|lider|jefe|scrum master|developers?|testers?|approvers?|participants?|requester|requestor|solicitante|aprobador(es)?|desarrollador(es)?|revisor(es)?)\b/;

/** Columna de personas o de texto libre con nombres: nunca se lee ni se enseña un ejemplo. */
export function esColumnaPrivada(h: string): boolean {
  const n = norm(h), x = interior(h);
  const empieza = (p: string) => n === p || x === p || n.startsWith(p + ' ') || x.startsWith(p + ' ');
  return PERSONAS.some(empieza) || PARECE_PERSONA.test(n) || PARECE_PERSONA.test(x) || TEXTO_CON_NOMBRES.some(empieza);
}

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

/** Hasta `max` valores distintos de cada columna, para enseñarlos al elegir columnas. Nunca de personas ni de texto libre. */
export function ejemplosDeColumnas(texto: string, mapearColumnas: (cab: string[]) => MapaColumnas, max = 3): Record<string, string[]> {
  const leidas = leerCSV(texto.slice(0, 300000));
  if (!leidas.length) return {};
  const c = buscarCabecera(leidas, mapearColumnas);
  const filas = leidas.slice(c.indice >= 0 ? c.indice : c.probable), cab = filas[0], out: Record<string, string[]> = {};
  cab.forEach((h, i) => {
    const nombre = String(h).trim();
    if (!nombre || out[nombre] || esColumnaPrivada(nombre) || /^(description|descripcion|summary|resumen)$/.test(norm(nombre))) return;
    const vals: string[] = [];
    let largos = 0, vistos = 0;
    for (let r = 1; r < filas.length && r < 400; r++) {
      const v0 = String(filas[r][i] ?? '').trim();
      if (!v0) continue;
      vistos++; if (v0.length > 60 || /\n/.test(v0)) largos++;
      const v = v0.replace(/\s+/g, ' ');
      if (vals.length < max && vals.indexOf(v) < 0) vals.push(v.length > 40 ? v.slice(0, 39) + '…' : v);
    }
    // Texto libre (criterios, entorno, notas): puede llevar nombres; no se enseña
    out[nombre] = vistos && largos / vistos > 0.2 ? [] : vals;
  });
  return out;
}

/** Describe columna a columna cómo se lee un export, con el mapa de columnas y los textos de su plataforma. */
export function describir(texto: string, mapearColumnas: (cab: string[]) => MapaColumnas, queEs: (campo: string) => string): ColumnaLeida[] {
  // Basta con la cabecera y unas filas para los ejemplos
  const leidas = leerCSV(texto.slice(0, 200000));
  if (!leidas.length) return [];
  // La fila de títulos puede no ser la primera ("Displaying 2784 issues at ..." encima): la misma búsqueda que la lectura
  const c = buscarCabecera(leidas, mapearColumnas);
  const filas = leidas.slice(c.indice >= 0 ? c.indice : c.probable);
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
    const persona = PERSONAS.some((p) => n === p || x === p || n.startsWith(p + ' ') || x.startsWith(p + ' ')) || PARECE_PERSONA.test(n) || PARECE_PERSONA.test(x);
    const conNombres = TEXTO_CON_NOMBRES.some((p) => n === p || x === p || n.startsWith(p + ' '));
    const campo = persona || conNombres ? null : campoDe[i] || null;
    let ejemplo: string | null = null;
    if (campo && !SIN_EJEMPLO[campo]) {
      const fila = muestra.find((f) => f[i] && String(f[i]).trim());
      if (fila) { const v = String(fila[i]).trim().replace(/\s+/g, ' '); ejemplo = v.length > 32 ? v.slice(0, 31) + '…' : v; }
    }
    const c: ColumnaLeida = {
      columna: nombre, veces: 1, campo, ejemplo,
      que: persona ? Tx('Person', 'Persona') : conNombres ? Tx('Text that may contain names', 'Texto que puede llevar nombres') : campo ? queEs(campo) : Tx('Not recognised', 'Sin reconocer'),
      accion: persona || conNombres ? 'descarta' : campo ? 'usa' : 'ignora',
    };
    vistas[nombre] = c;
    out.push(c);
  });
  return out;
}
