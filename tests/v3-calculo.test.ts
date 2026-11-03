// Cálculo cuando faltan fechas: lo cerrado sin fecha de cierre no es pendiente, y lo que no se puede saber no sale "bien".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectar } from '../nucleo/detectar.ts';
import { calcular, preparar, calcularDesde } from '../nucleo/calcular.ts';
import { fiabilidad } from '../nucleo/fiabilidad.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { variantes } from './variantes.ts';

const V = variantes();

test('tareas hechas sin fecha de cierre: no cuentan como pendiente', () => {
  const l = leerJira(V.original.ficheros), det = detectar(l);
  const antes = calcular(l.tareas, det, {}).equipos;
  // Se borra la fecha de cierre de 15 tareas terminadas de cada equipo: siguen hechas, pero sin saber cuándo
  const porEquipo: Record<string, number> = {};
  const tareas = l.tareas.map((t) => {
    const e = String(t.equipo_id);
    if (!t.fechas.terminada || t.estado_normalizado !== 'terminado' || (porEquipo[e] || 0) >= 15) return t;
    porEquipo[e] = (porEquipo[e] || 0) + 1;
    return { ...t, fechas: { ...t.fechas, terminada: null } };
  });
  const despues = calcular(tareas, det, {}).equipos;
  for (const e of antes) {
    const d = despues.find((x) => x.nombre === e.nombre)!;
    assert.equal(d.medidas.pendiente.valor, e.medidas.pendiente.valor, e.nombre);
  }
});

test('sin tiempo en cada estado: "pasan por en curso" no se puede saber (no sale bien)', () => {
  const l = leerJira(V.sinTiempos.ficheros), det = detectar(l);
  const p = preparar(l.tareas, det, {}), m = calcularDesde(p);
  const f = fiabilidad(l, det, p, m, {});
  const flujo = f.comprobaciones.find((c) => c.id === 'flujo')!;
  assert.notEqual(flujo.estado, 'bien');
  for (const e of f.porEquipo) if (e.valores.flujo) assert.notEqual(e.valores.flujo.estado, 'bien', e.equipo);
  // Con el tiempo en cada estado sí se mide
  const l2 = leerJira(V.original.ficheros), det2 = detectar(l2), p2 = preparar(l2.tareas, det2, {});
  const f2 = fiabilidad(l2, det2, p2, calcularDesde(p2), {});
  assert.equal(f2.comprobaciones.find((c) => c.id === 'flujo')!.estado === 'sin', false);
});

test('sin fecha de inicio: el pendiente no tiene histórico y no salta "el pendiente crece"', () => {
  const l = leerJira(V.sinTiempos.ficheros), det = detectar(l);
  for (const e of calcular(l.tareas, det, {}).equipos) {
    assert.ok(e.medidas.pendiente.sinHistorico, e.nombre);
    assert.ok(!e.casos.some((c) => c.id === 'pendiente_crece'), e.nombre);
  }
});
