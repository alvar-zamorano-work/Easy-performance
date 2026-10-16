// Tercer ejemplo: una aseguradora con un export de Jira en castellano y solo tres fallos sembrados.
// Cada fallo lo detecta su comprobación y las demás salen bien: sin falsas alarmas. También comprueba
// cómo se lee cada columna (personas descartadas, campo propio ignorado, equipo en Componentes).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { ficherosAseguradora } from '../herramientas/generar-sinteticos-aseguradora.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { describirColumnas } from '../adaptadores/jira/columnas.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import { configDesdeCliente, type ClienteV2 } from '../nucleo/cliente.ts';
import { fiabilidad, COMPROBACIONES_EQUIPO } from '../nucleo/fiabilidad.ts';
import { seguimiento } from '../nucleo/seguimiento.ts';

const DIR = join(SINTETICOS, 'aseguradora');
const leer = (...p: string[]) => readFileSync(join(DIR, ...p), 'utf8');
const escenarios = JSON.parse(leer('escenarios.json'));
const cliente: ClienteV2 = JSON.parse(leer('cliente', 'cliente.json'));
const iniciativas = readdirSync(join(DIR, 'cliente', 'iniciativas')).sort().map((f) => JSON.parse(leer('cliente', 'iniciativas', f)));
const texto = leer('jira-aseguradora.csv');
const lectura = leerJira([{ nombre: 'jira-aseguradora.csv', texto }]);
const cfg = configDesdeCliente(cliente);
const r = diagnosticar(lectura, cliente, iniciativas, null, { config: cfg, generado: new Date(2026, 9, 15) });
const f = fiabilidad(lectura, r.det, r.preparacion, r.modelo, cfg);
const sembradoEn = new Set<string>(escenarios.sembrados.map((s: { id: string }) => s.id));

test('el ejemplo de la aseguradora sale idéntico al regenerarlo', () => {
  for (const [nombre, t] of Object.entries(ficherosAseguradora())) assert.equal(t, leer(...nombre.split('/')), nombre);
});

test('aseguradora: cinco equipos distintos de los del banco, reconocidos por Componentes en un export en castellano', () => {
  assert.equal(r.det.equipoRecomendado, 'componentes');
  assert.deepEqual(r.modelo.equipos.map((e) => e.nombre).sort(), ['Canal digital', 'Datos y BI', 'Integraciones', 'Pólizas', 'Siniestros']);
  assert.ok(r.det.estados.some((e) => e.nombre === 'Listo' && e.estado === 'terminado'));
  assert.ok(!r.det.estados.some((e) => /^Estado \d/.test(e.nombre)), 'todos los estados tienen nombre');
});

for (const s of escenarios.sembrados as { id: string; ambito: string; equipo: string | null }[]) {
  test('aseguradora, fallo sembrado ' + s.id + ' (' + s.equipo + '): se detecta', () => {
    if (s.ambito !== 'equipo') assert.equal(f.comprobaciones.find((x) => x.id === s.id)!.estado, 'revisar', s.id);
    if (s.ambito !== 'area' && (COMPROBACIONES_EQUIPO as readonly string[]).includes(s.id)) {
      assert.equal(f.porEquipo.find((x) => x.equipo === s.equipo)!.valores[s.id].estado, 'revisar', s.equipo + ' ' + s.id);
    }
  });
}

test('aseguradora: sin falsas alarmas, lo que no está sembrado sale bien y la fiabilidad es media', () => {
  f.comprobaciones.filter((c) => !sembradoEn.has(c.id)).forEach((c) => assert.notEqual(c.estado, 'revisar', c.id + ': ' + c.valor + ' ' + c.detalle));
  const porEquipo = new Set<string>(escenarios.sembrados.map((s: { id: string; equipo: string }) => s.equipo + '|' + s.id));
  f.porEquipo.forEach((e) => COMPROBACIONES_EQUIPO.forEach((k) => {
    if (!porEquipo.has(e.equipo + '|' + k)) assert.notEqual(e.valores[k].estado, 'revisar', e.equipo + ' ' + k);
  }));
  assert.equal(f.nivel, 'media');
  assert.equal(f.revisar, escenarios.sembrados.length);
});

test('aseguradora: un equipo sin sprints no es un fallo (no aplica y sin aviso de calidad)', () => {
  for (const s of escenarios.sin_fallo as { id: string; equipo: string }[]) {
    assert.equal(f.porEquipo.find((x) => x.equipo === s.equipo)!.valores[s.id].estado, 'sin');
    assert.deepEqual(r.modelo.equipos.find((e) => e.nombre === s.equipo)!.calidad.avisos, []);
  }
});

test('aseguradora: cómo se lee cada columna; personas y comentarios se descartan y ningún nombre llega al modelo', () => {
  const cols = describirColumnas(texto);
  const de = (n: string) => cols.find((c) => c.columna === n)!;
  for (const n of ['Persona asignada', 'Informador', 'Creador', 'Comentario']) { assert.equal(de(n).accion, 'descarta', n); assert.equal(de(n).ejemplo, null, n); }
  assert.equal(de('Campo personalizado (Ramo)').accion, 'ignora');
  assert.equal(de('Componentes').campo, 'componentes');
  assert.equal(de('Sprint').veces, 2);
  assert.equal(de('Estado').accion, 'usa');
  assert.ok(!JSON.stringify(lectura.tareas).includes('Persona '), 'ningún valor de una columna de personas llega a las tareas');
});

test('aseguradora: una iniciativa funciona y otra acaba de empezar', () => {
  const estados = Object.fromEntries(r.iniciativas.map((x) => [x.iniciativa.id, seguimiento(x.iniciativa, x.evaluacion, r.preparacion).estado]));
  assert.deepEqual(estados, { 'definicion-listo-siniestros': 'funciona', 'limite-wip-canal-digital': 'midiendo' });
});
