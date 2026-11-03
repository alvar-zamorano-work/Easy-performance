// Robustez con datos imperfectos (auditoría de noviembre de 2026). Cada variante reproduce un fallo típico de lo que
// manda un cliente. Lo que se lee igual tiene que dar las mismas cifras; lo que no se puede medir no puede salir "normal".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variantes, HOY, EQUIPO_TARDIO, EQUIPO_SALTO } from './variantes.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { detectar } from '../nucleo/detectar.ts';
import { calcular } from '../nucleo/calcular.ts';
import { estadoMedida, revisarComparacion, inicioReferencia } from '../nucleo/semaforo.ts';
import { diasMasivos } from '../nucleo/calidad.ts';
import { unificarAgrupadores } from '../adaptadores/comun/limpieza.ts';
import { elegirColumnaEquipo, valorVacio, describirColumnas } from '../adaptadores/jira/columnas.ts';
import type { Tarea } from '../nucleo/modelo.ts';
import { CATALOGO } from '../nucleo/catalogo.ts';
import type { Derivada } from '../nucleo/tipos.ts';

const V = variantes();
function medir(nombre: string) {
  const lectura = leerJira(V[nombre].ficheros, { hoy: HOY });
  const det = detectar(lectura);
  const modelo = calcular(lectura.tareas, det, {});
  return { lectura, det, modelo };
}
const entregasPorEquipo = (m: ReturnType<typeof medir>['modelo']) =>
  Object.fromEntries(m.equipos.map((e) => [e.nombre, e.medidas.entregas.valor]));

const base = medir('original');

for (const nombre of ['castellano', 'fechasEEUU', 'excelEspanol', 'solapados']) {
  test(`se lee igual: ${V[nombre].que}`, () => {
    const r = medir(nombre);
    assert.equal(r.lectura.tareas.length, base.lectura.tareas.length, 'tareas');
    assert.equal(r.det.fechaRef.getTime(), base.det.fechaRef.getTime(), 'fecha del análisis');
    assert.deepEqual(entregasPorEquipo(r.modelo), entregasPorEquipo(base.modelo), 'entregas por equipo');
  });
}

test('fechas imposibles: se ignoran, se avisa y no mueven la fecha del análisis', () => {
  const r = medir('fechaImposible');
  assert.equal(r.det.fechaRef.getTime(), base.det.fechaRef.getTime(), 'fecha del análisis');
  assert.equal(r.lectura.informe.fechasImposibles, 2);
  // Sale la creada en 1999 y también la terminada en 2031: si no, contaría como abierta para siempre
  assert.equal(r.lectura.tareas.length, base.lectura.tareas.length - 2);
  assert.ok(r.lectura.informe.avisos.some((a) => /impossible dates|fechas imposibles/.test(a.texto)), 'aviso');
});

test('nombres de equipo con mayúsculas o espacios distintos: un solo equipo y aviso', () => {
  const r = medir('equiposMayusculas');
  assert.deepEqual(r.modelo.equipos.map((e) => e.nombre).sort(), base.modelo.equipos.map((e) => e.nombre).sort());
  assert.deepEqual(entregasPorEquipo(r.modelo), entregasPorEquipo(base.modelo));
  assert.ok((r.lectura.informe.equiposUnidos || 0) > 0);
});

test('estados en otro idioma sin categoría: hay fechas de terminado, pero nada cuenta como entregado', () => {
  // La puerta de "no se puede medir" (sin entregas) la pone la página; aquí se comprueba el hecho que la dispara
  const r = medir('estadosAleman');
  assert.ok(r.lectura.tareas.some((t) => t.fechas.terminada));
  assert.equal(r.modelo.equipos.reduce((n, e) => n + e.entregadas, 0), 0);
});

test('solo trabajo abierto y sin columna de terminado: ninguna tarea con fecha de terminado', () => {
  for (const n of ['soloAbiertas', 'sinResuelta']) {
    const r = medir(n);
    assert.ok(r.lectura.tareas.length > 0, n);
    assert.equal(r.lectura.tareas.filter((t) => t.fechas.terminada).length, 0, n);
  }
});

test('equipo que empieza tarde: las semanas antes de existir no son su baseline ni dan alertas', () => {
  const r = medir('equipoTardio');
  const e = r.modelo.equipos.find((x) => x.nombre === EQUIPO_TARDIO)!;
  const m = e.medidas.entregas;
  assert.ok(!m.ref || m.ref.lo > 0, 'sin franja de ceros: ' + JSON.stringify(m.ref));
  assert.notEqual(m.referencia, 'establecida');
  assert.ok(m.estado !== 'atencion' && m.estado !== 'critico', 'sin alerta por comparar con ceros');
});

test('cierre masivo: las entregas se marcan para revisar y no salen como "normal" ni como mejora', () => {
  const r = medir('salto');
  const e = r.modelo.equipos.find((x) => x.nombre === EQUIPO_SALTO)!;
  assert.equal(e.medidas.entregas.revisar, 'salto', JSON.stringify({ v: e.medidas.entregas.valor, ref: e.medidas.entregas.ref }));
  assert.equal(e.medidas.entregas.estado, 'sin');
  assert.ok((e.calidad.diasMasivos || []).length >= 1, 'el día del cierre masivo se detecta');
  // Los demás equipos no cambian
  r.modelo.equipos.filter((x) => x.nombre !== EQUIPO_SALTO).forEach((x) => assert.equal(x.medidas.entregas.valor, entregasPorEquipo(base.modelo)[x.nombre], x.nombre));
});

test('semáforo: fuera de la banda por poco no se dice "dentro" (borde), y dentro de verdad sí', () => {
  const def = CATALOGO.medidas.ciclo; // menos es mejor
  const ref = { lo: 6, hi: 9, med: 7.5, n: 12 };
  const dentro = estadoMedida('ciclo', 8, ref, null, def);
  assert.equal(dentro.estado, 'bien'); assert.equal(dentro.lado, undefined); assert.match(dentro.texto, /Dentro de|Within/);
  const encima = estadoMedida('ciclo', 9.4, ref, null, def);
  assert.equal(encima.estado, 'bien'); assert.equal(encima.lado, 'borde'); assert.doesNotMatch(encima.texto, /Dentro de|Within/);
  const ent = CATALOGO.medidas.entregas; // más es mejor
  const debajo = estadoMedida('entregas', 5.6, ref, null, ent);
  assert.equal(debajo.estado, 'bien'); assert.equal(debajo.lado, 'borde');
  // Por el lado bueno y dentro del margen es normal: "En el borde" se queda para el lado malo
  const algoMejorCiclo = estadoMedida('ciclo', 5.6, ref, null, def);
  assert.equal(algoMejorCiclo.estado, 'bien'); assert.equal(algoMejorCiclo.lado, undefined); assert.match(algoMejorCiclo.texto, /Algo mejor|Slightly better/);
  const algoMejorEntregas = estadoMedida('entregas', 9.4, ref, null, ent);
  assert.equal(algoMejorEntregas.estado, 'bien'); assert.equal(algoMejorEntregas.lado, undefined);
  // El margen sale con el resultado, para pintarlo alrededor de la franja
  assert.ok((encima.margen as number) > 0, 'margen');
});

test('semáforo: con línea base, un límite fijo superado es un aviso que dice si es por arriba o por abajo', () => {
  // Más es mejor (estimación): el límite se pasa por abajo; dentro de su línea base, el estado sigue siendo normal
  const est = estadoMedida('estimacion', 0.04, { lo: 0.03, hi: 0.1, med: 0.06, n: 12 }, null, CATALOGO.medidas.estimacion);
  assert.equal(est.por, 'banda'); assert.equal(est.estado, 'bien');
  assert.ok(est.aviso, 'aviso'); assert.match(est.aviso!.texto, /debajo|below/); assert.equal(est.aviso!.limite, 0.05);
  // Sin línea base todavía, el límite fijo es la única referencia y sí da el estado
  const sinBase = estadoMedida('estimacion', 0.04, undefined, null, CATALOGO.medidas.estimacion);
  assert.equal(sinBase.por, 'limite'); assert.equal(sinBase.estado, 'critico');
  // Fuera de su banda y además sobre el límite: manda la banda (crítico) y el límite superado queda como aviso
  const err = estadoMedida('errores', 0.45, { lo: 0.2, hi: 0.3, med: 0.25, n: 12 }, null, CATALOGO.medidas.errores);
  assert.equal(err.por, 'banda'); assert.equal(err.estado, 'critico');
  assert.equal(err.aviso!.estado, 'critico'); assert.equal(err.aviso!.limite, 0.4);
  // Límite fijado para el equipo: también se sabe qué diría su banda
  const eq = estadoMedida('ciclo', 20, { lo: 6, hi: 9, med: 7.5, n: 12 }, { atencion: 10, critico: 15 }, CATALOGO.medidas.ciclo);
  assert.equal(eq.por, 'limite_equipo'); assert.equal(eq.banda, 'critico');
});

test('semáforo: mejor de lo normal no es "normal", y con línea base un límite fijo superado no da alerta (es un aviso)', () => {
  const def = CATALOGO.medidas.entregas;
  const ref = { lo: 6, hi: 9, med: 7.5, n: 12 };
  assert.equal(estadoMedida('entregas', 8, ref, null, def).lado, undefined, 'dentro');
  const mejor = estadoMedida('entregas', 11, ref, null, def);
  assert.equal(mejor.estado, 'bien'); assert.equal(mejor.lado, 'mejor');
  const peor = estadoMedida('entregas', 4, ref, null, def);
  assert.ok(peor.estado === 'atencion' || peor.estado === 'critico');
  // Retrabajo del 37 % con franja de 43 a 50 %: mejor que su línea base. El límite fijo del 30 % no lo convierte en alerta:
  // queda como aviso, con el nivel que habría dado
  const ret = CATALOGO.medidas.retrabajo;
  const r = estadoMedida('retrabajo', 0.37, { lo: 0.43, hi: 0.5, med: 0.46, n: 12 }, null, ret);
  assert.equal(r.estado, 'bien'); assert.equal(r.lado, 'mejor'); assert.equal(r.por, 'banda');
  assert.equal(r.aviso!.estado, 'critico'); assert.equal(r.aviso!.limite, 0.3);
  // Peor que su línea base y además sobre el límite: manda la línea base, y el aviso sigue ahí
  const peorYLimite = estadoMedida('retrabajo', 0.6, { lo: 0.43, hi: 0.5, med: 0.46, n: 12 }, null, ret);
  assert.ok(peorYLimite.estado === 'atencion' || peorYLimite.estado === 'critico'); assert.equal(peorYLimite.por, 'banda'); assert.ok(peorYLimite.aviso);
});

test('comparación dudosa: cero en entregas sí, cero en regularidad no; salto solo por el lado bueno', () => {
  const cero = { lo: 0, hi: 0, med: 0, n: 12 };
  assert.equal(revisarComparacion('entregas', 11.75, cero, CATALOGO.medidas.entregas), 'cero');
  assert.equal(revisarComparacion('regularidad', 0.17, cero, CATALOGO.medidas.regularidad), null);
  assert.equal(revisarComparacion('entregas', 18.25, { lo: 0.5, hi: 1.1, med: 0.75, n: 12 }, CATALOGO.medidas.entregas), 'salto');
  assert.equal(revisarComparacion('entregas', 2, { lo: 0.5, hi: 1.1, med: 0.75, n: 12 }, CATALOGO.medidas.entregas), null, 'menos del triple');
  assert.equal(revisarComparacion('entregas', 0.1, { lo: 6, hi: 9, med: 7, n: 12 }, CATALOGO.medidas.entregas), null, 'una caída no es un salto');
});

test('inicio de la referencia: un arranque en las primeras semanas no cambia nada; uno tardío sí', () => {
  assert.equal(inicioReferencia([0, 2, 3, 4, 5], 4), 0);
  assert.equal(inicioReferencia([0, 0, 0, 0, 0, 1, 2], 4), 8);
  assert.equal(inicioReferencia([0, 0, 0], 4), 0, 'sin ninguna entrega no se recorta nada');
});

test('días con cierres masivos: 15 o más y el triple de los días grandes del equipo', () => {
  const d = (dia: number, n: number) => Array.from({ length: n }, () => ({ t: { fechas: { terminada: new Date(2026, 9, dia, 10) } } }) as unknown as Derivada);
  const normales = [1, 2, 3, 6, 7, 8].flatMap((x) => d(x, 2));
  assert.equal(diasMasivos(normales.concat(d(9, 20))).length, 1);
  assert.equal(diasMasivos(normales.concat(d(9, 9))).length, 0, 'menos de 15');
});

test('reviews de Scrum: cerrar mucho cada dos semanas es el normal del equipo, no un cierre masivo', () => {
  const d = (dia: number, n: number) => Array.from({ length: n }, () => ({ t: { fechas: { terminada: new Date(2026, 8, dia, 17) } } }) as unknown as Derivada);
  const sprint = [4, 18].flatMap((x) => d(x, 16)).concat([1, 2, 8, 9, 15, 16, 22, 23].flatMap((x) => d(x, 2))).concat([25, 26].flatMap((x) => d(x, 16)));
  assert.deepEqual(diasMasivos(sprint), []);
  assert.equal(diasMasivos(sprint.concat(d(29, 60))).length, 1, 'una limpieza de 60 sí destaca');
});

test('salto solo en medidas de actividad: una mejora real de una proporción no se marca', () => {
  const r = { lo: 0.05, hi: 0.12, med: 0.08, n: 12 };
  for (const id of ['agent_readiness', 'estimacion', 'valor']) {
    const def = CATALOGO.medidas[id] || { dir: 'mas', formato: 'pct' };
    assert.equal(revisarComparacion(id, 0.45, r, def as never), null, id);
  }
});

test('equipo sin ninguna entrega en un export mixto: el resto de sus medidas conserva su referencia', () => {
  const r = medir('equipoSinEntregas');
  const e = r.modelo.equipos.find((x) => x.nombre === EQUIPO_TARDIO)!;
  assert.equal(e.entregadas, 0);
  assert.ok(e.medidas.wip.ref, 'trabajo en curso con su referencia');
});

test('nombre unido: la misma forma en cualquier export, sea cual sea la más frecuente', () => {
  const t = (v: string) => ({ agrupadores: { equipo: v } }) as unknown as Tarea;
  const a = [t('Pagos'), t('Pagos'), t('PAGOS')], b = [t('Pagos'), t('PAGOS'), t('PAGOS'), t(' pagos ')];
  unificarAgrupadores(a); unificarAgrupadores(b);
  assert.deepEqual([...new Set(a.map((x) => x.agrupadores.equipo))], ['Pagos']);
  assert.deepEqual([...new Set(b.map((x) => x.agrupadores.equipo))], ['Pagos']);
});

test('export con todos los campos: "Team" con None no tapa la columna que sí trae los equipos', () => {
  const r = medir('todosLosCampos');
  assert.equal(r.det.equipoRecomendado, 'equipo');
  assert.deepEqual(entregasPorEquipo(r.modelo), entregasPorEquipo(base.modelo));
  assert.ok(r.lectura.informe.avisos.some((a) => /Assigned Team/.test(a.texto) && /Team/.test(a.texto)), 'se dice de qué columna salen');
  const f0 = V.todosLosCampos.ficheros[0].nombre;
  const cols = describirColumnas(V.todosLosCampos.ficheros[0].texto, { equipo: r.lectura.informe.columnaEquipo![f0] });
  assert.equal(cols.find((c) => c.campo === 'equipo')?.columna, 'Custom field (Assigned Team)', 'Fuentes dice la misma columna');
});

test('columna de equipo con un nombre que no está en la lista: se reconoce por sus datos', () => {
  const r = medir('equipoOtroNombre');
  assert.equal(r.det.equipoRecomendado, 'equipo');
  assert.deepEqual(entregasPorEquipo(r.modelo), entregasPorEquipo(base.modelo));
});

test('elección de la columna de equipo: solo se cambia la que da el nombre cuando viene vacía', () => {
  const cab = ['Key', 'Issue Type', 'Team', 'Assigned Team', 'Team Lead', 'Team Size', 'Impacted Teams'];
  const idx = { clave: 0, tipo: 1 };
  const fila = (i: number, team: string, asig: string) => ['K-' + i, 'Story', team, asig, 'Persona ' + (i % 5), String(5 + (i % 4)), 'Pagos, Datos'];
  const tabla = (fn: (i: number) => string[]) => [cab, ...Array.from({ length: 40 }, (_, i) => fn(i))];
  // Team con un solo equipo (export de un equipo) o con más de 60: se queda
  assert.equal(elegirColumnaEquipo(cab, tabla((i) => fila(i, 'Pagos', 'A' + (i % 4))), 2, idx).i, 2, 'un solo equipo');
  assert.equal(elegirColumnaEquipo(cab, tabla((i) => fila(i, 'T' + i, 'A' + (i % 4))), 2, idx).i, 2, 'muchos equipos');
  // Team con None: sale Assigned Team, aunque sea un solo equipo, y se dice cuál se dejó
  const r = elegirColumnaEquipo(cab, tabla((i) => fila(i, 'None', 'Pagos')), 2, idx);
  assert.equal(r.i, 3); assert.equal(r.descartada, 'Team');
  // Nunca una de personas ni una numérica: sin Assigned Team, se queda la de siempre
  const sinAsig = tabla((i) => fila(i, 'None', ''));
  assert.notEqual(elegirColumnaEquipo(cab, sinAsig, 2, idx).i, 4, 'Team Lead son personas');
  assert.notEqual(elegirColumnaEquipo(cab, sinAsig, 2, idx).i, 5, 'Team Size es un número');
  // Las subtareas sin equipo no cuentan para la cobertura
  const conSub = [cab, ...Array.from({ length: 40 }, (_, i) => fila(i, 'T' + (i % 3), '')), ...Array.from({ length: 200 }, (_, i) => ['S-' + i, 'Sub-task', '', '', '', '', 'Pagos'])];
  assert.equal(elegirColumnaEquipo(cab, conSub, 2, idx).i, 2, 'subtareas');
  assert.ok(valorVacio('None') && valorVacio(' none ') && !valorVacio('NA') && !valorVacio('Nonetheless'));
});

test('todos los campos con un solo equipo y con un fichero por equipo: salen los equipos', () => {
  // Con un solo equipo la página lo trata como "todo el trabajo" (igual que sin la columna vacía); lo que importa es que lee el equipo
  const uno = medir('unEquipoTodosCampos');
  assert.ok(uno.lectura.tareas.length > 0 && uno.lectura.tareas.every((t) => t.agrupadores.equipo === EQUIPO_SALTO));
  const varios = medir('ficheroPorEquipo');
  assert.equal(varios.det.equipoRecomendado, 'equipo');
  assert.deepEqual(entregasPorEquipo(varios.modelo), entregasPorEquipo(base.modelo));
});

test('un equipo llamado "NA" se lee como equipo', () => {
  const r = medir('equipoNA');
  assert.equal(r.det.equipoRecomendado, 'equipo');
  assert.ok(r.modelo.equipos.some((e) => e.nombre === 'NA'));
});

test('elección a mano de la columna de equipo: manda, y Fuentes dice la misma', () => {
  const columnas = { equipo: 'Custom field (Team)' };
  const lectura = leerJira(V.todosLosCampos.ficheros, { hoy: HOY, columnas });
  assert.equal(lectura.informe.columnaEquipo![V.todosLosCampos.ficheros[0].nombre], 'Custom field (Team)');
  const cols = describirColumnas(V.todosLosCampos.ficheros[0].texto, { ...columnas, equipo: lectura.informe.columnaEquipo![V.todosLosCampos.ficheros[0].nombre] });
  assert.equal(cols.find((c) => c.campo === 'equipo')?.columna, 'Custom field (Team)');
});

test('sin cambios de estado: el trabajo en curso no da alerta y el lead time dice qué columna falta', () => {
  const r = medir('sinCambiosEstado');
  for (const e of r.modelo.equipos) {
    const w = e.medidas.wip;
    if (!w.disponible) continue;
    assert.equal(w.ref, undefined, e.nombre + ': sin rango');
    assert.equal(w.sinHistorico, true, e.nombre);
    assert.ok(w.estado !== 'atencion' && w.estado !== 'critico', e.nombre + ': sin alerta');
    assert.equal(e.medidas.ciclo.disponible, false);
    assert.match(String(e.medidas.ciclo.motivo), /\[CHART\] Time in Status/);
    assert.equal(e.medidas.total.disponible, true);
    const p = e.medidas.pendiente;
    assert.ok(p.sinHistorico && !p.ref && p.serie === null, e.nombre + ': pendiente sin histórico');
    assert.equal(e.kpis.carga.disponible, false, e.nombre + ': edad del pendiente');
    assert.ok(!/Total time|tiempo total/.test(String(e.medidas.retrabajo.motivo)), 'lo del tiempo total solo en el tiempo de ciclo');
  }
});

test('tiempo por estado solo en lo reciente: el trabajo en curso conserva su rango', () => {
  const r = medir('tiemposSoloRecientes');
  const conRango = base.modelo.equipos.filter((e) => e.medidas.wip.ref).map((e) => e.nombre);
  assert.ok(conRango.length > 0);
  conRango.forEach((n) => { const e = r.modelo.equipos.find((x) => x.nombre === n)!; assert.ok(e.medidas.wip.ref && !e.medidas.wip.sinHistorico, n); });
});

test('con tiempo por estado el trabajo en curso conserva su rango', () => {
  const e = base.modelo.equipos.find((x) => x.medidas.wip.ref)!;
  assert.ok(e, 'algún equipo con rango');
  assert.equal(e.medidas.wip.sinHistorico, undefined);
});
