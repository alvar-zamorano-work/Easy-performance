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
export const ESTADO_PROPIO = { nombre: 'Ventana de paso a PRE', id: '10010' };
export const EQUIPO_NUEVO = { nombre: 'Datos', prefijo: 'DAT', area: 'Plataforma', fte: 4 };

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
  const nuevas = filas.filter((f) => de('Pagos')(f) && fecha(f, c.creada)! >= desdeNuevo && fecha(f, c.creada)! < CORTE).map((f) => {
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
    que: 'Un equipo nuevo, ' + EQUIPO_NUEVO.nombre + ', solo tiene ocho semanas registradas. No basta para saber qué es lo normal en él.' });

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
    que: 'El export se cortó el ' + CORTE.getDate() + ' de septiembre: de las últimas tres semanas solo quedan unas pocas tareas nuevas.' });

  // 3. Estado propio que no se reconoce por su nombre (App móvil)
  let conEstado = 0;
  filas.filter((f) => de('App móvil')(f) && hecha(f) && resueltaEntre(VENTANA, CORTE)(f)).forEach((f) => {
    if (az.r() < 0.35) { f[c.tis] = escribirTis(leerTis(f[c.tis]).concat([{ id: ESTADO_PROPIO.id, n: 1, v: az.entre(1, 3) * DIA }])); conEstado++; }
  });
  const enEstado = filas.filter((f) => de('App móvil')(f) && f[c.estado] === 'In Progress').slice(0, 4);
  if (!enEstado.length) throw new Error('No hay tareas de App móvil en curso para el estado propio.');
  enEstado.forEach((f) => {
    f[c.tis] = escribirTis(leerTis(f[c.tis]).map((x) => (x.id === '3' ? { ...x, v: az.entre(1, 4) * DIA } : x)).concat([{ id: ESTADO_PROPIO.id, n: 1, v: 0 }]));
    f[c.estado] = ESTADO_PROPIO.nombre;
  });
  sembrados.push({ id: 'estados', ambito: 'area', equipo: 'App móvil', tareas: conEstado + enEstado.length,
    que: 'App móvil usa un estado propio, «' + ESTADO_PROPIO.nombre + '». Es una espera, pero no se reconoce por el nombre y por su categoría se contaría como en curso.' });

  // 4. Tareas que saltan de pendiente a hecho sin pasar por en curso (Pagos)
  let saltos = 0;
  filas.filter((f) => de('Pagos')(f) && hecha(f) && resueltaEntre(new Date(VENTANA.getTime() - 2 * SEMANA), CORTE)(f)).forEach((f) => {
    if (az.r() < 0.35) {
      const lead = fecha(f, c.resuelta)!.getTime() - fecha(f, c.creada)!.getTime();
      f[c.tis] = escribirTis([{ id: '10000', n: 1, v: lead }, { id: '10002', n: 1, v: 0 }]);
      saltos++;
    }
  });
  sembrados.push({ id: 'flujo', ambito: 'ambos', equipo: 'Pagos', tareas: saltos,
    que: 'En Pagos, una de cada tres tareas se mueve de pendiente a hecho de golpe, sin pasar por en curso.' });

  // 5. Dos cierres en bloque de App móvil, al acabar dos sprints
  const bloques: [Date, number][] = [[new Date(2026, 7, 28, 18, 0), 14], [new Date(2026, 8, 18, 18, 0), 12]];
  let enBloque = 0;
  const usadas = new Set<string>();
  for (const [cuando, cuantas] of bloques) {
    const candidatas = filas.filter((f) => de('App móvil')(f) && hecha(f) && !usadas.has(f[c.clave]) && resueltaEntre(new Date(cuando.getTime() - 21 * DIA), cuando)(f) && fecha(f, c.creada)! < cuando)
      .sort((a, b) => fecha(b, c.resuelta)!.getTime() - fecha(a, c.resuelta)!.getTime()).slice(0, cuantas);
    if (candidatas.length < cuantas) throw new Error('No hay tareas suficientes para el cierre en bloque del ' + cuando.toISOString());
    candidatas.forEach((f) => { f[c.resuelta] = fechaJira(cuando); f[c.actualizada] = fechaJira(cuando); f[c.cambio] = fechaJira(cuando); usadas.add(f[c.clave]); enBloque++; });
  }
  sembrados.push({ id: 'bloque', ambito: 'area', equipo: 'App móvil', tareas: enBloque,
    que: 'App móvil cerró de golpe 14 y 12 tareas en el mismo minuto, al final de dos sprints, para limpiar el tablero.' });

  // 6. Registro a posteriori: Portal clientes crea las tareas cuando ya las ha hecho
  let tarde = 0;
  filas.filter((f) => de('Portal clientes')(f) && hecha(f) && resueltaEntre(new Date(VENTANA.getTime() - 2 * SEMANA), CORTE)(f)).forEach((f) => {
    const creada = new Date(fecha(f, c.resuelta)!.getTime() - az.entre(2, 6) * 36e5);
    f[c.creada] = fechaJira(creada); f[c.primera] = fechaIso(new Date(creada.getTime() + 36e5));
    tarde++;
  });
  sembrados.push({ id: 'registro', ambito: 'ambos', equipo: 'Portal clientes', tareas: tarde,
    que: 'Portal clientes registra las tareas en la herramienta cuando ya las ha terminado, unas horas antes de cerrarlas.' });

  // 7. Portal clientes deja de usar sprints en la herramienta
  let sinSprint = 0;
  const desdeSprints = new Date(CORTE.getTime() - 14 * SEMANA);
  filas.filter((f) => de('Portal clientes')(f) && (fecha(f, c.creada)! >= desdeSprints || (fecha(f, c.resuelta) && fecha(f, c.resuelta)! >= desdeSprints))).forEach((f) => {
    if (f[c.sprint1] || f[c.sprint2]) { f[c.sprint1] = ''; f[c.sprint2] = ''; sinSprint++; }
  });
  sembrados.push({ id: 'sprints', ambito: 'ambos', equipo: 'Portal clientes', tareas: sinSprint,
    que: 'Portal clientes dice trabajar por sprints, pero desde hace tres meses no los apunta en la herramienta.' });

  // 8. Historias sin estimar en Riesgos
  let sinPuntos = 0;
  filas.filter((f) => de('Riesgos')(f) && f[c.tipo] === 'Story').forEach((f) => { if (az.r() < 0.6) { f[c.puntos] = ''; sinPuntos++; } });
  sembrados.push({ id: 'estimacion', ambito: 'ambos', equipo: 'Riesgos', tareas: sinPuntos,
    que: 'Riesgos deja sin estimar seis de cada diez historias.' });

  // 9. Sin tiempo en cada estado: Riesgos cambió de flujo y su export ya no lo trae
  let sinTiempos = 0;
  filas.filter((f) => de('Riesgos')(f) && hecha(f) && resueltaEntre(new Date(VENTANA.getTime() - 4 * SEMANA), CORTE)(f)).forEach((f) => { f[c.tis] = ''; sinTiempos++; });
  sembrados.push({ id: 'tiempos', ambito: 'ambos', equipo: 'Riesgos', tareas: sinTiempos,
    que: 'Riesgos cambió de flujo y desde mayo sus tareas cerradas no traen el tiempo en cada estado.' });

  // 10. Tareas sin equipo: desde abril el campo Equipo no es obligatorio
  const desdeAbril = new Date(2026, 3, 1);
  let sinEquipo = 0;
  filas.forEach((f) => {
    if (epica(f) || f[c.equipo] === EQUIPO_NUEVO.nombre || f[c.estado] === ESTADO_PROPIO.nombre || fecha(f, c.creada)! < desdeAbril) return;
    if (az.r() < 0.3) { f[c.equipo] = ''; f[c.componentes] = ''; sinEquipo++; }
  });
  sembrados.push({ id: 'equipo', ambito: 'area', equipo: null, tareas: sinEquipo,
    que: 'Desde abril el campo Equipo no es obligatorio y casi una de cada tres tareas nuevas se crea sin él.' });

  return { cab, filas, sembrados };
}

export function ficherosFallos(): Record<string, string> {
  const { cab, filas, sembrados } = generarFallos();
  const escenarios = {
    descripcion: 'Fallos sembrados en jira-con-fallos.csv. Parte del export limpio de B3. Lo generan herramientas/generar-sinteticos-fallos.ts.',
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
    version: 2, nombre: 'Cliente sintético con fallos', sector: 'banca', plataforma: 'jira',
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
