// Detección sobre el modelo neutro: fecha de referencia, estados con su etapa, campo que reconoce
// a los equipos y si los sprints son fiables. No sabe de qué plataforma vienen los datos.

import { Tx, regional } from './idioma.ts';
import { DIA, cuantil, inicioSemana, media } from './util.ts';
import { fechaCorta } from './formato.ts';
import { etapaDe, explicarEstado } from './estados.ts';
import type { Deteccion, EstadoDetectado } from './tipos.ts';
import type { CampoAgrupador, Etapa, Lectura, Tarea } from './modelo.ts';

export const TODOS = 'todos';
const NOMBRE_TODOS = 'All work';

/** Valor que identifica al equipo de una tarea según el campo elegido. */
export function valorEquipo(campo: string, campos: CampoAgrupador[]): (t: Tarea) => string {
  if (campo !== TODOS && campos.some((c) => c.id === campo)) return (t) => t.agrupadores[campo] || '';
  return () => NOMBRE_TODOS;
}

const ORDEN_ETAPA: Record<Etapa, number> = { pendiente: 0, curso: 1, espera: 2, hecho: 3 };

export function detectar(lectura: Lectura): Deteccion {
  const tareas = lectura.tareas;
  const det = { plataforma: lectura.plataforma, avisos: [], camposEquipo: lectura.camposEquipo } as unknown as Deteccion;
  // Fecha de referencia: la última actividad real (creación, cierre o cambio de estado).
  // "Actualizada" no sirve: cambia con ediciones masivas que no son trabajo.
  let ref = 0, min = Infinity;
  const actividad: number[] = [];
  tareas.forEach((t) => {
    [t.fechas.terminada, t.fechas.creada, t.fechas.cambio_estado].forEach((d) => {
      if (d) { actividad.push(d.getTime()); if (d.getTime() > ref) ref = d.getTime(); }
    });
    if (t.fechas.creada && t.fechas.creada.getTime() < min) min = t.fechas.creada.getTime();
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
      det.avisos.push({ tipo: 'aviso', texto: Tx('The last weeks of the export have almost no activity. Measures run up to the week of ', 'Las últimas semanas del export casi no tienen actividad. Las medidas llegan hasta la semana del ') + fechaCorta(new Date(s0 + ultimaActiva * 7 * DIA)) + '.' });
    }
  }
  det.hayTiempos = tareas.some((t) => t.tiempos_estado.length);

  // Estados de origen con su estado normalizado propuesto
  det.mapeoEstados = { ...lectura.mapeoPropuesto };
  const categoria: Record<string, string> = {};
  lectura.estados.forEach((e) => { categoria[e.nombre] = e.categoria; });
  interface Acumulado { nombre: string; actuales: number; horas: number[]; visitas: number }
  const estados: Record<string, Acumulado> = {};
  const estadoInfo = (nombre: string): Acumulado => {
    if (!estados[nombre]) estados[nombre] = { nombre, actuales: 0, horas: [], visitas: 0 };
    return estados[nombre];
  };
  tareas.forEach((t) => {
    if (t.estado_origen) estadoInfo(t.estado_origen).actuales++;
    t.tiempos_estado.forEach((x) => {
      const e = estadoInfo(x.estado);
      e.visitas++;
      if (x.ms > 0) e.horas.push(x.ms / 36e5);
    });
  });
  det.estados = Object.keys(estados).map((k): EstadoDetectado => {
    const e = estados[k];
    const estado = det.mapeoEstados[e.nombre] || 'pendiente';
    const explicado = explicarEstado(e.nombre, categoria[e.nombre] || '');
    return { nombre: e.nombre, actuales: e.actuales, visitas: e.visitas, categoria: categoria[e.nombre] || '',
      horasMedias: media(e.horas), estado, etapa: etapaDe(estado), bloqueo: estado === 'bloqueado',
      propuestaPor: explicado.estado === estado ? explicado.por : 'nombre' };
  }).sort((a, b) => ORDEN_ETAPA[a.etapa] - ORDEN_ETAPA[b.etapa] || b.visitas - a.visitas);

  // Candidatos para reconocer equipos
  const opciones = [...lectura.camposEquipo, { id: TODOS, nombre: 'None: all work is one team', peso: 0 }];
  det.opcionesEquipo = opciones.map((o) => {
    const valor = valorEquipo(o.id, lectura.camposEquipo);
    const cuenta: Record<string, number> = {};
    let conValor = 0;
    tareas.forEach((t) => { const v = valor(t); if (v) { conValor++; cuenta[v] = (cuenta[v] || 0) + 1; } });
    const valores = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
    const cobertura = tareas.length ? conValor / tareas.length : 0;
    // Un campo que dice "equipo" se acepta con más valores: hay áreas de 30 o 40 equipos. El resto, como mucho 25.
    const esCampoEquipo = o.id === 'equipo';
    const maxValores = esCampoEquipo ? 60 : 25;
    const valida = o.id === TODOS || (valores.length >= 2 && valores.length <= maxValores && cobertura >= 0.6);
    const puntuacion = o.id === TODOS ? 0.1 : (valida ? cobertura + o.peso - (!esCampoEquipo && valores.length > 12 ? 0.3 : 0) : -1);
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
  if (lectura.detalle && lectura.detalle.sprintsSoloActual === true && lista.length) det.sprintsSoloActual = true;
  if (det.sprintsComoFecha) det.avisos.push({ tipo: 'aviso', texto: Tx('Sprint names look like dates and times (', 'Los nombres de sprint parecen fechas y horas (') + lista.length.toLocaleString(regional()) + Tx(' different ones). They are not used as sprints: measures go by week.', ' distintos). No se usan como sprints: las medidas van por semanas.') });
  return det;
}
