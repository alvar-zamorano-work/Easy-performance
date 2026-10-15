// Vista de negocio: plazos de las últimas 12 semanas, reparto por épica y urgente frente al resto.

import { cuantil, sumarDias } from './util.ts';
import type { ContextoCalculo, Derivada, Negocio } from './tipos.ts';

export function negocio(items: Derivada[], c: ContextoCalculo): Negocio {
  const desde = sumarDias(c.semanaFin, -84);
  const v = items.filter((d) => d.entregada && d.t.resuelta! >= desde && d.t.resuelta! < c.semanaFin);
  const ciclos = v.filter((d) => d.ciclo != null).map((d) => d.ciclo!);
  const totales = v.map((d) => d.total);
  const porEpica: Record<string, number> = {};
  v.forEach((d) => { const k = d.t.padre || 'Sin épica'; porEpica[k] = (porEpica[k] || 0) + 1; });
  let epicas = Object.keys(porEpica).map((k) => ({ nombre: k, n: porEpica[k], parte: porEpica[k] / v.length }))
    .sort((a, b) => b.n - a.n);
  if (epicas.length > 6) {
    const resto = epicas.slice(5).reduce((s, e) => s + e.n, 0);
    epicas = epicas.slice(0, 5).concat([{ nombre: 'Otras', n: resto, parte: resto / v.length }]);
  }
  const urg = v.filter((d) => d.t.urgente).map((d) => d.total);
  const resto2 = v.filter((d) => !d.t.urgente).map((d) => d.total);
  return {
    n: v.length, ciclo50: cuantil(ciclos, 0.5), ciclo85: cuantil(ciclos, 0.85), total50: cuantil(totales, 0.5), total85: cuantil(totales, 0.85),
    epicas, urgente: { n: urg.length, mediana: cuantil(urg, 0.5) }, resto: { n: resto2.length, mediana: cuantil(resto2, 0.5) },
  };
}
