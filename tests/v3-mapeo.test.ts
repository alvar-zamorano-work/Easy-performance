// Mapeo corregible por el cliente: tipos de tarea, etiqueta de bug y columna de estimación.
// Historial de estados convertido en tiempo por estado, para fuentes que dan los cambios con fecha.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { columnasNumericas } from '../adaptadores/comun/numericas.ts';
import { tiemposDesdeHistorial, completarDesdeHistorial } from '../adaptadores/comun/historial.ts';
import { aplicarReglasTipo, tiposDeOrigen, etiquetasDe } from '../nucleo/reglas-tipo.ts';
import { detectar } from '../nucleo/detectar.ts';
import { calcular } from '../nucleo/calcular.ts';
import { etapaDe } from '../nucleo/estados.ts';
import type { CambioEstado, Lectura, Tarea } from '../nucleo/modelo.ts';

const COMPLETO = join(SINTETICOS, 'jira-ejemplo-completo-2026-10-12.csv');
const texto = readFileSync(COMPLETO, 'utf8');
const lectura = leerJira([{ nombre: 'completo.csv', texto }]);
const H = 3600e3, D = 24 * H;

// ---------- tipos ----------

test('tipos de origen con su propuesta; sin reglas la lectura es la misma', () => {
  const tipos = tiposDeOrigen(lectura);
  assert.deepEqual(tipos.map((x) => [x.tipo_origen, x.propuesto]), [['Story', 'historia'], ['Bug', 'error'], ['Task', 'tarea']]);
  assert.equal(aplicarReglasTipo(lectura, {}), lectura);
  assert.equal(aplicarReglasTipo(lectura, { mapeoTipos: {}, etiquetaBug: '  ' }), lectura);
});

test('el mapeo de tipos del cliente cambia el tipo sin tocar la lectura original', () => {
  const antes = lectura.tareas.filter((t) => t.tipo === 'error').length;
  const tasks = lectura.tareas.filter((t) => t.tipo_origen === 'Task').length;
  const l2 = aplicarReglasTipo(lectura, { mapeoTipos: { Task: 'error' } });
  assert.notEqual(l2, lectura);
  assert.equal(l2.tareas.filter((t) => t.tipo === 'error').length, antes + tasks);
  assert.equal(lectura.tareas.filter((t) => t.tipo === 'error').length, antes, 'la original no cambia');
  assert.equal(tiposDeOrigen(lectura, { mapeoTipos: { Task: 'error' } }).find((x) => x.tipo_origen === 'Task')!.cambiado, true);
  // Un tipo que no es de trabajo (épica) no se acepta como destino
  assert.equal(aplicarReglasTipo(lectura, { mapeoTipos: { Task: 'epica' } }), lectura);
});

test('la etiqueta de bug marca como bug cualquier tarea que la lleve, sin distinguir mayúsculas ni tildes', () => {
  const etiqueta = etiquetasDe(lectura)[0];
  assert.equal(etiqueta.etiqueta, 'deuda-tecnica');
  const l2 = aplicarReglasTipo(lectura, { etiquetaBug: 'Deuda-Técnica' });
  const marcadas = l2.tareas.filter((t) => t.etiquetas.includes('deuda-tecnica'));
  assert.equal(marcadas.length, etiqueta.n);
  assert.ok(marcadas.every((t) => t.tipo === 'error'));
});

test('los bugs nuevos por semana suben cuando un tipo pasa a bug', () => {
  const det = detectar(lectura);
  const cfg = { campoEquipo: 'todos', equipos: [], mapeoEstados: det.mapeoEstados, fte: {}, limites: {} };
  const suma = (l: Lectura) => calcular(l.tareas, det, cfg).equipos[0].series.bugsEntrada.reduce((s: number, x: number) => s + x, 0);
  assert.ok(suma(aplicarReglasTipo(lectura, { mapeoTipos: { Task: 'error' } })) > suma(lectura));
});

// ---------- estimación ----------

test('columnas numéricas candidatas a estimación: puntos sí, identificadores no', () => {
  const cols = columnasNumericas(texto).map((c) => c.columna);
  assert.ok(cols.includes('Custom field (Story Points)'));
  assert.ok(!cols.includes('Issue id'));
});

test('columna de estimación: automática, ninguna o la que elige el cliente', () => {
  const con = (l: Lectura) => l.tareas.filter((t) => t.estimacion != null).length;
  assert.ok(con(lectura) > 0);
  assert.equal(con(leerJira([{ nombre: 'c.csv', texto }], { columnaEstimacion: '' })), 0);
  const elegida = leerJira([{ nombre: 'c.csv', texto }], { columnaEstimacion: 'Custom field (Story Points)' });
  assert.equal(con(elegida), con(lectura));
  // Una columna que no existe en el fichero deja la detección automática
  assert.equal(con(leerJira([{ nombre: 'c.csv', texto }], { columnaEstimacion: 'No existe' })), con(lectura));
});

// ---------- historial ----------

const f = (dias: number) => new Date(Date.UTC(2026, 0, 1) + dias * D);

test('historial a tiempos: duración por estado, entradas y vueltas', () => {
  const h: CambioEstado[] = [
    { estado: 'To Do', fecha: f(0) }, { estado: 'In Progress', fecha: f(2) }, { estado: 'In Review', fecha: f(5) },
    { estado: 'In Progress', fecha: f(6) }, { estado: 'In Progress', fecha: f(7) }, { estado: 'Done', fecha: f(8) },
  ];
  const t = tiemposDesdeHistorial(h, f(10));
  const de = (e: string) => t.find((x) => x.estado === e)!;
  assert.deepEqual(de('To Do'), { estado: 'To Do', visitas: 1, ms: 2 * D });
  // Volver a In Progress es una entrada más; repetir el mismo estado no
  assert.deepEqual(de('In Progress'), { estado: 'In Progress', visitas: 2, ms: 5 * D });
  assert.deepEqual(de('In Review'), { estado: 'In Review', visitas: 1, ms: D });
  assert.deepEqual(de('Done'), { estado: 'Done', visitas: 1, ms: 2 * D });
  // El orden de entrada no importa y las fechas inválidas se ignoran
  const desordenado = tiemposDesdeHistorial([...h].reverse().concat([{ estado: 'X', fecha: new Date('x') }]), f(10));
  assert.deepEqual(desordenado.sort((a, b) => a.estado.localeCompare(b.estado)), t.slice().sort((a, b) => a.estado.localeCompare(b.estado)));
});

test('una lectura con historial y sin tiempos da los mismos tiempos que el export con tiempo en cada estado', () => {
  // Se reconstruye un historial desde los tiempos de las tareas terminadas que pasan una vez por cada estado,
  // ordenando los estados por etapa. Después se quitan los tiempos y se calculan desde el historial.
  const det = detectar(lectura);
  const orden = { pendiente: 0, curso: 1, espera: 2, hecho: 3 } as const;
  const etapa = (e: string) => orden[etapaDe(det.mapeoEstados[e] || 'pendiente')];
  const elegidas = lectura.tareas.filter((t) => t.fechas.terminada && t.tiempos_estado.length > 1 && t.tiempos_estado.every((x) => x.visitas === 1));
  assert.ok(elegidas.length > 100, String(elegidas.length));
  const ids = new Set(elegidas.map((t) => t.id));
  const sinTiempos: Lectura = {
    ...lectura,
    tareas: lectura.tareas.map((t): Tarea => {
      if (!ids.has(t.id)) return t;
      const pasos = t.tiempos_estado.slice().sort((a, b) => etapa(a.estado) - etapa(b.estado) || a.estado.localeCompare(b.estado));
      let x = t.fechas.creada.getTime();
      const historial = pasos.map((p) => { const c = { estado: p.estado, fecha: new Date(x) }; x += p.ms; return c; });
      return { ...t, historial_estados: historial, tiempos_estado: [] };
    }),
  };
  const completada = completarDesdeHistorial(sinTiempos);
  let comparados = 0;
  completada.tareas.forEach((t, i) => {
    if (!ids.has(t.id)) { assert.equal(t, sinTiempos.tareas[i], 'las demás tareas no cambian'); return; }
    const original = lectura.tareas[i];
    const ultimo = t.historial_estados[t.historial_estados.length - 1].estado;
    // El último estado cuenta hasta la última actividad del export, no hasta la exportación: se compara el resto
    original.tiempos_estado.filter((x) => x.estado !== ultimo).forEach((x) => {
      const y = t.tiempos_estado.find((z) => z.estado === x.estado)!;
      assert.equal(y.visitas, x.visitas, t.clave_origen);
      assert.ok(Math.abs(y.ms - x.ms) < 1000, t.clave_origen + ' ' + x.estado);
      comparados++;
    });
  });
  assert.ok(comparados > 200, String(comparados));
  // El núcleo calcula el plazo con esos tiempos sin saber de dónde vienen
  const cfg = { campoEquipo: 'todos', equipos: [], mapeoEstados: det.mapeoEstados, fte: {}, limites: {} };
  const mediana = (l: Lectura) => calcular(l.tareas, detectar(l), cfg).equipos[0].medidas.ciclo.valor as number;
  assert.ok(Math.abs(mediana(completada) - mediana(lectura)) / mediana(lectura) < 0.05, `${mediana(completada)} frente a ${mediana(lectura)}`);
});

test('sin historial, la lectura es la misma', () => {
  assert.equal(completarDesdeHistorial(lectura), lectura);
});

test('historial con fechas nulas o inválidas: se ignoran sin romper', () => {
  const t0 = lectura.tareas[0];
  const malo = [{ estado: 'To Do', fecha: null }, { estado: 'In Progress', fecha: new Date('x') }, { estado: 'Done', fecha: f(3) }, { estado: 'In Progress', fecha: f(1) }] as unknown as CambioEstado[];
  const l2: Lectura = { ...lectura, tareas: [{ ...t0, estado_origen: '', tiempos_estado: [], historial_estados: malo, fechas: { ...t0.fechas, cambio_estado: null } }] };
  const c = completarDesdeHistorial(l2, f(5)).tareas[0];
  assert.equal(c.estado_origen, 'Done');
  assert.equal(c.fechas.cambio_estado!.getTime(), f(3).getTime());
  assert.deepEqual(c.tiempos_estado.map((x) => [x.estado, x.ms]).sort(), [['Done', 2 * D], ['In Progress', 2 * D]]);
});

test('varios ficheros: si uno no tiene la columna de estimación elegida, se avisa', () => {
  const sinColumna = texto.replace('Custom field (Story Points)', 'Otra columna');
  const l = leerJira([{ nombre: 'a.csv', texto }, { nombre: 'b.csv', texto: sinColumna }], { columnaEstimacion: 'Custom field (Story Points)' });
  assert.ok(l.informe.avisos.some((a) => a.texto.includes('b.csv') && a.texto.includes('Custom field (Story Points)')), JSON.stringify(l.informe.avisos));
  assert.ok(!l.informe.avisos.some((a) => a.texto.includes('a.csv') && a.texto.includes('Custom field (Story Points)')));
});

test('fiabilidad: estados por revisar que da la página y estimación que no se usa', async () => {
  const { diagnosticar } = await import('../nucleo/diagnostico.ts');
  const { fiabilidad } = await import('../nucleo/fiabilidad.ts');
  const det = detectar(lectura);
  const nombre = det.estados[0].nombre;
  const cliente = { version: 2, nombre: '', sector: '', plataforma: 'jira', mapeoEstados: det.mapeoEstados, equipos: { campo: 'todos', lista: [{ id: 'All work', nombre: 'All work', tipo: 'interno', proveedor: null, area: null, usa_sprints: true, fte: [], limites: {} }] }, objetivos: [], medidas: ['ciclo'] };
  const base = { campoEquipo: 'todos', equipos: [], mapeoEstados: det.mapeoEstados, fte: {}, limites: {} };
  const fia = (cfg: object) => { const r = diagnosticar(lectura, cliente as never, [], null, { config: cfg as never, generado: new Date(2026, 9, 15) }); return fiabilidad(lectura, det, r.preparacion, r.modelo, cfg as never); };
  const est = (cfg: object) => fia(cfg).comprobaciones.find((x) => x.id === 'estados')!;
  assert.equal(est(base).estado, 'bien', 'con el mapeo completo, nada por revisar (comportamiento anterior)');
  const conLista = est({ ...base, estadosPorRevisar: [nombre] });
  assert.equal(conLista.estado, 'revisar');
  assert.ok(conLista.detalle.includes(nombre));
  const estim = (cfg: object) => fia(cfg).comprobaciones.find((x) => x.id === 'estimacion')!;
  assert.equal(estim({ ...base, sinEstimacion: true }).estado, 'sin');
});
