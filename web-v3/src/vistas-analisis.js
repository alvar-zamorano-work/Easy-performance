/* easyperformance v3: cabecera de página, Resumen, Equipos (con Comparar), Calidad del dato y panel lateral. */
(function () {
  const EP = window.EP, K = EP.kit;
  const { S, N, t, tn, esc, valor, nombreMedida, nombreEquipo, fecha, cat, lista } = EP;

  // ---------- cabecera ----------
  function cabecera(view) {
    const vm = S.vm;
    // Con un bloqueo duro no hay resumen redactado, ni personalizar, ni presentar: no hay cifras de las que hablar
    if (bloqueoDuro() && ['fuentes', 'ajustes', 'calidad', 'iniciativas', 'cortes'].indexOf(view) < 0) return { titulo: t('nav.' + view), sub: t('dc.bloqueo.titulo') };
    const btn = (label, action, extra, primary) => `<button class="btn${primary ? ' primary' : ''}" data-action="${action}"${extra || ''}>${esc(label)}</button>`;
    const sub = t('cabecera.datosHasta', { fecha: fecha(vm.fechaDatos), n: vm.equipos.length, k: vm.semanas.K });
    if (view === 'resumen') return { titulo: t('nav.resumen'), sub, acciones: btn(t('personalizar.abrir'), 'drill', ' data-kind="personalizar"') + btn(t('compartir.abrir'), 'drill', ' data-kind="compartir"', true) };
    if (view === 'equipos') {
      if (S.teamCompare && S.role !== 'equipo') return { titulo: t('comparar.titulo'), sub: t('comparar.sub') };
      return { titulo: nombreEquipo(S.team), sub: t('equipo.sub', { k: vm.semanas.K, r: vm.semanas.R }), acciones: btn(t('personalizar.abrir'), 'drill', ' data-kind="personalizar"') + btn(t('compartir.abrir'), 'drill', ` data-kind="compartir" data-team="${esc(S.team)}"`, true) };
    }
    if (view === 'recomendaciones') return { titulo: t('nav.recomendaciones'), sub: t('recs.sub'), acciones: btn(t('comun.imprimir'), 'print') };
    // Iniciativas y Fuentes son la segunda pestaña de Qué hacer y de Datos: llevan el título de su entrada del menú
    if (view === 'iniciativas') return { titulo: t('nav.recomendaciones'), sub: t('ini.sub'), acciones: btn(t('ini.nueva'), 'ini-nueva', '', true) };
    if (view === 'fuentes') return { titulo: t('nav.calidad'), sub: t('fuentes.sub'), acciones: btn(t('fuentes.anadir'), 'import', '', true) };
    return { titulo: t('nav.' + view), sub: t('pagina.sub.' + view) };
  }

  // ---------- Resumen: la baseline de cada equipo ----------
  function resumen() {
    const vm = S.vm, eqs = EP.visibles();
    const alerta = eqs.filter((e) => e.estado === 'alerta'), pocoFiables = eqs.filter((e) => e.estado === 'poco_fiable'), prov = eqs.filter((e) => e.estado === 'provisional');
    const revisar = eqs.filter((e) => e.estado === 'revisar'), atencion = eqs.filter((e) => e.graves && e.graves.length && e.estado !== 'alerta');
    const recs = recsActivas(eqs);
    const tono = alerta.length || pocoFiables.length ? 'bad' : prov.length || revisar.length || atencion.length ? 'warn' : 'good';
    // "Ningún equipo fuera de lo normal" solo si hay con qué comparar: sin ninguna baseline fiable, se dice eso
    const sinComparar = eqs.length && eqs.every((e) => e.estado === 'poco_fiable' || e.estado === 'provisional');
    const titular = alerta.length ? esc(tn('resumen.conAlerta', alerta.length, { equipos: lista(alerta.map((e) => nombreEquipo(e.nombre))) })) : esc(t(sinComparar ? 'resumen.sinComparar' : 'resumen.sinAlertas'));
    const f = vm.fiabilidad;
    const items = [esc(t('resumen.fiabilidadItem', { nivel: t('fiab.nivel.' + f.nivel).toLowerCase() }))];
    if (pocoFiables.length) items.push(esc(t('resumen.pocoFiables', { equipos: lista(pocoFiables.map((e) => nombreEquipo(e.nombre))) })));
    if (revisar.length) items.push(esc(t('resumen.revisarEn', { equipos: lista(revisar.map((e) => nombreEquipo(e.nombre))) })));
    if (prov.length) items.push(esc(t('resumen.provisionales', { equipos: lista(prov.map((e) => nombreEquipo(e.nombre))) })));
    if (atencion.length) items.push(esc(t('resumen.atencionEn', { equipos: lista(atencion.map((e) => nombreEquipo(e.nombre))) })));
    const dest = K.destacados();
    // Toda el área, primero (si hay más de un equipo a la vista): la vista que antes estaba en la página de línea base
    const fichaArea = eqs.length > 1 && S.role !== 'equipo' ? K.ficha(`<div class="f-title">${esc(t('equipo.area'))}</div>`, `<div class="fbs">${dest.map((id) => K.filaBaseline(vm.area, id)).join('')}</div>`,
      vm.areaSin && vm.areaSin.length ? `<span class="small muted">${esc(t('ref.areaSin', { equipos: lista(vm.areaSin.map(nombreEquipo)) }))}</span>` : '') : '';
    const fichas = fichaArea + eqs.map((e) => K.ficha(K.tituloEquipo(e) + K.equipoChip(e), `<div class="fbs">${dest.map((id) => K.filaBaseline(e, id)).join('')}</div>`,
      `<span class="small muted">${esc(pieFicha(e))}</span><button class="link" data-action="open-team" data-team="${esc(e.nombre)}">${esc(t('resumen.abrirFicha'))}</button>`)).join('');
    // Qué hacer: una línea con el número y el enlace (la lista está en Qué hacer, con un solo orden)
    const altas = recs.filter((r) => r.nivel === 'alto').length;
    const cuenta = !recs.length ? t('recs.ninguna') : altas ? tn('resumen.queHacer', recs.length, { a: altas }) : tn('resumen.queHacerSinAltas', recs.length);
    // El enlace abre la lista sin filtros: el número que se lee aquí es el que se ve allí
    const queHacer = `<div class="ficha que-hacer"><div class="f-body row"><span>${esc(cuenta)}</span>${recs.length ? `<button class="btn sm primary" data-action="ver-que-hacer">${esc(t('resumen.verQueHacer'))}</button>` : ''}</div></div>`;
    return K.statusBar(tono, titular, items) + (EP.cortes && EP.cortes.lineaResumen ? EP.cortes.lineaResumen() : '') + avisoEquipos() + preguntas() + queHacer
      + K.sec(t('resumen.baselineEquipos'), `<span class="muted small">${esc(t('resumen.baselineNota', { r: vm.semanas.R, k: vm.semanas.K }))}</span>`) + `<div class="fichas cols-2">${fichas}</div>`;
  }
  /** Equipos nuevos en este export (se ofrece medirlos) y qué queda fuera de la medición (equipos pequeños y tareas sin equipo). */
  function avisoEquipos() {
    const f = S.vm.fuera; if (!f || S.role === 'equipo') return '';
    let html = '';
    if (f.nuevos.length) html += `<div class="notice warn small">${esc(tn('equipos.nuevos', f.nuevos.length, { lista: lista(f.nuevos.map(nombreEquipo)) }))} <button class="btn sm" data-action="eq-nuevos-anadir">${esc(t('equipos.nuevosAnadir'))}</button> <button class="link small" data-action="eq-nuevos-no">${esc(t('equipos.nuevosNo'))}</button></div>`;
    const pocos = f.fuera.filter((x) => x.poco || f.nuevos.indexOf(x.nombre) < 0);
    if (pocos.length || f.sinEquipo) html += `<p class="tiny muted">${esc([pocos.length ? t('equipos.fuera', { lista: lista(pocos.map((x) => nombreEquipo(x.nombre) + ' (' + tn('equipos.tareas', x.n) + ')')) }) : '', f.sinEquipo ? tn('equipos.sinEquipo', f.sinEquipo) : ''].filter(Boolean).join(' '))}</p>`;
    return html;
  }
  /** Una línea por equipo: lo que ha cambiado, lo que hay que revisar o lo que va mejor de lo normal. Nunca "normal" si no lo es. */
  function pieFicha(e) {
    if (e.cambios[0]) {
      // Lo que supera un límite fijo no está "fuera de lo normal" del equipo: puede estar incluso mejor que su franja
      const porLimite = e.cambios.filter((x) => x.m.estadoPor === 'limite' || x.m.estadoPor === 'limite_equipo').map((x) => nombreMedida(x.id));
      const fuera = e.cambios.filter((x) => x.m.estadoPor !== 'limite' && x.m.estadoPor !== 'limite_equipo').map((x) => nombreMedida(x.id));
      const revisar = e.revisarDato && e.revisarDato.length ? t('resumen.revisarDato', { m: lista(e.revisarDato.map(nombreMedida)) }) : '';
      return [fuera.length ? t('resumen.cambio', { m: lista(fuera) }) : '', porLimite.length ? t('resumen.cambioLimite', { m: lista(porLimite) }) : '', revisar].filter(Boolean).join(' · ');
    }
    if (e.revisarDato && e.revisarDato.length) return t('resumen.revisarDato', { m: lista(e.revisarDato.map(nombreMedida)) });
    if (e.estado === 'atencion') return t('resumen.atencionPie', { r: lista(e.graves.map((id) => cat().casos[id] ? cat().casos[id].titulo : id)) });
    if (e.mejores && e.mejores.length) return t('resumen.mejor', { m: lista(e.mejores.map(nombreMedida)) });
    // Con valor pero sin rango normal todavía: no se puede decir que esté "dentro de lo normal"
    const sinRango = K.destacados().filter((id) => { const m = e.medidas[id]; return m && m.disponible && m.valor != null && !m.ref && !m.sinHistorico; });
    if (sinRango.length) return t('resumen.sinRango', { m: lista(sinRango.map(nombreMedida)) });
    const sinHistorico = K.destacados().filter((id) => { const m = e.medidas[id]; return m && m.disponible && m.sinHistorico; });
    if (sinHistorico.length) return t('resumen.sinHistorico', { m: lista(sinHistorico.map(nombreMedida)) });
    return t('resumen.fichaEstable');
  }
  /** Ficha de equipo sin cambios: lo mismo que el pie del Resumen, con la frase larga cuando de verdad todo es normal. */
  function textoSinCambios(e) { const p = pieFicha(e); return p === t('resumen.fichaEstable') ? t('equipo.todoNormal') : p; }
  /**
   * Preguntas de dirección: una por objetivo del Context. Cada una se responde con las medidas de ese objetivo
   * en los equipos visibles: qué equipos están fuera de lo normal. Una pregunta entra si su respuesta lleva a decidir algo.
   */
  function preguntas() {
    const vm = S.vm, P = EP.P, c = P.contexto(S.cfg, S.det), eqs = EP.visibles(), cols = vm.kpis;
    const tarjetas = P.OBJETIVOS.filter((o) => c.objetivos.indexOf(o.id) >= 0).map((o) => {
      const kpis = o.kpis.filter((k) => cols.indexOf(k) >= 0);
      if (!kpis.length) return '';
      const malos = [], revisar = new Set(), mejores = new Set(); let conDato = false;
      eqs.forEach((e) => kpis.forEach((k) => {
        const m = e.medidas[k];
        if (!m || !m.disponible) return;
        conDato = true;
        if (m.estado === 'atencion' || m.estado === 'critico') malos.push({ e, k, m });
        else if (m.revisar) revisar.add(nombreEquipo(e.nombre));
        else if (m.estado === 'bien' && m.lado === 'mejor') mejores.add(nombreEquipo(e.nombre));
      }));
      // Una medida de la pregunta sin datos en ningún equipo: la respuesta es parcial, nunca un "Sí" entero
      const faltan = kpis.filter((k) => !eqs.some((e) => { const m = e.medidas[k]; return m && m.disponible && m.valor != null; }));
      malos.sort((a, b) => (b.m.estado === 'critico' ? 1 : 0) - (a.m.estado === 'critico' ? 1 : 0));
      const parcial = conDato && !malos.length && (faltan.length || revisar.size);
      const tono = !conDato ? 'neutral' : malos.some((x) => x.m.estado === 'critico') ? 'bad' : malos.length || parcial ? 'warn' : 'good';
      const nEq = new Set(malos.map((x) => x.e.nombre)).size;
      const resp = !conDato ? t('preg.sinDatos') : malos.length ? tn('preg.revisar', nEq) : parcial ? t('preg.enParte') : t('preg.bien');
      const detalleBien = [faltan.length ? t('preg.enParteDetalle', { m: lista(faltan.map(nombreMedida)) }) : (mejores.size ? t('preg.mejorDetalle', { equipos: lista([...mejores]) }) : t('preg.bienDetalle')),
        revisar.size ? t('preg.revisarDato', { equipos: lista([...revisar]) }) : ''].filter(Boolean).join(' ');
      const cuerpo = malos.length ? malos.slice(0, 4).map((x) => `<div class="rrow clickable" data-action="drill" data-kind="medida" data-team="${esc(x.e.nombre)}" data-medida="${esc(x.k)}" role="button" tabindex="0">${K.estadoChip(x.m)}<div class="rrow-t"><b>${esc(nombreEquipo(x.e.nombre))}</b><div class="small muted">${esc(nombreMedida(x.k))}: ${esc(K.conUnidad(x.k, x.m.valor))} · ${esc(K.rango(x.k, x.m))}</div></div><span class="go">›</span></div>`).join('')
        + (malos.length > 4 ? `<div class="tiny muted">${esc(tn('preg.mas', malos.length - 4))}</div>` : '')
        : `<p class="small muted">${esc(conDato ? detalleBien : t('preg.sinDatosDetalle'))}</p>`;
      // Una línea por pregunta (respuesta y qué equipos); el detalle, al abrirla. Así el Resumen cabe en una pantalla.
      const quienes = malos.length ? lista([...new Set(malos.map((x) => nombreEquipo(x.e.nombre)))]) : (conDato ? detalleBien : t('preg.sinDatosDetalle'));
      const abierta = !!(S.pregAbiertas && S.pregAbiertas[o.id]);
      return `<details class="preg" data-tipo="pregunta" data-preg="${esc(o.id)}"${abierta ? ' open' : ''}><summary><b>${esc(t('preg.' + o.id))}</b>${K.chip(tono, resp)}<span class="small muted preg-quien">${esc(quienes)}</span></summary>
        <div class="preg-cuerpo">${malos.length ? cuerpo : ''}<div class="tiny muted">${esc(t('preg.mide', { m: lista(kpis.map(nombreMedida)) }))}</div></div></details>`;
    }).filter(Boolean);
    return tarjetas.length ? K.sec(t('preg.titulo'), `<span class="muted small">${esc(t('preg.nota'))}</span>`) + `<div class="ficha list preguntas">${tarjetas.join('')}</div>` : '';
  }
  /** Recomendaciones de unos equipos, cada una con el nivel y la evidencia de esos equipos, de más a menos urgente. */
  // Las preguntas que se abren siguen abiertas al repintar (por ejemplo, al abrir y cerrar el detalle de una cifra)
  document.addEventListener('toggle', (e) => { const d = e.target; if (d && d.matches && d.matches('details.preg')) { S.pregAbiertas = S.pregAbiertas || {}; S.pregAbiertas[d.dataset.preg] = d.open; } }, true);
  // Al imprimir, las preguntas salen abiertas
  window.addEventListener('beforeprint', () => document.querySelectorAll('details.preg').forEach((d) => { d.open = true; }));
  function recsActivas(eqs) {
    const n = eqs.map((e) => e.nombre);
    return S.vm.recs.filter((r) => !S.dismissed[r.clave] && r.equipos.some((e) => n.indexOf(e) >= 0)).map((r) => K.recPara(r, n))
      .map((r, i) => [r, i]).sort((a, b) => K.ordenRecs(a[0], b[0]) || a[1] - b[1]).map((x) => x[0]);
  }

  // ---------- Equipos ----------
  function pestanas() {
    if (S.role === 'equipo') return '';
    return `<div class="tabs">${S.vm.equipos.map((e) => `<button class="tab ${!S.teamCompare && S.team === e.nombre ? 'on' : ''}" data-action="team-tab" data-team="${esc(e.nombre)}"><i class="tone-${{ poco_fiable: 'bad', alerta: 'bad', revisar: 'warn', provisional: 'warn', atencion: 'warn', estable: 'good' }[e.estado]}"></i>${esc(nombreEquipo(e.nombre))}</button>`).join('')}<button class="tab ${S.teamCompare ? 'on' : ''}" data-action="team-tab" data-team="__comparar">${esc(t('comparar.pestana'))}</button></div>`;
  }
  function equipos() {
    if (S.teamCompare && S.role !== 'equipo') return pestanas() + comparar();
    const e = S.vm.equipos.filter((x) => x.nombre === S.team)[0] || S.vm.equipos[0];
    if (!e) return `<div class="ficha empty">${esc(t('equipo.ninguno'))}</div>`;
    return pestanas() + fichaEquipo(e);
  }
  function fichaEquipo(e) {
    const vm = S.vm, dest = K.destacados();
    const c = e.cambios[0];
    const titular = c ? esc(nombreMedida(c.id) + ': ' + K.conUnidad(c.id, c.m.valor)) + ' · ' + esc(K.rango(c.id, c.m)) : esc(e.estado === 'estable' ? (e.mejores && e.mejores.length ? t('resumen.mejor', { m: lista(e.mejores.map(nombreMedida)) }) : t('equipo.estable')) : e.estado === 'atencion' ? pieFicha(e) : t('equipo.estado.' + e.estado));
    const fe = e.fiabilidad;
    const items = [esc(fe ? t('fiab.equipoBien', { bien: fe.bien, n: fe.medibles }) : ''), esc(t('equipo.semanas', { n: e.semanasConDatos }))].filter(Boolean);
    const tiles = `<div class="tiles">${dest.map((id) => K.tile(e, id)).join('')}</div>`;
    const fCambios = K.ficha(`<div class="f-title">${esc(t('equipo.cambios'))}</div>${K.chip(e.cambios.length ? 'bad' : 'neutral', e.cambios.length ? tn('equipo.senales', e.cambios.length) : t('equipo.sinCambios'))}`,
      e.cambios.length ? e.cambios.map((x) => K.cambioFila(e, x)).join('') : `<p class="muted">${esc(textoSinCambios(e))}</p>`);
    const recs = recsActivas([e]);
    const fRecs = K.ficha(`<div class="f-title">${esc(t('equipo.queHacer'))}</div>${K.chip(recs.length ? 'warn' : 'neutral', tn('recs.cuenta', recs.length))}`, recs.length ? recs.slice(0, 3).map(K.recFila).join('') : `<p class="muted">${esc(t('recs.ningunaEquipo'))}</p>`);
    return K.statusBar(e.cambios.length ? 'bad' : e.estado === 'estable' ? 'good' : 'warn', titular, items) + tiles
      + `<div class="fichas cols-2 sp">${fCambios}${fRecs}</div>` + `<div class="fichas cols-2 sp">${fichaPrevision(e)}${fichaEpicasEquipo(e)}</div>` + masDetalle(e);
  }
  // ---------- previsión por probabilidad ----------
  const DIA_MS = 864e5;
  const semanaFecha = (desde, w) => fecha(new Date(new Date(desde).getTime() + w * 7 * DIA_MS));
  const filaPrev = (label, grande, peque) => `<div class="prev-fila"><span class="small muted">${esc(label)}</span><b>${esc(grande)}</b><span class="small muted">${esc(peque || '')}</span></div>`;
  function fichaPrevision(e) {
    const p = e.prevision;
    const cab = `<div class="f-title">${esc(t('prev.titulo'))}</div>${K.chip('neutral', t('prev.chip'))}`;
    if (!p) return K.ficha(cab, `<p class="muted small">${esc(t('prev.sinDatos'))}</p>`);
    const cuando = (c) => (c.p85 == null ? t('prev.sinFin') : tn('prev.semanas', c.p85));
    let html = filaPrev(t('prev.cuatro'), t('prev.alMenos', { n: p.cuatro.p85 }), t('prev.normal', { n: p.cuatro.p50 }));
    if (p.cuandoEnCurso) html += filaPrev(tn('prev.enCurso', p.enCurso), cuando(p.cuandoEnCurso), p.cuandoEnCurso.p85 == null ? '' : t('prev.hacia', { f: semanaFecha(p.desde, p.cuandoEnCurso.p85) }));
    const n = (S.prevN || {})[e.nombre] || 0;
    let res = '';
    if (n > 0) {
      const c = N.cuandoTerminan(p.muestra, n, N.SEMILLA_CUANDO);
      res = c.p85 == null ? t('prev.sinFin') : cuando(c) + ', ' + t('prev.hacia', { f: semanaFecha(p.desde, c.p85) }) + '. ' + tn('prev.normalSem', c.p50);
    }
    html += `<div class="prev-q"><label class="small">${esc(t('prev.pregunta'))}</label><input type="number" min="1" max="2000" step="1" class="sm num" data-change="prev-n" data-team="${esc(e.nombre)}" value="${n || ''}" aria-label="${esc(t('prev.pregunta'))}"><span class="small">${esc(res)}</span></div>`;
    html += `<p class="tiny muted" style="margin:10px 0 0">${esc(t('prev.como', { s: p.muestra.length }))}</p>`;
    // Las entregas de las que sale la previsión están por revisar (cierres en bloque, saltos): se dice antes de dar cifras
    const ent = e.medidas.entregas;
    const aviso = ent && ent.disponible && ent.revisar ? `<div class="notice warn small">${esc(t('prev.revisar'))}</div>` : '';
    return K.ficha(cab, aviso + html);
  }
  EP.cambio('prev-n', (el) => { S.prevN = S.prevN || {}; S.prevN[el.dataset.team] = Math.max(0, Math.min(2000, parseInt(el.value, 10) || 0)); EP.render(); });

  // ---------- épicas ----------
  const TONO_SIT = { vencida: 'bad', parada: 'bad', en_riesgo: 'warn', en_plazo: 'good', sin_fecha: 'neutral', sin_ritmo: 'neutral', terminada: 'good' };
  const sitChip = (x) => K.chip(TONO_SIT[x.situacion], t('epicas.sit.' + x.situacion));
  const prevEpica = (x) => (x.situacion === 'terminada' ? t('epicas.cerrada') : x.prevision85 ? t('prev.hacia', { f: fecha(x.prevision85) }) : x.previsionLejana ? t('prev.sinFin') : x.situacion === 'parada' ? t('epicas.sinRitmo') : t('epicas.aunSinRitmo'));
  function epicaFila(x) {
    return `<div class="rrow">${sitChip(x)}<div class="rrow-t"><b>${esc(x.clave)} · ${esc(x.titulo)}</b><div class="small muted">${esc(t('epicas.hijas', { t: x.terminadas, n: x.hijas }))} · ${esc(prevEpica(x))}</div>${K.barra(x.avance, 'good')}</div></div>`;
  }
  function fichaEpicasEquipo(e) {
    const v = S.vm.epicas;
    const mias = v ? v.epicas.filter((x) => x.equipo === e.nombre && x.situacion !== 'terminada') : [];
    if (!mias.length) return '';
    const puede = (EP.POR_ROL[S.role] || []).indexOf('epicas') >= 0;
    return K.ficha(`<div class="f-title">${esc(t('epicas.equipoTitulo'))}</div>${K.chip('neutral', tn('epicas.abiertas', mias.length))}`, mias.slice(0, 4).map(epicaFila).join(''),
      puede ? `<button class="link" data-action="go" data-view="epicas">${esc(t('epicas.verTodas'))}</button>` : '');
  }
  function epicas() {
    const v = S.vm.epicas, vis = EP.visibles().map((e) => e.nombre);
    const todas = (v ? v.epicas : []).filter((x) => vis.indexOf(x.equipo) >= 0);
    if (!todas.length) return K.statusBar('neutral', esc(t('epicas.ninguna')), [esc(t('epicas.items1'))]) + `<div class="ficha empty">${esc(t('epicas.vacio'))}</div>`;
    const abiertas = todas.filter((x) => x.situacion !== 'terminada'), terminadas = todas.filter((x) => x.situacion === 'terminada');
    const n = (s) => abiertas.filter((x) => x.situacion === s).length;
    const venc = n('vencida'), par = n('parada'), riesgo = n('en_riesgo');
    const tono = venc || par ? 'bad' : riesgo ? 'warn' : abiertas.length ? 'good' : 'neutral';
    const partes = [tn('epicas.abiertas', abiertas.length)];
    if (venc) partes.push(tn('epicas.vencidas', venc));
    if (par) partes.push(tn('epicas.paradas', par));
    if (riesgo) partes.push(tn('epicas.enRiesgo', riesgo));
    const pctSin = v.tareas ? v.sinEpica / v.tareas : 0;
    const tiles = `<div class="tiles">${K.stat(t('epicas.tile.abiertas'), String(abiertas.length), esc(tn('epicas.tile.abiertasPie', terminadas.length)), '')}`
      + `${K.stat(t('epicas.tile.riesgo'), String(venc + riesgo), esc(v.hayVencimientos ? t('epicas.tile.riesgoPie') : t('epicas.tile.riesgoSin')), '', { tone: venc ? 'bad' : riesgo ? 'warn' : 'good' })}`
      + `${K.stat(t('epicas.tile.paradas'), String(par), esc(t('epicas.tile.paradasPie', { s: v.semanasRitmo })), '', { tone: par ? 'bad' : 'good' })}`
      + `${K.stat(t('epicas.tile.sinEpica'), N.conPorcentaje(Math.round(pctSin * 100)), esc(t('epicas.tile.sinEpicaPie', { n: v.sinEpica, de: v.tareas })), '', { tone: pctSin > 0.2 ? 'warn' : 'good' })}</div>`;
    const fila = (x) => `<tr${x.situacion === 'vencida' || x.situacion === 'parada' ? ' class="dudoso"' : ''}><td><b>${esc(x.clave)}</b><div class="small">${esc(x.titulo)}</div>${x.estadoDescuadrado ? `<div class="tiny t-warn" title="${esc(t('epicas.descuadradoTitle'))}">${esc(t('epicas.descuadrado', { e: x.estado }))}</div>` : ''}</td>
      <td>${esc(nombreEquipo(x.equipo))}</td><td style="min-width:120px">${K.barra(x.avance, 'good')}<div class="tiny muted">${esc(t('epicas.hijas', { t: x.terminadas, n: x.hijas }))}</div></td>
      <td class="num">${esc(t('epicas.ritmo', { n: N.formatear(x.ritmo, 'dec') }))}</td><td>${esc(prevEpica(x))}</td><td>${esc(x.vence ? fecha(x.vence) : t('epicas.sinFecha'))}</td><td>${sitChip(x)}</td></tr>`;
    const cab = `<tr><th>${esc(t('epicas.col.epica'))}</th><th>${esc(t('epicas.col.equipo'))}</th><th>${esc(t('epicas.col.avance'))}</th><th class="num">${esc(t('epicas.col.ritmo'))}</th><th>${esc(t('epicas.col.prevision'))}</th><th>${esc(t('epicas.col.vence'))}</th><th>${esc(t('epicas.col.situacion'))}</th></tr>`;
    const tabla = abiertas.length ? `<div class="ficha"><div class="table-wrap"><table>${cab}${abiertas.map(fila).join('')}</table></div></div>` : `<div class="ficha empty">${esc(t('epicas.todasCerradas'))}</div>`;
    const cerradas = terminadas.length ? `<details class="mas"><summary>${esc(tn('epicas.terminadas', terminadas.length))}</summary><div class="ficha"><div class="table-wrap"><table>${cab}${terminadas.map(fila).join('')}</table></div></div></details>` : '';
    return K.statusBar(tono, esc(partes.join(' · ')), [esc(t('epicas.items1')), esc(t('epicas.items2', { s: v.semanasRitmo }))])
      + tiles + (v.hayVencimientos ? '' : `<div class="notice info small" style="margin:12px 0">${esc(t('epicas.sinVencimientos'))}</div>`)
      + `<div class="sp">${tabla}</div>` + cerradas;
  }
  /** Lo que no es baseline va plegado: tiempo por etapa, fiabilidad, trabajo parado y el resto de medidas. */
  function masDetalle(e) {
    const vm = S.vm, dest = K.destacados(), fe = e.fiabilidad;
    const ti = e.tiempo;
    const tiempo = ti && ti.n ? (() => {
      const tot = (ti.cursoDias || 0) + (ti.esperaDias || 0) || 1;
      const filas = ti.porEstado.slice(0, 4).map((x) => `<div class="fila-barra"><span class="small">${esc(x.estado)}</span>${K.barra(x.dias / tot, 'warn')}<b class="small">${esc(N.formatear(x.dias, 'dias'))}</b></div>`).join('');
      return `<div class="stage-bar"><span class="sw-in_progress" style="width:${((ti.cursoDias / tot) * 100).toFixed(1)}%"></span><span class="sw-review" style="width:${((ti.esperaDias / tot) * 100).toFixed(1)}%"></span></div>
        <div class="stage-legend"><span><i class="sw-in_progress"></i>${esc(t('tiempo.curso', { d: N.formatear(ti.cursoDias, 'dias') }))}</span><span><i class="sw-review"></i>${esc(t('tiempo.espera', { d: N.formatear(ti.esperaDias, 'dias') }))}</span></div>
        ${filas ? `<div class="tiny muted" style="margin:8px 0 4px">${esc(t('tiempo.esperaPorEstado'))}</div>${filas}` : ''}`;
    })() : `<p class="muted small">${esc(t('tiempo.sinTiempos'))}</p>`;
    const fTiempo = K.ficha(`<div class="f-title">${esc(t('tiempo.titulo'))}</div>${K.chip('neutral', t('tiempo.porTarea'))}`, tiempo);
    const checks = fe ? N.COMPROBACIONES_EQUIPO.map((k) => {
      const x = fe.valores[k], def = vm.fiabilidad.comprobaciones.filter((c) => c.id === k)[0];
      return `<div class="fila-dot clickable" data-action="drill" data-kind="comprobacion" data-id="${esc(k)}" role="button" tabindex="0"><span class="s-dot tone-${x.estado === 'bien' ? 'good' : x.estado === 'revisar' ? 'bad' : 'neutral'}"></span><span class="small">${esc(def ? def.nombre : k)}</span><b class="small">${esc(x.valor)}</b></div>`;
    }).join('') : '';
    const fFiab = K.ficha(`<div class="f-title">${esc(t('equipo.fiabilidad'))}</div>${fe ? K.chip(fe.revisar >= 3 ? 'bad' : fe.revisar ? 'warn' : 'good', t('fiab.equipoBien', { bien: fe.bien, n: fe.medibles })) : ''}`, `<div class="filas">${checks}</div>`);
    const parado = e.atascadas.length ? e.atascadas.slice(0, 5).map((x) => `<div class="rrow"><span class="chip warn">${esc(N.formatear(x.edad, 'dias'))}</span><div class="rrow-t"><b>${esc(x.clave)}</b><div class="small muted">${esc(x.resumen)} · ${esc(x.estado)}</div></div></div>`).join('') : `<p class="muted">${esc(t('equipo.nadaParado'))}</p>`;
    const fParado = K.ficha(`<div class="f-title">${esc(t('equipo.parado'))}</div>${e.umbralEdad != null ? K.chip('neutral', t('equipo.paradoUmbral', { d: N.formatear(e.umbralEdad, 'dias') })) : ''}`, parado);
    const otras = cat().ordenMedidas.filter((id) => dest.indexOf(id) < 0 && e.medidas[id] && e.medidas[id].disponible);
    const fOtras = otras.length ? K.ficha(`<div class="f-title">${esc(tn('equipo.verTodas', otras.length))}</div>`, `<div class="fbs">${otras.map((id) => K.filaBaseline(e, id)).join('')}</div>`) : '';
    const rp = e.reparto;
    const fReparto = rp ? K.ficha(`<div class="f-title">${esc(t('reparto.titulo', { c: rp.campo }))}</div>`, rp.filas.slice(0, 8).map((x) => `<div class="fila-barra"><span class="small">${esc(x.valor || t('reparto.sinValor'))}</span>${K.barra(x.parte, 'good')}<b class="small">${esc(N.conPorcentaje(Math.round(x.parte * 100)))}</b></div>`).join(''), `<span class="tiny muted">${esc(t('reparto.pie'))}</span>`) : '';
    return `<details class="mas"><summary>${esc(t('equipo.masDetalle'))}</summary><div class="fichas cols-2 sp">${fTiempo}${fFiab}${fParado}${fReparto}${fOtras}</div></details>`;
  }

  // ---------- Comparar ----------
  const CMP_ORDEN = ['plazo_p85', 'retrabajo', 'reabiertas', 'bloqueo', 'arrastradas'];
  function comparar() {
    const vm = S.vm, cols = vm.kpis;
    // Cada equipo frente a su propia banda: una fila por equipo, sin ranking
    const tabla = `<div class="ficha"><div class="table-wrap"><table class="cmp"><tr><th>${esc(t('comun.equipo'))}</th>${cols.map((id) => `<th>${esc(nombreMedida(id))}</th>`).join('')}</tr>
      ${vm.equipos.map((e) => `<tr><td><button class="link" data-action="open-team" data-team="${esc(e.nombre)}">${esc(nombreEquipo(e.nombre))}</button></td>${cols.map((id) => { const m = e.medidas[id]; return `<td class="num">${m && m.disponible ? `<span class="pill tone-${K.tonoDe(m)}">${esc(valor(id, m.valor))}</span>` : `<span class="faint">${esc(t('comun.sinDatos'))}</span>`}</td>`; }).join('')}</tr>`).join('')}</table></div>
      <div class="tiny muted" style="margin-top:8px">${esc(t('comparar.leyenda'))}</div></div>`;
    const cmps = vm.comparaciones;
    const grupos = cmps.length ? cmps.map((c) => {
      const filas = CMP_ORDEN.filter((m) => c.medidas[m] && c.medidas[m].disponible).map((m) => {
        const tot = c.medidas[m].segmentos.filter((s) => s.tipo === 'todos')[0];
        const dif = c.diferencias.filter((d) => d.medida === m && d.peor)[0];
        return `<tr><td>${esc(t('cmp.medida.' + m))}</td>${c.grupos.map((g) => { const x = tot && tot.porGrupo[g.id]; const pocos = !x || x.n < N.MUESTRA_MINIMA; return `<td class="num${dif && dif.peor === g.id ? ' worse' : ''}">${x && x.valor != null && !pocos ? esc(N.formatear(x.valor, m === 'plazo_p85' ? 'dias' : 'pct')) : `<span class="faint">${esc(t('comparar.pocosDatos'))}</span>`}<div class="tiny muted">${x ? esc(t('comparar.tareas', { n: x.n })) : ''}</div></td>`; }).join('')}</tr>`;
      }).join('');
      const difs = c.diferencias.filter((d) => d.peor).map((d) => `<li>${esc(t('comparar.diferencia', { grupo: (c.grupos.filter((g) => g.id === d.peor)[0] || {}).nombre || d.peor, medida: t('cmp.medida.' + d.medida).toLowerCase(), seg: d.segmentosConDiferencia, de: d.segmentosComparables }))}</li>`).join('');
      return K.ficha(`<div class="f-title">${esc(t('comparar.dim.' + c.dimension) + (c.ambito ? ' · ' + c.ambito : ''))}</div>${K.chip(c.diferencias.some((d) => d.peor) ? 'warn' : 'good', c.diferencias.some((d) => d.peor) ? t('comparar.conDiferencias') : t('comparar.sinDiferencias'))}`,
        `<div class="table-wrap"><table class="cmp"><tr><th></th>${c.grupos.map((g) => `<th>${esc(g.nombre)}<div class="tiny muted">${esc(lista(g.equipos))}</div></th>`).join('')}</tr>${filas}</table></div>${difs ? `<ul class="small">${difs}</ul>` : ''}`,
        `<span class="tiny muted">${esc(cat().textos['comparacion.aviso'] || '')}</span>`);
    }).join('') : `<div class="ficha empty">${esc(t('comparar.sinGrupos'))} <button class="link" data-action="fuentes-equipos">${esc(t('comparar.marcar'))}</button></div>`;
    return K.statusBar('neutral', esc(t('comparar.titular')), [esc(t('comparar.items1')), esc(t('comparar.items2'))])
      + K.sec(t('comparar.cadaEquipo')) + tabla + K.sec(t('comparar.grupos')) + `<div class="fichas">${grupos}</div>`;
  }
  EP.accion('fuentes-equipos', () => { S.fuentesTab = 'equipos'; EP.go('fuentes'); });

  // ---------- Calidad del dato ----------
  function calidad() {
    const vm = S.vm, f = vm.fiabilidad, dc = vm.dataCheck, eqs = EP.visibles();
    const porConfirmar = EP.P.porRevisar(S.cfg, vm.det);
    const tonoNivel = f.nivel === 'alta' ? 'good' : f.nivel === 'media' ? 'warn' : 'bad';
    const tiles = `<div class="tiles">
      ${K.stat(t('calidad.tile.nivel'), esc(t('fiab.nivel.' + f.nivel)), esc(t('calidad.tile.nivelPie')), '', { tone: tonoNivel })}
      ${K.stat(t('calidad.tile.bien'), `${f.bien}<small>/${f.comprobaciones.length}</small>`, esc(t('calidad.tile.bienPie')), '', { tone: 'good' })}
      ${K.stat(t('calidad.tile.revisar'), String(f.revisar), esc(f.revisar ? t('calidad.tile.revisarPie') : t('calidad.tile.revisarNada')), '', { tone: f.revisar ? 'warn' : 'good' })}
      ${K.stat(t('calidad.tile.estados'), String(porConfirmar.length), esc(t('calidad.tile.estadosPie')), `<button class="link small" data-action="fuentes-mapeo">${esc(t('calidad.revisarMapeo'))}</button>`, { tone: porConfirmar.length ? 'warn' : 'good' })}
    </div>`;
    const ver = { ready: 'good', limits: 'warn', not_ready: 'bad' }[dc.veredicto];
    const dcHtml = K.ficha(`<div class="f-title">${esc(t('ob.dc.kpis'))}</div>${K.chip(ver, t('dc.veredicto.' + dc.veredicto))}`,
      (dc.bloqueos.length ? `<ul class="small">${dc.bloqueos.map((b) => `<li>${esc(t(b.clave, b.p))}</li>`).join('')}</ul>` : '')
      + `<div class="filas">${dc.kpis.map((id) => { const l = dc.limites.filter((x) => x.kpi === id)[0]; return `<div class="fila-dot"><span class="s-dot tone-${!l ? 'good' : l.parcial ? 'warn' : 'bad'}"></span><span class="small"><b>${esc(nombreMedida(id))}</b>${l ? ' · ' + esc(l.parcial ? t('dc.soloPara', { equipos: lista(l.equipos) }) : (l.motivo || t('medida.noDisponible'))) : ''}</span></div>`; }).join('')}
        ${dc.limites.filter((l) => !l.kpi).map((l) => `<div class="fila-dot"><span class="s-dot tone-warn"></span><span class="small">${esc(t(l.clave))}</span></div>`).join('')}</div>`);
    const fichas = eqs.map((e) => {
      const fe = e.fiabilidad; if (!fe) return '';
      const checks = N.COMPROBACIONES_EQUIPO.map((k) => { const x = fe.valores[k], def = f.comprobaciones.filter((c) => c.id === k)[0]; return `<div class="fila-dot clickable" data-action="drill" data-kind="comprobacion" data-id="${esc(k)}" role="button" tabindex="0"><span class="s-dot tone-${x.estado === 'bien' ? 'good' : x.estado === 'revisar' ? 'bad' : 'neutral'}"></span><span class="small">${esc(def ? def.nombre : k)}</span><b class="small">${esc(x.valor)}</b></div>`; }).join('');
      return K.ficha(`<div class="f-title">${esc(nombreEquipo(e.nombre))}</div>${K.chip(fe.revisar >= 3 ? 'bad' : fe.revisar ? 'warn' : 'good', t('fiab.equipoBien', { bien: fe.bien, n: fe.medibles }))}`, `<div class="filas">${checks}</div>`,
        `<span class="small muted">${esc(t('calidad.fichaPie', { n: e.n, s: e.semanasConDatos }))}</span>`);
    }).join('');
    const revisar = f.comprobaciones.filter((c) => c.estado === 'revisar');
    const falla = `<div class="ficha list">${revisar.length ? revisar.map((c) => `<div class="rrow clickable" data-action="drill" data-kind="comprobacion" data-id="${esc(c.id)}" role="button" tabindex="0"><span class="chip warn">${esc(c.valor)}</span><div class="rrow-t"><b>${esc(c.nombre)}</b><div class="small muted">${esc(c.arreglo)}</div></div><span class="go">›</span></div>`).join('') : `<p class="muted">${esc(t('calidad.nadaQueRevisar'))}</p>`}</div>`;
    return K.statusBar(tonoNivel, esc(t('calidad.titular', { nivel: t('fiab.nivel.' + f.nivel).toLowerCase(), v: t('dc.veredicto.' + dc.veredicto) })), [esc(t('fiab.bienDe', { bien: f.bien, n: f.comprobaciones.length })), esc(t('calidad.items2'))])
      + tiles + K.sec(t('dc.titulo')) + `<div class="fichas cols-1">${dcHtml}</div>`
      + K.sec(t('calidad.porEquipo')) + `<div class="fichas">${fichas}</div>`
      + K.sec(t('calidad.queFalla')) + falla;
  }
  EP.accion('fuentes-mapeo', () => { S.fuentesTab = 'mapeo'; EP.go('fuentes'); });

  // ---------- panel lateral ----------
  function cajon() {
    const el = document.getElementById('drawer'); if (!el) return;
    const d = S.drill;
    if (!d || !S.vm) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    let titulo = '', cuerpo = '', extra = '';
    if (d.kind === 'medida') [titulo, cuerpo, extra] = cajonMedida(d);
    else if (d.kind === 'comprobacion') [titulo, cuerpo] = cajonComprobacion(d);
    else if (d.kind === 'caso') [titulo, cuerpo] = EP.vistas.cajonCaso(d);
    else if (d.kind === 'resumen') [titulo, cuerpo] = EP.vistas.cajonResumen(d);
    else if (d.kind === 'personalizar') [titulo, cuerpo] = cajonPersonalizar();
    else if (d.kind === 'compartir') [titulo, cuerpo] = cajonCompartir(d);
    else [titulo, cuerpo] = cajonAyuda();
    el.classList.remove('hidden');
    el.innerHTML = `<div class="drawer-bg" data-action="drill-close"></div><div class="drawer-panel" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="drawer-head"><h3>${esc(titulo)}</h3><div class="row">${extra}<button class="btn sm" data-action="drill-close">${esc(t('comun.cerrar'))}</button></div></div>${cuerpo}</div>`;
  }
  function cajonMedida(d) {
    const e = d.team === S.vm.area.nombre ? S.vm.area : S.vm.equipos.filter((x) => x.nombre === d.team)[0];
    const id = d.medida, m = e && e.medidas[id], def = cat().medidas[id];
    const titulo = nombreEquipo(d.team) + ' · ' + nombreMedida(id);
    if (!m) return [titulo, `<p class="muted">${esc(t('medida.noDisponible'))}</p>`, ''];
    let html = (def && def.pregunta ? `<p class="small muted">${esc(def.pregunta)}</p>` : '') + `<p>${esc(def ? def.como : t('medida.costeComo'))}</p>`;
    if (def && def.decision) html += `<div class="ficha-4"><div><span class="tiny muted">${esc(t('cajon.decision'))}</span><b class="small">${esc(def.decision)}</b></div><div><span class="tiny muted">${esc(t('cajon.quien'))}</span><b class="small">${esc(def.quien || '')}</b></div></div>`;
    if (m.disponible) html += `<div class="kv"><div><span>${esc(t('cajon.valor'))}</span><b>${esc(K.conUnidad(id, m.valor))}</b></div><div><span>${esc(t('cajon.normal'))}</span><b>${esc(m.ref ? t('medida.rangoCorto', { lo: valor(id, m.ref.lo), hi: valor(id, m.ref.hi) }) : K.rangoBanda(id, m))}</b></div><div><span>${esc(t('cajon.estado'))}</span>${K.estadoChip(m)}</div><div><span>${esc(t('cajon.referencia'))}</span><b>${esc(t('ref.' + (m.referencia || 'sin')))}</b></div></div><p class="small">${esc(K.porque(id, m))}</p>`;
    else html += `<div class="notice warn small">${esc(m.motivo || t('medida.noDisponible'))}</div>`;
    if (m.serie) html += `<div class="ficha" style="margin:10px 0">${K.spark(m.serie.slice(-26), m.ref, { tone: K.tonoDe(m), h: 70, label: nombreMedida(id) })}<div class="tiny muted">${esc(t('cajon.serie'))}</div></div>`;
    let extra = '';
    if (e !== S.vm.area && id !== 'coste' && m.disponible) {
      const det = N.detalleMedida(S.r.preparacion, e.nombre, id, { umbralEdad: e.umbralEdad });
      if (det) {
        S.drillFilas = det.filas;
        const marca = det.filas.some((f) => f.cuenta != null);
        html += `<div class="small muted" style="margin:8px 0">${esc(t(det.criterio, { desde: fecha(det.desde), hasta: fecha(det.hasta) }))} · ${esc(tn('cajon.tareas', det.filas.length))}</div>`;
        html += `<div class="table-wrap"><table><tr><th>${esc(t('cajon.col.clave'))}</th><th>${esc(t('cajon.col.titulo'))}</th><th>${esc(t('cajon.col.tipo'))}</th><th>${esc(t('cajon.col.estado'))}</th><th>${esc(t('cajon.col.creada'))}</th><th>${esc(t('cajon.col.terminada'))}</th><th class="num">${esc(t('cajon.col.dias'))}</th>${marca ? `<th>${esc(t('cajon.col.cuenta.' + id))}</th>` : ''}</tr>
          ${det.filas.slice(0, 300).map((f) => `<tr><td>${esc(f.clave)}</td><td>${esc(f.titulo)}</td><td>${esc(t('tipo.' + f.tipo))}</td><td>${esc(f.estado)}</td><td>${esc(fecha(f.creada))}</td><td>${esc(f.terminada ? fecha(f.terminada) : '')}</td><td class="num">${f.dias == null ? '' : esc(N.formatear(f.dias, 'dias'))}</td>${marca ? `<td>${f.cuenta ? '✓' : ''}</td>` : ''}</tr>`).join('')}</table></div>`;
        if (det.filas.length > 300) html += `<div class="tiny muted">${esc(t('cajon.primeras', { n: 300 }))}</div>`;
        extra = `<button class="btn sm" data-action="drill-csv" data-team="${esc(e.nombre)}" data-medida="${esc(id)}">${esc(t('cajon.csv'))}</button>`;
      }
    } else if (e === S.vm.area) html += `<div class="tiny muted">${esc(t('cajon.areaSinDetalle'))}${S.vm.areaSin.length ? ' ' + esc(t('ref.areaSin', { equipos: lista(S.vm.areaSin.map(nombreEquipo)) })) : ''}</div>`;
    return [titulo, html, extra];
  }
  EP.accion('drill-csv', (el) => {
    const f = S.drillFilas || [];
    EP.descargarCsv(`${el.dataset.team}-${el.dataset.medida}.csv`.replace(/[^\w.-]+/g, '_'), [t('cajon.col.clave'), t('cajon.col.titulo'), t('cajon.col.tipo'), t('cajon.col.estado'), t('cajon.col.creada'), t('cajon.col.terminada'), t('cajon.col.dias')],
      f.map((x) => [x.clave, x.titulo, t('tipo.' + x.tipo), x.estado, x.creada ? new Date(x.creada).toISOString().slice(0, 10) : '', x.terminada ? new Date(x.terminada).toISOString().slice(0, 10) : '', x.dias == null ? '' : Math.round(x.dias * 10) / 10]));
  });
  function cajonComprobacion(d) {
    const f = S.vm.fiabilidad, c = f.comprobaciones.filter((x) => x.id === d.id)[0];
    if (!c) return [t('calidad.titulo'), ''];
    const porEq = f.porEquipo.filter((x) => x.valores[d.id]);
    const html = `<p>${esc(c.que)}</p><div class="kv"><div><span>${esc(t('cajon.valor'))}</span><b>${esc(c.valor)}</b></div><div><span>${esc(t('cajon.umbral'))}</span><b>${esc(c.umbral)}</b></div><div><span>${esc(t('cajon.estado'))}</span>${K.chip(c.estado === 'bien' ? 'good' : c.estado === 'revisar' ? 'warn' : 'neutral', t('fiab.estado.' + c.estado))}</div></div>
      <p class="small">${esc(c.detalle)}</p>${c.estado === 'revisar' ? `<div class="notice info small"><b>${esc(t('cajon.arreglo'))}</b> ${esc(c.arreglo)}</div>` : ''}
      ${porEq.length ? `<div class="table-wrap" style="margin-top:10px"><table><tr><th>${esc(t('comun.equipo'))}</th><th>${esc(t('cajon.valor'))}</th></tr>${porEq.map((x) => `<tr><td>${esc(nombreEquipo(x.equipo))}</td><td><span class="s-dot tone-${x.valores[d.id].estado === 'bien' ? 'good' : x.valores[d.id].estado === 'revisar' ? 'bad' : 'neutral'}"></span> ${esc(x.valores[d.id].valor)}</td></tr>`).join('')}</table></div>` : ''}`;
    return [c.nombre, html];
  }
  /** Compartir: las formas de sacar lo que se ve, juntas (presentar, texto para enviar, imprimir y documentos). */
  function cajonCompartir(d) {
    const op = (accion, titulo, texto, extra) => `<button class="rrow clickable compartir" data-action="${accion}"${extra || ''}><div class="rrow-t"><b>${esc(titulo)}</b><div class="small muted">${esc(texto)}</div></div><span class="go">›</span></button>`;
    const html = `<div class="ficha list">${op('present', t('presentar.abrir'), t('compartir.presentar'))}`
      + op('drill', t('resumen.redactado'), t('compartir.texto'), ` data-kind="resumen"${d.team ? ` data-team="${esc(d.team)}"` : ''}`)
      + op('print', t('comun.imprimir'), t('compartir.imprimir'))
      + op('exp-docx', t('ajustes.catalogoWord'), t('compartir.catalogo')) + `</div>`;
    return [t('compartir.titulo'), html];
  }
  function cajonPersonalizar() {
    const sel = K.destacados();
    // Todas las medidas: las que no se pueden medir con este export se ven (y se pueden quitar) con el motivo
    const elegidas = sel.filter((id) => cat().ordenMedidas.indexOf(id) < 0 && id !== 'coste');
    const opciones = cat().ordenMedidas.concat(S.vm.hayCoste ? ['coste'] : []).concat(elegidas);
    const html = `<p class="small muted">${esc(t('personalizar.texto', { rol: t('rol.' + S.role) }))}</p><p class="small"><b>${esc(t('personalizar.elegidos', { n: sel.length }))}</b></p><div class="checks">${opciones.map((id) => `<label class="check"><input type="checkbox" data-change="pref-tile" value="${esc(id)}" ${sel.indexOf(id) >= 0 ? 'checked' : ''}> ${esc(nombreMedida(id))}${K.medible(id) ? '' : ` <span class="tiny muted">(${esc(t('personalizar.noMedible'))})</span>`}</label>`).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn" data-action="pref-reset">${esc(t('personalizar.restaurar'))}</button></div>`;
    return [t('personalizar.titulo'), html];
  }
  EP.cambio('pref-tile', (el) => {
    // Se parte de lo guardado (con los que ahora no se pueden medir, que no se olvidan) o de lo que se ve por defecto
    const by = S.prefs.byRole || {}, guardados = K.destacados().slice();
    const i = guardados.indexOf(el.value);
    if (el.checked && i < 0) { if (guardados.length >= 4) { el.checked = false; EP.toast(t('personalizar.max'), 'bad'); return; } guardados.push(el.value); }
    if (!el.checked && i >= 0) {
      // El último no se quita: sin ninguno volverían los de por defecto
      if (guardados.length <= 1) { el.checked = true; EP.toast(t('personalizar.min'), 'bad'); return; }
      guardados.splice(i, 1);
    }
    S.prefs.byRole = by; S.prefs.byRole[S.role] = guardados; EP.guardarPrefs(); EP.render();
  });
  EP.accion('pref-reset', () => { if (S.prefs.byRole) delete S.prefs.byRole[S.role]; EP.guardarPrefs(); EP.render(); });
  /** Ayuda de la página: primero qué responde esta página, después cómo se compara y todas las etiquetas que pueden salir. */
  const LEYENDA = [['good', 'estado.bien'], ['good', 'estado.borde'], ['good', 'estado.mejor'], ['warn', 'estado.atencion'], ['bad', 'estado.critico'],
    ['warn', 'estado.limite.atencion'], ['bad', 'estado.limite.critico'], ['warn', 'estado.revisar'], ['neutral', 'estado.sinBanda'], ['neutral', 'estado.sin']];
  function cajonAyuda() {
    const vm = S.vm, p = { k: vm.semanas.K, kp: vm.semanas.KP, r: vm.semanas.R };
    const pag = S.view === 'equipos' && S.teamCompare && S.role !== 'equipo' ? 'comparar' : (S.view || 'resumen');
    const html = `<p><b>${esc(t('ayuda.pagina.' + pag, p))}</b></p>`
      + ['ayuda.p1', 'ayuda.p2', 'ayuda.p3', 'ayuda.p4', 'ayuda.p5'].map((k) => `<p>${esc(t(k, p))}</p>`).join('')
      + `<h4>${esc(t('ayuda.etiquetas'))}</h4><div class="leyenda">${LEYENDA.map(([tono, k]) => `<div class="small">${K.chip(tono, t(k))} ${esc(t('ayuda.e.' + k.replace(/^estado\./, '')))}</div>`).join('')}</div>`;
    return [t('ayuda.titulo'), html];
  }

  /**
   * Datos con los que no se puede medir (sin entregas): se dice arriba de cada página de análisis y no se enseñan cifras.
   * Devuelve '' si se puede medir.
   */
  function bloqueoDuro() {
    const dc = S.vm && S.vm.dataCheck, duros = dc ? dc.bloqueos.filter((b) => b.duro) : [];
    if (!duros.length) return '';
    const acciones = [...new Set(duros.map((b) => b.accion))].map((a) => a === 'estados'
      ? `<button class="btn primary" data-action="bloqueo-estados">${esc(t('dc.accion.estados'))}</button>`
      : `<button class="btn primary" data-action="import">${esc(t('dc.accion.datos'))}</button>`).join('');
    return K.statusBar('bad', esc(t('dc.bloqueo.titulo')), [])
      + `<div class="ficha" data-tipo="bloqueo"><div class="f-body"><ul class="small">${duros.map((b) => `<li>${esc(t(b.clave, b.p))}</li>`).join('')}</ul><div class="row" style="margin-top:10px">${acciones}</div></div></div>`;
  }
  EP.accion('bloqueo-estados', () => { if (!S.onboarded) { S.ob.step = 'revision'; S.ob.abierto = Object.assign({}, S.ob.abierto || {}, { estados: true }); EP.render(); window.scrollTo(0, 0); } else { S.fuentesTab = 'mapeo'; EP.go('fuentes'); } });

  Object.assign(EP.vistas, { cabecera, resumen, equipos, epicas, calidad, cajon, recsActivas, bloqueoDuro, pieFicha, textoSinCambios });
})();
