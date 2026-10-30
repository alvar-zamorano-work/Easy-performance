// Vista de épicas: avance real por sus hijas, ritmo propio y previsión de cierre por probabilidad.
// Una épica no se mide por su estado ni por una fecha que alguien escribe, sino por lo que han terminado sus hijas.
// La previsión usa el ritmo de la propia épica (sus hijas terminadas por semana), no el del equipo entero:
// un equipo trabaja en varias épicas a la vez y su ritmo total daría fechas demasiado optimistas.

import { etapaDe, proponerEstado } from './estados.ts';
import { sumarDias, DIA } from './util.ts';
import { cuandoTerminan, muestraDeRitmo } from './prevision.ts';
import type { Preparacion } from './calcular.ts';
import type { Derivada } from './tipos.ts';
import type { Epica } from './modelo.ts';

export const SEMANAS_RITMO_EPICA = 8;

export type SituacionEpica = 'terminada' | 'vencida' | 'parada' | 'en_riesgo' | 'en_plazo' | 'sin_fecha';
const ORDEN: SituacionEpica[] = ['vencida', 'parada', 'en_riesgo', 'en_plazo', 'sin_fecha', 'terminada'];

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
  /** Fecha en la que se termina con un 85 % de probabilidad, al ritmo de la propia épica. */
  prevision85: Date | null;
  prevision50: Date | null;
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
    const ritmo = semanas.reduce((s, x) => s + x, 0) / SEMANAS_RITMO_EPICA;
    const etapaEpica = m && m.estado ? etapaDe(proponerEstado(m.estado, m.categoria)) : null;
    const cerrada = etapaEpica === 'hecho' || !!(m && m.terminada);
    let prevision85: Date | null = null, prevision50: Date | null = null;
    const muestra = muestraDeRitmo(semanas, SEMANAS_RITMO_EPICA);
    if (abiertas > 0 && muestra) {
      const c = cuandoTerminan(muestra, abiertas, clave.length * 7919 + abiertas);
      if (c.p85 != null) prevision85 = sumarDias(fin, 7 * c.p85);
      if (c.p50 != null) prevision50 = sumarDias(fin, 7 * c.p50);
    }
    const vence = m ? m.vence : null;
    let situacion: SituacionEpica;
    if (abiertas === 0) situacion = 'terminada';
    else if (vence && vence < hoy) situacion = 'vencida';
    else if (!muestra) situacion = 'parada';
    else if (vence) situacion = prevision85 && prevision85 <= vence ? 'en_plazo' : 'en_riesgo';
    else situacion = 'sin_fecha';
    out.push({
      clave, titulo: (m && m.titulo) || hijas[0].t.padre_titulo || clave, estado: m ? m.estado : '', equipo,
      hijas: hijas.length, terminadas, abiertas, enCurso, avance: terminadas / hijas.length, ritmo, vence, prevision85, prevision50, situacion,
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
