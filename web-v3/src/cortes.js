/* easyperformance v3: cortes. Un corte es una foto fechada de las cifras ya calculadas (nunca de los ficheros):
   se guarda en este navegador cada vez que entran exports nuevos y se compara con el anterior.
   La demo solo tiene el corte actual y no se guarda. */
(function () {
  const EP = window.EP, K = EP.kit;
  const { S, t, tn, esc, valor, nombreMedida, nombreEquipo, fecha, cat } = EP;
  const MAX = 60;
  const MEDIDAS = ['entregas', 'ciclo', 'bugs', 'retrabajo', 'arrastradas', 'wip', 'errores'];
  S.cortes = []; S.cortesDemo = [];

  const listo = EP.idbGet('cortes').then((c) => { if (Array.isArray(c)) S.cortes = c; }).catch(() => { });
  const guardar = () => EP.idbSet('cortes', S.cortes);

  /** Huella de unos datos: misma fecha, mismas tareas y mismos ficheros dan el mismo corte. */
  function huella() {
    const inf = S.vm.informe;
    return [new Date(S.vm.fechaDatos).toISOString().slice(0, 10), inf.tareas, inf.ficheros.map((f) => f.nombre + ':' + f.filas).join('|'), S.vm.campoEquipo].join('@');
  }
  function foto() {
    const vm = S.vm, equipos = {};
    vm.equipos.forEach((e) => {
      const medidas = {};
      MEDIDAS.concat(vm.kpis).forEach((id) => { const m = e.medidas[id]; if (m && m.disponible && m.valor != null) medidas[id] = { v: m.valor, e: m.estado }; });
      equipos[e.nombre] = { estado: e.estado, alertas: e.cambios.map((c) => c.id), medidas, entregadas: e.entregadas, revisar: e.fiabilidad ? e.fiabilidad.revisar : null };
    });
    return {
      id: 'corte-' + Date.now().toString(36), creado: new Date().toISOString(), fechaDatos: new Date(vm.fechaDatos).toISOString(), huella: huella(),
      ficheros: vm.informe.ficheros.map((f) => ({ nombre: f.nombre, filas: f.filas })), tareas: vm.informe.tareas,
      fiabilidad: { nivel: vm.fiabilidad.nivel, bien: vm.fiabilidad.bien, n: vm.fiabilidad.comprobaciones.length }, kpis: vm.kpis.slice(), equipos,
      iniciativas: vm.iniciativas.map((x) => ({ id: x.ini.id, estado: x.s.estado, antes: x.s.antes, despues: x.s.despues })),
    };
  }
  /** Guarda un corte de las cifras actuales si estos datos no tienen ya uno. */
  function capturar(demo, silencio) {
    if (!S.vm) return null;
    if (demo || S.demo) { S.cortesDemo = [foto()]; return S.cortesDemo[0]; }
    const h = huella(), ya = S.cortes.filter((c) => c.huella === h)[0];
    if (ya) return null;
    const c = foto();
    S.cortes.push(c);
    S.cortes.sort((a, b) => a.fechaDatos.localeCompare(b.fechaDatos) || a.creado.localeCompare(b.creado));
    if (S.cortes.length > MAX) S.cortes = S.cortes.slice(-MAX);
    guardar();
    if (EP.carpeta) EP.carpeta.escribir('historico', c.id + '.json', JSON.stringify(c, null, 1));
    if (!silencio) setTimeout(() => EP.toast(t('cortes.guardado', { f: fecha(c.fechaDatos) })), 5200);
    return c;
  }
  function borrar(id) { S.cortes = S.cortes.filter((c) => c.id !== id); guardar(); }
  function borrarTodo() { S.cortes = []; S.cortesDemo = []; guardar(); }

  const RANGO = { estable: 0, provisional: 1, alerta: 2, poco_fiable: 3 };
  /** Sentido del cambio de una medida entre dos cortes según el catálogo: mejora, empeora o igual. */
  function sentido(id, antes, ahora) {
    if (antes == null || ahora == null) return null;
    const def = cat().medidas[id]; if (!def || !def.dir || def.dir === 'neutro') return null;
    const base = Math.max(Math.abs(antes), 1e-9), rel = (ahora - antes) / base;
    if (Math.abs(rel) < 0.05) return 'igual';
    return (rel > 0) === (def.dir === 'mas') ? 'mejora' : 'empeora';
  }
  function cortes() {
    const lista = (S.demo ? S.cortesDemo : S.cortes).slice().sort((a, b) => b.fechaDatos.localeCompare(a.fechaDatos) || b.creado.localeCompare(a.creado));
    const act = lista[0], ant = lista[1];
    const nombres = EP.visibles().map((e) => e.nombre);
    const pasos = `<div class="steps">${[1, 2, 3, 4].map((i) => `<div class="step"><span class="n">${i}</span><div><b>${esc(t('cortes.paso' + i + '.t'))}</b><div class="small muted">${esc(t('cortes.paso' + i + '.d'))}</div></div></div>`).join('')}</div>`;
    if (!act) return K.statusBar('neutral', esc(t('cortes.ninguno')), [esc(t('cortes.ningunoItems'))]) + pasos + `<div class="ficha empty">${esc(t('cortes.vacio'))} <button class="btn sm" data-action="corte-guardar">${esc(t('cortes.guardarAhora'))}</button></div>`;
    const pares = ant ? nombres.map((n) => ({ n, a: ant.equipos[n], b: act.equipos[n] })).filter((x) => x.a && x.b) : [];
    const mejora = pares.filter((x) => RANGO[x.b.estado] < RANGO[x.a.estado] || (x.b.estado === x.a.estado && x.b.alertas.length < x.a.alertas.length)).length;
    const empeora = pares.filter((x) => RANGO[x.b.estado] > RANGO[x.a.estado] || (x.b.estado === x.a.estado && x.b.alertas.length > x.a.alertas.length)).length;
    const frente = ant ? t('cortes.frente', { f: fecha(ant.fechaDatos) }) : t('cortes.sinAnterior');
    const tiles = `<div class="tiles">
      ${K.stat(t('cortes.tile.guardados'), String(lista.length), esc(S.demo ? t('cortes.tile.demo') : t('cortes.tile.guardadosPie')), '')}
      ${K.stat(t('cortes.tile.ultimo'), esc(fecha(act.fechaDatos)), esc(t('cortes.tile.ultimoPie', { n: act.tareas })), '')}
      ${K.stat(t('cortes.tile.mejoran'), String(mejora), esc(frente), '', { tone: mejora ? 'good' : undefined })}
      ${K.stat(t('cortes.tile.empeoran'), String(empeora), esc(frente), '', { tone: empeora ? 'bad' : undefined })}
    </div>`;
    const dest = K.destacados().filter((id) => id !== 'coste').slice(0, 3);
    const tarjetas = pares.map(({ n, a, b }) => {
      const filas = dest.map((id) => {
        const va = a.medidas[id] ? a.medidas[id].v : null, vb = b.medidas[id] ? b.medidas[id].v : null, s = sentido(id, va, vb);
        const chip = s ? K.chip(s === 'mejora' ? 'good' : s === 'empeora' ? 'bad' : 'neutral', t('cortes.' + s)) : '';
        return `<div class="m"><div class="m-l">${esc(nombreMedida(id))}</div><div class="m-v">${esc(valor(id, vb))}</div><div class="m-now">${esc(t('cortes.antes', { v: valor(id, va) }))}</div><div class="m-d">${chip}</div></div>`;
      }).join('');
      return K.ficha(`<button class="f-title link-plain" data-action="open-team" data-team="${esc(n)}">${esc(nombreEquipo(n))}</button>${K.equipoChip({ estado: b.estado })}`, `<div class="f-metrics">${filas}</div>`,
        `<span class="small muted">${esc(t('cortes.antesEstado', { e: t('equipo.estado.' + a.estado).toLowerCase() }))}</span>`);
    }).join('');
    const filas = lista.map((c, i) => `<div class="rrow corte">${K.chip(i === 0 ? 'info' : 'neutral', i === 0 ? t('cortes.actual') : t('cortes.anterior'))}<div class="rrow-t"><b>${esc(t('cortes.datosHasta', { f: fecha(c.fechaDatos) }))}</b><div class="small muted">${esc(tn('cortes.ficheros', c.ficheros.length))} · ${esc(tn('cortes.tareas', c.tareas))} · ${esc(t('cortes.fiab', { nivel: t('fiab.nivel.' + c.fiabilidad.nivel).toLowerCase() }))} · ${esc(tn('cortes.conAlerta', Object.keys(c.equipos).filter((k) => c.equipos[k].estado === 'alerta').length))}</div></div>${S.demo ? '' : `<button class="btn sm" data-action="corte-borrar" data-id="${esc(c.id)}">${esc(t('comun.borrar'))}</button>`}</div>`).join('');
    const titular = ant ? t('cortes.titular', { f: fecha(ant.fechaDatos), m: mejora, e: empeora }) : t('cortes.primero');
    return K.statusBar(empeora ? 'bad' : mejora ? 'good' : 'neutral', esc(titular), [esc(tn('cortes.cuenta', lista.length)), esc(t('cortes.soloCifras'))])
      + tiles + K.sec(t('cortes.como')) + pasos
      + (ant ? K.sec(t('cortes.cambios'), `<span class="muted small">${esc(t('cortes.cambiosNota', { f: fecha(ant.fechaDatos) }))}</span>`) + `<div class="fichas">${tarjetas}</div>` : '')
      + K.sec(t('cortes.historial'), S.demo ? '' : `<button class="btn sm" data-action="corte-guardar">${esc(t('cortes.guardarAhora'))}</button>`) + `<div class="ficha list">${filas}</div>`;
  }
  EP.accion('corte-borrar', (el) => { borrar(el.dataset.id); EP.render(); });
  EP.accion('corte-guardar', () => { const c = capturar(false, true); EP.toast(c ? t('cortes.guardado', { f: fecha(c.fechaDatos) }) : t('cortes.yaHay')); EP.render(); });

  EP.cortes = { listo, capturar, borrar, borrarTodo, sentido };
  Object.assign(EP.vistas, { cortes });
})();
