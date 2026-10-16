// Datos sintéticos de B3: dos equipos internos y dos de proveedores, dos iniciativas sembradas
// (una con efecto, otra sin) y descripciones de calidad conocida para agent readiness.
// Determinista: la misma semilla da siempre el mismo fichero.
//   TZ=Europe/Madrid node herramientas/generar-sinteticos-b3.ts [carpeta]   (por defecto datos-sinteticos/b3)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIA = 864e5;
const SEMILLA = 20261015;

/** Generador pseudoaleatorio mulberry32. */
export function azar(semilla: number) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    entre: (a0: number, b0: number) => a0 + (b0 - a0) * r(),
    entero: (a0: number, b0: number) => Math.floor(a0 + (b0 - a0 + 1) * r()),
    elegir: <T>(xs: T[]) => xs[Math.floor(r() * xs.length)],
    peso: <T>(xs: [T, number][]) => { let x = r() * xs.reduce((s, p) => s + p[1], 0); for (const [v, p] of xs) { x -= p; if (x <= 0) return v; } return xs[xs.length - 1][0]; },
    /** Ruido multiplicativo con mediana 1. */
    ruido: (sigma: number) => Math.exp(sigma * Math.sqrt(-2 * Math.log(1 - r() + 1e-12)) * Math.cos(2 * Math.PI * r())),
  };
}

export interface EquipoSintetico {
  nombre: string; prefijo: string; tipo: 'interno' | 'proveedor'; proveedor: string | null; area: string; fte: number;
  /** Factor sobre el tiempo de trabajo y de revisión dentro del mismo tamaño de tarea. */
  lentitud: number;
  /** Probabilidad de volver atrás antes de terminar (retrabajo) y de reabrir lo terminado. */
  pRetrabajo: number; pReabrir: number;
  /** Probabilidad de que cada criterio de agent readiness se cumpla en sus tickets. */
  pCriterio: number;
  /** Trabaja sin sprints (Kanban). */
  sinSprints?: boolean;
  /** Tareas nuevas por semana, mínimo y máximo (por defecto 5 a 7). */
  llegadas?: [number, number];
}

export const EQUIPOS: EquipoSintetico[] = [
  { nombre: 'Pagos', prefijo: 'PAG', tipo: 'interno', proveedor: null, area: 'Canales digitales', fte: 5, lentitud: 1, pRetrabajo: 0.08, pReabrir: 0.03, pCriterio: 0.9 },
  { nombre: 'Riesgos', prefijo: 'RIE', tipo: 'interno', proveedor: null, area: 'Plataforma', fte: 5, lentitud: 1, pRetrabajo: 0.18, pReabrir: 0.03, pCriterio: 0.65 },
  { nombre: 'App móvil', prefijo: 'APP', tipo: 'proveedor', proveedor: 'Proveedor Norte', area: 'Canales digitales', fte: 5, lentitud: 1.7, pRetrabajo: 0.3, pReabrir: 0.15, pCriterio: 0.25 },
  { nombre: 'Portal clientes', prefijo: 'POR', tipo: 'proveedor', proveedor: 'Proveedor Sur', area: 'Plataforma', fte: 5, lentitud: 1.7, pRetrabajo: 0.3, pReabrir: 0.15, pCriterio: 0.5 },
];

export interface IniciativaSintetica {
  id: string; nombre: string; equipo: string; inicio: string; medida: string; direccion: 'subir' | 'bajar';
  /** Factor sobre el tiempo de trabajo (ciclo) o sobre la probabilidad de retrabajo desde inicio + 14 días. 1 = sin efecto. */
  efectoCiclo: number; efectoRetrabajo: number; conEfecto: boolean;
}

export const INICIATIVAS: IniciativaSintetica[] = [
  { id: 'limite-wip-pagos', nombre: 'Límite de trabajo en curso en Pagos', equipo: 'Pagos', inicio: '2026-06-01', medida: 'ciclo', direccion: 'bajar', efectoCiclo: 0.55, efectoRetrabajo: 1, conEfecto: true },
  { id: 'formacion-pruebas-riesgos', nombre: 'Formación en pruebas automáticas en Riesgos', equipo: 'Riesgos', inicio: '2026-06-01', medida: 'retrabajo', direccion: 'bajar', efectoCiclo: 1, efectoRetrabajo: 1, conEfecto: false },
];

const INICIO = new Date(2025, 9, 13, 9, 0); // lunes 13 oct 2025
export const EXPORT = new Date(2026, 9, 12, 9, 0); // lunes 12 oct 2026
const SEMANAS = 52;
const ID_ESTADO = { 'To Do': '10000', 'In Progress': '3', 'In Review': '10003', 'Blocked': '10004', 'Done': '10002' } as const;
type Estado = keyof typeof ID_ESTADO;
const CATEGORIA: Record<Estado, string> = { 'To Do': 'To Do', 'In Progress': 'In Progress', 'In Review': 'In Progress', 'Blocked': 'In Progress', 'Done': 'Done' };
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fechaJira(d: Date): string {
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(d.getDate()).padStart(2, '0')}/${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}
export function fechaIso(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.000`;
}
/** Lleva una fecha a horario laboral (9 a 18, lunes a viernes). */
function laborable(d: Date): Date {
  const x = new Date(d.getTime());
  if (x.getHours() < 9) x.setHours(9, x.getMinutes());
  if (x.getHours() >= 18) { x.setDate(x.getDate() + 1); x.setHours(9 + (x.getMinutes() % 3), x.getMinutes()); }
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x;
}

// ---------- descripciones con calidad conocida ----------
const TEMAS = ['el pago con tarjeta guardada', 'la descarga de extractos', 'el aviso de cargo duplicado', 'el límite diario de transferencias',
  'la pantalla de inicio de sesión', 'el resumen de movimientos', 'el alta de beneficiarios', 'la consulta de recibos', 'el cambio de PIN',
  'la exportación de informes de riesgo', 'la validación de documentos', 'el cálculo de comisiones'];
const RELLENO = ['Hoy el proceso obliga a repetir pasos y genera llamadas al centro de atención.', 'El cambio afecta solo a clientes particulares y no toca la parte de empresas.',
  'Hay que mantener el comportamiento actual para quien ya tenga la opción activada.', 'La parte visual ya está acordada con diseño en la última revisión del equipo.',
  'El servicio que se usa ya existe y tiene su contrato publicado en el catálogo interno.', 'Se mide con el evento de analítica que ya está definido para esta pantalla.',
  'Si falla, se muestra el mensaje genérico de error y se registra la incidencia.'];

export interface Criterios { contenido: boolean; criterios: boolean; acotado: boolean; referencias: boolean; sinDependencias: boolean }

function descripcion(az: ReturnType<typeof azar>, titulo: string, tema: string, c: Criterios, prefijo: string): string {
  const partes: string[] = [];
  if (c.contenido) {
    partes.push(`Queremos cambiar ${tema} para que el cliente lo resuelva sin ayuda.`);
    const usados = new Set<number>();
    while (usados.size < 4) usados.add(az.entero(0, RELLENO.length - 1));
    [...usados].forEach((i) => partes.push(RELLENO[i]));
  } else if (az.r() < 0.3) {
    partes.push(titulo);
  } else {
    partes.push(`Revisar ${tema}.`);
  }
  if (c.criterios) {
    const forma = az.entero(0, 2);
    if (forma === 0) partes.push('Criterios de aceptación:\n- funciona en móvil y en web\n- queda registrado en analítica');
    else if (forma === 1) partes.push('Dado un cliente con sesión iniciada, cuando lo use, entonces ve el resultado al momento.');
    else partes.push('- [ ] funciona en móvil\n- [ ] registra el evento');
  }
  if (c.referencias) {
    const forma = az.entero(0, 2);
    if (forma === 0) partes.push(`Ver ${prefijo}-${az.entero(1, 40)}.`);
    else if (forma === 1) partes.push('Diseño en https://diseno.example/fichero/' + az.entero(100, 999) + '.');
    else partes.push('Código en src/servicios/' + tema.split(' ').pop() + '.ts.');
  }
  if (!c.sinDependencias) partes.push('Depende de otro equipo para empezar.');
  return partes.join('\n');
}

const palabras = (s: string) => s.split(/\s+/).filter(Boolean).length;

// ---------- generación ----------
export interface TicketEsperado { equipo: string; criterios: Criterios; indice: number }

/** Para generar otro cliente con el mismo motor. Sin opciones sale B3. */
export interface OpcionesGenerar {
  semilla?: number; equipos?: EquipoSintetico[]; iniciativas?: IniciativaSintetica[];
  inicio?: Date; fin?: Date; semanas?: number; proyecto?: string; temas?: string[];
}

export function generar(o: OpcionesGenerar = {}) {
  const az = azar(o.semilla ?? SEMILLA);
  const EQS = o.equipos ?? EQUIPOS, INIS = o.iniciativas ?? INICIATIVAS, TEMAS_ = o.temas ?? TEMAS;
  const INICIO_ = o.inicio ?? INICIO, FIN = o.fin ?? EXPORT, SEMANAS_ = o.semanas ?? SEMANAS, PROYECTO = o.proyecto ?? 'Plataforma Digital';
  const filas: string[][] = [];
  const esperado: Record<string, TicketEsperado> = {};
  const cab = ['Summary', 'Issue key', 'Issue id', 'Issue Type', 'Status', 'Project key', 'Project name', 'Priority', 'Resolution', 'Assignee', 'Reporter',
    'Created', 'Updated', 'Resolved', 'Components', 'Labels', 'Description', 'Custom field (Story Points)', 'Custom field (Team)', 'Sprint', 'Sprint',
    'Custom field ([CHART] Date of First Response)', 'Custom field ([CHART] Time in Status)', 'Parent key', 'Parent summary', 'Status category', 'Status category changed'];
  let id = 20000;
  for (const eq of EQS) {
    let n = 0;
    const clave = () => `${eq.prefijo}-${++n}`;
    const epicas = ['Nuevas funciones', 'Calidad y deuda técnica', 'Cumplimiento normativo'].map((titulo) => {
      const k = clave();
      filas.push([titulo, k, String(++id), 'Epic', 'In Progress', eq.prefijo, PROYECTO, 'Medium', '', `Persona ${eq.prefijo}1`, `Persona ${eq.prefijo}2`,
        fechaJira(INICIO_), fechaJira(INICIO_), '', eq.nombre, '', '', '', eq.nombre, '', '', '', '', '', '', 'In Progress', fechaJira(INICIO_)]);
      return { k, titulo };
    });
    const ini = INIS.find((i) => i.equipo === eq.nombre);
    const inicioIni = ini ? new Date(ini.inicio + 'T09:00:00').getTime() + 14 * DIA : Infinity;
    for (let w = 0; w < SEMANAS_; w++) {
      const llegadas = az.entero(...(eq.llegadas ?? [5, 7]));
      for (let j = 0; j < llegadas; j++) {
        const creada = laborable(new Date(INICIO_.getTime() + w * 7 * DIA + az.entre(0, 5) * DIA + az.entre(0, 8) * 36e5));
        if (creada >= FIN) continue;
        const tipo = az.peso<[string, string]>([[['Story', 'historia'], 60], [['Bug', 'error'], 25], [['Task', 'tarea'], 15]]);
        const puntos = az.peso([[1, 15], [2, 25], [3, 30], [5, 20], [8, 10]]);
        const tema = az.elegir(TEMAS_);
        const titulo = (tipo[0] === 'Bug' ? 'Corregir ' : tipo[0] === 'Task' ? 'Preparar ' : 'Mejorar ') + tema;
        const k = clave();
        // Tiempos (días): espera sin empezar, trabajo, revisión y bloqueo
        const esperaInicio = az.entre(0.5, 6) * az.ruido(0.4);
        const inicio = laborable(new Date(creada.getTime() + esperaInicio * DIA));
        const efecto = inicio.getTime() >= inicioIni ? (ini!.efectoCiclo) : 1;
        const base = { 1: 0.8, 2: 1.4, 3: 2.2, 5: 3.6, 8: 5.5 }[puntos]!;
        const trabajo = base * eq.lentitud * efecto * az.ruido(0.35);
        const revision = az.entre(0.3, 1.2) * eq.lentitud * efecto * az.ruido(0.3);
        const bloqueo = az.r() < 0.08 ? az.entre(1, 4) : 0;
        const pRet = eq.pRetrabajo * (inicio.getTime() >= inicioIni ? ini!.efectoRetrabajo : 1);
        const vuelve = az.r() < pRet;
        const extra = vuelve ? trabajo * 0.4 : 0;
        const reabre = az.r() < eq.pReabrir;
        const total = trabajo + revision + bloqueo + extra;
        const fin = laborable(new Date(inicio.getTime() + total * DIA));
        // Estado al exportar
        let estado: Estado;
        const tis: Record<Estado, [number, number]> = { 'To Do': [1, 0], 'In Progress': [0, 0], 'In Review': [0, 0], 'Blocked': [0, 0], 'Done': [0, 0] };
        let resuelta: Date | null = null, cambio: Date;
        if (fin < FIN) {
          estado = 'Done';
          resuelta = fin;
          cambio = fin;
          tis['To Do'] = [1, inicio.getTime() - creada.getTime()];
          tis['In Progress'] = [vuelve || reabre ? 2 : 1, Math.round((trabajo + extra) * DIA)];
          tis['In Review'] = [vuelve ? 2 : 1, Math.round(revision * DIA)];
          if (bloqueo) tis['Blocked'] = [1, Math.round(bloqueo * DIA)];
          tis['Done'] = [reabre ? 2 : 1, 0];
        } else if (inicio < FIN) {
          const transcurrido = (FIN.getTime() - inicio.getTime()) / DIA;
          tis['To Do'] = [1, inicio.getTime() - creada.getTime()];
          if (bloqueo && transcurrido > trabajo * 0.5 && transcurrido < trabajo * 0.5 + bloqueo) {
            estado = 'Blocked';
            tis['In Progress'] = [1, Math.round(trabajo * 0.5 * DIA)];
            tis['Blocked'] = [1, 0];
            cambio = new Date(inicio.getTime() + trabajo * 0.5 * DIA);
          } else if (transcurrido > trabajo + extra + bloqueo) {
            estado = 'In Review';
            tis['In Progress'] = [1, Math.round((trabajo + extra) * DIA)];
            if (bloqueo) tis['Blocked'] = [1, Math.round(bloqueo * DIA)];
            tis['In Review'] = [1, 0];
            cambio = new Date(inicio.getTime() + (trabajo + extra + bloqueo) * DIA);
          } else {
            estado = 'In Progress';
            tis['In Progress'] = [1, 0];
            cambio = inicio;
          }
        } else {
          estado = 'To Do';
          tis['To Do'] = [1, 0];
          cambio = creada;
        }
        // Agent readiness: criterios sembrados
        const c: Criterios = {
          contenido: az.r() < eq.pCriterio,
          criterios: az.r() < eq.pCriterio,
          acotado: puntos <= 5,
          referencias: az.r() < eq.pCriterio,
          sinDependencias: az.r() < 0.5 + eq.pCriterio / 2,
        };
        const texto = descripcion(az, titulo, tema, c, eq.prefijo);
        if (estado === 'Blocked') c.sinDependencias = false;
        c.contenido = c.contenido && palabras(texto) >= 40;
        esperado[k] = { equipo: eq.nombre, criterios: c, indice: Object.values(c).filter(Boolean).length };
        // Sprints de dos semanas
        const sprintDe = (d: Date) => `${eq.prefijo} Sprint ${Math.floor((d.getTime() - INICIO_.getTime()) / (14 * DIA)) + 1}`;
        const sprints = estado === 'To Do' || eq.sinSprints ? [] : [...new Set([sprintDe(inicio), sprintDe(resuelta || FIN)])];
        const epica = az.elegir(epicas);
        const tisTexto = (Object.keys(tis) as Estado[]).filter((e) => tis[e][0] > 0 && (tis[e][1] > 0 || e === estado))
          .map((e) => `${ID_ESTADO[e]}_*:*_${tis[e][0]}_*:*_${Math.max(0, Math.round(tis[e][1]))}`).join('_*|*_');
        const actualizada = resuelta || cambio;
        filas.push([titulo, k, String(++id), tipo[0], estado, eq.prefijo, PROYECTO, az.peso([['High', 20], ['Medium', 60], ['Low', 20]]),
          resuelta ? 'Done' : '', `Persona ${eq.prefijo}${az.entero(1, 5)}`, `Persona ${eq.prefijo}${az.entero(1, 5)}`,
          fechaJira(creada), fechaJira(actualizada), resuelta ? fechaJira(resuelta) : '', eq.nombre, '', texto, puntos.toFixed(1), eq.nombre,
          sprints[0] || '', sprints[1] || '', fechaIso(new Date(creada.getTime() + az.entre(1, 20) * 36e5)), tisTexto, epica.k, epica.titulo,
          CATEGORIA[estado], fechaJira(cambio)]);
      }
    }
  }
  return { cab, filas, esperado };
}

export function csv(cab: string[], filas: string[][]): string {
  const campo = (v: string) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return [cab, ...filas].map((f) => f.map(campo).join(',')).join('\n') + '\n';
}

export function ficheros(): Record<string, string> {
  const { cab, filas, esperado } = generar();
  const escenarios = {
    descripcion: 'Escenarios sembrados en jira-b3.csv. Lo generan herramientas/generar-sinteticos-b3.ts.',
    fecha_export: '2026-10-12T09:00:00',
    equipos: EQUIPOS.map(({ nombre, tipo, proveedor, area, fte }) => ({ nombre, tipo, proveedor, area, fte })),
    diferencia_entre_grupos: {
      que: 'Dentro del mismo tipo y tamaño de tarea, los proveedores tardan más (plazo) y vuelven atrás y reabren más que los internos.',
      medidas: { plazo_p85: 'proveedor', retrabajo: 'proveedor', reabiertas: 'proveedor' },
    },
    agent_readiness_bajo: 'App móvil',
    iniciativas: INICIATIVAS.map(({ id, equipo, inicio, medida, direccion, conEfecto }) => ({ id, equipo, inicio, medida, direccion, conEfecto })),
    criterios_ar: 'Por ticket, cinco cifras: contenido, criterios de aceptación, alcance acotado, referencias y sin dependencias (1 = cumple).',
    tickets: Object.fromEntries(Object.entries(esperado).map(([k, v]) => [k, (['contenido', 'criterios', 'acotado', 'referencias', 'sinDependencias'] as const).map((c) => (v.criterios[c] ? '1' : '0')).join('')])),
  };
  const cliente = {
    version: 2, nombre: 'Cliente sintético B3', sector: 'banca', plataforma: 'jira',
    mapeoEstados: { 'To Do': 'pendiente', 'In Progress': 'en_curso', 'In Review': 'en_revision', 'Blocked': 'bloqueado', 'Done': 'terminado' },
    equipos: {
      campo: 'equipo',
      lista: EQUIPOS.map((e) => ({
        id: e.prefijo.toLowerCase(), nombre: e.nombre, tipo: e.tipo, proveedor: e.proveedor, area: e.area, usa_sprints: true,
        fte: [{ periodo: '2026-09', valor: e.fte, origen: e.tipo === 'proveedor' ? 'contrato' : 'declarado' }], limites: {},
      })),
    },
    objetivos: ['tardamos', 'arreglos', 'comparar', 'agentes', 'datos'],
    medidas: ['ciclo', 'retrabajo', 'espera', 'entregas', 'agent_readiness'],
  };
  const out: Record<string, string> = {
    'jira-b3.csv': csv(cab, filas),
    'escenarios.json': JSON.stringify(escenarios, null, 1) + '\n',
    'cliente/cliente.json': JSON.stringify(cliente, null, 2) + '\n',
    'cliente/contexto/contexto.json': JSON.stringify({ documentos: [
      { categoria: 'metodo', titulo: 'Cómo trabajan los equipos', resumen: 'Scrum con sprints de dos semanas en los cuatro equipos. Revisión de código obligatoria.', fuente: 'Entrevista con los responsables de equipo', fecha: '2026-10-05' },
      { categoria: 'contratos', titulo: 'Contratos con proveedores', resumen: 'Proveedor Norte y Proveedor Sur trabajan por capacidad (FTE fijos al mes), sin compromiso de plazos.', fuente: 'Dirección de tecnología', fecha: '2026-10-05' },
    ] }, null, 2) + '\n',
  };
  for (const i of INICIATIVAS) {
    out[`cliente/iniciativas/${i.id}.json`] = JSON.stringify({
      id: i.id, nombre: i.nombre, descripcion: i.conEfecto
        ? 'Pagos no empieza una tarea nueva mientras tenga más tareas en curso que personas en el equipo (cinco). Lo nuevo espera en pendiente y, en la reunión diaria, se mira primero qué se puede terminar.'
        : 'Dos sesiones de formación en pruebas automáticas para Riesgos y una guía con ejemplos. Cada historia nueva lleva sus pruebas antes de pasar a revisión.',
      fecha_inicio: i.inicio, fecha_fin: null, equipos: [i.equipo], medidas_objetivo: [{ medida: i.medida, direccion: i.direccion }],
      efecto_esperado: i.medida === 'ciclo' ? 'Plazo un 30% más bajo en dos meses.' : 'Retrabajo por debajo del 10% en dos meses.',
      estado: 'en_curso', origen: i.medida === 'ciclo' ? 'demasiado_a_la_vez' : 'retrabajo', evaluacion: null, notas: '',
    }, null, 2) + '\n';
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.env.TZ !== 'Europe/Madrid') { console.error('Ejecuta con TZ=Europe/Madrid.'); process.exit(1); }
  const dir = process.argv[2] || join(fileURLToPath(new URL('..', import.meta.url)), 'datos-sinteticos', 'b3');
  for (const [nombre, texto] of Object.entries(ficheros())) {
    mkdirSync(join(dir, nombre, '..'), { recursive: true });
    writeFileSync(join(dir, nombre), texto);
  }
  console.log('Escrito en ' + dir);
}
