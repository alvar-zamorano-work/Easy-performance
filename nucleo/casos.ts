// Casos activos: reglas sobre las medidas que disparan un caso del banco (catalogo/casos.json).
// Los identificadores son los de la v0 ("atascado" se muestra como "Trabajo bloqueado").

import { cuantil, media } from './util.ts';
import { formatear as f } from './formato.ts';
import type { CasoActivo, Confianza, ContextoCalculo, Derivada, ResultadoEquipo } from './tipos.ts';

type InfoParcial = Omit<ResultadoEquipo, 'casos'>;

export function evaluarCasos(eq: InfoParcial, items: Derivada[], c: ContextoCalculo): CasoActivo[] {
  const M = eq.medidas, s = eq.series, L = c.N - 1, out: CasoActivo[] = [];
  const conf: Confianza = eq.semanasConDatos >= 12 ? 'alta' : (eq.semanasConDatos >= 6 ? 'media' : 'baja');
  function add(id: string, grave: boolean, evidencia: string, datos?: Record<string, unknown>) {
    out.push({ id, gravedad: grave ? 'critico' : 'atencion', confianza: conf, evidencia, datos: datos || {} });
  }

  // 1 trabajo bloqueado
  if (eq.umbralEdad != null && eq.atascadas.length) {
    const n = eq.atascadas.length, maxR = eq.atascadas[0].edad / eq.umbralEdad;
    if (n >= 2 || maxR >= 2) add('atascado', n >= 4 || maxR >= 2.5,
      n + (n === 1 ? ' tarea en curso supera' : ' tareas en curso superan') + ' los ' + f(eq.umbralEdad, 'dias') + ' en los que el equipo termina 8 de cada 10 tareas. La más antigua, ' + eq.atascadas[0].clave + ', lleva ' + f(eq.atascadas[0].edad, 'dias') + '.',
      { n, umbral: eq.umbralEdad, maxEdad: eq.atascadas[0].edad, clave: eq.atascadas[0].clave });
  }
  // 2 demasiado a la vez
  const wipAct = media(s.wip.slice(Math.max(0, L - 3), L + 1))!, wipRef = M.wip && M.wip.ref;
  const cicloRef = M.ciclo && M.ciclo.ref, entRef = M.entregas && M.entregas.ref;
  if (wipRef && cicloRef && entRef && M.ciclo.valor != null && wipAct > wipRef.hi * 1.2 && M.ciclo.valor > cicloRef.med * 1.2 && M.entregas.valor! <= entRef.med * 1.25)
    add('demasiado_a_la_vez', wipAct > wipRef.hi * 1.6,
      'El trabajo en curso está en ' + f(wipAct, 'num') + ' tareas (lo habitual era ' + f(wipRef.med, 'num') + ') y el tiempo de ciclo ha pasado de ' + f(cicloRef.med, 'dias') + ' a ' + f(M.ciclo.valor, 'dias') + ', con las mismas entregas.',
      { wip: wipAct, wipRef: wipRef.med, cicloAntes: cicloRef.med, cicloAhora: M.ciclo.valor });
  // 3 el sprint no se cumple
  const ult = eq.sprints.ultimos;
  const am = ult.length >= 3 ? media(ult.map((x) => x.arrastre)) : null;
  if (eq.sprints.fiables && am != null && am > 0.3 && ult.every((x) => x.arrastre! > 0.2)) {
    add('sprint_no_cumple', am > 0.45, 'En los tres últimos sprints se arrastró de media el ' + f(am, 'pct') + ' del trabajo (' + ult.map((x) => x.nombre + ': ' + f(x.arrastre, 'pct')).join('; ') + ').', { media: am });
  }
  // 4 el pendiente crece
  if (L >= 8) {
    let semMas = 0;
    for (let w = L - 5; w <= L; w++) if (s.entradas[w] > s.salidas[w]) semMas++;
    const p0 = s.pendiente[L - 8], p1 = s.pendiente[L];
    if (semMas >= 4 && p1 - p0 >= 8 && p1 > p0 * 1.15)
      add('pendiente_crece', p1 > p0 * 1.4, 'En ' + semMas + ' de las últimas 6 semanas entró más de lo que salió. El pendiente ha pasado de ' + p0 + ' a ' + p1 + ' tareas en 8 semanas.', { desde: p0, hasta: p1, semanas: semMas });
  }
  // 5 mucha espera
  if (M.espera && M.espera.valor != null && M.espera.valor > 0.5) {
    const desde = c.semanas[Math.max(0, L - c.K + 1)];
    const acum: Record<string, number> = {};
    items.forEach((d) => {
      if (d.entregada && d.t.resuelta! >= desde && d.ciclo != null) Object.keys(d.porEstado).forEach((k) => { acum[k] = (acum[k] || 0) + d.porEstado[k]; });
    });
    const top = Object.keys(acum).sort((a, b) => acum[b] - acum[a])[0];
    add('mucha_espera', M.espera.valor > 0.65, 'El ' + f(M.espera.valor, 'pct') + ' del tiempo de ciclo es espera.' + (top ? ' Donde más se para el trabajo es en "' + top + '".' : ''), { parte: M.espera.valor, estado: top });
  }
  // 6 retrabajo
  const rt = M.retrabajo;
  if (rt && rt.valor != null && (rt.valor >= 0.2 || (rt.ref && rt.valor > rt.ref.hi && rt.valor >= 0.12)))
    add('retrabajo', rt.valor >= 0.3, 'El ' + f(rt.valor, 'pct') + ' de lo terminado en las últimas 8 semanas volvió atrás al menos una vez' + (rt.ref ? ' (lo habitual era ' + f(rt.ref.med, 'pct') + ').' : '.'), { parte: rt.valor, habitual: rt.ref ? rt.ref.med : null });
  // 7 los errores se comen la capacidad
  const er = M.errores;
  if (er && er.valor != null && er.valor >= 0.3 && (!er.ref || er.valor > er.ref.med))
    add('errores_capacidad', er.valor >= 0.4, 'El ' + f(er.valor, 'pct') + ' de lo terminado en las últimas 8 semanas son errores' + (er.ref ? ' (lo habitual era ' + f(er.ref.med, 'pct') + ').' : '.'), { parte: er.valor, habitual: er.ref ? er.ref.med : null });
  // 8 todo llega al final del sprint
  if (eq.sprints.fiables && ult.length >= 3) {
    const fm = media(ult.map((x) => x.alFinal))!;
    if (fm > 0.5) add('todo_al_final', fm > 0.65, 'En los tres últimos sprints, el ' + f(fm, 'pct') + ' de las tareas se cerró en los dos últimos días.', { parte: fm });
  }
  // 9 entregas irregulares
  const rg = M.regularidad;
  if (rg && rg.valor != null && rg.valor > 0.6 && M.entregas.valor! >= 2) {
    const ventana = s.entregas.slice(L - 7, L + 1);
    const emin = Math.min(...ventana), emax = Math.max(...ventana);
    add('entregas_irregulares', rg.valor > 0.9, 'En las últimas 8 semanas las entregas han ido de ' + emin + ' a ' + emax + ' tareas por semana.', { min: emin, max: emax });
  }
  // 10 las estimaciones no predicen
  const es = M.estimacion;
  if (es && es.disponible && es.valor != null && es.valor < 0.2) {
    const grupos: Record<string, number[]> = {};
    eq.ciclos.forEach((x) => { if (x.puntos != null) (grupos[x.puntos] = grupos[x.puntos] || []).push(x.dias); });
    const ks = Object.keys(grupos).filter((k) => grupos[k].length >= 5).map(Number).sort((a, b) => a - b);
    let txt = 'La relación entre puntos y duración es de ' + f(es.valor, 'dec') + ' sobre 1.';
    const pts = (k: number) => k + (k === 1 ? ' punto' : ' puntos');
    if (ks.length >= 2) txt += ' Las tareas de ' + pts(ks[0]) + ' tardan ' + f(cuantil(grupos[ks[0]], 0.5), 'dias') + ' de mediana; las de ' + pts(ks[ks.length - 1]) + ', ' + f(cuantil(grupos[ks[ks.length - 1]], 0.5), 'dias') + '.';
    add('estimaciones_no_predicen', false, txt, { rho: es.valor });
  }
  // 11 todo es urgente
  const desde12 = c.semanas[Math.max(0, L - 11)];
  const creadas12 = items.filter((d) => d.t.creada >= desde12 && d.t.creada < c.semanaFin);
  if (creadas12.length >= 20) {
    const u = creadas12.filter((d) => d.t.urgente).length / creadas12.length;
    if (u > 0.25) add('todo_urgente', u > 0.4, 'El ' + f(u, 'pct') + ' de lo que entró en las últimas 12 semanas tiene la prioridad máxima.', { parte: u });
  }
  // 12 lo urgente no va más rápido
  const ng = eq.negocio;
  if (ng.urgente.n >= 8 && ng.resto.n >= 8 && ng.urgente.mediana! >= ng.resto.mediana! * 0.9)
    add('urgente_no_rapido', ng.urgente.mediana! >= ng.resto.mediana! * 1.1, 'Lo urgente tarda ' + f(ng.urgente.mediana, 'dias') + ' de mediana desde que se pide; el resto, ' + f(ng.resto.mediana, 'dias') + '.', { urgente: ng.urgente.mediana, resto: ng.resto.mediana });
  // 13 datos poco fiables
  if (eq.calidad.avisos.length) add('datos_poco_fiables', eq.calidad.avisos.length >= 2, eq.calidad.avisos.join(' '), { avisos: eq.calidad.avisos.length });

  const ordenG: Record<string, number> = { critico: 0, atencion: 1 };
  out.sort((a, b) => ordenG[a.gravedad] - ordenG[b.gravedad]);
  return out;
}
