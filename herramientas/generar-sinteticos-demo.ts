// Datos de ejemplo de la demo: un banco ficticio con diez equipos, como lo vería un comité de dirección.
// La mayoría trabaja dentro de su baseline; dos se salen, uno está en el borde y otros dos mejoran. La calidad del dato
// no es perfecta: un equipo exporta sin tiempo en cada estado, otro tiene un cierre en bloque y otro lleva poco tiempo
// midiéndose. Hay tres iniciativas: una que funciona, una sin efecto y una que aún se está midiendo.
// Usa el motor de B3 (generar-sinteticos-b3.ts), así que B3 y sus pruebas no cambian.
// Determinista: la misma semilla da siempre el mismo fichero.
//   TZ=Europe/Madrid node herramientas/generar-sinteticos-demo.ts [carpeta]   (por defecto datos-sinteticos/demo)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generar, csv, fechaJira, type EquipoSintetico, type IniciativaSintetica } from './generar-sinteticos-b3.ts';

const DIA = 864e5;
export const SEMILLA_DEMO = 20261102;
export const INICIO_DEMO = new Date(2026, 1, 23, 9, 0); // lunes 23 feb 2026
export const EXPORT_DEMO = new Date(2026, 10, 2, 9, 0); // lunes 2 nov 2026
const SEMANAS_DEMO = 36;

const PLATAFORMA = 'Platform', CANALES = 'Digital Channels';
const base = { pReabrir: 0.03, pCriterio: 0.7 };

export const EQUIPOS_DEMO: EquipoSintetico[] = [
  { nombre: 'Payments', prefijo: 'PAY', tipo: 'proveedor', proveedor: 'Vendor North', area: PLATAFORMA, fte: 9, lentitud: 1, pRetrabajo: 0.07, ...base, llegadas: [7, 9] },
  { nombre: 'Mobile App', prefijo: 'MOB', tipo: 'proveedor', proveedor: 'Vendor North', area: CANALES, fte: 8, lentitud: 1.25, pRetrabajo: 0.1, ...base, pCriterio: 0.45, llegadas: [6, 8] },
  { nombre: 'Customer Portal', prefijo: 'POR', tipo: 'interno', proveedor: null, area: CANALES, fte: 7, lentitud: 1.15, pRetrabajo: 0.12, ...base, llegadas: [6, 8] },
  { nombre: 'Risk', prefijo: 'RSK', tipo: 'interno', proveedor: null, area: PLATAFORMA, fte: 6, lentitud: 1, pRetrabajo: 0.2, ...base, llegadas: [5, 7] },
  { nombre: 'Core Banking', prefijo: 'COR', tipo: 'interno', proveedor: null, area: PLATAFORMA, fte: 10, lentitud: 1.45, pRetrabajo: 0.08, ...base, llegadas: [7, 9] },
  { nombre: 'Cards', prefijo: 'CRD', tipo: 'interno', proveedor: null, area: CANALES, fte: 7, lentitud: 1, pRetrabajo: 0.1, ...base, llegadas: [6, 8] },
  { nombre: 'Onboarding', prefijo: 'ONB', tipo: 'interno', proveedor: null, area: CANALES, fte: 5, lentitud: 0.95, pRetrabajo: 0.09, ...base, llegadas: [5, 7] },
  { nombre: 'Lending', prefijo: 'LEN', tipo: 'proveedor', proveedor: 'Vendor South', area: PLATAFORMA, fte: 5, lentitud: 1.1, pRetrabajo: 0.1, ...base, llegadas: [5, 7] },
  { nombre: 'Fraud', prefijo: 'FRD', tipo: 'interno', proveedor: null, area: PLATAFORMA, fte: 5, lentitud: 1, pRetrabajo: 0.1, ...base, llegadas: [5, 6] },
  { nombre: 'Identity', prefijo: 'IDN', tipo: 'interno', proveedor: null, area: CANALES, fte: 4, lentitud: 1, pRetrabajo: 0.1, ...base, llegadas: [4, 6] },
];

/** Iniciativas reales de la demo: se guardan en cliente/iniciativas y salen en la página Iniciativas. */
export const INICIATIVAS_DEMO: (IniciativaSintetica & { descripcion: string; esperado: string; origen: string })[] = [
  { id: 'revision-mismo-dia-core', nombre: 'Same-day code review in Core Banking', equipo: 'Core Banking', inicio: '2026-08-03', medida: 'ciclo', direccion: 'bajar',
    efectoCiclo: 0.62, efectoRetrabajo: 1, conEfecto: true, origen: 'demasiado_a_la_vez',
    descripcion: 'Every pull request is reviewed the same day it is opened. Two people per day keep a slot for reviews before starting new work.',
    esperado: 'Lead time 20% lower in two months.' },
  { id: 'pares-tarjetas', nombre: 'Pair programming on complex stories in Cards', equipo: 'Cards', inicio: '2026-07-06', medida: 'retrabajo', direccion: 'bajar',
    efectoCiclo: 1, efectoRetrabajo: 1, conEfecto: false, origen: 'retrabajo',
    descripcion: 'Stories of five points or more are developed in pairs from start to review.',
    esperado: 'Rework below 7% in two months.' },
  { id: 'plantilla-historias-onboarding', nombre: 'Story template with acceptance criteria in Onboarding', equipo: 'Onboarding', inicio: '2026-10-19', medida: 'retrabajo', direccion: 'bajar',
    efectoCiclo: 1, efectoRetrabajo: 0.8, conEfecto: true, origen: 'retrabajo',
    descripcion: 'Every new story uses a template with context, acceptance criteria and references before it enters a sprint.',
    esperado: 'Rework below 6% in two months.' },
];

/**
 * Cambios que pasan en los equipos sin ser una iniciativa: no se guardan como iniciativas, solo mueven los datos.
 * El motor aplica el efecto desde inicio + 14 días.
 */
const CAMBIOS_DEMO: IniciativaSintetica[] = [
  // Payments: un proveedor nuevo de QA a mitad de septiembre; el retrabajo se dispara
  { id: '_pay', nombre: '', equipo: 'Payments', inicio: '2026-09-07', medida: 'retrabajo', direccion: 'bajar', efectoCiclo: 1, efectoRetrabajo: 3.4, conEfecto: true },
  // Mobile App: entra una release grande y el ciclo se alarga
  { id: '_mob', nombre: '', equipo: 'Mobile App', inicio: '2026-09-07', medida: 'ciclo', direccion: 'bajar', efectoCiclo: 1.8, efectoRetrabajo: 1, conEfecto: true },
  // Customer Portal: algo más lento en las últimas semanas, sin salir del todo
  { id: '_por', nombre: '', equipo: 'Customer Portal', inicio: '2026-09-14', medida: 'ciclo', direccion: 'bajar', efectoCiclo: 1.3, efectoRetrabajo: 1, conEfecto: true },
  // Risk: mejora su retrabajo por su cuenta
  { id: '_rsk', nombre: '', equipo: 'Risk', inicio: '2026-08-24', medida: 'retrabajo', direccion: 'bajar', efectoCiclo: 1, efectoRetrabajo: 0.4, conEfecto: true },
];

/** Equipo que empezó a medirse tarde: menos semanas que las que hacen falta para su baseline completa. */
const INICIO_IDENTITY = new Date(2026, 6, 20, 9, 0); // lunes 20 jul 2026
/** Cierre en bloque de Lending: una limpieza del tablero dentro de las semanas que se miden. */
const CIERRE_BLOQUE = new Date(2026, 9, 28, 18, 2); // miércoles 28 oct 2026, 18:02
const N_CIERRE = 22;

const TEMAS_DEMO = ['the saved card payment', 'the statement download', 'the duplicate charge alert', 'the daily transfer limit', 'the login screen',
  'the transactions summary', 'adding a payee', 'the direct debit lookup', 'the PIN change', 'the risk report export', 'document validation',
  'the fee calculation', 'the loan simulator', 'the fraud alert rules', 'the identity check', 'the card freeze'];

export function generarDemo() {
  const { cab, filas, esperado } = generar({
    semilla: SEMILLA_DEMO, equipos: EQUIPOS_DEMO, iniciativas: [...INICIATIVAS_DEMO, ...CAMBIOS_DEMO],
    inicio: INICIO_DEMO, fin: EXPORT_DEMO, semanas: SEMANAS_DEMO, proyecto: 'Digital Banking', temas: TEMAS_DEMO,
  });
  const col = (n: string) => cab.indexOf(n);
  const C = { clave: col('Issue key'), id: col('Issue id'), tipo: col('Issue Type'), estado: col('Status'), creada: col('Created'), equipo: col('Custom field (Team)'), tis: col('Custom field ([CHART] Time in Status)') };
  const fecha = (s: string) => {
    const m = /^(\d{2})\/(\w{3})\/(\d{2}) (\d{1,2}):(\d{2}) (AM|PM)$/.exec(s)!;
    const mes = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[2]);
    let h = Number(m[4]) % 12; if (m[6] === 'PM') h += 12;
    return new Date(2000 + Number(m[3]), mes, Number(m[1]), h, Number(m[5]));
  };
  // Identity: sin tareas antes de que el equipo empezara a medirse (sus épicas sí existen)
  let salida = filas.filter((f) => !(f[C.equipo] === 'Identity' && f[C.tipo] !== 'Epic' && fecha(f[C.creada]) < INICIO_IDENTITY));
  // Fraud: el export de su proyecto llega sin el tiempo en cada estado
  salida = salida.map((f) => (f[C.equipo] === 'Fraud' && f[C.tipo] !== 'Epic' ? Object.assign([...f], { [C.tis]: '' }) : f));
  // Un bloqueo abierto fuera de Fraud: sin él, el export no dice cómo se llama el estado 10004 (Fraud no trae tiempos)
  const enCurso = salida.findIndex((f) => f[C.equipo] === 'Core Banking' && f[C.estado] === 'In Progress' && /^10000_\*:\*_1_\*:\*_\d+_\*\|\*_3_\*:\*_1_\*:\*_0$/.test(f[C.tis]));
  if (enCurso >= 0) {
    const f = [...salida[enCurso]];
    f[C.estado] = 'Blocked';
    f[C.tis] = f[C.tis].replace(/3_\*:\*_1_\*:\*_0$/, '3_*:*_1_*:*_' + 2 * DIA + '_*|*_10004_*:*_1_*:*_0');
    salida[enCurso] = f;
  }
  // Lending: 22 peticiones viejas que nadie terminó se cierran a la vez en una limpieza del tablero
  const lending = salida.filter((f) => f[C.equipo] === 'Lending');
  const epicaLending = lending.find((f) => f[C.tipo] === 'Epic' && /Quality/.test(f[0]))!;
  let id = Math.max(...salida.map((f) => Number(f[C.id])));
  const cierre = fechaJira(CIERRE_BLOQUE);
  for (let i = 0; i < N_CIERRE; i++) {
    const creada = new Date(INICIO_DEMO.getTime() + (14 + i * 3) * DIA + (i % 5) * 36e5);
    const espera = CIERRE_BLOQUE.getTime() - creada.getTime();
    const tema = TEMAS_DEMO[i % TEMAS_DEMO.length];
    salida.push([`Old request: review ${tema}`, `LEN-${900 + i}`, String(++id), i % 3 ? 'Task' : 'Story', 'Done', 'LEN', 'Digital Banking', 'Low', 'Done',
      'Persona LEN1', 'Persona LEN2', fechaJira(creada), cierre, cierre, 'Lending', '', `Review ${tema}.`, '', 'Lending', '', '', '',
      `10000_*:*_1_*:*_${espera - 60000}_*|*_3_*:*_1_*:*_60000_*|*_10002_*:*_1_*:*_0`, epicaLending[C.clave], epicaLending[0], 'Done', cierre]);
  }
  return { cab, filas: salida, esperado };
}

export function ficherosDemo(): Record<string, string> {
  const { cab, filas } = generarDemo();
  const escenarios = {
    descripcion: 'Scenarios seeded in jira-demo.csv. Generated by herramientas/generar-sinteticos-demo.ts.',
    fecha_export: '2026-11-02T09:00:00',
    equipos: EQUIPOS_DEMO.map(({ nombre, tipo, proveedor, area, fte }) => ({ nombre, tipo, proveedor, area, fte })),
    cambios: {
      'Payments': 'Rework jumps from mid September (new QA vendor).',
      'Mobile App': 'Lead time grows from mid September (large release).',
      'Customer Portal': 'Slightly slower from late September.',
      'Risk': 'Rework improves from early September, with no initiative.',
    },
    calidad_del_dato: {
      'Fraud': 'Its export has no Time in Status.',
      'Lending': N_CIERRE + ' old requests closed in the same minute on 28 Oct 2026 at 18:02.',
      'Identity': 'Measured only since 20 Jul 2026: not enough weeks for a full baseline.',
    },
    iniciativas: INICIATIVAS_DEMO.map(({ id, equipo, inicio, medida, direccion, conEfecto }) => ({ id, equipo, inicio, medida, direccion, conEfecto })),
  };
  const cliente = {
    version: 2, nombre: 'Sample bank', sector: 'banking', plataforma: 'jira',
    mapeoEstados: { 'To Do': 'pendiente', 'In Progress': 'en_curso', 'In Review': 'en_revision', 'Blocked': 'bloqueado', 'Done': 'terminado' },
    equipos: {
      campo: 'equipo',
      lista: EQUIPOS_DEMO.map((e) => ({
        id: e.prefijo.toLowerCase(), nombre: e.nombre, tipo: e.tipo, proveedor: e.proveedor, area: e.area, usa_sprints: true,
        fte: [{ periodo: '2026-10', valor: e.fte, origen: e.tipo === 'proveedor' ? 'contrato' : 'declarado' }], limites: {},
      })),
    },
    objetivos: ['tardamos', 'arreglos', 'comparar', 'datos'],
    medidas: ['ciclo', 'retrabajo', 'entregas', 'bugs', 'arrastradas'],
  };
  const out: Record<string, string> = {
    'jira-demo.csv': csv(cab, filas),
    'escenarios.json': JSON.stringify(escenarios, null, 1) + '\n',
    'cliente/cliente.json': JSON.stringify(cliente, null, 2) + '\n',
    'cliente/contexto/contexto.json': JSON.stringify({ documentos: [
      { categoria: 'metodo', titulo: 'How the teams work', resumen: 'Scrum with two-week sprints in all ten teams. Code review is mandatory. Platform and Digital Channels report to the same technology director.', fuente: 'Interview with the team leads', fecha: '2026-10-26' },
      { categoria: 'contratos', titulo: 'Vendor contracts', resumen: 'Vendor North runs Payments and Mobile App; Vendor South runs Lending. Both work on a capacity basis (fixed FTE per month), with no commitment on lead times.', fuente: 'Technology management', fecha: '2026-10-26' },
      { categoria: 'cambios', titulo: 'Changes this quarter', resumen: 'Payments changed its QA vendor in September. Mobile App is in the middle of a large release. Identity started using Jira in August.', fuente: 'Technology management', fecha: '2026-10-26' },
    ] }, null, 2) + '\n',
  };
  for (const i of INICIATIVAS_DEMO) {
    out[`cliente/iniciativas/${i.id}.json`] = JSON.stringify({
      id: i.id, nombre: i.nombre, descripcion: i.descripcion, fecha_inicio: i.inicio, fecha_fin: null, equipos: [i.equipo],
      medidas_objetivo: [{ medida: i.medida, direccion: i.direccion }], efecto_esperado: i.esperado,
      estado: 'en_curso', origen: i.origen, evaluacion: null, notas: '',
    }, null, 2) + '\n';
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.env.TZ !== 'Europe/Madrid') { console.error('Ejecuta con TZ=Europe/Madrid.'); process.exit(1); }
  const dir = process.argv[2] || join(fileURLToPath(new URL('..', import.meta.url)), 'datos-sinteticos', 'demo');
  for (const [nombre, texto] of Object.entries(ficherosDemo())) {
    mkdirSync(join(dir, nombre, '..'), { recursive: true });
    writeFileSync(join(dir, nombre), texto);
  }
  console.log('Escrito en ' + dir);
}
