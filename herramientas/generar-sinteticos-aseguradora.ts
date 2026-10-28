// Tercer ejemplo: una aseguradora ficticia con cinco equipos distintos de los del banco. El export viene de un
// Jira en castellano, con el equipo en Componentes, columnas de personas y una columna que no se reconoce.
// Solo tiene tres fallos sembrados (fiabilidad media); el resto de comprobaciones tiene que salir bien.
// Integraciones trabaja sin sprints: no es un fallo y la comprobación de sprints no debe marcarlo.
// Determinista: la misma semilla da siempre el mismo fichero.
//   TZ=Europe/Madrid node herramientas/generar-sinteticos-aseguradora.ts [carpeta]   (por defecto datos-sinteticos/aseguradora)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generar, azar, csv, type EquipoSintetico, type IniciativaSintetica } from './generar-sinteticos-b3.ts';
import { leerTis, escribirTis, type Sembrado } from './generar-sinteticos-fallos.ts';
import { enCastellano, renombrarCabeceras, quitarColumna, type Tabla } from '../tests/banco/variantes.ts';
import { leerFecha } from '../adaptadores/jira/fechas.ts';

const DIA = 864e5, SEMANA = 7 * DIA;
const SEMILLA = 20261020;
const INICIO = new Date(2025, 9, 20, 9, 0); // lunes 20 oct 2025
export const FIN = new Date(2026, 9, 14, 9, 0); // miércoles 14 oct 2026
/** Las comprobaciones miran las 16 semanas anteriores al final de los datos. */
const VENTANA = new Date(FIN.getTime() - 18 * SEMANA);
export const ESTADO_PROPIO = { nombre: 'Visto bueno de negocio', id: '10012' };

export const EQUIPOS_ASEGURADORA: EquipoSintetico[] = [
  { nombre: 'Claims', prefijo: 'SIN', tipo: 'interno', proveedor: null, area: 'Business', fte: 6, lentitud: 1, pRetrabajo: 0.22, pReabrir: 0.04, pCriterio: 0.8, llegadas: [6, 8] },
  { nombre: 'Policies', prefijo: 'POL', tipo: 'interno', proveedor: null, area: 'Business', fte: 5, lentitud: 1.1, pRetrabajo: 0.1, pReabrir: 0.03, pCriterio: 0.85 },
  { nombre: 'Digital Channel', prefijo: 'CAN', tipo: 'proveedor', proveedor: 'Vendor East', area: 'Channels', fte: 7, lentitud: 1.4, pRetrabajo: 0.2, pReabrir: 0.08, pCriterio: 0.45, llegadas: [7, 9] },
  { nombre: 'Integrations', prefijo: 'INT', tipo: 'proveedor', proveedor: 'Vendor West', area: 'Platform', fte: 4, lentitud: 1.2, pRetrabajo: 0.12, pReabrir: 0.05, pCriterio: 0.6, sinSprints: true, llegadas: [4, 6] },
  { nombre: 'Data and BI', prefijo: 'DAT', tipo: 'interno', proveedor: null, area: 'Platform', fte: 4, lentitud: 0.9, pRetrabajo: 0.08, pReabrir: 0.02, pCriterio: 0.7, llegadas: [4, 6] },
];

export const INICIATIVAS_ASEGURADORA: IniciativaSintetica[] = [
  { id: 'definicion-listo-siniestros', nombre: 'Definition of ready in Claims', equipo: 'Claims', inicio: '2026-05-04', medida: 'retrabajo', direccion: 'bajar', efectoCiclo: 1, efectoRetrabajo: 0.35, conEfecto: true },
  { id: 'limite-wip-canal-digital', nombre: 'Work in progress limit in Digital Channel', equipo: 'Digital Channel', inicio: '2026-10-05', medida: 'ciclo', direccion: 'bajar', efectoCiclo: 0.7, efectoRetrabajo: 1, conEfecto: true },
];

const TEMAS = ['la apertura de siniestros', 'el cálculo de la prima', 'la renovación de pólizas', 'el parte amistoso digital', 'la consulta de coberturas',
  'la firma de la póliza', 'el aviso de impago', 'la carga de peritajes', 'la tarificación de autos', 'el informe de siniestralidad',
  'la integración con talleres', 'el área de cliente'];
const RAMOS = ['Autos', 'Hogar', 'Vida', 'Salud', 'Multirriesgo'];

/** Columnas que no son de Jira estándar pero aparecen en un export real: personas, comentarios y un campo propio. */
const CABECERAS_EXTRA: Record<string, string> = { 'Creator': 'Creador', 'Comment': 'Comentario', 'Custom field (Ramo)': 'Campo personalizado (Ramo)' };

export interface SinFallo { id: string; equipo: string; que: string }

export function generarAseguradora() {
  const { cab: cab0, filas: filas0 } = generar({ semilla: SEMILLA, equipos: EQUIPOS_ASEGURADORA, iniciativas: INICIATIVAS_ASEGURADORA, inicio: INICIO, fin: FIN, semanas: 52, proyecto: 'Digital Insurance', temas: TEMAS });
  const az = azar(SEMILLA + 1);
  const I = (n: string) => { const i = cab0.indexOf(n); if (i < 0) throw new Error('Falta la columna ' + n); return i; };
  const c = { tipo: I('Issue Type'), estado: I('Status'), resuelta: I('Resolved'), creada: I('Created'), equipo: I('Custom field (Team)'), puntos: I('Custom field (Story Points)'), tis: I('Custom field ([CHART] Time in Status)'), informador: I('Reporter') };
  const filas = filas0.map((f) => f.slice());
  const fecha = (f: string[], col: number) => leerFecha(f[col]);
  const de = (equipo: string) => (f: string[]) => f[c.tipo] !== 'Epic' && f[c.equipo] === equipo;
  const hecha = (f: string[]) => f[c.estado] === 'Done';
  const desde = (d: Date) => (f: string[]) => { const r = fecha(f, c.resuelta); return !!r && r >= d; };
  const sembrados: Sembrado[] = [];

  // Dos tareas bloqueadas al exportar, para que el nombre del estado Bloqueado salga del propio export
  filas.filter((f) => de('Claims')(f) && f[c.estado] === 'In Progress').slice(0, 2).forEach((f) => {
    f[c.tis] = escribirTis(leerTis(f[c.tis]).map((x) => (x.id === '3' ? { ...x, v: Math.max(x.v, 2 * DIA) } : x)).concat([{ id: '10004', n: 1, v: 0 }]));
    f[c.estado] = 'Blocked';
  });

  // 1. Estado propio que no se reconoce por el nombre (Pólizas): una espera que se contaría como en curso
  let conEstado = 0;
  filas.filter((f) => de('Policies')(f) && hecha(f) && desde(VENTANA)(f)).forEach((f) => {
    if (az.r() < 0.4) { f[c.tis] = escribirTis(leerTis(f[c.tis]).concat([{ id: ESTADO_PROPIO.id, n: 1, v: az.entre(1, 3) * DIA }])); conEstado++; }
  });
  const enEstado = filas.filter((f) => de('Policies')(f) && f[c.estado] === 'In Progress').slice(0, 3);
  if (!enEstado.length) throw new Error('No Policies tasks in progress for the custom status.');
  enEstado.forEach((f) => {
    f[c.tis] = escribirTis(leerTis(f[c.tis]).map((x) => (x.id === '3' ? { ...x, v: az.entre(1, 4) * DIA } : x)).concat([{ id: ESTADO_PROPIO.id, n: 1, v: 0 }]));
    f[c.estado] = ESTADO_PROPIO.nombre;
  });
  sembrados.push({ id: 'estados', ambito: 'area', equipo: 'Policies', tareas: conEstado + enEstado.length,
    que: 'Policies added a custom status, "' + ESTADO_PROPIO.nombre + '", after the mapping was signed. It is a wait, but it is not recognised by name and would count as in progress.' });

  // 2. Saltos de pendiente a hecho (Datos y BI): mueven las tareas al final, cuando ya está hecho
  let saltos = 0;
  filas.filter((f) => de('Data and BI')(f) && hecha(f) && desde(VENTANA)(f)).forEach((f) => {
    if (az.r() < 0.3) {
      const lead = fecha(f, c.resuelta)!.getTime() - fecha(f, c.creada)!.getTime();
      f[c.tis] = escribirTis([{ id: '10000', n: 1, v: lead }, { id: '10002', n: 1, v: 0 }]);
      saltos++;
    }
  });
  sembrados.push({ id: 'flujo', ambito: 'ambos', equipo: 'Data and BI', tareas: saltos,
    que: 'In Data and BI, almost one in three tasks goes from backlog to done in one go: it is moved in the tool once it is already finished.' });

  // 3. Historias sin estimar (Canal digital)
  let sinPuntos = 0;
  filas.filter((f) => de('Digital Channel')(f) && f[c.tipo] === 'Story').forEach((f) => { if (az.r() < 0.55) { f[c.puntos] = ''; sinPuntos++; } });
  sembrados.push({ id: 'estimacion', ambito: 'ambos', equipo: 'Digital Channel', tareas: sinPuntos,
    que: 'Digital Channel leaves slightly more than half of its stories without an estimate.' });

  // Lo que no es un fallo: Integraciones trabaja sin sprints
  const sinFallo: SinFallo[] = [{ id: 'sprints', equipo: 'Integrations',
    que: 'Integrations works in Kanban, with no sprints. It is not a fault: the sprint check does not apply to it.' }];

  // Columnas de un export real que no se usan: creador, comentarios con nombres y un campo propio (ramo)
  const cab = cab0.concat(['Creator', 'Comment', 'Custom field (Ramo)']);
  filas.forEach((f) => {
    const epica = f[c.tipo] === 'Epic';
    f.push(f[c.informador], !epica && az.r() < 0.25 ? 'Revisado con ' + f[c.informador] + ' en la reunión diaria.' : '', epica ? '' : az.elegir(RAMOS));
  });
  // Jira en castellano y el equipo solo en Componentes
  let t: Tabla = quitarColumna({ cab, filas }, 'Custom field (Team)');
  t = renombrarCabeceras(enCastellano(t), CABECERAS_EXTRA);
  return { cab: t.cab, filas: t.filas, sembrados, sinFallo };
}

export function ficherosAseguradora(): Record<string, string> {
  const { cab, filas, sembrados, sinFallo } = generarAseguradora();
  const escenarios = {
    descripcion: 'Faults seeded in jira-aseguradora.csv: only three, the other checks must come out fine. Generated by herramientas/generar-sinteticos-aseguradora.ts.',
    fecha_export: '2026-10-14T09:00:00',
    formato: 'Jira in Spanish, team in Components, with people columns (Persona asignada, Informador, Creador, Comentario) and an unrecognised custom field (Ramo).',
    sembrados,
    sin_fallo: sinFallo,
  };
  const equipos = EQUIPOS_ASEGURADORA.map((e) => ({ id: e.prefijo.toLowerCase(), nombre: e.nombre, tipo: e.tipo, proveedor: e.proveedor, area: e.area, usa_sprints: !e.sinSprints,
    fte: [{ periodo: '2026-09', valor: e.fte, origen: e.tipo === 'proveedor' ? 'contrato' : 'declarado' }], limites: {} }));
  // El mapeo firmado en el arranque recoge los estados de entonces: el estado propio llegó después
  const cliente = {
    version: 2, nombre: 'Synthetic insurer', sector: 'insurance', plataforma: 'jira',
    mapeoEstados: { 'Tareas por hacer': 'pendiente', 'En curso': 'en_curso', 'En revisión': 'en_revision', 'Bloqueado': 'bloqueado', 'Listo': 'terminado' },
    equipos: { campo: 'componentes', lista: equipos },
    objetivos: ['tardamos', 'arreglos', 'comparar', 'agentes', 'datos'],
    medidas: ['ciclo', 'retrabajo', 'espera', 'entregas', 'agent_readiness'],
  };
  const out: Record<string, string> = {
    'jira-aseguradora.csv': csv(cab, filas),
    'escenarios.json': JSON.stringify(escenarios, null, 1) + '\n',
    'cliente/cliente.json': JSON.stringify(cliente, null, 2) + '\n',
    'cliente/contexto/contexto.json': JSON.stringify({ documentos: [
      { categoria: 'metodo', titulo: 'How the teams work', resumen: 'Scrum with two-week sprints in Claims, Policies, Digital Channel and Data and BI. Integrations works in Kanban.', fuente: 'Interview with the team leads', fecha: '2026-10-07' },
      { categoria: 'contratos', titulo: 'Vendor contracts', resumen: 'Vendor East (Digital Channel) and Vendor West (Integrations) work on a capacity basis, with fixed FTE per month.', fuente: 'Technology management', fecha: '2026-10-07' },
    ] }, null, 2) + '\n',
  };
  const textos: Record<string, [string, string, string]> = {
    'definicion-listo-siniestros': ['No story enters the Claims sprint without acceptance criteria reviewed with the business. The product owner reviews them in refinement and, if they are missing, the story waits for the next sprint.', 'Rework below 12% in two months.', 'retrabajo'],
    'limite-wip-canal-digital': ['Digital Channel does not start anything new while it has more tasks in progress than people (seven). It has been agreed with the vendor as part of the service and is reviewed every two weeks.', 'Lead time 25% lower in two months.', 'demasiado_a_la_vez'],
  };
  for (const i of INICIATIVAS_ASEGURADORA) {
    const [descripcion, efecto, origen] = textos[i.id];
    out[`cliente/iniciativas/${i.id}.json`] = JSON.stringify({
      id: i.id, nombre: i.nombre, descripcion, fecha_inicio: i.inicio, fecha_fin: null, equipos: [i.equipo],
      medidas_objetivo: [{ medida: i.medida, direccion: i.direccion }], efecto_esperado: efecto, estado: 'en_curso', origen, evaluacion: null, notas: '',
    }, null, 2) + '\n';
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.env.TZ !== 'Europe/Madrid') { console.error('Ejecuta con TZ=Europe/Madrid.'); process.exit(1); }
  const dir = process.argv[2] || join(fileURLToPath(new URL('..', import.meta.url)), 'datos-sinteticos', 'aseguradora');
  for (const [nombre, texto] of Object.entries(ficherosAseguradora())) {
    mkdirSync(join(dir, nombre, '..'), { recursive: true });
    writeFileSync(join(dir, nombre), texto);
  }
  console.log('Escrito en ' + dir);
}
