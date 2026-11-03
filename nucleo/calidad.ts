// Calidad del dato por equipo: saltos de estado, cierres en bloque, registro a posteriori, historias sin puntos.

import { Tx } from './idioma.ts';
import { cuantil, sumarDias } from './util.ts';
import { fechaCorta } from './formato.ts';
import type { CalidadEquipo, CierreEnBloque, ContextoCalculo, Deteccion, Derivada, InfoSprints } from './tipos.ts';
import type { Tarea } from './modelo.ts';

/** Minutos en los que se cerraron 10 o más tareas a la vez. */
export function cierresEnBloque(tareas: Tarea[]): CierreEnBloque[] {
  const porMinuto: Record<string, number> = {};
  tareas.forEach((t) => {
    if (!t.fechas.terminada) return;
    const k = Math.floor(t.fechas.terminada.getTime() / 60000);
    porMinuto[k] = (porMinuto[k] || 0) + 1;
  });
  const out: CierreEnBloque[] = [];
  Object.keys(porMinuto).forEach((k) => { if (porMinuto[k] >= 10) out.push({ fecha: new Date(+k * 60000), n: porMinuto[k] }); });
  return out;
}

export function calidadEquipo(items: Derivada[], c: ContextoCalculo, sp: InfoSprints, det: Deteccion): CalidadEquipo {
  const desde = sumarDias(c.semanaFin, -112);
  const ent = items.filter((d) => d.entregada && d.t.fechas.terminada! >= desde);
  const saltos = ent.filter((d) => d.salto).length;
  const historias = items.filter((d) => d.t.tipo === 'historia');
  const sinPuntos = historias.filter((d) => d.t.estimacion == null).length;
  const bloque = c.cierresBloque.filter((b) =>
    items.some((d) => d.t.fechas.terminada && Math.floor(d.t.fechas.terminada.getTime() / 60000) === Math.floor(b.fecha.getTime() / 60000)));
  const avisos: string[] = [];
  if (ent.length && saltos / ent.length > 0.05) avisos.push(Math.round(saltos / ent.length * 100) + Tx('% of done work went from backlog to done without being in progress (', '% de lo terminado pasó de pendiente a hecho sin estar en curso (') + saltos + Tx(' tasks).', ' tareas).'));
  if (bloque.length) avisos.push(bloque.length === 1 ? Tx('There is a bulk closure: ', 'Hay un cierre en bloque: ') + bloque[0].n + Tx(' tasks closed in the same minute (', ' tareas cerradas en el mismo minuto (') + fechaCorta(bloque[0].fecha) + ').' : Tx('There are ', 'Hay ') + bloque.length + Tx(' bulk closures (10 or more tasks closed in the same minute).', ' cierres en bloque (10 o más tareas cerradas en el mismo minuto).'));
  const totales = ent.map((d) => d.total);
  if (ent.length >= 30 && cuantil(totales, 0.85)! < 1) avisos.push(Tx('Almost all tasks are closed less than a day after they are created: they seem to be logged in Jira after the work is done.', 'Casi todas las tareas se cierran menos de un día después de crearse: parece que se registran en Jira después de hacer el trabajo.'));
  if (historias.length >= 10 && sinPuntos / historias.length > 0.3) avisos.push(Math.round(sinPuntos / historias.length * 100) + Tx('% of stories have no points.', '% de las historias no tienen puntos.'));
  // Un equipo que no usa sprints (Kanban) no es un fallo: solo se avisa si los usa y no son creíbles
  if (det.haySprints && !sp.fiables && sp.motivo && items.some((d) => d.t.sprints.length > 0)) avisos.push(sp.motivo);
  if (det.hayTiempos && items.length && items.filter((d) => d.t.fechas.terminada && !d.conTiempos).length / items.length > 0.2) avisos.push(Tx('Many closed tasks have no Time in Status.', 'Muchas tareas cerradas no traen Tiempo en estado.'));
  return { saltos, saltosParte: ent.length ? saltos / ent.length : 0, sinPuntos, historias: historias.length, cierresBloque: bloque, avisos };
}
