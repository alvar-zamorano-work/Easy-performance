// Comparaciones entre grupos (plan, apartado 7): internos frente a proveedores, proveedor frente a proveedor
// y equipos de una misma área. Solo medidas normalizadas, nunca volumen bruto ni personas.
// Las medidas de lo terminado se comparan dentro del mismo tipo y tamaño de tarea, con una muestra mínima por celda.

import { DIA, cuantil, sumarDias } from './util.ts';
import { RUBRICA, agregar, type AgregadoAR } from './agent-readiness.ts';
import { DELTA_MIN } from './semaforo.ts';
import type { Preparacion } from './calcular.ts';
import type { Derivada } from './tipos.ts';
import type { Equipo, TipoTarea } from './modelo.ts';

export const MUESTRA_MINIMA = 20;
export const SEMANAS_COMPARACION = 12;
/** Diferencia relativa a partir de la que se habla de diferencia entre grupos. */
export const DIFERENCIA_MINIMA = 0.25;

export type Dimension = 'tipo' | 'proveedor' | 'area';
export type Tamano = 'pequena' | 'media' | 'grande' | 'sin_estimar';
export type MedidaComparable = 'plazo_p85' | 'retrabajo' | 'reabiertas' | 'bloqueo' | 'arrastradas';
export const MEDIDAS_SEGMENTADAS: MedidaComparable[] = ['plazo_p85', 'retrabajo', 'reabiertas', 'bloqueo', 'arrastradas'];
/** Todas son "mejor cuanto más bajo". */
const DELTA: Record<MedidaComparable, number> = { plazo_p85: DELTA_MIN.ciclo, retrabajo: 0.05, reabiertas: 0.03, bloqueo: 0.05, arrastradas: 0.05 };

export interface Grupo { id: string; nombre: string; equipos: string[] }
export interface Celda { n: number; valor: number | null }
export interface Segmento { tipo: TipoTarea | 'todos'; tamano: Tamano | 'todos'; porGrupo: Record<string, Celda> }
export interface Diferencia {
  medida: MedidaComparable;
  /** Grupo que sale peor frente al resto, si la diferencia se repite en los segmentos comparables. */
  peor: string | null;
  segmentosComparables: number;
  segmentosConDiferencia: number;
  /** Valor del grupo peor y del resto, en el total. */
  valorPeor: number | null;
  valorResto: number | null;
}
export interface Comparacion {
  dimension: Dimension;
  /** Para "area", el área cuyos equipos se comparan. */
  ambito: string | null;
  grupos: Grupo[];
  desde: Date;
  hasta: Date;
  medidas: Record<MedidaComparable, { disponible: boolean; segmentos: Segmento[] }>;
  porGrupo: Record<string, {
    terminadas: number;
    antiguedadPendiente: number | null;
    throughputFte: number | null;
    fte: { total: number | null; origen: string[] };
    agentReady: AgregadoAR;
  }>;
  reparto: Record<string, { porTipo: Record<string, number>; porTamano: Record<string, number> }>;
  diferencias: Diferencia[];
}

export function tamanoDe(d: Derivada): Tamano {
  const e = d.t.estimacion;
  if (e == null) return 'sin_estimar';
  return e <= 2 ? 'pequena' : e <= 5 ? 'media' : 'grande';
}

function valorMedida(m: MedidaComparable, ds: Derivada[]): Celda {
  if (m === 'plazo_p85') {
    const cs = ds.filter((d) => d.ciclo != null).map((d) => d.ciclo!);
    return { n: cs.length, valor: cs.length >= MUESTRA_MINIMA ? cuantil(cs, 0.85) : null };
  }
  const base = m === 'retrabajo' || m === 'bloqueo' ? ds.filter((d) => d.conTiempos) : ds;
  const n = base.length;
  if (n < MUESTRA_MINIMA) return { n, valor: null };
  if (m === 'retrabajo') return { n, valor: base.filter((d) => d.retrabajo).length / n };
  if (m === 'reabiertas') return { n, valor: base.filter((d) => d.reabierta).length / n };
  if (m === 'arrastradas') return { n, valor: base.filter((d) => d.t.sprints.length > 1).length / n };
  let bl = 0, tot = 0;
  base.forEach((d) => { bl += d.bloqueoMs; tot += d.cursoMs + d.esperaMs; });
  return { n, valor: tot ? bl / tot : null };
}

const MINIMO_ESTRATO = 5;

/** Suma de rangos de a dentro de a+b, con empates promediados. */
function sumaRangos(a: number[], b: number[]): number {
  const todos = [...a.map((v) => [v, 0] as const), ...b.map((v) => [v, 1] as const)].sort((x, y) => x[0] - y[0]);
  let ra = 0;
  for (let i = 0; i < todos.length;) {
    let j = i;
    while (j + 1 < todos.length && todos[j + 1][0] === todos[i][0]) j++;
    const rango = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (todos[k][1] === 0) ra += rango;
    i = j + 1;
  }
  return ra;
}

const parteBloqueo = (d: Derivada) => (d.cursoMs + d.esperaMs ? d.bloqueoMs / (d.cursoMs + d.esperaMs) : 0);
function continua(m: MedidaComparable): ((d: Derivada) => number | null) | null {
  if (m === 'plazo_p85') return (d) => (d.ciclo != null ? d.ciclo : null);
  if (m === 'bloqueo') return (d) => (d.conTiempos ? parteBloqueo(d) : null);
  return null;
}
function binaria(m: MedidaComparable): (d: Derivada) => boolean | null {
  if (m === 'retrabajo') return (d) => (d.conTiempos ? d.retrabajo : null);
  if (m === 'reabiertas') return (d) => d.reabierta;
  return (d) => d.t.sprints.length > 1;
}

/**
 * Grupo a frente a b dentro de los mismos segmentos (tipo y tamaño). Para tiempos, Mann-Whitney estratificado
 * (van Elteren con pesos iguales); para proporciones, Cochran-Mantel-Haenszel. z > 0 si a sale peor (más alto).
 */
export function diferenciaEstratificada(m: MedidaComparable, a: Derivada[], b: Derivada[]) {
  const clave = (d: Derivada) => d.t.tipo + '|' + tamanoDe(d);
  const seg = new Map<string, [Derivada[], Derivada[]]>();
  a.forEach((d) => { const k = clave(d); if (!seg.has(k)) seg.set(k, [[], []]); seg.get(k)![0].push(d); });
  b.forEach((d) => { const k = clave(d); if (!seg.has(k)) seg.set(k, [[], []]); seg.get(k)![1].push(d); });
  let num = 0, varianza = 0, estratos = 0, estratosPeor = 0, sumaDif = 0, sumaBase = 0;
  const fc = continua(m), fb = binaria(m);
  for (const [sa, sb] of seg.values()) {
    if (fc) {
      const xa = sa.map(fc).filter((v): v is number => v != null), xb = sb.map(fc).filter((v): v is number => v != null);
      const n1 = xa.length, n2 = xb.length;
      if (n1 < MINIMO_ESTRATO || n2 < MINIMO_ESTRATO) continue;
      num += sumaRangos(xa, xb) - n1 * (n1 + n2 + 1) / 2;
      varianza += n1 * n2 * (n1 + n2 + 1) / 12;
      const va = m === 'plazo_p85' ? cuantil(xa, 0.85)! : xa.reduce((s, v) => s + v, 0) / n1;
      const vb = m === 'plazo_p85' ? cuantil(xb, 0.85)! : xb.reduce((s, v) => s + v, 0) / n2;
      const w = Math.min(n1, n2);
      sumaDif += w * (va - vb); sumaBase += w * vb; estratos++;
      if (vb && (va - vb) / vb >= DIFERENCIA_MINIMA) estratosPeor++;
    } else {
      const xa = sa.map(fb).filter((v): v is boolean => v != null), xb = sb.map(fb).filter((v): v is boolean => v != null);
      const n1 = xa.length, n2 = xb.length, n = n1 + n2;
      if (n1 < MINIMO_ESTRATO || n2 < MINIMO_ESTRATO) continue;
      const k1 = xa.filter(Boolean).length, k = k1 + xb.filter(Boolean).length;
      num += k1 - n1 * k / n;
      if (n > 1) varianza += n1 * n2 * k * (n - k) / (n * n * (n - 1));
      const pa = k1 / n1, pb = (k - k1) / n2, w = Math.min(n1, n2);
      sumaDif += w * (pa - pb); sumaBase += w * pb; estratos++;
      if (pb ? (pa - pb) / pb >= DIFERENCIA_MINIMA : pa > 0) estratosPeor++;
    }
  }
  if (!estratos || !varianza) return null;
  const pesos = [...seg.values()].filter(([sa, sb]) => sa.length >= MINIMO_ESTRATO && sb.length >= MINIMO_ESTRATO).reduce((s, [sa, sb]) => s + Math.min(sa.length, sb.length), 0);
  return {
    z: num / Math.sqrt(varianza),
    absoluta: pesos ? sumaDif / pesos : 0,
    relativa: sumaBase ? sumaDif / sumaBase : (sumaDif > 0 ? Infinity : 0),
    estratos, estratosPeor,
  };
}

/** Grupos de cada dimensión según los equipos del cliente. Solo se compara donde hay al menos dos grupos. */
export function gruposDe(equipos: Equipo[], dimension: Dimension): { ambito: string | null; grupos: Grupo[] }[] {
  const nombres = (f: (e: Equipo) => boolean) => equipos.filter(f).map((e) => e.nombre);
  if (dimension === 'tipo') {
    const g = [
      { id: 'interno', nombre: 'In-house', equipos: nombres((e) => e.tipo === 'interno') },
      { id: 'proveedor', nombre: 'Vendors', equipos: nombres((e) => e.tipo === 'proveedor') },
    ].filter((x) => x.equipos.length);
    return g.length >= 2 ? [{ ambito: null, grupos: g }] : [];
  }
  if (dimension === 'proveedor') {
    const provs = [...new Set(equipos.filter((e) => e.tipo === 'proveedor' && e.proveedor).map((e) => e.proveedor!))].sort((a, b) => a.localeCompare(b, 'en'));
    return provs.length >= 2 ? [{ ambito: null, grupos: provs.map((p) => ({ id: p, nombre: p, equipos: nombres((e) => e.proveedor === p) })) }] : [];
  }
  const areas = [...new Set(equipos.filter((e) => e.area).map((e) => e.area!))].sort((a, b) => a.localeCompare(b, 'en'));
  return areas.map((a) => ({ ambito: a, grupos: equipos.filter((e) => e.area === a).map((e) => ({ id: e.nombre, nombre: e.nombre, equipos: [e.nombre] })) }))
    .filter((x) => x.grupos.length >= 2);
}

const ultimoFte = (e: Equipo) => e.fte.slice().sort((a, b) => a.periodo.localeCompare(b.periodo)).pop() || null;

export function comparar(p: Preparacion, equipos: Equipo[], dimension: Dimension, ambito: string | null, grupos: Grupo[]): Comparacion {
  const hasta = p.ctx.semanaFin, desde = sumarDias(hasta, -7 * SEMANAS_COMPARACION);
  const sprintsFiables = p.ctx.det.haySprints && !p.ctx.det.sprintsComoFecha;
  const items: Record<string, Derivada[]> = {}, terminadas: Record<string, Derivada[]> = {};
  grupos.forEach((g) => {
    items[g.id] = g.equipos.flatMap((e) => p.porEquipo[e] || []);
    terminadas[g.id] = items[g.id].filter((d) => d.entregada && d.t.fechas.terminada! >= desde && d.t.fechas.terminada! < hasta);
  });
  const tipos = [...new Set(grupos.flatMap((g) => terminadas[g.id].map((d) => d.t.tipo)))].sort() as TipoTarea[];
  const tamanos: Tamano[] = ['pequena', 'media', 'grande', 'sin_estimar'];

  const medidas = {} as Comparacion['medidas'];
  for (const m of MEDIDAS_SEGMENTADAS) {
    const disponible = m === 'arrastradas' ? sprintsFiables : m === 'plazo_p85' || m === 'retrabajo' || m === 'bloqueo' ? p.ctx.det.hayTiempos : true;
    const segmentos: Segmento[] = [];
    const celda = (filtro: (d: Derivada) => boolean) => Object.fromEntries(grupos.map((g) => [g.id, valorMedida(m, terminadas[g.id].filter(filtro))]));
    segmentos.push({ tipo: 'todos', tamano: 'todos', porGrupo: celda(() => true) });
    for (const ti of tipos) for (const ta of tamanos) {
      const pg = celda((d) => d.t.tipo === ti && tamanoDe(d) === ta);
      if (Object.values(pg).some((c) => c.n > 0)) segmentos.push({ tipo: ti, tamano: ta, porGrupo: pg });
    }
    medidas[m] = { disponible, segmentos };
  }

  const porGrupo: Comparacion['porGrupo'] = {};
  const reparto: Comparacion['reparto'] = {};
  grupos.forEach((g) => {
    const ts = terminadas[g.id];
    const pendientes = items[g.id].filter((d) => d.t.fechas.creada < hasta && (!d.t.fechas.terminada || d.t.fechas.terminada >= hasta) && !(d.inicio && d.inicio < hasta));
    const eqs = equipos.filter((e) => g.equipos.includes(e.nombre));
    const ftes = eqs.map(ultimoFte);
    const fteTotal = ftes.every((f) => f) ? ftes.reduce((s, f) => s + f!.valor, 0) : null;
    const creadas = items[g.id].filter((d) => !d.descartada && d.t.fechas.creada >= desde && d.t.fechas.creada < hasta);
    porGrupo[g.id] = {
      terminadas: ts.length,
      antiguedadPendiente: pendientes.length >= 3 ? cuantil(pendientes.map((d) => (hasta.getTime() - d.t.fechas.creada.getTime()) / DIA), 0.5) : null,
      throughputFte: fteTotal ? ts.length / SEMANAS_COMPARACION * 52 / 12 / fteTotal : null,
      fte: { total: fteTotal, origen: [...new Set(ftes.filter(Boolean).map((f) => f!.origen))] },
      agentReady: agregar(creadas.map((d) => d.ar), RUBRICA),
    };
    const porTipo: Record<string, number> = {}, porTamano: Record<string, number> = {};
    ts.forEach((d) => { porTipo[d.t.tipo] = (porTipo[d.t.tipo] || 0) + 1; porTamano[tamanoDe(d)] = (porTamano[tamanoDe(d)] || 0) + 1; });
    Object.keys(porTipo).forEach((k) => { porTipo[k] /= ts.length; });
    Object.keys(porTamano).forEach((k) => { porTamano[k] /= ts.length; });
    reparto[g.id] = { porTipo, porTamano };
  });

  // Diferencias: cada grupo frente al resto, con una prueba estratificada por tipo y tamaño de tarea
  // (así un reparto de trabajo distinto no fabrica diferencias). Cuenta si es clara (z >= 2) y relevante
  // (al menos un 25% peor dentro de los mismos segmentos).
  const diferencias: Diferencia[] = [];
  for (const m of MEDIDAS_SEGMENTADAS) {
    if (!medidas[m].disponible) continue;
    for (const g of grupos) {
      const resto = grupos.filter((x) => x.id !== g.id).flatMap((x) => terminadas[x.id]);
      const r = diferenciaEstratificada(m, terminadas[g.id], resto);
      if (r && r.z >= 2 && r.relativa >= DIFERENCIA_MINIMA && r.absoluta > DELTA[m]) {
        diferencias.push({ medida: m, peor: g.id, segmentosComparables: r.estratos, segmentosConDiferencia: r.estratosPeor,
          valorPeor: valorMedida(m, terminadas[g.id]).valor, valorResto: valorMedida(m, resto).valor });
      }
    }
  }
  return { dimension, ambito, grupos, desde, hasta, medidas, porGrupo, reparto, diferencias };
}

/** Todas las comparaciones posibles con los equipos del cliente. */
export function compararTodo(p: Preparacion, equipos: Equipo[]): Comparacion[] {
  const out: Comparacion[] = [];
  for (const dim of ['tipo', 'proveedor', 'area'] as Dimension[]) {
    for (const { ambito, grupos } of gruposDe(equipos, dim)) out.push(comparar(p, equipos, dim, ambito, grupos));
  }
  return out;
}

/** Diferencia de agent readiness: un grupo con bastantes menos tickets listos que el resto. */
export function diferenciaAgentReady(c: Comparacion): { peor: string; listos: number; resto: number } | null {
  let peor: { peor: string; listos: number; resto: number } | null = null;
  for (const g of c.grupos) {
    const a = c.porGrupo[g.id].agentReady;
    const otros = c.grupos.filter((x) => x.id !== g.id).map((x) => c.porGrupo[x.id].agentReady);
    const tickets = otros.reduce((s, o) => s + o.tickets, 0);
    if (a.tickets < MUESTRA_MINIMA || tickets < MUESTRA_MINIMA || a.listos == null) continue;
    const resto = otros.reduce((s, o) => s + (o.listos || 0) * o.tickets, 0) / tickets;
    if (resto - a.listos >= 0.15 && a.listos <= resto * (1 - DIFERENCIA_MINIMA) && (!peor || a.listos < peor.listos)) peor = { peor: g.id, listos: a.listos, resto };
  }
  return peor;
}
