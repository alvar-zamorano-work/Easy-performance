// Recorrido completo del diagnóstico a partir de una lectura y la carpeta del cliente:
// medidas por equipo y del área, comparaciones entre grupos, casos, iniciativas y paquete de diagnóstico.

import { detectar } from './detectar.ts';
import { calcularDesde, preparar } from './calcular.ts';
import { configDesdeCliente, type ClienteV2 } from './cliente.ts';
import type { ConfigCalculo } from './tipos.ts';
import { compararTodo } from './grupos.ts';
import { casosAgentReady, casosDeGrupo } from './casos-grupo.ts';
import { evaluarIniciativa } from './iniciativas.ts';
import { generarPaquete, comprobarPaquete } from './paquete.ts';
import { capacidadArea } from './coste.ts';
import type { Contexto, Iniciativa, Lectura } from './modelo.ts';

export const NOMBRE_AREA = 'Whole area';

export function diagnosticar(lectura: Lectura, cliente: ClienteV2, iniciativas: Iniciativa[], contexto: Contexto | null, opciones: { alias?: Record<string, string>; generado?: Date; config?: ConfigCalculo } = {}) {
  const det = detectar(lectura);
  // La web aún guarda la configuración de la v0 (etapas, fte...): puede pasarla tal cual.
  const cfg = opciones.config || configDesdeCliente(cliente);
  const preparacion = preparar(lectura.tareas, det, cfg);
  const modelo = calcularDesde(preparacion);
  const fteArea = Object.values(cfg.fte || {});
  const capacidad = capacidadArea(cfg, cliente.equipos.lista.map((e) => e.nombre));
  const area = calcularDesde(preparar(lectura.tareas, det, {
    ...cfg, unirComo: NOMBRE_AREA,
    fte: fteArea.length === cliente.equipos.lista.length ? { [NOMBRE_AREA]: fteArea.reduce((s, v) => s + v, 0) } : {},
    ...(cfg.coste ? { coste: capacidad.costeFteMedio != null ? { [NOMBRE_AREA]: capacidad.costeFteMedio } : {} } : {}),
  }));
  const comparaciones = compararTodo(preparacion, cliente.equipos.lista);
  const casosGrupo = casosDeGrupo(comparaciones);
  const casosAR = casosAgentReady(modelo);
  const evaluaciones = iniciativas.map((i) => ({ iniciativa: i, evaluacion: evaluarIniciativa(i, preparacion) }));
  const paquete = generarPaquete({
    cliente, lectura, det, preparacion, modelo, area, comparaciones, casosGrupo, casosAgentReady: casosAR,
    iniciativas: evaluaciones, contexto, alias: opciones.alias, generado: opciones.generado || new Date(),
  });
  const problemas = comprobarPaquete(paquete);
  return { det, preparacion, modelo, area, capacidad, comparaciones, casosGrupo, casosAgentReady: casosAR, iniciativas: evaluaciones, paquete, problemas };
}
