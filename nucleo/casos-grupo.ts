// Casos nuevos de B3 que no existían en la v0: diferencias entre grupos y backlog no listo para agentes.
// Van aparte de evaluarCasos para que los casos de cada equipo sigan siendo los de la v0.

import { formatear as f } from './formato.ts';
import { diferenciaAgentReady, type Comparacion } from './grupos.ts';
import type { Gravedad, Modelo } from './tipos.ts';

export interface CasoGrupo {
  id: 'grupo_plazo' | 'grupo_calidad' | 'grupo_agent_ready';
  dimension: Comparacion['dimension'];
  ambito: string | null;
  grupo: string;
  gravedad: Gravedad;
  evidencia: string;
  datos: Record<string, number | string | null>;
}

const NOMBRE_DIMENSION = { tipo: 'internos frente a proveedores', proveedor: 'entre proveedores', area: 'equipos del área' } as const;

export function casosDeGrupo(comparaciones: Comparacion[]): CasoGrupo[] {
  const out: CasoGrupo[] = [];
  for (const c of comparaciones) {
    const nombre = (id: string) => c.grupos.find((g) => g.id === id)?.nombre || id;
    const donde = NOMBRE_DIMENSION[c.dimension] + (c.ambito ? ' (' + c.ambito + ')' : '');
    const plazo = c.diferencias.find((d) => d.medida === 'plazo_p80');
    if (plazo && plazo.peor) {
      const rel = plazo.valorResto ? plazo.valorPeor! / plazo.valorResto - 1 : null;
      out.push({ id: 'grupo_plazo', dimension: c.dimension, ambito: c.ambito, grupo: plazo.peor, gravedad: rel != null && rel >= 0.5 ? 'critico' : 'atencion',
        evidencia: `En ${nombre(plazo.peor)}, 8 de cada 10 tareas se terminan en ${f(plazo.valorPeor, 'dias')}; en el resto, en ${f(plazo.valorResto, 'dias')}. La diferencia se mantiene dentro del mismo tipo y tamaño de tarea (${plazo.segmentosConDiferencia} de ${plazo.segmentosComparables} segmentos). Comparación: ${donde}.`,
        datos: { valor: plazo.valorPeor, resto: plazo.valorResto, segmentos: plazo.segmentosComparables } });
    }
    const calidad = c.diferencias.filter((d) => d.medida === 'retrabajo' || d.medida === 'reabiertas');
    const porGrupo = new Map<string, typeof calidad>();
    calidad.forEach((d) => { if (d.peor) porGrupo.set(d.peor, [...(porGrupo.get(d.peor) || []), d]); });
    for (const [g, ds] of porGrupo) {
      const partes = ds.map((d) => `${d.medida === 'retrabajo' ? 'vuelve atrás' : 'se reabre'} el ${f(d.valorPeor, 'pct')} de lo terminado (en el resto, el ${f(d.valorResto, 'pct')})`);
      out.push({ id: 'grupo_calidad', dimension: c.dimension, ambito: c.ambito, grupo: g, gravedad: ds.length >= 2 ? 'critico' : 'atencion',
        evidencia: `En ${nombre(g)} ${partes.join(' y ')}, dentro del mismo tipo y tamaño de tarea. Comparación: ${donde}.`,
        datos: Object.fromEntries(ds.flatMap((d) => [[d.medida, d.valorPeor], [d.medida + '_resto', d.valorResto]])) });
    }
    const ar = diferenciaAgentReady(c);
    if (ar) {
      out.push({ id: 'grupo_agent_ready', dimension: c.dimension, ambito: c.ambito, grupo: ar.peor, gravedad: ar.listos < 0.25 ? 'critico' : 'atencion',
        evidencia: `En ${nombre(ar.peor)} está listo para un agente el ${f(ar.listos, 'pct')} de los tickets nuevos; en el resto, el ${f(ar.resto, 'pct')}. Comparación: ${donde}.`,
        datos: { listos: ar.listos, resto: ar.resto } });
    }
  }
  return out;
}

export interface CasoEquipoNuevo { equipo: string; id: 'backlog_no_listo'; gravedad: Gravedad; evidencia: string; datos: Record<string, number> }

/** Backlog no listo para agentes, por equipo, a partir de la medida agent_readiness. */
export function casosAgentReady(m: Modelo): CasoEquipoNuevo[] {
  const out: CasoEquipoNuevo[] = [];
  for (const e of m.equipos) {
    const ar = e.medidas.agent_readiness;
    if (!ar || !ar.disponible || ar.valor == null || ar.valor >= 0.5) continue;
    out.push({ equipo: e.nombre, id: 'backlog_no_listo', gravedad: ar.valor < 0.25 ? 'critico' : 'atencion',
      evidencia: `Solo el ${f(ar.valor, 'pct')} de los tickets creados en las últimas 12 semanas está listo para un agente.`, datos: { listos: ar.valor } });
  }
  return out;
}
