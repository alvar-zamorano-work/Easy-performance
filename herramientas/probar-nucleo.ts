// Resumen legible del núcleo con uno o varios exports: npm run probar, o
// TZ=Europe/Madrid node herramientas/probar-nucleo.ts fichero1.csv [fichero2.csv ...]

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CATALOGO, calcular, detectar, formatear, leerJira } from '../nucleo/index.ts';

const ficheros = process.argv.slice(2).map((p) => ({ nombre: basename(p), texto: readFileSync(p, 'utf8') }));
if (!ficheros.length) { console.error('Indica al menos un CSV.'); process.exit(1); }
const t0 = Date.now();
const lectura = leerJira(ficheros);
const { tareas, informe } = lectura;
const det = detectar(lectura);
const t1 = Date.now();
const modelo = calcular(tareas, det, {});
const t2 = Date.now();
const f = formatear;
console.log(`Lectura ${t1 - t0} ms; cálculo ${t2 - t1} ms`);
console.log(`Ficheros ${informe.ficheros.length}; filas ${informe.filasLeidas}; repetidas ${informe.duplicadas}; tareas ${informe.tareas}; épicas ${informe.epicas}`);
console.log(`Equipos por: ${det.equipoRecomendado}; estados: ${det.estados.map((e) => `${e.nombre}=${e.estado}`).join(', ')}`);
const avisos = [...informe.avisos, ...det.avisos];
if (avisos.length) console.log('Avisos: ' + avisos.map((a) => a.texto).join(' | '));
const ids = ['ciclo', 'entregas', 'espera', 'wip', 'pendiente', 'errores', 'retrabajo', 'arrastradas', 'regularidad', 'estimacion', 'primera', 'edad'];
for (const eq of modelo.equipos) {
  console.log(`\n${eq.nombre}: ${eq.n} tareas, ${eq.semanasConDatos} semanas con datos`);
  console.log('  ' + ids.map((id) => {
    const m = eq.medidas[id];
    return `${id}=${m.disponible ? f(m.valor, CATALOGO.medidas[id]?.formato) + ' [' + m.estado + ']' : 'n/d'}`;
  }).join('  '));
  console.log('  casos: ' + (eq.casos.map((c) => `${c.id} (${c.gravedad})`).join(', ') || 'ninguno'));
}
