// Cálculos con resultado conocido. Un conjunto de tareas construido a mano, con duraciones, puntos, sprints y tipos
// conocidos, y cada medida recalculada aquí de forma independiente del motor (contando tareas, no con sus series).
// Si el motor agrupa, filtra o recorta mal una ventana, la cifra no coincide. Al final, invariantes que tienen que
// cumplirse con cualquier export de prueba.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectar } from '../nucleo/detectar.ts';
import { calcular } from '../nucleo/calcular.ts';
import { inicioSemana } from '../nucleo/util.ts';
import { CAMPOS_EQUIPO, leerJira } from '../adaptadores/jira/ingerir.ts';
import type { Lectura, Tarea } from '../nucleo/modelo.ts';
import { variantes, HOY } from './variantes.ts';
import { formatos } from './formatos.ts';
import { leerHoja, aCsv } from '../adaptadores/comun/hoja.ts';

const DIA = 864e5;
const LUNES = inicioSemana(new Date(2026, 5, 3, 12)); // primera semana del conjunto
const SEMANAS = 20;
const lunes = (w: number) => new Date(LUNES.getTime() + w * 7 * DIA);
const mas = (d: Date, dias: number, horas = 0) => new Date(d.getTime() + dias * DIA + horas * 36e5);

let n = 0;
function tarea(equipo: string, o: { creada: Date; terminada?: Date | null; curso?: number; puntos?: number; sprints?: string[]; tipo?: Tarea['tipo']; estado: string; descartada?: boolean; cambio?: Date | null }): Tarea {
  n++;
  const normal = o.descartada ? 'descartado' : o.estado === 'Done' ? 'terminado' : o.estado === 'In Progress' ? 'en_curso' : 'pendiente';
  const total = o.terminada ? o.terminada.getTime() - o.creada.getTime() : 0;
  const curso = (o.curso || 0) * DIA;
  return {
    id: 'jira:OR-' + n, clave_origen: 'OR-' + n, plataforma: 'jira', tipo: o.tipo || 'historia', tipo_origen: o.tipo === 'error' ? 'Bug' : 'Story',
    titulo: 'Tarea ' + n, descripcion: '', estado_origen: o.estado, estado_normalizado: normal as Tarea['estado_normalizado'],
    agrupadores: { equipo }, equipo_id: null, prioridad: 'media', prioridad_origen: 'Medium', estimacion: o.puntos ?? null, sprints: o.sprints || [],
    fechas: { creada: o.creada, actualizada: o.terminada || o.cambio || o.creada, empezada: null, terminada: o.terminada || null, cambio_estado: o.cambio ?? null, primera_respuesta: null },
    historial_estados: [],
    tiempos_estado: o.terminada ? [{ estado: 'To Do', visitas: 1, ms: total - curso }, { estado: 'In Progress', visitas: 1, ms: curso }] : [],
    descartada: !!o.descartada, reaperturas: null, etiquetas: [], enlaces: 0, tiene_criterios: false, padre_id: null, padre_titulo: '',
  };
}

/** Dos equipos con ritmos distintos durante 20 semanas, trabajo abierto al final y algunas tareas descartadas. */
function conjunto(): Tarea[] {
  const out: Tarea[] = [];
  const ritmo: Record<string, (w: number) => number> = { Alfa: (w) => 3 + (w % 3), Beta: (w) => 2 + (w % 2) };
  for (const eq of Object.keys(ritmo)) {
    for (let w = 0; w < SEMANAS; w++) {
      for (let j = 0; j < ritmo[eq](w); j++) {
        const creada = mas(lunes(w), -(5 + j), 9);
        const terminada = mas(lunes(w), 1 + (j % 3), 10);
        out.push(tarea(eq, {
          creada, terminada, curso: 1 + j * 0.5, puntos: 1 + (j % 3), estado: 'Done',
          // La primera de cada semana viene arrastrada del sprint anterior; una de cada dos semanas, la segunda es un bug
          sprints: j === 0 && w > 0 ? [eq + ' S' + (w - 1), eq + ' S' + w] : [eq + ' S' + w], tipo: j === 1 && w % 2 === 0 ? 'error' : j === 2 ? 'tarea' : 'historia',
        }));
      }
      // Una descartada cada cuatro semanas: no es una entrega
      if (w % 4 === 0) out.push(tarea(eq, { creada: mas(lunes(w), -3, 9), terminada: mas(lunes(w), 2, 9), estado: 'Done', descartada: true, sprints: [eq + ' S' + w], tipo: 'error' }));
    }
    // Trabajo abierto al final: en curso desde la penúltima semana y pendiente sin empezar
    const enCurso = eq === 'Alfa' ? 3 : 2, pendientes = eq === 'Alfa' ? 4 : 5;
    for (let k = 0; k < enCurso; k++) out.push(tarea(eq, { creada: mas(lunes(SEMANAS - 3), k, 9), estado: 'In Progress', cambio: mas(lunes(SEMANAS - 2), k, 11), sprints: [eq + ' S' + (SEMANAS - 1)] }));
    for (let k = 0; k < pendientes; k++) out.push(tarea(eq, { creada: mas(lunes(SEMANAS - 4), k, 9), estado: 'To Do', tipo: k === 0 ? 'error' : 'historia' }));
  }
  return out;
}

function lectura(tareas: Tarea[]): Lectura {
  return {
    plataforma: 'jira', tareas, estados: [{ nombre: 'To Do', categoria: 'To Do' }, { nombre: 'In Progress', categoria: 'In Progress' }, { nombre: 'Done', categoria: 'Done' }],
    informe: { plataforma: 'jira', ficheros: [], avisos: [], filasLeidas: tareas.length, duplicadas: 0, epicas: 0, subtareas: 0, sinClave: 0, campos: {}, tareas: tareas.length },
    camposEquipo: CAMPOS_EQUIPO, mapeoPropuesto: { 'To Do': 'pendiente', 'In Progress': 'en_curso', Done: 'terminado' }, epicas: [], detalle: {},
  } as Lectura;
}

/** Percentil con interpolación lineal (la definición del producto: "el 85 % de las tareas tarda esto o menos"). */
function percentil(v: number[], q: number): number {
  const a = v.slice().sort((x, y) => x - y), p = (a.length - 1) * q, i = Math.floor(p);
  return i + 1 < a.length ? a[i] + (a[i + 1] - a[i]) * (p - i) : a[i];
}

const T = conjunto();
const L = lectura(T);
const M = calcular(T, detectar(L), {});

test('oráculo: el calendario acaba en una semana completa y hay dos equipos', () => {
  assert.deepEqual(M.equipos.map((e) => e.nombre).sort(), ['Alfa', 'Beta']);
  assert.equal(M.semanaFin.getDay(), 1, 'la semana acaba en lunes');
});

test('oráculo: cada medida coincide con la cuenta hecha tarea a tarea', () => {
  const fin = M.semanaFin.getTime(), desde4 = fin - 28 * DIA, desde8 = fin - 56 * DIA;
  for (const e of M.equipos) {
    const mias = T.filter((t) => t.agrupadores.equipo === e.nombre);
    const entregada = (t: Tarea) => !!t.fechas.terminada && !t.descartada;
    const en = (t: Tarea, d: number) => t.fechas.terminada!.getTime() >= d && t.fechas.terminada!.getTime() < fin;
    const v4 = mias.filter((t) => entregada(t) && en(t, desde4)), v8 = mias.filter((t) => entregada(t) && en(t, desde8));
    const curso = (t: Tarea) => t.tiempos_estado.filter((x) => x.estado === 'In Progress').reduce((s, x) => s + x.ms, 0);
    // Inicio: el del estado en curso para lo abierto; para lo terminado, el fin menos su tiempo en curso
    const inicio = (t: Tarea) => (t.fechas.terminada ? t.fechas.terminada.getTime() - curso(t) : t.fechas.cambio_estado ? t.fechas.cambio_estado.getTime() : null);
    const abiertas = mias.filter((t) => t.fechas.creada.getTime() < fin && (!t.fechas.terminada || t.fechas.terminada.getTime() >= fin));
    const esperado: Record<string, number> = {
      entregas: v4.length / 4,
      velocidad: v4.reduce((s, t) => s + (t.estimacion || 0), 0) / 4,
      bugs: mias.filter((t) => t.tipo === 'error' && !t.descartada && t.fechas.creada.getTime() >= desde4 && t.fechas.creada.getTime() < fin).length / 4,
      total: percentil(v4.map((t) => (t.fechas.terminada!.getTime() - t.fechas.creada.getTime()) / DIA), 0.85),
      ciclo: percentil(v4.map((t) => curso(t) / DIA), 0.85),
      wip: abiertas.filter((t) => !t.descartada && inicio(t) != null && inicio(t)! < fin).length,
      pendiente: abiertas.filter((t) => !(inicio(t) != null && inicio(t)! < fin)).length,
      arrastradas: v8.filter((t) => t.sprints.length > 1).length / v8.length,
      errores: v8.filter((t) => t.tipo === 'error').length / v8.length,
    };
    for (const [id, x] of Object.entries(esperado)) {
      const m = e.medidas[id];
      assert.ok(m && m.disponible, `${e.nombre} ${id}: disponible`);
      assert.ok(Math.abs((m.valor as number) - x) < 1e-9, `${e.nombre} ${id}: ${m.valor} en vez de ${x}`);
    }
  }
});

test('oráculo, a mano: Alfa entrega 3, 4, 5 y 3 tareas en sus últimas cuatro semanas (media 3,75) y tiene 3 en curso y 4 sin empezar', () => {
  // Semanas 15 a 18 del conjunto (la 19 es la de la fecha del análisis, sin terminar): 3 + (w % 3) = 3, 4, 5, 3
  const a = M.equipos.find((e) => e.nombre === 'Alfa')!;
  assert.equal(M.semanaFin.getTime(), lunes(SEMANAS - 1).getTime(), 'el análisis cierra el lunes de la última semana');
  assert.equal(a.medidas.entregas.valor, 3.75);
  // En curso al cierre: las 3 abiertas en curso y las tareas que acaban en la semana 19 pero ya habían empezado
  const empezadasSem19 = T.filter((t) => t.agrupadores.equipo === 'Alfa' && !t.descartada && t.fechas.terminada && t.fechas.terminada >= M.semanaFin
    && t.fechas.terminada.getTime() - t.tiempos_estado[1].ms < M.semanaFin.getTime()).length;
  assert.equal(a.medidas.wip.valor, 3 + empezadasSem19);
});

// ---------- Invariantes con cualquier export de prueba ----------
const PROPORCIONES = ['errores', 'retrabajo', 'arrastradas', 'reparto', 'espera', 'agent_readiness'];
async function lecturas() {
  const out: [string, Lectura][] = [];
  for (const [id, v] of Object.entries(variantes())) out.push(['variante ' + id, leerJira(v.ficheros, { hoy: HOY })]);
  for (const [id, f] of Object.entries(formatos())) {
    const texto = f.html ? aCsv((await leerHoja(new TextEncoder().encode(f.texto))).filas) : f.texto;
    out.push(['formato ' + id, leerJira([{ nombre: f.nombre, texto }], { hoy: HOY })]);
  }
  out.push(['oráculo', L]);
  return out;
}

test('invariantes: ninguna tarea se pierde, ninguna cifra sale rara y toda banda está ordenada', async () => {
  const fallos: string[] = [];
  for (const [nombre, l] of await lecturas()) {
    if (!l.tareas.length) continue;
    const m = calcular(l.tareas, detectar(l), {});
    const n = m.equipos.reduce((s, e) => s + e.n, 0);
    if (n !== l.tareas.length) fallos.push(`${nombre}: ${n} tareas en equipos de ${l.tareas.length}`);
    for (const e of m.equipos) {
      if (e.series.entregas.length !== m.semanas.length) fallos.push(`${nombre} ${e.nombre}: serie de ${e.series.entregas.length} semanas, calendario de ${m.semanas.length}`);
      const entregadasEnCalendario = e.series.entregas.reduce((s, x) => s + x, 0);
      if (entregadasEnCalendario > e.entregadas) fallos.push(`${nombre} ${e.nombre}: ${entregadasEnCalendario} entregas por semana y ${e.entregadas} entregadas`);
      for (const [id, x] of Object.entries(e.medidas)) {
        if (!x.disponible) { if (!x.motivo) fallos.push(`${nombre} ${e.nombre} ${id}: no disponible sin motivo`); continue; }
        if (x.valor != null && !Number.isFinite(x.valor)) fallos.push(`${nombre} ${e.nombre} ${id}: valor ${x.valor}`);
        if (x.valor != null && x.valor < 0 && id !== 'estimacion') fallos.push(`${nombre} ${e.nombre} ${id}: negativo ${x.valor}`);
        if (x.valor != null && PROPORCIONES.includes(id) && x.valor > 1 + 1e-9) fallos.push(`${nombre} ${e.nombre} ${id}: proporción ${x.valor}`);
        if (x.ref && !(x.ref.lo <= x.ref.med + 1e-9 && x.ref.med <= x.ref.hi + 1e-9)) fallos.push(`${nombre} ${e.nombre} ${id}: banda ${JSON.stringify(x.ref)}`);
        if (x.serie && x.serie.some((y) => y != null && !Number.isFinite(y))) fallos.push(`${nombre} ${e.nombre} ${id}: serie con valores raros`);
        // La cifra de ahora es el último punto de su serie (lo que se ve en el gráfico es lo que se dice)
        if (x.serie && id !== 'edad' && (x.serie[x.serie.length - 1] ?? null) !== (x.valor ?? null)) fallos.push(`${nombre} ${e.nombre} ${id}: valor ${x.valor} y último punto ${x.serie[x.serie.length - 1]}`);
      }
    }
  }
  assert.deepEqual(fallos, [], fallos.slice(0, 10).join('\n'));
});
