// Documento de definiciones (plan, apartado 12, semana 1): de dónde salen los datos, qué es cada equipo,
// qué significa cada estado, cómo se calcula cada medida y qué calidad tienen los datos.
// Se genera desde la configuración del arranque y es lo que firman el cliente y Capgemini.

import { CATALOGO, type Catalogo } from './catalogo.ts';
import { detectar } from './detectar.ts';
import { calcular } from './calcular.ts';
import { configDesdeCliente, type ClienteV2 } from './cliente.ts';
import { etapaDe } from './estados.ts';
import { fechaCorta, formatear } from './formato.ts';
import { RUBRICA } from './agent-readiness.ts';
import { DIFERENCIA_MINIMA, MUESTRA_MINIMA, SEMANAS_COMPARACION } from './grupos.ts';
import { LATENCIA_DIAS } from './iniciativas.ts';
import type { Bloque, Documento, Texto } from './documento.ts';
import type { ConfigCalculo, Deteccion, Modelo } from './tipos.ts';
import type { EstadoNormalizado, Etapa, Lectura } from './modelo.ts';

export interface OpcionesDefiniciones {
  /** Configuración del cálculo; por defecto, la que sale de cliente.json. */
  config?: ConfigCalculo;
  det?: Deteccion;
  modelo?: Modelo;
  generado?: Date;
  catalogo?: Catalogo;
}

const NOMBRE_ETAPA: Record<Etapa, string> = { pendiente: 'Pendiente', curso: 'En curso', espera: 'En espera', hecho: 'Hecho' };
const ORDEN_ESTADOS: EstadoNormalizado[] = ['nuevo', 'pendiente', 'en_curso', 'bloqueado', 'en_revision', 'en_pruebas', 'en_espera', 'terminado', 'descartado'];
const NOMBRE_ORIGEN: Record<string, string> = { contrato: 'contrato', declarado: 'declarado por el equipo', estimado: 'estimado' };
const REQUISITO: Record<string, string> = {
  tiempos: 'el tiempo en cada estado', inicio: 'la fecha en que empieza el trabajo', puntos: 'la estimación en puntos', errores: 'el tipo de tarea Error',
  primera: 'la fecha de primera respuesta', sprints: 'los sprints', api: 'la conexión directa con la plataforma', descripcion: 'la descripción de los tickets',
};

const plataformaTexto = (p: string) => (p === 'jira' ? 'Jira' : p.charAt(0).toUpperCase() + p.slice(1));
const n = (x: number) => x.toLocaleString('es-ES');

export function definiciones(lectura: Lectura, cliente: ClienteV2, opciones: OpcionesDefiniciones = {}): Documento {
  const cat = opciones.catalogo || CATALOGO;
  const det = opciones.det || detectar(lectura);
  const cfg = opciones.config || configDesdeCliente(cliente);
  const modelo = opciones.modelo || calcular(lectura.tareas, det, cfg, cat);
  const generado = opciones.generado || new Date();
  const inf = lectura.informe;
  const plataforma = plataformaTexto(lectura.plataforma);
  const nombreCliente = (cliente.nombre || '').trim() || 'el cliente';
  const mapeo: Record<string, EstadoNormalizado> = { ...det.mapeoEstados, ...(cliente.mapeoEstados || {}), ...(cfg.mapeoEstados || {}) };
  const b: Bloque[] = [];
  const h1 = (t: string) => b.push({ tipo: 'h1', texto: t });
  const h2 = (t: string) => b.push({ tipo: 'h2', texto: t });
  const p = (t: Texto, nota = false) => b.push({ tipo: 'p', texto: t, nota });
  const lista = (items: Texto[]) => { if (items.length) b.push({ tipo: 'lista', items }); };
  const tabla = (cabecera: string[], filas: string[][], anchos: number[]) => b.push({ tipo: 'tabla', cabecera, filas, anchos });

  p('Este documento fija cómo se mide el rendimiento de los equipos de ' + nombreCliente + '. Recoge de dónde salen los datos, qué es cada equipo, qué significa cada estado y cómo se calcula cada medida.');
  p('Cuando las dos partes lo firman, estas reglas valen para el tablero, las comparaciones y la evaluación de iniciativas. Si una regla cambia, se cambia antes aquí.');

  // 1. Objetivos
  const objetivos = cat.objetivos.filter((o) => o.fijo || cliente.objetivos.includes(o.id));
  if (objetivos.length) {
    h1('1. Qué queremos conseguir');
    lista(objetivos.map((o) => [{ b: o.titulo + '.' }, ' ' + o.frase]));
  }

  // 2. Datos
  h1('2. De dónde salen los datos');
  const desde = det.fechaMin, hasta = new Date(Math.min(det.fechaRef.getTime(), det.fechaMax.getTime()));
  lista([
    [{ b: 'Fuente. ' }, 'Export de ' + plataforma + ' en CSV con todos los campos.'],
    [{ b: 'Periodo. ' }, 'Del ' + fechaCorta(desde) + ' al ' + fechaCorta(hasta) + '. Las medidas llegan hasta la semana que termina el ' + fechaCorta(new Date(modelo.semanaFin.getTime() - 864e5)) + '.'],
    [{ b: 'Tareas. ' }, n(inf.tareas) + ' tareas. No cuentan las épicas (' + n(inf.epicas) + ') ni las subtareas (' + n(inf.subtareas) + '). Las filas repetidas (' + n(inf.duplicadas) + ') cuentan una vez, con su versión más reciente.'],
    [{ b: 'Personas. ' }, 'Solo se mide a equipos. Las columnas de personas (asignado, informador, comentarios) no se leen.'],
  ]);
  if (inf.ficheros.length) tabla(['Fichero', 'Filas', 'Columnas con datos'], inf.ficheros.map((f) => [f.nombre, n(f.filas), f.columnasConDatos + ' de ' + f.columnas]), [6, 2, 2]);

  // 3. Equipos
  h1('3. Equipos');
  const opcion = det.opcionesEquipo.find((o) => o.id === cfg.campoEquipo);
  const campo = det.camposEquipo.find((c) => c.id === cfg.campoEquipo);
  if (!opcion || opcion.id === 'todos') p('Todo el trabajo se mide como un solo equipo.');
  else p('Cada tarea pertenece al equipo que indica el campo ' + (campo ? campo.nombre : cfg.campoEquipo || '').replace(/^campo\s+/i, '') + '. Las tareas sin ese campo o de equipos que no están en la lista no cuentan.');
  const tareasDe = (nombre: string) => (opcion && opcion.id !== 'todos' ? (opcion.valores.find((v) => v.valor === nombre)?.n ?? 0) : inf.tareas);
  const info = new Map(cliente.equipos.lista.map((e) => [e.nombre, e]));
  tabla(['Equipo', 'Tareas', 'Tipo', 'Área', 'FTE'], modelo.equipos.map((eq) => {
    const e = info.get(eq.nombre);
    const ultimo = e ? e.fte.slice().sort((a, x) => a.periodo.localeCompare(x.periodo)).pop() : undefined;
    const fte = ultimo ? formatear(ultimo.valor, 'num') + ' (' + (NOMBRE_ORIGEN[ultimo.origen] || ultimo.origen) + ')' : 'Sin indicar';
    const tipo = e && e.tipo === 'proveedor' ? 'Proveedor: ' + (e.proveedor || 'sin nombre') : 'Interno';
    return [eq.nombre, n(tareasDe(eq.nombre)), tipo, (e && e.area) || 'Sin indicar', fte];
  }), [3, 1.5, 3, 2.5, 2.5]);
  p('FTE son las personas a jornada completa de cada equipo. ' + plataforma + ' no lo trae: sale del contrato, lo declara el equipo o se estima. Sin FTE, la medida Throughput / FTE no se calcula para ese equipo.', true);

  // 4. Estados
  h1('4. Estados');
  p('Cada estado de ' + plataforma + ' se traduce a un estado común. Así todos los equipos se miden con las mismas reglas, aunque cada uno use sus propios estados.');
  const actuales = new Map(det.estados.map((e) => [e.nombre, e]));
  const nombres = Object.keys(mapeo).filter((k) => actuales.has(k));
  nombres.sort((a, x) => ORDEN_ESTADOS.indexOf(mapeo[a]) - ORDEN_ESTADOS.indexOf(mapeo[x]) || (actuales.get(x)!.visitas - actuales.get(a)!.visitas));
  tabla(['Estado en ' + plataforma, 'Categoría en ' + plataforma, 'Estado común', 'Cuenta como', 'Tareas ahora'], nombres.map((k) => {
    const e = actuales.get(k)!, comun = mapeo[k];
    return [k, e.categoria || 'Sin categoría', cat.estados.estados[comun].nombre, NOMBRE_ETAPA[etapaDe(comun, cat.estados)] + (comun === 'descartado' ? ' (no es entrega)' : ''), n(e.actuales)];
  }), [3, 2.5, 2.2, 2.3, 1.5]);
  // Estados que nadie ha confirmado y que no se reconocieron por su nombre
  const sinRegla = nombres.filter((k) => actuales.get(k)!.propuestaPor !== 'nombre' && !(cliente.mapeoEstados && cliente.mapeoEstados[k]) && !(cfg.mapeoEstados && cfg.mapeoEstados[k]));
  if (sinRegla.length) p([{ b: 'Por confirmar. ' }, 'Estos estados no se reconocieron por su nombre y se han asignado por su categoría o por defecto: ' + sinRegla.join(', ') + '.']);
  const usados = new Set(nombres.map((k) => mapeo[k]));
  h2('Qué significa cada estado común');
  tabla(['Estado común', 'Qué significa', 'Cuenta como'], ORDEN_ESTADOS.filter((s) => usados.has(s)).map((s) => {
    const d = cat.estados.estados[s];
    return [d.nombre, d.descripcion, NOMBRE_ETAPA[d.etapa]];
  }), [2.2, 6, 1.8]);
  h2('Reglas que salen de los estados');
  lista([
    'El tiempo de ciclo de una tarea suma el tiempo que pasa en estados En curso y En espera. El tiempo en Pendiente no cuenta.',
    'El tiempo en espera suma los estados Bloqueado, En revisión, En pruebas y En espera.',
    'Una tarea Descartada no cuenta como entrega.',
    'Si una tarea terminada entró más de una vez en un mismo estado de trabajo, es retrabajo. Las vueltas tras un bloqueo no cuentan.',
  ]);

  // 5. Medidas
  const medidas = cliente.medidas.filter((id) => cat.medidas[id]);
  h1('5. Medidas');
  p('Cada medida se compara con lo habitual en el propio equipo, nunca con otros equipos. Lo habitual es el rango en el que está la medida 7 de cada 10 semanas, mirando las ' + (cfg.semanasReferencia || 12) + ' semanas anteriores a las que se están midiendo.');
  lista([
    [{ b: 'Bien. ' }, 'Dentro de lo habitual o mejor, con un margen del 10%.'],
    [{ b: 'Atención. ' }, 'Peor que lo habitual, hasta un 25% más allá del margen.'],
    [{ b: 'Crítico. ' }, 'Bastante peor que lo habitual.'],
    [{ b: 'Límites fijos. ' }, 'Algunas medidas tienen además un límite de atención y otro crítico. Si un equipo acuerda sus propios límites, mandan sus límites.'],
  ]);
  medidas.forEach((id) => {
    const def = cat.medidas[id];
    h2(def.nombre);
    p([{ b: def.pregunta + ' ' }, def.como]);
    const extra: Texto[] = [];
    const unidad = def.formato === 'pct' ? ('Porcentaje ' + (def.unidad || '')).trim() : (def.unidad || '');
    if (unidad) extra.push([{ b: 'Unidad. ' }, unidad.charAt(0).toUpperCase() + unidad.slice(1) + '.', def.dir ? ' Mejor cuanto ' + (def.dir === 'menos' ? 'más baja.' : 'más alta.') : '']);
    if (def.limites && (def.limites.atencion != null || def.limites.critico != null)) {
      const f = (x: number) => formatear(x, def.formato);
      extra.push([{ b: 'Límites fijos. ' }, [def.limites.atencion != null ? 'atención desde ' + f(def.limites.atencion) : '', def.limites.critico != null ? 'crítico desde ' + f(def.limites.critico) : ''].filter(Boolean).join(' y ').replace(/^./, (c) => c.toUpperCase()) + '.']);
    }
    const propios = modelo.equipos.filter((eq) => cfg.limites && cfg.limites[eq.nombre] && cfg.limites[eq.nombre][id]);
    if (propios.length) {
      extra.push([{ b: 'Límites propios. ' }, propios.map((eq) => {
        const l = cfg.limites![eq.nombre][id];
        return eq.nombre + ': ' + [l.atencion != null ? 'atención ' + formatear(l.atencion, def.formato) : '', l.critico != null ? 'crítico ' + formatear(l.critico, def.formato) : ''].filter(Boolean).join(', ');
      }).join('; ') + '.']);
    }
    if (def.requiere) extra.push([{ b: 'Necesita. ' }, (REQUISITO[def.requiere] || def.requiere).replace(/^./, (c) => c.toUpperCase()) + ' en el export.']);
    const sin = modelo.equipos.filter((eq) => !(eq.medidas[id] && eq.medidas[id].disponible));
    if (sin.length) extra.push([{ b: 'Sin datos en ' + sin.map((eq) => eq.nombre).join(', ') + '. ' }, (sin[0].medidas[id] && sin[0].medidas[id].motivo) || 'El export no trae lo necesario.']);
    lista(extra);
  });

  // 6. Comparaciones entre grupos
  const proveedores = cliente.equipos.lista.some((e) => e.tipo === 'proveedor');
  const areas = new Set(cliente.equipos.lista.map((e) => e.area).filter(Boolean));
  let s = 6;
  h1(s++ + '. Comparaciones entre grupos');
  p(proveedores || areas.size ? 'Se comparan equipos internos y de proveedores, proveedores entre sí y equipos de una misma área, con estas reglas:' : 'Cuando haya equipos de proveedores o áreas con varios equipos, se compararán con estas reglas:');
  lista([
    'Solo medidas que no dependen del tamaño del equipo: plazo en el que se terminan 8 de cada 10 tareas, retrabajo, reaperturas, tiempo bloqueado, tareas que pasan de sprint, antigüedad del pendiente, Throughput / FTE y tickets listos para agentes.',
    'Nunca volumen bruto y nunca personas.',
    'Lo terminado se compara dentro del mismo tipo y tamaño de tarea. Al lado se muestra el reparto del trabajo de cada grupo.',
    'Se miran las últimas ' + SEMANAS_COMPARACION + ' semanas. Si una celda tiene menos de ' + MUESTRA_MINIMA + ' tareas, dice "pocos datos".',
    'Una diferencia cuenta si es clara (no se explica por azar) y relevante (un ' + Math.round(DIFERENCIA_MINIMA * 100) + '% o más).',
    'No mide el esfuerzo ni la dificultad. Una diferencia es una pregunta para la reunión, no un ranking.',
  ]);

  // 7. Iniciativas
  h1(s++ + '. Iniciativas');
  p('Una iniciativa es un cambio que se prueba en uno o varios equipos, con una medida objetivo y un efecto esperado. Se evalúa así:');
  lista([
    'Antes: las semanas de la medida (4 para plazos y entregas, 8 para porcentajes) justo antes de que empiece.',
    'Después: las mismas semanas, empezando ' + Math.round(LATENCIA_DIAS / 7) + ' semanas después del inicio para dar tiempo a que el cambio se note.',
    'Se compara el cambio de los equipos con la iniciativa con el de los equipos que no la tienen, en las mismas fechas.',
    'La confianza (alta, media o baja) depende del número de tareas y de cuánto varía la medida en ese equipo.',
    'No es un experimento controlado: indica si merece la pena seguir, no demuestra la causa.',
  ]);

  // 8. Listo para agentes
  if (medidas.includes('agent_readiness') || modelo.equipos.some((eq) => eq.medidas.agent_readiness && eq.medidas.agent_readiness.disponible)) {
    h1(s++ + '. Tickets listos para agentes de IA');
    p(RUBRICA.definicion + ' Cada ticket suma un punto por criterio. Está listo con ' + RUBRICA.listoDesde + ' de 5 o más.');
    tabla(['Criterio', 'Cuándo se cumple'], Object.values(RUBRICA.criterios).map((c) => [c.nombre, c.como]), [3, 7]);
    p('Se calcula sobre el texto de los tickets en el navegador. Fuera solo salen cifras agregadas, nunca el texto.', true);
  }

  // 9. Calidad de los datos
  h1(s++ + '. Calidad de los datos');
  p('Señales de que ' + plataforma + ' no refleja bien lo que pasa. Conviene revisarlas con cada equipo antes de sacar conclusiones.');
  const generales = inf.avisos.concat(det.avisos).map((a) => a.texto);
  if (generales.length) { h2('Del export'); lista(generales); }
  // Lo que se repite en todos los equipos va una sola vez
  const eqs = modelo.equipos;
  const comunes = eqs.length > 1 ? eqs[0].calidad.avisos.filter((a) => eqs.every((eq) => eq.calidad.avisos.includes(a))) : [];
  const filasCalidad = eqs.map((eq) => {
    const propios = eq.calidad.avisos.filter((a) => !comunes.includes(a));
    return [eq.nombre, propios.length ? propios.join(' ') : (comunes.length ? 'Nada más.' : 'Sin avisos.')];
  });
  if (comunes.length) filasCalidad.unshift(['Todos los equipos', comunes.join(' ')]);
  tabla(['Equipo', 'Avisos'], filasCalidad, [2.5, 7.5]);
  const noDisponibles = cat.ordenMedidas.filter((id) => !modelo.equipos.some((eq) => eq.medidas[id] && eq.medidas[id].disponible));
  if (noDisponibles.length) {
    h2('Lo que no se puede medir con estos datos');
    lista(noDisponibles.map((id) => {
      const m = modelo.equipos[0] && modelo.equipos[0].medidas[id];
      return [{ b: cat.medidas[id].nombre + '. ' }, (m && m.motivo) || 'El export no trae lo necesario.'];
    }));
  }

  // 10. Qué no mide
  h1(s++ + '. Qué no mide');
  lista([
    'No mide a personas: todas las cifras son de equipo.',
    'No mide el esfuerzo ni la dificultad de cada tarea.',
    'No compara equipos para hacer rankings. Cada equipo se mide contra su propia historia.',
  ]);

  // Firma
  h1(s++ + '. Conformidad');
  p('Las dos partes revisan estas definiciones y las aceptan como base de la medición.');
  b.push({ tipo: 'firma', partes: [nombreCliente === 'el cliente' ? 'Cliente' : nombreCliente, 'Capgemini Invent'] });

  return {
    titulo: 'Definiciones de medida',
    subtitulo: (nombreCliente === 'el cliente' ? 'Easy Performance' : nombreCliente + ' · Easy Performance'),
    meta: 'Versión para revisar y firmar. Preparado el ' + fechaCorta(generado) + ' con los datos de ' + plataforma + ' hasta el ' + fechaCorta(hasta) + '.',
    pie: 'Definiciones de medida' + (nombreCliente === 'el cliente' ? '' : ' · ' + nombreCliente),
    bloques: b,
  };
}
