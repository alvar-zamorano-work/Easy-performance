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
import { unificarAgrupadores } from '../adaptadores/comun/limpieza.ts';
import type { Tarea } from '../nucleo/modelo.ts';
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
  // Sale la creada en 1999 y también la terminada en 2031: si no, contaría como abierta para siempre
  assert.equal(r.lectura.tareas.length, base.lectura.tareas.length - 2);
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
  assert.equal(inicioReferencia([0, 0, 0], 4), 0, 'sin ninguna entrega no se recorta nada');
});

test('días con cierres masivos: 15 o más y el triple de los días grandes del equipo', () => {
  const d = (dia: number, n: number) => Array.from({ length: n }, () => ({ t: { fechas: { terminada: new Date(2026, 9, dia, 10) } } }) as unknown as Derivada);
  const normales = [1, 2, 3, 6, 7, 8].flatMap((x) => d(x, 2));
  assert.equal(diasMasivos(normales.concat(d(9, 20))).length, 1);
  assert.equal(diasMasivos(normales.concat(d(9, 9))).length, 0, 'menos de 15');
});

test('reviews de Scrum: cerrar mucho cada dos semanas es el normal del equipo, no un cierre masivo', () => {
  const d = (dia: number, n: number) => Array.from({ length: n }, () => ({ t: { fechas: { terminada: new Date(2026, 8, dia, 17) } } }) as unknown as Derivada);
  const sprint = [4, 18].flatMap((x) => d(x, 16)).concat([1, 2, 8, 9, 15, 16, 22, 23].flatMap((x) => d(x, 2))).concat([25, 26].flatMap((x) => d(x, 16)));
  assert.deepEqual(diasMasivos(sprint), []);
  assert.equal(diasMasivos(sprint.concat(d(29, 60))).length, 1, 'una limpieza de 60 sí destaca');
});

test('salto solo en medidas de actividad: una mejora real de una proporción no se marca', () => {
  const r = { lo: 0.05, hi: 0.12, med: 0.08, n: 12 };
  for (const id of ['agent_readiness', 'estimacion', 'valor']) {
    const def = CATALOGO.medidas[id] || { dir: 'mas', formato: 'pct' };
    assert.equal(revisarComparacion(id, 0.45, r, def as never), null, id);
  }
});

test('equipo sin ninguna entrega en un export mixto: el resto de sus medidas conserva su referencia', () => {
  const r = medir('equipoSinEntregas');
  const e = r.modelo.equipos.find((x) => x.nombre === EQUIPO_TARDIO)!;
  assert.equal(e.entregadas, 0);
  assert.ok(e.medidas.wip.ref, 'trabajo en curso con su referencia');
});

test('nombre unido: la misma forma en cualquier export, sea cual sea la más frecuente', () => {
  const t = (v: string) => ({ agrupadores: { equipo: v } }) as unknown as Tarea;
  const a = [t('Pagos'), t('Pagos'), t('PAGOS')], b = [t('Pagos'), t('PAGOS'), t('PAGOS'), t(' pagos ')];
  unificarAgrupadores(a); unificarAgrupadores(b);
  assert.deepEqual([...new Set(a.map((x) => x.agrupadores.equipo))], ['Pagos']);
  assert.deepEqual([...new Set(b.map((x) => x.agrupadores.equipo))], ['Pagos']);
});
