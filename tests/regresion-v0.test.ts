// B1: el núcleo nuevo debe dar exactamente lo mismo que el motor de la v0
// con cada export y con distintas configuraciones (comparación de JSON).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Motor } from '../nucleo/index.ts';
import type { ConfigCalculo, Deteccion } from '../nucleo/tipos.ts';
import { escenarios, fichero, json, motorV0 } from './ayudas.ts';

/** Configuraciones que ejercitan las ramas del cálculo: por defecto, otro campo de equipo, área unida, límites, FTE, etapas y ventanas. */
function configuraciones(det: Deteccion): [string, ConfigCalculo][] {
  const op = det.opcionesEquipo.filter((o) => o.id === det.equipoRecomendado)[0];
  const total = op.valores.reduce((s, v) => s + v.n, 0);
  const equipos = op.valores.filter((v) => v.n / total >= 0.02).map((v) => v.valor);
  const primero = equipos[0];
  const fte: Record<string, number> = {};
  equipos.forEach((e, i) => { fte[e] = 4 + i; });
  const espera = det.estados.filter((e) => e.etapa === 'espera' && !e.bloqueo)[0];
  const etapas: ConfigCalculo['etapas'] = espera ? { [espera.nombre]: 'curso' } : {};
  return [
    ['por defecto', {}],
    ['equipo por componente', { campoEquipo: 'componentes' }],
    ['todo un solo equipo', { campoEquipo: 'todos' }],
    ['área unida con FTE', { campoEquipo: det.equipoRecomendado, equipos, unirComo: 'El área', fte: { 'El área': 18 } }],
    ['límites, FTE y etapas', {
      campoEquipo: det.equipoRecomendado, equipos: equipos.slice(0, 3), fte, etapas,
      limites: primero ? { [primero]: { ciclo: { atencion: 5, critico: 10 }, entregas: { atencion: 8, critico: 4 }, errores: { critico: 0.05 } } } : {},
    }],
    ['ventanas distintas', { semanasActuales: 2, semanasProporciones: 6, semanasReferencia: 8 }],
  ];
}

for (const esc of escenarios()) {
  test('igual que la v0: ' + esc.nombre, async (t) => {
    const ficheros = esc.rutas.map(fichero);
    const nuevo = Motor.ingerir(ficheros), viejo = motorV0.ingerir(ficheros);
    assert.deepEqual(json(nuevo.informe), json(viejo.informe), 'informe de ingesta');
    assert.deepEqual(json(nuevo.tareas), json(viejo.tareas), 'tareas leídas');

    const detN = Motor.detectar(nuevo.tareas, nuevo.informe), detV = motorV0.detectar(viejo.tareas, viejo.informe);
    assert.deepEqual(json(detN), json(detV), 'detección');

    for (const [nombre, cfg] of configuraciones(detN)) {
      await t.test(nombre, () => {
        const mN = Motor.calcular(nuevo.tareas, detN, structuredClone(cfg));
        const mV = motorV0.calcular(viejo.tareas, detV, structuredClone(cfg));
        assert.ok(mN.equipos.length > 0, 'hay equipos');
        assert.deepEqual(json(mN), json(mV));
      });
    }
  });
}
