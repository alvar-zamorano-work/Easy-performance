// Limpieza común a todas las fuentes, después de leer: fechas imposibles fuera y nombres de equipo unificados.
// Lo que se cambia se dice en los avisos de la lectura: nada se pierde ni se corrige en silencio.

import { Tx, regional } from '../../nucleo/idioma.ts';
import type { Lectura, Tarea } from '../../nucleo/modelo.ts';

/** Fechas anteriores a esta no son de un tablero de trabajo: son errores de captura (1900, 1970...). */
export const FECHA_MINIMA = new Date(2000, 0, 1);

/** Una fecha es posible si no es anterior a 2000 ni posterior a mañana (margen por zonas horarias). */
export function fechaPosible(d: Date | null | undefined, hoy: Date): boolean {
  if (!d) return true;
  const x = d.getTime();
  return x >= FECHA_MINIMA.getTime() && x <= hoy.getTime() + 864e5;
}

const CAMPOS_FECHA: (keyof Tarea['fechas'])[] = ['creada', 'actualizada', 'empezada', 'terminada', 'cambio_estado', 'primera_respuesta'];

/** Nombre normalizado para comparar: sin espacios de más y sin distinguir mayúsculas. */
const clave = (v: string) => v.replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');

/**
 * Valores de agrupador (equipo, componente, proyecto...) que solo cambian en mayúsculas o espacios se unen
 * en la forma más frecuente. Devuelve cuántas formas distintas se han unido en el campo de equipo.
 */
export function unificarAgrupadores(tareas: Tarea[]): Record<string, number> {
  const campos = new Set<string>();
  tareas.forEach((t) => Object.keys(t.agrupadores).forEach((k) => campos.add(k)));
  const unidos: Record<string, number> = {};
  campos.forEach((campo) => {
    const cuenta = new Map<string, Map<string, number>>();
    tareas.forEach((t) => {
      const v = t.agrupadores[campo];
      if (!v) return;
      const k = clave(v);
      if (!k) return;
      const formas = cuenta.get(k) || new Map<string, number>();
      const limpia = v.replace(/\s+/g, ' ').trim();
      formas.set(limpia, (formas.get(limpia) || 0) + 1);
      cuenta.set(k, formas);
    });
    const canonica = new Map<string, string>();
    let n = 0;
    cuenta.forEach((formas, k) => {
      const orden = [...formas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      canonica.set(k, orden[0][0]);
      if (formas.size > 1) n += formas.size - 1;
    });
    tareas.forEach((t) => {
      const v = t.agrupadores[campo];
      if (v) t.agrupadores[campo] = canonica.get(clave(v)) ?? v.trim();
    });
    unidos[campo] = n;
  });
  return unidos;
}

/**
 * Fechas imposibles (antes de 2000 o después de mañana) se dejan sin valor y se cuentan. Una tarea cuya fecha de
 * creación era imposible no se puede medir y sale de la lectura. Así una sola celda mal escrita no mueve la fecha del análisis.
 */
export function limpiarLectura(lectura: Lectura, hoyEntrada?: Date | string | null): Lectura {
  const hoy = hoyEntrada ? new Date(hoyEntrada) : new Date();
  let fechas = 0, fuera = 0;
  const tareas = lectura.tareas.filter((t) => {
    CAMPOS_FECHA.forEach((c) => {
      const d = t.fechas[c] as Date | null;
      if (d && !fechaPosible(d, hoy)) { fechas++; (t.fechas as unknown as Record<string, Date | null>)[c] = null; }
    });
    if (!t.fechas.creada) { fuera++; return false; }
    return true;
  });
  const inf = lectura.informe;
  if (fechas) {
    inf.fechasImposibles = fechas;
    inf.tareas = tareas.length;
    inf.avisos.push({
      tipo: 'aviso',
      texto: fechas.toLocaleString(regional()) + Tx(' impossible dates (before 2000 or in the future) were ignored', ' fechas imposibles (anteriores a 2000 o futuras) se han ignorado')
        + (fuera ? Tx('; ', '; ') + fuera.toLocaleString(regional()) + Tx(' tasks were left out because it was their creation date.', ' tareas se han dejado fuera porque era su fecha de creación.') : '.'),
    });
  }
  const unidos = unificarAgrupadores(tareas);
  if (unidos.equipo) {
    inf.equiposUnidos = unidos.equipo;
    inf.avisos.push({ tipo: 'aviso', texto: unidos.equipo.toLocaleString(regional()) + Tx(' team names that only differed in capitals or spaces were joined.', ' nombres de equipo que solo cambiaban en mayúsculas o espacios se han unido.') });
  }
  return { ...lectura, tareas };
}
