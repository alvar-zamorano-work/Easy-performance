// Importación robusta: lo que se importe se lee igual, venga como venga, y lo que no se puede usar se dice.
// Hojas de prueba en datos-sinteticos/hojas (herramientas/generar-hojas-prueba.py): el mismo export en CSV de
// referencia, .xlsx y .xls con una fila de título encima, y el ".xls" de Jira que es una tabla HTML.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { leerHoja, aCsv, detectarFormato } from '../adaptadores/comun/hoja.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { ordenFechas, leerFechaOrden } from '../adaptadores/comun/fechas.ts';
import { detectarSeparador } from '../adaptadores/comun/csv.ts';

const HOJAS = join(SINTETICOS, 'hojas');
const bytes = (n: string) => new Uint8Array(readFileSync(join(HOJAS, n)));
const ref = leerJira([{ nombre: 'referencia.csv', texto: readFileSync(join(HOJAS, 'referencia.csv'), 'utf8') }]);
/** Lo que importa de una lectura para compararla con otra. */
const huella = (l: ReturnType<typeof leerJira>) => l.tareas.map((t) => [t.clave_origen, t.titulo, t.tipo, t.estado_origen, t.agrupadores.equipo, t.estimacion, t.sprints.join('|'),
  t.fechas.creada.toISOString(), t.fechas.terminada ? t.fechas.terminada.toISOString() : null].join(' · ')).sort();

test('formato de hoja por sus primeros bytes', () => {
  assert.equal(detectarFormato(bytes('jira-con-titulo.xlsx')), 'xlsx');
  assert.equal(detectarFormato(bytes('jira-con-titulo.xls')), 'xls');
  assert.equal(detectarFormato(bytes('jira-html.xls')), 'html');
  assert.equal(detectarFormato(bytes('referencia.csv')), 'csv');
});

for (const [nombre, avisoTitulo] of [['jira-con-titulo.xlsx', true], ['jira-con-titulo.xls', true], ['jira-html.xls', false]] as const) {
  test(`${nombre}: se lee igual que el CSV de referencia`, async () => {
    const h = await leerHoja(bytes(nombre));
    const l = leerJira([{ nombre, texto: aCsv(h.filas) }]);
    assert.equal(l.tareas.length, 360);
    assert.deepEqual(huella(l), huella(ref));
    assert.equal(l.informe.avisos.some((a) => /titles are on row 2/.test(a.texto)), avisoTitulo, 'avisa de la fila de título');
  });
}

test('CSV guardado desde Excel con una fila de título encima y punto y coma', () => {
  const texto = readFileSync(join(HOJAS, 'referencia.csv'), 'utf8').split('\n').map((l) => l.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ';')).join('\n');
  const conTitulo = 'Displaying 360 issues at 29/Oct/26 12:16 PM.;;;;\n' + texto;
  assert.equal(detectarSeparador(conTitulo), ';');
  const l = leerJira([{ nombre: 'excel.csv', texto: conTitulo }]);
  assert.deepEqual(huella(l), huella(ref));
});

test('fechas: día y mes deducidos por fichero, números de serie y avisos cuando no cuadran', () => {
  assert.equal(ordenFechas(['29/10/2026 12:04', '01/02/2026']), 'dm');
  assert.equal(ordenFechas(['10/29/2026 12:04 PM', '02/01/2026']), 'md');
  assert.equal(ordenFechas(['01/02/2026 9:00 AM']), 'md', 'con AM/PM y sin más pistas, mes/día');
  assert.equal(ordenFechas(['01/02/2026 9:00']), 'dm');
  assert.equal(leerFechaOrden('10/29/2026 12:04 PM', 'md')?.getDate(), 29);
  assert.equal(leerFechaOrden('46324.5', 'dm')?.toISOString(), new Date(2026, 9, 29, 12, 0).toISOString());
  assert.equal(leerFechaOrden('46324,5', 'dm')?.getHours(), 12);
  assert.equal(leerFechaOrden('13/13/2026', 'dm'), null);
  // Un CSV con el día y el mes cambiados sin pistas: se lee, pero se avisa de que las fechas no cuadran
  const malas = readFileSync(join(HOJAS, 'referencia.csv'), 'utf8').replace(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/g, (m, y, mo, d, h, mi) => (+d <= 12 ? `${mo}/${d}/${y} ${h}:${mi}` : `${d}/${mo}/${y} ${h}:${mi}`));
  const l = leerJira([{ nombre: 'malas.csv', texto: malas }]);
  assert.ok(l.informe.avisos.some((a) => /dates do not add up/.test(a.texto)), 'avisa');
});

test('nada se pierde sin aviso: filas sin fecha de creación se cuentan y se dicen', () => {
  const texto = readFileSync(join(HOJAS, 'referencia.csv'), 'utf8').split('\n').map((l, i) => (i > 0 && i <= 5 ? l.replace(/,\d{4}-\d{2}-\d{2} \d{2}:\d{2},/, ',sin fecha,') : l)).join('\n');
  const l = leerJira([{ nombre: 'x.csv', texto }]);
  assert.equal(l.informe.sinFecha, 5);
  assert.equal(l.tareas.length, 355);
  assert.ok(l.informe.avisos.some((a) => /5 tasks have no readable creation date/.test(a.texto)));
});

test('columnas elegidas a mano: un export con otros títulos se lee', () => {
  const texto = readFileSync(join(HOJAS, 'referencia.csv'), 'utf8').replace(/^Project,Key,Summary,Issue Type,Status,Created/, 'Proyecto,Ticket,Asunto,Clase,Situación,Alta');
  const sin = leerJira([{ nombre: 'raro.csv', texto }]);
  assert.equal(sin.tareas.length, 0);
  assert.deepEqual(sin.informe.columnasPendientes?.[0].faltan, ['clave', 'creada']);
  const con = leerJira([{ nombre: 'raro.csv', texto }], { columnas: { clave: 'Ticket', resumen: 'Asunto', creada: 'Alta', tipo: 'Clase', estado: 'Situación' } });
  assert.equal(con.tareas.length, 360);
  assert.deepEqual(huella(con), huella(ref));
});
