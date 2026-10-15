// Validación con los esquemas JSON de esquemas/. La usan los tests y las herramientas;
// la carcasa web la usará al cargar cliente.json, iniciativas y contexto (B5).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020Mod from 'ajv/dist/2020.js';
import addFormatsMod from 'ajv-formats';

const Ajv2020 = Ajv2020Mod as unknown as typeof Ajv2020Mod.default;
const addFormats = addFormatsMod as unknown as typeof addFormatsMod.default;

const DIR = fileURLToPath(new URL('.', import.meta.url));
const BASE = 'https://easy-performance/esquemas/';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const sub of ['modelo', 'catalogo']) {
  for (const f of readdirSync(join(DIR, sub)).filter((n) => n.endsWith('.schema.json')).sort()) {
    ajv.addSchema(JSON.parse(readFileSync(join(DIR, sub, f), 'utf8')));
  }
}

export type NombreEsquema =
  | 'modelo/tarea' | 'modelo/equipo' | 'modelo/iniciativa' | 'modelo/contexto' | 'modelo/cliente'
  | 'catalogo/medidas' | 'catalogo/casos' | 'catalogo/objetivos' | 'catalogo/textos' | 'catalogo/vistas' | 'catalogo/estados';

export interface ResultadoValidacion { valido: boolean; errores: string[] }

/** Valida un valor ya en forma JSON (fechas como texto ISO). */
export function validar(esquema: NombreEsquema, valor: unknown): ResultadoValidacion {
  const fn = ajv.getSchema(BASE + esquema + '.schema.json');
  if (!fn) throw new Error('No existe el esquema ' + esquema);
  const valido = fn(valor) as boolean;
  const errores = (fn.errors || []).map((e) => `${e.instancePath || '(raíz)'} ${e.message}${e.params && 'additionalProperty' in e.params ? ': ' + e.params.additionalProperty : ''}`);
  return { valido, errores };
}
