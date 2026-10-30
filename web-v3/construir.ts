// Construye la v3: un solo HTML, sin servidor y sin conexión.
//   TZ=Europe/Madrid node web-v3/construir.ts [carpeta]   (por defecto dist/EasyPerformance-v3)
// Lleva el núcleo empaquetado, la tipografía Ubuntu, los textos en castellano e inglés y los datos de ejemplo del banco B3.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(RAIZ, 'web-v3', 'src');
const FUENTES = join(RAIZ, 'web', 'src', 'fuentes');
const DEMO = join(RAIZ, 'datos-sinteticos', 'b3');
const leerJson = (...p: string[]) => JSON.parse(readFileSync(join(...p), 'utf8'));

/** Sin "</script" dentro de un bloque <script>. */
const seguro = (s: string) => s.replace(/<\/script/gi, '<\\/script');

function fuentes(): string {
  return [400, 500, 700].map((peso) => {
    const b64 = readFileSync(join(FUENTES, `ubuntu-latin-${peso}-normal.woff2`)).toString('base64');
    return `@font-face{font-family:"Ubuntu";font-style:normal;font-weight:${peso};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  }).join('\n');
}

/** Datos de ejemplo: equipos, FTE y costes del banco ficticio, más sus iniciativas y su contexto. */
function demoCliente(): string {
  const cliente = leerJson(DEMO, 'cliente', 'cliente.json');
  const dirIni = join(DEMO, 'cliente', 'iniciativas');
  const iniciativas = readdirSync(dirIni).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dirIni, f), 'utf8')));
  const contexto = JSON.parse(readFileSync(join(DEMO, 'cliente', 'contexto', 'contexto.json'), 'utf8'));
  const equiposInfo: Record<string, unknown> = {}, fte: Record<string, number> = {}, fteOrigen: Record<string, string> = {};
  for (const e of cliente.equipos.lista) {
    equiposInfo[e.nombre] = { tipo: e.tipo, proveedor: e.proveedor, area: e.area };
    if (e.fte.length) { fte[e.nombre] = e.fte[e.fte.length - 1].valor; fteOrigen[e.nombre] = e.fte[e.fte.length - 1].origen; }
  }
  // Costes inventados para la demo: coste interno cargado de un FTE y tarifa mensual de cada proveedor
  const COSTE_DEMO: Record<string, number> = { interno: 6500, 'Vendor North': 8200, 'Vendor South': 7400 };
  const coste: Record<string, number> = {};
  for (const e of cliente.equipos.lista) { const c = COSTE_DEMO[e.tipo === 'proveedor' ? e.proveedor : 'interno']; if (c) coste[e.nombre] = c; }
  return JSON.stringify({ nombre: 'Sample bank', sector: cliente.sector, equiposInfo, fte, fteOrigen, coste, iniciativas, contexto,
    preguntas: { objetivos: ['speed', 'quality', 'predictability'], trabajo: 'sprints', proveedores: true, coste: true, hecho: true } });
}

const JS = ['textos.js', 'puente.js', 'app.js', 'kit.js', 'vistas-analisis.js', 'vistas-gestion.js', 'onboarding.js', 'carpeta.js', 'cortes.js', 'asistente.js', 'arranque.js'];

export async function construir(destino = join(RAIZ, 'dist', 'EasyPerformance-v3')): Promise<string> {
  const r = await build({
    entryPoints: [join(SRC, 'nucleo-web.ts')], bundle: true, format: 'iife', write: false, target: 'es2019',
    minify: true, legalComments: 'none', logLevel: 'silent',
  });
  const demoCsv = readFileSync(join(DEMO, 'jira-b3.csv'), 'utf8');
  if (/<\/script/i.test(demoCsv)) throw new Error('El CSV de la demo contiene </script');
  const textos = { es: leerJson(SRC, 'textos.es.json'), en: leerJson(SRC, 'textos.en.json') };
  const piezas: Record<string, string> = {
    '/*ESTILOS*/': readFileSync(join(SRC, 'estilos.css'), 'utf8').replace('/*FUENTES*/', fuentes()),
    '/*DEMO*/': demoCsv,
    '/*DEMO_CLIENTE*/': seguro(demoCliente()),
    '/*NUCLEO*/': seguro(r.outputFiles[0].text),
    '/*TEXTOS*/': seguro('window.TEXTOS = ' + JSON.stringify(textos) + ';'),
    '/*APP*/': seguro(JS.map((f) => `// ---- ${f} ----\n` + readFileSync(join(SRC, f), 'utf8')).join('\n')),
  };
  let html = readFileSync(join(SRC, 'plantilla.html'), 'utf8');
  for (const [marca, contenido] of Object.entries(piezas)) {
    if (!html.includes(marca)) throw new Error('Falta la marca ' + marca);
    html = html.split(marca).join(contenido);
  }
  mkdirSync(destino, { recursive: true });
  const salida = join(destino, 'EasyPerformance.html');
  writeFileSync(salida, html);
  // Carpeta de trabajo del cliente: la misma que la v2, así una carpeta sirve para las dos
  const leeme: Record<string, string> = {
    exports: 'Exports de Jira con todos los campos, en CSV o Excel / Jira exports with all fields, as CSV or Excel.\n',
    configuracion: 'cliente.json: equipos, proveedores, áreas, FTE, estados e iniciativas / teams, vendors, areas, FTE, statuses and initiatives.\n',
    iniciativas: 'Un .json por iniciativa / One .json file per initiative.\n',
    contexto: 'contexto.json: resúmenes que escribe el consultor / summaries written by the consultant.\n',
    historico: 'Cortes de cifras agregadas por cada carga / Snapshots of aggregated figures for each load.\n',
    diagnostico: 'Paquetes de diagnóstico exportados / Exported diagnostic packages.\n',
  };
  for (const [sub, texto] of Object.entries(leeme)) { mkdirSync(join(destino, sub), { recursive: true }); writeFileSync(join(destino, sub, 'LEEME.txt'), texto); }
  const datosJs = join(destino, 'exports', 'datos.js');
  if (!existsSync(datosJs)) writeFileSync(datosJs, '// Filled by actualizar.ps1 with the CSV files of this folder. Empty until then.\nwindow.EASY_PERFORMANCE_EXPORTS = null;\n');
  for (const f of ['actualizar.ps1', 'actualizar.bat']) {
    const origen = join(RAIZ, 'web-v3', 'carpeta', f);
    if (existsSync(origen)) copyFileSync(origen, join(destino, f));
  }
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  construir(process.argv[2]).then((s) => console.log(`${s} (${Math.round(readFileSync(s).length / 1024)} KB)`));
}
