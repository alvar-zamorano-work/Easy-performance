// Contrato de campos de Jira: las mismas tareas, escritas como cada tipo de export (Cloud CSV, nombres "work item",
// castellano, Server / Data Center CSV y su "Excel" HTML), tienen que llegar al modelo con los mismos valores en cada
// campo que ese formato trae. Si un formato deja un campo sin leer, o lo lee distinto, el test dice cuál y en qué tareas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatos, type CampoContrato, type Formato } from './formatos.ts';
import { HOY } from './variantes.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { leerHoja, aCsv } from '../adaptadores/comun/hoja.ts';
import { detectar } from '../nucleo/detectar.ts';
import { calcular } from '../nucleo/calcular.ts';
import type { Tarea } from '../nucleo/modelo.ts';

const F = formatos();
async function leer(f: Formato) {
  const texto = f.html ? aCsv((await leerHoja(new TextEncoder().encode(f.texto))).filas) : f.texto;
  return leerJira([{ nombre: f.nombre, texto, formato: f.html ? 'html' : 'csv' }], { hoy: HOY });
}
const fecha = (d: Date | null | undefined) => (d ? d.toISOString() : '');
const lista = (x: string[] | undefined) => (x || []).slice().sort().join(' | ');
function valor(t: Tarea, c: CampoContrato): string {
  switch (c) {
    case 'tipo': return t.tipo;
    case 'estado': return t.estado_normalizado + ' (' + t.estado_origen + ')';
    case 'creada': return fecha(t.fechas.creada);
    case 'actualizada': return fecha(t.fechas.actualizada);
    case 'terminada': return fecha(t.fechas.terminada);
    case 'cambio_estado': return fecha(t.fechas.cambio_estado);
    case 'primera': return fecha(t.fechas.primera_respuesta);
    case 'sprints': return lista(t.sprints);
    case 'etiquetas': return lista(t.etiquetas);
    case 'equipo': return t.agrupadores.equipo || '';
    case 'componentes': return t.agrupadores.componentes || '';
    case 'estimacion': return String(t.estimacion ?? '');
    case 'epica': return t.padre_id || '';
    case 'prioridad': return String(t.prioridad ?? '');
    case 'descartada': return String(t.descartada);
    case 'enlaces': return String(t.enlaces);
    case 'tiempos': return t.tiempos_estado.map((x) => x.estado + ':' + x.visitas + ':' + Math.round(x.ms)).sort().join(' | ');
  }
}

const referencia = await leer(F.cloudCsv);
const porClave = new Map(referencia.tareas.map((t) => [t.clave_origen, t]));

test('el formato de referencia trae valor en todos sus campos (si no, el contrato no probaría nada)', () => {
  for (const c of F.cloudCsv.lleva) assert.ok(referencia.tareas.some((t) => valor(t, c) && valor(t, c) !== 'false' && valor(t, c) !== '0'), 'sin ningún valor: ' + c);
  assert.ok(referencia.tareas.some((t) => t.etiquetas.length > 1), 'alguna tarea con dos etiquetas');
  assert.ok(referencia.tareas.some((t) => t.sprints.length > 1), 'alguna tarea con dos sprints');
});

for (const [id, f] of Object.entries(F)) {
  if (id === 'cloudCsv') continue;
  test(`contrato de campos: ${f.que}`, async () => {
    const l = await leer(f);
    assert.deepEqual(l.tareas.map((t) => t.clave_origen).sort(), [...porClave.keys()].sort(), 'las mismas tareas');
    const fallos: string[] = [];
    for (const c of f.lleva) {
      const malas = l.tareas.filter((t) => valor(t, c) !== valor(porClave.get(t.clave_origen)!, c));
      if (malas.length) fallos.push(`${c}: ${malas.length} tareas (${malas[0].clave_origen}: «${valor(malas[0], c)}» en vez de «${valor(porClave.get(malas[0].clave_origen)!, c)}»)`);
    }
    assert.deepEqual(fallos, [], fallos.join('\n'));
  });
}

test('mismas cifras por equipo en todos los formatos: entregas, tiempo de ciclo, tiempo total, bugs, velocidad y arrastre', async () => {
  const cifras = (m: ReturnType<typeof calcular>) => Object.fromEntries(m.equipos.map((e) => [e.nombre,
    ['entregas', 'ciclo', 'total', 'bugs', 'velocidad', 'arrastradas'].map((id) => { const x = e.medidas[id]; return id + '=' + (x && x.disponible && x.valor != null ? (+x.valor).toFixed(4) : '-'); }).join(' ')]));
  const ref = cifras(calcular(referencia.tareas, detectar(referencia), {}));
  for (const [id, f] of Object.entries(F)) {
    const l = await leer(f);
    assert.deepEqual(cifras(calcular(l.tareas, detectar(l), {})), ref, id);
  }
});

test('tipos de tarea: "Incident" y "Defect" son bugs; "Incidencia" (cualquier tarea de Jira en castellano) no', async () => {
  const { tipoDe } = await import('../adaptadores/jira/ingerir.ts');
  for (const x of ['Bug', 'Incident', 'Incidente', 'Defect', 'Defecto', 'Production Incident']) assert.equal(tipoDe(x), 'error', x);
  for (const x of ['Incidencia', 'Story', 'Task', 'Tarea']) assert.notEqual(tipoDe(x), 'error', x);
});

test('columnas raras: una fecha propia de inicio se sugiere, y al elegirla a mano se mide el tiempo de ciclo', async () => {
  const { variantes } = await import('./variantes.ts');
  const V = variantes();
  const l = leerJira(V.conFechaInicio.ficheros, { hoy: HOY });
  const sug = l.informe.columnasSugeridas || [];
  assert.ok(sug.some((x) => x.columna === 'Custom field (Start Date)' && x.campo === 'empezada'), JSON.stringify(sug));
  assert.ok(!sug.some((x) => /Team Lead/.test(x.columna)), 'una columna de personas nunca se sugiere');
  const sinElegir = calcular(l.tareas, detectar(l), {});
  assert.ok(sinElegir.equipos.every((e) => !e.medidas.ciclo.disponible), 'sin elegirla no se inventa el tiempo de ciclo');
  const conInicio = leerJira(V.conFechaInicio.ficheros, { hoy: HOY, columnas: { empezada: 'Custom field (Start Date)' } });
  assert.ok(conInicio.tareas.some((t) => t.fechas.empezada));
  assert.ok(!(conInicio.informe.columnasSugeridas || []).some((x) => x.campo === 'empezada'), 'elegida, ya no se sugiere');
  const m = calcular(conInicio.tareas, detectar(conInicio), {});
  for (const e of m.equipos) {
    assert.ok(e.medidas.ciclo.disponible, e.nombre);
    assert.ok(e.medidas.ciclo.valor! > 0 && e.medidas.ciclo.valor! <= 3.01, e.nombre + ' ' + e.medidas.ciclo.valor);
  }
});

test('elección a mano "No usar": quita el campo aunque se reconozca por su nombre', async () => {
  const { NO_USAR } = await import('../adaptadores/comun/cabecera.ts');
  const l = leerJira([{ nombre: F.cloudCsv.nombre, texto: F.cloudCsv.texto }], { hoy: HOY, columnas: { equipo: NO_USAR, sprint: NO_USAR } });
  assert.ok(l.tareas.every((t) => !t.agrupadores.equipo && !t.sprints.length));
  assert.equal(l.informe.columnasUsadas![F.cloudCsv.nombre].equipo, undefined);
});

test('celdas con una lista JSON (export "Data pipeline" de Data Center) se leen como varios valores', async () => {
  const { partirValores } = await import('../adaptadores/jira/columnas.ts');
  assert.deepEqual(partirValores('etiquetas', '["calidad","deuda-tecnica"]'), ['calidad', 'deuda-tecnica']);
  assert.deepEqual(partirValores('sprint', '[{"name":"Sprint 1"},{"name":"Sprint 2"}]'), ['Sprint 1', 'Sprint 2']);
  assert.deepEqual(partirValores('sprint', 'Sprint 1, Sprint 2'), ['Sprint 1', 'Sprint 2']);
  assert.deepEqual(partirValores('componentes', 'API'), ['API']);
});

test('columnas usadas: cada fichero dice de qué columna sale cada campo', async () => {
  for (const f of Object.values(F)) {
    const l = await leer(f);
    const u = l.informe.columnasUsadas![f.nombre];
    assert.ok(u && u.clave && u.creada && u.estado && u.equipo, f.nombre + ' ' + JSON.stringify(u));
  }
});

// ---------- Casos sueltos de la revisión independiente, con exports mínimos escritos a mano ----------
const csvMin = (cab: string[], filas: string[][]) => [cab, ...filas].map((f) => f.map((v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(',')).join('\n');
const leerMin = (cab: string[], filas: string[][], formato = 'csv', columnas?: Record<string, string>) =>
  leerJira([{ nombre: 'min.' + (formato === 'csv' ? 'csv' : 'xls'), texto: csvMin(cab, filas), formato }], { hoy: HOY, columnas });
const F0 = '01/Sep/26 9:00 AM', F1 = '10/Sep/26 9:00 AM';

test('una coma en un CSV es parte del nombre; en una hoja de Excel separa valores', () => {
  const cab = ['Issue key', 'Issue Type', 'Status', 'Created', 'Resolved', 'Sprint', 'Components'];
  const fila = ['A-1', 'Story', 'Done', F0, F1, 'Sprint 12 (Oct 1, 2026)', 'Billing, Payments'];
  const csv = leerMin(cab, [fila]).tareas[0];
  assert.deepEqual(csv.sprints, ['Sprint 12 (Oct 1, 2026)']);
  assert.equal(csv.agrupadores.componentes, 'Billing, Payments');
  const xl = leerMin(cab, [['A-1', 'Story', 'Done', F0, F1, 'S1, S2', 'Billing, Payments']], 'html').tareas[0];
  assert.deepEqual(xl.sprints, ['S1', 'S2']);
  assert.equal(xl.agrupadores.componentes, 'Billing');
});

test('enlaces: la misma tarea enlazada en dos columnas cuenta una vez', () => {
  const cab = ['Issue key', 'Issue Type', 'Status', 'Created', 'Outward issue link (Blocks)', 'Inward issue link (Blocks)', 'Linked Issues'];
  const t = leerMin(cab, [['A-1', 'Story', 'To Do', F0, 'A-2', 'A-3', 'A-2, [A-3], A-4']]).tareas[0];
  assert.equal(t.enlaces, 3);
});

test('épica por "Epic Link": clave, id numérico, nombre único; nombre repetido o con guion no se adivina', () => {
  const cab = ['Issue key', 'Issue id', 'Issue Type', 'Status', 'Created', 'Summary', 'Epic Name', 'Epic Link'];
  const filas = [
    ['E-1', '101', 'Epic', 'To Do', F0, 'Login', 'Cobros', ''],
    ['E-2', '102', 'Epic', 'To Do', F0, 'Login', '', ''],
    ['E-3', '103', 'Epic', 'To Do', F0, 'Phase-2', '', ''],
    ['A-1', '201', 'Story', 'To Do', F0, 'x', '', 'e-1'],
    ['A-2', '202', 'Story', 'To Do', F0, 'x', '', '102'],
    ['A-3', '203', 'Story', 'To Do', F0, 'x', '', 'Cobros'],
    ['A-4', '204', 'Story', 'To Do', F0, 'x', '', 'Login'],
    ['A-5', '205', 'Story', 'To Do', F0, 'x', '', 'Phase-2'],
    ['A-6', '206', 'Story', 'To Do', F0, 'x', '', 'OTRO-9'],
  ];
  const l = leerMin(cab, filas);
  const epica = Object.fromEntries(l.tareas.map((t) => [t.clave_origen, t.padre_id]));
  assert.deepEqual(epica, { 'A-1': 'E-1', 'A-2': 'E-2', 'A-3': 'E-1', 'A-4': null, 'A-5': 'E-3', 'A-6': 'OTRO-9' });
  assert.ok(l.informe.avisos.some((a) => /varias épicas|several epics/.test(a.texto)), 'se avisa del nombre repetido');
});

test('columnas de personas: nunca se leen, ni elegidas a mano', () => {
  const cab = ['Issue key', 'Issue Type', 'Status', 'Created', 'Custom field (Team Lead)', 'Assignee', 'Custom field (Team)'];
  const l = leerMin(cab, [['A-1', 'Story', 'To Do', F0, 'Jorge Gil', 'Marta Ruiz', 'Pagos'], ['A-2', 'Story', 'To Do', F0, 'Ana Paz', 'Eva Sanz', 'Datos']], 'csv',
    { equipo: 'Custom field (Team Lead)', etiquetas: 'Assignee' });
  assert.ok(l.tareas.every((t) => !/Gil|Paz|Ruiz|Sanz/.test(t.agrupadores.equipo + ' ' + t.etiquetas.join(' '))), JSON.stringify(l.tareas.map((t) => [t.agrupadores.equipo, t.etiquetas])));
});

test('columnas de personas por su papel; las que solo se parecen no', async () => {
  const { esColumnaPrivada } = await import('../adaptadores/comun/describir.ts');
  for (const h of ['Team Lead', 'Scrum Master', 'QA Lead', 'Lead Engineer', 'Lead', 'Developer', 'Testers', 'Approvers', 'Request participants', 'Solicitante', 'Custom field (Responsable técnico)', 'Product Owner'])
    assert.ok(esColumnaPrivada(h), h);
  for (const h of ['Lead Time', 'Custom field (Lead time)', 'Ownership', 'Managed services', 'Assigned Team', 'Sprint'])
    assert.ok(!esColumnaPrivada(h), h);
});

test('elegir a mano un campo de varias columnas (Sprint en Cloud) toma todas', () => {
  const cab = ['Issue key', 'Issue Type', 'Status', 'Created', 'Sprint', 'Sprint'];
  const t = leerMin(cab, [['A-1', 'Story', 'To Do', F0, 'S1', 'S2']], 'csv', { sprint: 'Sprint' }).tareas[0];
  assert.deepEqual(t.sprints, ['S1', 'S2']);
});

test('sugerencias: "No usar" no se vuelve a proponer; fechas planificadas, estimaciones en segundos y versiones no confunden', async () => {
  const { NO_USAR } = await import('../adaptadores/comun/cabecera.ts');
  const cab = ['Issue key', 'Issue Type', 'Status', 'Created', 'Custom field (Team)', 'Target start', 'Original Estimate', 'Fix Version/s', 'Custom field (Actual start)'];
  const filas = Array.from({ length: 12 }, (_, i) => ['A-' + i, 'Story', 'To Do', F0, i % 2 ? 'Pagos' : 'Datos', '05/Sep/26', '28800', '2.1.' + (10 + i), '03/Sep/26 10:00 AM']);
  const sug = (leerMin(cab, filas, 'csv', { equipo: NO_USAR }).informe.columnasSugeridas || []).map((x) => x.columna + '=' + x.campo);
  assert.ok(!sug.some((x) => /Team/.test(x)), 'el equipo que no se usa no se propone: ' + sug);
  assert.ok(sug.includes('Target start=fecha') && !sug.includes('Target start=empezada'), 'una fecha planificada no es el inicio: ' + sug);
  assert.ok(!sug.some((x) => /Original Estimate/.test(x)), 'una estimación en segundos no son puntos: ' + sug);
  assert.ok(!sug.some((x) => /Fix Version/.test(x)), 'una versión no es una fecha: ' + sug);
  assert.ok(sug.includes('Custom field (Actual start)=empezada'), sug.join(', '));
});
