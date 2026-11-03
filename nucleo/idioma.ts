// Idioma de los textos que escribe el núcleo (avisos, motivos, comprobaciones, documentos). Inglés por defecto.
// La página lo fija con fijarIdioma al elegir idioma y vuelve a calcular. Los tests de la v2 siguen en inglés.

import { aplicarIdiomaCatalogo } from './catalogo.ts';

export type Idioma = 'es' | 'en';
let actual: Idioma = 'en';

/** Fija el idioma del núcleo y del catálogo. Lo calculado antes no cambia: hay que volver a calcular. */
export function fijarIdioma(i: Idioma): void { actual = i === 'es' ? 'es' : 'en'; aplicarIdiomaCatalogo(actual); }
export function idioma(): Idioma { return actual; }
/** El texto en el idioma actual: Tx('inglés', 'castellano'). */
export const Tx = (en: string, es: string): string => (actual === 'es' ? es : en);
/** Configuración regional para números y fechas. */
export const regional = (): string => (actual === 'es' ? 'es-ES' : 'en-GB');
