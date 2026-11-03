// Propuesta de estado normalizado: misma etapa que la v0 para cualquier nombre de estado,
// salvo los arreglos deliberados para Jira en castellano ("Listo").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { proponerEstado, explicarEstado, etapaDe, etapasV0AMapeo } from '../nucleo/estados.ts';
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
    // Arreglos deliberados sobre la v0: "Listo" es Done en Jira en castellano; "Selected for Development" está sin empezar;
    // "UAT", "Quality assurance" y "Staging" son esperas (pruebas o despliegue), no pendiente.
    if (/\blisto\b|selected for|seleccionad[oa]s? para|ready for (dev|develop)|\buat\b|quality assurance|staging/.test(norm(n))) continue;
    for (const c of categorias) {
      // "Indeterminate" es la clave interna de Jira para la categoría En curso: se reconoce como en curso, la v0 no.
      if (c === 'Indeterminate' && explicarEstado(n, c).por === 'categoria') continue;
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
    ['Cancelada', 'Done', 'descartado'], ['Cancelada', 'To Do', 'pendiente'], ['Status 10005', '', 'pendiente'],
    ['Active', '', 'en_curso'], ['Removed', '', 'descartado'], ['Committed', '', 'pendiente'], ['Approved', '', 'pendiente'], ['Deployed', '', 'terminado'],
    ['On Hold', '', 'bloqueado'], ['Scheduled', '', 'en_espera'], ['Authorize', '', 'en_revision'], ['Assess', '', 'pendiente'], ['UAT', '', 'en_pruebas'], ['Work in Progress', '', 'en_curso'],
  ];
  for (const [n, c, e] of casos) assert.equal(proponerEstado(n, c), e, n);
});

test('estados de exports reales que antes quedaban por defecto o mal', () => {
  const casos: [string, string, string, string][] = [
    ['In Acceptance', 'In Progress', 'en_pruebas', 'nombre'], ['En aceptación', 'En curso', 'en_pruebas', 'nombre'],
    ['In Clarification', 'To Do', 'pendiente', 'nombre'], ['In Clarification', 'In Progress', 'en_espera', 'nombre'],
    ['In Queue', 'To Do', 'pendiente', 'nombre'], ['En cola', 'Por hacer', 'pendiente', 'nombre'], ['Queued for deploy', 'In Progress', 'en_espera', 'nombre'],
    ['Bloq.', 'In Progress', 'bloqueado', 'nombre'],
    ['Fase 3', 'To Do', 'pendiente', 'categoria'], ['Fase 3', 'indeterminate', 'en_curso', 'categoria'], ['Fase 3', 'new', 'pendiente', 'categoria'],
    ['Fase 3', '', 'pendiente', 'defecto'],
    // Con categoría Hecho las reglas nuevas no mandan: siguen terminadas
    ['Clarified', 'Done', 'terminado', 'categoria'], ['Aclarado', 'Listo', 'terminado', 'categoria'],
    ['Acceptance', 'Done', 'terminado', 'categoria'], ['Deploy queue', 'Done', 'terminado', 'categoria'],
  ];
  for (const [n, c, e, por] of casos) assert.deepEqual(explicarEstado(n, c), { estado: e, por }, n + ' (' + c + ')');
});

test('cliente.json de la v0: las etapas pasan a estados normalizados', () => {
  const propuesto = { 'In Review': 'en_revision', 'Blocked': 'bloqueado', 'Done': 'terminado' } as const;
  assert.deepEqual(etapasV0AMapeo({ 'In Review': 'espera', 'Blocked': 'curso', 'Done': 'hecho', 'Nuevo': 'pendiente' }, propuesto), {
    'In Review': 'en_revision', 'Blocked': 'en_curso', 'Done': 'terminado', 'Nuevo': 'pendiente',
  });
});
