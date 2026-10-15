// Propuesta de estado normalizado: misma etapa que la v0 para cualquier nombre de estado,
// salvo los arreglos deliberados para Jira en castellano ("Listo").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { proponerEstado, etapaDe, etapasV0AMapeo } from '../nucleo/estados.ts';
import { norm } from '../nucleo/util.ts';

const v0 = createRequire(import.meta.url)('./referencia-v0/motor.js') as { etapaPropuesta: (n: string, c: string) => string };
const esBloqueoV0 = (n: string) => /block|bloque|imped|hold|pausa/.test(norm(n));

const palabras = ['to do', 'todo', 'por hacer', 'backlog', 'open', 'abierta', 'nuevo', 'new', 'pendiente', 'ready', 'selected for development',
  'refinamiento', 'análisis', 'in progress', 'en curso', 'en progreso', 'doing', 'desarrollo', 'development', 'haciendo', 'implementación',
  'working', 'in dev', 'coding', 'in review', 'code review', 'revisión', 'qa', 'testing', 'pruebas', 'validación', 'blocked', 'bloqueado',
  'waiting for customer', 'esperando', 'on hold', 'en pausa', 'impedimento', 'ready for qa', 'listo para pruebas', 'por desplegar',
  'to deploy', 'aprobación', 'approval', 'done', 'hecho', 'finalizada', 'cerrada', 'closed', 'resolved', 'resuelta', 'complete',
  'terminado', 'released', 'desplegado', 'entregado', 'cancelled', 'descartada', "won't do", 'duplicate', 'obsoleta', 'rechazada',
  'reopened', 'triage', 'estado 10005', 'quality assurance', 'staging', 'uat'];
const categorias = ['', 'To Do', 'In Progress', 'Done', 'Por hacer', 'En curso', 'Hecho', 'Finalizada', 'Completed', 'Indeterminate'];

test('misma etapa que la v0 (y mismo bloqueo en curso o espera) para cientos de nombres y categorías', () => {
  const nombres = new Set<string>(palabras);
  for (const a of palabras) for (const b of palabras.slice(0, 25)) nombres.add(a + ' ' + b);
  let comprobados = 0;
  for (const n of nombres) {
    // Arreglos deliberados sobre la v0: "Listo" es Done en Jira en castellano; "Selected for Development" está sin empezar.
    if (/\blisto\b|selected for|seleccionad[oa]s? para|ready for (dev|develop)/.test(norm(n))) continue;
    for (const c of categorias) {
      const p = proponerEstado(n, c), etapa = etapaDe(p), etapaV0 = v0.etapaPropuesta(n, c);
      assert.equal(etapa, etapaV0, `"${n}" (${c}): ${p}`);
      if (etapa === 'curso' || etapa === 'espera') assert.equal(p === 'bloqueado', esBloqueoV0(n), `bloqueo "${n}"`);
      comprobados++;
    }
  }
  assert.ok(comprobados > 10000, String(comprobados));
});

test('Jira en castellano y nombres habituales', () => {
  const casos: [string, string, string][] = [
    ['Tareas por hacer', 'Por hacer', 'pendiente'], ['En curso', 'En curso', 'en_curso'], ['Listo', 'Listo', 'terminado'],
    ['Listo para pruebas', 'En curso', 'en_pruebas'], ['Listo para desplegar', 'En curso', 'en_espera'], ['En revisión', '', 'en_revision'], ['QA', '', 'en_pruebas'],
    ['Bloqueado', '', 'bloqueado'], ['Backlog', '', 'nuevo'], ['Selected for Development', 'To Do', 'pendiente'], ['Ready for development', '', 'pendiente'],
    ['Cancelada', 'Done', 'descartado'], ['Cancelada', 'To Do', 'pendiente'], ['Estado 10005', '', 'pendiente'],
  ];
  for (const [n, c, e] of casos) assert.equal(proponerEstado(n, c), e, n);
});

test('cliente.json de la v0: las etapas pasan a estados normalizados', () => {
  const propuesto = { 'In Review': 'en_revision', 'Blocked': 'bloqueado', 'Done': 'terminado' } as const;
  assert.deepEqual(etapasV0AMapeo({ 'In Review': 'espera', 'Blocked': 'curso', 'Done': 'hecho', 'Nuevo': 'pendiente' }, propuesto), {
    'In Review': 'en_revision', 'Blocked': 'en_curso', 'Done': 'terminado', 'Nuevo': 'pendiente',
  });
});
