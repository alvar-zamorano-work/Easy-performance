/* easyperformance v3: puente entre el núcleo y las pantallas.
   construirVM convierte la salida de Nucleo.diagnosticar() en la vista-modelo que leen las pantallas.
   Aquí no se calcula ninguna cifra: solo se eligen, se ordenan y se etiquetan las que da el núcleo. */
(function () {
  const N = window.Nucleo;
  const C = () => window.CATALOGO;

  // Objetivos del Context (los de la v2) y sus medidas. Bugs nuevos entra en Quality.
  const OBJETIVOS = [
    { id: 'speed', kpis: ['ciclo', 'entregas'], catalogo: ['tardamos', 'avez', 'tiempo'] },
    { id: 'quality', kpis: ['retrabajo', 'bugs'], catalogo: ['arreglos'] },
    { id: 'predictability', kpis: ['arrastradas'], catalogo: ['cumplir', 'pendiente'] },
    { id: 'cost', kpis: ['coste'], catalogo: [] },
    { id: 'ai', kpis: ['agent_readiness'], catalogo: ['agentes'] },
  ];
  /** Medidas de la línea base (las que puede elegir el Context). */
  const BASE = ['ciclo', 'entregas', 'retrabajo', 'bugs', 'arrastradas', 'agent_readiness', 'coste'];
  const TRABAJO = ['sprints', 'flujo', 'mixto'];

  const hayCoste = (cfg) => !!(cfg.coste && Object.keys(cfg.coste).some((k) => cfg.coste[k] > 0));
  const hayProveedores = (cfg) => { const i = cfg.equiposInfo || {}; return Object.keys(i).some((k) => i[k] && i[k].tipo === 'proveedor'); };

  /** Respuestas del Context: las guardadas o las de por defecto (Speed, Quality y Predictability). */
  function contexto(cfg, det) {
    const c = cfg.contexto;
    if (c && c.hecho) return c;
    return { objetivos: ['speed', 'quality', 'predictability'], trabajo: det && det.haySprints ? 'sprints' : 'flujo', proveedores: hayProveedores(cfg), coste: hayCoste(cfg), hecho: false };
  }
  /** Medidas visibles según el Context, en orden. */
  function columnas(cfg, det) {
    const c = contexto(cfg, det), out = [];
    OBJETIVOS.forEach((o) => {
      if (c.objetivos.indexOf(o.id) < 0) return;
      o.kpis.forEach((k) => {
        if (k === 'arrastradas' && c.trabajo === 'flujo') return;
        if (k === 'coste' && !hayCoste(cfg)) return;
        if (out.indexOf(k) < 0) out.push(k);
      });
    });
    return out.length ? out : ['ciclo', 'entregas'];
  }
  function objetivosCatalogo(cfg, det) {
    const c = contexto(cfg, det); let out = ['datos'];
    OBJETIVOS.forEach((o) => { if (c.objetivos.indexOf(o.id) >= 0) out = out.concat(o.catalogo); });
    if (c.proveedores) out.push('comparar');
    return out;
  }
  function casoActivo(id, cfg, det) {
    const def = C().casos[id];
    if (!def) return false;
    const act = objetivosCatalogo(cfg, det);
    if (def.requiere === 'sprints' && contexto(cfg, det).trabajo === 'flujo') return false;
    if (def.medida && BASE.indexOf(def.medida) >= 0 && columnas(cfg, det).indexOf(def.medida) < 0) return false;
    return (def.objetivos || []).some((o) => act.indexOf(o) >= 0);
  }

  // ---------- configuración del cálculo y cliente (como en la v2) ----------
  function opcion(det, id) { return det ? det.opcionesEquipo.filter((o) => o.id === id)[0] : null; }
  function campo(cfg, det) { const c = cfg.campoEquipo, o = c && opcion(det, c); return o && o.valida ? c : det.equipoRecomendado; }
  /** Equipos medidos: los elegidos o los que tienen al menos el 2 % de las tareas. */
  function equipos(cfg, det) {
    const cp = campo(cfg, det), o = opcion(det, cp);
    if (!o || o.id === 'todos') return [];
    if (cfg.equipos && cfg.equipos.length && cfg.campoEquipo === cp) {
      const hay = cfg.equipos.filter((e) => o.valores.some((v) => v.valor === e));
      if (hay.length) return hay;
    }
    const total = o.valores.reduce((s, v) => s + v.n, 0);
    return o.valores.filter((v) => v.n / total >= 0.02).map((v) => v.valor);
  }
  function mapeo(cfg, det) {
    const m = Object.assign({}, det.mapeoEstados);
    if (!cfg.mapeoEstados && cfg.etapas) Object.assign(m, N.etapasV0AMapeo(cfg.etapas, det.mapeoEstados));
    // Solo estados comunes que existen: un mapeo escrito a mano con un estado desconocido no rompe el cálculo
    const comunes = C().estados.estados, propio = cfg.mapeoEstados || {};
    Object.keys(propio).forEach((k) => { if (comunes[propio[k]]) m[k] = propio[k]; });
    return m;
  }
  function cfgCalculo(cfg, det) {
    const c = { campoEquipo: campo(cfg, det), equipos: equipos(cfg, det), mapeoEstados: mapeo(cfg, det), fte: cfg.fte || {}, limites: {} };
    if (hayCoste(cfg)) c.coste = cfg.coste;
    return c;
  }
  const mesTexto = (d) => d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
  function clienteDe(cfg, det) {
    const info = cfg.equiposInfo || {}, fte = cfg.fte || {}, orig = cfg.fteOrigen || {}, periodo = mesTexto(det.fechaRef);
    let nombres = equipos(cfg, det);
    if (!nombres.length) nombres = ['All work'];
    const lista = nombres.map((n) => {
      const i = info[n] || {}, prov = i.tipo === 'proveedor';
      return { id: n, nombre: n, tipo: prov ? 'proveedor' : 'interno', proveedor: prov ? (i.proveedor || 'Vendor') : null, area: i.area || null,
        usa_sprints: true, fte: fte[n] ? [{ periodo, valor: fte[n], origen: orig[n] || 'declarado' }] : [], limites: {} };
    });
    return { version: 2, nombre: cfg.nombre || '', sector: cfg.sector || '', plataforma: 'jira', mapeoEstados: mapeo(cfg, det), equipos: { campo: campo(cfg, det), lista },
      objetivos: [], medidas: columnas(cfg, det).slice() };
  }
  /** Iniciativa con la forma que necesita el núcleo; las mal formadas (de la carpeta o de datos.js) se ignoran. */
  const iniValida = (i) => !!(i && typeof i.id === 'string' && i.nombre && /^\d{4}-\d{2}-\d{2}$/.test(String(i.fecha_inicio || ''))
    && Array.isArray(i.equipos) && i.equipos.length && i.equipos.every((e) => typeof e === 'string')
    && Array.isArray(i.medidas_objetivo) && i.medidas_objetivo.length && i.medidas_objetivo.every((m) => m && typeof m.medida === 'string'));
  function iniciativas(cfg, extra) {
    const porId = {};
    (extra || []).concat(cfg.iniciativas || []).forEach((i) => { if (iniValida(i)) porId[i.id] = i; });
    return Object.keys(porId).map((k) => porId[k]);
  }

  /** Recorrido completo: diagnóstico del núcleo con la configuración del cliente. */
  function diagnosticar(lectura, det, cfg, extraIni, contextoDocs) {
    return N.diagnosticar(lectura, clienteDe(cfg, det), iniciativas(cfg, extraIni), contextoDocs || null, { config: cfgCalculo(cfg, det), generado: new Date() });
  }

  // ---------- piezas de la VM ----------
  const med = (eq, id) => (id === 'coste' ? (eq.kpis && eq.kpis.coste) || { id: 'coste', disponible: false, motivo: null, falta: 'coste' } : eq.medidas[id]);
  const malo = (m) => m && m.disponible && (m.estado === 'atencion' || m.estado === 'critico');

  /** Ficha de un equipo (o del área). */
  function fichaEquipo(r, eq, cols, fiab, cfg) {
    const info = (cfg.equiposInfo || {})[eq.nombre] || {};
    const fe = fiab && fiab.porEquipo.filter((x) => x.equipo === eq.nombre)[0];
    const bien = fe ? N.COMPROBACIONES_EQUIPO.filter((k) => fe.valores[k] && fe.valores[k].estado === 'bien').length : null;
    const medibles = fe ? N.COMPROBACIONES_EQUIPO.filter((k) => fe.valores[k] && fe.valores[k].estado !== 'sin').length : null;
    const cambios = cols.map((id) => ({ id, m: med(eq, id) })).filter((x) => malo(x.m))
      .sort((a, b) => (b.m.estado === 'critico' ? 1 : 0) - (a.m.estado === 'critico' ? 1 : 0));
    const refs = ['entregas', 'bugs'].map((id) => eq.medidas[id]).filter((m) => m && m.disponible);
    const provisional = refs.some((m) => m.referencia !== 'establecida');
    const pocoFiable = !!(fe && fe.revisar >= 3);
    const estado = pocoFiable ? 'poco_fiable' : cambios.length ? 'alerta' : provisional ? 'provisional' : 'estable';
    return {
      nombre: eq.nombre, tipo: info.tipo || 'interno', proveedor: info.proveedor || null, area: info.area || null,
      estado, medidas: Object.assign({}, eq.medidas, eq.kpis && eq.kpis.coste ? { coste: eq.kpis.coste } : {}), cambios,
      tiempo: N.tiempoPorEtapa(r.preparacion, eq.nombre), atascadas: eq.atascadas, enCurso: eq.enCurso, umbralEdad: eq.umbralEdad,
      sprints: eq.sprints, fiabilidad: fe ? { valores: fe.valores, revisar: fe.revisar, bien, medibles } : null,
      semanasConDatos: eq.semanasConDatos, entregadas: eq.entregadas, n: eq.n, casos: eq.casos,
    };
  }

  /** Recomendaciones del banco de casos, filtradas por el Context y agrupadas cuando se repiten (como en la v2). */
  function recomendaciones(r, cfg, det) {
    const porId = {}, out = [];
    const deEquipo = (id, gravedad, confianza, equipo, evidencia) => {
      if (!casoActivo(id, cfg, det)) return;
      const x = porId[id] = porId[id] || { id, gravedad: 'atencion', confianza: 'baja', equipos: [], evidencias: [], grupo: false };
      if (gravedad === 'critico') x.gravedad = 'critico';
      if (confianza === 'alta' || (confianza === 'media' && x.confianza === 'baja')) x.confianza = confianza;
      x.equipos.push(equipo); x.evidencias.push([equipo, evidencia]);
    };
    r.modelo.equipos.forEach((eq) => eq.casos.forEach((c) => deEquipo(c.id, c.gravedad, c.confianza, eq.nombre, c.evidencia)));
    r.casosAgentReady.forEach((c) => deEquipo(c.id, c.gravedad, 'alta', c.equipo, c.evidencia));
    Object.keys(porId).forEach((k) => out.push(porId[k]));
    const dims = r.casosGrupo.some((x) => x.dimension !== 'area') ? ['tipo', 'proveedor'] : ['area'];
    r.casosGrupo.filter((x) => dims.indexOf(x.dimension) >= 0 && casoActivo(x.id, cfg, det)).forEach((x) => {
      const cmp = r.comparaciones.filter((c) => c.dimension === x.dimension && c.ambito === x.ambito)[0];
      const g = cmp ? cmp.grupos.filter((y) => y.id === x.grupo)[0] : null;
      const eqs = g ? g.equipos : [x.grupo];
      if (x.id === 'grupo_calidad' && porId.retrabajo && eqs.every((e) => porId.retrabajo.equipos.indexOf(e) >= 0)) return;
      if (x.id === 'grupo_agent_ready' && porId.backlog_no_listo && eqs.some((e) => porId.backlog_no_listo.equipos.indexOf(e) >= 0)) return;
      out.push({ id: x.id, gravedad: x.gravedad, confianza: 'media', equipos: eqs, grupo: true, grupoNombre: g ? g.nombre : x.grupo, evidencias: [[null, x.evidencia]] });
    });
    out.forEach((x) => {
      const c = C().casos[x.id];
      x.caso = c; x.titulo = c.titulo; x.senal = c.senal; x.medida = c.medida || null;
      x.nivel = x.gravedad === 'critico' ? 'alto' : x.confianza === 'baja' ? 'bajo' : 'medio';
      x.evaluable = !!(x.medida && N.MEDIDAS_INICIATIVA[x.medida]);
      x.clave = x.id + '|' + x.equipos.join(',');
      x.fuente = 'banco';
    });
    const rango = { alto: 0, medio: 1, bajo: 2 };
    out.sort((a, b) => rango[a.nivel] - rango[b.nivel] || (b.grupo ? 1 : 0) - (a.grupo ? 1 : 0) || b.equipos.length - a.equipos.length || a.titulo.localeCompare(b.titulo));
    return out;
  }

  /** Data check: ¿aguanta este export el análisis? Mismas reglas que la v2. */
  function dataCheck(r, lectura, fiab, cfg, det) {
    const porId = {}; fiab.comprobaciones.forEach((x) => { porId[x.id] = x; });
    const num = (x) => { const m = x && /([\d.,]+)\s*%/.exec(x.valor); return m ? parseFloat(m[1].replace(',', '.')) / 100 : null; };
    const bloqueos = [], limites = [];
    const cobertura = num(porId.equipo), tareas = lectura.informe.tareas, semanas = r.modelo.semanas.length;
    if (tareas < 50) bloqueos.push({ clave: 'dc.bloqueo.tareas', p: { n: tareas } });
    if (cobertura != null && cobertura < 0.5) bloqueos.push({ clave: 'dc.bloqueo.equipo', p: { n: Math.round(cobertura * 100) } });
    if (semanas < 4) bloqueos.push({ clave: 'dc.bloqueo.semanas', p: { n: semanas } });
    const cols = columnas(cfg, det), c = contexto(cfg, det);
    cols.forEach((id) => {
      const eqs = r.modelo.equipos, conDato = eqs.filter((e) => { const m = med(e, id); return m && m.disponible; });
      if (conDato.length) { if (conDato.length < eqs.length) limites.push({ kpi: id, parcial: true, equipos: conDato.map((e) => e.nombre) }); return; }
      const m = med(eqs[0] || r.area.equipos[0], id);
      limites.push({ kpi: id, motivo: (m && m.motivo) || null });
    });
    if (c.proveedores && !hayProveedores(cfg)) limites.push({ kpi: null, clave: 'dc.limite.proveedores' });
    if (c.coste && !hayCoste(cfg)) limites.push({ kpi: null, clave: 'dc.limite.coste' });
    const avisos = fiab.comprobaciones.filter((x) => x.estado === 'revisar');
    const veredicto = bloqueos.length ? 'not_ready' : (limites.some((l) => !l.parcial) || fiab.nivel !== 'alta') ? 'limits' : 'ready';
    return { veredicto, bloqueos, limites, avisos, kpis: cols };
  }

  /** La vista-modelo completa. */
  function construirVM(r, entrada) {
    const { lectura, det, cfg } = entrada;
    const cols = columnas(cfg, det);
    const fiab = N.fiabilidad(lectura, det, r.preparacion, r.modelo, cfgCalculo(cfg, det));
    const equiposVM = r.modelo.equipos.map((eq) => fichaEquipo(r, eq, cols, fiab, cfg));
    const area = fichaEquipo(r, r.area.equipos[0], cols, null, cfg);
    const inis = r.iniciativas.map((x) => ({ ini: x.iniciativa, ev: x.evaluacion, s: N.seguimiento(x.iniciativa, x.evaluacion, r.preparacion) }));
    return {
      fechaDatos: det.fechaRef, semanaFin: r.modelo.semanaFin, semanas: { K: r.preparacion.ctx.K, KP: r.preparacion.ctx.KP, R: r.preparacion.ctx.R, N: r.modelo.semanas.length },
      kpis: cols, contexto: contexto(cfg, det), area, equipos: equiposVM,
      recs: recomendaciones(r, cfg, det), fiabilidad: fiab, dataCheck: dataCheck(r, lectura, fiab, cfg, det),
      comparaciones: r.comparaciones, casosGrupo: r.casosGrupo, iniciativas: inis, paquete: r.paquete, problemasPaquete: r.problemas,
      informe: lectura.informe, det, campoEquipo: campo(cfg, det), equiposMedidos: equipos(cfg, det), mapeo: mapeo(cfg, det),
      hayCoste: hayCoste(cfg), hayProveedores: hayProveedores(cfg),
    };
  }

  window.Puente = { OBJETIVOS, BASE, TRABAJO, contexto, columnas, casoActivo, campo, equipos, mapeo, cfgCalculo, clienteDe, iniciativas, diagnosticar, construirVM, hayCoste, hayProveedores, med };
})();
