// Lectura de CSV y fechas de Jira.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCSV } from '../adaptadores/comun/csv.ts';
import { leerFecha } from '../adaptadores/jira/fechas.ts';
import { mapearColumnas } from '../adaptadores/jira/columnas.ts';
import { cuantil, spearman } from '../nucleo/util.ts';

test('CSV con BOM, comillas, saltos de línea dentro de un campo y punto y coma', () => {
  assert.deepEqual(leerCSV('﻿a,b\n"x, y","línea 1\nlínea 2"\n'), [['a', 'b'], ['x, y', 'línea 1\nlínea 2']]);
  assert.deepEqual(leerCSV('a;b\r\n1;"dice ""hola"""\r\n'), [['a', 'b'], ['1', 'dice "hola"']]);
});

test('fechas de Jira en inglés, en castellano e ISO', () => {
  assert.equal(leerFecha('12/Oct/26 8:12 AM')?.toISOString(), new Date(2026, 9, 12, 8, 12).toISOString());
  assert.equal(leerFecha('09/oct/26 4:57 PM')?.getHours(), 16);
  assert.equal(leerFecha('3/dic/25 12:05 AM')?.getHours(), 0);
  assert.equal(leerFecha('2026-10-13 08:53:58.554')?.getMinutes(), 53);
  assert.equal(leerFecha('15/10/2026 9:30')?.getMonth(), 9);
  assert.equal(leerFecha(''), null);
});

test('columnas en castellano y "Custom field (...)"', () => {
  const m = mapearColumnas(['Clave de incidencia', 'Tipo de incidencia', 'Estado', 'Campo personalizado (Puntos de historia)', 'Sprint', 'Sprint', 'Asignado']);
  assert.equal(m.clave, 0);
  assert.equal(m.tipo, 1);
  assert.equal(m.puntos, 3);
  assert.deepEqual(m.sprint, [4, 5]);
  assert.equal(Object.values(m).flat().includes(6), false, 'no lee la columna de la persona asignada');
});

test('estadística básica', () => {
  assert.equal(cuantil([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(cuantil([null, 10, 20], 0.85), 18.5);
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
});
