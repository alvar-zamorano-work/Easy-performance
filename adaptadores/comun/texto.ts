// Señales de texto comunes a todas las plataformas. El texto se lee en memoria y nunca sale de aquí.

import { norm } from '../../nucleo/util.ts';

/** ¿La descripción trae criterios de aceptación reconocibles? En B3 se afina con la rúbrica de agent readiness. */
export function tieneCriterios(descripcion: string): boolean {
  if (!descripcion) return false;
  const n = norm(descripcion);
  if (/criterios? de aceptacion|acceptance criteria|definition of done|definicion de hecho/.test(n)) return true;
  if (/\b(dado|given)\b[\s\S]{0,300}\b(cuando|when)\b[\s\S]{0,300}\b(entonces|then)\b/.test(n)) return true;
  if (/(^|\n)\s*(- )?\[( |x)\]/.test(n)) return true;
  return false;
}
