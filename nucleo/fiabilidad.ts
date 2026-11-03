// Fiabilidad de los datos: comprobaciones de si la herramienta refleja bien el trabajo, para el área y por equipo.
// Cada comprobación dice qué mira, su valor, desde cuándo se considera bien y cómo se arregla.
// No cambia ninguna cifra: avisa antes de sacar conclusiones.

import { Tx, idioma, regional } from './idioma.ts';
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
const pct = (x: number) => (x < 1 && Math.round(x * 100) === 100 ? (Math.floor(x * 1000) / 10).toLocaleString(regional()) : String(Math.round(x * 100))) + (idioma() === 'es' ? '\u00a0%' : '%');

interface Parcial { valor: string; estado: EstadoComprobacion; detalle: string }

// Comprobaciones que se calculan igual para un equipo y para el área (con todas sus tareas)
function deItems(items: Derivada[], p: Preparacion, det: Deteccion, cfg: ConfigCalculo = {}): Record<string, Parcial> {
  const desde = sumarDias(p.ctx.semanaFin, -7 * SEMANAS_FIABILIDAD);
  const ent = items.filter((d) => d.entregada && d.t.fechas.terminada! >= desde && d.t.fechas.terminada! < p.ctx.semanaFin);
  const out: Record<string, Parcial> = {};
  // Tiempo en cada estado
  if (!det.hayTiempos) out.tiempos = { valor: Tx('Missing', 'No viene'), estado: 'revisar', detalle: Tx('The export has no time in each status: lead time, rework and blocked time cannot be measured.', 'El export no trae el tiempo en cada estado: no se pueden medir el plazo, el retrabajo ni el bloqueo.') };
  else if (ent.length < 5) out.tiempos = { valor: Tx('Few tasks', 'Pocas tareas'), estado: 'sin', detalle: Tx('Fewer than 5 tasks were done in recent weeks.', 'Hay menos de 5 tareas terminadas en las últimas semanas.') };
  else {
    const x = ent.filter((d) => d.conTiempos).length / ent.length;
    out.tiempos = { valor: pct(x), estado: x >= 0.8 ? 'bien' : 'revisar', detalle: pct(x) + Tx(' of done work has the time in each status.', ' de lo terminado trae el tiempo en cada estado.') };
  }
  // Pasan por en curso
  if (ent.length < 5) out.flujo = { valor: Tx('Few tasks', 'Pocas tareas'), estado: 'sin', detalle: Tx('Fewer than 5 tasks were done in recent weeks.', 'Hay menos de 5 tareas terminadas en las últimas semanas.') };
  else {
    const x = 1 - ent.filter((d) => d.salto).length / ent.length;
    out.flujo = { valor: pct(x), estado: x >= 0.95 ? 'bien' : 'revisar', detalle: pct(x) + Tx(' of done work went through in progress before it was closed.', ' de lo terminado pasó por en curso antes de cerrarse.') };
  }
  // Registro a tiempo: las tareas se crean antes de hacer el trabajo
  if (ent.length < 30) out.registro = { valor: Tx('Few tasks', 'Pocas tareas'), estado: 'sin', detalle: Tx('It takes 30 done tasks to assess this.', 'Hacen falta 30 tareas terminadas para valorarlo.') };
  else {
    const p85 = cuantil(ent.map((d) => d.total!), 0.85)!;
    const x = ent.filter((d) => (d.total || 0) >= 1).length / ent.length;
    out.registro = { valor: pct(x), estado: p85 >= 1 ? 'bien' : 'revisar', detalle: pct(x) + Tx(' of done work took at least one day from creation.', ' de lo terminado tardó al menos un día desde que se creó.') };
  }
  // Historias estimadas
  const historias = items.filter((d) => d.t.tipo === 'historia');
  if (cfg.sinEstimacion) out.estimacion = { valor: Tx('Not used', 'No se usa'), estado: 'sin', detalle: Tx('The client chose not to use estimates.', 'Se ha elegido no usar estimación.') };
  else if (historias.length < 10) out.estimacion = { valor: Tx('Few stories', 'Pocas historias'), estado: 'sin', detalle: Tx('There are fewer than 10 stories.', 'Hay menos de 10 historias.') };
  else {
    const x = historias.filter((d) => d.t.estimacion != null).length / historias.length;
    out.estimacion = { valor: pct(x), estado: x >= 0.7 ? 'bien' : 'revisar', detalle: pct(x) + Tx(' of stories have an estimate.', ' de las historias tiene estimación.') };
  }
  return out;
}

export function fiabilidad(lectura: Lectura, det: Deteccion, p: Preparacion, modelo: Modelo, cfg: ConfigCalculo = {}): Fiabilidad {
  const todas = Object.keys(p.porEquipo).flatMap((e) => p.porEquipo[e]);
  const area = deItems(todas, p, det, cfg);
  const usaSprints = (nombre: string) => (p.porEquipo[nombre] || []).some((d) => d.t.sprints.length > 0);
  // Por equipo
  const porEquipo: FiabilidadEquipo[] = modelo.equipos.map((eq) => {
    const x = deItems(p.porEquipo[eq.nombre] || [], p, det, cfg);
    const sp: Parcial = !det.haySprints || det.sprintsComoFecha || !usaSprints(eq.nombre) ? { valor: Tx('Not applicable', 'No aplica'), estado: 'sin', detalle: '' }
      : { valor: eq.sprints.fiables ? Tx('Yes', 'Sí') : Tx('No', 'No'), estado: eq.sprints.fiables ? 'bien' : 'revisar', detalle: eq.sprints.motivo || '' };
    const hi: Parcial = { valor: eq.semanasConDatos + Tx(' weeks', ' semanas'), estado: eq.semanasConDatos >= SEMANAS_MINIMAS ? 'bien' : 'revisar', detalle: '' };
    const valores: FiabilidadEquipo['valores'] = {};
    const todosX: Record<string, Parcial> = { ...x, sprints: sp, historia: hi };
    COMPROBACIONES_EQUIPO.forEach((k) => { valores[k] = { valor: todosX[k].valor, estado: todosX[k].estado }; });
    return { equipo: eq.nombre, valores, revisar: COMPROBACIONES_EQUIPO.filter((k) => valores[k].estado === 'revisar').length };
  });
  // Una comprobación del área se revisa también si falla en algún equipo: una media buena puede esconder un equipo roto
  const conEquipos = (id: string, x: Parcial): Parcial => {
    const malos = porEquipo.filter((e) => e.valores[id] && e.valores[id].estado === 'revisar');
    if (!malos.length) return x;
    return { valor: x.valor, estado: 'revisar', detalle: x.detalle + Tx(' Check ', ' Revisar ') + malos.map((e) => e.equipo + ' (' + e.valores[id].valor + ')').join(', ') + '.' };
  };
  const comp: Comprobacion[] = [];
  const nuevo = (id: string, nombre: string, que: string, umbral: string, arreglo: string, x: Parcial) => comp.push({ id, nombre, que, umbral, arreglo, valor: x.valor, estado: x.estado, detalle: x.detalle });

  // Tareas con equipo
  const total = lectura.tareas.length, conEquipo = todas.length;
  const cobertura = total ? conEquipo / total : 0;
  nuevo('equipo', Tx('Tasks with a team', 'Tareas con equipo'), Tx('Share of tasks that can be assigned to one of the measured teams.', 'Parte de las tareas que se pueden asignar a uno de los equipos medidos.'), Tx('90% or more', '90% o más'),
    Tx('Check the field that says which team each task belongs to, or ask the teams to fill it in.', 'Revisar el campo que dice de qué equipo es cada tarea, o pedir a los equipos que lo rellenen.'),
    { valor: pct(cobertura), estado: cobertura >= 0.9 ? 'bien' : 'revisar', detalle: conEquipo.toLocaleString(regional()) + Tx(' of ', ' de ') + total.toLocaleString(regional()) + Tx(' tasks have a team from the list.', ' tareas tienen un equipo de la lista.') });

  // Estados reconocidos
  const confirmados = Object.assign({}, cfg.mapeoEstados || {});
  const porRevisar = cfg.estadosPorRevisar ? det.estados.filter((e) => cfg.estadosPorRevisar!.includes(e.nombre))
    : det.estados.filter((e) => e.propuestaPor !== 'nombre' && !confirmados[e.nombre]);
  nuevo('estados', Tx('Recognised statuses', 'Estados reconocidos'), Tx('Statuses from the tool that map with confidence to a common status.', 'Estados de la herramienta que se han traducido con seguridad a un estado común.'), Tx('All', 'Todos'),
    Tx('Confirm in Settings the common status of those still to review.', 'Confirmar el estado común de los que están por revisar, en el mapeo de estados.'),
    { valor: (det.estados.length - porRevisar.length) + Tx(' of ', ' de ') + det.estados.length, estado: porRevisar.length ? 'revisar' : 'bien',
      detalle: porRevisar.length ? Tx('To confirm: ', 'Por confirmar: ') + porRevisar.map((e) => e.nombre).join(', ') + '.' : Tx('All are recognised by name or confirmed.', 'Todos se reconocen por su nombre o están confirmados.') });

  nuevo('tiempos', Tx('Time in each status', 'Tiempo en cada estado'), Tx('Whether done work includes how long it spent in each status. Without it there is no lead time, rework or blocked time.', 'Si lo terminado trae cuánto tiempo pasó en cada estado. Sin él no hay plazo, retrabajo ni bloqueo.'), Tx('80% or more', '80% o más'),
    Tx('Export with the Time in Status field, or connect to the API, which brings the change history.', 'Exportar con el campo Tiempo en estado, o conectar con la API, que trae el historial de cambios.'), conEquipos('tiempos', area.tiempos));
  nuevo('flujo', Tx('Go through in progress', 'Pasan por en curso'), Tx('Whether tasks move to in progress when they start, instead of jumping from backlog to done.', 'Si las tareas se mueven por en curso al empezar, en lugar de saltar de pendiente a hecho.'), Tx('95% or more', '95% o más'),
    Tx('Move each task to in progress when work on it starts.', 'Mover cada tarea a en curso cuando se empieza a trabajar en ella.'), conEquipos('flujo', area.flujo));

  // Cierres en bloque
  const bloques = modelo.cierresBloque;
  nuevo('bloque', Tx('No bulk closures', 'Sin cierres en bloque'), Tx('Moments when 10 or more tasks were closed in the same minute, typical of a board clean-up.', 'Momentos en los que se cerraron 10 o más tareas en el mismo minuto, típico de una limpieza del tablero.'), Tx('None', 'Ninguno'),
    Tx('If it was a clean-up, close those tasks as discarded so they do not count as deliveries.', 'Si fue una limpieza, cerrar esas tareas como descartadas para que no cuenten como entregas.'),
    { valor: String(bloques.length), estado: bloques.length ? 'revisar' : 'bien',
      detalle: bloques.length ? bloques.length + (bloques.length === 1 ? Tx(' bulk closure', ' cierre en bloque') : Tx(' bulk closures', ' cierres en bloque')) + Tx(', with ', ', con ') + bloques.reduce((s, b) => s + b.n, 0) + Tx(' tasks in total.', ' tareas en total.') : Tx('No bulk closures.', 'No hay cierres masivos.') });

  nuevo('registro', Tx('Logged on time', 'Registro a tiempo'), Tx('Whether tasks are created before the work is done, not afterwards just to record it.', 'Si las tareas se crean antes de hacer el trabajo y no después, para apuntarlo.'), Tx('15% or more: if almost everything is closed the same day it is created, it was logged at the end', '15% o más: si casi todo se cierra el mismo día en que se crea, se apuntó al terminar'),
    Tx('Create tasks when planning, not when the work is finished.', 'Crear las tareas al planificar, no al terminar el trabajo.'), conEquipos('registro', area.registro));
  nuevo('estimacion', Tx('Estimated stories', 'Historias estimadas'), Tx('Share of stories with an estimate. Without it there is no way to see whether estimates predict.', 'Parte de las historias con estimación. Sin ella no se puede ver si las estimaciones predicen.'), Tx('70% or more', '70% o más'),
    Tx('Estimate stories before starting, even with t-shirt sizes.', 'Estimar las historias antes de empezar, aunque sea con tallas.'), conEquipos('estimacion', area.estimacion));

  // Sprints creíbles
  const conSprints = modelo.equipos.filter((e) => usaSprints(e.nombre));
  const fiables = conSprints.filter((e) => e.sprints.fiables);
  const sprints: Parcial = !det.haySprints ? { valor: Tx('None', 'Ninguno'), estado: 'sin', detalle: Tx('The data has no sprints.', 'Los datos no traen sprints.') }
    : det.sprintsComoFecha ? { valor: Tx('Not credible', 'No creíbles'), estado: 'revisar', detalle: Tx('Sprint names look like dates and times.', 'Los nombres de sprint parecen fechas y horas.') }
      : !conSprints.length ? { valor: Tx('Few', 'Pocos'), estado: 'sin', detalle: Tx('Not enough sprints to assess this.', 'No hay sprints suficientes para valorarlo.') }
        : { valor: fiables.length + Tx(' of ', ' de ') + conSprints.length + Tx(' teams', ' equipos'), estado: fiables.length === conSprints.length ? 'bien' : 'revisar',
          detalle: fiables.length === conSprints.length ? Tx('The sprints of every team can be used to measure.', 'Los sprints de todos los equipos se pueden usar para medir.') : Tx('Teams with sprints that are not credible: ', 'Equipos con sprints poco creíbles: ') + conSprints.filter((e) => !e.sprints.fiables).map((e) => e.nombre).join(', ') + '.' };
  nuevo('sprints', Tx('Credible sprints', 'Sprints creíbles'), Tx('Whether sprints really open and close in the tool, so carried over work can be measured.', 'Si los sprints se abren y se cierran de verdad en la herramienta, para medir lo que pasa de un sprint a otro.'), Tx('All teams', 'Todos los equipos'),
    Tx('Close each sprint in the tool and move unfinished work to the next one.', 'Cerrar cada sprint en la herramienta y mover lo pendiente al siguiente.'), sprints);

  // Actividad hasta el final del periodo
  const cortado = det.avisos.some((a) => /activity/i.test(a.texto));
  nuevo('actividad', Tx('Data up to the end', 'Datos hasta el final'), Tx('Whether the export reaches the last week or looks cut off before it.', 'Si el export llega hasta la última semana o parece cortado antes.'), Tx('No cut-off', 'Sin cortes'),
    Tx('Export again with the whole period.', 'Exportar de nuevo con todo el periodo.'),
    { valor: cortado ? Tx('Cut off', 'Cortado') : Tx('Complete', 'Completo'), estado: cortado ? 'revisar' : 'bien', detalle: cortado ? Tx('The last weeks have almost no activity.', 'Las últimas semanas casi no tienen actividad.') : Tx('There is activity up to the end of the period.', 'Hay actividad hasta el final del periodo.') });

  // Historia suficiente para saber qué es lo normal
  const cortos = modelo.equipos.filter((e) => e.semanasConDatos < SEMANAS_MINIMAS);
  nuevo('historia', Tx('Enough history', 'Historia suficiente'), Tx('Weeks with activity for each team. It takes 12 to know what is normal and 4 to measure.', 'Semanas con actividad de cada equipo. Hacen falta 12 para saber qué es lo normal y 4 para medir.'), SEMANAS_MINIMAS + Tx(' weeks or more', ' semanas o más'),
    Tx('Load a longer period in the first import.', 'Cargar un periodo más largo en la primera ingesta.'),
    { valor: (modelo.equipos.length - cortos.length) + Tx(' of ', ' de ') + modelo.equipos.length + Tx(' teams', ' equipos'), estado: cortos.length ? 'revisar' : 'bien',
      detalle: cortos.length ? Tx('Short history: ', 'Con poca historia: ') + cortos.map((e) => e.nombre + ' (' + e.semanasConDatos + Tx(' weeks)', ' semanas)')).join(', ') + '.' : Tx('Every team has enough history.', 'Todos los equipos tienen historia suficiente.') });

  const revisar = comp.filter((c) => c.estado === 'revisar').length, bien = comp.filter((c) => c.estado === 'bien').length;
  let nivel: NivelFiabilidad = revisar <= 1 ? 'alta' : revisar <= 3 ? 'media' : 'baja';
  if (cobertura < 0.7 || !det.hayTiempos) nivel = nivel === 'alta' ? 'media' : nivel;
  if (cobertura < 0.5) nivel = 'baja';
  return { nivel, bien, revisar, comprobaciones: comp, porEquipo };
}
