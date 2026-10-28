// B4: documento de definiciones (markdown y Word) a partir del arranque del consultor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRUEBA, SINTETICOS } from './ayudas.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { detectar } from '../nucleo/detectar.ts';
import { definiciones } from '../nucleo/definiciones.ts';
import { aDocx, aMarkdown, crc32 } from '../nucleo/documento.ts';
import { explicarEstado, proponerEstado } from '../nucleo/estados.ts';
import { CATALOGO } from '../nucleo/catalogo.ts';
import { equiposDetectados, type ClienteV2 } from '../nucleo/cliente.ts';
import type { Lectura } from '../nucleo/modelo.ts';

const B3 = join(SINTETICOS, 'b3');
const lecturaB3 = () => leerJira([{ nombre: 'jira-b3.csv', texto: readFileSync(join(B3, 'jira-b3.csv'), 'utf8') }]);
const clienteB3 = (): ClienteV2 => ({ ...JSON.parse(readFileSync(join(B3, 'cliente', 'cliente.json'), 'utf8')), nombre: 'Example Bank' });
const FECHA = new Date(2026, 9, 15);

/** Ficheros de un .docx sin comprimir: nombre y contenido, comprobando el CRC de cada uno. */
function leerZip(z: Uint8Array): Record<string, string> {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength), dec = new TextDecoder();
  let fin = z.length - 22;
  while (fin >= 0 && v.getUint32(fin, true) !== 0x06054b50) fin--;
  assert.ok(fin >= 0, 'sin directorio central');
  const total = v.getUint16(fin + 10, true);
  let o = v.getUint32(fin + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < total; i++) {
    assert.equal(v.getUint32(o, true), 0x02014b50);
    const crc = v.getUint32(o + 16, true), tam = v.getUint32(o + 20, true), ln = v.getUint16(o + 28, true), local = v.getUint32(o + 42, true);
    const nombre = dec.decode(z.subarray(o + 46, o + 46 + ln));
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = z.subarray(ini, ini + tam);
    assert.equal(crc32(datos), crc, 'CRC de ' + nombre);
    out[nombre] = dec.decode(datos);
    o += 46 + ln;
  }
  return out;
}

/** Rayas, vocabulario vetado y palabras en castellano que no deben quedar en un documento en inglés. */
const TEXTO_PROHIBIDO = /[—–]|atascad|\bcorte\b|umbral|\b(equipo|semanas|tareas|retrabajo|plazo|proveedor)\b/i;

test('definiciones con los datos B3: equipos, estados, medidas y firma', () => {
  const l = lecturaB3(), c = clienteB3();
  const md = aMarkdown(definiciones(l, c, { generado: FECHA }));
  for (const e of c.equipos.lista) {
    const fila = md.split('\n').find((x) => x.startsWith('| ' + e.nombre + ' |'));
    assert.ok(fila, 'falta el equipo ' + e.nombre);
    assert.ok(fila.includes(e.tipo === 'proveedor' ? 'Vendor: ' + e.proveedor : 'In-house'), fila);
    if (e.area) assert.ok(fila.includes(e.area), fila);
  }
  for (const e of l.estados) assert.ok(md.includes('| ' + e.nombre + ' |'), 'falta el estado ' + e.nombre);
  for (const id of c.medidas) assert.ok(md.includes('### ' + CATALOGO.medidas[id].nombre + '\n'), 'falta la medida ' + id);
  assert.ok(md.includes('## 1. What we want to achieve'));
  assert.ok(md.includes('| Example Bank |') && md.includes('| Capgemini Invent |'), 'bloque de firma');
  assert.ok(!md.includes('To confirm'), 'todos los estados B3 se reconocen por su nombre');
});

test('definiciones: sin rayas, sin vocabulario vetado, sin personas ni claves de ticket', () => {
  const l = lecturaB3();
  const md = aMarkdown(definiciones(l, clienteB3(), { generado: FECHA }));
  assert.ok(!TEXTO_PROHIBIDO.test(md), md.match(TEXTO_PROHIBIDO)?.[0]);
  assert.ok(!/Persona /.test(md));
  assert.ok(!/\b(PAG|RIE|APP|POR)-\d+\b/.test(md));
  for (const t of l.tareas.slice(0, 100)) assert.ok(!md.includes(t.titulo), 'sin títulos de tareas');
  assert.ok(!/\*\* /.test(md.replace(/\*\*[^*]+\*\* /g, '')), 'negritas bien cerradas');
});

test('definiciones: el mapeo que firma el cliente manda y cambia el documento', () => {
  const l = lecturaB3(), c = clienteB3();
  c.mapeoEstados = { ...c.mapeoEstados, 'In Review': 'en_pruebas' };
  const md = aMarkdown(definiciones(l, c, { generado: FECHA }));
  const fila = md.split('\n').find((x) => x.startsWith('| In Review |'))!;
  assert.ok(fila.includes('| Testing |'), fila);
  assert.ok(md.includes('| Testing | Waiting for or going through testing'), 'el significado del estado común usado');
});

test('definiciones: un estado que no se reconoce por su nombre queda "por confirmar" hasta que el cliente lo mapea', () => {
  const l: Lectura = lecturaB3();
  const viejo = 'In Review', nuevo = 'Fase Z';
  l.tareas.forEach((t) => {
    if (t.estado_origen === viejo) t.estado_origen = nuevo;
    t.tiempos_estado.forEach((x) => { if (x.estado === viejo) x.estado = nuevo; });
  });
  l.estados = l.estados.map((e) => (e.nombre === viejo ? { ...e, nombre: nuevo } : e));
  const cat = l.estados.find((e) => e.nombre === nuevo)!.categoria;
  delete l.mapeoPropuesto[viejo];
  l.mapeoPropuesto[nuevo] = proponerEstado(nuevo, cat);
  assert.equal(explicarEstado(nuevo, cat).por, 'categoria');
  assert.equal(detectar(l).estados.find((e) => e.nombre === nuevo)!.propuestaPor, 'categoria');
  const c = clienteB3();
  delete c.mapeoEstados[viejo];
  assert.ok(aMarkdown(definiciones(l, c, { generado: FECHA })).includes('To confirm.'));
  c.mapeoEstados[nuevo] = 'en_revision';
  assert.ok(!aMarkdown(definiciones(l, c, { generado: FECHA })).includes('To confirm.'));
});

test('definiciones con el Jira.csv de prueba y la configuración recomendada', () => {
  const l = leerJira([{ nombre: 'Jira.csv', texto: readFileSync(join(PRUEBA, 'Jira.csv'), 'utf8') }]);
  const det = detectar(l);
  const c: ClienteV2 = {
    version: 2, nombre: '', sector: '', plataforma: 'jira', mapeoEstados: det.mapeoEstados,
    equipos: { campo: det.equipoRecomendado, lista: equiposDetectados(det, det.equipoRecomendado) },
    objetivos: ['tardamos', 'cumplir'], medidas: ['ciclo', 'entregas', 'espera', 'edad', 'retrabajo', 'arrastradas'],
  };
  const md = aMarkdown(definiciones(l, c, { det, generado: FECHA }));
  assert.ok(md.includes('the Component field'));
  for (const e of ['Infrastructure', 'Mobile', 'Web']) assert.ok(md.includes('| ' + e + ' |'), e);
  for (const e of ['To Do', 'In Progress', 'Done']) assert.ok(md.includes('| ' + e + ' |'), e);
  assert.ok(md.includes('| Jira.csv |'));
  assert.ok(md.includes('| Client |'), 'sin nombre de cliente, la firma dice Client');
  assert.ok(md.includes('| All teams |'), 'los avisos que comparten todos los equipos van una vez');
  assert.ok(!TEXTO_PROHIBIDO.test(md));
});

test('documento de definiciones en Word: zip válido con las partes de Office y el mismo contenido', () => {
  const doc = definiciones(lecturaB3(), clienteB3(), { generado: FECHA });
  const z = leerZip(aDocx(doc, FECHA));
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels', 'word/footer1.xml', 'docProps/core.xml']) assert.ok(z[f], 'falta ' + f);
  const xml = z['word/document.xml'];
  assert.ok(xml.includes('Measurement definitions') && xml.includes('Example Bank'));
  for (const b of doc.bloques) if (b.tipo === 'h1') assert.ok(xml.includes(b.texto.replace(/&/g, '&amp;')), b.texto);
  assert.equal((xml.match(/<w:p>/g) || []).length + (xml.match(/<w:p\/>/g) || []).length, (xml.match(/<\/w:p>/g) || []).length + (xml.match(/<w:p\/>/g) || []).length, 'párrafos cerrados');
  assert.equal((xml.match(/<w:tbl>/g) || []).length, (xml.match(/<\/w:tbl>/g) || []).length, 'tablas cerradas');
  // Las columnas de cada tabla suman el ancho del texto
  for (const grid of xml.match(/<w:tblGrid>.*?<\/w:tblGrid>/g) || []) {
    const suma = [...grid.matchAll(/w:w="(\d+)"/g)].reduce((s, m) => s + +m[1], 0);
    assert.equal(suma, 9638);
  }
  assert.ok(!TEXTO_PROHIBIDO.test(xml));
});
