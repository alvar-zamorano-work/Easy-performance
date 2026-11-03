// Las mismas tareas escritas como cada tipo de export de Jira que nos puede llegar. Parten del export sintético con
// algunos valores múltiples añadidos (dos etiquetas, dos componentes, enlaces), para que el contrato de campos
// (tests/v3-campos.test.ts) compruebe que cada campo llega igual al modelo venga del formato que venga.
// Ningún dato de cliente: solo los nombres de columna y las convenciones de cada formato.

import { readFileSync } from 'node:fs';
import { leerCSV } from '../adaptadores/comun/csv.ts';
import { ORIGINAL } from './variantes.ts';

type Tabla = { cab: string[]; filas: string[][] };

/** Campos del modelo que cada formato trae (los que no trae no se comparan). */
export type CampoContrato = 'tipo' | 'estado' | 'creada' | 'actualizada' | 'terminada' | 'cambio_estado' | 'primera' | 'sprints' | 'etiquetas'
  | 'equipo' | 'componentes' | 'estimacion' | 'epica' | 'prioridad' | 'descartada' | 'enlaces' | 'tiempos';
export const TODOS_LOS_CAMPOS: CampoContrato[] = ['tipo', 'estado', 'creada', 'actualizada', 'terminada', 'cambio_estado', 'primera', 'sprints', 'etiquetas',
  'equipo', 'componentes', 'estimacion', 'epica', 'prioridad', 'descartada', 'enlaces', 'tiempos'];

export interface Formato { nombre: string; que: string; texto: string; html: boolean; lleva: CampoContrato[] }

const campoCsv = (v: string) => (/[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const csv = (t: Tabla) => [t.cab, ...t.filas].map((f) => f.map((v) => campoCsv(v ?? '')).join(',')).join('\r\n') + '\r\n';
const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Tareas de partida: el sintético con dos etiquetas, dos componentes y enlaces en algunas tareas. */
export function base(): Tabla {
  const filas = leerCSV(readFileSync(ORIGINAL, 'utf8').replace(/^﻿/, ''));
  const cab = filas[0].slice(), datos = filas.slice(1).filter((f) => f.some((x) => x)).map((f) => f.slice());
  const i = (n: string) => cab.indexOf(n);
  // Segunda columna de etiquetas y de componentes, y una de enlaces (así los trae Jira Cloud)
  cab.push('Labels', 'Components', 'Outward issue link (Blocks)');
  datos.forEach((f, k) => {
    f.push(k % 5 === 0 ? 'calidad' : '', k % 7 === 0 ? (f[i('Components')] === 'Web' ? 'API' : 'Web') : '', k % 6 === 0 && datos[k + 1] ? datos[k + 1][i('Issue key')] : '');
    // Algunas terminadas como descartadas (no cuentan como entrega)
    if (k % 40 === 0 && f[i('Resolution')] === 'Done') f[i('Resolution')] = "Won't Do";
    // Cada etiqueta en su columna: la primera vacía y la segunda llena también vale
    if (k % 5 === 0 && !f[i('Labels')]) { f[i('Labels')] = f[f.length - 3]; f[f.length - 3] = ''; }
  });
  return { cab, filas: datos };
}

const renombrar = (t: Tabla, nombres: Record<string, string>): Tabla => ({ cab: t.cab.map((h) => nombres[h] ?? h), filas: t.filas });
const quitar = (t: Tabla, nombres: string[]): Tabla => {
  const fuera = new Set(t.cab.map((h, i) => (nombres.includes(h) ? i : -1)).filter((i) => i >= 0));
  return { cab: t.cab.filter((_, i) => !fuera.has(i)), filas: t.filas.map((f) => f.filter((_, i) => !fuera.has(i))) };
};
/** Junta en una celda, separados por ", ", los valores de todas las columnas que se llaman igual (así exporta el Excel de Server / Data Center). */
function juntar(t: Tabla, nombre: string, nuevo = nombre): Tabla {
  const idx = t.cab.map((h, i) => (h === nombre ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return t;
  const resto = (f: string[]) => f.filter((_, i) => !idx.includes(i));
  return { cab: [...resto(t.cab), nuevo], filas: t.filas.map((f) => [...resto(f), idx.map((i) => f[i]).filter(Boolean).join(', ')]) };
}

export function formatos(): Record<string, Formato> {
  const b = base();
  const i = (t: Tabla, n: string) => t.cab.indexOf(n);
  const out: Record<string, Formato> = {};
  const todos: CampoContrato[] = TODOS_LOS_CAMPOS;

  out.cloudCsv = { nombre: 'cloud.csv', que: 'Jira Cloud, CSV con todos los campos (una columna por valor)', texto: csv(b), html: false, lleva: todos };

  // Jira Cloud desde 2025: "work item" en lugar de "issue"
  out.cloudWorkItem = { nombre: 'cloud-work-item.csv', que: 'Jira Cloud con los nombres nuevos ("Work item key", "Work type")', html: false, lleva: todos,
    texto: csv(renombrar(b, { 'Issue key': 'Work item key', 'Issue id': 'Work item id', 'Issue Type': 'Work type' })) };

  out.cloudCastellano = { nombre: 'cloud-es.csv', que: 'Jira Cloud con la interfaz en castellano', html: false, lleva: todos,
    texto: csv(renombrar(b, {
      Summary: 'Resumen', 'Issue key': 'Clave de incidencia', 'Issue id': 'ID de la incidencia', 'Issue Type': 'Tipo de Incidencia', Status: 'Estado', Priority: 'Prioridad',
      Resolution: 'Resolución', Created: 'Creada', Updated: 'Actualizada', Resolved: 'Resuelta', Components: 'Componentes', Labels: 'Etiquetas', Description: 'Descripción',
      'Custom field (Story Points)': 'Campo personalizado (Puntos de historia)', 'Custom field (Team)': 'Campo personalizado (Equipo)',
      'Custom field ([CHART] Date of First Response)': 'Campo personalizado ([CHART] Fecha de primera respuesta)', 'Custom field ([CHART] Time in Status)': 'Campo personalizado ([CHART] Tiempo en estado)',
      'Parent key': 'Clave del principal', 'Parent summary': 'Resumen del principal', 'Status category': 'Categoría de estado', 'Status category changed': 'Cambio de categoría de estado',
      'Outward issue link (Blocks)': 'Vínculo de incidencia saliente (Blocks)',
    })) };

  // Jira Server / Data Center, CSV: la épica en "Epic Link" con la clave; sin categoría de estado
  const dc = (() => {
    let t = { cab: b.cab.slice(), filas: b.filas.map((f) => f.slice()) };
    const iTipo = i(t, 'Issue Type'), iPk = i(t, 'Parent key');
    t.cab.push('Custom field (Epic Link)'); t.filas.forEach((f) => f.push(f[iTipo] === 'Epic' ? '' : f[iPk]));
    t = quitar(t, ['Parent', 'Parent key', 'Parent summary', 'Status category', 'Status category changed']);
    return t;
  })();
  out.dcCsv = { nombre: 'dc.csv', que: 'Jira Server / Data Center, CSV (épica en Epic Link con su clave)', texto: csv(dc), html: false, lleva: todos.filter((c) => c !== 'cambio_estado') };

  // Jira Server / Data Center, "Excel" (una tabla HTML con extensión .xls): valores múltiples en una celda, épica por su nombre,
  // enlaces en "Linked Issues", el campo Team del sistema con "None" y el equipo en otra columna, y filas de título y de pie
  const xl = (() => {
    let t = { cab: b.cab.slice(), filas: b.filas.map((f) => f.slice()) };
    const iTipo = i(t, 'Issue Type'), iPs = i(t, 'Parent summary'), iRes = i(t, 'Summary'), iLink = i(t, 'Outward issue link (Blocks)');
    t.cab.push('Epic Link', 'Epic Name', 'Linked Issues', 'Team');
    t.filas.forEach((f) => f.push(f[iTipo] === 'Epic' ? '' : f[iPs], f[iTipo] === 'Epic' ? f[iRes] : '', f[iLink], 'None'));
    t = quitar(t, ['Parent', 'Parent key', 'Parent summary', 'Status category', 'Status category changed', 'Outward issue link (Blocks)']);
    t = renombrar(t, { 'Issue key': 'Key', Components: 'Component/s', 'Custom field (Story Points)': 'Story Points', 'Custom field (Team)': 'Assigned Team',
      'Custom field ([CHART] Time in Status)': '[CHART] Time in Status', 'Custom field ([CHART] Date of First Response)': '[CHART] Date of First Response' });
    t = juntar(juntar(juntar(t, 'Sprint'), 'Labels'), 'Component/s');
    return t;
  })();
  const filasHtml = (f: string[]) => '<tr>' + f.map((v) => '<td>' + escHtml(v ?? '') + '</td>').join('') + '</tr>';
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><title>Jira</title></head><body>
<table><tr><td colspan="${xl.cab.length}">Displaying ${xl.filas.length} issues at 12/Oct/26 9:00 AM.</td></tr></table>
<table id="issuetable"><tr>${xl.cab.map((h) => '<th>' + escHtml(h) + '</th>').join('')}</tr>
${xl.filas.map(filasHtml).join('\n')}
</table><table><tr><td>Generated at Mon Oct 12 09:00:00 CEST 2026 by Jira.</td></tr></table></body></html>`;
  out.dcExcel = { nombre: 'dc-excel.xls', que: 'Jira Server / Data Center, "Excel" (tabla HTML): varios valores por celda, épica por su nombre', texto: html, html: true,
    lleva: todos.filter((c) => c !== 'cambio_estado') };
  return out;
}
