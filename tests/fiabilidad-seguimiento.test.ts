// Fiabilidad de los datos y seguimiento automático de iniciativas, sobre los datos sintéticos de B3 y Jira.csv.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS, PRUEBA } from './ayudas.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import { configDesdeCliente, type ClienteV2 } from '../nucleo/cliente.ts';
import { fiabilidad, COMPROBACIONES_EQUIPO } from '../nucleo/fiabilidad.ts';
import { seguimiento } from '../nucleo/seguimiento.ts';
import { evaluarIniciativa, conEfecto } from '../nucleo/iniciativas.ts';

const DIR = join(SINTETICOS, 'b3');
const leer = (...p: string[]) => readFileSync(join(DIR, ...p), 'utf8');
const cliente: ClienteV2 = JSON.parse(leer('cliente', 'cliente.json'));
const iniciativas = readdirSync(join(DIR, 'cliente', 'iniciativas')).sort().map((f) => JSON.parse(leer('cliente', 'iniciativas', f)));
const lectura = leerJira([{ nombre: 'jira-b3.csv', texto: leer('jira-b3.csv') }]);
const cfg = configDesdeCliente(cliente);
const r = diagnosticar(lectura, cliente, iniciativas, null, { config: cfg, generado: new Date(2026, 9, 15) });

test('fiabilidad B3: diez comprobaciones con valor, umbral y arreglo, y nivel coherente', () => {
  const f = fiabilidad(lectura, r.det, r.preparacion, r.modelo, cfg);
  assert.equal(f.comprobaciones.length, 10);
  f.comprobaciones.forEach((c) => { assert.ok(c.nombre && c.que && c.valor && c.umbral && c.arreglo && c.detalle, c.id); assert.ok(['bien', 'revisar', 'sin'].includes(c.estado), c.id); });
  assert.equal(f.bien + f.revisar + f.comprobaciones.filter((c) => c.estado === 'sin').length, 10);
  const eq = f.comprobaciones.find((c) => c.id === 'equipo')!;
  assert.equal(eq.valor, '100%');
  assert.equal(eq.estado, 'bien');
  assert.equal(f.comprobaciones.find((c) => c.id === 'estados')!.estado, 'bien', 'los estados de B3 están confirmados');
  assert.equal(f.porEquipo.length, 4);
  f.porEquipo.forEach((e) => assert.deepEqual(Object.keys(e.valores).sort(), [...COMPROBACIONES_EQUIPO].sort()));
  assert.equal(f.nivel, f.revisar <= 1 ? 'alta' : f.revisar <= 3 ? 'media' : 'baja');
  assert.ok(!/[\u2014\u2013]/.test(JSON.stringify(f)), 'sin rayas');
});

test('fiabilidad: sin confirmar los estados de un export real, los que no se reconocen por nombre se piden revisar', () => {
  const l = leerJira([{ nombre: 'Jira.csv', texto: readFileSync(join(PRUEBA, 'Jira.csv'), 'utf8') }]);
  const c: ClienteV2 = { version: 2, nombre: '', sector: '', plataforma: 'jira', mapeoEstados: {}, equipos: { campo: 'componentes', lista: ['Infrastructure', 'Mobile', 'Web'].map((n) => ({ id: n, nombre: n, tipo: 'interno', proveedor: null, area: null, usa_sprints: true, fte: [], limites: {} })) }, objetivos: [], medidas: [] } as unknown as ClienteV2;
  const x = diagnosticar(l, c, [], null, { config: { campoEquipo: 'componentes', equipos: ['Infrastructure', 'Mobile', 'Web'] } });
  const f = fiabilidad(l, x.det, x.preparacion, x.modelo, {});
  const est = f.comprobaciones.find((k) => k.id === 'estados')!;
  const sinNombre = x.det.estados.filter((e) => e.propuestaPor !== 'nombre').length;
  assert.equal(est.estado, sinNombre ? 'revisar' : 'bien');
  assert.equal(est.valor, (x.det.estados.length - sinNombre) + ' of ' + x.det.estados.length);
});

test('seguimiento: la iniciativa sembrada que funciona sale como funciona, con serie y evaluación completa', () => {
  for (const x of r.iniciativas) {
    const s = seguimiento(x.iniciativa, x.evaluacion, r.preparacion);
    assert.ok(s.serie.length >= 12, 'serie de ' + x.iniciativa.id);
    assert.ok(s.serie.some((p) => p.iniciativa != null) && s.serie.some((p) => p.control != null));
    if (conEfecto(x.evaluacion)) assert.equal(s.estado, 'funciona', x.iniciativa.id);
    else assert.ok(['sin_efecto', 'empeora'].includes(s.estado), x.iniciativa.id + ': ' + s.estado);
    assert.ok(s.completa && s.progreso === 1, 'ventana completa');
    assert.match(s.texto, /Evaluation complete/);
  }
  assert.equal(r.iniciativas.filter((x) => seguimiento(x.iniciativa, x.evaluacion, r.preparacion).estado === 'funciona').length, 1);
});

test('seguimiento: una iniciativa recién empezada está midiendo y una futura, planificada', () => {
  const fin = r.preparacion.ctx.semanaFin;
  const dia = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const base = { ...iniciativas[0], id: 'prueba', equipos: ['Payments'], medidas_objetivo: [{ medida: 'retrabajo', direccion: 'bajar' }] };
  const reciente = { ...base, fecha_inicio: dia(new Date(fin.getTime() - 5 * 864e5)) };
  const s1 = seguimiento(reciente, evaluarIniciativa(reciente, r.preparacion), r.preparacion);
  assert.equal(s1.estado, 'midiendo');
  assert.equal(s1.progreso, 0);
  const futura = { ...base, fecha_inicio: dia(new Date(fin.getTime() + 20 * 864e5)) };
  assert.equal(seguimiento(futura, evaluarIniciativa(futura, r.preparacion), r.preparacion).estado, 'planificada');
  const mitad = { ...base, fecha_inicio: dia(new Date(fin.getTime() - (14 + 28) * 864e5)) };
  const s3 = seguimiento(mitad, evaluarIniciativa(mitad, r.preparacion), r.preparacion);
  assert.ok(s3.progreso > 0.4 && s3.progreso < 0.6, 'a mitad de la ventana de 8 semanas: ' + s3.progreso);
  assert.equal(s3.completa, false);
});
