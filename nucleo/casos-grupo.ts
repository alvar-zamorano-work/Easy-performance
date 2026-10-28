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

const NOMBRE_DIMENSION = { tipo: 'in-house versus vendors', proveedor: 'between vendors', area: 'teams in the area' } as const;

export function casosDeGrupo(comparaciones: Comparacion[]): CasoGrupo[] {
  const out: CasoGrupo[] = [];
  for (const c of comparaciones) {
    const nombre = (id: string) => c.grupos.find((g) => g.id === id)?.nombre || id;
    const donde = NOMBRE_DIMENSION[c.dimension] + (c.ambito ? ' (' + c.ambito + ')' : '');
    const plazo = c.diferencias.find((d) => d.medida === 'plazo_p85');
    if (plazo && plazo.peor) {
      const rel = plazo.valorResto ? plazo.valorPeor! / plazo.valorResto - 1 : null;
      out.push({ id: 'grupo_plazo', dimension: c.dimension, ambito: c.ambito, grupo: plazo.peor, gravedad: rel != null && rel >= 0.5 ? 'critico' : 'atencion',
        evidencia: `In ${nombre(plazo.peor)}, what gets started is almost certainly done in ${f(plazo.valorPeor, 'dias')} or less; in the rest, in ${f(plazo.valorResto, 'dias')}. The difference holds within the same task type and size (${plazo.segmentosConDiferencia} of ${plazo.segmentosComparables} segments). Comparison: ${donde}.`,
        datos: { valor: plazo.valorPeor, resto: plazo.valorResto, segmentos: plazo.segmentosComparables } });
    }
    const calidad = c.diferencias.filter((d) => d.medida === 'retrabajo' || d.medida === 'reabiertas');
    const porGrupo = new Map<string, typeof calidad>();
    calidad.forEach((d) => { if (d.peor) porGrupo.set(d.peor, [...(porGrupo.get(d.peor) || []), d]); });
    for (const [g, ds] of porGrupo) {
      const partes = ds.map((d) => `${f(d.valorPeor, 'pct')} of done work ${d.medida === 'retrabajo' ? 'goes back' : 'is reopened'} (in the rest, ${f(d.valorResto, 'pct')})`);
      out.push({ id: 'grupo_calidad', dimension: c.dimension, ambito: c.ambito, grupo: g, gravedad: ds.length >= 2 ? 'critico' : 'atencion',
        evidencia: `In ${nombre(g)}, ${partes.join(' and ')}, within the same task type and size. Comparison: ${donde}.`,
        datos: Object.fromEntries(ds.flatMap((d) => [[d.medida, d.valorPeor], [d.medida + '_resto', d.valorResto]])) });
    }
    const ar = diferenciaAgentReady(c);
    if (ar) {
      out.push({ id: 'grupo_agent_ready', dimension: c.dimension, ambito: c.ambito, grupo: ar.peor, gravedad: ar.listos < 0.25 ? 'critico' : 'atencion',
        evidencia: `In ${nombre(ar.peor)}, ${f(ar.listos, 'pct')} of new tickets are ready for an AI agent; in the rest, ${f(ar.resto, 'pct')}. Comparison: ${donde}.`,
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
      evidencia: `Only ${f(ar.valor, 'pct')} of the tickets created in the last 12 weeks are ready for an AI agent.`, datos: { listos: ar.valor } });
  }
  return out;
}
