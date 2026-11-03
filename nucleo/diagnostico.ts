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
  // El área se calcula solo con los equipos que ya tienen su rango normal. Un equipo que acaba de empezar, o sin
  // historia suficiente, metería en la serie del área un salto que no es un cambio: alertas y mejoras falsas.
  // Si ninguno lo tiene todavía, entran todos (y el área sale provisional, como ellos).
  const conRango = modelo.equipos.filter((e) => {
    const refs = ['entregas', 'bugs'].map((id) => e.medidas[id]).filter((m) => m && m.disponible);
    return refs.length > 0 && refs.every((m) => m.referencia === 'establecida');
  }).map((e) => e.nombre);
  const areaSin = conRango.length && conRango.length < modelo.equipos.length ? modelo.equipos.map((e) => e.nombre).filter((n) => conRango.indexOf(n) < 0) : [];
  const enArea = areaSin.length ? conRango : modelo.equipos.map((e) => e.nombre);
  const fteDe = cfg.fte || {}, fteArea = enArea.filter((n) => fteDe[n] != null).map((n) => fteDe[n]);
  const capacidad = capacidadArea(cfg, cliente.equipos.lista.map((e) => e.nombre));
  const area = calcularDesde(preparar(lectura.tareas, det, {
    ...cfg, unirComo: NOMBRE_AREA, ...(areaSin.length ? { equipos: enArea } : {}),
    fte: fteArea.length === enArea.length ? { [NOMBRE_AREA]: fteArea.reduce((s, v) => s + v, 0) } : {},
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
  return { det, preparacion, modelo, area, areaSin, capacidad, comparaciones, casosGrupo, casosAgentReady: casosAR, iniciativas: evaluaciones, paquete, problemas };
}
