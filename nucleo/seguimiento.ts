// Seguimiento automático de iniciativas: en cada carga de datos se recalcula su estado, la serie semanal
// de la medida objetivo (equipos de la iniciativa frente al resto) y cuándo estará completa la evaluación.
// Se apoya en la evaluación de iniciativas.ts: no es un experimento controlado, dice si merece seguir.

import { DIA, sumarDias } from './util.ts';
import { fechaCorta, formatear } from './formato.ts';
import { LATENCIA_DIAS, MEDIDAS_INICIATIVA, medidaEnVentana, type EvaluacionIniciativa } from './iniciativas.ts';
import type { Preparacion } from './calcular.ts';
import type { Iniciativa } from './modelo.ts';

export type EstadoSeguimiento = 'planificada' | 'midiendo' | 'funciona' | 'sin_efecto' | 'empeora' | 'sin_datos';
export interface PuntoSeguimiento { fecha: Date; iniciativa: number | null; control: number | null }
export interface Seguimiento {
  id: string;
  estado: EstadoSeguimiento;
  /** Una frase con lo que se sabe hoy. */
  texto: string;
  medida: string;
  direccion: 'subir' | 'bajar';
  formato: string;
  inicio: Date;
  /** Desde cuándo se mide el después (inicio más dos semanas de margen). */
  desdeDespues: Date;
  /** Cuándo estará completa la ventana de después. */
  completaEl: Date;
  /** Parte de la ventana de después que ya tiene datos (0 a 1). */
  progreso: number;
  completa: boolean;
  antes: number | null;
  despues: number | null;
  control: { antes: number | null; despues: number | null } | null;
  confianza: 'baja' | 'media' | 'alta' | null;
  /** Medida semana a semana con la ventana de la iniciativa, para los equipos que participan y para el resto. */
  serie: PuntoSeguimiento[];
}

/** Confianza en texto. */
const CONFIANZA: Record<string, string> = { baja: 'low', media: 'medium', alta: 'high' };

/** Semanas de la serie antes del inicio. */
export const SEMANAS_PREVIAS = 12;

const fechaTxt = (d: Date): string => fechaCorta(d);

export function seguimiento(ini: Iniciativa, ev: EvaluacionIniciativa, p: Preparacion): Seguimiento {
  const fin = p.ctx.semanaFin;
  const mo = ini.medidas_objetivo[0];
  const def = MEDIDAS_INICIATIVA[mo.medida];
  const inicio = new Date(ini.fecha_inicio + 'T00:00:00');
  const W = (def ? def.semanas : 4) * 7;
  const desdeDespues = sumarDias(inicio, LATENCIA_DIAS);
  const completaEl = sumarDias(desdeDespues, W);
  const r = ev.resultados.find((x) => x.medida === mo.medida) || ev.resultados[0];
  const formato = def ? def.formato : 'num';
  const F = (v: number | null | undefined) => formatear(v, formato);
  const base = {
    id: ini.id, medida: mo.medida, direccion: mo.direccion, formato, inicio, desdeDespues, completaEl,
    progreso: fin <= desdeDespues ? 0 : Math.min(1, (fin.getTime() - desdeDespues.getTime()) / (W * DIA)),
    completa: !!(r && r.ventanas && r.ventanas.completa),
    antes: r && r.antes != null ? r.antes : null, despues: r && r.despues != null ? r.despues : null,
    control: r && r.control ? r.control : null, confianza: r && r.disponible ? r.confianza || null : null,
  };

  // Serie semanal: la medida en una ventana móvil del mismo tamaño que la de la evaluación
  const serie: PuntoSeguimiento[] = [];
  if (def) {
    const participan = ini.equipos.flatMap((e) => p.porEquipo[e] || []);
    const resto = Object.keys(p.porEquipo).filter((e) => !ini.equipos.includes(e)).flatMap((e) => p.porEquipo[e]);
    const desdeSerie = sumarDias(inicio, -7 * SEMANAS_PREVIAS);
    // Un punto por cada semana del cálculo, desde unas semanas antes del inicio hasta la última
    for (let w = 0; w < p.ctx.N; w++) {
      const t = p.ctx.finDe(w);
      if (t < desdeSerie || t.getTime() - W * DIA < p.ctx.semanas[0].getTime()) continue;
      const v = { desde: sumarDias(t, -W), hasta: t };
      serie.push({ fecha: t, iniciativa: medidaEnVentana(mo.medida, participan, v).valor, control: resto.length ? medidaEnVentana(mo.medida, resto, v).valor : null });
    }
  }

  if (!def) return { ...base, estado: 'sin_datos', texto: 'This measure cannot be tracked in an initiative.', serie };
  if (inicio >= fin) return { ...base, estado: 'planificada', texto: 'Starts on ' + fechaTxt(inicio) + '. The first reading comes two weeks later.', serie };
  if (!r || !r.disponible) {
    if (desdeDespues >= fin) return { ...base, estado: 'midiendo', texto: 'Running since ' + fechaTxt(inicio) + '. First reading from ' + fechaTxt(desdeDespues) + ', after a two-week margin for the change to show.', serie };
    return { ...base, estado: 'sin_datos', texto: (r && r.motivo) || 'Not enough tasks to measure it.', serie };
  }
  const cambio = F(r.antes) + ' to ' + F(r.despues) + (r.control && r.control.antes != null && r.control.despues != null ? '; in the other teams, from ' + F(r.control.antes) + ' to ' + F(r.control.despues) : '');
  const cola = r.ventanas && r.ventanas.completa ? ' Evaluation complete.' : ' Evaluation complete on ' + fechaTxt(completaEl) + '.';
  if (r.enDireccionEsperada === true && r.confianza !== 'baja') return { ...base, estado: 'funciona', texto: 'From ' + cambio + '. Confidence: ' + CONFIANZA[r.confianza!] + '.' + cola, serie };
  if (r.enDireccionEsperada === false && r.confianza !== 'baja') return { ...base, estado: 'empeora', texto: 'Going the wrong way: from ' + cambio + '. Confidence: ' + CONFIANZA[r.confianza!] + '.' + cola, serie };
  return { ...base, estado: 'sin_efecto', texto: 'No clear effect yet: from ' + cambio + '.' + cola, serie };
}
