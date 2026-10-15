// Punto de entrada del núcleo. Expone la misma interfaz que el objeto Motor de la v0
// para que la carcasa web pueda cambiar de motor sin tocar la interfaz.

import { leerCSV } from '../adaptadores/comun/csv.ts';
import { mapearColumnas } from '../adaptadores/jira/columnas.ts';
import { leerFecha } from '../adaptadores/jira/fechas.ts';
import { ingerir } from '../adaptadores/jira/ingerir.ts';
import { detectar, OPCIONES_EQUIPO } from './detectar.ts';
import { calcular } from './calcular.ts';
import { fechaCorta, formatear } from './formato.ts';
import { etapaPropuesta } from './estados.ts';
import { cuantil, inicioSemana, media } from './util.ts';

export { CATALOGO } from './catalogo.ts';
export type * from './tipos.ts';
export type { Catalogo, CasoDef, MedidaDef, ObjetivoDef } from './catalogo.ts';

export const Motor = {
  leerCSV, mapearColumnas, leerFecha, ingerir, detectar, calcular,
  formatear, fechaCorta, etapaPropuesta, cuantil, media, inicioSemana,
  OPCIONES_EQUIPO,
};

export { leerCSV, mapearColumnas, leerFecha, ingerir, detectar, calcular, formatear, fechaCorta, etapaPropuesta, cuantil, media, inicioSemana, OPCIONES_EQUIPO };
