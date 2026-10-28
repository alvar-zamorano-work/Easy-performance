// Fiabilidad de los datos: comprobaciones de si la herramienta refleja bien el trabajo, para el área y por equipo.
// Cada comprobación dice qué mira, su valor, desde cuándo se considera bien y cómo se arregla.
// No cambia ninguna cifra: avisa antes de sacar conclusiones.

import { cuantil, sumarDias } from './util.ts';
import type { Preparacion } from './calcular.ts';
import type { ConfigCalculo, Deteccion, Derivada, Modelo } from './tipos.ts';
import type { Lectura } from './modelo.ts';

export type EstadoComprobacion = 'bien' | 'revisar' | 'sin';
export type NivelFiabilidad = 'alta' | 'media' | 'baja';

export interface Comprobacion {
  id: string;
  nombre: string;
  /** Qué mira, en una frase. */
  que: string;
  /** Valor para mostrar ("92%", "0", "5 de 5"). */
  valor: string;
  /** Desde cuándo está bien, en palabras. */
  umbral: string;
  estado: EstadoComprobacion;
  /** Qué pasa con este valor, en una frase. */
  detalle: string;
  /** Qué hacer si hay que revisarla. */
  arreglo: string;
}
export interface FiabilidadEquipo { equipo: string; valores: Record<string, { valor: string; estado: EstadoComprobacion }>; revisar: number }
export interface Fiabilidad { nivel: NivelFiabilidad; bien: number; revisar: number; comprobaciones: Comprobacion[]; porEquipo: FiabilidadEquipo[] }

/** Semanas recientes que se miran (las mismas que los avisos de calidad). */
export const SEMANAS_FIABILIDAD = 16;
/** Semanas de historia que necesita un equipo: 12 para saber qué es lo normal y 4 para medir. */
export const SEMANAS_MINIMAS = 16;
/** Columnas de la tabla por equipo. */
export const COMPROBACIONES_EQUIPO = ['tiempos', 'flujo', 'registro', 'estimacion', 'sprints', 'historia'];

// Sin redondear a 100% lo que no llega: 99,8% se muestra con un decimal
const pct = (x: number) => (x < 1 && Math.round(x * 100) === 100 ? (Math.floor(x * 1000) / 10).toLocaleString('en-GB') : String(Math.round(x * 100))) + '%';

interface Parcial { valor: string; estado: EstadoComprobacion; detalle: string }

// Comprobaciones que se calculan igual para un equipo y para el área (con todas sus tareas)
function deItems(items: Derivada[], p: Preparacion, det: Deteccion): Record<string, Parcial> {
  const desde = sumarDias(p.ctx.semanaFin, -7 * SEMANAS_FIABILIDAD);
  const ent = items.filter((d) => d.entregada && d.t.fechas.terminada! >= desde && d.t.fechas.terminada! < p.ctx.semanaFin);
  const out: Record<string, Parcial> = {};
  // Tiempo en cada estado
  if (!det.hayTiempos) out.tiempos = { valor: 'Missing', estado: 'revisar', detalle: 'The export has no time in each status: lead time, rework and blocked time cannot be measured.' };
  else if (ent.length < 5) out.tiempos = { valor: 'Few tasks', estado: 'sin', detalle: 'Fewer than 5 tasks were done in recent weeks.' };
  else {
    const x = ent.filter((d) => d.conTiempos).length / ent.length;
    out.tiempos = { valor: pct(x), estado: x >= 0.8 ? 'bien' : 'revisar', detalle: pct(x) + ' of done work has the time in each status.' };
  }
  // Pasan por en curso
  if (ent.length < 5) out.flujo = { valor: 'Few tasks', estado: 'sin', detalle: 'Fewer than 5 tasks were done in recent weeks.' };
  else {
    const x = 1 - ent.filter((d) => d.salto).length / ent.length;
    out.flujo = { valor: pct(x), estado: x >= 0.95 ? 'bien' : 'revisar', detalle: pct(x) + ' of done work went through in progress before it was closed.' };
  }
  // Registro a tiempo: las tareas se crean antes de hacer el trabajo
  if (ent.length < 30) out.registro = { valor: 'Few tasks', estado: 'sin', detalle: 'It takes 30 done tasks to assess this.' };
  else {
    const p85 = cuantil(ent.map((d) => d.total!), 0.85)!;
    const x = ent.filter((d) => (d.total || 0) >= 1).length / ent.length;
    out.registro = { valor: pct(x), estado: p85 >= 1 ? 'bien' : 'revisar', detalle: pct(x) + ' of done work took at least one day from creation.' };
  }
  // Historias estimadas
  const historias = items.filter((d) => d.t.tipo === 'historia');
  if (historias.length < 10) out.estimacion = { valor: 'Few stories', estado: 'sin', detalle: 'There are fewer than 10 stories.' };
  else {
    const x = historias.filter((d) => d.t.estimacion != null).length / historias.length;
    out.estimacion = { valor: pct(x), estado: x >= 0.7 ? 'bien' : 'revisar', detalle: pct(x) + ' of stories have an estimate.' };
  }
  return out;
}

export function fiabilidad(lectura: Lectura, det: Deteccion, p: Preparacion, modelo: Modelo, cfg: ConfigCalculo = {}): Fiabilidad {
  const todas = Object.keys(p.porEquipo).flatMap((e) => p.porEquipo[e]);
  const area = deItems(todas, p, det);
  const usaSprints = (nombre: string) => (p.porEquipo[nombre] || []).some((d) => d.t.sprints.length > 0);
  // Por equipo
  const porEquipo: FiabilidadEquipo[] = modelo.equipos.map((eq) => {
    const x = deItems(p.porEquipo[eq.nombre] || [], p, det);
    const sp: Parcial = !det.haySprints || det.sprintsComoFecha || !usaSprints(eq.nombre) ? { valor: 'Not applicable', estado: 'sin', detalle: '' }
      : { valor: eq.sprints.fiables ? 'Yes' : 'No', estado: eq.sprints.fiables ? 'bien' : 'revisar', detalle: eq.sprints.motivo || '' };
    const hi: Parcial = { valor: eq.semanasConDatos + ' weeks', estado: eq.semanasConDatos >= SEMANAS_MINIMAS ? 'bien' : 'revisar', detalle: '' };
    const valores: FiabilidadEquipo['valores'] = {};
    const todosX: Record<string, Parcial> = { ...x, sprints: sp, historia: hi };
    COMPROBACIONES_EQUIPO.forEach((k) => { valores[k] = { valor: todosX[k].valor, estado: todosX[k].estado }; });
    return { equipo: eq.nombre, valores, revisar: COMPROBACIONES_EQUIPO.filter((k) => valores[k].estado === 'revisar').length };
  });
  // Una comprobación del área se revisa también si falla en algún equipo: una media buena puede esconder un equipo roto
  const conEquipos = (id: string, x: Parcial): Parcial => {
    const malos = porEquipo.filter((e) => e.valores[id] && e.valores[id].estado === 'revisar');
    if (!malos.length) return x;
    return { valor: x.valor, estado: 'revisar', detalle: x.detalle + ' Check ' + malos.map((e) => e.equipo + ' (' + e.valores[id].valor + ')').join(', ') + '.' };
  };
  const comp: Comprobacion[] = [];
  const nuevo = (id: string, nombre: string, que: string, umbral: string, arreglo: string, x: Parcial) => comp.push({ id, nombre, que, umbral, arreglo, valor: x.valor, estado: x.estado, detalle: x.detalle });

  // Tareas con equipo
  const total = lectura.tareas.length, conEquipo = todas.length;
  const cobertura = total ? conEquipo / total : 0;
  nuevo('equipo', 'Tasks with a team', 'Share of tasks that can be assigned to one of the measured teams.', '90% or more',
    'Check the field that says which team each task belongs to, or ask the teams to fill it in.',
    { valor: pct(cobertura), estado: cobertura >= 0.9 ? 'bien' : 'revisar', detalle: conEquipo.toLocaleString('en-GB') + ' of ' + total.toLocaleString('en-GB') + ' tasks have a team from the list.' });

  // Estados reconocidos
  const confirmados = Object.assign({}, cfg.mapeoEstados || {});
  const porRevisar = det.estados.filter((e) => e.propuestaPor !== 'nombre' && !confirmados[e.nombre]);
  nuevo('estados', 'Recognised statuses', 'Statuses from the tool that map with confidence to a common status.', 'All',
    'Confirm in Settings the common status of those still to review.',
    { valor: (det.estados.length - porRevisar.length) + ' of ' + det.estados.length, estado: porRevisar.length ? 'revisar' : 'bien',
      detalle: porRevisar.length ? 'To confirm: ' + porRevisar.map((e) => e.nombre).join(', ') + '.' : 'All are recognised by name or confirmed.' });

  nuevo('tiempos', 'Time in each status', 'Whether done work includes how long it spent in each status. Without it there is no lead time, rework or blocked time.', '80% or more',
    'Export with the Time in Status field, or connect to the API, which brings the change history.', conEquipos('tiempos', area.tiempos));
  nuevo('flujo', 'Go through in progress', 'Whether tasks move to in progress when they start, instead of jumping from backlog to done.', '95% or more',
    'Move each task to in progress when work on it starts.', conEquipos('flujo', area.flujo));

  // Cierres en bloque
  const bloques = modelo.cierresBloque;
  nuevo('bloque', 'No bulk closures', 'Moments when 10 or more tasks were closed in the same minute, typical of a board clean-up.', 'None',
    'If it was a clean-up, close those tasks as discarded so they do not count as deliveries.',
    { valor: String(bloques.length), estado: bloques.length ? 'revisar' : 'bien',
      detalle: bloques.length ? bloques.length + (bloques.length === 1 ? ' bulk closure' : ' bulk closures') + ', with ' + bloques.reduce((s, b) => s + b.n, 0) + ' tasks in total.' : 'No bulk closures.' });

  nuevo('registro', 'Logged on time', 'Whether tasks are created before the work is done, not afterwards just to record it.', '15% or more: if almost everything is closed the same day it is created, it was logged at the end',
    'Create tasks when planning, not when the work is finished.', conEquipos('registro', area.registro));
  nuevo('estimacion', 'Estimated stories', 'Share of stories with an estimate. Without it there is no way to see whether estimates predict.', '70% or more',
    'Estimate stories before starting, even with t-shirt sizes.', conEquipos('estimacion', area.estimacion));

  // Sprints creíbles
  const conSprints = modelo.equipos.filter((e) => usaSprints(e.nombre));
  const fiables = conSprints.filter((e) => e.sprints.fiables);
  const sprints: Parcial = !det.haySprints ? { valor: 'None', estado: 'sin', detalle: 'The data has no sprints.' }
    : det.sprintsComoFecha ? { valor: 'Not credible', estado: 'revisar', detalle: 'Sprint names look like dates and times.' }
      : !conSprints.length ? { valor: 'Few', estado: 'sin', detalle: 'Not enough sprints to assess this.' }
        : { valor: fiables.length + ' of ' + conSprints.length + ' teams', estado: fiables.length === conSprints.length ? 'bien' : 'revisar',
          detalle: fiables.length === conSprints.length ? 'The sprints of every team can be used to measure.' : 'Teams with sprints that are not credible: ' + conSprints.filter((e) => !e.sprints.fiables).map((e) => e.nombre).join(', ') + '.' };
  nuevo('sprints', 'Credible sprints', 'Whether sprints really open and close in the tool, so carried over work can be measured.', 'All teams',
    'Close each sprint in the tool and move unfinished work to the next one.', sprints);

  // Actividad hasta el final del periodo
  const cortado = det.avisos.some((a) => /activity/i.test(a.texto));
  nuevo('actividad', 'Data up to the end', 'Whether the export reaches the last week or looks cut off before it.', 'No cut-off',
    'Export again with the whole period.',
    { valor: cortado ? 'Cut off' : 'Complete', estado: cortado ? 'revisar' : 'bien', detalle: cortado ? 'The last weeks have almost no activity.' : 'There is activity up to the end of the period.' });

  // Historia suficiente para saber qué es lo normal
  const cortos = modelo.equipos.filter((e) => e.semanasConDatos < SEMANAS_MINIMAS);
  nuevo('historia', 'Enough history', 'Weeks with activity for each team. It takes 12 to know what is normal and 4 to measure.', SEMANAS_MINIMAS + ' weeks or more',
    'Load a longer period in the first import.',
    { valor: (modelo.equipos.length - cortos.length) + ' of ' + modelo.equipos.length + ' teams', estado: cortos.length ? 'revisar' : 'bien',
      detalle: cortos.length ? 'Short history: ' + cortos.map((e) => e.nombre + ' (' + e.semanasConDatos + ' weeks)').join(', ') + '.' : 'Every team has enough history.' });

  const revisar = comp.filter((c) => c.estado === 'revisar').length, bien = comp.filter((c) => c.estado === 'bien').length;
  let nivel: NivelFiabilidad = revisar <= 1 ? 'alta' : revisar <= 3 ? 'media' : 'baja';
  if (cobertura < 0.7 || !det.hayTiempos) nivel = nivel === 'alta' ? 'media' : nivel;
  if (cobertura < 0.5) nivel = 'baja';
  return { nivel, bien, revisar, comprobaciones: comp, porEquipo };
}
