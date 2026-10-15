// Prueba de escala: multiplica el export sintético de B3 (4 equipos, un año) para simular muchos equipos
// y mide cuánto tarda el recorrido completo (lectura del CSV, detección y diagnóstico).
//   TZ=Europe/Madrid node herramientas/prueba-escala.ts 10 25 50
// Cada copia renombra claves de tarea y equipos, así que son equipos distintos con el mismo patrón de trabajo.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerCSV } from '../adaptadores/comun/csv.ts';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import type { ClienteV2 } from '../nucleo/cliente.ts';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(RAIZ, 'datos-sinteticos', 'b3');
const csv = readFileSync(join(DIR, 'jira-b3.csv'), 'utf8');
const base: ClienteV2 = JSON.parse(readFileSync(join(DIR, 'cliente', 'cliente.json'), 'utf8'));

const q = (v: string) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

function multiplicar(copias: number) {
  const filas = leerCSV(csv) as string[][];
  const cab = filas[0], datos = filas.slice(1).filter((f) => f.length > 1);
  const iClave = cab.indexOf('Issue key'), iId = cab.indexOf('Issue id'), iEq = cab.indexOf('Custom field (Team)'), iComp = cab.indexOf('Components'), iPadre = cab.indexOf('Parent key');
  const salida: string[] = [cab.map(q).join(',')];
  for (let k = 0; k < copias; k++) {
    for (const f of datos) {
      const g = f.slice();
      const sufijo = (v: string) => (v ? v.replace(/^([A-Z]+)-/, '$1' + k + '-') : v);
      g[iClave] = sufijo(g[iClave]); if (iPadre >= 0) g[iPadre] = sufijo(g[iPadre]);
      g[iId] = String(1000000 * (k + 1) + Number(g[iId] || 0));
      if (g[iEq]) g[iEq] = g[iEq] + ' ' + (k + 1);
      if (g[iComp]) g[iComp] = g[iComp] + ' ' + (k + 1);
      salida.push(g.map(q).join(','));
    }
  }
  const equipos = base.equipos.lista.flatMap((e) => Array.from({ length: copias }, (_, k) => ({ ...e, id: e.id + k, nombre: e.nombre + ' ' + (k + 1) })));
  return { texto: salida.join('\n'), filas: salida.length - 1, cliente: { ...base, equipos: { ...base.equipos, lista: equipos } } as ClienteV2 };
}

for (const copias of process.argv.slice(2).map(Number)) {
  const m = multiplicar(copias);
  const t0 = performance.now();
  const lectura = leerJira([{ nombre: 'escala.csv', texto: m.texto }]);
  const t1 = performance.now();
  const r = diagnosticar(lectura, m.cliente, [], null);
  const t2 = performance.now();
  const mb = Buffer.byteLength(m.texto) / 1048576;
  console.log(JSON.stringify({
    equipos: r.modelo.equipos.length, tareas: lectura.tareas.length, filas: m.filas, csv_mb: +mb.toFixed(1),
    lectura_s: +((t1 - t0) / 1000).toFixed(1), calculo_s: +((t2 - t1) / 1000).toFixed(1), total_s: +((t2 - t0) / 1000).toFixed(1),
    memoria_mb: Math.round(process.memoryUsage().heapUsed / 1048576),
  }));
}
