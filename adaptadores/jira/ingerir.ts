// Adaptador Jira CSV (v0): une uno o varios exports y se queda con la versión más reciente de cada tarea.
// Quita épicas y subtareas del cálculo. No lee responsables, creadores ni comentarios.

import { leerCSV } from '../comun/csv.ts';
import { mapearColumnas } from './columnas.ts';
import { leerFecha } from './fechas.ts';
import { norm } from '../../nucleo/util.ts';
import type { FicheroEntrada, InformeIngesta, Tarea, TareaLeida, TipoTarea } from '../../nucleo/tipos.ts';

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
  return /highest|critic|blocker|bloque|maxim|urgent|muy alta|^p0\b|^p1\b/.test(norm(p));
}

export function esDescartada(r: unknown): boolean {
  return /won.?t|duplicat|duplicad|cannot|can.?t reproduce|no se (hara|puede)|declin|rechaz|obsolet|descart|invalid/.test(norm(r));
}

export function ingerir(ficheros: FicheroEntrada[]): { tareas: Tarea[]; informe: InformeIngesta } {
  const informe: InformeIngesta = { ficheros: [], avisos: [], filasLeidas: 0, duplicadas: 0, epicas: 0, subtareas: 0, sinClave: 0, campos: {} };
  const porClave = new Map<string, TareaLeida>();
  ficheros.forEach((f) => {
    let filas: string[][];
    try { filas = leerCSV(f.texto || ''); } catch (e) { informe.avisos.push({ tipo: 'error', texto: 'No se pudo leer ' + f.nombre + '.' }); return; }
    if (filas.length === 1) { informe.avisos.push({ tipo: 'aviso', texto: f.nombre + ' solo tiene la fila de títulos: no trae tareas.' }); return; }
    if (filas.length < 1) { informe.avisos.push({ tipo: 'error', texto: f.nombre + ' está vacío o no es un CSV.' }); return; }
    const cab = filas[0], mapa = mapearColumnas(cab), n = filas.length - 1;
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
      const tipoTxt = val(fila, 'tipo'), prioridad = val(fila, 'prioridad'), resolucion = val(fila, 'resolucion');
      const resuelta = leerFecha(val(fila, 'resuelta'));
      const t: TareaLeida = {
        clave,
        resumen: val(fila, 'resumen'),
        tipoTxt,
        estado: val(fila, 'estado'),
        categoria: val(fila, 'categoria'),
        creada: leerFecha(val(fila, 'creada')),
        actualizada: leerFecha(val(fila, 'actualizada')),
        resuelta,
        resolucion,
        prioridad,
        componentes: vals(fila, 'componentes'),
        etiquetas: vals(fila, 'etiquetas'),
        sprints: vals(fila, 'sprint'),
        puntos: null,
        equipoCampo: val(fila, 'equipo'),
        proyecto: val(fila, 'proyecto'),
        padre: val(fila, 'padre'),
        tis: [],
        primera: leerFecha(val(fila, 'primera')),
        cambioCategoria: leerFecha(val(fila, 'cambioCategoria')),
        tipo: tipoDe(tipoTxt),
        urgente: esUrgente(prioridad),
        descartada: !!(resuelta && resolucion && esDescartada(resolucion)),
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
  const tareas: Tarea[] = [];
  porClave.forEach((t) => {
    if (t.tipo === 'epica') { informe.epicas++; return; }
    if (t.tipo === 'subtarea') { informe.subtareas++; return; }
    if (!t.creada) return;
    tareas.push(t as Tarea);
  });
  informe.tareas = tareas.length;
  return { tareas, informe };
}
