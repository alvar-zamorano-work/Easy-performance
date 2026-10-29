// Historial de estados a tiempo por estado. Cuando una fuente da los cambios de estado con fecha (API o export con
// historial) y no da el tiempo en cada estado, se calcula aquí. El núcleo saca de ese tiempo el plazo, la espera,
// los bloqueos y el retrabajo, así que no necesita saber de dónde viene.
//
// Contrato: historial_estados lista cada estado en el que ha entrado la tarea, con la fecha de entrada, incluido el
// estado inicial con la fecha de creación. Si el primer cambio es posterior a la creación y no se sabe el estado
// inicial, ese tramo no se atribuye a ningún estado.

import type { CambioEstado, Lectura, Tarea, TiempoEnEstado } from '../../nucleo/modelo.ts';

/** Tiempo y entradas en cada estado de origen. El último estado cuenta hasta `fin`. */
export function tiemposDesdeHistorial(historial: CambioEstado[], fin: Date): TiempoEnEstado[] {
  const orden = historial.filter((c) => c && c.estado && c.fecha instanceof Date && !isNaN(c.fecha.getTime()))
    .slice().sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const porEstado = new Map<string, TiempoEnEstado>();
  orden.forEach((c, i) => {
    // Un "cambio" al mismo estado en el que ya estaba no es una entrada nueva
    const repetido = i > 0 && orden[i - 1].estado === c.estado;
    const hasta = i + 1 < orden.length ? orden[i + 1].fecha : fin;
    const ms = Math.max(0, hasta.getTime() - c.fecha.getTime());
    const x = porEstado.get(c.estado) || { estado: c.estado, visitas: 0, ms: 0 };
    if (!repetido) x.visitas++;
    x.ms += ms;
    porEstado.set(c.estado, x);
  });
  return [...porEstado.values()];
}

/** Fecha hasta la que cuenta el último estado: la última actividad del export. */
function ultimaActividad(tareas: Tarea[]): Date {
  let max = 0;
  tareas.forEach((t) => {
    [t.fechas.creada, t.fechas.terminada, t.fechas.cambio_estado].forEach((d) => { if (d && d.getTime() > max) max = d.getTime(); });
    t.historial_estados.forEach((c) => { if (c.fecha && c.fecha.getTime() > max) max = c.fecha.getTime(); });
  });
  return new Date(max || Date.now());
}

/**
 * Completa el tiempo por estado de las tareas que traen historial y no traen tiempos.
 * Devuelve la misma lectura si no hay nada que completar. Nunca modifica la original.
 */
export function completarDesdeHistorial(lectura: Lectura, fin: Date = ultimaActividad(lectura.tareas)): Lectura {
  let cambios = 0;
  const tareas = lectura.tareas.map((t) => {
    if (!t.historial_estados.length || t.tiempos_estado.length) return t;
    const tiempos = tiemposDesdeHistorial(t.historial_estados, fin);
    if (!tiempos.length) return t;
    cambios++;
    const ultimo = t.historial_estados.reduce((a, b) => (b.fecha.getTime() >= a.fecha.getTime() ? b : a));
    return {
      ...t,
      tiempos_estado: tiempos,
      estado_origen: t.estado_origen || ultimo.estado,
      fechas: { ...t.fechas, cambio_estado: t.fechas.cambio_estado || ultimo.fecha },
    };
  });
  return cambios ? { ...lectura, tareas } : lectura;
}
