// Indicadores de comité: cinco cifras por equipo y por área, cada una frente a su propia historia.

import { Tx } from './idioma.ts';
import { estadoMedida, estadoReferencia, rangoDe } from './semaforo.ts';
import type { DefSemaforo } from './catalogo.ts';
import type { ContextoCalculo, MedidaCalculada, ResultadoEquipo } from './tipos.ts';

type InfoParcial = Pick<ResultadoEquipo, 'series' | 'medidas'>;

export function kpisComite(info: InfoParcial, c: ContextoCalculo, nombre: string): Record<string, MedidaCalculada> {
  const N = c.N, L = N - 1, K = c.K, R = c.R, s = info.series, M = info.medidas, out: Record<string, MedidaCalculada> = {};
  const fteMapa = c.cfg.fte || {};
  const fte = fteMapa[nombre] != null && fteMapa[nombre] > 0 ? +fteMapa[nombre] : null;

  function desdeSerie(id: string, serie: (number | null)[], win: number, def: DefSemaforo): MedidaCalculada {
    const m: MedidaCalculada = { id, disponible: true, serie, valor: serie[L], ventana: win };
    const refVals = serie.slice(Math.max(0, L - win - R + 1), Math.max(0, L - win + 1)).filter((x): x is number => x != null);
    const ref = rangoDe(refVals);
    if (ref) m.ref = ref;
    m.referencia = estadoReferencia(ref, R);
    const est = estadoMedida(id, m.valor, m.ref, null, def);
    m.estado = est.estado;
    m.estadoTexto = est.texto;
    if (est.por) { m.estadoPor = est.por; m.limite = est.limite ?? null; }
    return m;
  }
  function copia(id: string, base: string): MedidaCalculada {
    const b = M[base];
    if (!b || !b.disponible) return { id, disponible: false, motivo: b ? b.motivo : Tx('Not available with this data.', 'No disponible con estos datos.') };
    return { id, disponible: true, serie: b.serie, valor: b.valor, ref: b.ref, ventana: b.ventana, estado: b.estado, estadoTexto: b.estadoTexto, estadoPor: b.estadoPor, limite: b.limite, referencia: b.referencia };
  }

  // Throughput / FTE: tareas terminadas al mes (media de 4 semanas) entre las personas equivalentes del equipo.
  if (fte) out.throughput = desdeSerie('throughput', s.entregasMedia.map((x) => (x == null ? null : x * 52 / 12 / fte)), K, { dir: 'mas', formato: 'num' });
  else out.throughput = { id: 'throughput', disponible: false, falta: 'fte', motivo: Tx('Enter how many people (FTE) the team has in Settings.', 'Indica cuántas personas (FTE) tiene el equipo en Ajustes.') };
  // Coste por entrega: lo que cuesta el equipo al mes (FTE por el coste mensual de un FTE) entre las tareas terminadas al mes.
  // Solo si se ha indicado algún coste: sin él, los resultados son los mismos que en la v0.
  if (c.cfg.coste) {
    const costeFte = c.cfg.coste[nombre] != null && c.cfg.coste[nombre] > 0 ? +c.cfg.coste[nombre] : null;
    if (fte && costeFte) out.coste = desdeSerie('coste', s.entregasMedia.map((x) => (x == null || x <= 0 ? null : fte * costeFte / (x * 52 / 12))), K, { dir: 'menos', formato: 'eur' });
    else out.coste = { id: 'coste', disponible: false, falta: fte ? 'coste' : 'fte', motivo: fte ? Tx('Enter the monthly cost of one FTE for this team.', 'Indica el coste mensual de un FTE de este equipo.') : Tx('Enter how many people (FTE) the team has and what each one costs per month.', 'Indica cuántas personas (FTE) tiene el equipo y lo que cuesta cada una al mes.') };
  }
  out.entrega = copia('entrega', 'ciclo');
  // Valor entregado: parte de lo terminado que es funcionalidad nueva (historias), frente a su propia historia.
  const rep = s.reparto.map((r) => (r ? r.historia : null));
  out.valor = M.reparto && M.reparto.disponible ? desdeSerie('valor', rep, c.KP, { dir: 'mas', formato: 'pct' }) : copia('valor', 'reparto');
  out.calidad = copia('calidad', 'retrabajo');
  out.carga = s.pendienteEdad.some((x) => x != null)
    ? desdeSerie('carga', s.pendienteEdad, 1, { dir: 'menos', formato: 'dias' })
    : { id: 'carga', disponible: false, motivo: Tx('Not enough backlog to measure it.', 'No hay trabajo pendiente suficiente para medirlo.') };
  return out;
}
