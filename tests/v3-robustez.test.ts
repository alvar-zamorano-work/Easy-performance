// Robustez con datos imperfectos (auditoría de noviembre de 2026). Cada variante reproduce un fallo típico de lo que
// manda un cliente. Lo que se lee igual tiene que dar las mismas cifras; lo que no se puede medir no puede salir "normal".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variantes, HOY, EQUIPO_TARDIO, EQUIPO_SALTO } from './variantes.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { detectar } from '../nucleo/detectar.ts';
import { calcular } from '../nucleo/calcular.ts';
import { estadoMedida, revisarComparacion, inicioReferencia } from '../nucleo/semaforo.ts';
import { diasMasivos } from '../nucleo/calidad.ts';
import { CATALOGO } from '../nucleo/catalogo.ts';
import type { Derivada } from '../nucleo/tipos.ts';

const V = variantes();
function medir(nombre: string) {
  const lectura = leerJira(V[nombre].ficheros, { hoy: HOY });
  const det = detectar(lectura);
  const modelo = calcular(lectura.tareas, det, {});
  return { lectura, det, modelo };
}
const entregasPorEquipo = (m: ReturnType<typeof medir>['modelo']) =>
  Object.fromEntries(m.equipos.map((e) => [e.nombre, e.medidas.entregas.valor]));

const base = medir('original');

for (const nombre of ['castellano', 'fechasEEUU', 'excelEspanol', 'solapados']) {
  test(`se lee igual: ${V[nombre].que}`, () => {
    const r = medir(nombre);
    assert.equal(r.lectura.tareas.length, base.lectura.tareas.length, 'tareas');
    assert.equal(r.det.fechaRef.getTime(), base.det.fechaRef.getTime(), 'fecha del análisis');
    assert.deepEqual(entregasPorEquipo(r.modelo), entregasPorEquipo(base.modelo), 'entregas por equipo');
  });
}

test('fechas imposibles: se ignoran, se avisa y no mueven la fecha del análisis', () => {
  const r = medir('fechaImposible');
  assert.equal(r.det.fechaRef.getTime(), base.det.fechaRef.getTime(), 'fecha del análisis');
  assert.equal(r.lectura.informe.fechasImposibles, 2);
  assert.equal(r.lectura.tareas.length, base.lectura.tareas.length - 1, 'la tarea creada en 1999 sale');
  assert.ok(r.lectura.informe.avisos.some((a) => /impossible dates|fechas imposibles/.test(a.texto)), 'aviso');
});

test('nombres de equipo con mayúsculas o espacios distintos: un solo equipo y aviso', () => {
  const r = medir('equiposMayusculas');
  assert.deepEqual(r.modelo.equipos.map((e) => e.nombre).sort(), base.modelo.equipos.map((e) => e.nombre).sort());
  assert.deepEqual(entregasPorEquipo(r.modelo), entregasPorEquipo(base.modelo));
  assert.ok((r.lectura.informe.equiposUnidos || 0) > 0);
});

test('estados en otro idioma sin categoría: hay fechas de terminado, pero nada cuenta como entregado', () => {
  // La puerta de "no se puede medir" (sin entregas) la pone la página; aquí se comprueba el hecho que la dispara
  const r = medir('estadosAleman');
  assert.ok(r.lectura.tareas.some((t) => t.fechas.terminada));
  assert.equal(r.modelo.equipos.reduce((n, e) => n + e.entregadas, 0), 0);
});

test('solo trabajo abierto y sin columna de terminado: ninguna tarea con fecha de terminado', () => {
  for (const n of ['soloAbiertas', 'sinResuelta']) {
    const r = medir(n);
    assert.ok(r.lectura.tareas.length > 0, n);
    assert.equal(r.lectura.tareas.filter((t) => t.fechas.terminada).length, 0, n);
  }
});

test('equipo que empieza tarde: las semanas antes de existir no son su baseline ni dan alertas', () => {
  const r = medir('equipoTardio');
  const e = r.modelo.equipos.find((x) => x.nombre === EQUIPO_TARDIO)!;
  const m = e.medidas.entregas;
  assert.ok(!m.ref || m.ref.lo > 0, 'sin franja de ceros: ' + JSON.stringify(m.ref));
  assert.notEqual(m.referencia, 'establecida');
  assert.ok(m.estado !== 'atencion' && m.estado !== 'critico', 'sin alerta por comparar con ceros');
});

test('cierre masivo: las entregas se marcan para revisar y no salen como "normal" ni como mejora', () => {
  const r = medir('salto');
  const e = r.modelo.equipos.find((x) => x.nombre === EQUIPO_SALTO)!;
  assert.equal(e.medidas.entregas.revisar, 'salto', JSON.stringify({ v: e.medidas.entregas.valor, ref: e.medidas.entregas.ref }));
  assert.equal(e.medidas.entregas.estado, 'sin');
  assert.ok((e.calidad.diasMasivos || []).length >= 1, 'el día del cierre masivo se detecta');
  // Los demás equipos no cambian
  r.modelo.equipos.filter((x) => x.nombre !== EQUIPO_SALTO).forEach((x) => assert.equal(x.medidas.entregas.valor, entregasPorEquipo(base.modelo)[x.nombre], x.nombre));
});

test('semáforo: mejor de lo normal no es "normal", y un límite fijo superado manda aunque la banda diga mejor', () => {
  const def = CATALOGO.medidas.entregas;
  const ref = { lo: 6, hi: 9, med: 7.5, n: 12 };
  assert.equal(estadoMedida('entregas', 8, ref, null, def).lado, undefined, 'dentro');
  const mejor = estadoMedida('entregas', 11, ref, null, def);
  assert.equal(mejor.estado, 'bien'); assert.equal(mejor.lado, 'mejor');
  const peor = estadoMedida('entregas', 4, ref, null, def);
  assert.ok(peor.estado === 'atencion' || peor.estado === 'critico');
  // Retrabajo del 37 % con franja de 43 a 50 %: mejor que lo normal, pero por encima del límite fijo
  const ret = CATALOGO.medidas.retrabajo;
  const r = estadoMedida('retrabajo', 0.37, { lo: 0.43, hi: 0.5, med: 0.46, n: 12 }, null, ret);
  assert.equal(r.estado, 'critico'); assert.equal(r.por, 'limite');
});

test('comparación dudosa: cero en entregas sí, cero en regularidad no; salto solo por el lado bueno', () => {
  const cero = { lo: 0, hi: 0, med: 0, n: 12 };
  assert.equal(revisarComparacion('entregas', 11.75, cero, CATALOGO.medidas.entregas), 'cero');
  assert.equal(revisarComparacion('regularidad', 0.17, cero, CATALOGO.medidas.regularidad), null);
  assert.equal(revisarComparacion('entregas', 18.25, { lo: 0.5, hi: 1.1, med: 0.75, n: 12 }, CATALOGO.medidas.entregas), 'salto');
  assert.equal(revisarComparacion('entregas', 2, { lo: 0.5, hi: 1.1, med: 0.75, n: 12 }, CATALOGO.medidas.entregas), null, 'menos del triple');
  assert.equal(revisarComparacion('entregas', 0.1, { lo: 6, hi: 9, med: 7, n: 12 }, CATALOGO.medidas.entregas), null, 'una caída no es un salto');
});

test('inicio de la referencia: un arranque en las primeras semanas no cambia nada; uno tardío sí', () => {
  assert.equal(inicioReferencia([0, 2, 3, 4, 5], 4), 0);
  assert.equal(inicioReferencia([0, 0, 0, 0, 0, 1, 2], 4), 8);
  assert.equal(inicioReferencia([0, 0, 0], 4), 3);
});

test('días con cierres masivos: 15 o más y 5 veces lo normal del equipo', () => {
  const d = (dia: number, n: number) => Array.from({ length: n }, () => ({ t: { fechas: { terminada: new Date(2026, 9, dia, 10) } } }) as unknown as Derivada);
  const normales = [1, 2, 3, 6, 7, 8].flatMap((x) => d(x, 2));
  assert.equal(diasMasivos(normales.concat(d(9, 20))).length, 1);
  assert.equal(diasMasivos(normales.concat(d(9, 9))).length, 0, 'menos de 15');
});
