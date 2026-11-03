// El núcleo sobre el modelo neutro debe dar exactamente lo mismo que el motor de la v0
// con cada export y con distintas configuraciones (comparación de JSON).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConfigCalculo, Deteccion } from '../nucleo/tipos.ts';
import { escenarios, fichero, json, motorV0, nombreNuevo, recorrido } from './ayudas.ts';

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
    ['área unida con FTE', { campoEquipo: det.equipoRecomendado, equipos, unirComo: 'Whole area', fte: { 'Whole area': 18 } }],
    ['límites, FTE y etapas', {
      campoEquipo: det.equipoRecomendado, equipos: equipos.slice(0, 3), fte, etapas,
      limites: primero ? { [primero]: { ciclo: { atencion: 5, critico: 10 }, entregas: { atencion: 8, critico: 4 }, errores: { critico: 0.05 } } } : {},
    }],
    ['ventanas distintas', { semanasActuales: 2, semanasProporciones: 6, semanasReferencia: 8 }],
  ];
}

/**
 * Los textos pasaron a inglés después de la v0 (oct 2026): mismas cifras, otro idioma. Antes de comparar se quitan los
 * campos de texto libre (estadoTexto, evidencia, motivo, avisos) y los nombres fijos de la v0 se traducen a los nuevos.
 * Los textos en inglés los comprueban los demás tests (casos sembrados, banco de exports, fiabilidad, definiciones).
 */
const CAMPOS_TEXTO = new Set(['estadoTexto', 'evidencia', 'motivo', 'avisos']);
function sinTextos<T>(x: T): T {
  const recorrer = (v: unknown): unknown => {
    if (typeof v === 'string') return nombreNuevo(v);
    if (Array.isArray(v)) return v.map(recorrer);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !CAMPOS_TEXTO.has(k)).map(([k, w]) => [nombreNuevo(k), recorrer(w)]));
    return v;
  };
  return recorrer(json(x)) as T;
}

/** Lo que el núcleo añade después de la v0 no existe en la v0: se quita antes de comparar.
 *  B3: agent readiness. v3: medida de bugs nuevos, y qué decide el estado y el estado de la referencia en cada medida.
 *  Nov 2026: lado (mejor de lo normal), revisar (comparación dudosa) y días con cierres masivos. */
function sinNovedades(m: unknown): unknown {
  type M = Record<string, Record<string, unknown>>;
  const x = json(m) as { equipos: { medidas: M; kpis: M; series: Record<string, unknown>; calidad?: Record<string, unknown> }[] };
  // Nov 2026 (auditoría UX): con línea base manda la línea base y el límite fijo superado queda como aviso. La v0 daba el
  // peor de los dos: para comparar, el estado se recompone con el aviso (mismas cifras, otra forma de enseñarlas).
  const ORDEN: Record<string, number> = { bien: 0, atencion: 1, critico: 2 };
  const conAviso = (v: Record<string, unknown>) => {
    const a = v.aviso as { estado: string } | undefined;
    if (a && ORDEN[a.estado] > (ORDEN[v.estado as string] ?? -1)) v.estado = a.estado;
  };
  const limpiar = (ms: M) => Object.values(ms || {}).forEach((v) => { conAviso(v); delete v.aviso; delete v.margen; delete v.estadoPor; delete v.limite; delete v.referencia; delete v.lado; delete v.revisar; delete v.estadoBanda; });
  x.equipos.forEach((e) => {
    delete e.medidas.agent_readiness; delete e.series.agentReady;
    delete e.medidas.bugs; delete e.series.bugsEntrada; delete e.series.bugsMedia;
    limpiar(e.medidas); limpiar(e.kpis);
    // Nov 2026: días con cierres masivos por equipo (dato nuevo; no cambia ninguna cifra)
    if (e.calidad) delete e.calidad.diasMasivos;
  });
  return x;
}

/** Nov 2026 (auditoría UX): "Mucho retrabajo" ya no salta si el equipo está mejor que su línea base (20 % o más, pero
 *  por debajo de su franja). Solo en esos equipos cambia algo frente a la v0: ahí se quita el caso en los dos lados, y en
 *  todos los demás se sigue comparando. La regla nueva se comprueba también en aseguradora.test.ts. */
type ConCasos = { equipos: { nombre: string; medidas: Record<string, { valor?: number | null; ref?: { lo: number } }>; casos?: { id: string }[] }[] };
function retrabajoMejorQueSuBase(m: unknown): Set<string> {
  return new Set((m as ConCasos).equipos.filter((e) => {
    const rt = e.medidas.retrabajo;
    return !!(rt && rt.ref && rt.valor != null && rt.valor >= 0.2 && rt.valor < rt.ref.lo);
  }).map((e) => e.nombre));
}
function sinCasoRetrabajo(m: unknown, equipos: Set<string>): unknown {
  (m as ConCasos).equipos.forEach((e) => { if (equipos.has(e.nombre) && Array.isArray(e.casos)) e.casos = e.casos.filter((c) => c.id !== 'retrabajo'); });
  return m;
}

function sinSprintsDelArea(m: unknown, area: boolean): unknown {
  if (!area) return m;
  const x = m as { equipos: { medidas: Record<string, unknown>; series: Record<string, unknown>; sprints?: unknown; casos?: unknown }[] };
  x.equipos.forEach((e) => { delete e.medidas.arrastradas; delete e.series.arrastradas; delete e.sprints; delete e.casos; });
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
      // Los avisos están en inglés: se comprueba que son los mismos en número y tipo (su texto lo prueban el banco de exports y los fallos sembrados)
      const tipos = (a: { tipo: string }[]) => a.map((x) => x.tipo).sort();
      assert.deepEqual(tipos([...inf.avisos, ...det.avisos]), tipos([...infV.avisos, ...detV.avisos]), 'avisos');
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
          tis: o.tis.map((x: any) => [detV.nombrePorId[x.id] || 'Status ' + x.id, x.n, x.v * detV.factorTis]),
        };
        assert.deepEqual(json(proyeccion), json(esperado), 'tarea ' + o.clave);
      });
    });

    await t.test('detección', () => {
      for (const k of ['fechaMin', 'fechaMax', 'fechaRef', 'opcionesEquipo', 'equipoRecomendado', 'haySprints', 'sprintsComoFecha'] as const) {
        assert.deepEqual(sinTextos(det[k]), sinTextos(detV[k]), k);
      }
      assert.equal(det.hayTiempos, detV.hayTis);
      const proy = (e: any) => ({ nombre: e.nombre, actuales: e.actuales, visitas: e.visitas, categoria: e.categoria, horasMedias: e.horasMedias, etapa: e.etapa, bloqueo: e.bloqueo });
      assert.deepEqual(sinTextos(det.estados.map(proy)), sinTextos(detV.estados.map(proy)), 'estados');
    });

    for (const [nombre, cfg] of configuraciones(det)) {
      await t.test('cálculo: ' + nombre, () => {
        const mN = recorrido(ficheros, structuredClone(cfg)).modelo;
        const mV = motorV0.calcular(viejo.tareas, detV, structuredClone(cfg));
        assert.ok(mN.equipos.length > 0, 'hay equipos');
        // v3: en la visión del área los sprints se cuentan por equipo de origen. La v0 los sumaba y daba los sprints
        // del área por no creíbles. Lo que depende de eso (arrastradas, sprints y casos) se comprueba en v3-nucleo.test.ts.
        const area = nombre === 'área unida con FTE';
        const mejores = retrabajoMejorQueSuBase(json(mN));
        // Donde cambia la regla, el núcleo nuevo no da "mucho retrabajo"
        mN.equipos.filter((e) => mejores.has(e.nombre)).forEach((e) => assert.ok(!(e.casos || []).some((c) => c.id === 'retrabajo'), 'sin mucho retrabajo en ' + e.nombre));
        assert.deepEqual(sinTextos(sinCasoRetrabajo(sinSprintsDelArea(sinNovedades(mN), area), mejores)), sinTextos(sinCasoRetrabajo(sinSprintsDelArea(json(mV), area), mejores)));
      });
    }
  });
}
