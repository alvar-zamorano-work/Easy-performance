// Agent readiness: índice de 0 a 5 por ticket con la rúbrica de catalogo/rubrica_agent_ready.json.
// Se calcula en memoria sobre el texto del export; fuera solo salen agregados, nunca el texto.

import { sinAcentos } from './util.ts';
import rubricaJson from '../catalogo/rubrica_agent_ready.json' with { type: 'json' };
import type { EstadoNormalizado, Tarea } from './modelo.ts';

export type CriterioAR = 'contenido' | 'criterios' | 'acotado' | 'referencias' | 'sinDependencias';
export const CRITERIOS_AR: CriterioAR[] = ['contenido', 'criterios', 'acotado', 'referencias', 'sinDependencias'];

interface Patron { patron: string; flags?: string; sobreOriginal?: boolean }
export interface RubricaAR {
  version: number;
  definicion: string;
  listoDesde: number;
  criterios: {
    contenido: { nombre: string; como: string; minimoPalabras: number };
    criterios: { nombre: string; como: string; patrones: Patron[] };
    acotado: { nombre: string; como: string; maximoEstimacion: number; maximoDias: number };
    referencias: { nombre: string; como: string; patrones: Patron[] };
    sinDependencias: { nombre: string; como: string; patrones: Patron[] };
  };
}
export const RUBRICA: RubricaAR = rubricaJson as RubricaAR;

export interface EvaluacionAR { indice: number; criterios: Record<CriterioAR, boolean> }

const compiladas = new WeakMap<Patron[], { re: RegExp; original: boolean }[]>();
function regex(ps: Patron[]) {
  let c = compiladas.get(ps);
  if (!c) { c = ps.map((p) => ({ re: new RegExp(p.patron, p.flags || ''), original: !!p.sobreOriginal })); compiladas.set(ps, c); }
  return c;
}
/** Minúsculas y sin acentos, conservando los saltos de línea. */
const normal = (s: string) => sinAcentos(s).toLowerCase();
const algunPatron = (ps: Patron[], original: string, normalizado: string) => regex(ps).some((p) => p.re.test(p.original ? original : normalizado));
const palabras = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** ¿La descripción trae criterios de aceptación reconocibles? La usan los adaptadores para tiene_criterios. */
export function tieneCriterios(descripcion: string, r: RubricaAR = RUBRICA): boolean {
  return !!descripcion && algunPatron(r.criterios.criterios.patrones, descripcion, normal(descripcion));
}

/**
 * Índice de agent readiness de una tarea. "estado" es el normalizado según el mapeo del cliente;
 * "ciclo" (días) solo se usa para el alcance cuando la tarea no tiene estimación.
 */
export function evaluarTicket(t: Tarea, estado: EstadoNormalizado, ciclo: number | null | undefined, r: RubricaAR = RUBRICA): EvaluacionAR {
  const texto = t.descripcion || '', n = normal(texto), titulo = normal(t.titulo || '').trim();
  const c = r.criterios;
  const criterios: Record<CriterioAR, boolean> = {
    contenido: palabras(texto) >= c.contenido.minimoPalabras && n.trim() !== titulo,
    criterios: !!texto && algunPatron(c.criterios.patrones, texto, n),
    acotado: t.tipo !== 'epica' && (t.estimacion != null ? t.estimacion <= c.acotado.maximoEstimacion : (ciclo != null ? ciclo <= c.acotado.maximoDias : false)),
    referencias: t.enlaces > 0 || (!!texto && algunPatron(c.referencias.patrones, texto, n)),
    sinDependencias: estado !== 'bloqueado' && !algunPatron(c.sinDependencias.patrones, texto, n),
  };
  return { indice: CRITERIOS_AR.filter((k) => criterios[k]).length, criterios };
}

export interface AgregadoAR {
  tickets: number;
  indiceMedio: number | null;
  /** Parte de los tickets con el índice igual o mayor que listoDesde. */
  listos: number | null;
  /** Parte de los tickets que cumple cada criterio. */
  porCriterio: Record<CriterioAR, number | null>;
}

export function agregar(evals: EvaluacionAR[], r: RubricaAR = RUBRICA): AgregadoAR {
  const n = evals.length;
  const porCriterio = {} as Record<CriterioAR, number | null>;
  CRITERIOS_AR.forEach((k) => { porCriterio[k] = n ? evals.filter((e) => e.criterios[k]).length / n : null; });
  return {
    tickets: n,
    indiceMedio: n ? evals.reduce((s, e) => s + e.indice, 0) / n : null,
    listos: n ? evals.filter((e) => e.indice >= r.listoDesde).length / n : null,
    porCriterio,
  };
}
