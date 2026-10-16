// Iniciativas: antes y después con control (plan, apartado 8). Diferencia de diferencias simple.
// No es un experimento controlado: indica si merece la pena seguir, no demuestra la causa.

import { DIA, cuantil, desv, sumarDias } from './util.ts';
import type { Preparacion } from './calcular.ts';
import type { Derivada } from './tipos.ts';
import type { Iniciativa, MedidaObjetivo } from './modelo.ts';

export const LATENCIA_DIAS = 14;
/** Medidas que se pueden evaluar en una iniciativa y semanas de su ventana. */
export const MEDIDAS_INICIATIVA: Record<string, { semanas: number; formato: 'dias' | 'pct' | 'num' }> = {
  ciclo: { semanas: 4, formato: 'dias' }, total: { semanas: 4, formato: 'dias' }, entregas: { semanas: 4, formato: 'num' },
  espera: { semanas: 8, formato: 'pct' }, retrabajo: { semanas: 8, formato: 'pct' }, errores: { semanas: 8, formato: 'pct' },
  reabiertas: { semanas: 8, formato: 'pct' }, bloqueo: { semanas: 8, formato: 'pct' }, agent_readiness: { semanas: 8, formato: 'pct' },
};

export interface Ventana { desde: Date; hasta: Date }
export interface ResultadoMedida {
  medida: string;
  direccion: 'subir' | 'bajar';
  disponible: boolean;
  motivo?: string;
  antes?: number | null;
  despues?: number | null;
  control?: { antes: number | null; despues: number | null } | null;
  efecto?: number | null;
  confianza?: 'baja' | 'media' | 'alta';
  /** Lo que la medida suele variar sola en estos equipos (desviación entre ventanas anteriores al inicio). */
  ruido?: number | null;
  enDireccionEsperada?: boolean | null;
  muestra?: { antes: number; despues: number; controlAntes: number; controlDespues: number };
  ventanas?: { antes: Ventana; despues: Ventana; completa: boolean };
}
export interface EvaluacionIniciativa { id: string; fechaEvaluacion: Date; resultados: ResultadoMedida[] }

const enVentana = (d: Date | null, v: Ventana) => !!d && d >= v.desde && d < v.hasta;

/** Valor de una medida con las tareas de un grupo en una ventana, y tamaño de la muestra. */
export function medidaEnVentana(medida: string, items: Derivada[], v: Ventana, listoDesde = 4): { valor: number | null; n: number } {
  const terminadas = items.filter((d) => d.entregada && enVentana(d.t.fechas.terminada, v));
  const semanas = (v.hasta.getTime() - v.desde.getTime()) / (7 * DIA);
  const prop = (base: Derivada[], f: (d: Derivada) => boolean) => ({ valor: base.length >= 5 ? base.filter(f).length / base.length : null, n: base.length });
  switch (medida) {
    case 'ciclo': { const c = terminadas.filter((d) => d.ciclo != null).map((d) => d.ciclo!); return { valor: c.length >= 5 ? cuantil(c, 0.85) : null, n: c.length }; }
    case 'total': { const c = terminadas.map((d) => d.total!); return { valor: c.length >= 5 ? cuantil(c, 0.85) : null, n: c.length }; }
    case 'entregas': return { valor: semanas > 0 ? terminadas.length / semanas : null, n: terminadas.length };
    case 'espera': {
      const c = terminadas.filter((d) => d.ciclo != null);
      let e = 0, t = 0;
      c.forEach((d) => { e += d.esperaMs; t += d.cursoMs + d.esperaMs; });
      return { valor: c.length >= 5 && t ? e / t : null, n: c.length };
    }
    case 'retrabajo': return prop(terminadas.filter((d) => d.conTiempos), (d) => d.retrabajo);
    case 'errores': return prop(terminadas, (d) => d.t.tipo === 'error');
    case 'reabiertas': return prop(terminadas, (d) => d.reabierta);
    case 'bloqueo': {
      const c = terminadas.filter((d) => d.conTiempos);
      let b = 0, t = 0;
      c.forEach((d) => { b += d.bloqueoMs; t += d.cursoMs + d.esperaMs; });
      return { valor: c.length >= 5 && t ? b / t : null, n: c.length };
    }
    case 'agent_readiness': return prop(items.filter((d) => !d.descartada && enVentana(d.t.fechas.creada, v)), (d) => d.ar.indice >= listoDesde);
    default: return { valor: null, n: 0 };
  }
}

const restar = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);

export function evaluarIniciativa(ini: Iniciativa, p: Preparacion): EvaluacionIniciativa {
  const fin = p.ctx.semanaFin;
  const inicio = new Date(ini.fecha_inicio + 'T00:00:00');
  const limite = ini.fecha_fin ? new Date(Math.min(new Date(ini.fecha_fin + 'T00:00:00').getTime() + DIA, fin.getTime())) : fin;
  const participan = ini.equipos.flatMap((e) => p.porEquipo[e] || []);
  const control = Object.keys(p.porEquipo).filter((e) => !ini.equipos.includes(e)).flatMap((e) => p.porEquipo[e]);
  const resultados = ini.medidas_objetivo.map((mo: MedidaObjetivo): ResultadoMedida => {
    const def = MEDIDAS_INICIATIVA[mo.medida];
    const base = { medida: mo.medida, direccion: mo.direccion };
    if (!def) return { ...base, disponible: false, motivo: 'Esta medida no se puede evaluar en una iniciativa.' };
    if (!participan.length) return { ...base, disponible: false, motivo: 'Los equipos de la iniciativa no están en los datos.' };
    const W = def.semanas * 7;
    const antes: Ventana = { desde: sumarDias(inicio, -W), hasta: inicio };
    const desdeDespues = sumarDias(inicio, LATENCIA_DIAS);
    if (desdeDespues >= limite) return { ...base, disponible: false, motivo: 'Aún no hay datos después de la latencia de dos semanas.' };
    const hastaDespues = new Date(Math.min(sumarDias(desdeDespues, W).getTime(), limite.getTime()));
    const despues: Ventana = { desde: desdeDespues, hasta: hastaDespues };
    const completa = hastaDespues.getTime() - desdeDespues.getTime() >= W * DIA - 36e5;
    const a = medidaEnVentana(mo.medida, participan, antes), d = medidaEnVentana(mo.medida, participan, despues);
    const ca = medidaEnVentana(mo.medida, control, antes), cd = medidaEnVentana(mo.medida, control, despues);
    const cambio = restar(d.valor, a.valor), cambioControl = control.length ? restar(cd.valor, ca.valor) : 0;
    const efecto = restar(cambio, cambioControl);
    // Variabilidad histórica: la medida en ventanas seguidas de la misma longitud antes de empezar
    const historicos: number[] = [];
    for (let k = 1; k <= 6; k++) {
      const v = { desde: sumarDias(inicio, -W * (k + 1)), hasta: sumarDias(inicio, -W * k) };
      const x = medidaEnVentana(mo.medida, participan, v).valor;
      if (x != null) historicos.push(x);
    }
    const ruido = historicos.length >= 3 ? desv(historicos) : null;
    const nMin = Math.min(a.n, d.n);
    let confianza: 'baja' | 'media' | 'alta' = 'baja';
    if (efecto != null && ruido != null && ruido > 0) {
      const veces = Math.abs(efecto) / ruido;
      if (veces >= 2 && nMin >= 20 && completa) confianza = 'alta';
      else if (veces >= 1 && nMin >= 10) confianza = 'media';
    }
    const enDireccion = efecto == null ? null : (mo.direccion === 'bajar' ? efecto < 0 : efecto > 0);
    return {
      ...base, disponible: a.valor != null && d.valor != null,
      ...(a.valor == null || d.valor == null ? { motivo: 'No hay tareas suficientes en alguna de las dos ventanas.' } : {}),
      antes: a.valor, despues: d.valor, control: control.length ? { antes: ca.valor, despues: cd.valor } : null,
      efecto, confianza, ruido, enDireccionEsperada: enDireccion,
      muestra: { antes: a.n, despues: d.n, controlAntes: ca.n, controlDespues: cd.n },
      ventanas: { antes, despues, completa },
    };
  });
  return { id: ini.id, fechaEvaluacion: fin, resultados };
}

/** ¿La iniciativa muestra efecto en la dirección esperada con al menos confianza media? */
export function conEfecto(e: EvaluacionIniciativa): boolean {
  return e.resultados.some((r) => r.disponible && r.enDireccionEsperada === true && r.confianza !== 'baja');
}

