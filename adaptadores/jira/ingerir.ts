// Adaptador Jira CSV: une uno o varios exports, se queda con la versión más reciente de cada tarea
// y devuelve las tareas en el modelo neutro. Quita épicas y subtareas del cálculo.
// No lee responsables, creadores, observadores ni comentarios.

import { leerCSV } from '../comun/csv.ts';
import { mapearColumnas, columnasDeEnlaces } from './columnas.ts';
import { leerFecha } from './fechas.ts';
import { nombreDeId, nombresDeEstado, unidadTiempo, type TiempoJira } from './tiempos.ts';
import { norm } from '../../nucleo/util.ts';
import { proponerEstado } from '../../nucleo/estados.ts';
import { tieneCriterios } from '../comun/texto.ts';
import type {
  CampoAgrupador, EstadoNormalizado, EstadoOrigen, FicheroEntrada, InformeIngesta, Lectura, Prioridad, Tarea, TipoTarea,
} from '../../nucleo/modelo.ts';

export const PLATAFORMA = 'jira';

/** Campos por los que se puede reconocer el equipo en Jira, con su peso para la recomendación. */
export const CAMPOS_EQUIPO: CampoAgrupador[] = [
  { id: 'equipo', nombre: 'Campo Equipo', peso: 0.3 },
  { id: 'componentes', nombre: 'Componente', peso: 0.1 },
  { id: 'proyecto', nombre: 'Proyecto', peso: 0.05 },
  { id: 'etiquetas', nombre: 'Etiqueta', peso: 0 },
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

export function leerJira(ficheros: FicheroEntrada[]): Lectura {
  const informe: InformeIngesta = {
    plataforma: PLATAFORMA, ficheros: [], avisos: [], filasLeidas: 0, duplicadas: 0, epicas: 0, subtareas: 0, sinClave: 0, campos: {}, tareas: 0,
  };
  const porClave = new Map<string, FilaJira>();
  ficheros.forEach((f) => {
    let filas: string[][];
    try { filas = leerCSV(f.texto || ''); } catch { informe.avisos.push({ tipo: 'error', texto: 'No se pudo leer ' + f.nombre + '.' }); return; }
    if (filas.length === 1) { informe.avisos.push({ tipo: 'aviso', texto: f.nombre + ' solo tiene la fila de títulos: no trae tareas.' }); return; }
    if (filas.length < 1) { informe.avisos.push({ tipo: 'error', texto: f.nombre + ' está vacío o no es un CSV.' }); return; }
    const cab = filas[0], mapa = mapearColumnas(cab), enlacesIdx = columnasDeEnlaces(cab), n = filas.length - 1;
    const conDatos = cab.map(() => false);
    for (let r = 1; r < filas.length; r++) for (let c = 0; c < cab.length; c++) if (!conDatos[c] && filas[r][c]) conDatos[c] = true;
    informe.ficheros.push({ nombre: f.nombre, filas: n, columnas: cab.length, columnasConDatos: conDatos.filter(Boolean).length });
    if (n === 10000 || n === 1000) informe.avisos.push({ tipo: 'aviso', texto: f.nombre + ' tiene justo ' + n.toLocaleString('es-ES') + ' filas: puede estar cortado por el límite de exportación de Jira. Exporta por tramos de fechas.' });
    if (mapa.clave == null) { informe.avisos.push({ tipo: 'error', texto: f.nombre + ' no tiene columna de clave (Issue key). No parece un export de Jira.' }); return; }
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
      if (!clave) { informe.sinClave++; continue; }
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
    if (!t.creada) return;
    filas.push(t as FilaJira & { creada: Date });
  });
  informe.tareas = filas.length;

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
