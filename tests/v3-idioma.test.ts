// v3: castellano e inglés. El catálogo tiene todos sus textos en los dos idiomas, el cambio de idioma
// no toca la estructura, y lo que escribe el núcleo en castellano no lleva inglés ni rayas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { fijarIdioma, idioma } from '../nucleo/idioma.ts';
import { CATALOGO, CATALOGO_EN, CATALOGO_ES } from '../nucleo/catalogo.ts';
import { RUBRICA } from '../nucleo/agent-readiness.ts';
import { formatear, fechaCorta } from '../nucleo/formato.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import { fiabilidad } from '../nucleo/fiabilidad.ts';
import { seguimiento } from '../nucleo/seguimiento.ts';
import { definiciones } from '../nucleo/definiciones.ts';
import { aMarkdown } from '../nucleo/documento.ts';
import { modeloDeMedida } from '../nucleo/modelo-medida.ts';
import { describirColumnas } from '../adaptadores/jira/columnas.ts';
import type { ClienteV2 } from '../nucleo/cliente.ts';

// Claves que no son texto: identificadores, patrones y listas de ids. No se traducen.
const NO = new Set(['patron', 'id', 'medida', 'objetivos', 'medidas', 'casos', 'requiere', 'formato', 'dir', 'etapa', 'estado', 'orden', 'categoria', 'porDefecto', 'version', 'listoDesde', 'flags']);
const esId = (v: unknown) => typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
function faltan(en: unknown, es: unknown, ruta = ''): string[] {
  if (typeof en === 'string') return en && typeof es !== 'string' && en !== 'Throughput / FTE' ? [ruta] : [];
  if (Array.isArray(en)) return en.flatMap((v, i) => faltan(v, Array.isArray(es) ? es[i] : undefined, `${ruta}[${i}]`));
  if (en && typeof en === 'object') return Object.entries(en).flatMap(([k, v]) => (NO.has(k) && esId(v) ? [] : faltan(v, es && typeof es === 'object' ? (es as any)[k] : undefined, ruta + '.' + k)));
  return [];
}

test('catálogo: cada texto en inglés tiene su versión en castellano', () => {
  for (const k of Object.keys(CATALOGO_EN) as (keyof typeof CATALOGO_EN)[]) {
    const f = faltan(CATALOGO_EN[k], CATALOGO_ES[k]);
    assert.deepEqual(f, [], k + ': ' + f.slice(0, 5).join(', '));
  }
});

test('catálogo: cambiar de idioma cambia los textos y no la estructura; volver al inglés lo deja igual', () => {
  const antes = JSON.stringify(CATALOGO);
  fijarIdioma('es');
  assert.equal(idioma(), 'es');
  assert.equal(CATALOGO.medidas.entregas.nombre, 'Entregas');
  assert.equal(CATALOGO.medidas.bugs.nombre, 'Bugs nuevos');
  assert.ok(RUBRICA.criterios && JSON.stringify(RUBRICA) !== JSON.stringify(CATALOGO_EN.rubrica), 'la rúbrica también cambia');
  assert.equal(CATALOGO.medidas.retrabajo.limites!.atencion, 0.2, 'los números no cambian');
  assert.equal(Object.keys(CATALOGO.casos).length, Object.keys((CATALOGO_EN.casos as any).casos).length);
  fijarIdioma('en');
  assert.equal(JSON.stringify(CATALOGO), antes);
});

test('formato: porcentajes, días, euros y fechas en castellano', () => {
  fijarIdioma('es');
  assert.equal(formatear(0.25, 'pct'), '25 %');
  assert.equal(formatear(1.5, 'dias'), '1,5 días');
  assert.equal(formatear(1, 'dias'), '1 día');
  assert.equal(formatear(12345, 'eur'), '12.345 €');
  assert.equal(formatear(null, 'num'), 'sin datos');
  assert.equal(fechaCorta(new Date(2026, 9, 29)), '29 oct 2026');
  fijarIdioma('en');
  assert.equal(formatear(0.25, 'pct'), '25%');
  assert.equal(formatear(12345, 'eur'), '€12,345');
  assert.equal(fechaCorta(new Date(2026, 9, 29)), '29 Oct 2026');
});

// Palabras que delatan inglés en un texto que debería estar en castellano
const INGLES = /\b(the|of|and|is|are|with|from|was|were|than|has|have|does|not|weeks?|tasks?|teams?|done|measure|usual|range|worse|better|limit|attention|critical|data|enough|between|vendors?|in-house|which|there|this|that|it|its)\b/i;
const DIR = join(SINTETICOS, 'b3');
const leer = (...p: string[]) => readFileSync(join(DIR, ...p), 'utf8');

test('núcleo en castellano: motivos, semáforo, casos, fiabilidad, iniciativas y documentos sin inglés ni rayas', () => {
  fijarIdioma('es');
  try {
    const cliente: ClienteV2 = JSON.parse(leer('cliente', 'cliente.json'));
    const iniciativas = readdirSync(join(DIR, 'cliente', 'iniciativas')).sort().map((f) => JSON.parse(leer('cliente', 'iniciativas', f)));
    const lectura = leerJira([{ nombre: 'jira-b3.csv', texto: leer('jira-b3.csv') }]);
    const r = diagnosticar(lectura, cliente, iniciativas, null, { generado: new Date(2026, 9, 15) });
    // Nombres que vienen de los datos (equipos, estados, proveedores, áreas) se quitan antes de mirar el idioma
    const nombres = [...r.modelo.equipos.map((e) => e.nombre), ...r.det.estados.map((e) => e.nombre), 'Vendor North', 'Vendor South', 'Digital Channels', 'Platform', 'Sample bank', 'Synthetic client B3', 'Throughput / FTE', 'Story points', 'Time in Status', 'Issue key', 'In Progress', 'To Do', 'campo Team'];
    const limpio = (t: string) => nombres.reduce((s, n) => s.split(n).join(' '), t);
    const textos: [string, string][] = [];
    for (const e of [...r.modelo.equipos, ...r.area.equipos]) {
      for (const [id, m] of Object.entries(e.medidas)) { if (m.estadoTexto) textos.push([e.nombre + ' ' + id + ' semáforo', m.estadoTexto]); if (m.motivo) textos.push([e.nombre + ' ' + id + ' motivo', m.motivo]); }
      for (const c of e.casos) textos.push([e.nombre + ' caso ' + c.id, c.evidencia]);
      if (e.sprints.motivo) textos.push([e.nombre + ' sprints', e.sprints.motivo]);
    }
    for (const c of r.casosGrupo) textos.push(['grupo ' + c.id, c.evidencia]);
    const fi = fiabilidad(lectura, r.det, r.preparacion, r.modelo, {});
    for (const c of fi.comprobaciones) for (const k of ['nombre', 'que', 'valor', 'umbral', 'detalle', 'arreglo'] as const) textos.push(['fiabilidad ' + c.id + ' ' + k, c[k]]);
    for (const { iniciativa, evaluacion } of r.iniciativas) textos.push(['iniciativa ' + iniciativa.id, seguimiento(iniciativa, evaluacion, r.preparacion).texto]);
    for (const c of describirColumnas(leer('jira-b3.csv'))) textos.push(['columna ' + c.columna, c.que]);
    textos.push(['definiciones', aMarkdown(definiciones(lectura, cliente, { generado: new Date(2026, 9, 15) }))]);
    const mm = modeloDeMedida({ generado: new Date(2026, 9, 15) });
    textos.push(['modelo de medida', JSON.stringify({ reglas: mm.reglas, medidas: mm.medidas.map((m) => [m.nombre, m.definicion, m.necesita]), comparaciones: mm.comparaciones, iniciativas: mm.iniciativas })]);
    const malos = textos.filter(([, t]) => t && (INGLES.test(limpio(t).replace(/`[^`]*`/g, '')) || /[—–]/.test(t)));
    assert.deepEqual(malos.map(([k, t]) => k + ': ' + (limpio(t).match(INGLES) || [''])[0] + ' · ' + t.slice(0, 90)).slice(0, 12), []);
    assert.ok(textos.length > 100, 'se han mirado ' + textos.length + ' textos');
  } finally { fijarIdioma('en'); }
});
