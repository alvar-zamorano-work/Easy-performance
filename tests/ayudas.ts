// Ayudas de los tests: lectura de CSV, motor de referencia de la v0 y normalización a JSON.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { FicheroEntrada } from '../nucleo/tipos.ts';

// fileURLToPath y no .pathname: la carpeta tiene espacios ("producto dashboard").
export const RAIZ = fileURLToPath(new URL('..', import.meta.url));
export const SINTETICOS = join(RAIZ, 'datos-sinteticos');
export const PRUEBA = join(RAIZ, 'datos-prueba');

if (process.env.TZ !== 'Europe/Madrid') {
  throw new Error('Los tests se ejecutan con TZ=Europe/Madrid (npm test ya lo pone).');
}

export function fichero(ruta: string): FicheroEntrada {
  return { nombre: basename(ruta), texto: readFileSync(ruta, 'utf8') };
}

/** Motor de la v0, copiado sin cambios en tests/referencia-v0. Es la referencia de resultados. */
export interface MotorV0 {
  ingerir: (f: FicheroEntrada[]) => { tareas: unknown[]; informe: unknown };
  detectar: (t: unknown[], i: unknown) => any;
  calcular: (t: unknown[], d: unknown, cfg: unknown) => any;
}
export const motorV0: MotorV0 = createRequire(import.meta.url)('./referencia-v0/motor.js');

/** Convierte a JSON y vuelve: fechas a texto, sin undefined. Así se comparan v0 y núcleo nuevo. */
export function json<T>(x: T): unknown {
  return JSON.parse(JSON.stringify(x));
}

export interface Escenario { nombre: string; rutas: string[] }

export function escenarios(): Escenario[] {
  const s = (n: string) => join(SINTETICOS, n);
  const lista: Escenario[] = [
    { nombre: 'sintético completo', rutas: [s('jira-ejemplo-completo-2026-10-12.csv')] },
    { nombre: 'sintético parte A', rutas: [s('jira-2026-10-12-parte-a.csv')] },
    { nombre: 'sintético abril', rutas: [s('jira-2026-04-06.csv')] },
    { nombre: 'sintético parte A + abril (unión)', rutas: [s('jira-2026-10-12-parte-a.csv'), s('jira-2026-04-06.csv')] },
  ];
  if (existsSync(PRUEBA)) {
    readdirSync(PRUEBA).filter((n) => n.toLowerCase().endsWith('.csv')).sort()
      .forEach((n) => lista.push({ nombre: 'prueba ' + n, rutas: [join(PRUEBA, n)] }));
  }
  return lista;
}

import { leerJira } from '../adaptadores/jira/ingerir.ts';
import { detectar } from '../nucleo/detectar.ts';
import { calcular } from '../nucleo/calcular.ts';
import type { ConfigCalculo } from '../nucleo/tipos.ts';

/** Recorrido completo con el núcleo nuevo: adaptador Jira, detección y cálculo. */
export function recorrido(ficheros: FicheroEntrada[], cfg: ConfigCalculo = {}) {
  const lectura = leerJira(ficheros);
  const det = detectar(lectura);
  return { lectura, det, modelo: calcular(lectura.tareas, det, cfg) };
}
