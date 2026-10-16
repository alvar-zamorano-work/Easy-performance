// Export sintético con fallos: cada fallo sembrado en datos-sinteticos/fallos lo detecta la comprobación
// de fiabilidad que le corresponde, en el área, en el equipo afectado o en los dos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { ficherosFallos } from '../herramientas/generar-sinteticos-fallos.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import { configDesdeCliente, type ClienteV2 } from '../nucleo/cliente.ts';
import { fiabilidad, COMPROBACIONES_EQUIPO } from '../nucleo/fiabilidad.ts';

const DIR = join(SINTETICOS, 'fallos');
const leer = (...p: string[]) => readFileSync(join(DIR, ...p), 'utf8');
const escenarios = JSON.parse(leer('escenarios.json'));
const cliente: ClienteV2 = JSON.parse(leer('cliente', 'cliente.json'));
const lectura = leerJira([{ nombre: 'jira-con-fallos.csv', texto: leer('jira-con-fallos.csv') }]);
const cfg = configDesdeCliente(cliente);
const r = diagnosticar(lectura, cliente, [], null, { config: cfg, generado: new Date(2026, 9, 15) });
const f = fiabilidad(lectura, r.det, r.preparacion, r.modelo, cfg);

test('el export con fallos sale idéntico al regenerarlo', () => {
  const nuevos = ficherosFallos();
  assert.deepEqual(Object.keys(nuevos).sort(), ['cliente/cliente.json', 'escenarios.json', 'jira-con-fallos.csv']);
  for (const [nombre, texto] of Object.entries(nuevos)) assert.equal(texto, leer(...nombre.split('/')), nombre);
});

test('hay un fallo sembrado por cada comprobación de fiabilidad', () => {
  const ids = escenarios.sembrados.map((s: { id: string }) => s.id).sort();
  assert.deepEqual(ids, f.comprobaciones.map((c) => c.id).sort());
  escenarios.sembrados.forEach((s: { que: string; tareas: number }) => { assert.ok(s.que.length > 20); assert.ok(s.tareas > 0); });
});

for (const s of escenarios.sembrados as { id: string; ambito: string; equipo: string | null }[]) {
  test('fallo sembrado ' + s.id + (s.equipo ? ' (' + s.equipo + ')' : '') + ': se detecta', () => {
    if (s.ambito === 'area' || s.ambito === 'ambos') {
      const c = f.comprobaciones.find((x) => x.id === s.id)!;
      assert.equal(c.estado, 'revisar', s.id + ': ' + c.valor + ' ' + c.detalle);
    }
    if ((s.ambito === 'equipo' || s.ambito === 'ambos') && (COMPROBACIONES_EQUIPO as readonly string[]).includes(s.id)) {
      const e = f.porEquipo.find((x) => x.equipo === s.equipo)!;
      assert.ok(e, 'el equipo ' + s.equipo + ' aparece');
      assert.equal(e.valores[s.id].estado, 'revisar', s.equipo + ' ' + s.id + ': ' + e.valores[s.id].valor);
    }
  });
}

test('los equipos sin fallo sembrado en una comprobación no se marcan en ella', () => {
  const sembrado = new Set(escenarios.sembrados.filter((s: { equipo: string | null }) => s.equipo).map((s: { id: string; equipo: string }) => s.equipo + '|' + s.id));
  f.porEquipo.forEach((e) => COMPROBACIONES_EQUIPO.forEach((k) => {
    if (!sembrado.has(e.equipo + '|' + k)) assert.notEqual(e.valores[k].estado, 'revisar', e.equipo + ' ' + k + ': ' + e.valores[k].valor);
  }));
});

test('con tantos fallos la fiabilidad es baja; con el export limpio de B3 es alta', () => {
  assert.equal(f.nivel, 'baja');
  const B3 = join(SINTETICOS, 'b3');
  const cb: ClienteV2 = JSON.parse(readFileSync(join(B3, 'cliente', 'cliente.json'), 'utf8'));
  const inis = readdirSync(join(B3, 'cliente', 'iniciativas')).sort().map((x) => JSON.parse(readFileSync(join(B3, 'cliente', 'iniciativas', x), 'utf8')));
  const lb = leerJira([{ nombre: 'jira-b3.csv', texto: readFileSync(join(B3, 'jira-b3.csv'), 'utf8') }]);
  const cfgB = configDesdeCliente(cb);
  const rb = diagnosticar(lb, cb, inis, null, { config: cfgB, generado: new Date(2026, 9, 15) });
  const fb = fiabilidad(lb, rb.det, rb.preparacion, rb.modelo, cfgB);
  assert.equal(fb.nivel, 'alta', fb.comprobaciones.filter((c) => c.estado === 'revisar').map((c) => c.id).join(', '));
});

test('el corte del export se avisa y las medidas no llegan a las semanas vacías', () => {
  assert.ok(r.det.avisos.some((a) => /casi no tienen actividad/.test(a.texto)));
  assert.ok(r.det.fechaRef < new Date(escenarios.fecha_export));
});
