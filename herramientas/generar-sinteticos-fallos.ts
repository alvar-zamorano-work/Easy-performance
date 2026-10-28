// Export sintético con fallos de registro sembrados, para enseñar cómo los detecta la fiabilidad de los datos.
// Parte del export limpio de B3 (el mismo banco ficticio) y siembra un fallo por cada comprobación, con un
// equipo nuevo con poca historia. Lo sembrado queda en escenarios.json y un test comprueba que se detecta todo.
// Determinista: la misma semilla da siempre el mismo fichero.
//   TZ=Europe/Madrid node herramientas/generar-sinteticos-fallos.ts [carpeta]   (por defecto datos-sinteticos/fallos)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generar, azar, fechaJira, fechaIso, csv, EQUIPOS } from './generar-sinteticos-b3.ts';
import { leerFecha } from '../adaptadores/jira/fechas.ts';

const DIA = 864e5, SEMANA = 7 * DIA;
const SEMILLA = 20261016;
/** Desde aquí el export está cortado: solo queda un goteo de tareas nuevas. */
export const CORTE = new Date(2026, 8, 21, 9, 0); // lunes 21 sep 2026
/** Las comprobaciones miran las 16 semanas anteriores al final de los datos. */
const VENTANA = new Date(CORTE.getTime() - 16 * SEMANA);
export const ESTADO_PROPIO = { nombre: 'Pre-production window', id: '10010' };
export const EQUIPO_NUEVO = { nombre: 'Data', prefijo: 'DAT', area: 'Platform', fte: 4 };

export interface Sembrado {
  /** Id de la comprobación de fiabilidad que lo detecta. */
  id: string;
  /** Dónde se ve: en la comprobación del área, en la fila del equipo o en las dos. */
  ambito: 'area' | 'equipo' | 'ambos';
  equipo: string | null;
  /** Qué se ha sembrado, en una frase. */
  que: string;
  tareas: number;
}

export interface Tiempo { id: string; n: number; v: number }
export const leerTis = (s: string): Tiempo[] => (s ? s.split('_*|*_').map((x) => { const [id, n, v] = x.split('_*:*_'); return { id, n: +n, v: +v }; }) : []);
export const escribirTis = (t: Tiempo[]) => t.map((x) => `${x.id}_*:*_${x.n}_*:*_${Math.max(0, Math.round(x.v))}`).join('_*|*_');

export function generarFallos() {
  const { cab, filas: limpias } = generar();
  const az = azar(SEMILLA);
  const I = (n: string) => { const i = cab.indexOf(n); if (i < 0) throw new Error('Falta la columna ' + n); return i; };
  const c = {
    clave: I('Issue key'), id: I('Issue id'), tipo: I('Issue Type'), estado: I('Status'), proyecto: I('Project key'), resolucion: I('Resolution'),
    asignado: I('Assignee'), informador: I('Reporter'), creada: I('Created'), actualizada: I('Updated'), resuelta: I('Resolved'), componentes: I('Components'),
    puntos: I('Custom field (Story Points)'), equipo: I('Custom field (Team)'), sprint1: cab.indexOf('Sprint'), sprint2: cab.lastIndexOf('Sprint'),
    primera: I('Custom field ([CHART] Date of First Response)'), tis: I('Custom field ([CHART] Time in Status)'), padre: I('Parent key'), padreTitulo: I('Parent summary'),
    categoria: I('Status category'), cambio: I('Status category changed'),
  };
  let filas = limpias.map((f) => f.slice());
  const fecha = (f: string[], col: number) => leerFecha(f[col]);
  const epica = (f: string[]) => f[c.tipo] === 'Epic';
  const de = (equipo: string) => (f: string[]) => !epica(f) && f[c.equipo] === equipo;
  const hecha = (f: string[]) => f[c.estado] === 'Done';
  const resueltaEntre = (desde: Date, hasta: Date) => (f: string[]) => { const r = fecha(f, c.resuelta); return !!r && r >= desde && r < hasta; };
  const sembrados: Sembrado[] = [];

  // 1. Equipo nuevo con poca historia: empezó a registrar su trabajo ocho semanas antes del corte
  const desdeNuevo = new Date(CORTE.getTime() - 8 * SEMANA);
  let n = 0, idNuevo = 40000;
  const nuevas = filas.filter((f) => de('Payments')(f) && fecha(f, c.creada)! >= desdeNuevo && fecha(f, c.creada)! < CORTE).map((f) => {
    const g = f.slice();
    g[c.clave] = `${EQUIPO_NUEVO.prefijo}-${++n}`; g[c.id] = String(++idNuevo); g[c.proyecto] = EQUIPO_NUEVO.prefijo;
    g[c.equipo] = EQUIPO_NUEVO.nombre; g[c.componentes] = EQUIPO_NUEVO.nombre;
    g[c.asignado] = `Persona ${EQUIPO_NUEVO.prefijo}1`; g[c.informador] = `Persona ${EQUIPO_NUEVO.prefijo}2`;
    g[c.sprint1] = g[c.sprint1].replace(/^PAG /, 'DAT '); g[c.sprint2] = g[c.sprint2].replace(/^PAG /, 'DAT ');
    g[c.padre] = ''; g[c.padreTitulo] = '';
    return g;
  });
  filas = filas.concat(nuevas);
  sembrados.push({ id: 'historia', ambito: 'ambos', equipo: EQUIPO_NUEVO.nombre, tareas: nuevas.length,
    que: 'A new team, ' + EQUIPO_NUEVO.nombre + ', only has eight weeks on record. Not enough to know what is normal for it.' });

  // 2. Export cortado: tras el corte solo hay un goteo de tareas nuevas y lo que pasó después no está
  const goteo: Record<number, number> = {};
  let cortadas = 0;
  const aPendiente = (f: string[], creada: Date) => {
    f[c.estado] = 'To Do'; f[c.resolucion] = ''; f[c.resuelta] = ''; f[c.actualizada] = fechaJira(creada);
    f[c.tis] = escribirTis([{ id: '10000', n: 1, v: 0 }]); f[c.categoria] = 'To Do'; f[c.cambio] = fechaJira(creada); f[c.sprint1] = ''; f[c.sprint2] = '';
  };
  filas = filas.filter((f) => {
    if (epica(f)) return true;
    const creada = fecha(f, c.creada)!;
    if (creada >= CORTE) {
      const s = Math.floor((creada.getTime() - CORTE.getTime()) / SEMANA);
      if ((goteo[s] || 0) < 2) { goteo[s] = (goteo[s] || 0) + 1; aPendiente(f, creada); return true; }
      cortadas++;
      return false;
    }
    const r = fecha(f, c.resuelta), cambio = fecha(f, c.cambio);
    if ((r && r >= CORTE) || (cambio && cambio >= CORTE)) {
      const t = leerTis(f[c.tis]), pendiente = t.find((x) => x.id === '10000');
      const inicio = new Date(creada.getTime() + (pendiente ? pendiente.v : 0));
      if (inicio < CORTE) {
        // Como estaba en el corte: en curso, o ya en revisión o bloqueada si llevaba días empezada
        const dias = (CORTE.getTime() - inicio.getTime()) / DIA, x = az.r();
        const ahora = dias > 3 && x < 0.25 ? '10003' : dias > 3 && x < 0.33 ? '10004' : '3';
        const nombre = ahora === '10003' ? 'In Review' : ahora === '10004' ? 'Blocked' : 'In Progress';
        const tis: Tiempo[] = [{ id: '10000', n: 1, v: inicio.getTime() - creada.getTime() }];
        if (ahora !== '3') tis.push({ id: '3', n: 1, v: (dias - 2) * DIA });
        tis.push({ id: ahora, n: 1, v: 0 });
        f[c.estado] = nombre; f[c.resolucion] = ''; f[c.resuelta] = ''; f[c.categoria] = 'In Progress';
        f[c.cambio] = fechaJira(inicio); f[c.actualizada] = fechaJira(inicio); f[c.sprint2] = '';
        f[c.tis] = escribirTis(tis);
      } else aPendiente(f, creada);
      cortadas++;
    }
    return true;
  });
  sembrados.push({ id: 'actividad', ambito: 'area', equipo: null, tareas: cortadas,
    que: 'The export was cut off on ' + CORTE.getDate() + ' September: only a few new tasks remain from the last three weeks.' });

  // 3. Estado propio que no se reconoce por su nombre (Mobile App)
  let conEstado = 0;
  filas.filter((f) => de('Mobile App')(f) && hecha(f) && resueltaEntre(VENTANA, CORTE)(f)).forEach((f) => {
    if (az.r() < 0.35) { f[c.tis] = escribirTis(leerTis(f[c.tis]).concat([{ id: ESTADO_PROPIO.id, n: 1, v: az.entre(1, 3) * DIA }])); conEstado++; }
  });
  const enEstado = filas.filter((f) => de('Mobile App')(f) && f[c.estado] === 'In Progress').slice(0, 4);
  if (!enEstado.length) throw new Error('No Mobile App tasks in progress for the custom status.');
  enEstado.forEach((f) => {
    f[c.tis] = escribirTis(leerTis(f[c.tis]).map((x) => (x.id === '3' ? { ...x, v: az.entre(1, 4) * DIA } : x)).concat([{ id: ESTADO_PROPIO.id, n: 1, v: 0 }]));
    f[c.estado] = ESTADO_PROPIO.nombre;
  });
  sembrados.push({ id: 'estados', ambito: 'area', equipo: 'Mobile App', tareas: conEstado + enEstado.length,
    que: 'Mobile App uses a custom status, "' + ESTADO_PROPIO.nombre + '". It is a wait, but it is not recognised by name and by its category it would count as in progress.' });

  // 4. Tareas que saltan de pendiente a hecho sin pasar por en curso (Payments)
  let saltos = 0;
  filas.filter((f) => de('Payments')(f) && hecha(f) && resueltaEntre(new Date(VENTANA.getTime() - 2 * SEMANA), CORTE)(f)).forEach((f) => {
    if (az.r() < 0.35) {
      const lead = fecha(f, c.resuelta)!.getTime() - fecha(f, c.creada)!.getTime();
      f[c.tis] = escribirTis([{ id: '10000', n: 1, v: lead }, { id: '10002', n: 1, v: 0 }]);
      saltos++;
    }
  });
  sembrados.push({ id: 'flujo', ambito: 'ambos', equipo: 'Payments', tareas: saltos,
    que: 'In Payments, one in three tasks moves from backlog to done in one go, without going through in progress.' });

  // 5. Dos cierres en bloque de Mobile App, al acabar dos sprints
  const bloques: [Date, number][] = [[new Date(2026, 7, 28, 18, 0), 14], [new Date(2026, 8, 18, 18, 0), 12]];
  let enBloque = 0;
  const usadas = new Set<string>();
  for (const [cuando, cuantas] of bloques) {
    const candidatas = filas.filter((f) => de('Mobile App')(f) && hecha(f) && !usadas.has(f[c.clave]) && resueltaEntre(new Date(cuando.getTime() - 21 * DIA), cuando)(f) && fecha(f, c.creada)! < cuando)
      .sort((a, b) => fecha(b, c.resuelta)!.getTime() - fecha(a, c.resuelta)!.getTime()).slice(0, cuantas);
    if (candidatas.length < cuantas) throw new Error('No hay tareas suficientes para el cierre en bloque del ' + cuando.toISOString());
    candidatas.forEach((f) => { f[c.resuelta] = fechaJira(cuando); f[c.actualizada] = fechaJira(cuando); f[c.cambio] = fechaJira(cuando); usadas.add(f[c.clave]); enBloque++; });
  }
  sembrados.push({ id: 'bloque', ambito: 'area', equipo: 'Mobile App', tareas: enBloque,
    que: 'Mobile App closed 14 and 12 tasks at once in the same minute, at the end of two sprints, to clean up the board.' });

  // 6. Registro a posteriori: Customer Portal crea las tareas cuando ya las ha hecho
  let tarde = 0;
  filas.filter((f) => de('Customer Portal')(f) && hecha(f) && resueltaEntre(new Date(VENTANA.getTime() - 2 * SEMANA), CORTE)(f)).forEach((f) => {
    const creada = new Date(fecha(f, c.resuelta)!.getTime() - az.entre(2, 6) * 36e5);
    f[c.creada] = fechaJira(creada); f[c.primera] = fechaIso(new Date(creada.getTime() + 36e5));
    tarde++;
  });
  sembrados.push({ id: 'registro', ambito: 'ambos', equipo: 'Customer Portal', tareas: tarde,
    que: 'Customer Portal logs tasks in the tool once they are already finished, a few hours before closing them.' });

  // 7. Customer Portal deja de usar sprints en la herramienta
  let sinSprint = 0;
  const desdeSprints = new Date(CORTE.getTime() - 14 * SEMANA);
  filas.filter((f) => de('Customer Portal')(f) && (fecha(f, c.creada)! >= desdeSprints || (fecha(f, c.resuelta) && fecha(f, c.resuelta)! >= desdeSprints))).forEach((f) => {
    if (f[c.sprint1] || f[c.sprint2]) { f[c.sprint1] = ''; f[c.sprint2] = ''; sinSprint++; }
  });
  sembrados.push({ id: 'sprints', ambito: 'ambos', equipo: 'Customer Portal', tareas: sinSprint,
    que: 'Customer Portal says it works in sprints, but for three months it has not recorded them in the tool.' });

  // 8. Historias sin estimar en Risk
  let sinPuntos = 0;
  filas.filter((f) => de('Risk')(f) && f[c.tipo] === 'Story').forEach((f) => { if (az.r() < 0.6) { f[c.puntos] = ''; sinPuntos++; } });
  sembrados.push({ id: 'estimacion', ambito: 'ambos', equipo: 'Risk', tareas: sinPuntos,
    que: 'Risk leaves six out of ten stories without an estimate.' });

  // 9. Sin tiempo en cada estado: Risk cambió de flujo y su export ya no lo trae
  let sinTiempos = 0;
  filas.filter((f) => de('Risk')(f) && hecha(f) && resueltaEntre(new Date(VENTANA.getTime() - 4 * SEMANA), CORTE)(f)).forEach((f) => { f[c.tis] = ''; sinTiempos++; });
  sembrados.push({ id: 'tiempos', ambito: 'ambos', equipo: 'Risk', tareas: sinTiempos,
    que: 'Risk changed its workflow and since May its closed tasks have no time in each status.' });

  // 10. Tareas sin equipo: desde abril el campo Equipo no es obligatorio
  const desdeAbril = new Date(2026, 3, 1);
  let sinEquipo = 0;
  filas.forEach((f) => {
    if (epica(f) || f[c.equipo] === EQUIPO_NUEVO.nombre || f[c.estado] === ESTADO_PROPIO.nombre || fecha(f, c.creada)! < desdeAbril) return;
    if (az.r() < 0.3) { f[c.equipo] = ''; f[c.componentes] = ''; sinEquipo++; }
  });
  sembrados.push({ id: 'equipo', ambito: 'area', equipo: null, tareas: sinEquipo,
    que: 'Since April the Team field is not mandatory and almost one in three new tasks is created without it.' });

  return { cab, filas, sembrados };
}

export function ficherosFallos(): Record<string, string> {
  const { cab, filas, sembrados } = generarFallos();
  const escenarios = {
    descripcion: 'Faults seeded in jira-con-fallos.csv. Based on the clean B3 export. Generated by herramientas/generar-sinteticos-fallos.ts.',
    fecha_export: '2026-10-12T09:00:00',
    corte: '2026-09-21T09:00:00',
    sembrados,
  };
  const equipos = EQUIPOS.map((e) => ({ id: e.prefijo.toLowerCase(), nombre: e.nombre, tipo: e.tipo, proveedor: e.proveedor, area: e.area, usa_sprints: true,
    fte: [{ periodo: '2026-09', valor: e.fte, origen: e.tipo === 'proveedor' ? 'contrato' : 'declarado' }], limites: {} }));
  equipos.push({ id: EQUIPO_NUEVO.prefijo.toLowerCase(), nombre: EQUIPO_NUEVO.nombre, tipo: 'interno', proveedor: null, area: EQUIPO_NUEVO.area, usa_sprints: true,
    fte: [{ periodo: '2026-09', valor: EQUIPO_NUEVO.fte, origen: 'declarado' }], limites: {} });
  // El mapeo firmado solo recoge los estados de siempre: el estado propio queda por confirmar
  const cliente = {
    version: 2, nombre: 'Synthetic client with faults', sector: 'banking', plataforma: 'jira',
    mapeoEstados: { 'To Do': 'pendiente', 'In Progress': 'en_curso', 'In Review': 'en_revision', 'Blocked': 'bloqueado', 'Done': 'terminado' },
    equipos: { campo: 'equipo', lista: equipos },
    objetivos: ['tardamos', 'arreglos', 'comparar', 'agentes', 'datos'],
    medidas: ['ciclo', 'retrabajo', 'espera', 'entregas', 'agent_readiness'],
  };
  return {
    'jira-con-fallos.csv': csv(cab, filas),
    'escenarios.json': JSON.stringify(escenarios, null, 1) + '\n',
    'cliente/cliente.json': JSON.stringify(cliente, null, 2) + '\n',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.env.TZ !== 'Europe/Madrid') { console.error('Ejecuta con TZ=Europe/Madrid.'); process.exit(1); }
  const dir = process.argv[2] || join(fileURLToPath(new URL('..', import.meta.url)), 'datos-sinteticos', 'fallos');
  for (const [nombre, texto] of Object.entries(ficherosFallos())) {
    mkdirSync(join(dir, nombre, '..'), { recursive: true });
    writeFileSync(join(dir, nombre), texto);
  }
  console.log('Escrito en ' + dir);
}
