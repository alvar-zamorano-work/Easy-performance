// Etapa propuesta para cada estado (pendiente, en curso, en espera, hecho) a partir de su nombre.
// En B2 pasa a catalogo/estados.json con los estados normalizados del plan.

import { norm } from './util.ts';
import type { Etapa } from './tipos.ts';

const CLAVES_ETAPA: [Etapa, RegExp][] = [
  ['hecho', /\b(done|hecho|hecha|finaliz|cerrad|closed|resolved|resuelt|complet|terminad|released|desplegad|entregad)/],
  ['espera', /(review|revis|\bqa\b|test|prueba|valid|block|bloque|wait|esper|hold|pausa|imped|ready for|listo para|por desplegar|to deploy|aprobac|approval)/],
  ['curso', /(progress|curso|progreso|doing|desarroll|develop|haciendo|implement|working|trabaj|in dev|coding)/],
  ['pendiente', /(to do|todo|por hacer|backlog|open|abiert|nuev|\bnew\b|pendiente|ready|selected|seleccionad|refin|analis|analys)/],
];

export function etapaPropuesta(nombre: unknown, categoria: unknown): Etapa {
  const n = norm(nombre);
  for (let i = 0; i < CLAVES_ETAPA.length; i++) if (CLAVES_ETAPA[i][1].test(n)) return CLAVES_ETAPA[i][0];
  const c = norm(categoria);
  if (/done|hecho|finaliz|complet/.test(c)) return 'hecho';
  if (/progress|curso|progreso/.test(c)) return 'curso';
  return 'pendiente';
}

export function esBloqueo(nombre: unknown): boolean {
  return /block|bloque|imped|hold|pausa/.test(norm(nombre));
}
