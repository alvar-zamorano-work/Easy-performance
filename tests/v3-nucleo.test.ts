// v3: lo que el núcleo añade para la interfaz de fichas. Bugs nuevos por semana, estado de la referencia,
// qué decide el semáforo, detalle de cada cifra, campo de equipo, sprints del área y asistente validado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { detectar } from '../nucleo/detectar.ts';
import { calcular } from '../nucleo/calcular.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import { detalleMedida } from '../nucleo/detalle.ts';
import { estadoReferencia } from '../nucleo/semaforo.ts';
import { medidaEnVentana } from '../nucleo/iniciativas.ts';
import { peticionChat, peticionResumen, validarChat, proveedorFalso, paqueteDeEquipo } from '../nucleo/ia.ts';
import { CATALOGO } from '../nucleo/catalogo.ts';
import type { ClienteV2 } from '../nucleo/cliente.ts';

const DIR = join(SINTETICOS, 'b3');
const leer = (...p: string[]) => readFileSync(join(DIR, ...p), 'utf8');
const cliente: ClienteV2 = JSON.parse(leer('cliente', 'cliente.json'));
const iniciativas = readdirSync(join(DIR, 'cliente', 'iniciativas')).sort().map((f) => JSON.parse(leer('cliente', 'iniciativas', f)));
const lectura = leerJira([{ nombre: 'jira-b3.csv', texto: leer('jira-b3.csv') }]);
const r = diagnosticar(lectura, cliente, iniciativas, null, { generado: new Date(2026, 9, 15) });
const eq = (n: string) => r.modelo.equipos.find((e) => e.nombre === n)!;

test('bugs nuevos por semana: media de 4 semanas de los bugs creados, con banda y en el catálogo', () => {
  assert.ok(CATALOGO.medidas.bugs, 'medida en el catálogo');
  assert.equal(CATALOGO.medidas.bugs.dir, 'menos');
  for (const e of r.modelo.equipos) {
    const m = e.medidas.bugs;
    assert.ok(m.disponible, e.nombre);
    const L = e.series.bugsEntrada.length - 1;
    const esperado = e.series.bugsEntrada.slice(L - 3, L + 1).reduce((s, x) => s + x, 0) / 4;
    assert.ok(Math.abs((m.valor as number) - esperado) < 1e-9, e.nombre + ' valor');
    assert.ok(m.ref && m.ref.n >= 6, e.nombre + ' banda');
  }
});

test('bugs nuevos: el detalle tiene tantas tareas como bugs creados en la ventana, y la iniciativa lo mide igual', () => {
  const p = r.preparacion;
  for (const e of r.modelo.equipos) {
    const d = detalleMedida(p, e.nombre, 'bugs')!;
    assert.equal(d.filas.length, Math.round((e.medidas.bugs.valor as number) * 4), e.nombre);
    assert.ok(d.filas.every((f) => f.tipo === 'error'));
    const m = medidaEnVentana('bugs', p.porEquipo[e.nombre], { desde: d.desde, hasta: d.hasta });
    assert.ok(Math.abs((m.valor as number) - (e.medidas.bugs.valor as number)) < 1e-9, e.nombre + ' iniciativa');
  }
});

test('bugs nuevos: sin tipo de tarea no se calcula', () => {
  const sinTipo = lectura.tareas.map((t) => ({ ...t, tipo: 'otro' as const, tipo_origen: '' }));
  const m = calcular(sinTipo, detectar({ ...lectura, tareas: sinTipo }), {});
  assert.equal(m.equipos[0].medidas.bugs.disponible, false);
});

test('entregas: el detalle cuenta lo que da la cifra', () => {
  for (const e of r.modelo.equipos) {
    const d = detalleMedida(r.preparacion, e.nombre, 'entregas')!;
    assert.equal(d.filas.length, Math.round((e.medidas.entregas.valor as number) * 4), e.nombre);
  }
});

test('lead time y trabajo parado: el detalle trae los días de cada tarea, ordenados', () => {
  const e = eq('Payments');
  const d = detalleMedida(r.preparacion, e.nombre, 'ciclo')!;
  assert.ok(d.filas.length >= 5);
  assert.ok(d.filas.every((f, i) => i === 0 || (f.dias as number) <= (d.filas[i - 1].dias as number)));
  const parado = detalleMedida(r.preparacion, e.nombre, 'edad', { umbralEdad: e.umbralEdad })!;
  assert.equal(parado.filas.length, e.medidas.edad.valor);
});

test('referencia: establecida con 12 semanas, provisional con 6 a 11, sin banda con menos', () => {
  assert.equal(estadoReferencia({ lo: 1, hi: 2, med: 1.5, n: 12 }, 12), 'establecida');
  assert.equal(estadoReferencia({ lo: 1, hi: 2, med: 1.5, n: 8 }, 12), 'provisional');
  assert.equal(estadoReferencia(undefined, 12), 'sin');
  for (const e of r.modelo.equipos) assert.equal(e.medidas.entregas.referencia, 'establecida', e.nombre);
  // Con 9 semanas de historia la banda no llega a 12 semanas
  const tareas = lectura.tareas.filter((t) => t.fechas.creada >= new Date(2026, 6, 20));
  const corto = calcular(tareas, detectar({ ...lectura, tareas }), {});
  assert.ok(corto.equipos.some((e) => e.medidas.entregas.referencia !== 'establecida'));
});

test('qué decide el semáforo: Rework del área en atención por el límite del 20 %, aunque esté por debajo de su banda', () => {
  const m = r.area.equipos[0].medidas.retrabajo;
  assert.equal(m.estado, 'atencion');
  assert.equal(m.estadoPor, 'limite');
  assert.equal(m.limite, 0.2);
  assert.ok((m.valor as number) < m.ref!.lo, 'por debajo de su banda');
  const banda = eq('Risk').medidas.retrabajo;
  assert.equal(banda.estadoPor, 'banda');
});

test('Carried over del área: los sprints se cuentan por equipo y el área conserva la medida', () => {
  assert.ok(r.modelo.equipos.every((e) => e.sprints.fiables));
  const a = r.area.equipos[0];
  assert.ok(a.sprints.fiables, a.sprints.motivo || '');
  assert.equal(a.medidas.arrastradas.disponible, true);
});

test('campo de equipo: reconoce "Assigned Team" con más de 25 equipos', () => {
  const equipos = Array.from({ length: 30 }, (_, i) => 'Squad ' + (i + 1));
  const filas = ['Issue key,Summary,Issue Type,Status,Created,Resolved,Assigned Team,Component/s'];
  let n = 1;
  for (const eqn of equipos) for (let k = 0; k < 5; k++) filas.push(`CL-${n++},Task ${n},Story,Done,01/Sep/26 10:00 AM,15/Sep/26 10:00 AM,${eqn},Comp ${k}`);
  const l = leerJira([{ nombre: 'equipos.csv', texto: filas.join('\n') }]);
  const d = detectar(l);
  assert.equal(d.equipoRecomendado, 'equipo');
  assert.equal(d.opcionesEquipo.find((o) => o.id === 'equipo')!.valores.length, 30);
});

// ---------- asistente ----------
const paq = r.paquete;
const pagos = paq.medidas.equipos['Payments'] as any;

test('asistente: la petición lleva el paquete, el idioma y el formato de respuesta', () => {
  const p = peticionChat(paq, '¿Cómo va Payments?', { idioma: 'es', rol: 'direccion', equipo: 'Payments' });
  assert.match(p.system, /castellano/);
  assert.match(p.system, /"cifras"/);
  assert.match(p.user, /Payments/);
  assert.doesNotMatch(p.user, /Risk/, 'recortado al equipo');
  const en = peticionResumen(paq, { idioma: 'en', rol: 'pmo' });
  assert.match(en.system, /plain English/);
});

test('asistente: respuesta con cifras del paquete pasa; con una cifra inventada no', async () => {
  const v = pagos.entregas.valor as number;
  const buena = { respuesta: `Payments entrega ${String(Math.round(v * 10) / 10).replace('.', ',')} tareas por semana en las últimas 4 semanas.`, cifras: [{ equipo: 'Payments', medida: 'entregas', valor: v }] };
  const ok = validarChat(await proveedorFalso({ chat: buena })(peticionChat(paq, 'x', { idioma: 'es', rol: 'equipo' })), paq);
  assert.equal(ok.ok, true, ok.problemas.join(' | '));
  const mala = { respuesta: 'Payments entrega 37 tareas por semana.', cifras: [{ equipo: 'Payments', medida: 'entregas', valor: 37 }] };
  const no = validarChat(JSON.stringify(mala), paq);
  assert.equal(no.ok, false);
  assert.equal(no.respuesta, null);
  // Un número en el texto que no está en las cifras tampoco pasa
  const suelta = { respuesta: `Payments entrega ${v} tareas y tiene 73 bugs abiertos.`, cifras: [{ equipo: 'Payments', medida: 'entregas', valor: v }] };
  assert.equal(validarChat(JSON.stringify(suelta), paq).ok, false);
});

test('asistente: porcentajes guardados como fracción, fechas, nombres y ventanas no cuentan como cifras', () => {
  const rw = (paq.medidas.area as any).retrabajo.valor as number;
  const t = { respuesta: `En las últimas 8 semanas, el retrabajo del área es del ${Math.round(rw * 100)} %. Datos hasta el 2026-10-15. 2 equipos con alerta.`, cifras: [{ equipo: null, medida: 'retrabajo', valor: rw }] };
  const res = validarChat(JSON.stringify(t), paq);
  assert.equal(res.ok, true, res.problemas.join(' | '));
});

test('asistente: equipo desconocido, JSON roto y rayas', () => {
  assert.equal(validarChat(JSON.stringify({ respuesta: 'x', cifras: [{ equipo: 'Ghost', medida: 'entregas', valor: 1 }] }), paq).ok, false);
  assert.equal(validarChat('no es json', paq).ok, false);
  const conRaya = validarChat(JSON.stringify({ respuesta: 'Payments va bien — sin alertas.', cifras: [] }), paq);
  assert.equal(conRaya.ok, true);
  assert.doesNotMatch(conRaya.respuesta!.respuesta, /[—–]/);
});

test('asistente: el paquete de un equipo no trae datos de otros equipos', () => {
  const p = paqueteDeEquipo(paq, 'Risk');
  assert.deepEqual(Object.keys(p.medidas.equipos), ['Risk']);
  assert.ok(p.casos_activos.every((c) => c.equipo === 'Risk'));
});
