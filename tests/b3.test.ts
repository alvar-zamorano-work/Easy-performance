// B3: internos frente a proveedores, iniciativas, agent readiness y paquete de diagnóstico,
// sobre los datos sintéticos de datos-sinteticos/b3 (con lo sembrado en escenarios.json).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SINTETICOS, json } from './ayudas.ts';
import { ficheros as generarB3 } from '../herramientas/generar-sinteticos-b3.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import { diferenciaEstratificada, tamanoDe } from '../nucleo/grupos.ts';
import { conEfecto } from '../nucleo/iniciativas.ts';
import { CRITERIOS_AR } from '../nucleo/agent-readiness.ts';
import { comprobarPaquete } from '../nucleo/paquete.ts';
import { cuantil } from '../nucleo/util.ts';
import { validar } from '../esquemas/validar.ts';
import type { ClienteV2 } from '../nucleo/cliente.ts';

const DIR = join(SINTETICOS, 'b3');
const leer = (...p: string[]) => readFileSync(join(DIR, ...p), 'utf8');
const escenarios = JSON.parse(leer('escenarios.json'));
const cliente: ClienteV2 = JSON.parse(leer('cliente', 'cliente.json'));
const iniciativas = readdirSync(join(DIR, 'cliente', 'iniciativas')).sort().map((f) => JSON.parse(leer('cliente', 'iniciativas', f)));
const contexto = JSON.parse(leer('cliente', 'contexto', 'contexto.json'));
const lectura = leerJira([{ nombre: 'jira-b3.csv', texto: leer('jira-b3.csv') }]);
const r = diagnosticar(lectura, cliente, iniciativas, contexto, { generado: new Date(2026, 9, 15) });

test('los datos sintéticos de B3 salen idénticos al regenerarlos', () => {
  const nuevos = generarB3();
  for (const [nombre, texto] of Object.entries(nuevos)) assert.equal(texto, leer(...nombre.split('/')), nombre);
});

test('la carpeta del cliente B3 cumple los esquemas', () => {
  assert.ok(validar('modelo/cliente', cliente).valido);
  iniciativas.forEach((i) => assert.ok(validar('modelo/iniciativa', i).valido, i.id));
  assert.ok(validar('modelo/contexto', contexto).valido);
});

test('agent readiness: cada ticket saca exactamente el índice sembrado', () => {
  const tickets: Record<string, string> = escenarios.tickets;
  let comprobados = 0;
  for (const items of Object.values(r.preparacion.porEquipo)) for (const d of items) {
    const sembrado = tickets[d.t.clave_origen];
    assert.ok(sembrado, 'falta ' + d.t.clave_origen);
    const obtenido = CRITERIOS_AR.map((k) => (d.ar.criterios[k] ? '1' : '0')).join('');
    assert.equal(obtenido, sembrado, d.t.clave_origen);
    comprobados++;
  }
  assert.equal(comprobados, Object.keys(tickets).length);
});

test('agent readiness: los equipos quedan en el orden sembrado y el más bajo es un proveedor', () => {
  const ar = r.paquete.agent_readiness.equipos as Record<string, { indiceMedio: number }>;
  const orden = Object.entries(ar).sort((a, b) => b[1].indiceMedio - a[1].indiceMedio).map(([n]) => n);
  assert.deepEqual(orden, ['Pagos', 'Riesgos', 'Portal clientes', 'App móvil']);
  assert.equal(orden[3], escenarios.agent_readiness_bajo);
  assert.ok(r.casosGrupo.some((c) => c.id === 'grupo_agent_ready' && c.dimension === 'proveedor' && c.grupo === 'Proveedor Norte'));
  assert.ok(r.casosAgentReady.some((c) => c.equipo === 'App móvil' && c.gravedad === 'critico'));
});

test('internos frente a proveedores: se detecta la diferencia sembrada en plazo, retrabajo y reaperturas', () => {
  const tipo = r.comparaciones.find((c) => c.dimension === 'tipo')!;
  for (const m of Object.keys(escenarios.diferencia_entre_grupos.medidas)) {
    const d = tipo.diferencias.find((x) => x.medida === m);
    assert.ok(d, 'no se detecta ' + m);
    assert.equal(d.peor, 'proveedor', m);
  }
  assert.ok(!tipo.diferencias.some((d) => d.peor === 'interno'), 'ninguna diferencia en contra de los internos');
  assert.ok(r.casosGrupo.some((c) => c.id === 'grupo_plazo' && c.dimension === 'tipo' && c.grupo === 'proveedor'));
  assert.ok(r.casosGrupo.some((c) => c.id === 'grupo_calidad' && c.dimension === 'tipo' && c.grupo === 'proveedor'));
});

test('entre los dos proveedores, sembrados iguales, no sale ninguna diferencia de plazo ni de calidad', () => {
  const prov = r.comparaciones.find((c) => c.dimension === 'proveedor')!;
  assert.deepEqual(prov.diferencias, []);
});

test('cada celda con menos de 20 tareas dice "pocos datos" (valor nulo)', () => {
  for (const c of r.comparaciones) for (const m of Object.values(c.medidas)) for (const s of m.segmentos) for (const x of Object.values(s.porGrupo)) {
    if (x.n < 20) assert.equal(x.valor, null);
  }
});

test('un reparto de trabajo distinto no fabrica diferencias: la comparación es dentro del mismo tipo y tamaño', () => {
  // Mismos equipos internos partidos en dos grupos: uno con más tareas grandes y otro con más pequeñas.
  const internos = [...r.preparacion.porEquipo['Pagos'], ...r.preparacion.porEquipo['Riesgos']].filter((d) => d.entregada && d.ciclo != null);
  const a: typeof internos = [], b: typeof internos = [];
  internos.forEach((d, i) => {
    const grande = tamanoDe(d) !== 'pequena';
    ((grande ? i % 10 < 9 : i % 10 < 1) ? a : b).push(d);
  });
  const p80 = (ds: typeof internos) => cuantil(ds.map((d) => d.ciclo!), 0.8)!;
  assert.ok(p80(a) / p80(b) - 1 > 0.25, 'sin segmentar parece que A tarda mucho más');
  const est = diferenciaEstratificada('plazo_p80', a, b)!;
  assert.ok(Math.abs(est.z) < 2, 'segmentando por tipo y tamaño no hay diferencia clara (z = ' + est.z.toFixed(2) + ')');
});

test('iniciativas: la sembrada con efecto da efecto en la dirección esperada y la otra no', () => {
  for (const s of escenarios.iniciativas) {
    const ev = r.iniciativas.find((x) => x.iniciativa.id === s.id)!.evaluacion;
    assert.equal(conEfecto(ev), s.conEfecto, s.id);
    const res = ev.resultados[0];
    assert.equal(res.disponible, true, s.id);
    assert.ok(res.ventanas!.completa, s.id);
    if (s.conEfecto) {
      assert.ok(res.efecto! < 0 && res.despues! < res.antes!, 'el ciclo baja');
      assert.notEqual(res.confianza, 'baja');
    }
  }
});

test('paquete de diagnóstico: cumple el esquema y no lleva nada prohibido', () => {
  assert.deepEqual(r.problemas, []);
  const v = validar('paquete', json(r.paquete));
  assert.ok(v.valido, v.errores.join('; '));
  const texto = JSON.stringify(r.paquete);
  assert.ok(!/Persona /.test(texto), 'sin personas');
  assert.ok(!/\b(PAG|RIE|APP|POR)-\d+\b/.test(texto), 'sin claves de ticket');
  for (const t of lectura.tareas.slice(0, 200)) assert.ok(!texto.includes(t.descripcion.slice(0, 60)) || !t.descripcion, 'sin descripciones');
  assert.ok(r.paquete.contexto.organizacion.vacia && !r.paquete.contexto.metodo.vacia, 'categorías de contexto vacías marcadas');
});

test('paquete de diagnóstico: el validador rechaza campos prohibidos, claves de ticket y nombres que no pueden salir', () => {
  const p = json(r.paquete) as Record<string, any>;
  const conTitulo = structuredClone(p); conTitulo.casos_activos[0].titulo = 'Mejorar el pago';
  assert.ok(comprobarPaquete(conTitulo).some((x) => /titulo/.test(x)));
  assert.equal(validar('paquete', conTitulo).valido, false);
  const conClave = structuredClone(p); conClave.casos_grupo[0].evidencia += ' Ver PAG-12.';
  assert.ok(comprobarPaquete(conClave).some((x) => /clave de ticket/.test(x)));
  const conPersona = structuredClone(p); conPersona.equipos[0].asignado = 'Persona PAG1';
  assert.ok(comprobarPaquete(conPersona).some((x) => /asignado/.test(x)));
  const conDescripcion = structuredClone(p); conDescripcion.datos.avisos.push({ tipo: 'aviso', texto: 'x'.repeat(700) });
  assert.ok(comprobarPaquete(conDescripcion).some((x) => /demasiado largo/.test(x)));
  assert.ok(comprobarPaquete(p, { nombresProhibidos: ['Pagos'] }).length > 0);
  assert.deepEqual(comprobarPaquete(p), []);
});

test('paquete de diagnóstico con alias: no aparece el nombre real de ningún equipo', () => {
  const alias = { 'Pagos': 'Equipo A', 'Riesgos': 'Equipo B', 'App móvil': 'Equipo C', 'Portal clientes': 'Equipo D' };
  const ra = diagnosticar(lectura, cliente, iniciativas, contexto, { alias, generado: new Date(2026, 9, 15) });
  assert.deepEqual(comprobarPaquete(ra.paquete, { nombresProhibidos: Object.keys(alias) }), []);
  assert.ok(validar('paquete', json(ra.paquete)).valido);
});
