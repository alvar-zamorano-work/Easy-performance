// Previsión por probabilidad desde el ritmo real, vista de épicas, reparto por un campo del cliente
// y tareas sin épica en la calidad del dato.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { detectar } from '../nucleo/detectar.ts';
import { preparar, calcularDesde } from '../nucleo/calcular.ts';
import { muestraDeRitmo, cuantasEnSemanas, cuandoTerminan, MAXIMO_SEMANAS } from '../nucleo/prevision.ts';
import { vistaEpicas, repartoPorCampo } from '../nucleo/epicas.ts';
import { sumarDias } from '../nucleo/util.ts';
import type { Epica } from '../nucleo/modelo.ts';

const texto = readFileSync(join(SINTETICOS, 'jira-ejemplo-completo-2026-10-12.csv'), 'utf8');
const lectura = leerJira([{ nombre: 'completo.csv', texto }]);
const det = detectar(lectura);
const cfg = { campoEquipo: det.equipoRecomendado, equipos: [], mapeoEstados: det.mapeoEstados };
const p = preparar(lectura.tareas, det, cfg);

// ---------- previsión ----------

test('muestra de ritmo: últimas 12 semanas; sin semanas suficientes o sin entregas no hay previsión', () => {
  assert.deepEqual(muestraDeRitmo([9, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(muestraDeRitmo([1, 2, 3, 4, 5]), null, 'menos de 6 semanas');
  assert.equal(muestraDeRitmo([0, 0, 0, 0, 0, 0, 0, 0]), null, 'nada terminado');
});

test('con un ritmo fijo la previsión es exacta', () => {
  const m = new Array(12).fill(5);
  assert.deepEqual(cuantasEnSemanas(m, 4), { semanas: 4, p85: 20, p50: 20, muestra: 12 });
  const c = cuandoTerminan(m, 12);
  assert.equal(c.p85, 3); assert.equal(c.p50, 3);
  assert.equal(cuandoTerminan(m, 0).p85, 0);
});

test('con un ritmo variable: el 85 % es más prudente que el 50 % y la misma semilla da la misma cifra', () => {
  const m = [0, 3, 7, 2, 9, 4, 1, 6, 5, 0, 8, 3];
  const a = cuantasEnSemanas(m, 6), b = cuantasEnSemanas(m, 6);
  assert.deepEqual(a, b);
  assert.ok(a.p85 <= a.p50, JSON.stringify(a));
  const media = m.reduce((s, x) => s + x, 0) / m.length;
  assert.ok(Math.abs(a.p50 - media * 6) <= 3, `p50 ${a.p50} frente a ${media * 6}`);
  const c = cuandoTerminan(m, 40);
  assert.ok(c.p85! >= c.p50!, JSON.stringify(c));
  // Un lote imposible al ritmo actual no da fecha
  assert.equal(cuandoTerminan([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 100000).p85, null);
  assert.ok(MAXIMO_SEMANAS >= 52);
});

test('previsión sobre un equipo real del sintético: cifras dentro de lo razonable', () => {
  const modelo = calcularDesde(p);
  const e = modelo.equipos[0];
  const m = muestraDeRitmo(e.series.entregas)!;
  assert.ok(m, 'hay muestra');
  const c = cuantasEnSemanas(m, 4);
  const min = Math.min(...m) * 4, max = Math.max(...m) * 4;
  assert.ok(c.p85 >= min && c.p50 <= max, JSON.stringify({ c, min, max }));
});

// ---------- épicas ----------

test('vista de épicas: cada épica cuadra sus hijas y las tareas sin épica se cuentan', () => {
  const v = vistaEpicas(p, lectura.epicas);
  assert.ok(lectura.epicas && lectura.epicas.length > 0, 'el lector guarda las épicas');
  assert.ok(v.epicas.length > 0);
  for (const e of v.epicas) {
    assert.equal(e.terminadas + e.abiertas, e.hijas, e.clave);
    assert.ok(e.avance >= 0 && e.avance <= 1, e.clave);
    if (e.abiertas === 0) assert.equal(e.situacion, 'terminada', e.clave);
    if (e.prevision85 && e.prevision50) assert.ok(e.prevision85 >= e.prevision50, e.clave);
  }
  const hijas = v.epicas.reduce((s, e) => s + e.hijas, 0);
  assert.ok(hijas + v.sinEpica <= v.tareas);
  assert.equal(v.hayVencimientos, false, 'el sintético no trae vencimientos');
});

test('vencimientos: vencida, en riesgo o en plazo según la previsión, y estado que no cuadra con las hijas', () => {
  const base = vistaEpicas(p, lectura.epicas);
  const abierta = base.epicas.find((e) => e.abiertas > 0 && e.prevision85)!;
  const meta = (cambios: Partial<Epica>): Epica[] => (lectura.epicas || []).map((x) => (x.clave === abierta.clave ? { ...x, ...cambios } : x));
  const de = (epicas: Epica[]) => vistaEpicas(p, epicas).epicas.find((e) => e.clave === abierta.clave)!;
  assert.equal(de(meta({ vence: sumarDias(p.ctx.fechaRef, -3) })).situacion, 'vencida');
  assert.equal(de(meta({ vence: sumarDias(abierta.prevision85!, -1) })).situacion, 'en_riesgo');
  assert.equal(de(meta({ vence: sumarDias(abierta.prevision85!, 1) })).situacion, 'en_plazo');
  assert.equal(de(meta({ estado: 'Done', categoria: 'Done' })).estadoDescuadrado, true, 'Done con hijas abiertas');
  assert.equal(de(meta({ descartada: true })), undefined, 'una épica descartada no sale');
});

test('el lector de Jira lee la fecha de vencimiento de las épicas', () => {
  const lineas = texto.split(/\r?\n/);
  const cab = lineas[0] + ',Due date';
  const conVence = [cab].concat(lineas.slice(1).filter(Boolean).map((l) => l + ',2026-12-31')).join('\n');
  const l2 = leerJira([{ nombre: 'v.csv', texto: conVence }]);
  assert.ok(l2.epicas!.length && l2.epicas!.every((e) => e.vence && e.vence.getFullYear() === 2026 && e.vence.getMonth() === 11));
});

// ---------- reparto por campo ----------

test('reparto por un campo que elige el cliente: suma el 100 % de lo terminado', () => {
  const l = leerJira([{ nombre: 'c.csv', texto }], { columnaReparto: 'Issue Type' });
  assert.ok(l.tareas.every((t) => t.agrupadores.reparto != null));
  const d = detectar(l);
  const pr = preparar(l.tareas, d, { campoEquipo: d.equipoRecomendado, equipos: [], mapeoEstados: d.mapeoEstados });
  const r = repartoPorCampo(([] as never[]).concat(...pr.nombresEquipo.map((n) => pr.porEquipo[n] as never[])), pr.ctx.semanaFin);
  assert.deepEqual(r.map((x) => x.valor).sort(), ['Bug', 'Story', 'Task']);
  assert.ok(Math.abs(r.reduce((s, x) => s + x.parte, 0) - 1) < 1e-9);
  // Sin elegir campo, el reparto no aparece en los agrupadores
  assert.ok(lectura.tareas.every((t) => !('reparto' in t.agrupadores)));
});

// ---------- casos de la revisión independiente ----------

test('equipo nuevo: las semanas antes de su primera entrega no cuentan como ritmo cero', () => {
  const m = muestraDeRitmo([0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10]);
  assert.deepEqual(m, [10, 10, 10, 10, 10, 10]);
  assert.equal(cuantasEnSemanas(m!, 4).p85, 40);
  // Con menos de 6 semanas desde la primera entrega, o menos de 3 con entregas, no hay previsión
  assert.equal(muestraDeRitmo([0, 0, 0, 0, 10, 10, 10]), null);
  assert.equal(muestraDeRitmo([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]), null);
  // Las semanas sin entregas después de la primera sí cuentan
  assert.deepEqual(muestraDeRitmo([5, 0, 5, 0, 5, 0]), [5, 0, 5, 0, 5, 0]);
});

test('épicas: vencimiento el mismo día no es vencida; más de dos años no es "sin ritmo"; una épica nueva no está parada', () => {
  const base = vistaEpicas(p, lectura.epicas);
  const abierta = base.epicas.find((e) => e.abiertas > 0 && e.prevision85)!;
  const hoy = p.ctx.fechaRef;
  const conMeta = (cambios: Partial<Epica>) => vistaEpicas(p, (lectura.epicas || []).map((x) => (x.clave === abierta.clave ? { ...x, ...cambios } : x))).epicas.find((e) => e.clave === abierta.clave)!;
  const mismoDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  assert.notEqual(conMeta({ vence: mismoDia }).situacion, 'vencida');
  assert.equal(conMeta({ vence: sumarDias(mismoDia, -1) }).situacion, 'vencida');
  // La previsión cuenta desde la fecha de los datos
  assert.ok(abierta.prevision85! >= hoy);
  // Una épica con muchas tareas abiertas y ritmo muy bajo: previsión lejana, no "sin ritmo"
  const fin = p.ctx.semanaFin;
  const hija = (i: number, terminada: Date | null) => ({ equipo: 'X', entregada: !!terminada, descartada: false, etapa: terminada ? 'hecho' : 'pendiente',
    t: { id: 'l' + i, padre_id: 'LEJOS-1', padre_titulo: 'Lejos', fechas: { creada: sumarDias(fin, -100), terminada } } });
  const hijas = [hija(0, sumarDias(fin, -20)), hija(1, sumarDias(fin, -40))].concat(Array.from({ length: 2000 }, (_, i) => hija(i + 2, null)));
  const minima = { nombresEquipo: ['X'], porEquipo: { X: hijas }, ctx: { semanaFin: fin, fechaRef: p.ctx.fechaRef } } as never;
  const lejana = vistaEpicas(minima, []).epicas[0];
  assert.equal(lejana.previsionLejana, true, JSON.stringify({ r: lejana.ritmo, a: lejana.abiertas, s: lejana.situacion }));
  assert.equal(lejana.prevision85, null);
  assert.equal(lejana.situacion, 'sin_fecha');
  // Una épica creada hace dos semanas, con trabajo en curso y nada terminado: sin ritmo aún, no parada
  const plantilla = p.porEquipo[abierta.equipo][0];
  const nueva = Array.from({ length: 5 }, (_, i) => ({ ...plantilla, entregada: false, etapa: 'curso' as const, descartada: false, t: { ...plantilla.t, id: 'n' + i, padre_id: 'NUEVA-1', fechas: { ...plantilla.t.fechas, creada: sumarDias(p.ctx.semanaFin, -10), terminada: null } } }));
  const conNueva = { ...p, porEquipo: { ...p.porEquipo, [abierta.equipo]: p.porEquipo[abierta.equipo].concat(nueva) } };
  assert.equal(vistaEpicas(conNueva, lectura.epicas).epicas.find((e) => e.clave === 'NUEVA-1')!.situacion, 'sin_ritmo');
  // La misma épica, antigua y sin nada en curso: parada
  const vieja = nueva.map((d) => ({ ...d, etapa: 'pendiente' as const, t: { ...d.t, fechas: { ...d.t.fechas, creada: sumarDias(p.ctx.semanaFin, -120) } } }));
  const conVieja = { ...p, porEquipo: { ...p.porEquipo, [abierta.equipo]: p.porEquipo[abierta.equipo].concat(vieja) } };
  assert.equal(vistaEpicas(conVieja, lectura.epicas).epicas.find((e) => e.clave === 'NUEVA-1')!.situacion, 'parada');
});

test('reparto: si un fichero no tiene la columna elegida se avisa; las columnas numéricas no se proponen', async () => {
  const sinColumna = texto.replace(/(^|,)Issue Type(,|\r?\n)/, '$1Clase$2');
  const l = leerJira([{ nombre: 'a.csv', texto }, { nombre: 'b.csv', texto: sinColumna }], { columnaReparto: 'Issue Type' });
  assert.ok(l.informe.avisos.some((a) => a.texto.includes('b.csv') && a.texto.includes('Issue Type')), JSON.stringify(l.informe.avisos.map((a) => a.texto)));
  const { columnasCategoricas } = await import('../adaptadores/comun/categoricas.ts');
  const cols = columnasCategoricas(texto).map((c) => c.columna);
  assert.ok(cols.includes('Issue Type'));
  assert.ok(!cols.some((c) => /story points/i.test(c)), JSON.stringify(cols));
});
