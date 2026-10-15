// Esquemas JSON: el catálogo y los ficheros del cliente validan, las referencias cruzadas existen
// y los errores típicos se rechazan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, SINTETICOS, json, recorrido, fichero } from './ayudas.ts';
import { validar, type NombreEsquema } from '../esquemas/validar.ts';
import { CATALOGO } from '../nucleo/catalogo.ts';
import { migrarClienteV0, configDesdeCliente, type ClienteV2 } from '../nucleo/cliente.ts';
import { calcular } from '../nucleo/calcular.ts';

const leer = (...p: string[]) => JSON.parse(readFileSync(join(...p), 'utf8'));
const ok = (esquema: NombreEsquema, valor: unknown, que: string) => {
  const r = validar(esquema, valor);
  assert.ok(r.valido, que + ': ' + r.errores.join('; '));
};
const mal = (esquema: NombreEsquema, valor: unknown, que: string) => assert.equal(validar(esquema, valor).valido, false, que);

test('cada fichero del catálogo cumple su esquema', () => {
  for (const f of readdirSync(join(RAIZ, 'catalogo')).filter((n) => n.endsWith('.json'))) {
    ok(('catalogo/' + f.replace('.json', '')) as NombreEsquema, leer(RAIZ, 'catalogo', f), f);
  }
});

test('referencias cruzadas del catálogo', () => {
  const medidas = new Set(Object.keys(CATALOGO.medidas)), casos = new Set(Object.keys(CATALOGO.casos)), objetivos = new Set(CATALOGO.objetivos.map((o) => o.id));
  assert.deepEqual([...CATALOGO.ordenMedidas].sort(), [...medidas].sort(), 'el orden recoge todas las medidas');
  for (const o of CATALOGO.objetivos) {
    o.medidas.forEach((m) => assert.ok(medidas.has(m), `objetivo ${o.id}: medida ${m}`));
    o.casos.forEach((c) => assert.ok(casos.has(c), `objetivo ${o.id}: caso ${c}`));
  }
  for (const [id, c] of Object.entries(CATALOGO.casos)) {
    if (c.medida) assert.ok(medidas.has(c.medida), `caso ${id}: medida ${c.medida}`);
    c.objetivos.forEach((o) => assert.ok(objetivos.has(o), `caso ${id}: objetivo ${o}`));
  }
  const estados = Object.keys(CATALOGO.estados.estados);
  assert.equal(estados.length, 9);
  CATALOGO.estados.reglas.forEach((r) => assert.doesNotThrow(() => new RegExp(r.patron), r.patron));
});

test('textos del catálogo sin rayas', () => {
  const texto = readdirSync(join(RAIZ, 'catalogo')).map((f) => readFileSync(join(RAIZ, 'catalogo', f), 'utf8')).join('\n');
  assert.ok(!/[\u2014\u2013]/.test(texto), 'hay rayas en el catálogo');
});

test('carpeta de cliente de ejemplo: cliente.json, iniciativas y contexto validan', () => {
  const dir = join(SINTETICOS, 'cliente-ejemplo');
  ok('modelo/cliente', leer(dir, 'cliente.json'), 'cliente.json');
  for (const f of readdirSync(join(dir, 'iniciativas'))) ok('modelo/iniciativa', leer(dir, 'iniciativas', f), f);
  ok('modelo/contexto', leer(dir, 'contexto', 'contexto.json'), 'contexto.json');
});

test('errores típicos se rechazan', () => {
  const dir = join(SINTETICOS, 'cliente-ejemplo');
  const cliente = leer(dir, 'cliente.json');
  const equipo = cliente.equipos.lista[2];
  mal('modelo/equipo', { ...equipo, proveedor: null }, 'proveedor sin nombre de proveedor');
  mal('modelo/equipo', { ...cliente.equipos.lista[0], proveedor: 'X' }, 'equipo interno con proveedor');
  mal('modelo/equipo', { ...equipo, fte: [{ periodo: '2026-09', valor: 4, origen: 'a ojo' }] }, 'origen del FTE desconocido');
  mal('modelo/cliente', { ...cliente, mapeoEstados: { Done: 'cerrado' } }, 'estado normalizado que no existe');
  mal('modelo/iniciativa', { ...leer(dir, 'iniciativas', 'limite-wip-app-movil.json'), medidas_objetivo: [] }, 'iniciativa sin medida objetivo');
  mal('modelo/contexto', { documentos: [{ categoria: 'rumores', titulo: 'x', resumen: 'y', fuente: '', fecha: '2026-10-01' }] }, 'categoría de contexto desconocida');
  const r = recorrido([fichero(join(SINTETICOS, 'jira-ejemplo-completo-2026-10-12.csv'))]);
  const tarea = json(r.lectura.tareas[0]) as Record<string, unknown>;
  mal('modelo/tarea', { ...tarea, asignado: 'Persona MOV2' }, 'una tarea con persona asignada');
  mal('modelo/tarea', { ...tarea, estado_normalizado: 'hecho' }, 'estado normalizado que no existe');
});

test('cliente.json de la v0 se convierte a la versión 2 y calcula lo mismo', () => {
  const r = recorrido([fichero(join(SINTETICOS, 'jira-ejemplo-completo-2026-10-12.csv'))]);
  const v0 = {
    version: 1, campoEquipo: 'equipo', equipos: ['App móvil', 'Datos', 'Pagos', 'Portal clientes'],
    etapas: { 'To Do': 'pendiente', 'In Progress': 'curso', 'In Review': 'espera', 'Blocked': 'espera', 'Done': 'hecho' } as const,
    objetivos: ['tardamos'], medidas: ['ciclo'], fte: { Pagos: 5, Datos: 6 }, limites: { Datos: { retrabajo: { atencion: 0.15, critico: 0.25 } } },
    textos: { 'equipo.titulo': 'Informe de la semana' }, planHecho: { 'Datos|retrabajo|0': true },
  };
  const v2: ClienteV2 = migrarClienteV0(v0, r.det, 'Cliente de ejemplo', '2026-09');
  ok('modelo/cliente', json(v2), 'cliente migrado');
  assert.equal(v2.mapeoEstados.Blocked, 'bloqueado');
  const a = calcular(r.lectura.tareas, r.det, { campoEquipo: v0.campoEquipo, equipos: v0.equipos, etapas: { ...v0.etapas }, fte: v0.fte, limites: v0.limites });
  const b = calcular(r.lectura.tareas, r.det, configDesdeCliente(v2));
  assert.deepEqual(json(b), json(a));
});
