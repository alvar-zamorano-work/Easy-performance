// Núcleo para la página de la v3: se expone en window.Nucleo y window.CATALOGO.
// La página no calcula cifras: todo sale de aquí.

import { leerJira, OBLIGATORIOS, RECOMENDADOS } from '../../adaptadores/jira/ingerir.ts';
import { leerHoja, aCsv, detectarFormato } from '../../adaptadores/comun/hoja.ts';
import { describirColumnas, mapearColumnas } from '../../adaptadores/jira/columnas.ts';
import { detectar } from '../../nucleo/detectar.ts';
import { formatear, fechaCorta, conPorcentaje } from '../../nucleo/formato.ts';
import { CATALOGO } from '../../nucleo/catalogo.ts';
import { diagnosticar, NOMBRE_AREA } from '../../nucleo/diagnostico.ts';
import { comprobarPaquete } from '../../nucleo/paquete.ts';
import { conEfecto, MEDIDAS_INICIATIVA, LATENCIA_DIAS } from '../../nucleo/iniciativas.ts';
import { RUBRICA, CRITERIOS_AR } from '../../nucleo/agent-readiness.ts';
import { MUESTRA_MINIMA } from '../../nucleo/grupos.ts';
import { etapasV0AMapeo, etapaDe } from '../../nucleo/estados.ts';
import { definiciones } from '../../nucleo/definiciones.ts';
import { aDocx, aMarkdown } from '../../nucleo/documento.ts';
import { capacidadArea, costeDeGrupos } from '../../nucleo/coste.ts';
import { modeloDeMedida } from '../../nucleo/modelo-medida.ts';
import { fiabilidad, COMPROBACIONES_EQUIPO } from '../../nucleo/fiabilidad.ts';
import { seguimiento } from '../../nucleo/seguimiento.ts';
import { detalleMedida, tiempoPorEtapa } from '../../nucleo/detalle.ts';
import { fijarIdioma, idioma } from '../../nucleo/idioma.ts';
import * as IA from '../../nucleo/ia.ts';
import { aplicarReglasTipo, tiposDeOrigen, etiquetasDe, TIPOS_ELEGIBLES } from '../../nucleo/reglas-tipo.ts';
import { columnasNumericas } from '../../adaptadores/comun/numericas.ts';
import { completarDesdeHistorial } from '../../adaptadores/comun/historial.ts';
import { columnasCategoricas } from '../../adaptadores/comun/categoricas.ts';
import { muestraDeRitmo, cuantasEnSemanas, cuandoTerminan, SEMANAS_MUESTRA, SEMILLA_CUANDO } from '../../nucleo/prevision.ts';
import { SEMANAS_RITMO_EPICA } from '../../nucleo/epicas.ts';
import { vistaEpicas, repartoPorCampo } from '../../nucleo/epicas.ts';

const Nucleo = {
  leerJira, OBLIGATORIOS, RECOMENDADOS, leerHoja, aCsv, detectarFormato, mapearColumnas, describirColumnas, detectar, diagnosticar, NOMBRE_AREA, comprobarPaquete, conEfecto, MEDIDAS_INICIATIVA, LATENCIA_DIAS,
  RUBRICA, CRITERIOS_AR, MUESTRA_MINIMA, etapasV0AMapeo, etapaDe, definiciones, aDocx, aMarkdown, capacidadArea, costeDeGrupos, modeloDeMedida,
  fiabilidad, COMPROBACIONES_EQUIPO, seguimiento, detalleMedida, tiempoPorEtapa, fijarIdioma, idioma, formatear, fechaCorta, conPorcentaje, IA,
  aplicarReglasTipo, tiposDeOrigen, etiquetasDe, TIPOS_ELEGIBLES, columnasNumericas, completarDesdeHistorial,
  columnasCategoricas, muestraDeRitmo, cuantasEnSemanas, cuandoTerminan, SEMANAS_MUESTRA, SEMILLA_CUANDO, SEMANAS_RITMO_EPICA, vistaEpicas, repartoPorCampo,
};

const w = globalThis as unknown as Record<string, unknown>;
w.CATALOGO = CATALOGO;
w.Nucleo = Nucleo;
