// Adaptador Jira CSV: une uno o varios exports, se queda con la versión más reciente de cada tarea
// y devuelve las tareas en el modelo neutro. Quita épicas y subtareas del cálculo.
// No lee responsables, creadores, observadores ni comentarios.

import { Tx, regional } from '../../nucleo/idioma.ts';
import { leerCSV } from '../comun/csv.ts';
import { mapearColumnas, columnasDeEnlaces } from './columnas.ts';
import { ordenFechas, leerFechaOrden, hayNumericas, type OrdenFechas } from '../comun/fechas.ts';
import { buscarCabecera, aplicarColumnas } from '../comun/cabecera.ts';
import { nombreDeId, nombresDeEstado, unidadTiempo, type TiempoJira } from './tiempos.ts';
import { norm } from '../../nucleo/util.ts';
import { proponerEstado } from '../../nucleo/estados.ts';
import { tieneCriterios } from '../../nucleo/agent-readiness.ts';
import type {
  CampoAgrupador, EstadoNormalizado, EstadoOrigen, FicheroEntrada, InformeIngesta, Lectura, Prioridad, Tarea, TipoTarea,
} from '../../nucleo/modelo.ts';

export const PLATAFORMA = 'jira';

/** Campos por los que se puede reconocer el equipo en Jira, con su peso para la recomendación. */
export const CAMPOS_EQUIPO: CampoAgrupador[] = [
  { id: 'equipo', nombre: 'Team field', peso: 0.3 },
  { id: 'componentes', nombre: 'Component', peso: 0.1 },
  { id: 'proyecto', nombre: 'Project', peso: 0.05 },
  { id: 'etiquetas', nombre: 'Label', peso: 0 },
];

export function tipoDe(t: unknown): TipoTarea {
  const n = norm(t);
  if (/epic|epica/.test(n)) return 'epica';
  if (/sub/.test(n)) return 'subtarea';
  if (/bug|error|defect|defecto|fallo|incidente/.test(n)) return 'error';
  if (/story|historia/.test(n)) return 'historia';
  if (/task|tarea/.test(n)) return 'tarea';
  return 'otro';
}

export function esUrgente(p: unknown): boolean {
  return /highest|critic|blocker|bloque|maxim|urgent|muy alta|mas alta|^p0\b|^p1\b/.test(norm(p));
}

export function prioridadDe(p: unknown): Prioridad | null {
  if (esUrgente(p)) return 'urgente';
  const n = norm(p);
  if (/high|alta|major|mayor|importante|^p2\b/.test(n)) return 'alta';
  if (/medium|media|normal|moderad|^p3\b/.test(n)) return 'media';
  if (/low|baja|minor|menor|trivial|^p4\b|^p5\b/.test(n)) return 'baja';
  return null;
}

export function esDescartada(r: unknown): boolean {
  return /won.?t|duplicat|duplicad|cannot|can.?t reproduce|no se (hara|puede)|declin|rechaz|obsolet|descart|invalid/.test(norm(r));
}

/** Fila leída del CSV antes de pasar al modelo neutro. Vive solo dentro del adaptador. */
interface FilaJira {
  clave: string;
  resumen: string;
  descripcion: string;
  tipoTxt: string;
  tipo: TipoTarea;
  estado: string;
  categoria: string;
  creada: Date | null;
  actualizada: Date | null;
  resuelta: Date | null;
  resolucion: string;
  prioridad: string;
  componentes: string[];
  etiquetas: string[];
  sprints: string[];
  puntos: number | null;
  equipoCampo: string;
  proyecto: string;
  padre: string;
  padreClave: string;
  enlaces: number;
  tis: TiempoJira[];
  primera: Date | null;
  cambioCategoria: Date | null;
}

/** Opciones de lectura: columnas elegidas a mano (campo -> nombre de la columna) cuando la detección no basta. */
export interface OpcionesLectura {
  columnas?: Record<string, string>;
  /** Estimación: sin definir, la que se reconozca (o la elegida en columnas); '' no se usa ninguna; un nombre, esa columna. */
  columnaEstimacion?: string | null;
}

/** Campos sin los que un fichero no se puede medir. */
export const OBLIGATORIOS = ['clave', 'creada'];
/** Campos que conviene tener: sin ellos se miden menos cosas. */
export const RECOMENDADOS = ['tipo', 'estado', 'resuelta', 'equipo', 'actualizada', 'sprint'];
const CAMPOS_FECHA = ['creada', 'actualizada', 'resuelta', 'primera', 'cambioCategoria'];

export function leerJira(ficheros: FicheroEntrada[], opciones: OpcionesLectura = {}): Lectura {
  const informe: InformeIngesta = {
    plataforma: PLATAFORMA, ficheros: [], avisos: [], filasLeidas: 0, duplicadas: 0, epicas: 0, subtareas: 0, sinClave: 0, campos: {}, tareas: 0,
  };
  const porClave = new Map<string, FilaJira>();
  ficheros.forEach((f) => {
    let filas: string[][];
    try { filas = leerCSV(f.texto || ''); } catch { informe.avisos.push({ tipo: 'error', texto: Tx('Could not read ', 'No se pudo leer ') + f.nombre + '.' }); return; }
    if (filas.length === 1) { informe.avisos.push({ tipo: 'aviso', texto: f.nombre + Tx(' only has the header row: it has no tasks.', ' solo tiene la fila de títulos: no trae tareas.') }); return; }
    if (filas.length < 1) { informe.avisos.push({ tipo: 'error', texto: f.nombre + Tx(' is empty or is not a CSV.', ' está vacío o no es un CSV.') }); return; }
    // La fila de títulos puede no ser la primera ("Displaying 2784 issues at ..." encima, al guardar desde Excel)
    const cabecera = buscarCabecera(filas, mapearColumnas);
    const ic = cabecera.indice >= 0 ? cabecera.indice : cabecera.probable;
    if (ic > 0) {
      informe.avisos.push({ tipo: 'aviso', texto: f.nombre + Tx(': the column titles are on row ', ': los títulos de las columnas están en la fila ') + (ic + 1) + Tx('. The rows above them were skipped.', '. Se han saltado las filas de encima.') });
      filas = filas.slice(ic);
    }
    const cab = filas[0], mapa = aplicarColumnas(mapearColumnas(cab), cab, opciones.columnas), enlacesIdx = columnasDeEnlaces(cab);
    if (opciones.columnaEstimacion === '') delete mapa.puntos;
    else if (opciones.columnaEstimacion) {
      const i = cab.findIndex((h) => String(h).trim() === opciones.columnaEstimacion);
      if (i >= 0) mapa.puntos = i;
      else informe.avisos.push({ tipo: 'aviso', texto: f.nombre + Tx(' has no column "', ' no tiene la columna «') + opciones.columnaEstimacion + Tx('": the estimate is detected by name in this file.', '»: en este fichero la estimación se reconoce por su nombre.') });
    }
    // Filas vacías del final (Excel suele dejarlas) no cuentan
    while (filas.length > 1 && filas[filas.length - 1].every((x) => !String(x || '').trim())) filas.pop();
    const n = filas.length - 1;
    if (n < 1) { informe.avisos.push({ tipo: 'aviso', texto: f.nombre + Tx(' only has the header row: it has no tasks.', ' solo tiene la fila de títulos: no trae tareas.') }); return; }
    const conDatos = cab.map(() => false);
    for (let r = 1; r < filas.length; r++) for (let c = 0; c < cab.length; c++) if (!conDatos[c] && filas[r][c]) conDatos[c] = true;
    informe.ficheros.push({ nombre: f.nombre, filas: n, columnas: cab.length, columnasConDatos: conDatos.filter(Boolean).length });
    if (n === 10000 || n === 1000) informe.avisos.push({ tipo: 'aviso', texto: f.nombre + Tx(' has exactly ', ' tiene justo ') + n.toLocaleString(regional()) + Tx(' rows: it may be cut off by the Jira export limit. Export by date ranges.', ' filas: puede estar cortado por el límite de exportación de Jira. Exporta por tramos de fechas.') });
    const faltan = OBLIGATORIOS.filter((c) => mapa[c] == null);
    if (faltan.length) {
      informe.avisos.push({ tipo: 'error', texto: f.nombre + Tx(' is missing columns that are needed: ', ' no tiene columnas que hacen falta: ') + faltan.join(', ') + Tx('. Choose them by hand.', '. Elígelas a mano.') });
      (informe.columnasPendientes = informe.columnasPendientes || []).push({ fichero: f.nombre, cabecera: cab.map((h) => String(h).trim()).filter(Boolean), faltan });
      return;
    }
    // Orden día/mes de este fichero, con todas sus fechas
    const muestras: string[] = [];
    for (let r = 1; r < filas.length && muestras.length < 5000; r++) CAMPOS_FECHA.forEach((c) => { const i = mapa[c]; if (typeof i === 'number' && filas[r][i]) muestras.push(filas[r][i].trim()); });
    const orden: OrdenFechas = ordenFechas(muestras);
    if (hayNumericas(muestras)) informe.ordenFechas = orden;
    const leerFecha = (v: string) => leerFechaOrden(v, orden);
    Object.keys(mapa).forEach((k) => {
      const idx = ([] as number[]).concat(mapa[k]);
      if (idx.some((i) => conDatos[i])) informe.campos[k] = true;
      else if (!informe.campos[k]) informe.campos[k] = 'vacio';
    });
    informe.filasLeidas += n;
    const val = (fila: string[], campo: string): string => {
      const i = mapa[campo] as number | undefined;
      return i == null ? '' : (fila[i] || '').trim();
    };
    const vals = (fila: string[], campo: string): string[] => {
      const idx = mapa[campo] as number[] | undefined;
      if (idx == null) return [];
      const out: string[] = [];
      idx.forEach((i) => { const v = (fila[i] || '').trim(); if (v && out.indexOf(v) < 0) out.push(v); });
      return out;
    };
    for (let k = 1; k < filas.length; k++) {
      const fila = filas[k];
      const clave = val(fila, 'clave');
      if (!clave) {
        // Filas sin clave: las vacías y las de pie del export ("Generated at ...") no son tareas; el resto se cuenta
        const llenas = fila.filter((x) => String(x || '').trim()).length;
        if (llenas > 1) informe.sinClave++;
        continue;
      }
      const tipoTxt = val(fila, 'tipo');
      const t: FilaJira = {
        clave,
        resumen: val(fila, 'resumen'),
        descripcion: val(fila, 'descripcion'),
        tipoTxt,
        tipo: tipoDe(tipoTxt),
        estado: val(fila, 'estado'),
        categoria: val(fila, 'categoria'),
        creada: leerFecha(val(fila, 'creada')),
        actualizada: leerFecha(val(fila, 'actualizada')),
        resuelta: leerFecha(val(fila, 'resuelta')),
        resolucion: val(fila, 'resolucion'),
        prioridad: val(fila, 'prioridad'),
        componentes: vals(fila, 'componentes'),
        etiquetas: vals(fila, 'etiquetas'),
        sprints: vals(fila, 'sprint'),
        puntos: null,
        equipoCampo: val(fila, 'equipo'),
        proyecto: val(fila, 'proyecto'),
        padre: val(fila, 'padre'),
        padreClave: val(fila, 'padreClave'),
        enlaces: enlacesIdx.filter((i) => (fila[i] || '').trim()).length,
        tis: [],
        primera: leerFecha(val(fila, 'primera')),
        cambioCategoria: leerFecha(val(fila, 'cambioCategoria')),
      };
      const p = val(fila, 'puntos').replace(',', '.');
      if (p !== '' && !isNaN(+p)) t.puntos = +p;
      const tis = val(fila, 'tis');
      if (tis) tis.split('_*|*_').forEach((parte) => {
        const x = parte.split('_*:*_');
        if (x.length === 3 && !isNaN(+x[1]) && !isNaN(+x[2])) t.tis.push({ id: x[0], n: +x[1], v: +x[2] });
      });
      const previa = porClave.get(clave);
      if (previa) {
        informe.duplicadas++;
        if ((t.actualizada ? t.actualizada.getTime() : 0) >= (previa.actualizada ? previa.actualizada.getTime() : 0)) porClave.set(clave, t);
      } else porClave.set(clave, t);
    }
  });

  const filas: (FilaJira & { creada: Date })[] = [];
  porClave.forEach((t) => {
    if (t.tipo === 'epica') { informe.epicas++; return; }
    if (t.tipo === 'subtarea') { informe.subtareas++; return; }
    if (!t.creada) { informe.sinFecha = (informe.sinFecha || 0) + 1; return; }
    filas.push(t as FilaJira & { creada: Date });
  });
  informe.tareas = filas.length;
  if (informe.sinClave) informe.avisos.push({ tipo: 'aviso', texto: informe.sinClave.toLocaleString(regional()) + Tx(' rows have data but no task key and were left out.', ' filas tienen datos pero no clave de tarea y se han dejado fuera.') });
  if (informe.sinFecha) informe.avisos.push({ tipo: 'aviso', texto: informe.sinFecha.toLocaleString(regional()) + Tx(' tasks have no readable creation date and were left out.', ' tareas no tienen una fecha de creación legible y se han dejado fuera.') });
  // Fechas que no cuadran: terminadas antes de crearse o posteriores a la última actualización del export
  let ultima = 0; filas.forEach((t) => { const x = (t.actualizada || t.creada).getTime(); if (x > ultima) ultima = x; });
  const alReves = filas.filter((t) => t.resuelta && t.resuelta.getTime() < t.creada.getTime() - 6e4).length;
  const futuras = filas.filter((t) => t.creada.getTime() > ultima + 864e5 || (t.resuelta && t.resuelta.getTime() > ultima + 864e5)).length;
  if (filas.length && (alReves + futuras) / filas.length > 0.02) informe.avisos.push({ tipo: 'error', texto: Tx('Many dates do not add up (', 'Muchas fechas no cuadran (') + alReves + Tx(' done before created, ', ' terminadas antes de crearse, ') + futuras + Tx(' after the export). The day and month may be swapped: check how the file was saved.', ' posteriores al export). Puede que el día y el mes estén cambiados: revisa cómo se guardó el fichero.') });

  // Tiempo en estado: unidad y nombres de los ids
  const factor = unidadTiempo(filas);
  const { nombrePorId, avisos } = nombresDeEstado(filas);
  informe.avisos.push(...avisos);

  // Estados de origen con su categoría más frecuente, y el mapeo propuesto
  const categorias: Record<string, Record<string, number>> = {};
  const orden: string[] = [];
  const ver = (nombre: string) => { if (!categorias[nombre]) { categorias[nombre] = {}; orden.push(nombre); } };
  filas.forEach((t) => {
    if (t.estado) { ver(t.estado); if (t.categoria) categorias[t.estado][t.categoria] = (categorias[t.estado][t.categoria] || 0) + 1; }
    t.tis.forEach((x) => ver(nombreDeId(nombrePorId, x.id)));
  });
  const estados: EstadoOrigen[] = orden.map((nombre) => {
    let cat = '', max = 0;
    Object.keys(categorias[nombre]).forEach((c) => { if (categorias[nombre][c] > max) { max = categorias[nombre][c]; cat = c; } });
    return { nombre, categoria: cat };
  });
  const mapeoPropuesto: Record<string, EstadoNormalizado> = {};
  estados.forEach((e) => { mapeoPropuesto[e.nombre] = proponerEstado(e.nombre, e.categoria); });

  const tareas: Tarea[] = filas.map((t) => ({
    id: PLATAFORMA + ':' + t.clave,
    clave_origen: t.clave,
    plataforma: PLATAFORMA,
    tipo: t.tipo,
    tipo_origen: t.tipoTxt,
    titulo: t.resumen,
    descripcion: t.descripcion,
    estado_origen: t.estado,
    estado_normalizado: t.estado ? mapeoPropuesto[t.estado] : proponerEstado('', t.categoria),
    agrupadores: { equipo: t.equipoCampo, componentes: t.componentes[0] || '', proyecto: t.proyecto, etiquetas: t.etiquetas[0] || '' },
    equipo_id: null,
    prioridad: prioridadDe(t.prioridad),
    prioridad_origen: t.prioridad,
    estimacion: t.puntos,
    sprints: t.sprints,
    fechas: {
      creada: t.creada,
      actualizada: t.actualizada,
      empezada: null,
      terminada: t.resuelta,
      cambio_estado: t.cambioCategoria,
      primera_respuesta: t.primera,
    },
    historial_estados: [],
    tiempos_estado: t.tis.map((x) => ({ estado: nombreDeId(nombrePorId, x.id), visitas: x.n, ms: x.v * factor })),
    descartada: !!(t.resuelta && t.resolucion && esDescartada(t.resolucion)),
    reaperturas: null,
    etiquetas: t.etiquetas,
    enlaces: t.enlaces,
    tiene_criterios: tieneCriterios(t.descripcion),
    padre_id: t.padreClave || null,
    padre_titulo: t.padre,
  }));

  return {
    plataforma: PLATAFORMA, tareas, informe, estados, camposEquipo: CAMPOS_EQUIPO, mapeoPropuesto,
    detalle: { unidadTiempoMs: factor, nombrePorId },
  };
}
