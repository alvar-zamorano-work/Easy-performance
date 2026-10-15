// Detección automática: fecha de referencia, unidad del Tiempo en estado, nombres de estado,
// etapa propuesta de cada estado, campo que identifica a los equipos y si los sprints son fiables.

import { DIA, cuantil, inicioSemana, media, norm } from './util.ts';
import { fechaCorta } from './formato.ts';
import { esBloqueo, etapaPropuesta } from './estados.ts';
import type { Deteccion, EstadoDetectado, Etapa, InformeIngesta, Tarea } from './tipos.ts';

export interface OpcionEquipo { id: string; nombre: string; valor: (t: Tarea) => string }

export const OPCIONES_EQUIPO: OpcionEquipo[] = [
  { id: 'equipo', nombre: 'Campo Equipo', valor: (t) => t.equipoCampo },
  { id: 'componentes', nombre: 'Componente', valor: (t) => t.componentes[0] || '' },
  { id: 'proyecto', nombre: 'Proyecto', valor: (t) => t.proyecto },
  { id: 'etiquetas', nombre: 'Etiqueta', valor: (t) => t.etiquetas[0] || '' },
  { id: 'todos', nombre: 'En ninguno: todo es un solo equipo', valor: () => 'Todo el trabajo' },
];

export function valorEquipo(campo: string): (t: Tarea) => string {
  const o = OPCIONES_EQUIPO.filter((x) => x.id === campo)[0] || OPCIONES_EQUIPO[OPCIONES_EQUIPO.length - 1];
  return o.valor;
}

const PESO_OPCION: Record<string, number> = { equipo: 0.3, componentes: 0.1, proyecto: 0.05, etiquetas: 0 };
const ORDEN_ETAPA: Record<Etapa, number> = { pendiente: 0, curso: 1, espera: 2, hecho: 3 };
/** Estados de sistema de Jira por id, para los ids que el export no nombra. */
const CONOCIDOS: Record<string, string> = { '1': 'Open', '3': 'In Progress', '4': 'Reopened', '5': 'Resolved', '6': 'Closed' };

export function detectar(tareas: Tarea[], _informe?: InformeIngesta): Deteccion {
  const det = { avisos: [] } as unknown as Deteccion;
  // Fecha de referencia: la última actividad real (creación, cierre o cambio de estado).
  // "Actualizada" no sirve: cambia con ediciones masivas que no son trabajo.
  let ref = 0, min = Infinity;
  const actividad: number[] = [];
  tareas.forEach((t) => {
    [t.resuelta, t.creada, t.cambioCategoria].forEach((d) => {
      if (d) { actividad.push(d.getTime()); if (d.getTime() > ref) ref = d.getTime(); }
    });
    if (t.creada && t.creada.getTime() < min) min = t.creada.getTime();
  });
  det.fechaMin = new Date(isFinite(min) ? min : Date.now());
  det.fechaMax = new Date(ref || Date.now());
  det.fechaRef = det.fechaMax;
  // Si la actividad casi se detiene al final del export, las medidas llegan hasta la última semana con actividad.
  if (actividad.length) {
    const s0 = inicioSemana(det.fechaMin).getTime(), porSemana: Record<number, number> = {};
    actividad.forEach((x) => { const k = Math.floor((x - s0) / (7 * DIA)); porSemana[k] = (porSemana[k] || 0) + 1; });
    const ks = Object.keys(porSemana).map(Number).sort((a, b) => a - b);
    const med = cuantil(ks.map((k) => porSemana[k]), 0.5)!;
    const ultimaActiva = ks.filter((k) => porSemana[k] >= 0.25 * med).pop();
    const ultima = ks[ks.length - 1];
    if (ultimaActiva != null && ultima - ultimaActiva >= 2) {
      det.fechaRef = new Date(s0 + (ultimaActiva + 1) * 7 * DIA + 9 * 36e5);
      det.avisos.push({ tipo: 'aviso', texto: 'Las últimas semanas del export casi no tienen actividad. Las medidas llegan hasta la semana del ' + fechaCorta(new Date(s0 + ultimaActiva * 7 * DIA)) + '.' });
    }
  }

  // Unidad del campo Tiempo en estado (milisegundos, segundos o minutos), calibrada con las fechas.
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
  det.factorTis = factor;
  det.hayTis = tareas.some((t) => t.tis.length);

  // Nombres de estado por id: el estado actual suele aparecer con tiempo cero.
  const votos: Record<string, Record<string, number>> = {};
  tareas.forEach((t) => {
    const ceros = t.tis.filter((x) => x.v === 0 && x.n >= 1);
    if (ceros.length === 1 && t.estado) {
      const id = ceros[0].id;
      votos[id] = votos[id] || {};
      votos[id][t.estado] = (votos[id][t.estado] || 0) + 1;
    }
  });
  det.nombrePorId = {};
  Object.keys(votos).forEach((id) => {
    let mejor: string | null = null, max = 0;
    Object.keys(votos[id]).forEach((nom) => { if (votos[id][nom] > max) { max = votos[id][nom]; mejor = nom; } });
    det.nombrePorId[id] = mejor as unknown as string;
  });

  // Ids sin nombre: primero los estados de sistema de Jira, después por descarte.
  const ids: Record<string, 1> = {}, actuales: Record<string, string> = {};
  tareas.forEach((t) => {
    t.tis.forEach((x) => { ids[x.id] = 1; });
    if (t.estado) actuales[t.estado] = t.categoria || '';
  });
  const usados = () => { const u: Record<string, 1> = {}; Object.keys(det.nombrePorId).forEach((k) => { u[det.nombrePorId[k]] = 1; }); return u; };
  Object.keys(ids).forEach((id) => {
    if (det.nombrePorId[id] || !CONOCIDOS[id]) return;
    const conocido = CONOCIDOS[id], u = usados();
    const igual = Object.keys(actuales).filter((n) => norm(n) === norm(conocido) && !u[n])[0];
    const misma = Object.keys(actuales).filter((n) => !u[n] && etapaPropuesta(n, actuales[n]) === etapaPropuesta(conocido, ''));
    det.nombrePorId[id] = igual || (misma.length === 1 ? misma[0] : conocido);
  });
  const sinId = Object.keys(ids).filter((id) => !det.nombrePorId[id]);
  const u2 = usados(), libres = Object.keys(actuales).filter((n) => !u2[n]);
  if (sinId.length === 1 && libres.length === 1) det.nombrePorId[sinId[0]] = libres[0];

  // Lista de estados con su etapa propuesta.
  interface Acumulado { nombre: string; actuales: number; categorias: Record<string, number>; horas: number[]; visitas: number }
  const estados: Record<string, Acumulado> = {};
  const estadoInfo = (nombre: string): Acumulado => {
    if (!estados[nombre]) estados[nombre] = { nombre, actuales: 0, categorias: {}, horas: [], visitas: 0 };
    return estados[nombre];
  };
  tareas.forEach((t) => {
    if (t.estado) {
      const e = estadoInfo(t.estado);
      e.actuales++;
      if (t.categoria) e.categorias[t.categoria] = (e.categorias[t.categoria] || 0) + 1;
    }
    t.tis.forEach((x) => {
      const e = estadoInfo(det.nombrePorId[x.id] || ('Estado ' + x.id));
      e.visitas++;
      if (x.v > 0) e.horas.push(x.v * factor / 36e5);
    });
  });
  det.estados = Object.keys(estados).map((k): EstadoDetectado => {
    const e = estados[k];
    let cat = '', max = 0;
    Object.keys(e.categorias).forEach((c) => { if (e.categorias[c] > max) { max = e.categorias[c]; cat = c; } });
    return { nombre: e.nombre, actuales: e.actuales, visitas: e.visitas, categoria: cat,
      horasMedias: media(e.horas), etapa: etapaPropuesta(e.nombre, cat), bloqueo: esBloqueo(e.nombre) };
  }).sort((a, b) => ORDEN_ETAPA[a.etapa] - ORDEN_ETAPA[b.etapa] || b.visitas - a.visitas);
  const sinNombre = det.estados.filter((e) => /^Estado \d+$/.test(e.nombre));
  if (sinNombre.length) det.avisos.push({ tipo: 'aviso', texto: sinNombre.length + ' estado(s) del campo Tiempo en estado no tienen nombre en el export. Revisa a qué etapa pertenecen.' });

  // Candidatos para reconocer equipos.
  det.opcionesEquipo = OPCIONES_EQUIPO.map((o) => {
    const cuenta: Record<string, number> = {};
    let conValor = 0;
    tareas.forEach((t) => { const v = o.valor(t); if (v) { conValor++; cuenta[v] = (cuenta[v] || 0) + 1; } });
    const valores = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
    const cobertura = tareas.length ? conValor / tareas.length : 0;
    const valida = o.id === 'todos' || (valores.length >= 2 && valores.length <= 25 && cobertura >= 0.6);
    const puntuacion = o.id === 'todos' ? 0.1 : (valida ? cobertura + PESO_OPCION[o.id] - (valores.length > 12 ? 0.3 : 0) : -1);
    return { id: o.id, nombre: o.nombre, valores: valores.map((v) => ({ valor: v, n: cuenta[v] })), cobertura, valida, puntuacion };
  });
  const mejorOpcion = det.opcionesEquipo.slice().sort((a, b) => b.puntuacion - a.puntuacion)[0];
  det.equipoRecomendado = mejorOpcion.id;

  // Sprints: ¿parecen sprints de verdad?
  const nombresSprint: Record<string, 1> = {};
  tareas.forEach((t) => { t.sprints.forEach((s) => { nombresSprint[s] = 1; }); });
  const lista = Object.keys(nombresSprint);
  const conFecha = lista.filter((s) => /^\d{4}-\d{2}-\d{2}T?\d{0,2}/.test(s)).length;
  det.haySprints = lista.length > 0;
  det.sprintsComoFecha = lista.length > 0 && conFecha / lista.length > 0.5;
  if (det.sprintsComoFecha) det.avisos.push({ tipo: 'aviso', texto: 'Los nombres de sprint parecen fechas y horas (' + lista.length.toLocaleString('es-ES') + ' distintos). No se usan como sprints: las medidas van por semanas.' });
  return det;
}
