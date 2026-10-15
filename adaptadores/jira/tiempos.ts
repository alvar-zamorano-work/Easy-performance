// Campo "Tiempo en estado" de Jira: viene por id de estado y en una unidad que no se declara.
// Aquí se deduce el nombre de cada id y la unidad (milisegundos, segundos o minutos), con las fechas como referencia.

import { cuantil, norm } from '../../nucleo/util.ts';
import { etapaDe, proponerEstado } from '../../nucleo/estados.ts';
import type { Aviso } from '../../nucleo/modelo.ts';

export interface TiempoJira { id: string; n: number; v: number }
export interface TareaJiraParaTiempos {
  estado: string;
  categoria: string;
  creada: Date;
  resuelta: Date | null;
  tis: TiempoJira[];
}

/** Estados de sistema de Jira por id, para los ids que el export no nombra. */
const CONOCIDOS: Record<string, string> = { '1': 'Open', '3': 'In Progress', '4': 'Reopened', '5': 'Resolved', '6': 'Closed' };

const etapaPropuesta = (nombre: string, categoria: string) => etapaDe(proponerEstado(nombre, categoria));

export function unidadTiempo(tareas: TareaJiraParaTiempos[]): number {
  const ratios: number[] = [];
  tareas.forEach((t) => {
    if (!t.resuelta || !t.tis.length) return;
    const lead = t.resuelta.getTime() - t.creada.getTime();
    if (lead < 3600e3) return;
    let s = 0;
    t.tis.forEach((x) => { s += x.v; });
    if (s > 0) ratios.push(s / lead);
  });
  const r = cuantil(ratios, 0.5);
  let factor = 1;
  if (r != null) {
    let mejor = Infinity;
    [1, 1000, 60000].forEach((f) => { const e = Math.abs(Math.log(r * f)); if (e < mejor) { mejor = e; factor = f; } });
  }
  return factor;
}

export function nombresDeEstado(tareas: TareaJiraParaTiempos[]): { nombrePorId: Record<string, string>; avisos: Aviso[] } {
  // El estado actual suele aparecer con tiempo cero.
  const votos: Record<string, Record<string, number>> = {};
  tareas.forEach((t) => {
    const ceros = t.tis.filter((x) => x.v === 0 && x.n >= 1);
    if (ceros.length === 1 && t.estado) {
      const id = ceros[0].id;
      votos[id] = votos[id] || {};
      votos[id][t.estado] = (votos[id][t.estado] || 0) + 1;
    }
  });
  const nombrePorId: Record<string, string> = {};
  Object.keys(votos).forEach((id) => {
    let mejor = '', max = 0;
    Object.keys(votos[id]).forEach((nom) => { if (votos[id][nom] > max) { max = votos[id][nom]; mejor = nom; } });
    nombrePorId[id] = mejor;
  });

  // Ids sin nombre: primero los estados de sistema de Jira, después por descarte.
  const ids: Record<string, 1> = {}, actuales: Record<string, string> = {};
  tareas.forEach((t) => {
    t.tis.forEach((x) => { ids[x.id] = 1; });
    if (t.estado) actuales[t.estado] = t.categoria || '';
  });
  const usados = () => { const u: Record<string, 1> = {}; Object.keys(nombrePorId).forEach((k) => { u[nombrePorId[k]] = 1; }); return u; };
  Object.keys(ids).forEach((id) => {
    if (nombrePorId[id] || !CONOCIDOS[id]) return;
    const conocido = CONOCIDOS[id], u = usados();
    const igual = Object.keys(actuales).filter((n) => norm(n) === norm(conocido) && !u[n])[0];
    const misma = Object.keys(actuales).filter((n) => !u[n] && etapaPropuesta(n, actuales[n]) === etapaPropuesta(conocido, ''));
    nombrePorId[id] = igual || (misma.length === 1 ? misma[0] : conocido);
  });
  const sinId = Object.keys(ids).filter((id) => !nombrePorId[id]);
  const u2 = usados(), libres = Object.keys(actuales).filter((n) => !u2[n]);
  if (sinId.length === 1 && libres.length === 1) nombrePorId[sinId[0]] = libres[0];

  const avisos: Aviso[] = [];
  const sinNombre = Object.keys(ids).filter((id) => !nombrePorId[id]).length;
  if (sinNombre) avisos.push({ tipo: 'aviso', texto: sinNombre + ' estado(s) del campo Tiempo en estado no tienen nombre en el export. Revisa a qué etapa pertenecen.' });
  return { nombrePorId, avisos };
}

export function nombreDeId(nombrePorId: Record<string, string>, id: string): string {
  return nombrePorId[id] || ('Estado ' + id);
}
