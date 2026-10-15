// Sprints: si son fiables y cómo fueron los tres últimos (arrastre y cierres al final).

import { DIA, cuantil, diaLaborableAnterior, sumarDias } from './util.ts';
import type { ContextoCalculo, Derivada, InfoSprints } from './tipos.ts';

interface Acumulado {
  nombre: string;
  tareas: { d: Derivada; ultimo: boolean }[];
  cierres: Date[];
  fin?: Date;
  medio?: number;
}

export function analizarSprints(items: Derivada[], c: ContextoCalculo): InfoSprints {
  const out: InfoSprints = { fiables: false, motivo: 'El export no trae sprints.', ultimos: [] };
  if (!c.det.haySprints) return out;
  if (c.det.sprintsComoFecha) { out.motivo = 'Los nombres de sprint parecen fechas, no sprints de verdad.'; return out; }
  const porSprint: Record<string, Acumulado> = {};
  items.forEach((d) => {
    d.t.sprints.forEach((sp, i) => {
      const x = porSprint[sp] = porSprint[sp] || { nombre: sp, tareas: [], cierres: [] };
      x.tareas.push({ d, ultimo: i === d.t.sprints.length - 1 });
      if (i === d.t.sprints.length - 1 && d.entregada) x.cierres.push(d.t.fechas.terminada!);
    });
  });
  const lista = Object.keys(porSprint).map((k) => porSprint[k]).filter((x) => x.cierres.length >= 3);
  const recientes = items.filter((d) => d.entregada && d.t.fechas.terminada! >= sumarDias(c.semanaFin, -84));
  const conSprint = recientes.filter((d) => d.t.sprints.length).length;
  if (!recientes.length || conSprint / recientes.length < 0.5) { out.motivo = 'Menos de la mitad del trabajo reciente está en sprints.'; return out; }
  const semanasSpan = Math.max(1, (c.fechaRef.getTime() - c.det.fechaMin.getTime()) / (7 * DIA));
  if (lista.length > semanasSpan + 2) { out.motivo = 'Hay más sprints que semanas: no parecen sprints de verdad.'; return out; }
  out.fiables = true;
  out.motivo = null;
  lista.forEach((x) => {
    const cierres = x.cierres.map((d) => d.getTime());
    x.fin = new Date(Math.max(...cierres));
    x.medio = cuantil(cierres, 0.5)!;
  });
  lista.sort((a, b) => a.medio! - b.medio!);
  const completados = lista.filter((x) => x.fin! < sumarDias(c.semanaFin, -1));
  out.ultimos = completados.slice(-3).map((x) => {
    const arrastradas = x.tareas.filter((y) => !y.ultimo).length;
    const desde = diaLaborableAnterior(x.fin!, 1);
    const finales = x.cierres.filter((d) => d >= desde).length;
    return { nombre: x.nombre, tareas: x.tareas.length, arrastre: x.tareas.length ? arrastradas / x.tareas.length : null,
      alFinal: x.cierres.length ? finales / x.cierres.length : null, cerradas: x.cierres.length, fin: x.fin! };
  });
  return out;
}
