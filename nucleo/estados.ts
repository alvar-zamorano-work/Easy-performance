// Estados: propuesta de estado normalizado a partir del nombre de origen, con las reglas de catalogo/estados.json.

import { norm } from './util.ts';
import { CATALOGO, type CatalogoEstados } from './catalogo.ts';
import type { Etapa, EstadoNormalizado } from './modelo.ts';

const compiladas = new WeakMap<CatalogoEstados, { reglas: { estado: EstadoNormalizado; re: RegExp; cat: RegExp | null }[]; cats: { estado: EstadoNormalizado; re: RegExp }[] }>();

function reglasDe(cat: CatalogoEstados) {
  let c = compiladas.get(cat);
  if (!c) {
    c = {
      reglas: cat.reglas.map((r) => ({ estado: r.estado, re: new RegExp(r.patron), cat: r.categoria ? new RegExp(r.categoria) : null })),
      cats: cat.porCategoria.map((r) => ({ estado: r.estado, re: new RegExp(r.patron) })),
    };
    compiladas.set(cat, c);
  }
  return c;
}

/** Por qué se propone un estado: por su nombre, por la categoría de la plataforma o por defecto (conviene revisarlo). */
export type MotivoPropuesta = 'nombre' | 'categoria' | 'defecto';

export function explicarEstado(nombre: unknown, categoria: unknown, cat: CatalogoEstados = CATALOGO.estados): { estado: EstadoNormalizado; por: MotivoPropuesta } {
  const n = norm(nombre), c = norm(categoria), r = reglasDe(cat);
  for (const regla of r.reglas) if (regla.re.test(n) && (!regla.cat || regla.cat.test(c))) return { estado: regla.estado, por: 'nombre' };
  for (const regla of r.cats) if (regla.re.test(c)) return { estado: regla.estado, por: 'categoria' };
  return { estado: cat.porDefecto, por: 'defecto' };
}

/** Estado normalizado propuesto para un estado de origen, con su categoría de estado si la plataforma la da. */
export function proponerEstado(nombre: unknown, categoria: unknown, cat: CatalogoEstados = CATALOGO.estados): EstadoNormalizado {
  return explicarEstado(nombre, categoria, cat).estado;
}

export function etapaDe(estado: EstadoNormalizado, cat: CatalogoEstados = CATALOGO.estados): Etapa {
  return cat.estados[estado].etapa;
}

export function esBloqueado(estado: EstadoNormalizado): boolean {
  return estado === 'bloqueado';
}

/**
 * Convierte el mapeo de la v0 (estado -> etapa) al mapeo normalizado. Sirve para leer cliente.json de la v0.
 * Para "espera" se usa la propuesta si ya es un estado de espera; si no, "en_espera".
 */
export function etapasV0AMapeo(etapas: Record<string, Etapa>, propuesto: Record<string, EstadoNormalizado>): Record<string, EstadoNormalizado> {
  const out: Record<string, EstadoNormalizado> = {};
  Object.keys(etapas).forEach((nombre) => {
    const etapa = etapas[nombre], p = propuesto[nombre];
    if (p && etapaDe(p) === etapa) out[nombre] = p;
    else out[nombre] = ({ pendiente: 'pendiente', curso: 'en_curso', espera: 'en_espera', hecho: 'terminado' } as const)[etapa];
  });
  return out;
}
