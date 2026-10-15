// El núcleo sobre el modelo neutro debe dar exactamente lo mismo que el motor de la v0
// con cada export y con distintas configuraciones (comparación de JSON).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConfigCalculo, Deteccion } from '../nucleo/tipos.ts';
import { escenarios, fichero, json, motorV0, recorrido } from './ayudas.ts';

/** Configuraciones que ejercitan las ramas del cálculo. Se pasan igual a la v0 y al núcleo nuevo (que acepta "etapas" de la v0). */
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

const textos = (a: { texto: string }[]) => a.map((x) => x.texto).sort();

/** Lo que el núcleo añade después de la v0 (B3: agent readiness) no existe en la v0: se quita antes de comparar. */
function sinNovedades(m: unknown): unknown {
  const x = json(m) as { equipos: { medidas: Record<string, unknown>; series: Record<string, unknown> }[] };
  x.equipos.forEach((e) => { delete e.medidas.agent_readiness; delete e.series.agentReady; });
  return x;
}

for (const esc of escenarios()) {
  test('igual que la v0: ' + esc.nombre, async (t) => {
    const ficheros = esc.rutas.map(fichero);
    const { lectura, det } = recorrido(ficheros);
    const viejo = motorV0.ingerir(ficheros);
    const detV = motorV0.detectar(viejo.tareas, viejo.informe);
    const infV = viejo.informe as any;

    await t.test('lectura del export', () => {
      const inf = lectura.informe;
      for (const k of ['ficheros', 'filasLeidas', 'duplicadas', 'epicas', 'subtareas', 'sinClave', 'tareas'] as const) {
        assert.deepEqual(json(inf[k]), json(infV[k]), k);
      }
      for (const k of Object.keys(infV.campos)) assert.equal(inf.campos[k], infV.campos[k], 'campo ' + k);
      assert.deepEqual(textos([...inf.avisos, ...det.avisos]), textos([...infV.avisos, ...detV.avisos]), 'avisos');
      assert.equal(lectura.detalle.unidadTiempoMs, detV.factorTis, 'unidad del Tiempo en estado');
      assert.deepEqual(lectura.detalle.nombrePorId, detV.nombrePorId, 'nombres de estado por id');
    });

    await t.test('tareas en el modelo neutro', () => {
      const v0 = viejo.tareas as any[];
      assert.equal(lectura.tareas.length, v0.length);
      lectura.tareas.forEach((n, i) => {
        const o = v0[i];
        const proyeccion = {
          clave: n.clave_origen, resumen: n.titulo, tipo: n.tipo, tipoTxt: n.tipo_origen, estado: n.estado_origen,
          creada: n.fechas.creada, actualizada: n.fechas.actualizada, resuelta: n.fechas.terminada, cambioCategoria: n.fechas.cambio_estado,
          primera: n.fechas.primera_respuesta, prioridad: n.prioridad_origen, urgente: n.prioridad === 'urgente', etiquetas: n.etiquetas,
          sprints: n.sprints, puntos: n.estimacion, equipoCampo: n.agrupadores.equipo, componente: n.agrupadores.componentes,
          proyecto: n.agrupadores.proyecto, padre: n.padre_titulo, descartada: n.descartada,
          tis: n.tiempos_estado.map((x) => [x.estado, x.visitas, x.ms]),
        };
        const esperado = {
          clave: o.clave, resumen: o.resumen, tipo: o.tipo, tipoTxt: o.tipoTxt, estado: o.estado,
          creada: o.creada, actualizada: o.actualizada, resuelta: o.resuelta, cambioCategoria: o.cambioCategoria,
          primera: o.primera, prioridad: o.prioridad, urgente: o.urgente, etiquetas: o.etiquetas,
          sprints: o.sprints, puntos: o.puntos, equipoCampo: o.equipoCampo, componente: o.componentes[0] || '',
          proyecto: o.proyecto, padre: o.padre, descartada: o.descartada,
          tis: o.tis.map((x: any) => [detV.nombrePorId[x.id] || 'Estado ' + x.id, x.n, x.v * detV.factorTis]),
        };
        assert.deepEqual(json(proyeccion), json(esperado), 'tarea ' + o.clave);
      });
    });

    await t.test('detección', () => {
      for (const k of ['fechaMin', 'fechaMax', 'fechaRef', 'opcionesEquipo', 'equipoRecomendado', 'haySprints', 'sprintsComoFecha'] as const) {
        assert.deepEqual(json(det[k]), json(detV[k]), k);
      }
      assert.equal(det.hayTiempos, detV.hayTis);
      const proy = (e: any) => ({ nombre: e.nombre, actuales: e.actuales, visitas: e.visitas, categoria: e.categoria, horasMedias: e.horasMedias, etapa: e.etapa, bloqueo: e.bloqueo });
      assert.deepEqual(json(det.estados.map(proy)), json(detV.estados.map(proy)), 'estados');
    });

    for (const [nombre, cfg] of configuraciones(det)) {
      await t.test('cálculo: ' + nombre, () => {
        const mN = recorrido(ficheros, structuredClone(cfg)).modelo;
        const mV = motorV0.calcular(viejo.tareas, detV, structuredClone(cfg));
        assert.ok(mN.equipos.length > 0, 'hay equipos');
        assert.deepEqual(sinNovedades(mN), json(mV));
      });
    }
  });
}
