// Banco de exports: el mismo trabajo exportado de formas distintas debe dar el mismo resultado,
// y los exports incompletos deben dar los avisos y las medidas "sin datos" que tocan.
// Cada export real que aparezca se añade a datos-prueba/ con su fichero .esperado.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PRUEBA, SINTETICOS, json, recorrido } from './ayudas.ts';
import { aTabla, cambiarColumna, enCastellano, fechaNumerica, fichero, quitarColumna, COLUMNAS_FECHA, type Tabla } from './banco/variantes.ts';
import { validar } from '../esquemas/validar.ts';
import type { Modelo } from '../nucleo/tipos.ts';
import type { FicheroEntrada } from '../nucleo/modelo.ts';

const BASE_NOMBRE = 'jira-ejemplo-completo-2026-10-12.csv';
const base: Tabla = aTabla(readFileSync(join(SINTETICOS, BASE_NOMBRE), 'utf8'));
const r0 = recorrido([fichero('base.csv', base)]);

/** Lo que importa de un resultado: por equipo, tareas, medidas (disponible, valor, semáforo) y casos. */
function resumen(m: Modelo, decimales = 9) {
  const r = (x: number | null | undefined) => (x == null ? null : Math.round(x * 10 ** decimales) / 10 ** decimales);
  return m.equipos.map((e) => ({
    equipo: e.nombre, n: e.n, entregadas: e.entregadas,
    medidas: Object.fromEntries(Object.values(e.medidas).map((x) => [x.id, [x.disponible, r(x.valor), x.estado ?? null]])),
    casos: e.casos.map((c) => c.id + ':' + c.gravedad),
  }));
}
const casosPorEquipo = (m: Modelo) => Object.fromEntries(m.equipos.map((e) => [e.nombre, e.casos.map((c) => c.id).sort()]));
const avisos = (r: ReturnType<typeof recorrido>) => [...r.lectura.informe.avisos, ...r.det.avisos].map((a) => a.texto);
const equipo = (m: Modelo, n: string) => m.equipos.find((e) => e.nombre === n)!;

test('el export base se lee entero', () => {
  assert.equal(r0.lectura.informe.tareas, 1434);
  assert.equal(r0.lectura.informe.epicas, 12);
  assert.equal(r0.modelo.equipos.length, 4);
});

test('Jira en castellano: cabeceras, fechas, estados, prioridades, tipos y resoluciones traducidos dan lo mismo', () => {
  const r = recorrido([fichero('es.csv', enCastellano(base))]);
  assert.deepEqual(r.det.mapeoEstados, {
    'Tareas por hacer': 'pendiente', 'En curso': 'en_curso', 'En revisión': 'en_revision', 'Bloqueado': 'bloqueado', 'Listo': 'terminado',
  });
  assert.equal(r.det.equipoRecomendado, 'equipo');
  assert.deepEqual(resumen(r.modelo), resumen(r0.modelo));
});

test('separador punto y coma y saltos de línea de Windows dan lo mismo', () => {
  const r = recorrido([fichero('pyc.csv', base, ';', '\r\n')]);
  assert.deepEqual(json(r.modelo), json(r0.modelo));
});

test('fechas numéricas (dd/mm/aaaa hh:mm) dan lo mismo', () => {
  let t = base;
  COLUMNAS_FECHA.forEach((c) => { t = cambiarColumna(t, c, fechaNumerica); });
  const r = recorrido([fichero('fechas.csv', t)]);
  assert.deepEqual(json(r.modelo), json(r0.modelo));
});

test('Tiempo en estado en segundos: se detecta la unidad y el resultado no cambia', () => {
  const t = cambiarColumna(base, 'Custom field ([CHART] Time in Status)', (v) =>
    v.split('_*|*_').map((p) => { const x = p.split('_*:*_'); return x.length === 3 ? [x[0], x[1], String(+x[2] / 1000)].join('_*:*_') : p; }).join('_*|*_'));
  const r = recorrido([fichero('segundos.csv', t)]);
  assert.equal(r.lectura.detalle.unidadTiempoMs, 1000);
  assert.deepEqual(resumen(r.modelo, 6), resumen(r0.modelo, 6));
});

test('sin Tiempo en estado: esas medidas quedan sin datos con su motivo y el resto sigue', () => {
  const r = recorrido([fichero('sin-tiempos.csv', quitarColumna(base, 'Custom field ([CHART] Time in Status)'))]);
  for (const e of r.modelo.equipos) {
    for (const id of ['ciclo', 'espera', 'retrabajo']) {
      assert.equal(e.medidas[id].disponible, false, `${e.nombre} ${id}`);
      assert.match(String(e.medidas[id].motivo), /Tiempo en estado/);
    }
    assert.ok(!e.casos.some((c) => ['mucha_espera', 'retrabajo'].includes(c.id)), e.nombre);
  }
  const portal = equipo(r.modelo, 'Portal clientes').casos.map((c) => c.id);
  assert.ok(portal.includes('pendiente_crece') && portal.includes('todo_urgente'));
  assert.ok(equipo(r.modelo, 'Datos').casos.some((c) => c.id === 'errores_capacidad'));
});

test('sin campo Equipo: propone reconocer los equipos por componente', () => {
  const r = recorrido([fichero('sin-equipo.csv', quitarColumna(base, 'Custom field (Team)'))]);
  assert.equal(r.det.equipoRecomendado, 'componentes');
  assert.ok(r.modelo.equipos.length >= 2);
});

test('sprints con nombre de fecha: no se usan como sprints y se avisa', () => {
  const fechas = new Map<string, string>();
  const t = cambiarColumna(base, 'Sprint', (v) => {
    if (!v) return v;
    if (!fechas.has(v)) fechas.set(v, new Date(Date.UTC(2026, 0, 1 + fechas.size)).toISOString().slice(0, 19) + '+0000');
    return fechas.get(v)!;
  });
  const r = recorrido([fichero('sprints-fecha.csv', t)]);
  assert.equal(r.det.sprintsComoFecha, true);
  assert.ok(avisos(r).some((a) => /parecen fechas/.test(a)));
  for (const e of r.modelo.equipos) {
    assert.equal(e.medidas.arrastradas.disponible, false);
    assert.ok(!e.casos.some((c) => ['sprint_no_cumple', 'todo_al_final'].includes(c.id)), e.nombre);
  }
});

test('export cortado en 1.000 filas: se avisa del límite de exportación', () => {
  const r = recorrido([fichero('cortado.csv', { cab: base.cab, filas: base.filas.slice(0, 1000) })]);
  assert.ok(avisos(r).some((a) => /justo 1\.?000 filas/.test(a)));
});

test('estados propios del cliente: se proponen bien y el resultado no cambia', () => {
  const nombres: Record<string, string> = { 'To Do': 'Backlog', 'In Progress': 'Desarrollo', 'In Review': 'Code Review', 'Blocked': 'Impedimento', 'Done': 'Cerrada' };
  const r = recorrido([fichero('estados.csv', cambiarColumna(base, 'Status', (v) => nombres[v] ?? v))]);
  assert.deepEqual(r.det.mapeoEstados, { Backlog: 'nuevo', Desarrollo: 'en_curso', 'Code Review': 'en_revision', Impedimento: 'bloqueado', Cerrada: 'terminado' });
  assert.deepEqual(resumen(r.modelo), resumen(r0.modelo));
});

test('ficheros que no son un export de Jira: error claro y ninguna tarea', () => {
  const casos: [FicheroEntrada, RegExp][] = [
    [{ nombre: 'otra-cosa.csv', texto: 'a,b\n1,2\n' }, /no tiene columna de clave/],
    [{ nombre: 'vacio.csv', texto: '' }, /vacío o no es un CSV/],
    [{ nombre: 'cabecera.csv', texto: base.cab.join(',') + '\n' }, /solo tiene la fila de títulos/],
  ];
  for (const [f, re] of casos) {
    const r = recorrido([f]);
    assert.equal(r.lectura.tareas.length, 0, f.nombre);
    assert.ok(r.lectura.informe.avisos.some((a) => re.test(a.texto)), f.nombre);
  }
});

// Exports de prueba reales (no de cliente) con su resultado esperado
const reales = existsSync(PRUEBA) ? readdirSync(PRUEBA).filter((n) => n.toLowerCase().endsWith('.csv')).sort() : [];
for (const nombre of reales) {
  const ruta = join(PRUEBA, nombre), rutaEsperado = ruta.replace(/\.csv$/i, '.esperado.json');
  test('export de prueba ' + nombre, () => {
    assert.ok(existsSync(rutaEsperado), 'falta ' + rutaEsperado);
    const e = JSON.parse(readFileSync(rutaEsperado, 'utf8'));
    const r = recorrido([{ nombre, texto: readFileSync(ruta, 'utf8') }]);
    assert.equal(r.lectura.informe.tareas, e.tareas, 'tareas');
    assert.equal(r.det.equipoRecomendado, e.equipoRecomendado, 'campo de equipo');
    assert.equal(r.det.sprintsComoFecha, e.sprintsComoFecha, 'sprints como fecha');
    assert.deepEqual(r.det.mapeoEstados, e.mapeoEstados, 'mapeo de estados');
    for (const a of e.avisosContienen) assert.ok(avisos(r).some((x) => x.includes(a)), 'aviso: ' + a);
    assert.deepEqual(casosPorEquipo(r.modelo), e.casos, 'casos por equipo');
  });
}

test('modelo neutro: todas las tareas cumplen el esquema y no llevan personas', () => {
  const exports: [string, string][] = [[BASE_NOMBRE, join(SINTETICOS, BASE_NOMBRE)], ...reales.map((n) => [n, join(PRUEBA, n)] as [string, string])];
  for (const [nombre, ruta] of exports) {
    const texto = readFileSync(ruta, 'utf8');
    const t = aTabla(texto);
    const r = recorrido([{ nombre, texto }]);
    const malas = r.lectura.tareas.map((x) => validar('modelo/tarea', json(x))).filter((v) => !v.valido);
    assert.equal(malas.length, 0, nombre + ': ' + (malas[0]?.errores.join('; ') ?? ''));
    // Valores de las columnas de personas: no pueden aparecer en ningún campo salvo el texto libre (título y descripción, solo en memoria)
    const personas = new Set<string>();
    t.cab.forEach((h, i) => { if (/^(assignee|reporter|creator|watchers|project lead)$/i.test(h)) t.filas.forEach((f) => { if (f[i]) personas.add(f[i]); }); });
    assert.ok(personas.size > 0, nombre + ': el export trae columnas de personas');
    const sinTextoLibre = r.lectura.tareas.map(({ titulo: _t, descripcion: _d, padre_titulo: _p, ...resto }) => resto);
    const todo = JSON.stringify(sinTextoLibre);
    const encontradas = [...personas].filter((p) => todo.includes(JSON.stringify(p)));
    assert.deepEqual(encontradas, [], nombre + ': hay datos de personas en el modelo neutro');
  }
});
