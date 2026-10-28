// IA (plan v2, decisión 4): la petición lleva solo el paquete, el validador descarta lo que no cuadra con él
// y las evals con proveedor falso comprueban el contrato sin red. La eval con el proveedor real está en
// herramientas/evaluar-ia.ts y necesita ANTHROPIC_API_KEY.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS } from './ayudas.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import { comprobarPaquete } from '../nucleo/paquete.ts';
import { CATALOGO } from '../nucleo/catalogo.ts';
import {
  extraerJson, peticionRecomendaciones, validarRecomendaciones, recomendacionesDeReferencia, proveedorFalso, evaluarPaquete,
  peticionMapeoEstados, validarMapeo, peticionImpacto, validarImpacto, proveedorAnthropic, MODELO_POR_DEFECTO,
} from '../nucleo/ia.ts';
import type { ClienteV2 } from '../nucleo/cliente.ts';

const DIR = join(SINTETICOS, 'b3');
const leer = (...p: string[]) => readFileSync(join(DIR, ...p), 'utf8');
const cliente: ClienteV2 = JSON.parse(leer('cliente', 'cliente.json'));
const iniciativas = readdirSync(join(DIR, 'cliente', 'iniciativas')).sort().map((f) => JSON.parse(leer('cliente', 'iniciativas', f)));
const contexto = JSON.parse(leer('cliente', 'contexto', 'contexto.json'));
const lectura = leerJira([{ nombre: 'jira-b3.csv', texto: leer('jira-b3.csv') }]);
const r = diagnosticar(lectura, cliente, iniciativas, contexto, { generado: new Date(2026, 9, 15) });
const paquete = r.paquete;
const equipos = paquete.equipos.map((e) => e.id);
const referencia = recomendacionesDeReferencia(paquete);

test('extraerJson tolera vallas de código y texto alrededor', () => {
  assert.deepEqual(extraerJson('```json\n[1,2]\n```'), [1, 2]);
  assert.deepEqual(extraerJson('Here it is: {"a": 1} thanks'), { a: 1 });
  assert.throws(() => extraerJson('no json here'));
});

test('la petición de recomendaciones lleva el paquete entero, sin campos prohibidos, y dice qué contexto está vacío', () => {
  const p = peticionRecomendaciones(paquete);
  assert.ok(p.user.includes('"casos_activos"'));
  assert.ok(p.user.includes('"comparaciones"'));
  const enviado = JSON.parse(p.user.slice(p.user.indexOf('{'), p.user.indexOf('\n\nMeasures')));
  assert.deepEqual(comprobarPaquete(enviado), []);
  const vacias = Object.entries(paquete.contexto).filter(([, c]) => (c as any).vacia).map(([k]) => k);
  if (vacias.length) assert.ok(/Empty context categories[^\n]*\b(way of working|organisation|technology stack|vendor contracts|other)\b/.test(p.user));
  for (const e of equipos) assert.ok(p.user.includes(e));
  assert.ok(p.system.includes('Cite only numbers that are in the package'));
});

test('las recomendaciones de referencia salen del banco de casos y pasan el validador', () => {
  assert.ok(referencia.length >= 2, 'the B3 package should activate at least two cases');
  const v = validarRecomendaciones(JSON.stringify(referencia), paquete);
  assert.equal(v.descartadas.length, 0, JSON.stringify(v.descartadas.map((d) => d.motivo)));
  assert.equal(v.recomendaciones.length, referencia.length);
  v.recomendaciones.forEach((x) => { assert.ok(x.evidencia.length); assert.ok(CATALOGO.casos[x.causa.caso!]); });
});

test('se descarta lo que cita un equipo o una cifra que no están en el paquete', () => {
  const buena = referencia[0];
  const equipoFalso = { ...buena, destinatario: { tipo: 'equipo', id: 'Ghost team' }, equipos: ['Ghost team'] };
  const cifraFalsa = { ...buena, evidencia: [{ ...buena.evidencia[0], valor: buena.evidencia[0].valor * 7 + 123 }] };
  const casoFalso = { ...buena, causa: { caso: 'caso_inventado', texto: 'x' } };
  const sinEvidencia = { ...buena, evidencia: [] };
  const v = validarRecomendaciones(JSON.stringify([buena, equipoFalso, cifraFalsa, casoFalso, sinEvidencia]), paquete);
  assert.equal(v.recomendaciones.length, 1);
  assert.deepEqual(v.descartadas.map((d) => d.motivo.split(':')[0]), ['Unknown recipient', 'Cited value not in the package', 'Unknown case id', 'No evidence cited.']);
});

test('no se admite una opinión sobre una categoría de contexto vacía, salvo que la pida como contexto necesario', () => {
  const sinStack = { ...paquete, contexto: { ...paquete.contexto, stack: { vacia: true, documentos: [] } } };
  const buena = referencia[0];
  const opina = { ...buena, accion: 'Migrate the service to a new framework and reduce technical debt.' };
  const pide = { ...opina, contexto_necesario: 'stack' };
  const v = validarRecomendaciones(JSON.stringify([opina, pide]), sinStack as typeof paquete);
  assert.equal(v.recomendaciones.length, 1);
  assert.equal(v.recomendaciones[0].contexto_necesario, 'stack');
  assert.match(v.descartadas[0].motivo, /empty context category/);
});

test('como mucho seis recomendaciones, primero las que afectan a más equipos', () => {
  const buena = referencia[0];
  const muchas = Array.from({ length: 9 }, (_, i) => ({ ...buena, titulo: 'Rec ' + i, destinatario: i === 4 ? { tipo: 'area', id: 'area' } : { tipo: 'equipo', id: equipos[0] }, equipos: i === 4 ? equipos : [equipos[0]] }));
  const v = validarRecomendaciones(JSON.stringify(muchas), paquete);
  assert.equal(v.recomendaciones.length, 6);
  assert.equal(v.recomendaciones[0].titulo, 'Rec 4');
  assert.ok(v.problemas[0].includes('only the first 6'));
});

test('una respuesta que no es JSON no rompe nada: se devuelve el problema', () => {
  const v = validarRecomendaciones('Sorry, I cannot help with that.', paquete);
  assert.equal(v.recomendaciones.length, 0);
  assert.match(v.problemas[0], /not valid JSON/);
});

test('eval con proveedor falso: detecta los casos sembrados que la referencia cita', async () => {
  const esperados = [...new Set(referencia.map((x) => x.causa.caso!))];
  const ev = await evaluarPaquete(proveedorFalso({ recomendaciones: referencia }), paquete, esperados);
  assert.deepEqual(ev.faltan, []);
  assert.equal(ev.encontrados.length, esperados.length);
});

test('mapeo de estados: solo nombres y recuentos en la petición; el validador rechaza estados y comunes desconocidos', () => {
  const estados = r.det.estados.map((e) => ({ nombre: e.nombre, actuales: e.actuales, propuesta: e.estado }));
  const p = peticionMapeoEstados(estados);
  assert.ok(!p.user.includes('"serie"') && !p.user.includes('casos_activos'));
  estados.forEach((e) => assert.ok(p.user.includes('"' + e.nombre + '"')));
  const respuesta: Record<string, string> = {};
  estados.forEach((e) => { respuesta[e.nombre] = e.propuesta; });
  respuesta[estados[0].nombre] = 'en_espera';
  respuesta['Not a state'] = 'terminado';
  const v = validarMapeo(JSON.stringify({ ...respuesta, [estados[1].nombre]: 'nope' }), estados);
  assert.equal(v.mapeo[estados[0].nombre], 'en_espera');
  assert.equal(v.cambios, 1);
  assert.equal(Object.keys(v.mapeo).length, estados.length - 1);
  assert.deepEqual(v.problemas.map((x) => x.split(':')[0]).sort(), ['Unknown common state for "' + estados[1].nombre + '"', 'Unknown state'].sort());
});

test('lectura del impacto: cada cifra del texto tiene que estar en la evaluación', () => {
  const ini = paquete.iniciativas.find((i) => i.evaluacion.resultados.some((x) => x.disponible && x.antes != null && x.despues != null))!;
  assert.ok(ini, 'B3 has an evaluated initiative');
  const x = ini.evaluacion.resultados.find((y) => y.disponible)!;
  const f = (v: number) => (x.medida === 'ciclo' ? (Math.round(v * 10) / 10) : Math.round(v * 100));
  const buena = { id: ini.id, veredicto: 'works', lectura: `It went from ${f(x.antes!)} to ${f(x.despues!)}.` };
  const inventa = { id: ini.id, veredicto: 'works', lectura: 'It improved by 999 points.' };
  const otra = { id: 'no-such-initiative', veredicto: 'works', lectura: 'Fine.' };
  const p = peticionImpacto(paquete);
  assert.ok(p.user.includes(ini.id));
  const v = validarImpacto(JSON.stringify([buena, inventa, otra]), paquete);
  assert.equal(v.lecturas.length, 1);
  assert.equal(v.lecturas[0].id, ini.id);
  assert.deepEqual(v.descartadas.map((d) => d.motivo.split(':')[0]), ['Numbers not in the evaluation', 'Unknown initiative']);
});

test('el proveedor de Claude manda la clave y la cabecera de navegador, y devuelve el texto de la respuesta', async () => {
  const llamadas: any[] = [];
  const fetchFalso = (async (url: string, init: any) => {
    llamadas.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '[{"hello": 1}]' }] }) };
  }) as unknown as typeof fetch;
  const prov = proveedorAnthropic({ clave: 'sk-test', fetch: fetchFalso });
  const texto = await prov({ system: 's', user: 'u', maxTokens: 10 });
  assert.equal(texto, '[{"hello": 1}]');
  assert.equal(llamadas[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(llamadas[0].init.headers['x-api-key'], 'sk-test');
  assert.equal(llamadas[0].init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  const cuerpo = JSON.parse(llamadas[0].init.body);
  assert.equal(cuerpo.model, MODELO_POR_DEFECTO);
  assert.equal(cuerpo.system, 's');
  assert.equal(cuerpo.messages[0].content, 'u');
  const prov2 = proveedorAnthropic({ clave: 'k', fetch: (async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) })) as unknown as typeof fetch });
  await assert.rejects(() => prov2({ system: 's', user: 'u', maxTokens: 10 }), /401: invalid x-api-key/);
});
