// Capacidad y coste: cuántas personas equivalentes (FTE) tiene cada equipo, cuánto cuesta al mes
// y cuánto cuesta cada tarea terminada. Jira no trae ni el FTE ni el coste: los indica el consultor
// desde la herramienta de plantilla, el contrato del proveedor o finanzas. Siempre por equipo, nunca por persona.
//
// El coste por entrega de cada equipo y del área, con su semáforo frente a la propia historia, lo calcula kpis.ts.
// Aquí están las cuentas del área y de los grupos (internos, cada proveedor, cada área).

import { SEMANAS_COMPARACION, type Comparacion } from './grupos.ts';
import type { ConfigCalculo } from './tipos.ts';

export interface Capacidad {
  /** Suma del FTE de los equipos; null si a algún equipo le falta. */
  fteTotal: number | null;
  /** Coste mensual de todos los equipos (FTE por coste de un FTE); null si a algún equipo le falta algo. */
  costeMes: number | null;
  /** Coste mensual medio de un FTE, ponderado por el FTE de cada equipo. */
  costeFteMedio: number | null;
  /** Equipos sin FTE o sin coste indicado. */
  faltan: string[];
}

const positivo = (x: number | undefined) => (x != null && x > 0 ? +x : null);

/** Capacidad y coste de un conjunto de equipos con lo indicado en la configuración. */
export function capacidadArea(cfg: Pick<ConfigCalculo, 'fte' | 'coste'>, equipos: string[]): Capacidad {
  const fte = cfg.fte || {}, coste = cfg.coste || {};
  let fteTotal = 0, costeMes = 0, sinFte = false, sinCoste = false;
  const faltan: string[] = [];
  for (const e of equipos) {
    const f = positivo(fte[e]), c = positivo(coste[e]);
    if (f == null) sinFte = true; else fteTotal += f;
    if (f == null || c == null) { sinCoste = true; faltan.push(e); } else costeMes += f * c;
  }
  const ft = !equipos.length || sinFte ? null : fteTotal;
  const cm = !equipos.length || sinCoste ? null : costeMes;
  return { fteTotal: ft, costeMes: cm, costeFteMedio: ft && cm != null ? cm / ft : null, faltan };
}

export interface CosteGrupo extends Capacidad {
  /** Tareas terminadas al mes en las semanas de la comparación. */
  entregasMes: number;
  /** Tareas terminadas al mes por FTE. */
  entregasPorFte: number | null;
  /** Coste mensual del grupo entre las tareas terminadas al mes. */
  costePorEntrega: number | null;
}

/**
 * Coste por grupo de una comparación (internos frente a proveedores, entre proveedores o dentro de un área).
 * Usa las mismas semanas que la comparación. No se segmenta por tipo ni tamaño: se lee junto al reparto del trabajo.
 */
export function costeDeGrupos(c: Comparacion, cfg: Pick<ConfigCalculo, 'fte' | 'coste'>): Record<string, CosteGrupo> {
  const out: Record<string, CosteGrupo> = {};
  for (const g of c.grupos) {
    const cap = capacidadArea(cfg, g.equipos);
    const entregasMes = (c.porGrupo[g.id] ? c.porGrupo[g.id].terminadas : 0) / SEMANAS_COMPARACION * 52 / 12;
    out[g.id] = {
      ...cap,
      entregasMes,
      entregasPorFte: cap.fteTotal ? entregasMes / cap.fteTotal : null,
      costePorEntrega: cap.costeMes != null && entregasMes > 0 ? cap.costeMes / entregasMes : null,
    };
  }
  return out;
}
