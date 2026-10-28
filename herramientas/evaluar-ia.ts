// Eval de la IA con el proveedor real sobre los tres paquetes sintéticos (B3, fallos, aseguradora).
//   ANTHROPIC_API_KEY=... TZ=Europe/Madrid node herramientas/evaluar-ia.ts [modelo]
// La clave se lee solo de la variable de entorno; no se imprime ni se guarda. Cada paquete cuesta una llamada.
// Comprueba: respuesta válida, recomendaciones que pasan el validador, y casos sembrados (los que activa el
// banco de casos) citados por la IA. Imprime un resumen y sale con código 1 si algún paquete falla del todo.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { diagnosticar } from '../nucleo/diagnostico.ts';
import { evaluarPaquete, proveedorAnthropic, recomendacionesDeReferencia, MODELO_POR_DEFECTO } from '../nucleo/ia.ts';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const clave = process.env.ANTHROPIC_API_KEY;
if (!clave) { console.error('Set ANTHROPIC_API_KEY in the environment (never in the code).'); process.exit(2); }
const modelo = process.argv[2] || MODELO_POR_DEFECTO;
const proveedor = proveedorAnthropic({ clave, modelo, navegador: false });

const PAQUETES = [
  { nombre: 'b3', csv: 'jira-b3.csv' },
  { nombre: 'fallos', csv: 'jira-con-fallos.csv' },
  { nombre: 'aseguradora', csv: 'jira-aseguradora.csv' },
];

let fallos = 0;
for (const p of PAQUETES) {
  const dir = join(RAIZ, 'datos-sinteticos', p.nombre);
  if (!existsSync(join(dir, p.csv))) { console.log(`${p.nombre}: no dataset, skipped`); continue; }
  const leer = (...x: string[]) => readFileSync(join(dir, ...x), 'utf8');
  const cliente = JSON.parse(leer('cliente', 'cliente.json'));
  const dirIni = join(dir, 'cliente', 'iniciativas');
  const iniciativas = existsSync(dirIni) ? readdirSync(dirIni).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(leer('cliente', 'iniciativas', f))) : [];
  const ctx = join(dir, 'cliente', 'contexto', 'contexto.json');
  const contexto = existsSync(ctx) ? JSON.parse(readFileSync(ctx, 'utf8')) : null;
  const lectura = leerJira([{ nombre: p.csv, texto: leer(p.csv) }]);
  const r = diagnosticar(lectura, cliente, iniciativas, contexto, { generado: new Date() });
  const esperados = [...new Set(recomendacionesDeReferencia(r.paquete).map((x) => x.causa.caso!))];
  const t0 = Date.now();
  try {
    const ev = await evaluarPaquete(proveedor, r.paquete, esperados);
    const ok = ev.recomendaciones.length > 0 && ev.faltan.length <= Math.floor(esperados.length / 2);
    if (!ok) fallos++;
    console.log(`${p.nombre}: ${ok ? 'OK' : 'FAIL'} · ${ev.recomendaciones.length} valid, ${ev.descartadas.length} discarded · seeded cases found ${ev.encontrados.length}/${esperados.length}${ev.faltan.length ? ' (missing: ' + ev.faltan.join(', ') + ')' : ''} · ${Math.round((Date.now() - t0) / 100) / 10}s`);
    for (const d of ev.descartadas) console.log(`   discarded: ${d.motivo}`);
    for (const x of ev.recomendaciones) console.log(`   · [${x.confianza}] ${x.titulo} (${x.equipos.join(', ')})${x.causa.caso ? ' <- ' + x.causa.caso : ''}`);
    for (const pr of ev.problemas) console.log(`   note: ${pr}`);
  } catch (e) {
    fallos++;
    console.log(`${p.nombre}: ERROR ${(e as Error).message}`);
  }
}
process.exit(fallos ? 1 : 0);
