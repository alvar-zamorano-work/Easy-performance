// Variantes de un export con los fallos típicos de lo que manda un cliente, generadas en memoria a partir del
// export sintético. Reproducen la auditoría de noviembre de 2026 sin usar ningún dato de cliente.
// Las usan los tests del núcleo (tests/v3-robustez.test.ts) y la verificación en navegador (web-v3/verificar.mjs).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerCSV } from '../adaptadores/comun/csv.ts';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
export const ORIGINAL = join(RAIZ, 'datos-sinteticos', 'jira-ejemplo-completo-2026-10-12.csv');
/** Fecha fija de "hoy" para decidir qué es futuro, igual en cualquier día que se ejecuten las pruebas. */
export const HOY = '2026-10-20T12:00:00';

export interface Variante { nombre: string; que: string; ficheros: { nombre: string; texto: string }[] }

type Tabla = { cab: string[]; filas: string[][] };

function leer(): Tabla {
  const filas = leerCSV(readFileSync(ORIGINAL, 'utf8').replace(/^﻿/, ''));
  return { cab: filas[0], filas: filas.slice(1).filter((f) => f.some((x) => x)) };
}
const campo = (v: string) => (/[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
function escribir(t: Tabla, sep = ','): string {
  return [t.cab, ...t.filas].map((f) => f.map((v) => campo(v ?? '')).join(sep)).join('\r\n') + '\r\n';
}
const copia = (t: Tabla): Tabla => ({ cab: t.cab.slice(), filas: t.filas.map((f) => f.slice()) });
const col = (t: Tabla, n: string) => { const i = t.cab.indexOf(n); if (i < 0) throw new Error('Falta la columna ' + n); return i; };

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Fecha del sintético: "12/Oct/26 8:12 AM". */
function fechaJira(s: string): Date | null {
  const m = /^(\d{1,2})\/(\w{3})\/(\d{2}) (\d{1,2}):(\d{2}) (AM|PM)$/.exec(s.trim());
  if (!m) return null;
  let h = +m[4] % 12; if (m[6] === 'PM') h += 12;
  return new Date(2000 + +m[3], MESES.indexOf(m[2]), +m[1], h, +m[5]);
}
const dos = (n: number) => String(n).padStart(2, '0');
const jira = (d: Date) => { const h = d.getHours() % 12 || 12; return `${d.getDate()}/${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)} ${h}:${dos(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`; };
const eeuu = (d: Date) => { const h = d.getHours() % 12 || 12; return `${dos(d.getMonth() + 1)}/${dos(d.getDate())}/${d.getFullYear()} ${dos(h)}:${dos(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`; };
const espanol = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;

function fechas(t: Tabla, fn: (d: Date) => string): Tabla {
  const x = copia(t);
  ['Created', 'Updated', 'Resolved', 'Status category changed'].forEach((n) => {
    const i = col(x, n);
    x.filas.forEach((f) => { const d = fechaJira(f[i]); if (d) f[i] = fn(d); });
  });
  return x;
}

const ESTADOS_ALEMAN: Record<string, string> = { Done: 'Erledigt', 'To Do': 'Offen', 'In Progress': 'In Arbeit', 'In Review': 'In Prüfung', Blocked: 'Blockiert' };
const CABECERAS_CASTELLANO: Record<string, string> = {
  Summary: 'Resumen', 'Issue key': 'Clave de incidencia', 'Issue Type': 'Tipo de Incidencia', Status: 'Estado', Priority: 'Prioridad',
  Created: 'Creada', Updated: 'Actualizada', Resolved: 'Resuelta', Components: 'Componentes', Labels: 'Etiquetas', 'Custom field (Team)': 'Campo personalizado (Equipo)',
};

/** Equipo que empieza a trabajar tarde: solo conserva las tareas creadas en las últimas 7 semanas del export. */
export const EQUIPO_TARDIO = 'Datos';
/** Equipo con un cierre masivo en la última semana. */
export const EQUIPO_SALTO = 'Pagos';

export function variantes(): Record<string, Variante> {
  const o = leer();
  const v = (nombre: string, que: string, t: Tabla | Tabla[], sep = ','): Variante =>
    ({ nombre, que, ficheros: (Array.isArray(t) ? t : [t]).map((x, i, a) => ({ nombre: nombre + (a.length > 1 ? '-' + (i + 1) : '') + '.csv', texto: escribir(x, sep) })) });
  const out: Record<string, Variante> = {};
  out.original = v('original', 'Export sintético sin tocar', o);

  // Se lee igual
  const cas = copia(o); cas.cab = cas.cab.map((h) => CABECERAS_CASTELLANO[h] || h);
  out.castellano = v('castellano', 'Cabeceras de Jira en castellano', cas);
  out.fechasEEUU = v('fechas-eeuu', 'Fechas de EE. UU. (10/29/2026 12:16 PM)', fechas(o, eeuu));
  out.excelEspanol = v('excel-espanol', 'CSV guardado desde Excel en español: punto y coma y dd/mm/aaaa', fechas(o, espanol), ';');
  const orden = o.filas.slice().sort((a, b) => fechaJira(a[col(o, 'Created')])!.getTime() - fechaJira(b[col(o, 'Created')])!.getTime());
  const n = orden.length;
  out.solapados = v('solapados', 'Dos exports que se solapan', [{ cab: o.cab, filas: orden.slice(0, Math.round(n * 0.65)) }, { cab: o.cab, filas: orden.slice(Math.round(n * 0.45)) }]);

  // Fallos que antes pasaban en silencio
  const imp = copia(o), iRes = col(imp, 'Resolved'), iCre = col(imp, 'Created');
  const conRes = imp.filas.filter((f) => f[iRes]);
  conRes[0][iRes] = '1/Mar/31 10:00 AM';
  conRes[1][iCre] = '31/Dec/99 10:00 AM';
  out.fechaImposible = v('fecha-imposible', 'Un cierre en 2031 y una creación en 1999', imp);

  const may = copia(o), iEq = col(may, 'Custom field (Team)');
  may.filas.forEach((f, i) => { if (!f[iEq]) return; if (i % 3 === 0) f[iEq] = f[iEq].toUpperCase(); else if (i % 3 === 1) f[iEq] = '  ' + f[iEq] + ' '; });
  out.equiposMayusculas = v('equipos-mayusculas', 'Nombres de equipo con distinta capitalización y espacios', may);

  const ale = copia(o), iEst = col(ale, 'Status'), iCat = col(ale, 'Status category');
  ale.filas.forEach((f) => { f[iEst] = ESTADOS_ALEMAN[f[iEst]] || f[iEst]; f[iCat] = ''; });
  out.estadosAleman = v('estados-aleman', 'Estados en alemán y sin categoría de estado', ale);

  const abiertas = copia(o), iRes2 = col(abiertas, 'Resolved');
  abiertas.filas = abiertas.filas.filter((f) => !f[iRes2]);
  out.soloAbiertas = v('solo-abiertas', 'Solo trabajo abierto: ninguna tarea terminada', abiertas);

  const sinRes = copia(o), iRes3 = col(sinRes, 'Resolved');
  sinRes.cab.splice(iRes3, 1); sinRes.filas.forEach((f) => f.splice(iRes3, 1));
  out.sinResuelta = v('sin-resuelta', 'Sin la columna de fecha de terminado', sinRes);

  const corta = copia(o), iCre4 = col(corta, 'Created');
  const ultimas = orden.slice(-40);
  corta.filas = ultimas.map((f) => f.slice());
  out.unaSemana = v('una-semana', '40 filas de las últimas fechas', corta);
  void iCre4;

  const sinT = copia(o), iTis0 = col(sinT, 'Custom field ([CHART] Time in Status)');
  sinT.cab.splice(iTis0, 1); sinT.filas.forEach((f) => f.splice(iTis0, 1));
  out.sinTiempos = v('sin-tiempos', 'Sin el tiempo en cada estado (export con los campos actuales)', sinT);

  // Equipo que empieza tarde y equipo con un cierre masivo
  const tar = copia(o), iEq5 = col(tar, 'Custom field (Team)'), iCre5 = col(tar, 'Created'), iRes5 = col(tar, 'Resolved');
  const fin = Math.max(...tar.filas.map((f) => fechaJira(f[iCre5])!.getTime()));
  const corte = fin - 7 * 7 * 864e5;
  tar.filas = tar.filas.filter((f) => f[iEq5] !== EQUIPO_TARDIO || (fechaJira(f[iCre5])!.getTime() >= corte && (!f[iRes5] || fechaJira(f[iRes5])!.getTime() >= corte)));
  out.equipoTardio = v('equipo-tardio', 'Un equipo que empezó a trabajar 7 semanas antes del final del export', tar);

  const sal = copia(o), iEq6 = col(sal, 'Custom field (Team)'), iKey = col(sal, 'Issue key'), iSt = col(sal, 'Status'), iCat6 = col(sal, 'Status category'), iCre6 = col(sal, 'Created'), iRes6 = col(sal, 'Resolved'), iUpd = col(sal, 'Updated'), iTis = col(sal, 'Custom field ([CHART] Time in Status)'), iTipo = col(sal, 'Issue Type');
  const modelo = sal.filas.find((f) => f[iEq6] === EQUIPO_SALTO && f[iSt] === 'Done')!;
  const dia = new Date(fin - 2 * 864e5); dia.setHours(17, 0, 0, 0);
  for (let k = 0; k < 120; k++) {
    const f = modelo.slice();
    f[iKey] = 'LIMP-' + (k + 1); f[iTipo] = 'Task';
    const creada = new Date(dia.getTime() - (30 + k) * 864e5);
    const cerrada = new Date(dia.getTime() + k * 60e3 * 7);
    f[iCre6] = jira(creada); f[iRes6] = jira(cerrada); f[iUpd] = jira(cerrada); f[iCat6] = 'Done'; f[iTis] = '';
    sal.filas.push(f);
  }
  out.salto = v('salto', 'Un equipo cierra 120 tareas en un día al final del export (limpieza del tablero)', sal);

  // El mismo cierre masivo, pero 9 semanas antes del final: fuera de las semanas que se miden
  const fuera = copia(o); const diaF = new Date(fin - 63 * 864e5); diaF.setHours(10, 0, 0, 0);
  for (let k = 0; k < 40; k++) {
    const f = modelo.slice(); f[iKey] = 'VIEJA-' + (k + 1); f[iTipo] = 'Task';
    f[iCre6] = jira(new Date(diaF.getTime() - (30 + k) * 864e5)); f[iRes6] = jira(new Date(diaF.getTime() + k * 6e4 * 3)); f[iUpd] = f[iRes6]; f[iCat6] = 'Done'; f[iTis] = '';
    fuera.filas.push(f);
  }
  out.masivoFuera = v('masivo-fuera', 'Un cierre masivo de 40 tareas 9 semanas antes del final del export', fuera);

  // Un equipo sin ninguna tarea terminada en un export donde los demás sí entregan
  const sinEnt = copia(o), iEq7 = col(sinEnt, 'Custom field (Team)'), iSt7 = col(sinEnt, 'Status'), iCat7 = col(sinEnt, 'Status category'), iRes7 = col(sinEnt, 'Resolved');
  sinEnt.filas.forEach((f) => { if (f[iEq7] === EQUIPO_TARDIO) { f[iRes7] = ''; if (f[iSt7] === 'Done') { f[iSt7] = 'In Progress'; f[iCat7] = 'In Progress'; } } });
  out.equipoSinEntregas = v('equipo-sin-entregas', 'Un equipo sin ninguna tarea terminada; los demás entregan', sinEnt);
  return out;
}
