// Sprints: si son fiables y cómo fueron los tres últimos (arrastre y cierres al final).

import { Tx } from './idioma.ts';
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
  const out: InfoSprints = { fiables: false, motivo: Tx('The export has no sprints.', 'El export no trae sprints.'), ultimos: [] };
  if (!c.det.haySprints) return out;
  if (c.det.sprintsSoloActual) { out.motivo = Tx('The export only has the current sprint of each task: carry-over between sprints cannot be measured.', 'El export solo trae el sprint actual de cada tarea: no se puede medir lo que pasa de un sprint a otro.'); return out; }
  if (c.det.sprintsComoFecha) { out.motivo = Tx('Sprint names look like dates, not real sprints.', 'Los nombres de sprint parecen fechas, no sprints de verdad.'); return out; }
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
  if (!recientes.length || conSprint / recientes.length < 0.5) { out.motivo = Tx('Less than half of recent work is in sprints.', 'Menos de la mitad del trabajo reciente está en sprints.'); return out; }
  const semanasSpan = Math.max(1, (c.fechaRef.getTime() - c.det.fechaMin.getTime()) / (7 * DIA));
  // Sprints por equipo de origen: en la visión del área cada equipo tiene los suyos y no se suman
  const porOrigen: Record<string, Set<string>> = {};
  lista.forEach((x) => x.tareas.forEach((y) => { (porOrigen[y.d.equipoOrigen] = porOrigen[y.d.equipoOrigen] || new Set()).add(x.nombre); }));
  const maxPorEquipo = Math.max(0, ...Object.values(porOrigen).map((st) => st.size));
  if (maxPorEquipo > semanasSpan + 2) { out.motivo = Tx('There are more sprints than weeks: they do not look like real sprints.', 'Hay más sprints que semanas: no parecen sprints de verdad.'); return out; }
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
