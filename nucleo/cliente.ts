// cliente.json: paso de la configuración de la v0 (version 1) a la versión 2 del modelo neutro,
// y de cliente.json a la configuración del cálculo.

import { etapasV0AMapeo } from './estados.ts';
import type { ConfigCalculo, Deteccion } from './tipos.ts';
import type { Equipo, EstadoNormalizado, Etapa, Limites } from './modelo.ts';

export interface ClienteV2 {
  version: 2;
  nombre: string;
  sector: string;
  plataforma: string;
  periodo?: { desde?: string; hasta?: string };
  creada?: string;
  actualizada?: string;
  mapeoEstados: Record<string, EstadoNormalizado>;
  equipos: { campo: string; lista: Equipo[] };
  objetivos: string[];
  medidas: string[];
  perfiles?: string[];
  graficos?: Record<string, string>;
  textos?: Record<string, string>;
  noAplica?: Record<string, boolean>;
  planHecho?: Record<string, boolean>;
}

/** Forma del cliente.json que guarda la v0. */
export interface ClienteV0 {
  version?: number;
  creada?: string;
  actualizada?: string;
  campoEquipo?: string;
  equipos?: string[];
  etapas?: Record<string, Etapa>;
  objetivos?: string[];
  medidas?: string[];
  perfiles?: string[];
  graficos?: Record<string, string>;
  limites?: Record<string, Record<string, Limites>>;
  textos?: Record<string, string>;
  noAplica?: Record<string, boolean>;
  planHecho?: Record<string, boolean>;
  fte?: Record<string, number>;
}

function equipoInterno(nombre: string, usaSprints: boolean): Equipo {
  return { id: nombre, nombre, tipo: 'interno', proveedor: null, area: null, usa_sprints: usaSprints, fte: [], limites: {} };
}

/** Lista de equipos por defecto para un campo: los valores con al menos el 2% de las tareas, todos internos. */
export function equiposDetectados(det: Deteccion, campo: string): Equipo[] {
  const op = det.opcionesEquipo.find((o) => o.id === campo);
  if (!op) return [];
  const total = op.valores.reduce((s, v) => s + v.n, 0);
  const usa = det.haySprints && !det.sprintsComoFecha;
  return op.valores.filter((v) => v.n / total >= 0.02).map((v) => equipoInterno(v.valor, usa));
}

export function migrarClienteV0(v0: ClienteV0, det: Deteccion, nombre: string, periodoFte: string): ClienteV2 {
  const campo = v0.campoEquipo || det.equipoRecomendado;
  const usa = det.haySprints && !det.sprintsComoFecha;
  const nombres = v0.equipos && v0.equipos.length ? v0.equipos : equiposDetectados(det, campo).map((e) => e.nombre);
  const lista = nombres.map((n) => {
    const e = equipoInterno(n, usa);
    const fte = v0.fte && v0.fte[n];
    if (fte && fte > 0) e.fte = [{ periodo: periodoFte, valor: fte, origen: 'declarado' }];
    if (v0.limites && v0.limites[n]) e.limites = v0.limites[n];
    return e;
  });
  const out: ClienteV2 = {
    version: 2, nombre, sector: '', plataforma: det.plataforma,
    mapeoEstados: { ...det.mapeoEstados, ...etapasV0AMapeo(v0.etapas || {}, det.mapeoEstados) },
    equipos: { campo, lista },
    objetivos: v0.objetivos || [],
    medidas: v0.medidas || [],
  };
  if (v0.creada) out.creada = v0.creada;
  if (v0.actualizada) out.actualizada = v0.actualizada;
  if (v0.perfiles) out.perfiles = v0.perfiles;
  if (v0.graficos) out.graficos = v0.graficos;
  if (v0.textos) out.textos = v0.textos;
  if (v0.noAplica) out.noAplica = v0.noAplica;
  if (v0.planHecho) out.planHecho = v0.planHecho;
  return out;
}

/** Configuración del cálculo a partir de cliente.json. El FTE es el del último periodo indicado. */
export function configDesdeCliente(c: ClienteV2): ConfigCalculo {
  const limites: ConfigCalculo['limites'] = {}, fte: Record<string, number> = {};
  c.equipos.lista.forEach((e) => {
    if (Object.keys(e.limites).length) limites[e.nombre] = e.limites;
    const ultimo = e.fte.slice().sort((a, b) => a.periodo.localeCompare(b.periodo)).pop();
    if (ultimo) fte[e.nombre] = ultimo.valor;
  });
  return { campoEquipo: c.equipos.campo, equipos: c.equipos.lista.map((e) => e.nombre), mapeoEstados: c.mapeoEstados, limites, fte };
}
