// Calidad del dato por equipo: saltos de estado, cierres en bloque, registro a posteriori, historias sin puntos.

import { cuantil, sumarDias } from './util.ts';
import { fechaCorta } from './formato.ts';
import type { CalidadEquipo, CierreEnBloque, ContextoCalculo, Deteccion, Derivada, InfoSprints, Tarea } from './tipos.ts';

/** Minutos en los que se cerraron 10 o más tareas a la vez. */
export function cierresEnBloque(tareas: Tarea[]): CierreEnBloque[] {
  const porMinuto: Record<string, number> = {};
  tareas.forEach((t) => {
    if (!t.resuelta) return;
    const k = Math.floor(t.resuelta.getTime() / 60000);
    porMinuto[k] = (porMinuto[k] || 0) + 1;
  });
  const out: CierreEnBloque[] = [];
  Object.keys(porMinuto).forEach((k) => { if (porMinuto[k] >= 10) out.push({ fecha: new Date(+k * 60000), n: porMinuto[k] }); });
  return out;
}

export function calidadEquipo(items: Derivada[], c: ContextoCalculo, sp: InfoSprints, det: Deteccion): CalidadEquipo {
  const desde = sumarDias(c.semanaFin, -112);
  const ent = items.filter((d) => d.entregada && d.t.resuelta! >= desde);
  const saltos = ent.filter((d) => d.salto).length;
  const historias = items.filter((d) => d.t.tipo === 'historia');
  const sinPuntos = historias.filter((d) => d.t.puntos == null).length;
  const bloque = c.cierresBloque.filter((b) =>
    items.some((d) => d.t.resuelta && Math.floor(d.t.resuelta.getTime() / 60000) === Math.floor(b.fecha.getTime() / 60000)));
  const avisos: string[] = [];
  if (ent.length && saltos / ent.length > 0.05) avisos.push(Math.round(saltos / ent.length * 100) + '% de lo terminado pasó de pendiente a hecho sin estar en curso (' + saltos + ' tareas).');
  if (bloque.length) avisos.push(bloque.length === 1 ? 'Hay un cierre en bloque: ' + bloque[0].n + ' tareas cerradas en el mismo minuto (' + fechaCorta(bloque[0].fecha) + ').' : 'Hay ' + bloque.length + ' cierres en bloque (10 o más tareas cerradas en el mismo minuto).');
  const totales = ent.map((d) => d.total);
  if (ent.length >= 30 && cuantil(totales, 0.85)! < 1) avisos.push('8 de cada 10 tareas se cierran en menos de un día desde que se crean: parece que se registran en Jira después de hacer el trabajo.');
  if (historias.length >= 10 && sinPuntos / historias.length > 0.3) avisos.push(Math.round(sinPuntos / historias.length * 100) + '% de las historias no tienen puntos.');
  if (det.haySprints && !sp.fiables && sp.motivo) avisos.push(sp.motivo);
  if (det.hayTis && items.length && items.filter((d) => d.t.resuelta && !d.conTis).length / items.length > 0.2) avisos.push('Muchas tareas cerradas no traen Tiempo en estado.');
  return { saltos, saltosParte: ent.length ? saltos / ent.length : 0, sinPuntos, historias: historias.length, cierresBloque: bloque, avisos };
}
