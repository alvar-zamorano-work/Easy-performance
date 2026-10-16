// Fiabilidad de los datos: comprobaciones de si la herramienta refleja bien el trabajo, para el área y por equipo.
// Cada comprobación dice qué mira, su valor, desde cuándo se considera bien y cómo se arregla.
// No cambia ninguna cifra: avisa antes de sacar conclusiones.

import { cuantil, sumarDias } from './util.ts';
import type { Preparacion } from './calcular.ts';
import type { ConfigCalculo, Deteccion, Derivada, Modelo } from './tipos.ts';
import type { Lectura } from './modelo.ts';

export type EstadoComprobacion = 'bien' | 'revisar' | 'sin';
export type NivelFiabilidad = 'alta' | 'media' | 'baja';

export interface Comprobacion {
  id: string;
  nombre: string;
  /** Qué mira, en una frase. */
  que: string;
  /** Valor para mostrar ("92%", "0", "5 de 5"). */
  valor: string;
  /** Desde cuándo está bien, en palabras. */
  umbral: string;
  estado: EstadoComprobacion;
  /** Qué pasa con este valor, en una frase. */
  detalle: string;
  /** Qué hacer si hay que revisarla. */
  arreglo: string;
}
export interface FiabilidadEquipo { equipo: string; valores: Record<string, { valor: string; estado: EstadoComprobacion }>; revisar: number }
export interface Fiabilidad { nivel: NivelFiabilidad; bien: number; revisar: number; comprobaciones: Comprobacion[]; porEquipo: FiabilidadEquipo[] }

/** Semanas recientes que se miran (las mismas que los avisos de calidad). */
export const SEMANAS_FIABILIDAD = 16;
/** Semanas de historia que necesita un equipo: 12 para saber qué es lo normal y 4 para medir. */
export const SEMANAS_MINIMAS = 16;
/** Columnas de la tabla por equipo. */
export const COMPROBACIONES_EQUIPO = ['tiempos', 'flujo', 'registro', 'estimacion', 'sprints', 'historia'];

// Sin redondear a 100% lo que no llega: 99,8% se muestra con un decimal
const pct = (x: number) => (x < 1 && Math.round(x * 100) === 100 ? (Math.floor(x * 1000) / 10).toLocaleString('es-ES') : String(Math.round(x * 100))) + '%';

interface Parcial { valor: string; estado: EstadoComprobacion; detalle: string }

// Comprobaciones que se calculan igual para un equipo y para el área (con todas sus tareas)
function deItems(items: Derivada[], p: Preparacion, det: Deteccion): Record<string, Parcial> {
  const desde = sumarDias(p.ctx.semanaFin, -7 * SEMANAS_FIABILIDAD);
  const ent = items.filter((d) => d.entregada && d.t.fechas.terminada! >= desde && d.t.fechas.terminada! < p.ctx.semanaFin);
  const out: Record<string, Parcial> = {};
  // Tiempo en cada estado
  if (!det.hayTiempos) out.tiempos = { valor: 'No viene', estado: 'revisar', detalle: 'El export no trae el tiempo en cada estado: no se pueden medir el plazo, el retrabajo ni el bloqueo.' };
  else if (ent.length < 5) out.tiempos = { valor: 'Pocas tareas', estado: 'sin', detalle: 'Hay menos de 5 tareas terminadas en las últimas semanas.' };
  else {
    const x = ent.filter((d) => d.conTiempos).length / ent.length;
    out.tiempos = { valor: pct(x), estado: x >= 0.8 ? 'bien' : 'revisar', detalle: pct(x) + ' de lo terminado trae el tiempo en cada estado.' };
  }
  // Pasan por en curso
  if (ent.length < 5) out.flujo = { valor: 'Pocas tareas', estado: 'sin', detalle: 'Hay menos de 5 tareas terminadas en las últimas semanas.' };
  else {
    const x = 1 - ent.filter((d) => d.salto).length / ent.length;
    out.flujo = { valor: pct(x), estado: x >= 0.95 ? 'bien' : 'revisar', detalle: pct(x) + ' de lo terminado pasó por en curso antes de cerrarse.' };
  }
  // Registro a tiempo: las tareas se crean antes de hacer el trabajo
  if (ent.length < 30) out.registro = { valor: 'Pocas tareas', estado: 'sin', detalle: 'Hacen falta 30 tareas terminadas para valorarlo.' };
  else {
    const p85 = cuantil(ent.map((d) => d.total!), 0.85)!;
    const x = ent.filter((d) => (d.total || 0) >= 1).length / ent.length;
    out.registro = { valor: pct(x), estado: p85 >= 1 ? 'bien' : 'revisar', detalle: pct(x) + ' de lo terminado tardó al menos un día desde que se creó.' };
  }
  // Historias estimadas
  const historias = items.filter((d) => d.t.tipo === 'historia');
  if (historias.length < 10) out.estimacion = { valor: 'Pocas historias', estado: 'sin', detalle: 'Hay menos de 10 historias.' };
  else {
    const x = historias.filter((d) => d.t.estimacion != null).length / historias.length;
    out.estimacion = { valor: pct(x), estado: x >= 0.7 ? 'bien' : 'revisar', detalle: pct(x) + ' de las historias tiene estimación.' };
  }
  return out;
}

export function fiabilidad(lectura: Lectura, det: Deteccion, p: Preparacion, modelo: Modelo, cfg: ConfigCalculo = {}): Fiabilidad {
  const todas = Object.keys(p.porEquipo).flatMap((e) => p.porEquipo[e]);
  const area = deItems(todas, p, det);
  const usaSprints = (nombre: string) => (p.porEquipo[nombre] || []).some((d) => d.t.sprints.length > 0);
  // Por equipo
  const porEquipo: FiabilidadEquipo[] = modelo.equipos.map((eq) => {
    const x = deItems(p.porEquipo[eq.nombre] || [], p, det);
    const sp: Parcial = !det.haySprints || det.sprintsComoFecha || !usaSprints(eq.nombre) ? { valor: 'No aplica', estado: 'sin', detalle: '' }
      : { valor: eq.sprints.fiables ? 'Sí' : 'No', estado: eq.sprints.fiables ? 'bien' : 'revisar', detalle: eq.sprints.motivo || '' };
    const hi: Parcial = { valor: eq.semanasConDatos + ' semanas', estado: eq.semanasConDatos >= SEMANAS_MINIMAS ? 'bien' : 'revisar', detalle: '' };
    const valores: FiabilidadEquipo['valores'] = {};
    const todosX: Record<string, Parcial> = { ...x, sprints: sp, historia: hi };
    COMPROBACIONES_EQUIPO.forEach((k) => { valores[k] = { valor: todosX[k].valor, estado: todosX[k].estado }; });
    return { equipo: eq.nombre, valores, revisar: COMPROBACIONES_EQUIPO.filter((k) => valores[k].estado === 'revisar').length };
  });
  // Una comprobación del área se revisa también si falla en algún equipo: una media buena puede esconder un equipo roto
  const conEquipos = (id: string, x: Parcial): Parcial => {
    const malos = porEquipo.filter((e) => e.valores[id] && e.valores[id].estado === 'revisar');
    if (!malos.length) return x;
    return { valor: x.valor, estado: 'revisar', detalle: x.detalle + ' Revisar en ' + malos.map((e) => e.equipo + ' (' + e.valores[id].valor + ')').join(', ') + '.' };
  };
  const comp: Comprobacion[] = [];
  const nuevo = (id: string, nombre: string, que: string, umbral: string, arreglo: string, x: Parcial) => comp.push({ id, nombre, que, umbral, arreglo, valor: x.valor, estado: x.estado, detalle: x.detalle });

  // Tareas con equipo
  const total = lectura.tareas.length, conEquipo = todas.length;
  const cobertura = total ? conEquipo / total : 0;
  nuevo('equipo', 'Tareas con equipo', 'Parte de las tareas que se pueden asignar a uno de los equipos medidos.', '90% o más',
    'Revisar el campo que dice de qué equipo es cada tarea, o pedir a los equipos que lo rellenen.',
    { valor: pct(cobertura), estado: cobertura >= 0.9 ? 'bien' : 'revisar', detalle: conEquipo.toLocaleString('es-ES') + ' de ' + total.toLocaleString('es-ES') + ' tareas tienen un equipo de la lista.' });

  // Estados reconocidos
  const confirmados = Object.assign({}, cfg.mapeoEstados || {});
  const porRevisar = det.estados.filter((e) => e.propuestaPor !== 'nombre' && !confirmados[e.nombre]);
  nuevo('estados', 'Estados reconocidos', 'Estados de la herramienta que se han traducido con seguridad a un estado común.', 'Todos',
    'Confirmar en Vuestros datos el estado común de los que están por revisar.',
    { valor: (det.estados.length - porRevisar.length) + ' de ' + det.estados.length, estado: porRevisar.length ? 'revisar' : 'bien',
      detalle: porRevisar.length ? 'Por confirmar: ' + porRevisar.map((e) => e.nombre).join(', ') + '.' : 'Todos se reconocen por su nombre o están confirmados.' });

  nuevo('tiempos', 'Tiempo en cada estado', 'Si lo terminado trae cuánto tiempo pasó en cada estado. Sin él no hay plazo, retrabajo ni bloqueo.', '80% o más',
    'Exportar con el campo Tiempo en estado, o conectar con la API, que trae el historial de cambios.', conEquipos('tiempos', area.tiempos));
  nuevo('flujo', 'Pasan por en curso', 'Si las tareas se mueven por en curso al empezar, en lugar de saltar de pendiente a hecho.', '95% o más',
    'Mover cada tarea a en curso cuando se empieza a trabajar en ella.', conEquipos('flujo', area.flujo));

  // Cierres en bloque
  const bloques = modelo.cierresBloque;
  nuevo('bloque', 'Sin cierres en bloque', 'Momentos en los que se cerraron 10 o más tareas en el mismo minuto, típico de una limpieza del tablero.', 'Ninguno',
    'Si fue una limpieza, cerrar esas tareas como descartadas para que no cuenten como entregas.',
    { valor: String(bloques.length), estado: bloques.length ? 'revisar' : 'bien',
      detalle: bloques.length ? bloques.length + (bloques.length === 1 ? ' cierre en bloque' : ' cierres en bloque') + ', con ' + bloques.reduce((s, b) => s + b.n, 0) + ' tareas en total.' : 'No hay cierres masivos.' });

  nuevo('registro', 'Registro a tiempo', 'Si las tareas se crean antes de hacer el trabajo y no después, para apuntarlo.', '8 de cada 10 tardan un día o más',
    'Crear las tareas al planificar, no al terminar el trabajo.', conEquipos('registro', area.registro));
  nuevo('estimacion', 'Historias estimadas', 'Parte de las historias con estimación. Sin ella no se puede ver si las estimaciones predicen.', '70% o más',
    'Estimar las historias antes de empezar, aunque sea con tallas.', conEquipos('estimacion', area.estimacion));

  // Sprints creíbles
  const conSprints = modelo.equipos.filter((e) => usaSprints(e.nombre));
  const fiables = conSprints.filter((e) => e.sprints.fiables);
  const sprints: Parcial = !det.haySprints ? { valor: 'No hay', estado: 'sin', detalle: 'Los datos no traen sprints.' }
    : det.sprintsComoFecha ? { valor: 'No creíbles', estado: 'revisar', detalle: 'Los nombres de sprint parecen fechas y horas.' }
      : !conSprints.length ? { valor: 'Pocos', estado: 'sin', detalle: 'No hay sprints suficientes para valorarlo.' }
        : { valor: fiables.length + ' de ' + conSprints.length + ' equipos', estado: fiables.length === conSprints.length ? 'bien' : 'revisar',
          detalle: fiables.length === conSprints.length ? 'Los sprints de todos los equipos se pueden usar para medir.' : 'Equipos con sprints poco creíbles: ' + conSprints.filter((e) => !e.sprints.fiables).map((e) => e.nombre).join(', ') + '.' };
  nuevo('sprints', 'Sprints creíbles', 'Si los sprints se abren y se cierran de verdad en la herramienta, para medir lo que pasa de un sprint a otro.', 'Todos los equipos',
    'Cerrar cada sprint en la herramienta y mover lo pendiente al siguiente.', sprints);

  // Actividad hasta el final del periodo
  const cortado = det.avisos.some((a) => /actividad/i.test(a.texto));
  nuevo('actividad', 'Datos hasta el final', 'Si el export llega hasta la última semana o parece cortado antes.', 'Sin cortes',
    'Exportar de nuevo con todo el periodo.',
    { valor: cortado ? 'Cortado' : 'Completo', estado: cortado ? 'revisar' : 'bien', detalle: cortado ? 'Las últimas semanas casi no tienen actividad.' : 'Hay actividad hasta el final del periodo.' });

  // Historia suficiente para saber qué es lo normal
  const cortos = modelo.equipos.filter((e) => e.semanasConDatos < SEMANAS_MINIMAS);
  nuevo('historia', 'Historia suficiente', 'Semanas con actividad de cada equipo. Hacen falta 12 para saber qué es lo normal y 4 para medir.', SEMANAS_MINIMAS + ' semanas o más',
    'Cargar un periodo más largo en la primera ingesta.',
    { valor: (modelo.equipos.length - cortos.length) + ' de ' + modelo.equipos.length + ' equipos', estado: cortos.length ? 'revisar' : 'bien',
      detalle: cortos.length ? 'Con poca historia: ' + cortos.map((e) => e.nombre + ' (' + e.semanasConDatos + ' semanas)').join(', ') + '.' : 'Todos los equipos tienen historia suficiente.' });

  const revisar = comp.filter((c) => c.estado === 'revisar').length, bien = comp.filter((c) => c.estado === 'bien').length;
  let nivel: NivelFiabilidad = revisar <= 1 ? 'alta' : revisar <= 3 ? 'media' : 'baja';
  if (cobertura < 0.7 || !det.hayTiempos) nivel = nivel === 'alta' ? 'media' : nivel;
  if (cobertura < 0.5) nivel = 'baja';
  return { nivel, bien, revisar, comprobaciones: comp, porEquipo };
}
