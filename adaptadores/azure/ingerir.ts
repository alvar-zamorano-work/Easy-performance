// Adaptador Azure DevOps CSV: el export de una consulta de Boards ("Export to CSV"), lista plana o en árbol.
// Une uno o varios ficheros, se queda con la versión más reciente de cada elemento y devuelve el modelo neutro.
// Épicas y Features salen del cálculo; las Tasks con elemento padre son subtareas y también salen.
// No lee Assigned To, Created By, Changed By ni ninguna columna de personas.
// Lo que el CSV de Azure DevOps no trae: el historial de estados (solo el actual) y los sprints anteriores (solo la
// iteración actual). Con Activated Date y Closed Date sí se puede medir el plazo de inicio a fin.

import { Tx, regional } from '../../nucleo/idioma.ts';
import { leerCSV } from '../comun/csv.ts';
import { mapearConAlias, describir, type ColumnaLeida, type MapaColumnas } from '../comun/describir.ts';
import { leerFecha } from '../jira/fechas.ts';
import { esDescartada } from '../jira/ingerir.ts';
import { norm } from '../../nucleo/util.ts';
import { idioma } from '../../nucleo/idioma.ts';
import { explicarEstado, proponerEstado, etapaDe } from '../../nucleo/estados.ts';
import { tieneCriterios } from '../../nucleo/agent-readiness.ts';
import type { CampoAgrupador, EstadoNormalizado, EstadoOrigen, FicheroEntrada, InformeIngesta, Lectura, Prioridad, Tarea, TipoTarea } from '../../nucleo/modelo.ts';

export const PLATAFORMA = 'azure_devops';

export const CAMPOS_EQUIPO: CampoAgrupador[] = [
  { id: 'equipo', nombre: 'Team field', peso: 0.3 },
  { id: 'area', nombre: 'Area path', peso: 0.25 },
  { id: 'proyecto', nombre: 'Project', peso: 0.05 },
  { id: 'etiquetas', nombre: 'Label', peso: 0 },
];

export const ALIAS: Record<string, string[]> = {
  clave: ['id', 'id.', 'work item id', 'id. de elemento de trabajo', 'identificador'],
  resumen: ['title', 'titulo'],
  descripcion: ['description', 'descripcion'],
  pasos: ['repro steps', 'pasos de reproduccion', 'pasos para reproducir'],
  criterios: ['acceptance criteria', 'criterios de aceptacion'],
  tipo: ['work item type', 'tipo de elemento de trabajo'],
  estado: ['state', 'estado'],
  motivo: ['reason', 'motivo', 'razon'],
  area: ['area path', 'ruta de area', 'ruta de acceso de area', 'ruta del area', 'ruta de acceso del area', 'area'],
  iteracion: ['iteration path', 'ruta de iteracion', 'ruta de acceso de iteracion', 'ruta de acceso de la iteracion', 'iteration', 'iteracion'],
  etiquetas: ['tags', 'etiquetas'],
  creada: ['created date', 'fecha de creacion'],
  actualizada: ['changed date', 'fecha de cambio', 'fecha de modificacion'],
  cerrada: ['closed date', 'fecha de cierre'],
  resuelta: ['resolved date', 'fecha de resolucion'],
  activada: ['activated date', 'fecha de activacion'],
  cambioEstado: ['state change date', 'fecha de cambio de estado'],
  puntos: ['story points', 'effort', 'size', 'puntos de historia', 'esfuerzo', 'tamano'],
  prioridad: ['priority', 'prioridad'],
  equipo: ['team', 'equipo', 'squad', 'assigned team', 'equipo asignado'],
  padre: ['parent', 'parent id', 'primario', 'elemento primario', 'padre'],
  proyecto: ['team project', 'proyecto de equipo', 'project', 'proyecto'],
  enlaces: ['related link count', 'link count', 'recuento de vinculos relacionados', 'numero de vinculos'],
};

const QUE_ES: Record<string, [string, string]> = {
  clave: ['Work item ID', 'Id. del elemento de trabajo'], resumen: ['Title: only in memory, never in the package', 'Título: solo en memoria, no sale en el paquete'],
  descripcion: ['Description: only to check whether the item is well defined', 'Descripción: solo para ver si el elemento está bien definido'],
  pasos: ['Repro steps of bugs: same use as the description', 'Pasos de reproducción de los bugs: el mismo uso que la descripción'],
  criterios: ['Acceptance criteria', 'Criterios de aceptación'], tipo: ['Type: story, task, bug or other', 'Tipo: historia, tarea, bug u otro'],
  estado: ['State: mapped to one of the nine common statuses', 'Estado: se traduce a uno de los nueve comunes'], motivo: ['Reason: separates removed or duplicated work from done work', 'Motivo: separa lo quitado o duplicado de lo terminado'],
  area: ['Area path: usually says the team', 'Ruta de área: suele decir el equipo'], iteracion: ['Current iteration (sprint)', 'Iteración actual (sprint)'],
  etiquetas: ['Tags', 'Etiquetas'], creada: ['Creation date', 'Fecha de creación'], actualizada: ['Date of the last change', 'Fecha del último cambio'],
  cerrada: ['Done date', 'Fecha de terminado'], resuelta: ['Resolved date: done date when there is no closed date', 'Fecha de resolución: fecha de terminado si no hay de cierre'],
  activada: ['Start date: when it went to Active', 'Fecha de inicio: cuándo pasó a activo'], cambioEstado: ['Date of the last state change', 'Fecha del último cambio de estado'],
  puntos: ['Estimate', 'Estimación'], prioridad: ['Priority', 'Prioridad'], equipo: ['Team field', 'Campo de equipo'],
  padre: ['Parent item: tasks with a parent are sub-tasks', 'Elemento padre: las tareas con padre son subtareas'], proyecto: ['Project', 'Proyecto'],
  enlaces: ['Number of links to other items', 'Número de vínculos con otros elementos'],
};
const queEs = (c: string) => (QUE_ES[c] ? QUE_ES[c][idioma() === 'es' ? 1 : 0] : '');

/** Columnas de título de una consulta en árbol ("Title 1", "Title 2"...), por nivel. */
const columnasTitulo = (cab: string[]) => cab.map((h, i) => ({ i, m: /^(title|titulo) (\d+)$/.exec(norm(h)) })).filter((x) => x.m).map((x) => ({ i: x.i, nivel: +x.m![2] })).sort((a, b) => a.nivel - b.nivel);

export function mapearColumnas(cab: string[]): MapaColumnas {
  const mapa = mapearConAlias(cab, ALIAS);
  const titulos = columnasTitulo(cab);
  if (mapa.resumen == null && titulos.length) mapa.resumen = titulos.map((x) => x.i);
  return mapa;
}
export function describirColumnas(texto: string): ColumnaLeida[] { return describir(texto, mapearColumnas, queEs); }
/** ¿Parece un export de Azure DevOps? Tiene tipo de elemento de trabajo y alguna ruta de área o iteración. */
export function esAzure(cab: string[]): boolean {
  const m = mapearConAlias(cab, ALIAS);
  return m.tipo != null && m.clave != null && (m.area != null || m.iteracion != null || cab.some((h) => /^(title|titulo) \d+$/.test(norm(h))));
}

export function tipoAzure(t: unknown, tienePadre: boolean): TipoTarea {
  const n = norm(t);
  if (/epic|epica|feature|caracteristica|funcionalidad/.test(n)) return 'epica';
  if (/bug|defect|error|incidente/.test(n)) return 'error';
  if (/user story|historia|product backlog item|elemento de trabajo pendiente|requirement|requisito|\bstory\b/.test(n)) return 'historia';
  if (/task|tarea/.test(n)) return tienePadre ? 'subtarea' : 'tarea';
  return 'otro';
}
/** Prioridad 1 a 4 de Azure DevOps (1 es la más alta). */
export function prioridadAzure(p: unknown): Prioridad | null {
  const n = norm(p);
  return ({ '1': 'urgente', '2': 'alta', '3': 'media', '4': 'baja' } as Record<string, Prioridad>)[n] || null;
}
/** Texto plano de un campo HTML (Description y Repro Steps vienen en HTML). */
export function textoPlano(html: string): string {
  return String(html || '').replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
const ultimo = (ruta: string) => { const p = String(ruta || '').split(/\\|\//).map((x) => x.trim()).filter(Boolean); return p.length ? p[p.length - 1] : ''; };
const primero = (ruta: string) => String(ruta || '').split(/\\|\//).map((x) => x.trim()).filter(Boolean)[0] || '';

/**
 * Orden día/mes de las fechas numéricas de un fichero: Azure DevOps las escribe con el formato del perfil del usuario
 * ("10/12/2026 8:12 AM" en Estados Unidos, "12/10/2026 8:12" en España). Si algún primer número pasa de 12 es día;
 * si pasa el segundo, el mes va primero. Si no se puede saber, con AM/PM o cabeceras en inglés se toma mes/día.
 */
export function ordenFechas(valores: string[], ingles: boolean): 'dm' | 'md' {
  let primeroMayor = false, segundoMayor = false, ampm = false;
  for (const v of valores) {
    const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/.exec(v.trim());
    if (!m) continue;
    if (+m[1] > 12) primeroMayor = true;
    if (+m[2] > 12) segundoMayor = true;
    if (/\b[ap]\.?\s?m\.?$/i.test(v.trim())) ampm = true;
  }
  if (primeroMayor && !segundoMayor) return 'dm';
  if (segundoMayor && !primeroMayor) return 'md';
  return ampm || ingles ? 'md' : 'dm';
}
export function leerFechaAzure(s: string, orden: 'dm' | 'md'): Date | null {
  const v = String(s || '').trim();
  if (!v) return null;
  const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP])?\.?\s?[mM]?\.?)?$/.exec(v);
  if (!m) return leerFecha(v);
  const [a, b] = orden === 'md' ? [+m[2], +m[1]] : [+m[1], +m[2]];
  let y = +m[3]; if (y < 100) y += 2000;
  let h = +(m[4] || 0);
  const ap = m[7] ? m[7].toLowerCase() : null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return new Date(y, b - 1, a, h, +(m[5] || 0), +(m[6] || 0));
}

interface FilaAzure {
  clave: string; resumen: string; descripcion: string; criterios: string; tipoTxt: string; estado: string; motivo: string;
  area: string; iteracion: string; etiquetas: string[]; creada: Date | null; actualizada: Date | null; cerrada: Date | null;
  resuelta: Date | null; activada: Date | null; cambioEstado: Date | null; puntos: number | null; prioridad: string; equipo: string;
  padre: string; proyecto: string; enlaces: number;
}

const COLUMNAS_FECHA = ['creada', 'actualizada', 'cerrada', 'resuelta', 'activada', 'cambioEstado'];

export function leerAzure(ficheros: FicheroEntrada[]): Lectura {
  const informe: InformeIngesta = { plataforma: PLATAFORMA, ficheros: [], avisos: [], filasLeidas: 0, duplicadas: 0, epicas: 0, subtareas: 0, sinClave: 0, campos: {}, tareas: 0 };
  const porClave = new Map<string, FilaAzure>();
  let ordenUsado = 'dm' as 'dm' | 'md';
  ficheros.forEach((f) => {
    let filas: string[][];
    try { filas = leerCSV(f.texto || ''); } catch { informe.avisos.push({ tipo: 'error', texto: Tx('Could not read ', 'No se pudo leer ') + f.nombre + '.' }); return; }
    if (filas.length < 2) { informe.avisos.push({ tipo: 'error', texto: f.nombre + Tx(' has no work items.', ' no trae elementos de trabajo.') }); return; }
    const cab = filas[0], mapa = mapearColumnas(cab), n = filas.length - 1;
    if (mapa.clave == null) { informe.avisos.push({ tipo: 'error', texto: f.nombre + Tx(' has no ID column. It does not look like an Azure DevOps export.', ' no tiene columna ID. No parece un export de Azure DevOps.') }); return; }
    const conDatos = cab.map(() => false);
    for (let r = 1; r < filas.length; r++) for (let c = 0; c < cab.length; c++) if (!conDatos[c] && filas[r][c]) conDatos[c] = true;
    informe.ficheros.push({ nombre: f.nombre, filas: n, columnas: cab.length, columnasConDatos: conDatos.filter(Boolean).length });
    informe.filasLeidas += n;
    Object.keys(mapa).forEach((k) => { const idx = ([] as number[]).concat(mapa[k]); if (idx.some((i) => conDatos[i])) informe.campos[k] = true; else if (!informe.campos[k]) informe.campos[k] = 'vacio'; });
    if (mapa.activada == null) informe.avisos.push({ tipo: 'aviso', texto: f.nombre + Tx(' has no Activated Date column: lead time cannot be measured. Add it to the query columns.', ' no trae la columna Activated Date: no se puede medir el plazo. Añádela a las columnas de la consulta.') });
    const val = (fila: string[], campo: string) => { const i = mapa[campo]; return i == null || Array.isArray(i) ? '' : (fila[i] || '').trim(); };
    const titulos = Array.isArray(mapa.resumen) ? (mapa.resumen as number[]) : null;
    // Orden día/mes del fichero
    const muestras: string[] = [];
    for (let r = 1; r < filas.length && muestras.length < 4000; r++) COLUMNAS_FECHA.forEach((c) => { const v = val(filas[r], c); if (v) muestras.push(v); });
    const ingles = mapa.creada != null && norm(cab[mapa.creada as number]) === 'created date';
    const orden = ordenFechas(muestras, ingles); ordenUsado = orden;
    const fecha = (fila: string[], c: string) => leerFechaAzure(val(fila, c), orden);
    // En una consulta en árbol el padre es el último elemento del nivel anterior
    const ultimoPorNivel: string[] = [];
    for (let k = 1; k < filas.length; k++) {
      const fila = filas[k];
      const clave = val(fila, 'clave');
      if (!clave) { informe.sinClave++; continue; }
      let resumen = val(fila, 'resumen'), padre = val(fila, 'padre');
      if (titulos) {
        const nivel = titulos.findIndex((i) => (fila[i] || '').trim());
        resumen = nivel >= 0 ? fila[titulos[nivel]].trim() : '';
        if (nivel >= 0) { ultimoPorNivel[nivel] = clave; ultimoPorNivel.length = nivel + 1; if (!padre && nivel > 0) padre = ultimoPorNivel[nivel - 1] || ''; }
      }
      const p = val(fila, 'puntos').replace(',', '.');
      const t: FilaAzure = {
        clave, resumen,
        descripcion: textoPlano(val(fila, 'descripcion') || val(fila, 'pasos')), criterios: textoPlano(val(fila, 'criterios')),
        tipoTxt: val(fila, 'tipo'), estado: val(fila, 'estado'), motivo: val(fila, 'motivo'),
        area: val(fila, 'area'), iteracion: val(fila, 'iteracion'),
        etiquetas: val(fila, 'etiquetas').split(/;\s*/).map((x) => x.trim()).filter(Boolean),
        creada: fecha(fila, 'creada'), actualizada: fecha(fila, 'actualizada'), cerrada: fecha(fila, 'cerrada'), resuelta: fecha(fila, 'resuelta'),
        activada: fecha(fila, 'activada'), cambioEstado: fecha(fila, 'cambioEstado'),
        puntos: p !== '' && !isNaN(+p) ? +p : null, prioridad: val(fila, 'prioridad'), equipo: val(fila, 'equipo'),
        padre, proyecto: val(fila, 'proyecto'), enlaces: parseInt(val(fila, 'enlaces'), 10) || 0,
      };
      const previa = porClave.get(clave);
      if (previa) { informe.duplicadas++; if ((t.actualizada?.getTime() || 0) >= (previa.actualizada?.getTime() || 0)) porClave.set(clave, t); }
      else porClave.set(clave, t);
    }
  });

  const filas: (FilaAzure & { creada: Date; tipo: TipoTarea })[] = [];
  porClave.forEach((t) => {
    const tipo = tipoAzure(t.tipoTxt, !!t.padre);
    if (tipo === 'epica') { informe.epicas++; return; }
    if (tipo === 'subtarea') { informe.subtareas++; return; }
    if (!t.creada) return;
    filas.push({ ...t, creada: t.creada, tipo });
  });
  informe.tareas = filas.length;
  const orden: string[] = [];
  filas.forEach((t) => { if (t.estado && orden.indexOf(t.estado) < 0) orden.push(t.estado); });
  const estados: EstadoOrigen[] = orden.map((nombre) => ({ nombre, categoria: '' }));
  const mapeoPropuesto: Record<string, EstadoNormalizado> = {};
  estados.forEach((e) => { mapeoPropuesto[e.nombre] = proponerEstado(e.nombre, ''); });
  const sinRegla = estados.filter((e) => explicarEstado(e.nombre, '').por === 'defecto').map((e) => e.nombre);
  if (sinRegla.length) informe.avisos.push({ tipo: 'aviso', texto: Tx('States with no clear meaning, check the mapping: ', 'Estados sin un significado claro, revisa el mapeo: ') + sinRegla.join(', ') + '.' });

  const tareas: Tarea[] = filas.map((t) => {
    const est = t.estado ? mapeoPropuesto[t.estado] : 'pendiente';
    const hecho = etapaDe(est) === 'hecho';
    const removida = est === 'descartado';
    // Fecha de terminado: Closed Date; si no hay y el estado es de terminado, Resolved Date o el último cambio de estado
    const terminada = t.cerrada || ((hecho || removida) ? (t.resuelta || t.cambioEstado || t.actualizada) : null);
    const sprint = t.iteracion && ultimo(t.iteracion) !== primero(t.iteracion) ? ultimo(t.iteracion) : '';
    return {
      id: PLATAFORMA + ':' + t.clave, clave_origen: t.clave, plataforma: PLATAFORMA, tipo: t.tipo, tipo_origen: t.tipoTxt,
      titulo: t.resumen, descripcion: t.descripcion, estado_origen: t.estado, estado_normalizado: est,
      agrupadores: { equipo: t.equipo, area: ultimo(t.area), proyecto: t.proyecto || primero(t.area) || primero(t.iteracion), etiquetas: t.etiquetas[0] || '' },
      equipo_id: null, prioridad: prioridadAzure(t.prioridad), prioridad_origen: t.prioridad, estimacion: t.puntos,
      sprints: sprint ? [sprint] : [],
      fechas: {
        creada: t.creada, actualizada: t.actualizada,
        // Activated Date solo cuenta si es posterior a la creación y anterior al cierre
        empezada: t.activada && t.activada >= t.creada && (!terminada || t.activada <= terminada) ? t.activada : null,
        terminada, cambio_estado: t.cambioEstado, primera_respuesta: null,
      },
      historial_estados: [], tiempos_estado: [],
      descartada: !!(terminada && (removida || (t.motivo && esDescartada(t.motivo)))),
      reaperturas: null, etiquetas: t.etiquetas, enlaces: t.enlaces,
      tiene_criterios: !!t.criterios || tieneCriterios(t.descripcion),
      padre_id: t.padre || null, padre_titulo: '',
    };
  });
  // Título de la épica o feature padre, si está en el export
  const tituloDe = new Map<string, string>(); porClave.forEach((t) => tituloDe.set(t.clave, t.resumen));
  tareas.forEach((t) => { if (t.padre_id) t.padre_titulo = tituloDe.get(t.padre_id) || ''; });
  if (ficheros.length && informe.ficheros.length) informe.avisos.push({ tipo: 'aviso', texto: Tx('Dates read as ', 'Fechas leídas como ') + (ordenUsado === 'md' ? Tx('month/day', 'mes/día') : Tx('day/month', 'día/mes')) + Tx(' (from the date values in the file).', ' (por los valores de fecha del fichero).') });
  return { plataforma: PLATAFORMA, tareas, informe, estados, camposEquipo: CAMPOS_EQUIPO, mapeoPropuesto, detalle: { sprintsSoloActual: true, ordenFechas: ordenUsado, numeroFilas: informe.filasLeidas.toLocaleString(regional()) } };
}
