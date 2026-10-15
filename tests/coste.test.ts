// Capacidad y coste, y modelo de medida: sobre los datos sintéticos de B3 con FTE y coste indicados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { detectar } from '../nucleo/detectar.ts';
import { diagnosticar, NOMBRE_AREA } from '../nucleo/diagnostico.ts';
import { configDesdeCliente, type ClienteV2 } from '../nucleo/cliente.ts';
import { capacidadArea, costeDeGrupos } from '../nucleo/coste.ts';
import { modeloDeMedida } from '../nucleo/modelo-medida.ts';
import { CATALOGO } from '../nucleo/catalogo.ts';

const DIR = join(SINTETICOS, 'b3');
const leer = (...p: string[]) => readFileSync(join(DIR, ...p), 'utf8');
const cliente: ClienteV2 = JSON.parse(leer('cliente', 'cliente.json'));
const iniciativas = readdirSync(join(DIR, 'cliente', 'iniciativas')).sort().map((f) => JSON.parse(leer('cliente', 'iniciativas', f)));
const lectura = leerJira([{ nombre: 'jira-b3.csv', texto: leer('jira-b3.csv') }]);
const base = configDesdeCliente(cliente);
const COSTE: Record<string, number> = { Pagos: 6500, Riesgos: 6500, 'App móvil': 8000, 'Portal clientes': 7600 };
const cfg = { ...base, coste: COSTE };
const r = diagnosticar(lectura, cliente, iniciativas, null, { config: cfg, generado: new Date(2026, 9, 15) });
const cerca = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), msg + ': ' + a + ' frente a ' + b);

test('coste por entrega de cada equipo: FTE por coste entre lo terminado al mes', () => {
  for (const eq of r.modelo.equipos) {
    const m = eq.kpis.coste, fte = cfg.fte![eq.nombre], ent = eq.series.entregasMedia[eq.series.entregasMedia.length - 1];
    assert.ok(m && m.disponible, eq.nombre);
    cerca(m.valor!, fte * COSTE[eq.nombre] / (ent! * 52 / 12), eq.nombre);
    assert.ok(m.ref, 'tiene lo habitual: ' + eq.nombre);
    assert.ok(['bien', 'atencion', 'critico'].includes(m.estado!), eq.nombre);
  }
});

test('coste por entrega del área: coste total entre todas las tareas, no media de equipos', () => {
  const a = r.area.equipos[0], cap = capacidadArea(cfg, r.modelo.equipos.map((e) => e.nombre));
  assert.equal(a.nombre, NOMBRE_AREA);
  const costeMes = r.modelo.equipos.reduce((s, e) => s + cfg.fte![e.nombre] * COSTE[e.nombre], 0);
  cerca(cap.costeMes!, costeMes, 'coste mensual');
  const ent = a.series.entregasMedia[a.series.entregasMedia.length - 1]!;
  cerca(a.kpis.coste.valor!, costeMes / (ent * 52 / 12), 'coste por entrega del área');
  const media = r.modelo.equipos.reduce((s, e) => s + e.kpis.coste.valor!, 0) / r.modelo.equipos.length;
  assert.ok(Math.abs(a.kpis.coste.valor! - media) > 1, 'no es la media de los equipos');
});

test('coste por grupo: internos frente a proveedores con las mismas semanas de la comparación', () => {
  const c = r.comparaciones.find((x) => x.dimension === 'tipo')!;
  const g = costeDeGrupos(c, cfg);
  for (const grupo of c.grupos) {
    const x = g[grupo.id], costeMes = grupo.equipos.reduce((s, e) => s + cfg.fte![e] * COSTE[e], 0);
    cerca(x.costeMes!, costeMes, grupo.nombre);
    cerca(x.costePorEntrega!, costeMes / x.entregasMes, grupo.nombre);
    cerca(x.entregasPorFte!, c.porGrupo[grupo.id].throughputFte!, 'entregas por FTE como el núcleo: ' + grupo.nombre);
  }
});

test('sin coste indicado, los resultados no cambian y no aparece la medida', () => {
  const sin = diagnosticar(lectura, cliente, iniciativas, null, { config: base, generado: new Date(2026, 9, 15) });
  sin.modelo.equipos.forEach((e) => assert.equal(e.kpis.coste, undefined));
  const con = r.modelo.equipos.map((e) => { const k = { ...e.kpis }; delete k.coste; return JSON.stringify(k); });
  assert.deepEqual(con, sin.modelo.equipos.map((e) => JSON.stringify(e.kpis)));
});

test('falta un coste: ese equipo dice qué falta y el área no se calcula', () => {
  const parcial = { ...base, coste: { Pagos: 6500 } };
  const x = diagnosticar(lectura, cliente, iniciativas, null, { config: parcial });
  const riesgos = x.modelo.equipos.find((e) => e.nombre === 'Riesgos')!;
  assert.equal(riesgos.kpis.coste.disponible, false);
  assert.match(riesgos.kpis.coste.motivo!, /coste/);
  assert.equal(x.area.equipos[0].kpis.coste.disponible, false);
  assert.equal(x.capacidad.costeMes, null);
});

test('modelo de medida: todas las medidas, uniones con equipo y ningún campo de personas', () => {
  const m = modeloDeMedida({ generado: new Date(2026, 9, 15) });
  const ids = m.medidas.map((x) => x.id);
  for (const id of CATALOGO.ordenMedidas) assert.ok(ids.includes(id), 'falta ' + id);
  for (const id of ['throughput', 'coste', 'coste_mes']) assert.ok(ids.includes(id), 'falta ' + id);
  const ents = new Set(m.entidades.map((e) => e.id));
  m.relaciones.forEach((rel) => { assert.ok(ents.has(rel.desde), rel.desde); assert.ok(ents.has(rel.hacia), rel.hacia); });
  const texto = JSON.stringify(m.entidades.flatMap((e) => e.campos.map((c) => c.campo + ' ' + (c.jira || ''))));
  assert.doesNotMatch(texto, /assignee|reporter|asignado|informador|creator|comment/i);
  assert.ok(!/[—–]/.test(JSON.stringify(m)), 'sin rayas');
  JSON.parse(JSON.stringify(m));
});

test('documento de definiciones: con coste lleva la tabla de capacidad y coste; sin coste, no', async () => {
  const { definiciones } = await import('../nucleo/definiciones.ts');
  const { aMarkdown } = await import('../nucleo/documento.ts');
  const det = detectar(lectura);
  const con = aMarkdown(definiciones(lectura, cliente, { config: cfg, det, modelo: r.modelo, generado: new Date(2026, 9, 15) }));
  assert.match(con, /Capacidad y coste/);
  assert.match(con, /\| Pagos \| 5 \| 6\.500 € \| 32\.500 € \|/);
  const sin = aMarkdown(definiciones(lectura, cliente, { config: base, det, generado: new Date(2026, 9, 15) }));
  assert.doesNotMatch(sin, /Capacidad y coste/);
});
