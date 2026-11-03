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

  /** Respuestas del Context: las guardadas o las de por defecto (Speed, Quality y Predictability).
   *  Un equipo marcado como proveedor activa la comparación aunque no se haya dicho en el Context:
   *  el onboarding ya no lo pregunta y los proveedores se pueden marcar después. */
  function contexto(cfg, det) {
    const c = cfg.contexto;
    if (c && c.hecho) return !c.proveedores && hayProveedores(cfg) ? Object.assign({}, c, { proveedores: true }) : c;
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
  /**
   * Configuración guardada con un nombre de equipo que ahora llega escrito distinto (solo mayúsculas o espacios, que la
   * lectura ya une): se pasa al nombre actual para que no se pierdan equipos elegidos, FTE, coste ni proveedores.
   */
  const claveNombre = (v) => String(v).replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
  function migrarNombres(cfg, det) {
    const o = opcion(det, campo(cfg, det));
    if (!o || o.id === 'todos') return false;
    const actual = new Map(o.valores.map((v) => [claveNombre(v.valor), v.valor]));
    const nuevo = (n) => actual.get(claveNombre(n)) || n;
    let cambio = false;
    ['equipos', 'equiposDescartados'].forEach((k) => {
      if (!Array.isArray(cfg[k])) return;
      const l = [...new Set(cfg[k].map(nuevo))];
      if (JSON.stringify(l) !== JSON.stringify(cfg[k])) { cfg[k] = l; cambio = true; }
    });
    // Equipos elegidos antes de que existieran los descartes: los no elegidos de ahora cuentan como descartados
    // (si no, todos saldrían como "equipos nuevos" la primera vez)
    if (Array.isArray(cfg.equipos) && cfg.equipos.length && cfg.equiposDescartados === undefined && cfg.campoEquipo === campo(cfg, det)) {
      cfg.equiposDescartados = o.valores.map((v) => v.valor).filter((v) => cfg.equipos.indexOf(v) < 0); cambio = true;
    }
    ['fte', 'coste', 'equiposInfo', 'fteOrigen', 'limites'].forEach((k) => {
      const m = cfg[k];
      if (!m || typeof m !== 'object') return;
      Object.keys(m).forEach((n) => { const nn = nuevo(n); if (nn !== n && m[nn] == null) { m[nn] = m[n]; delete m[n]; cambio = true; } });
    });
    return cambio;
  }
  // El mapeo de estados tiene tres capas: la propuesta del adaptador, la propuesta de la IA (cfg.mapeoIA, sin confirmar)
  // y lo que el usuario ha confirmado (cfg.mapeoEstados). Solo lo confirmado cuenta como revisado.
  // Un cliente de la v0 trae etapas (cfg.etapas) revisadas en su día: cuentan como confirmadas.
  const comunValido = (v) => !!(v && C().estados.estados[v]);
  function confirmados(cfg, det) {
    const src = cfg.mapeoEstados || (cfg.etapas ? N.etapasV0AMapeo(cfg.etapas, det.mapeoEstados) : {}), out = {};
    // Solo estados comunes que existen: un valor escrito a mano con un estado desconocido ni cuenta ni rompe el cálculo
    Object.keys(src).forEach((k) => { if (comunValido(src[k])) out[k] = src[k]; });
    return out;
  }
  /** Mapeo sin la capa de la IA: propuesta del adaptador y lo confirmado. */
  function mapeoSinIA(cfg, det) { return Object.assign({}, det.mapeoEstados, confirmados(cfg, det)); }
  function mapeo(cfg, det) {
    const m = Object.assign({}, det.mapeoEstados), ia = cfg.mapeoIA || {};
    Object.keys(ia).forEach((k) => { if (comunValido(ia[k])) m[k] = ia[k]; });
    return Object.assign(m, confirmados(cfg, det));
  }
  /** Cómo se ha decidido cada estado: confirmado, propuesto por la IA, por nombre, por categoría o por defecto. */
  function porMapeoCon(conf, cfg, e) {
    if (conf[e.nombre] != null) return 'confirmado';
    if (comunValido((cfg.mapeoIA || {})[e.nombre])) return 'ia';
    return e.propuestaPor;
  }
  function porMapeo(cfg, det, e) { return porMapeoCon(confirmados(cfg, det), cfg, e); }
  /** Estados que nadie ha revisado: no se reconocen por su nombre (o los ha tocado la IA) y nadie los ha confirmado. */
  function porRevisar(cfg, det) {
    const conf = confirmados(cfg, det);
    return det.estados.filter((e) => { const p = porMapeoCon(conf, cfg, e); return p !== 'confirmado' && p !== 'nombre'; });
  }
  /** Guarda lo confirmado con la marca de que ya se distingue confirmado de propuesto. */
  function fijarConfirmados(cfg, m) { cfg.mapeoEstados = m; cfg.mapeoRevision = 2; }
  /** Lo que se guarda al seguir sin revisar: lo ya confirmado y los estados reconocidos por nombre. Los dudosos no. */
  function confirmarReconocidos(cfg, det) {
    const conf = confirmados(cfg, det), m = mapeo(cfg, det), out = Object.assign({}, conf);
    det.estados.forEach((e) => { if (porMapeoCon(conf, cfg, e) === 'nombre') out[e.nombre] = m[e.nombre]; });
    return out;
  }
  /**
   * Configuraciones de antes de este cambio: "Confirmar todos" y el arranque guardaban todos los estados, también
   * los dudosos que nadie miró. Los dudosos que siguen igual que la propuesta vuelven a quedar por revisar;
   * los que el usuario cambió se respetan. Devuelve true si ha cambiado algo.
   */
  function migrarMapeo(cfg, det) {
    if (!cfg.mapeoEstados || cfg.mapeoRevision >= 2) return false;
    const m = Object.assign({}, cfg.mapeoEstados);
    det.estados.forEach((e) => { if (e.propuestaPor !== 'nombre' && m[e.nombre] === det.mapeoEstados[e.nombre]) delete m[e.nombre]; });
    fijarConfirmados(cfg, m);
    return true;
  }
  function cfgCalculo(cfg, det) {
    const c = { campoEquipo: campo(cfg, det), equipos: equipos(cfg, det), mapeoEstados: mapeo(cfg, det), fte: cfg.fte || {}, limites: {},
      estadosPorRevisar: porRevisar(cfg, det).map((e) => e.nombre), sinEstimacion: cfg.columnaEstimacion === '' };
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
    return { version: 2, nombre: cfg.nombre || '', sector: cfg.sector || '', plataforma: det.plataforma || 'jira', mapeoEstados: mapeo(cfg, det), equipos: { campo: campo(cfg, det), lista },
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

  /** Lectura con los tipos que decide el cliente (mapeo de tipos y etiqueta de bug). Se reutiliza mientras no cambien. */
  let cacheTipos = { lectura: null, clave: null, salida: null };
  function lecturaCalculo(lectura, cfg) {
    const reglas = { mapeoTipos: cfg.mapeoTipos || null, etiquetaBug: cfg.etiquetaBug || null };
    const clave = JSON.stringify(reglas);
    if (cacheTipos.lectura !== lectura || cacheTipos.clave !== clave) cacheTipos = { lectura, clave, salida: N.aplicarReglasTipo(lectura, reglas) };
    return cacheTipos.salida;
  }

  /** Recorrido completo: diagnóstico del núcleo con la configuración del cliente. */
  function diagnosticar(lectura, det, cfg, extraIni, contextoDocs) {
    return N.diagnosticar(lecturaCalculo(lectura, cfg), clienteDe(cfg, det), iniciativas(cfg, extraIni), contextoDocs || null, { config: cfgCalculo(cfg, det), generado: new Date() });
  }

  // ---------- piezas de la VM ----------
  const med = (eq, id) => (id === 'coste' ? (eq.kpis && eq.kpis.coste) || { id: 'coste', disponible: false, motivo: null, falta: 'coste' } : eq.medidas[id]);
  const malo = (m) => m && m.disponible && (m.estado === 'atencion' || m.estado === 'critico');
  /** Nivel de una recomendación: alto si el caso es grave; bajo si hay pocas semanas de datos. */
  const nivelDe = (gravedad, confianza) => (gravedad === 'critico' ? 'alto' : confianza === 'baja' ? 'bajo' : 'medio');
  const RANGO_NIVEL = { alto: 0, medio: 1, bajo: 2 };
  // Medidas de las que sale cada caso. Si alguna está "por revisar" en un equipo, el caso no se le recomienda:
  // primero hay que arreglar el dato (lo dice su ficha), y una recomendación sobre un dato dudoso parece una certeza.
  const MEDIDAS_CASO = {
    demasiado_a_la_vez: ['wip', 'ciclo', 'entregas'], sprint_no_cumple: ['arrastradas'], pendiente_crece: ['pendiente'], mucha_espera: ['espera'],
    retrabajo: ['retrabajo'], errores_capacidad: ['errores'], entregas_irregulares: ['regularidad', 'entregas'], estimaciones_no_predicen: ['estimacion'],
  };
  /**
   * Qué medidas vuelve dudosas cada comprobación de fiabilidad cuando falla en un equipo (o en el área). Una cifra que
   * depende de un dato mal registrado no puede salir "normal" ni "mejor": sale "Revisar el dato" (auditoría UX, P0.1).
   * - tiempos: sin el tiempo en cada estado no se saben el tiempo de ciclo, la espera ni el retrabajo.
   * - flujo: si las tareas saltan de pendiente a hecho, el ciclo sale corto, el retrabajo a cero y el trabajo en curso bajo.
   * - registro: si se crean al terminar, el tiempo total, la primera respuesta, el ciclo y el pendiente no son reales.
   * - estimacion: sin estimar las historias, la velocidad y la precisión de la estimación no cuentan todo.
   * - sprints: sin sprints creíbles, ni lo arrastrado ni la fiabilidad del sprint.
   */
  const DUDOSO_POR = {
    tiempos: ['ciclo', 'espera', 'retrabajo'], flujo: ['ciclo', 'espera', 'retrabajo', 'wip'], registro: ['ciclo', 'total', 'primera', 'pendiente'],
    estimacion: ['velocidad', 'estimacion'], sprints: ['arrastradas', 'fiabilidad'],
  };
  /** En el área, parte mínima de las tareas en equipos donde falla una comprobación para que sus cifras salgan por revisar. */
  const DUDOSO_PARTE_AREA = 0.25;
  const casoSobreDatoDudoso = (id, eq) => (MEDIDAS_CASO[id] || []).some((k) => { const m = med(eq, k); return !!(m && m.disponible && m.revisar); });

  /**
   * Previsión por probabilidad desde las entregas reales de las últimas 12 semanas: cuántas tareas en 4 semanas
   * y cuándo termina lo que hay en curso. null si no hay semanas suficientes con entregas.
   */
  function previsionDe(eq, desde) {
    const m = N.muestraDeRitmo(eq.series.entregas);
    if (!m) return null;
    const enCurso = (eq.enCurso || []).length;
    // Las fechas cuentan desde la fecha de los datos, no desde el lunes: la semana en curso no cuenta como una semana entera
    return { muestra: m, desde, cuatro: N.cuantasEnSemanas(m, 4, 4), enCurso, cuandoEnCurso: enCurso ? N.cuandoTerminan(m, enCurso, N.SEMILLA_CUANDO) : null };
  }
  /** Reparto de lo terminado por el campo que ha elegido el cliente. */
  function repartoDe(r, eq, cfg) {
    if (!cfg.columnaReparto) return null;
    const p = r.preparacion, items = p.porEquipo[eq.nombre] || [].concat(...p.nombresEquipo.map((n) => p.porEquipo[n] || []));
    const filas = N.repartoPorCampo(items, p.ctx.semanaFin);
    return filas.length ? { campo: cfg.columnaReparto, filas } : null;
  }

  /** Estado con las recomendaciones urgentes: "Pide atención" pasa por delante de revisar el dato y de estable, no de los demás. */
  const conGraves = (sinGraves, nGraves) => (nGraves && (sinGraves === 'revisar' || sinGraves === 'estable') ? 'atencion' : sinGraves);
  /** Ficha de un equipo (o del área). */
  function fichaEquipo(r, eq, cols, fiab, cfg, det, esArea) {
    const info = (cfg.equiposInfo || {})[eq.nombre] || {};
    // El área no tiene comprobaciones propias por equipo (aunque se llame como uno): sus cifras miran las del área
    const fe = !esArea && fiab && fiab.porEquipo.filter((x) => x.equipo === eq.nombre)[0];
    const bien = fe ? N.COMPROBACIONES_EQUIPO.filter((k) => fe.valores[k] && fe.valores[k].estado === 'bien').length : null;
    const medibles = fe ? N.COMPROBACIONES_EQUIPO.filter((k) => fe.valores[k] && fe.valores[k].estado !== 'sin').length : null;
    // Un cierre masivo en las semanas que se miden: las entregas de esas semanas no son de fiar, se marcan para revisar
    const ctx = r.preparacion.ctx, desdeVentana = new Date(ctx.semanaFin.getTime() - 7 * 864e5 * ctx.K);
    const masivos = ((eq.calidad && eq.calidad.diasMasivos) || []).filter((x) => new Date(x.fecha) >= desdeVentana && new Date(x.fecha) < ctx.semanaFin);
    let medidasEq = eq.medidas;
    if (masivos.length) {
      medidasEq = Object.assign({}, eq.medidas);
      // Las medidas que cuentan lo terminado: entregas y velocidad (puntos terminados)
      ['entregas', 'velocidad'].forEach((id) => { const m = eq.medidas[id]; if (m && m.disponible && !m.revisar) medidasEq[id] = Object.assign({}, m, { revisar: 'masivo', diasMasivos: masivos }); });
    }
    // Comprobaciones de fiabilidad que fallan en este equipo: sus medidas salen por revisar (dudosoPor dice cuáles)
    const dudosas = {};
    if (fe) {
      const fallan = Object.keys(DUDOSO_POR).filter((k) => fe.valores[k] && fe.valores[k].estado === 'revisar');
      fallan.forEach((k) => DUDOSO_POR[k].forEach((id) => { (dudosas[id] = dudosas[id] || { por: [] }).por.push(k); }));
    } else if (esArea && fiab) {
      // En el área, una cifra es dudosa si los equipos donde esa cifra es dudosa suman el 25 % de las tareas o más: un
      // equipo pequeño apenas la mueve, varios equipos con fallos distintos sí. Si una comprobación falla en el área sin
      // fallar en ningún equipo, lo que depende de ella es dudoso en el área entera. Se guarda la parte de las tareas.
      const pe = r.preparacion.porEquipo, n = (nombre) => (pe[nombre] || []).length;
      const total = fiab.porEquipo.reduce((s, x) => s + n(x.equipo), 0);
      const fallaArea = (k) => fiab.comprobaciones.some((c) => c.id === k && c.estado === 'revisar');
      const fallaEn = (x, k) => !!(x.valores[k] && x.valores[k].estado === 'revisar');
      [...new Set([].concat(...Object.values(DUDOSO_POR)))].forEach((id) => {
        const ks = Object.keys(DUDOSO_POR).filter((k) => DUDOSO_POR[k].indexOf(id) >= 0 && fallaArea(k));
        if (!ks.length) return;
        const enTodo = ks.filter((k) => !fiab.porEquipo.some((x) => fallaEn(x, k)));
        const malos = fiab.porEquipo.filter((x) => ks.some((k) => fallaEn(x, k)));
        const parte = total ? malos.reduce((s, x) => s + n(x.equipo), 0) / total : 0;
        if (enTodo.length) dudosas[id] = { por: ks, parte: 1, area: true };
        else if (parte >= DUDOSO_PARTE_AREA) dudosas[id] = { por: ks.filter((k) => malos.some((x) => fallaEn(x, k))), parte };
      });
    }
    if (Object.keys(dudosas).length) {
      if (medidasEq === eq.medidas) medidasEq = Object.assign({}, eq.medidas);
      // Una alerta se queda (no se esconde un "peor de lo normal"); lo que saldría normal o mejor pasa a "Revisar el dato".
      // Sin cifra no hay nada que leer mal: una medida sin valor se queda como está.
      Object.keys(dudosas).forEach((id) => {
        const m = medidasEq[id], d = dudosas[id];
        if (!m || !m.disponible || m.valor == null || m.revisar || malo(m)) return;
        medidasEq[id] = Object.assign({}, m, { revisar: 'dato', dudosoPor: d.por }, esArea ? { dudosoParte: d.parte, dudosoArea: !!d.area } : {});
      });
    }
    eq = Object.assign({}, eq, { medidas: medidasEq });
    const cambios = cols.map((id) => ({ id, m: med(eq, id) })).filter((x) => malo(x.m))
      .sort((a, b) => (b.m.estado === 'critico' ? 1 : 0) - (a.m.estado === 'critico' ? 1 : 0));
    const refs = ['entregas', 'bugs'].map((id) => eq.medidas[id]).filter((m) => m && m.disponible);
    const provisional = refs.some((m) => m.referencia !== 'establecida');
    const pocoFiable = !!(fe && fe.revisar >= 3);
    // Medidas cuya comparación no es de fiar (lo normal era cero, o un salto de más del triple) y medidas mejor de lo normal
    const revisarDato = cols.filter((id) => { const m = med(eq, id); return m && m.disponible && m.revisar && !malo(m); });
    const mejores = cols.filter((id) => { const m = med(eq, id); return m && m.disponible && !m.revisar && m.estado === 'bien' && m.lado === 'mejor'; });
    // Límite fijo superado con la línea base dentro o mejor: no es una alerta, se enseña aparte como aviso
    const avisos = cols.map((id) => ({ id, m: med(eq, id) })).filter((x) => x.m && x.m.disponible && x.m.aviso && !malo(x.m));
    // Casos graves (recomendación de nivel alto) aunque sus medidas estén dentro de lo normal: el equipo no está "estable"
    const graves = esArea ? [] : (eq.casos || []).concat((r.casosAgentReady || []).filter((c) => c.equipo === eq.nombre))
      .filter((c) => c.gravedad === 'critico' && casoActivo(c.id, cfg, det) && !casoSobreDatoDudoso(c.id, eq)).map((c) => c.id);
    // Un solo estado por equipo, el mismo en banner, tarjeta, ficha y presentación (auditoría UX, P0.3). Orden: poco fiable,
    // alerta, provisional (afecta a todas sus cifras), pide atención, revisar el dato, estable. Una recomendación urgente va
    // por delante de un dato por revisar: no depende de ese dato (si dependiera, no se habría hecho). El banner y el pie
    // dicen también lo que el estado no enseña (una recomendación urgente o un dato por revisar en un equipo provisional).
    const estadoSinGraves = pocoFiable ? 'poco_fiable' : cambios.length ? 'alerta' : provisional ? 'provisional' : revisarDato.length ? 'revisar' : 'estable';
    const estado = conGraves(estadoSinGraves, graves.length);
    return {
      nombre: eq.nombre, tipo: info.tipo || 'interno', proveedor: info.proveedor || null, area: info.area || null,
      estado, estadoSinGraves, medidas: Object.assign({}, eq.medidas, eq.kpis && eq.kpis.coste ? { coste: eq.kpis.coste } : {}), cambios, avisos, revisarDato, mejores, graves, gravesTodas: graves,
      tiempo: N.tiempoPorEtapa(r.preparacion, eq.nombre), atascadas: eq.atascadas, enCurso: eq.enCurso, umbralEdad: eq.umbralEdad,
      sprints: eq.sprints, fiabilidad: fe ? { valores: fe.valores, revisar: fe.revisar, bien, medibles } : null,
      semanasConDatos: eq.semanasConDatos, entregadas: eq.entregadas, n: eq.n, casos: eq.casos,
      prevision: previsionDe(eq, r.preparacion.ctx.fechaRef), reparto: repartoDe(r, eq, cfg),
    };
  }

  /** Recomendaciones del banco de casos, filtradas por el Context y agrupadas cuando se repiten (como en la v2). */
  function recomendaciones(r, cfg, det, equiposVM) {
    const porId = {}, out = [];
    // Las medidas de la ficha (con lo marcado "por revisar", como los cierres masivos): de ahí se sabe qué dato es dudoso
    const fichaDe = {}; (equiposVM || []).forEach((e) => { fichaDe[e.nombre] = e; });
    const deEquipo = (id, gravedad, confianza, equipo, evidencia) => {
      if (!casoActivo(id, cfg, det)) return;
      if (fichaDe[equipo] && casoSobreDatoDudoso(id, fichaDe[equipo])) return;
      const x = porId[id] = porId[id] || { id, gravedad: 'atencion', confianza: 'baja', equipos: [], evidencias: [], grupo: false, porEquipo: {}, ordenModelo: [] };
      if (gravedad === 'critico') x.gravedad = 'critico';
      if (confianza === 'alta' || (confianza === 'media' && x.confianza === 'baja')) x.confianza = confianza;
      x.equipos.push(equipo); x.evidencias.push([equipo, evidencia]); x.ordenModelo.push(equipo);
      // Cada equipo con su nivel y su evidencia: la ficha de un equipo no enseña la de otro ni el nivel del peor
      x.porEquipo[equipo] = { gravedad, confianza, evidencia, nivel: nivelDe(gravedad, confianza) };
    };
    r.modelo.equipos.forEach((eq) => eq.casos.forEach((c) => deEquipo(c.id, c.gravedad, c.confianza, eq.nombre, c.evidencia)));
    r.casosAgentReady.forEach((c) => deEquipo(c.id, c.gravedad, 'alta', c.equipo, c.evidencia));
    // Primero el equipo con el nivel más alto: su evidencia es la que explica el nivel de la recomendación
    Object.keys(porId).forEach((k) => {
      const x = porId[k], orden = x.equipos.map((e, i) => i).sort((a, b) => RANGO_NIVEL[x.porEquipo[x.equipos[a]].nivel] - RANGO_NIVEL[x.porEquipo[x.equipos[b]].nivel] || a - b);
      x.equipos = orden.map((i) => x.equipos[i]); x.evidencias = orden.map((i) => x.evidencias[i]);
    });
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
      x.nivel = nivelDe(x.gravedad, x.confianza);
      x.evaluable = !!(x.medida && N.MEDIDAS_INICIATIVA[x.medida]);
      // La clave (con la que se guarda un descarte) sigue el orden del modelo, no el de urgencia: así no cambia entre cargas
      x.clave = x.id + '|' + (x.ordenModelo || x.equipos).join(',');
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
    if (semanas < 4) bloqueos.push({ clave: 'dc.bloqueo.semanas', p: { n: semanas }, duro: true, accion: 'datos' });
    // Sin entregas no hay nada que medir: se para aquí y se dice por qué, en vez de presentar ceros como normales
    const ts = lectura.tareas || [], conFin = ts.filter((x) => x.fechas && x.fechas.terminada).length;
    const entregadas = r.modelo.equipos.reduce((n, e) => n + (e.entregadas || 0), 0);
    const campoFin = lectura.informe.campos ? lectura.informe.campos.resuelta : undefined;
    if (ts.length && !conFin) bloqueos.push(campoFin === true || campoFin === 'vacio' ? { clave: 'dc.bloqueo.soloAbierto', duro: true, accion: 'datos' } : { clave: 'dc.bloqueo.sinFechaFin', duro: true, accion: 'datos' });
    else if (conFin && !entregadas) bloqueos.push({ clave: 'dc.bloqueo.sinTerminado', p: { n: conFin }, duro: true, accion: 'estados' });
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
    // Con fiabilidad baja se puede mirar, pero no decidir: las cifras afectadas salen "Revisar el dato"
    const veredicto = bloqueos.length ? 'not_ready' : fiab.nivel === 'baja' ? 'look_only' : (limites.some((l) => !l.parcial) || fiab.nivel !== 'alta') ? 'limits' : 'ready';
    return { veredicto, bloqueos, limites, avisos, kpis: cols };
  }

  /**
   * Recomendaciones urgentes que siguen activas en cada equipo (sin las descartadas). Un equipo "Pide atención" solo
   * mientras tenga alguna; si se descartan todas, vuelve a lo que diría sin ellas (estable, provisional o revisar el dato).
   */
  function ajustarAtencion(vm, descartadas) {
    const desc = descartadas || {};
    vm.equipos.forEach((e) => {
      e.graves = (e.gravesTodas || []).filter((id) => vm.recs.some((r) => r.id === id && r.equipos.indexOf(e.nombre) >= 0 && !desc[r.clave]));
      const base = e.estadoSinGraves || (e.estado === 'atencion' ? 'estable' : e.estado);
      e.estado = conGraves(base, e.graves.length);
    });
    return vm;
  }
  /**
   * Equipos que se ven en el export y no se miden: los de menos del 2 % (o no elegidos) y las tareas sin equipo.
   * "Nuevos" son los que han llegado con un export después de elegir equipos y no se han descartado.
   */
  function fueraDeMedicion(cfg, det, tareas) {
    const cp = campo(cfg, det), o = opcion(det, cp), medidos = equipos(cfg, det);
    if (!o || o.id === 'todos') return { fuera: [], sinEquipo: 0, nuevos: [] };
    const total = tareas || o.valores.reduce((s, v) => s + v.n, 0), conEquipo = o.valores.reduce((s, v) => s + v.n, 0);
    const elegidos = !!(cfg.equipos && cfg.equipos.length && cfg.campoEquipo === cp);
    const descartados = cfg.equiposDescartados || [];
    const fuera = o.valores.filter((v) => medidos.indexOf(v.valor) < 0).map((v) => ({ nombre: v.valor, n: v.n, poco: v.n / Math.max(1, conEquipo) < 0.02 }));
    return { fuera, sinEquipo: Math.max(0, total - conEquipo), nuevos: elegidos ? fuera.filter((v) => !v.poco && descartados.indexOf(v.nombre) < 0).map((v) => v.nombre) : [] };
  }
  /** La vista-modelo completa. */
  function construirVM(r, entrada) {
    const { det, cfg } = entrada, lectura = lecturaCalculo(entrada.lectura, cfg);
    const cols = columnas(cfg, det);
    const fiab = N.fiabilidad(lectura, det, r.preparacion, r.modelo, cfgCalculo(cfg, det));
    const equiposVM = r.modelo.equipos.map((eq) => fichaEquipo(r, eq, cols, fiab, cfg, det));
    const area = fichaEquipo(r, r.area.equipos[0], cols, fiab, cfg, det, true);
    const inis = r.iniciativas.map((x) => ({ ini: x.iniciativa, ev: x.evaluacion, s: N.seguimiento(x.iniciativa, x.evaluacion, r.preparacion) }));
    return ajustarAtencion({
      fechaDatos: det.fechaRef, semanaFin: r.modelo.semanaFin, semanas: { K: r.preparacion.ctx.K, KP: r.preparacion.ctx.KP, R: r.preparacion.ctx.R, N: r.modelo.semanas.length },
      kpis: cols, contexto: contexto(cfg, det), area, areaSin: r.areaSin || [], equipos: equiposVM,
      recs: recomendaciones(r, cfg, det, equiposVM), fiabilidad: fiab, dataCheck: dataCheck(r, lectura, fiab, cfg, det),
      comparaciones: r.comparaciones, casosGrupo: r.casosGrupo, iniciativas: inis, paquete: r.paquete, problemasPaquete: r.problemas,
      informe: lectura.informe, det, campoEquipo: campo(cfg, det), equiposMedidos: equipos(cfg, det), mapeo: mapeo(cfg, det),
      fuera: fueraDeMedicion(cfg, det, (lectura.tareas || []).length),
      hayCoste: hayCoste(cfg), hayProveedores: hayProveedores(cfg),
      epicas: N.vistaEpicas(r.preparacion, lectura.epicas || []),
    }, entrada.descartadas);
  }

  window.Puente = { migrarNombres, OBJETIVOS, BASE, TRABAJO, contexto, columnas, casoActivo, campo, equipos, mapeo, mapeoSinIA, porMapeo, porRevisar, confirmarReconocidos, fijarConfirmados, migrarMapeo, lecturaCalculo, cfgCalculo, clienteDe, iniciativas, diagnosticar, construirVM, ajustarAtencion, casoSobreDatoDudoso, hayCoste, hayProveedores, med };
})();
