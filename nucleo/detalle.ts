// Detalle de una cifra: las tareas que componen el valor actual de una medida de un equipo.
// Es lo que se abre en el panel lateral al pulsar una cifra. Clave y título solo se usan en pantalla:
// nunca van al paquete de diagnóstico ni a la IA.

import { DIA } from './util.ts';
import { RUBRICA } from './agent-readiness.ts';
import type { Preparacion } from './calcular.ts';
import type { Derivada } from './tipos.ts';

export interface FilaDetalle {
  clave: string;
  titulo: string;
  tipo: string;
  estado: string;
  creada: Date;
  terminada: Date | null;
  /** Días que cuenta la medida para esta tarea (lead time, tiempo total o antigüedad), si aplica. */
  dias: number | null;
  /** Lo que la tarea aporta a una proporción: true si cuenta arriba (es bug, volvió atrás, pasó por más de un sprint...). */
  cuenta: boolean | null;
}

export interface DetalleMedida {
  medida: string;
  equipo: string;
  desde: Date;
  hasta: Date;
  /** Qué tareas entran, en una frase corta con clave de texto (la traduce la pantalla). */
  criterio: string;
  filas: FilaDetalle[];
}

const fila = (d: Derivada, dias: number | null, cuenta: boolean | null): FilaDetalle => ({
  clave: d.t.clave_origen, titulo: d.t.titulo, tipo: d.t.tipo, estado: d.t.estado_origen,
  creada: d.t.fechas.creada, terminada: d.t.fechas.terminada, dias, cuenta,
});

/** Semanas de la ventana de cada medida ('K' = actual, 'P' = proporciones). */
const VENTANA: Record<string, 'K' | 'P' | number> = {
  entregas: 'K', bugs: 'K', ciclo: 'K', total: 'K', espera: 'K', velocidad: 'K', primera: 'K',
  errores: 'P', retrabajo: 'P', arrastradas: 'P', reparto: 'P', regularidad: 8, estimacion: 12, agent_readiness: 12,
};

/** umbralEdad: el del equipo en el modelo (eq.umbralEdad). Con él, la medida "edad" deja solo las tareas que ya lo superan. */
export function detalleMedida(p: Preparacion, equipo: string, medida: string, opciones: { umbralEdad?: number | null } = {}): DetalleMedida | null {
  const items = p.porEquipo[equipo];
  if (!items) return null;
  const c = p.ctx;
  const hasta = c.semanaFin;
  const v = VENTANA[medida];
  const semanas = v === 'K' ? c.K : v === 'P' ? c.KP : (v || c.K);
  const desde = new Date(hasta.getTime() - semanas * 7 * DIA);
  const enVentana = (x: Date | null) => !!x && x >= desde && x < hasta;
  const terminadas = items.filter((d) => d.entregada && enVentana(d.t.fechas.terminada));
  const porDias = (a: FilaDetalle, b: FilaDetalle) => (b.dias ?? -1) - (a.dias ?? -1);
  let filas: FilaDetalle[] = [];
  let criterio = 'detalle.terminadas';
  switch (medida) {
    case 'entregas': case 'velocidad': case 'regularidad':
      filas = terminadas.map((d) => fila(d, d.total ?? null, null)); break;
    case 'bugs':
      criterio = 'detalle.bugsCreados';
      filas = items.filter((d) => d.t.tipo === 'error' && !d.descartada && enVentana(d.t.fechas.creada)).map((d) => fila(d, null, null)); break;
    case 'ciclo': case 'espera': case 'estimacion':
      criterio = 'detalle.terminadasConTiempos';
      filas = terminadas.filter((d) => d.ciclo != null).map((d) => fila(d, d.ciclo!, null)).sort(porDias); break;
    case 'total':
      filas = terminadas.map((d) => fila(d, d.total ?? null, null)).sort(porDias); break;
    case 'errores':
      filas = terminadas.map((d) => fila(d, null, d.t.tipo === 'error')); break;
    case 'retrabajo':
      criterio = 'detalle.terminadasConTiempos';
      filas = terminadas.filter((d) => d.conTiempos).map((d) => fila(d, null, d.retrabajo)); break;
    case 'arrastradas':
      filas = terminadas.map((d) => fila(d, null, d.t.sprints.length > 1)); break;
    case 'reparto':
      filas = terminadas.map((d) => fila(d, null, d.t.tipo === 'historia')); break;
    case 'primera':
      criterio = 'detalle.creadasConRespuesta';
      filas = items.filter((d) => d.primeraH != null && enVentana(d.t.fechas.creada)).map((d) => fila(d, d.primeraH! / 24, null)).sort(porDias); break;
    case 'agent_readiness':
      criterio = 'detalle.creadas';
      filas = items.filter((d) => !d.descartada && enVentana(d.t.fechas.creada)).map((d) => fila(d, null, d.ar.indice >= RUBRICA.listoDesde)); break;
    case 'wip': case 'edad': {
      // Lo que está en curso al cierre de la última semana, con su antigüedad
      criterio = 'detalle.enCurso';
      filas = items.filter((d) => !d.descartada && d.inicio && d.inicio < hasta && d.t.fechas.creada < hasta && (!d.t.fechas.terminada || d.t.fechas.terminada >= hasta))
        .map((d) => fila(d, (c.fechaRef.getTime() - d.inicio!.getTime()) / DIA, null)).sort(porDias);
      if (medida === 'edad') {
        criterio = 'detalle.atascadas';
        const u = opciones.umbralEdad;
        filas = u == null ? [] : filas.filter((f) => f.dias != null && f.dias > u);
      }
      return { medida, equipo, desde: hasta, hasta, criterio, filas };
    }
    case 'pendiente':
      criterio = 'detalle.sinEmpezar';
      filas = items.filter((d) => d.t.fechas.creada < hasta && (!d.t.fechas.terminada || d.t.fechas.terminada >= hasta) && !(d.inicio && d.inicio < hasta))
        .map((d) => fila(d, (hasta.getTime() - d.t.fechas.creada.getTime()) / DIA, null)).sort(porDias);
      return { medida, equipo, desde: hasta, hasta, criterio, filas };
    default:
      return null;
  }
  return { medida, equipo, desde, hasta, criterio, filas };
}
