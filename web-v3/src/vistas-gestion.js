/* easyperformance v3: Recomendaciones (banco de casos e IA validada), Iniciativas (con control), Fuentes y mapeo, Ajustes,
   modo presentación y resumen redactado. */
(function () {
  const EP = window.EP, K = EP.kit;
  const { S, N, t, tn, esc, valor, nombreMedida, nombreEquipo, fecha, cat, lista } = EP;
  const IA = N.IA;
  const proveedor = () => IA.proveedorAnthropic({ clave: S.ia.clave, modelo: S.ia.modelo || IA.MODELO_POR_DEFECTO });
  const hayIa = () => !!S.ia.clave;
  /** Fecha de hoy en la hora local, como aaaa-mm-dd. */
  const hoyLocal = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // ---------- recomendaciones ----------
  /** Recomendaciones de la IA que no repiten un caso del banco; las que lo repiten se marcan como "IA de acuerdo" en el caso. */
  function recsIa() {
    S.vm.recs.forEach((r) => { r.ia = null; });
    if (!S.iaRecs || S.iaRecsDe !== S.lectura) return [];
    return S.iaRecs.filter((x) => {
      if (x.causa.caso && !EP.P.casoActivo(x.causa.caso, S.cfg, S.det)) return false;
      const mismo = x.causa.caso && S.vm.recs.filter((c) => c.id === x.causa.caso && !c.ia && x.equipos.some((e) => c.equipos.indexOf(e) >= 0))[0];
      if (mismo) { mismo.ia = x; return false; }
      return true;
    }).map((x, i) => ({ fuente: 'ia', clave: 'ia|' + i + '|' + x.titulo, titulo: x.titulo, equipos: x.equipos, nivel: x.confianza === 'high' ? 'alto' : x.confianza === 'medium' ? 'medio' : 'bajo', ia: x, medida: x.medida, evaluable: !!(x.medida && N.MEDIDAS_INICIATIVA[x.medida]), evidencias: x.evidencia.map((e) => [e.equipo, e.texto]) }));
  }
  /** Iniciativa que ya mide una recomendación: mismo caso del banco y algún equipo en común. */
  function iniDeRec(r) { const caso = r.fuente === 'ia' ? null : r.id; return (S.cfg.iniciativas || []).concat(S.extraIni || []).filter((i) => caso && i.origen === caso && i.equipos.some((e) => r.equipos.indexOf(e) >= 0))[0]; }
  function recCard(r, opts) {
    opts = opts || {};
    const ev = r.evidencias.slice(0, 2).map((x) => `<div class="small">${x[0] ? `<b>${esc(nombreEquipo(x[0]))}:</b> ` : ''}${esc(x[1])}</div>`).join('');
    const ini = iniDeRec(r);
    const botones = [
      r.fuente === 'ia' ? '' : `<button class="btn sm" data-action="drill" data-kind="caso" data-id="${esc(r.clave)}">${esc(t('recs.porque'))}</button>`,
      ini ? K.chip('good', t('recs.yaIniciativa')) : r.evaluable ? `<button class="btn sm primary" data-action="rec-ini" data-id="${esc(r.clave)}">${esc(t('recs.crearIni'))}</button>` : '',
      opts.descartada ? `<button class="link small" data-action="rec-restore" data-id="${esc(r.clave)}">${esc(t('recs.restaurar'))}</button>` : `<button class="link small" data-action="rec-dismiss" data-id="${esc(r.clave)}">${esc(t('recs.descartar'))}</button>`,
    ].join('');
    const cab = `<div class="f-title">${esc(r.titulo)}</div>${r.fuente === 'ia' ? K.chip('info', t('recs.ia')) : K.nivelChip(r.nivel)}`;
    const cuerpo = `<div class="meta">${K.chip('neutral', K.paraQuien(r))}${r.ia && r.fuente !== 'ia' ? K.chip('info', t('recs.iaDeAcuerdo')) : ''}</div>`
      + (r.fuente === 'ia' ? `<div class="small"><b>${esc(t('recs.accion'))}</b> ${esc(r.ia.accion)}</div><div class="small"><b>${esc(t('recs.primerPaso'))}</b> ${esc(r.ia.primer_paso)}</div>` : `<div class="small muted">${esc(r.senal)}</div>`)
      + `<div class="evid">${ev}</div>`;
    return K.ficha(cab, cuerpo, `<div class="row">${botones}</div>`, ` data-rec="${esc(r.clave)}"`);
  }
  function recomendaciones() {
    const eqs = EP.visibles(), nombres = eqs.map((e) => e.nombre);
    if (S.role === 'equipo') S.recFilter = nombres[0] || 'todos';
    const ia = recsIa();
    const todas = EP.vistas.recsActivas(eqs).concat(ia.filter((r) => !S.dismissed[r.clave] && r.equipos.some((e) => nombres.indexOf(e) >= 0)));
    const enFiltro = (r) => (S.recFilter === 'todos' || r.equipos.indexOf(S.recFilter) >= 0) && (!S.recLevel || r.nivel === S.recLevel);
    const vistas = todas.filter(enFiltro);
    const descartadas = S.vm.recs.filter((r) => S.dismissed[r.clave] && enFiltro(r));
    const n = (l) => todas.filter((r) => r.nivel === l).length;
    const estado = S.iaEstado.recs, nIa = S.iaRecs && S.iaRecsDe === S.lectura ? S.iaRecs.length : 0;
    const iaPie = !hayIa() ? esc(t('ia.sinClave')) : estado === 'trabajando' ? esc(t('ia.trabajando')) : estado === 'error' ? esc(t('ia.error', { e: S.iaError.recs || '' })) : nIa ? esc(t('ia.recsValidadas', { n: nIa, d: S.iaDescartadas })) : esc(t('ia.recsQue'));
    // Filtros en una fila: equipo, nivel y, si hay clave, las propuestas de la IA
    const niveles = `<div class="seg-f">${['alto', 'medio', 'bajo'].map((l) => `<button class="pill${S.recLevel === l ? ' active' : ''}" data-action="rec-level" data-level="${l}">${esc(t('nivel.' + l))} <b>${n(l)}</b></button>`).join('')}</div>`;
    const selEquipo = S.role === 'equipo' ? '' : `<select class="sm" data-change="rec-team"><option value="todos">${esc(t('recs.todosEquipos', { n: todas.length }))}</option>${eqs.map((e) => `<option value="${esc(e.nombre)}" ${S.recFilter === e.nombre ? 'selected' : ''}>${esc(nombreEquipo(e.nombre))} (${todas.filter((r) => r.equipos.indexOf(e.nombre) >= 0).length})</option>`).join('')}</select>`;
    const iaCtl = hayIa() ? `<span class="row"><button class="btn sm" data-action="ia-recs" ${estado === 'trabajando' ? 'disabled' : ''}>${esc(nIa ? t('ia.otraVez') : t('ia.generar'))}</button><span class="small muted">${iaPie}</span></span>` : '';
    const tiles = `<div class="filtros">${selEquipo}${niveles}${iaCtl}</div>`;
    const primera = vistas[0];
    const status = K.statusBar(n('alto') ? 'bad' : n('medio') ? 'warn' : 'good', primera ? esc(t('recs.loPrimero', { titulo: primera.titulo, para: K.paraQuien(primera) })) : esc(t('recs.ninguna')), [esc(t('recs.items1')), esc(t('recs.items2'))]);
    const cuerpo = vistas.length ? `<div class="fichas cols-2">${vistas.map((r) => recCard(r)).join('')}</div>` : `<div class="ficha empty">${esc(descartadas.length ? t('recs.todasDescartadas') : t('recs.ningunaFiltro'))}</div>`;
    const caja = descartadas.length ? `<details class="dismissed"><summary>${esc(tn('recs.descartadas', descartadas.length))}</summary><div class="fichas cols-2">${descartadas.map((r) => recCard(r, { descartada: true })).join('')}</div></details>` : '';
    return status + tiles + cuerpo + caja;
  }
  EP.accion('rec-level', (el) => { S.recLevel = S.recLevel === el.dataset.level ? null : el.dataset.level; EP.render(); });
  EP.accion('rec-filter', (el) => { S.recFilter = el.dataset.team; EP.render(); });
  EP.cambio('rec-team', (el) => { S.recFilter = el.value; EP.render(); });
  EP.accion('rec-dismiss', (el) => { S.dismissed[el.dataset.id] = true; EP.guardarPrefs(); EP.render(); EP.toast(t('recs.descartada')); });
  EP.accion('rec-restore', (el) => { delete S.dismissed[el.dataset.id]; EP.guardarPrefs(); EP.render(); });
  EP.accion('rec-ini', (el) => {
    const r = S.vm.recs.concat(recsIa()).filter((x) => x.clave === el.dataset.id)[0]; if (!r) return;
    S.iniForm = { nombre: r.titulo, equipos: r.equipos.slice(), medida: r.medida, inicio: hoyLocal(), origen: r.fuente === 'ia' ? (r.ia.causa && r.ia.causa.caso) || 'propia' : r.id, efecto: r.caso ? r.caso.comprobar : (r.ia ? r.ia.comprobar : '') };
    S.drill = null; EP.go('iniciativas');
  });
  EP.accion('ia-recs', () => {
    S.iaEstado.recs = 'trabajando'; EP.render();
    proveedor()(IA.peticionRecomendaciones(S.vm.paquete, cat(), window.I18N.lang)).then((texto) => {
      const v = IA.validarRecomendaciones(texto, S.vm.paquete, cat());
      S.iaRecs = v.recomendaciones; S.iaRecsDe = S.lectura; S.iaDescartadas = v.descartadas.length; S.iaEstado.recs = 'hecho'; EP.render();
    }).catch((e) => { S.iaEstado.recs = 'error'; S.iaError.recs = e.message; EP.render(); });
  });
  function cajonCaso(d) {
    const r = S.vm.recs.filter((x) => x.clave === d.id)[0];
    if (!r) return [t('recs.titulo'), ''];
    const c = r.caso;
    let html = `<div class="meta">${K.nivelChip(r.nivel)}${K.chip('neutral', K.paraQuien(r))}</div><p><b>${esc(t('caso.senal'))}</b> ${esc(c.senal)}</p>`;
    html += `<h4>${esc(t('caso.evidencia'))}</h4>${r.evidencias.map((x) => `<p class="small">${x[0] ? `<b>${esc(nombreEquipo(x[0]))}:</b> ` : ''}${esc(x[1])}</p>`).join('')}`;
    if (c.comun && r.equipos.length > 1) html += `<p class="small muted">${esc(c.comun)}</p>`;
    html += `<h4>${esc(t('caso.causas'))}</h4><ul class="small">${c.causas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    html += `<h4>${esc(t('caso.preguntas'))}</h4><ul class="small">${c.preguntas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    html += `<h4>${esc(t('caso.plan'))}</h4><ol class="small">${c.plan.map((x) => `<li>${esc(x.paso)}${x.quien ? ` <span class="muted">(${esc(x.quien)}${x.esfuerzo ? ', ' + esc(x.esfuerzo) : ''})</span>` : ''}</li>`).join('')}</ol>`;
    html += `<p class="small"><b>${esc(t('caso.comprobar'))}</b> ${esc(c.comprobar)}</p>`;
    if (r.ia) html += `<div class="notice info small"><b>${esc(t('recs.iaDeAcuerdo'))}.</b> ${esc(r.ia.accion)}</div>`;
    if (r.evaluable && !iniDeRec(r)) html += `<div class="row" style="margin-top:12px"><button class="btn primary" data-action="rec-ini" data-id="${esc(r.clave)}">${esc(t('recs.crearIni'))}</button></div>`;
    return [r.titulo, html];
  }

  // ---------- iniciativas ----------
  const ESTADO_INI = { planificada: 'neutral', midiendo: 'warn', funciona: 'good', sin_efecto: 'neutral', empeora: 'bad', sin_datos: 'neutral' };
  /** Gráfico de la iniciativa: su medida en sus equipos frente al resto, con el inicio y el margen de dos semanas. */
  function graficoIni(s) {
    const pts = s.serie || [];
    const vals = pts.flatMap((p) => [p.iniciativa, p.control]).filter((v) => v != null);
    if (pts.length < 2 || !vals.length) return '';
    const W = 300, H = 90, lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo || 1) * 0.15;
    const x0 = new Date(pts[0].fecha).getTime(), x1 = new Date(pts[pts.length - 1].fecha).getTime() || x0 + 1;
    const x = (d) => ((new Date(d).getTime() - x0) / (x1 - x0 || 1)) * W;
    const y = (v) => H - ((v - (lo - pad)) / ((hi + pad) - (lo - pad))) * H;
    const linea = (k) => { let d = '', pen = false; pts.forEach((p) => { if (p[k] == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(p.fecha).toFixed(1) + ' ' + y(p[k]).toFixed(1) + ' '; pen = true; }); return d; };
    const lim = (v) => Math.max(0, Math.min(W, v)), xi = lim(x(s.inicio)), xd = lim(x(s.desdeDespues));
    return `<svg class="ini-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('ini.grafico'))}"><rect class="ic-margen" x="${Math.max(0, xi).toFixed(1)}" y="0" width="${Math.max(0, xd - xi).toFixed(1)}" height="${H}"/><line class="ic-inicio" x1="${xi.toFixed(1)}" x2="${xi.toFixed(1)}" y1="0" y2="${H}"/><path class="ic-control" d="${linea('control')}"/><path class="ic-ini" d="${linea('iniciativa')}"/></svg>
      <div class="stage-legend"><span><i class="sw-in_progress"></i>${esc(t('ini.leyendaIni'))}</span><span><i class="sw-todo"></i>${esc(t('ini.leyendaResto'))}</span><span><i class="sw-margen"></i>${esc(t('ini.leyendaMargen'))}</span></div>`;
  }
  function iniciativas() {
    const vm = S.vm, nombres = EP.visibles().map((e) => e.nombre);
    const vis = vm.iniciativas.filter((x) => x.ini.equipos.some((e) => nombres.indexOf(e) >= 0));
    const n = (est) => vis.filter((x) => x.s.estado === est).length;
    const pasos = `<div class="steps">${[1, 2, 3, 4].map((i) => `<div class="step"><span class="n">${i}</span><div><b>${esc(t('ini.paso' + i + '.t'))}</b><div class="small muted">${esc(t('ini.paso' + i + '.d', { lat: N.LATENCIA_DIAS / 7 }))}</div></div></div>`).join('')}</div>`;
    const propias = (S.cfg.iniciativas || []).map((i) => i.id);
    const tarjetas = vis.map(({ ini, s }) => {
      const m = ini.medidas_objetivo[0].medida;
      const f = (v) => (v == null ? t('comun.sinDatos') : N.formatear(v, s.formato));
      const lect = S.iaImpacto && S.iaImpacto.filter((x) => x.id === ini.id)[0];
      return `<div class="ficha ini"><div class="f-head"><div class="f-title">${esc(ini.nombre)}</div>${K.chip(ESTADO_INI[s.estado], t('ini.estado.' + s.estado))}</div>
        <div class="f-body"><div class="meta">${ini.equipos.map((e) => K.chip('neutral', nombreEquipo(e))).join('')}${K.chip('info', nombreMedida(m))}${K.chip('neutral', t('ini.inicio', { f: fecha(s.inicio) }))}${s.confianza ? K.chip('neutral', t('ini.confianza', { c: t('conf.' + s.confianza) })) : ''}</div>
        <div class="progress"><div class="bar"><i class="tone-neutral" style="width:${Math.round(s.progreso * 100)}%"></i></div><span class="small muted">${esc(s.completa ? t('ini.completa') : t('ini.completaEl', { f: fecha(s.completaEl) }))}</span></div>
        <div class="before-after"><div><div class="m-l">${esc(t('ini.antes'))}</div><div class="m-v">${esc(f(s.antes))}</div></div><div class="arrow">›</div><div><div class="m-l">${esc(t('ini.despues'))}</div><div class="m-v">${esc(f(s.despues))}</div></div></div>${s.control ? `<div class="small muted" style="margin:6px 0">${esc(t('ini.resto'))}: ${esc(f(s.control.antes))} › ${esc(f(s.control.despues))}</div>` : ''}
        <p class="small">${esc(s.texto)}</p>${graficoIni(s)}${lect ? `<div class="notice info small"><b>${esc(t('ini.lecturaIa'))}</b> ${esc(lect.lectura)}</div>` : ''}</div>
        <div class="f-foot"><span class="tiny muted">${esc(cat().textos['iniciativa.aviso'] || '')}</span>${(propias.indexOf(ini.id) >= 0 || (S.carpeta && (S.extraIni || []).some((i) => i.id === ini.id))) && !S.demo ? `<button class="link small" data-action="ini-del" data-id="${esc(ini.id)}">${esc(t('comun.quitar'))}</button>` : ''}</div></div>`;
    }).join('');
    const estIa = S.iaEstado.impacto;
    const iaFila = vis.length && hayIa() ? `<div class="row" style="margin:8px 0"><button class="btn sm" data-action="ia-impacto" ${estIa === 'trabajando' ? 'disabled' : ''}>${esc(estIa === 'trabajando' ? t('ia.trabajando') : t('ini.leerIa'))}</button>${estIa === 'error' ? `<span class="small t-warn">${esc(t('ia.error', { e: S.iaError.impacto || '' }))}</span>` : ''}</div>` : '';
    const status = K.statusBar(n('empeora') ? 'bad' : n('funciona') ? 'good' : 'neutral', esc(vis.length ? tn('ini.titular', vis.length, { m: n('midiendo'), f: n('funciona') }) : t('ini.ninguna')), [esc(t('ini.items1')), esc(t('ini.items2'))]);
    return status + (S.iniForm ? formulario() : '') + iaFila
      + (vis.length ? `<div class="fichas cols-2">${tarjetas}</div>` : `<div class="ficha empty">${esc(t('ini.vacio'))}</div>`) + `<details class="mas"><summary>${esc(t('ini.como'))}</summary>${pasos}</details>`;
  }
  function formulario() {
    const f = S.iniForm, eqs = S.vm.equipos;
    const medidas = Object.keys(N.MEDIDAS_INICIATIVA).filter((id) => cat().medidas[id]);
    return `<div class="ficha" id="form-ini"><h3>${esc(t('ini.nueva'))}</h3><form class="grid cols-2" onsubmit="return false">
      <div class="field span-2"><label>${esc(t('ini.f.nombre'))}</label><input type="text" name="nombre" value="${esc(f.nombre || '')}" placeholder="${esc(t('ini.f.nombreEj'))}"></div>
      <div class="field span-2"><label>${esc(t('ini.f.equipos'))}</label><div class="checks">${eqs.map((e) => `<label class="check"><input type="checkbox" name="equipos" value="${esc(e.nombre)}" ${f.equipos && f.equipos.indexOf(e.nombre) >= 0 ? 'checked' : ''}> ${esc(nombreEquipo(e.nombre))}</label>`).join('')}</div></div>
      <div class="field"><label>${esc(t('ini.f.medida'))}</label><select name="medida">${medidas.map((id) => `<option value="${esc(id)}" ${f.medida === id ? 'selected' : ''}>${esc(nombreMedida(id))}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('ini.f.inicio'))}</label><input type="date" name="inicio" value="${esc(f.inicio || '')}"></div>
      <div class="field"><label>${esc(t('ini.f.fin'))}</label><input type="date" name="fin" value="${esc(f.fin || '')}"></div>
      <div class="field"><label>${esc(t('ini.f.efecto'))}</label><input type="text" name="efecto" value="${esc(f.efecto || '')}"></div>
      <div class="full row"><button class="btn primary" data-action="ini-guardar">${esc(t('ini.f.guardar'))}</button><button class="btn" data-action="ini-cancelar">${esc(t('comun.cancelar'))}</button>${S.demo ? `<span class="small muted">${esc(t('ini.f.demo'))}</span>` : ''}</div></form></div>`;
  }
  EP.accion('ini-nueva', () => { S.iniForm = { inicio: hoyLocal(), equipos: S.role === 'equipo' && S.team ? [S.team] : [], medida: 'ciclo' }; EP.go('iniciativas'); setTimeout(() => { const el = document.getElementById('form-ini'); if (el) el.scrollIntoView({ block: 'start' }); }, 30); });
  EP.accion('ini-cancelar', () => { S.iniForm = null; EP.render(); });
  EP.accion('ini-guardar', () => {
    const form = document.querySelector('#form-ini form'); const d = (k) => (form.elements[k] ? String(form.elements[k].value || '').trim() : '');
    const equipos = [].map.call(form.querySelectorAll('input[name="equipos"]:checked'), (c) => c.value);
    if (!d('nombre')) return EP.toast(t('ini.f.faltaNombre'), 'bad');
    if (!equipos.length) return EP.toast(t('ini.f.faltaEquipos'), 'bad');
    if (!d('inicio')) return EP.toast(t('ini.f.faltaInicio'), 'bad');
    if (d('fin') && d('fin') < d('inicio')) return EP.toast(t('ini.f.finAntes'), 'bad');
    const def = cat().medidas[d('medida')];
    const slug = d('nombre').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const ini = { id: 'ini-' + (slug || 'iniciativa') + '-' + d('inicio') + '-' + Date.now().toString(36).slice(-4), nombre: d('nombre'), descripcion: '', fecha_inicio: d('inicio'), fecha_fin: d('fin') || null, equipos,
      medidas_objetivo: [{ medida: d('medida'), direccion: def && def.dir === 'mas' ? 'subir' : 'bajar' }], efecto_esperado: d('efecto') || '', estado: 'planificada',
      origen: S.iniForm.origen || 'propia', evaluacion: null, notas: '' };
    if (S.demo) S.extraIni = (S.extraIni || []).filter((i) => i.id !== ini.id).concat([ini]);
    else { S.cfg.iniciativas = (S.cfg.iniciativas || []).filter((i) => i.id !== ini.id).concat([ini]); EP.guardarCfg(); if (EP.carpeta) EP.carpeta.escribir('iniciativas', ini.id + '.json', JSON.stringify(ini, null, 2)); }
    S.iniForm = null;
    EP.enSegundoPlano(() => { EP.recalcular(); EP.render(); EP.toast(t('ini.f.guardada')); });
  });
  EP.accion('ini-del', (el) => {
    if (!window.confirm(t('ini.quitarConfirma'))) return;
    S.cfg.iniciativas = (S.cfg.iniciativas || []).filter((i) => i.id !== el.dataset.id);
    S.extraIni = (S.extraIni || []).filter((i) => i.id !== el.dataset.id); EP.guardarCfg();
    if (EP.carpeta) EP.carpeta.borrar('iniciativas', el.dataset.id + '.json');
    EP.enSegundoPlano(() => { EP.recalcular(); EP.render(); });
  });
  EP.accion('ia-impacto', () => {
    S.iaEstado.impacto = 'trabajando'; EP.render();
    proveedor()(IA.peticionImpacto(S.vm.paquete, window.I18N.lang)).then((texto) => { const v = IA.validarImpacto(texto, S.vm.paquete); S.iaImpacto = v.lecturas; S.iaEstado.impacto = 'hecho'; EP.render(); })
      .catch((e) => { S.iaEstado.impacto = 'error'; S.iaError.impacto = e.message; EP.render(); });
  });

  // ---------- fuentes y mapeo ----------
  function fuentes() {
    const tabs = `<div class="tabs">${['ficheros', 'mapeo', 'tipos', 'equipos', 'context'].map((x) => `<button class="tab ${S.fuentesTab === x ? 'on' : ''}" data-action="fuentes-tab" data-tab="${x}">${esc(t('fuentes.tab.' + x))}</button>`).join('')}</div>`;
    const cuerpo = { ficheros: fuentesFicheros, mapeo: fuentesMapeo, tipos: fuentesTipos, equipos: fuentesEquipos, context: fuentesContext }[S.fuentesTab] || fuentesFicheros;
    return tabs + cuerpo();
  }
  EP.accion('fuentes-tab', (el) => { S.fuentesTab = el.dataset.tab; EP.render(); });
  /** Cómo conseguir el CSV: desde Jira o guardando un Excel como CSV. */
  const ayudaCsv = () => `<div class="ficha"><div class="f-head"><div class="f-title">${esc(t('csv.titulo'))}</div></div><div class="f-body"><div class="two-col"><div><b class="small">${esc(t('csv.jira'))}</b><ol class="small">${[1, 2, 3, 4].map((i) => `<li>${esc(t('csv.jira' + i))}</li>`).join('')}</ol></div><div><b class="small">${esc(t('csv.excel'))}</b><ol class="small">${[1, 2, 3].map((i) => `<li>${esc(t('csv.excel' + i))}</li>`).join('')}</ol></div></div><p class="tiny muted">${esc(t('csv.nota'))}</p></div></div>`;
  const formatoDe = (nombre) => { const f = (S.ficheros || []).filter((x) => x.nombre === nombre)[0]; return f && f.formato && f.formato !== 'csv' ? f.formato : null; };
  EP.accion('col-borrar', () => { delete S.cfg.columnas; EP.guardarCfg(); EP.enSegundoPlano(() => { if (S.ficheros && EP.procesar(S.ficheros)) EP.render(); else EP.render(); }); });
  function fuentesFicheros() {
    const inf = S.vm.informe;
    const tiles = `<div class="tiles">${K.stat(t('fuentes.tile.ficheros'), String(inf.ficheros.length), esc(t('fuentes.tile.ficherosPie')), '')}${K.stat(t('fuentes.tile.tareas'), String(inf.tareas), esc(t('fuentes.tile.tareasPie', { f: inf.filasLeidas })), '')}${K.stat(t('fuentes.tile.fuera'), String(inf.epicas + inf.subtareas + inf.duplicadas + (inf.sinClave || 0) + (inf.sinFecha || 0)), esc(t('fuentes.tile.fueraPie', { e: inf.epicas, s: inf.subtareas, d: inf.duplicadas, o: (inf.sinClave || 0) + (inf.sinFecha || 0) })), '')}${K.stat(t('fuentes.tile.avisos'), String(inf.avisos.length + S.vm.det.avisos.length), esc(t('fuentes.tile.avisosPie')), '', { tone: inf.avisos.length + S.vm.det.avisos.length ? 'warn' : 'good' })}</div>`;
    const avisos = inf.avisos.concat(S.vm.det.avisos).concat((S.avisosCarga || []).map((texto) => ({ texto })));
    const pend = S.colPend && S.colPend.pendientes.length ? `<div class="notice bad small" style="margin-bottom:12px">${esc(tn('fuentes.pendientes', S.colPend.pendientes.length, { f: S.colPend.pendientes.map((p) => p.fichero).join(', ') }))} <button class="btn sm" data-action="col-abrir">${esc(t('columnas.elegir'))}</button></div>` : '';
    const elegidas = S.cfg.columnas && Object.keys(S.cfg.columnas).some((k) => S.cfg.columnas[k]) ? `<div class="notice info small" style="margin-bottom:12px">${esc(t('fuentes.columnasElegidas', { c: Object.keys(S.cfg.columnas).filter((k) => S.cfg.columnas[k]).map((k) => t('columnas.campo.' + k) + ' = ' + S.cfg.columnas[k]).join(' · ') }))} <button class="link small" data-action="col-borrar">${esc(t('columnas.volverAuto'))}</button></div>` : '';
    const fich = K.ficha(`<div class="f-title">${esc(t('fuentes.ficheros'))}</div>`, `<div class="table-wrap"><table><tr><th>${esc(t('fuentes.col.fichero'))}</th><th class="num">${esc(t('fuentes.col.filas'))}</th><th class="num">${esc(t('fuentes.col.columnas'))}</th></tr>${inf.ficheros.map((f) => `<tr><td>${esc(f.nombre)}${formatoDe(f.nombre) ? ` <span class="tiny muted">${esc(t('fuentes.formato.' + formatoDe(f.nombre)))}</span>` : ''}</td><td class="num">${f.filas}</td><td class="num">${f.columnasConDatos} / ${f.columnas}</td></tr>`).join('')}</table></div>${avisos.length ? `<div class="notice warn small" style="margin-top:8px">${avisos.map((a) => esc(a.texto)).join('<br>')}</div>` : ''}`);
    const cols = S.ficheros && S.ficheros[0] ? N.describirColumnas(S.ficheros[0].texto) : [];
    const ACC = { usa: 'good', descarta: 'bad', ignora: 'neutral' };
    const colHtml = cols.length ? `<details class="all-src"><summary>${esc(t('fuentes.columnas', { n: cols.filter((c) => c.accion === 'usa').length, de: cols.length }))}</summary><div class="ficha" style="margin-top:10px"><div class="table-wrap"><table><tr><th>${esc(t('fuentes.col.columna'))}</th><th>${esc(t('fuentes.col.que'))}</th><th>${esc(t('fuentes.col.accion'))}</th><th>${esc(t('fuentes.col.ejemplo'))}</th></tr>${cols.map((c) => `<tr><td>${esc(c.columna)}${c.veces > 1 ? ` <span class="tiny muted">×${c.veces}</span>` : ''}</td><td class="small">${esc(c.que)}</td><td>${K.chip(ACC[c.accion], t('fuentes.accion.' + c.accion))}</td><td class="small muted">${esc(c.ejemplo || '')}</td></tr>`).join('')}</table></div></div></details>` : '';
    return K.statusBar(avisos.length ? 'warn' : 'good', esc(avisos.length ? tn('fuentes.conAvisos', avisos.length) : t('fuentes.bien')), [esc(t('fuentes.items1')), esc(t('fuentes.items2'))])
      + pend + elegidas + tiles + `<div class="fichas cols-1 sp">${fich}</div>` + colHtml + `<div class="fichas cols-1 sp">${ayudaCsv()}</div>`;
  }
  function fuentesMapeo() {
    const det = S.vm.det, mp = S.vm.mapeo, comunes = Object.keys(cat().estados.estados);
    const conTiempos = det.hayTiempos;
    const filas = det.estados.map((e) => {
      const por = EP.P.porMapeo(S.cfg, e), dudoso = por !== 'confirmado' && por !== 'nombre';
      const tiempo = conTiempos ? `<td class="num">${esc(N.formatear(e.horasMedias != null ? e.horasMedias / 24 : null, 'dias'))}</td><td class="num">${e.visitas}</td>` : '';
      const confirmar = dudoso ? ` <button class="link small" data-action="map-uno" data-estado="${esc(e.nombre)}">${esc(t('mapeo.confirmarUno'))}</button>` : '';
      return `<tr${dudoso ? ' class="dudoso"' : ''}><td><b>${esc(e.nombre)}</b>${e.categoria ? `<div class="tiny muted">${esc(e.categoria)}</div>` : ''}</td><td class="num">${e.actuales}</td>${tiempo}<td><select class="sm" data-change="map-estado" data-estado="${esc(e.nombre)}">${comunes.map((c) => `<option value="${c}" ${mp[e.nombre] === c ? 'selected' : ''}>${esc(cat().estados.estados[c].nombre)}</option>`).join('')}</select></td><td>${K.chip(dudoso ? 'warn' : 'good', t('mapeo.por.' + por))}${confirmar}</td></tr>`;
    }).join('');
    const porRevisar = EP.P.porRevisar(S.cfg, det).length;
    const iaEst = S.iaEstado.mapeo;
    const acciones = `<div class="row">${hayIa() ? `<button class="btn sm" data-action="ia-mapeo" ${iaEst === 'trabajando' ? 'disabled' : ''}>${esc(iaEst === 'trabajando' ? t('ia.trabajando') : t('mapeo.ia'))}</button>` : ''}<button class="btn sm" data-action="map-reset">${esc(t('mapeo.reset'))}</button></div>`;
    const cabTiempo = conTiempos ? `<th class="num">${esc(t('mapeo.col.tiempo'))}</th><th class="num">${esc(t('mapeo.col.pasos'))}</th>` : '';
    return K.statusBar(porRevisar ? 'warn' : 'good', esc(porRevisar ? tn('mapeo.porRevisar', porRevisar) : t('mapeo.todoBien')), [esc(t('mapeo.items1')), esc(t('mapeo.items2'))])
      + `<div class="ficha"><div class="row between" style="margin-bottom:8px"><span class="small muted">${esc(t('mapeo.texto'))}</span>${acciones}</div><div class="table-wrap"><table><tr><th>${esc(t('mapeo.col.estado'))}</th><th class="num">${esc(t('mapeo.col.ahora'))}</th>${cabTiempo}<th>${esc(t('mapeo.col.comun'))}</th><th>${esc(t('mapeo.col.como'))}</th></tr>${filas}</table></div>${conTiempos ? '' : `<p class="tiny muted" style="margin-top:8px">${esc(t('mapeo.sinTiempos'))}</p>`}${S.iaMapeoAviso ? `<div class="notice info small" style="margin-top:8px">${esc(S.iaMapeoAviso)}</div>` : ''}</div>`;
  }
  const aplicarCfg = (fn) => { fn(); EP.guardarCfg(); EP.enSegundoPlano(() => { EP.recalcular(); EP.render(); }); };
  // Cambiar un estado a mano o pulsar "Es correcto" lo confirma. No hay "confirmar todos": un dudoso se mira uno a uno.
  EP.cambio('map-estado', (el) => aplicarCfg(() => { S.cfg.mapeoEstados = Object.assign({}, S.cfg.mapeoEstados || {}, { [el.dataset.estado]: el.value }); }));
  EP.accion('map-uno', (el) => aplicarCfg(() => { S.cfg.mapeoEstados = Object.assign({}, S.cfg.mapeoEstados || {}, { [el.dataset.estado]: S.vm.mapeo[el.dataset.estado] }); }));
  EP.accion('map-reset', () => aplicarCfg(() => { delete S.cfg.mapeoEstados; delete S.cfg.mapeoIA; }));
  EP.accion('ia-mapeo', () => {
    const estados = S.vm.det.estados.map((e) => ({ nombre: e.nombre, actuales: e.actuales, categoria: e.categoria, propuesta: S.vm.mapeo[e.nombre] }));
    S.iaEstado.mapeo = 'trabajando'; EP.render();
    proveedor()(IA.peticionMapeoEstados(estados, cat())).then((texto) => {
      const v = IA.validarMapeo(texto, estados, cat());
      S.iaEstado.mapeo = 'hecho'; S.iaMapeoAviso = tn('mapeo.iaCambios', v.cambios);
      // La propuesta de la IA se aplica al cálculo pero queda por revisar: solo los estados sin confirmar y los que cambia.
      const conf = S.cfg.mapeoEstados || {}, ia = {};
      S.vm.det.estados.forEach((e) => {
        const p = v.mapeo[e.nombre];
        if (!p || conf[e.nombre] != null) return;
        if (p !== S.vm.mapeo[e.nombre] || e.propuestaPor !== 'nombre') ia[e.nombre] = p;
      });
      aplicarCfg(() => { S.cfg.mapeoIA = ia; });
    }).catch((e) => { S.iaEstado.mapeo = 'error'; S.iaMapeoAviso = t('ia.error', { e: e.message }); EP.render(); });
  });
  // ---------- tipos, etiqueta de bug y estimación ----------
  function fuentesTipos() {
    const reglas = { mapeoTipos: S.cfg.mapeoTipos || null, etiquetaBug: S.cfg.etiquetaBug || null };
    const tipos = N.tiposDeOrigen(S.lectura, reglas), elegibles = N.TIPOS_ELEGIBLES;
    const bugs = EP.P.lecturaCalculo(S.lectura, S.cfg).tareas.filter((x) => x.tipo === 'error').length;
    const filas = tipos.map((x) => `<tr><td><b>${esc(x.tipo_origen || t('tipos.sinTipo'))}</b></td><td class="num">${x.n}</td><td><select class="sm" data-change="tipo-origen" data-tipo="${esc(x.tipo_origen)}">${elegibles.map((c) => `<option value="${c}" ${x.tipo === c ? 'selected' : ''}>${esc(t('tipo.' + c))}</option>`).join('')}</select></td><td>${K.chip(x.cambiado ? 'info' : 'good', t(x.cambiado ? 'tipos.cambiado' : 'mapeo.por.nombre'))}</td></tr>`).join('');
    const etiquetas = N.etiquetasDe(S.lectura);
    const etqSel = `<select data-change="tipo-etiqueta"><option value="">${esc(t('tipos.etiquetaNinguna'))}</option>${etiquetas.slice(0, 60).map((e) => `<option value="${esc(e.etiqueta)}" ${S.cfg.etiquetaBug === e.etiqueta ? 'selected' : ''}>${esc(e.etiqueta)} · ${e.n}</option>`).join('')}</select>`;
    // Estimación: automática (por nombre), ninguna o una columna numérica del export
    const numericas = S.ficheros && S.ficheros[0] ? N.columnasNumericas(S.ficheros[0].texto) : [];
    const leidas = S.ficheros && S.ficheros[0] ? N.describirColumnas(S.ficheros[0].texto) : [];
    const descartada = (c) => leidas.some((x) => x.columna === c && (x.accion === 'descarta' || (x.campo && x.campo !== 'puntos')));
    const candidatas = numericas.filter((c) => !descartada(c.columna));
    const auto = (leidas.filter((x) => x.campo === 'puntos')[0] || {}).columna || null;
    const actual = S.cfg.columnaEstimacion;
    const opt = (v, txt) => `<option value="${esc(v)}" ${((actual == null ? '__auto' : actual) === v) ? 'selected' : ''}>${esc(txt)}</option>`;
    const estSel = `<select data-change="tipo-estimacion">${opt('__auto', auto ? t('tipos.estAuto', { c: auto }) : t('tipos.estAutoNada'))}${candidatas.filter((c) => c.columna !== auto).map((c) => opt(c.columna, t('tipos.estColumna', { c: c.columna, n: c.conValor }))).join('')}${opt('', t('tipos.estNinguna'))}</select>`;
    const conEst = S.lectura.tareas.filter((x) => x.estimacion != null).length;
    return K.statusBar('neutral', esc(t('tipos.titular', { n: tipos.length, b: bugs })), [esc(t('tipos.items1')), esc(t('tipos.items2'))])
      + `<div class="ficha"><p class="small muted" style="margin:0 0 8px">${esc(t('tipos.texto'))}</p><div class="table-wrap"><table><tr><th>${esc(t('tipos.col.origen'))}</th><th class="num">${esc(t('tipos.col.tareas'))}</th><th>${esc(t('tipos.col.comun'))}</th><th>${esc(t('mapeo.col.como'))}</th></tr>${filas}</table></div></div>`
      + `<div class="fichas cols-2 sp"><div class="ficha"><div class="field"><label>${esc(t('tipos.etiqueta'))}</label>${etqSel}</div><p class="tiny muted">${esc(etiquetas.length ? t('tipos.etiquetaAyuda') : t('tipos.sinEtiquetas'))}</p></div>`
      + `<div class="ficha"><div class="field"><label>${esc(t('tipos.estimacion'))}</label>${estSel}</div><p class="tiny muted">${esc(t('tipos.estAyuda', { n: conEst, de: S.lectura.tareas.length }))}</p></div></div>`;
  }
  EP.cambio('tipo-origen', (el) => aplicarCfg(() => {
    const m = Object.assign({}, S.cfg.mapeoTipos || {}), propuesto = N.tiposDeOrigen(S.lectura).filter((x) => x.tipo_origen === el.dataset.tipo)[0];
    if (propuesto && propuesto.propuesto === el.value) delete m[el.dataset.tipo]; else m[el.dataset.tipo] = el.value;
    S.cfg.mapeoTipos = m;
  }));
  EP.cambio('tipo-etiqueta', (el) => aplicarCfg(() => { if (el.value) S.cfg.etiquetaBug = el.value; else delete S.cfg.etiquetaBug; }));
  // Cambiar la columna de estimación obliga a leer otra vez los ficheros
  EP.cambio('tipo-estimacion', (el) => {
    if (el.value === '__auto') delete S.cfg.columnaEstimacion; else S.cfg.columnaEstimacion = el.value;
    EP.guardarCfg();
    EP.enSegundoPlano(() => { if (S.ficheros) EP.procesar(S.ficheros); EP.render(); });
  });

  function fuentesEquipos() {
    const det = S.vm.det, campo = S.vm.campoEquipo, info = S.cfg.equiposInfo || {}, fte = S.cfg.fte || {}, coste = S.cfg.coste || {};
    const opciones = det.opcionesEquipo.filter((o) => o.valida);
    const nombreOp = (o) => t('campo.' + o.id) + (o.id === 'todos' ? '' : ' · ' + tn('campo.valores', o.valores.length));
    const op = det.opcionesEquipo.filter((o) => o.id === campo)[0];
    const medidos = S.vm.equiposMedidos;
    const filas = op && op.id !== 'todos' ? op.valores.map((v) => {
      const i = info[v.valor] || {}, dentro = medidos.indexOf(v.valor) >= 0;
      return `<tr><td><label class="check"><input type="checkbox" data-change="eq-incluir" value="${esc(v.valor)}" ${dentro ? 'checked' : ''}> ${esc(v.valor)}</label></td><td class="num">${v.n}</td>
        <td><select class="sm" data-change="eq-tipo" data-eq="${esc(v.valor)}"><option value="interno" ${i.tipo !== 'proveedor' ? 'selected' : ''}>${esc(t('equipo.tipo.interno'))}</option><option value="proveedor" ${i.tipo === 'proveedor' ? 'selected' : ''}>${esc(t('equipo.tipo.proveedor'))}</option></select></td>
        <td><input class="sm" type="text" data-change="eq-proveedor" data-eq="${esc(v.valor)}" value="${esc(i.proveedor || '')}" ${i.tipo === 'proveedor' ? '' : 'disabled'} placeholder="${esc(t('equipo.proveedorEj'))}"></td>
        <td><input class="sm" type="text" data-change="eq-area" data-eq="${esc(v.valor)}" value="${esc(i.area || '')}"></td>
        <td><input class="sm num" type="number" min="0" step="0.5" data-change="eq-fte" data-eq="${esc(v.valor)}" value="${esc(isFinite(+fte[v.valor]) && fte[v.valor] != null ? +fte[v.valor] : '')}"></td>
        <td><input class="sm num" type="number" min="0" step="100" data-change="eq-coste" data-eq="${esc(v.valor)}" value="${esc(isFinite(+coste[v.valor]) && coste[v.valor] != null ? +coste[v.valor] : '')}"></td></tr>`;
    }).join('') : '';
    return K.statusBar('neutral', esc(t('equipos.titular', { n: medidos.length, campo: t('campo.' + campo) })), [esc(t('equipos.items1')), esc(t('equipos.items2'))])
      + `<div class="ficha"><div class="field"><label>${esc(t('equipos.campo'))}</label><select data-change="eq-campo">${opciones.map((o) => `<option value="${esc(o.id)}" ${o.id === campo ? 'selected' : ''}>${esc(nombreOp(o))}</option>`).join('')}</select></div>
        ${filas ? `<div class="table-wrap" style="margin-top:12px"><table><tr><th>${esc(t('equipos.col.equipo'))}</th><th class="num">${esc(t('equipos.col.tareas'))}</th><th>${esc(t('equipos.col.tipo'))}</th><th>${esc(t('equipos.col.proveedor'))}</th><th>${esc(t('equipos.col.area'))}</th><th>${esc(t('equipos.col.fte'))}</th><th>${esc(t('equipos.col.coste'))}</th></tr>${filas}</table></div>` : ''}
        <p class="tiny muted" style="margin-top:8px">${esc(t('equipos.nota'))}</p></div>`;
  }
  const info = (eq) => { S.cfg.equiposInfo = S.cfg.equiposInfo || {}; S.cfg.equiposInfo[eq] = S.cfg.equiposInfo[eq] || { tipo: 'interno', proveedor: null, area: null }; return S.cfg.equiposInfo[eq]; };
  EP.cambio('eq-campo', (el) => aplicarCfg(() => { S.cfg.campoEquipo = el.value; delete S.cfg.equipos; }));
  EP.cambio('eq-incluir', () => aplicarCfg(() => { S.cfg.campoEquipo = S.vm.campoEquipo; S.cfg.equipos = [].map.call(document.querySelectorAll('input[data-change="eq-incluir"]:checked'), (c) => c.value); }));
  EP.cambio('eq-tipo', (el) => aplicarCfg(() => { const i = info(el.dataset.eq); i.tipo = el.value; if (el.value !== 'proveedor') i.proveedor = null; else i.proveedor = i.proveedor || t('equipo.proveedorEj'); }));
  EP.cambio('eq-proveedor', (el) => aplicarCfg(() => { info(el.dataset.eq).proveedor = el.value.trim() || null; }));
  EP.cambio('eq-area', (el) => aplicarCfg(() => { info(el.dataset.eq).area = el.value.trim() || null; }));
  EP.cambio('eq-fte', (el) => aplicarCfg(() => { S.cfg.fte = S.cfg.fte || {}; const v = parseFloat(el.value); if (v > 0) { S.cfg.fte[el.dataset.eq] = v; S.cfg.fteOrigen = Object.assign({}, S.cfg.fteOrigen, { [el.dataset.eq]: 'declarado' }); } else delete S.cfg.fte[el.dataset.eq]; }));
  EP.cambio('eq-coste', (el) => aplicarCfg(() => { S.cfg.coste = S.cfg.coste || {}; const v = parseFloat(el.value); if (v > 0) S.cfg.coste[el.dataset.eq] = v; else delete S.cfg.coste[el.dataset.eq]; }));
  function fuentesContext() { return EP.vistas.formularioContexto(true) + docsContexto(); }
  function docsContexto() {
    const docs = (S.contextoDocs && S.contextoDocs.documentos) || [];
    return K.sec(t('context.docs')) + (docs.length ? `<div class="fichas">${docs.map((d) => K.ficha(`<div class="f-title">${esc(d.titulo)}</div>${K.chip('neutral', t('context.cat.' + d.categoria))}`, `<p class="small">${esc(d.resumen)}</p>`, `<span class="tiny muted">${esc(d.fuente)} · ${esc(d.fecha)}</span>`)).join('')}</div>` : `<div class="ficha empty">${esc(t('context.sinDocs'))}</div>`);
  }

  // ---------- ajustes ----------
  function ajustes() {
    const eqs = S.vm.equipos;
    return `<div class="grid cols-2">
      <div class="card"><h3>${esc(t('ajustes.ia'))}</h3><p class="small muted">${esc(t('ajustes.iaTexto'))}</p>
        <div class="field"><label for="ia-clave">${esc(t('ajustes.clave'))}</label><input type="password" id="ia-clave" value="${esc(S.ia.clave)}" placeholder="sk-ant-..." autocomplete="off"><div class="tiny muted">${esc(t('ajustes.claveNota'))}</div></div>
        <div class="field"><label for="ia-modelo">${esc(t('ajustes.modelo'))}</label><input type="text" id="ia-modelo" value="${esc(S.ia.modelo)}"></div>
        <div class="row"><button class="btn primary" data-action="ia-guardar">${esc(t('comun.guardar'))}</button><button class="btn" data-action="ia-probar" ${S.iaEstado.prueba === 'trabajando' ? 'disabled' : ''}>${esc(t('ajustes.probar'))}</button><button class="btn" data-action="ia-olvidar">${esc(t('ajustes.olvidar'))}</button></div>
        <div class="small" style="margin-top:6px">${esc(S.iaPrueba || '')}</div></div>
      <div class="card"><h3>${esc(t('ajustes.vista'))}</h3>
        <div class="field"><label>${esc(t('idioma.titulo'))}</label><select data-change="lang"><option value="es" ${window.I18N.lang === 'es' ? 'selected' : ''}>Español</option><option value="en" ${window.I18N.lang === 'en' ? 'selected' : ''}>English</option></select></div>
        <div class="field"><label>${esc(t('rol.vistaPara'))}</label><select data-change="rol">${['direccion', 'pmo', 'equipo'].map((r) => `<option value="${r}" ${S.role === r ? 'selected' : ''}>${esc(t('rol.' + r))}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('ajustes.equipoPropio'))}</label><select data-change="equipo-propio">${eqs.map((e) => `<option value="${esc(e.nombre)}" ${S.team === e.nombre ? 'selected' : ''}>${esc(nombreEquipo(e.nombre))}</option>`).join('')}</select></div></div>
      <div class="card"><h3>${esc(t('ajustes.exportar'))}</h3><p class="small muted">${esc(t('ajustes.exportarTexto'))}</p>
        <div class="row"><button class="btn" data-action="exp-docx">${esc(t('ajustes.catalogoWord'))}</button><button class="btn" data-action="exp-md">${esc(t('ajustes.catalogoMd'))}</button><button class="btn" data-action="exp-modelo">${esc(t('ajustes.modeloMedida'))}</button><button class="btn" data-action="exp-paquete">${esc(t('ajustes.paquete'))}</button></div></div>
      <div class="card"><h3>${esc(t('ajustes.carpeta'))}</h3><p class="small muted">${esc(t('ajustes.carpetaTexto'))}</p>
        <div class="row"><button class="btn" data-action="carpeta-elegir" ${window.showDirectoryPicker ? '' : 'disabled'}>${esc(S.carpeta ? t('ajustes.carpetaOtra') : t('ajustes.carpetaElegir'))}</button>${S.carpeta ? `<button class="btn" data-action="carpeta-leer">${esc(t('ajustes.carpetaLeer'))}</button><span class="small">${esc(t('ajustes.carpetaUsando', { n: S.carpeta.name }))}</span>` : ''}</div>${window.showDirectoryPicker ? '' : `<div class="tiny muted">${esc(t('ajustes.carpetaNoNavegador'))}</div>`}
        <div class="row" style="margin-top:12px"><button class="btn" data-action="clear-all">${esc(t('ajustes.borrar'))}</button></div><div class="tiny muted">${esc(t('ajustes.borrarTexto'))}</div></div>
      <div class="card full"><h3>${esc(t('ajustes.queMide'))}</h3><div class="table-wrap"><table><tr><th>${esc(t('ajustes.col.medida'))}</th><th>${esc(t('ajustes.col.pregunta'))}</th><th>${esc(t('ajustes.col.como'))}</th></tr>${cat().ordenMedidas.map((id) => { const m = cat().medidas[id]; return `<tr><td><b>${esc(m.nombre)}</b>${S.vm.kpis.indexOf(id) >= 0 ? ` ${K.chip('info', t('ajustes.enLinea'))}` : ''}</td><td class="small">${esc(m.pregunta)}</td><td class="small">${esc(m.como)}</td></tr>`; }).join('')}</table></div></div>
    </div>`;
  }
  EP.accion('ia-guardar', () => { EP.guardarClave(document.getElementById('ia-clave').value.trim()); S.ia.modelo = document.getElementById('ia-modelo').value.trim() || IA.MODELO_POR_DEFECTO; EP.guardarPrefs(); EP.toast(S.ia.clave ? t('ajustes.claveGuardada') : t('ajustes.sinClave')); EP.render(); });
  EP.accion('ia-olvidar', () => { EP.guardarClave(''); S.iaPrueba = ''; EP.render(); EP.toast(t('ajustes.claveOlvidada')); });
  EP.accion('ia-probar', () => {
    EP.guardarClave(document.getElementById('ia-clave').value.trim()); S.ia.modelo = document.getElementById('ia-modelo').value.trim() || IA.MODELO_POR_DEFECTO;
    if (!S.ia.clave) { S.iaPrueba = t('ajustes.sinClave'); EP.render(); return; }
    S.iaEstado.prueba = 'trabajando'; S.iaPrueba = t('ia.trabajando'); EP.render();
    proveedor()({ system: 'Answer with the single word OK.', user: 'OK?', maxTokens: 10 }).then(() => { S.iaPrueba = t('ajustes.pruebaBien'); }).catch((e) => { S.iaPrueba = t('ia.error', { e: e.message }); })
      .then(() => { S.iaEstado.prueba = 'hecho'; EP.render(); });
  });
  EP.cambio('lang', (el) => { window.I18N.fijar(el.value); EP.guardarPrefs(); EP.enSegundoPlano(() => { EP.recalcular(); EP.render(); }); });
  EP.cambio('rol', (el) => { S.role = el.value; S.recFilter = 'todos'; EP.guardarPrefs(); EP.render(); });
  EP.cambio('equipo-propio', (el) => { S.team = el.value; EP.guardarPrefs(); EP.render(); });
  const hoy = () => new Date().toISOString().slice(0, 10);
  const slug = (s) => String(s || 'cliente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente';
  function documentoDefiniciones() { return N.definiciones(EP.P.lecturaCalculo(S.lectura, S.cfg), EP.P.clienteDe(S.cfg, S.det), { config: EP.P.cfgCalculo(S.cfg, S.det), det: S.det, modelo: S.r.modelo, generado: new Date() }); }
  EP.accion('exp-docx', () => EP.descargar(`${t('ajustes.ficheroCatalogo')}-${slug(S.cfg.nombre)}-${hoy()}.docx`, N.aDocx(documentoDefiniciones(), new Date()), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  EP.accion('exp-md', () => EP.descargar(`${t('ajustes.ficheroCatalogo')}-${slug(S.cfg.nombre)}-${hoy()}.md`, N.aMarkdown(documentoDefiniciones()), 'text/markdown'));
  EP.accion('exp-modelo', () => EP.descargar(`${t('ajustes.ficheroModelo')}.json`, JSON.stringify(N.modeloDeMedida({ generado: new Date() }), null, 2)));
  EP.accion('exp-paquete', () => {
    const problemas = N.comprobarPaquete(S.vm.paquete);
    if (problemas.length) { EP.toast(t('ajustes.paqueteMal', { p: problemas[0] }), 'bad'); return; }
    const texto = JSON.stringify(S.vm.paquete, null, 2);
    EP.descargar(`${t('ajustes.ficheroPaquete')}-${hoy()}.json`, texto);
    if (EP.carpeta) EP.carpeta.escribir('diagnostico', `${t('ajustes.ficheroPaquete')}-${hoy()}.json`, texto);
  });

  // ---------- presentación ----------
  function presentacion() {
    const vm = S.vm, eqs = EP.visibles(), ultima = eqs.length + 1;
    S.slide = Math.max(0, Math.min(S.slide, ultima));
    const i = S.slide, recs = EP.vistas.recsActivas(eqs);
    const cerrar = `<button class="btn present-close" data-action="present-close">${esc(t('presentar.salir'))}</button>`;
    const nav = `<div class="slide-nav"><button class="btn sm" data-action="slide" data-dir="-1" ${i === 0 ? 'disabled' : ''}>${esc(t('presentar.anterior'))}</button><div class="slide-dots">${Array.from({ length: ultima + 1 }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><span>${esc(t('presentar.pie', { i: i + 1, n: ultima + 1 }))}</span><button class="btn sm" data-action="slide" data-dir="1" ${i >= ultima ? 'disabled' : ''}>${esc(t('presentar.siguiente'))}</button></div>`;
    const cab = (titulo, sub, derecha) => `<div class="slide-head"><div><h1>${titulo}</h1><div class="divider"></div><div class="muted">${sub}</div></div>${derecha || ''}</div>`;
    if (i === 0) {
      const alerta = eqs.filter((e) => e.estado === 'alerta');
      return cerrar + `<div class="slide title">${cab(esc(t('presentar.titulo')), esc(t('presentar.sub', { n: eqs.length, k: vm.semanas.K, f: fecha(vm.fechaDatos) })))}
        <div class="tiles">${K.stat(t('resumen.tile.alerta'), String(alerta.length), esc(alerta.length ? lista(alerta.map((e) => nombreEquipo(e.nombre))) : t('resumen.tile.alertaNinguno')), K.puntos((e) => ({ tone: { poco_fiable: 'bad', alerta: 'bad', provisional: 'warn', estable: 'good' }[e.estado], label: t('equipo.estado.' + e.estado) })), { tone: alerta.length ? 'bad' : 'good' })}${K.stat(t('resumen.tile.fiabilidad'), esc(t('fiab.nivel.' + vm.fiabilidad.nivel)), esc(t('fiab.bienDe', { bien: vm.fiabilidad.bien, n: vm.fiabilidad.comprobaciones.length })), '')}${K.destacados().slice(0, 2).map((id) => K.tile(vm.area, id)).join('')}</div>${nav}</div>`;
    }
    if (i === ultima) {
      return cerrar + `<div class="slide">${cab(esc(t('resumen.primero')), esc(t('presentar.ultimaSub')))}${recs.length ? `<div class="ficha list big">${recs.slice(0, 4).map(K.recFila).join('')}</div>` : `<p class="muted">${esc(t('recs.ninguna'))}</p>`}${nav}</div>`;
    }
    const e = eqs[i - 1], r = recs.filter((x) => x.equipos.indexOf(e.nombre) >= 0)[0];
    return cerrar + `<div class="slide">${cab(esc(nombreEquipo(e.nombre)), esc(e.fiabilidad ? t('fiab.equipoBien', { bien: e.fiabilidad.bien, n: e.fiabilidad.medibles }) : ''), K.equipoChip(e))}
      <div class="tiles">${K.destacados().map((id) => K.tile(e, id)).join('')}</div>
      <div class="fichas cols-2">${K.ficha(`<div class="f-title">${esc(t('equipo.cambios'))}</div>`, e.cambios.length ? e.cambios.slice(0, 3).map((x) => K.cambioFila(e, x)).join('') : `<p class="muted">${esc(t('equipo.todoNormal'))}</p>`)}${K.ficha(`<div class="f-title">${esc(t('equipo.queHacer'))}</div>`, r ? K.recFila(r) : `<p class="muted">${esc(t('recs.ningunaEquipo'))}</p>`)}</div>${nav}</div>`;
  }

  // ---------- resumen redactado ----------
  /** Resumen por reglas en tres bloques, desde la vista-modelo. */
  function resumenReglas(equipo) {
    const vm = S.vm, eqs = equipo ? vm.equipos.filter((e) => e.nombre === equipo) : EP.visibles();
    const b1 = [], b2 = [], b3 = [];
    const alerta = eqs.filter((e) => e.cambios.length);
    if (alerta.length) alerta.forEach((e) => { const c = e.cambios[0]; b1.push('- ' + t('narr.cambio', { e: nombreEquipo(e.nombre), m: nombreMedida(c.id).toLowerCase(), v: valor(c.id, c.m.valor), r: K.rango(c.id, c.m) })); });
    else b1.push(t('narr.sinCambios'));
    const estables = eqs.filter((e) => e.estado === 'estable').map((e) => nombreEquipo(e.nombre));
    if (estables.length && alerta.length) b1.push(t('narr.estables', { e: lista(estables) }));
    const f = vm.fiabilidad;
    b2.push(t('narr.fiabilidad', { nivel: t('fiab.nivel.' + f.nivel).toLowerCase(), bien: f.bien, n: f.comprobaciones.length }));
    f.comprobaciones.filter((c) => c.estado === 'revisar').slice(0, 3).forEach((c) => b2.push('- ' + c.nombre + ': ' + c.arreglo));
    const nombres = eqs.map((e) => e.nombre);
    const recs = EP.vistas.recsActivas(eqs).filter((r) => r.equipos.some((x) => nombres.indexOf(x) >= 0)).slice(0, 3);
    if (recs.length) recs.forEach((r) => b3.push('- ' + r.titulo + ' (' + K.paraQuien(r) + ').'));
    else b3.push(t('narr.sinRecs'));
    return [[t('narr.b1'), b1], [t('narr.b2'), b2], [t('narr.b3'), b3]];
  }
  const md = (txt) => String(txt || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => (/^- /.test(l) ? `<li>${esc(l.slice(2))}</li>` : `<p>${esc(l)}</p>`)).join('').replace(/(<li>.*?<\/li>)+/g, (m) => `<ul>${m}</ul>`);
  /** Cifras de la página que no están en el paquete y el asistente puede citar. */
  const extraIa = () => ({ fiabilidad: { nivel: S.vm.fiabilidad.nivel, comprobaciones: S.vm.fiabilidad.comprobaciones.map((c) => ({ id: c.id, nombre: c.nombre, valor: c.valor, estado: c.estado })) }, data_check: S.vm.dataCheck.veredicto });
  function cajonResumen(d) {
    const equipo = d.team || (S.role === 'equipo' ? S.team : null);
    const clave = (equipo || 'area') + '|' + S.role + '|' + window.I18N.lang;
    const n = S.narrativas[clave];
    let html = '';
    if (n && n.texto) html += `<div class="narrative">${md(n.texto)}</div><div class="tiny muted">${esc(t('narr.deIa'))}</div>`;
    else html += resumenReglas(equipo).map(([h, ls]) => `<h4>${esc(h)}</h4>${md(ls.join('\n'))}`).join('') + `<div class="tiny muted">${esc(t('narr.deReglas'))}</div>`;
    if (n && n.error) html += `<div class="notice warn small">${esc(n.error)}</div>`;
    html += hayIa() ? `<div class="row" style="margin-top:12px"><button class="btn" data-action="ia-resumen" data-team="${esc(equipo || '')}" ${n && n.trabajando ? 'disabled' : ''}>${esc(n && n.trabajando ? t('ia.trabajando') : t('narr.conIa'))}</button></div>` : `<div class="tiny muted" style="margin-top:12px">${esc(t('narr.sinClave'))}</div>`;
    return [t('narr.titulo', { para: equipo ? nombreEquipo(equipo) : t('rol.' + S.role) }), html];
  }
  EP.accion('ia-resumen', (el) => {
    const equipo = el.dataset.team || null, clave = (equipo || 'area') + '|' + S.role + '|' + window.I18N.lang;
    S.narrativas[clave] = { trabajando: true }; EP.render();
    const o = { idioma: window.I18N.lang, rol: S.role, equipo, extra: extraIa() };
    proveedor()(IA.peticionResumen(S.vm.paquete, o, cat())).then((texto) => {
      const v = IA.validarChat(texto, S.vm.paquete, { equipo, extra: o.extra });
      S.narrativas[clave] = v.ok ? { texto: v.respuesta.respuesta } : { error: t('ia.noComprobada') };
    }).catch((e) => { S.narrativas[clave] = { error: t('ia.error', { e: e.message }) }; }).then(() => EP.render());
  });

  Object.assign(EP.vistas, { recomendaciones, cajonCaso, iniciativas, fuentes, fuentesFicheros, fuentesMapeo, fuentesEquipos, ajustes, presentacion, cajonResumen, recsIa, extraIa, md, ayudaCsv });
})();
