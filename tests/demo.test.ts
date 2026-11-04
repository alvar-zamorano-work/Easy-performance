// Datos de la demo: el fichero guardado es el que sale del generador, y los escenarios sembrados están donde se dice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { ficherosDemo, generarDemo } from '../herramientas/generar-sinteticos-demo.ts';

const { cab, filas } = generarDemo();
const col = (n: string) => cab.indexOf(n);
const deEquipo = (e: string) => filas.filter((f) => f[col('Custom field (Team)')] === e && f[col('Issue Type')] !== 'Epic');

test('demo: los ficheros guardados son los que da el generador', () => {
  for (const [nombre, texto] of Object.entries(ficherosDemo())) {
    assert.equal(readFileSync(join(SINTETICOS, 'demo', nombre), 'utf8'), texto, nombre + ' no coincide: vuelve a generar con node herramientas/generar-sinteticos-demo.ts');
  }
});

test('demo: diez equipos y los tres problemas de datos sembrados', () => {
  const equipos = new Set(filas.map((f) => f[col('Custom field (Team)')]));
  assert.equal(equipos.size, 10);
  // Fraud exporta sin tiempo en cada estado
  assert.ok(deEquipo('Fraud').length > 100 && deEquipo('Fraud').every((f) => f[col('Custom field ([CHART] Time in Status)')] === ''));
  // Lending: 22 tareas cerradas en el mismo minuto
  const cierre = deEquipo('Lending').filter((f) => f[col('Resolved')] === '28/Oct/26 6:02 PM');
  assert.equal(cierre.length, 22);
  // Identity: ninguna tarea antes del 20 de julio de 2026
  assert.ok(deEquipo('Identity').every((f) => !/\/(Feb|Mar|Apr|May|Jun)\/26/.test(f[col('Created')])));
  // Un bloqueo fuera de Fraud, para que el export diga cómo se llama ese estado
  assert.ok(filas.some((f) => f[col('Status')] === 'Blocked' && f[col('Custom field (Team)')] !== 'Fraud'));
});
