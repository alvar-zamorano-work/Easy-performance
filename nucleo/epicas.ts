// Vista de épicas: avance real por sus hijas, ritmo propio y previsión de cierre por probabilidad.
// Una épica no se mide por su estado ni por una fecha que alguien escribe, sino por lo que han terminado sus hijas.
// La previsión usa el ritmo de la propia épica (sus hijas terminadas por semana), no el del equipo entero:
// un equipo trabaja en varias épicas a la vez y su ritmo total daría fechas demasiado optimistas.

import { etapaDe, proponerEstado } from './estados.ts';
import { sumarDias, DIA } from './util.ts';
import { cuandoTerminan, SEMILLA_CUANDO } from './prevision.ts';
import type { Preparacion } from './calcular.ts';
import type { Derivada } from './tipos.ts';
import type { Epica } from './modelo.ts';

export const SEMANAS_RITMO_EPICA = 8;

/**
 * parada: nada terminado en 8 semanas, nada en curso y tareas de hace más de 8 semanas.
 * sin_ritmo: aún no hay ritmo para prever (empezó hace poco o tiene trabajo en curso sin terminar nada).
 */
export type SituacionEpica = 'terminada' | 'vencida' | 'parada' | 'en_riesgo' | 'en_plazo' | 'sin_fecha' | 'sin_ritmo';
const ORDEN: SituacionEpica[] = ['vencida', 'parada', 'en_riesgo', 'en_plazo', 'sin_ritmo', 'sin_fecha', 'terminada'];
/** Para prever una épica: al menos 3 semanas desde su primera tarea y 2 tareas terminadas en ellas. */
const MINIMO_SEMANAS_EPICA = 3, MINIMO_TERMINADAS_EPICA = 2;

export interface ResumenEpica {
  clave: string;
  /** Solo en memoria. */
  titulo: string;
  estado: string;
  equipo: string;
  hijas: number;
  terminadas: number;
  abiertas: number;
  enCurso: number;
  avance: number;
  /** Hijas terminadas por semana en las últimas 8 semanas. */
  ritmo: number;
  vence: Date | null;
  /** Fecha en la que se termina con un 85 % de probabilidad, al ritmo de la propia épica (desde la fecha de los datos). */
  prevision85: Date | null;
  prevision50: Date | null;
  /** Hay ritmo, pero al ritmo actual pasa de dos años. */
  previsionLejana: boolean;
  situacion: SituacionEpica;
  /** El estado de la épica dice terminada pero tiene hijas abiertas, o al revés. */
  estadoDescuadrado: boolean;
}

export interface VistaEpicas {
  epicas: ResumenEpica[];
  /** Tareas medidas que no cuelgan de ninguna épica. */
  sinEpica: number;
  tareas: number;
  /** Si el export trae la fecha de vencimiento de las épicas. */
  hayVencimientos: boolean;
  semanasRitmo: number;
}

export function vistaEpicas(p: Preparacion, epicas: Epica[] = []): VistaEpicas {
  const meta = new Map(epicas.map((e) => [e.clave, e]));
  const todas: Derivada[] = ([] as Derivada[]).concat(...p.nombresEquipo.map((n) => p.porEquipo[n] || []));
  const porEpica = new Map<string, Derivada[]>();
  let sinEpica = 0;
  todas.forEach((d) => {
    if (!d.t.padre_id) { sinEpica++; return; }
    const lista = porEpica.get(d.t.padre_id) || [];
    lista.push(d);
    porEpica.set(d.t.padre_id, lista);
  });
  const fin = p.ctx.semanaFin, desde = sumarDias(fin, -7 * SEMANAS_RITMO_EPICA), hoy = p.ctx.fechaRef;
  // Las fechas se comparan por día: un vencimiento es el día entero, sin hora
  const diaDe = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const out: ResumenEpica[] = [];
  porEpica.forEach((hijasTodas, clave) => {
    const hijas = hijasTodas.filter((d) => !d.descartada);
    if (!hijas.length) return;
    const m = meta.get(clave);
    if (m && m.descartada) return;
    const terminadas = hijas.filter((d) => d.entregada).length;
    const abiertas = hijas.length - terminadas;
    const enCurso = hijas.filter((d) => !d.entregada && (d.etapa === 'curso' || d.etapa === 'espera')).length;
    // Equipo principal: el que tiene más hijas
    const cuenta: Record<string, number> = {};
    hijas.forEach((d) => { cuenta[d.equipo] = (cuenta[d.equipo] || 0) + 1; });
    const equipo = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || a.localeCompare(b))[0];
    // Ritmo propio: hijas terminadas cada semana de las últimas 8
    const semanas = new Array(SEMANAS_RITMO_EPICA).fill(0);
    hijas.forEach((d) => {
      const f = d.t.fechas.terminada;
      if (!d.entregada || !f || f < desde || f >= fin) return;
      semanas[Math.min(SEMANAS_RITMO_EPICA - 1, Math.floor((f.getTime() - desde.getTime()) / (7 * DIA)))]++;
    });
    const enVentana = semanas.reduce((s, x) => s + x, 0);
    // La muestra empieza en la semana de la primera tarea de la épica: una épica nueva no tiene semanas a cero antes
    const primeraCreada = Math.min(...hijas.map((d) => d.t.fechas.creada.getTime()));
    const desdeEpica = Math.max(0, Math.floor((primeraCreada - desde.getTime()) / (7 * DIA)));
    const muestra = semanas.slice(Math.min(desdeEpica, SEMANAS_RITMO_EPICA));
    const ritmo = muestra.length ? enVentana / muestra.length : 0;
    const hayRitmo = muestra.length >= MINIMO_SEMANAS_EPICA && enVentana >= MINIMO_TERMINADAS_EPICA;
    const etapaEpica = m && m.estado ? etapaDe(proponerEstado(m.estado, m.categoria)) : null;
    const cerrada = etapaEpica === 'hecho' || !!(m && m.terminada);
    let prevision85: Date | null = null, prevision50: Date | null = null, previsionLejana = false;
    if (abiertas > 0 && hayRitmo) {
      const c = cuandoTerminan(muestra, abiertas, SEMILLA_CUANDO);
      if (c.p85 != null) prevision85 = sumarDias(hoy, 7 * c.p85); else previsionLejana = true;
      if (c.p50 != null) prevision50 = sumarDias(hoy, 7 * c.p50);
    }
    const vence = m ? m.vence : null;
    const antigua = primeraCreada < desde.getTime();
    let situacion: SituacionEpica;
    if (abiertas === 0) situacion = 'terminada';
    else if (vence && diaDe(vence) < diaDe(hoy)) situacion = 'vencida';
    else if (!enVentana && !enCurso && antigua) situacion = 'parada';
    else if (!hayRitmo) situacion = 'sin_ritmo';
    else if (vence) situacion = prevision85 && diaDe(prevision85) <= diaDe(vence) ? 'en_plazo' : 'en_riesgo';
    else situacion = 'sin_fecha';
    out.push({
      clave, titulo: (m && m.titulo) || hijas[0].t.padre_titulo || clave, estado: m ? m.estado : '', equipo,
      hijas: hijas.length, terminadas, abiertas, enCurso, avance: terminadas / hijas.length, ritmo, vence, prevision85, prevision50, previsionLejana, situacion,
      estadoDescuadrado: !!m && ((cerrada && abiertas > 0) || (!cerrada && abiertas === 0 && etapaEpica !== null)),
    });
  });
  out.sort((a, b) => ORDEN.indexOf(a.situacion) - ORDEN.indexOf(b.situacion) || b.abiertas - a.abiertas || a.clave.localeCompare(b.clave));
  return { epicas: out, sinEpica, tareas: todas.length, hayVencimientos: epicas.some((e) => e.vence), semanasRitmo: SEMANAS_RITMO_EPICA };
}

/** Reparto de lo terminado en las últimas semanas según el campo que elige el cliente (agrupadores.reparto). */
export function repartoPorCampo(items: Derivada[], fin: Date, semanas = 8): { valor: string; n: number; parte: number }[] {
  const desde = sumarDias(fin, -7 * semanas), cuenta: Record<string, number> = {};
  let total = 0;
  items.forEach((d) => {
    const f = d.t.fechas.terminada;
    if (!d.entregada || !f || f < desde || f >= fin) return;
    const v = (d.t.agrupadores.reparto || '').trim();
    cuenta[v] = (cuenta[v] || 0) + 1; total++;
  });
  return Object.keys(cuenta).map((valor) => ({ valor, n: cuenta[valor], parte: total ? cuenta[valor] / total : 0 }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor));
}
