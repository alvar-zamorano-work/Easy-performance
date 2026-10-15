// Puente entre el núcleo (TypeScript) y la interfaz heredada de la v0 (interfaz.js).
// Expone en window: CATALOGO (catálogo en JSON), Motor (misma forma que el de la v0) y Nucleo (lo nuevo de B3 y B4).

import { leerJira } from '../../adaptadores/jira/ingerir.ts';
import { detectar } from '../../nucleo/detectar.ts';
import { calcular } from '../../nucleo/calcular.ts';
import { formatear, fechaCorta } from '../../nucleo/formato.ts';
import { cuantil, media, inicioSemana } from '../../nucleo/util.ts';
import { CATALOGO } from '../../nucleo/catalogo.ts';
import { diagnosticar, NOMBRE_AREA } from '../../nucleo/diagnostico.ts';
import { comprobarPaquete } from '../../nucleo/paquete.ts';
import { conEfecto, MEDIDAS_INICIATIVA } from '../../nucleo/iniciativas.ts';
import { RUBRICA, CRITERIOS_AR } from '../../nucleo/agent-readiness.ts';
import { MUESTRA_MINIMA } from '../../nucleo/grupos.ts';
import { etapasV0AMapeo } from '../../nucleo/estados.ts';
import { definiciones } from '../../nucleo/definiciones.ts';
import { aDocx, aMarkdown } from '../../nucleo/documento.ts';
import type { FicheroEntrada, Lectura, Tarea } from '../../nucleo/modelo.ts';

const lecturas = new WeakMap<Tarea[], Lectura>();

const Motor = {
  ingerir(ficheros: FicheroEntrada[]) {
    const lectura = leerJira(ficheros);
    lecturas.set(lectura.tareas, lectura);
    return { tareas: lectura.tareas, informe: lectura.informe, lectura };
  },
  detectar(tareas: Tarea[]) {
    const l = lecturas.get(tareas);
    if (!l) throw new Error('Tareas sin lectura asociada.');
    return detectar(l);
  },
  calcular,
  formatear,
  fechaCorta,
  cuantil,
  media,
  inicioSemana,
};

const Nucleo = {
  lecturaDe: (tareas: Tarea[]) => lecturas.get(tareas) || null,
  diagnosticar, comprobarPaquete, conEfecto, NOMBRE_AREA,
  MEDIDAS_INICIATIVA, RUBRICA, CRITERIOS_AR, MUESTRA_MINIMA,
  etapasV0AMapeo, definiciones, aDocx, aMarkdown,
};

const w = globalThis as unknown as Record<string, unknown>;
w.CATALOGO = CATALOGO;
w.Motor = Motor;
w.Nucleo = Nucleo;
