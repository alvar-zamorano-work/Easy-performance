// B1: el núcleo detecta los problemas sembrados en los cuatro equipos sintéticos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calcular } from '../nucleo/index.ts';
import { SINTETICOS, fichero, json, recorrido } from './ayudas.ts';

const esperado = JSON.parse(readFileSync(join(SINTETICOS, 'escenarios.json'), 'utf8')) as {
  tareas: number; equipos: string[]; casos_sembrados: Record<string, string[]>;
};

function modelo(...nombres: string[]) {
  const r = recorrido(nombres.map((n) => fichero(join(SINTETICOS, n))));
  return { tareas: r.lectura.tareas, informe: r.lectura.informe, det: r.det, modelo: r.modelo };
}

const completo = modelo('jira-ejemplo-completo-2026-10-12.csv');

test('lee el export completo y reconoce los cuatro equipos', () => {
  assert.equal(completo.informe.filasLeidas, esperado.tareas);
  assert.equal(completo.det.equipoRecomendado, 'equipo');
  assert.deepEqual(completo.modelo.equipos.map((e) => e.nombre).sort(), [...esperado.equipos].sort());
});

for (const equipo of esperado.equipos) {
  const sembrados = esperado.casos_sembrados[equipo];
  test(`${equipo}: ${sembrados.length ? 'detecta ' + sembrados.join(', ') : 'sin casos (equipo sano)'}`, () => {
    const eq = completo.modelo.equipos.find((e) => e.nombre === equipo);
    assert.ok(eq, 'existe el equipo');
    const detectados = eq.casos.map((c) => c.id);
    if (!sembrados.length) assert.deepEqual(detectados, [], 'un equipo sano no debe tener casos');
    for (const id of sembrados) assert.ok(detectados.includes(id), `falta el caso sembrado ${id}; detectados: ${detectados.join(', ')}`);
  });
}

test('unir dos exports solapados da lo mismo que el export completo', () => {
  const unido = modelo('jira-2026-10-12-parte-a.csv', 'jira-2026-04-06.csv');
  assert.ok(unido.informe.duplicadas > 0, 'los exports se solapan');
  assert.deepEqual(json(unido.modelo.equipos), json(completo.modelo.equipos));
});

test('el área unida no cambia los resultados de cada equipo', () => {
  const det = completo.det;
  const area = calcular(completo.tareas, det, { equipos: esperado.equipos, unirComo: 'El área' });
  assert.equal(area.equipos.length, 1);
  assert.equal(area.equipos[0].n, completo.modelo.equipos.reduce((s, e) => s + e.n, 0));
  const otraVez = calcular(completo.tareas, det, {});
  assert.deepEqual(json(otraVez.equipos), json(completo.modelo.equipos));
});
