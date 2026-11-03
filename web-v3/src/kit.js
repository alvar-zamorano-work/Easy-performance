/* easyperformance v3: kit de fichas. Barra de estado, indicadores, fichas, chips y gráficos pequeños en SVG.
   Todas las páginas de análisis usan la misma plantilla: barra de estado, cuatro indicadores y una rejilla de fichas. */
(function () {
  const { S, t, tn, esc, valor, nombreMedida, nombreEquipo, fmt, cat } = window.EP;

  const TONO = { bien: 'good', atencion: 'warn', critico: 'bad', sin: 'neutral', neutro: 'neutral' };
  const tonoDe = (m) => (!m || !m.disponible ? 'neutral' : m.revisar && m.estado !== 'atencion' && m.estado !== 'critico' ? 'warn' : TONO[m.estado] || 'neutral');
  const chip = (tono, texto, title) => `<span class="chip ${tono}"${title ? ` title="${esc(title)}"` : ''}>${esc(texto)}</span>`;
  /** Etiqueta de una medida. Mejor de lo normal no es "normal", y un límite fijo superado no es "fuera de rango". */
  function estadoChip(m) {
    if (!m || !m.disponible) return chip('neutral', t('estado.sin'));
    // Una alerta manda sobre "revisar": no se esconde un "fuera de lo normal" detrás de un aviso de dato
    if (m.revisar && m.estado !== 'atencion' && m.estado !== 'critico') return chip('warn', t('estado.revisar'));
    const porLimite = m.estadoPor === 'limite' || m.estadoPor === 'limite_equipo';
    if (m.estado === 'bien') return chip('good', t(m.lado === 'mejor' ? 'estado.mejor' : m.lado === 'borde' ? 'estado.borde' : 'estado.bien'));
    if (m.estado === 'atencion') return chip('warn', t(porLimite ? 'estado.limite.atencion' : 'estado.atencion'));
    if (m.estado === 'critico') return chip('bad', t(porLimite ? 'estado.limite.critico' : 'estado.critico'));
    return chip('neutral', t('estado.sinBanda'));
  }
  const ESTADO_EQUIPO = { poco_fiable: 'bad', alerta: 'bad', revisar: 'warn', provisional: 'warn', atencion: 'warn', estable: 'good' };
  const equipoChip = (e) => chip(ESTADO_EQUIPO[e.estado], t('equipo.estado.' + e.estado));
  const nivelChip = (nivel) => `<span class="chip level-${nivel}">${esc(t('nivel.' + nivel))}</span>`;

  /** Rango habitual en texto: "6 a 9 tareas por semana". */
  function rango(id, m) {
    if (m && m.sinHistorico) return t('medida.sinHistorico');
    // Marcada por un límite fijo: se dice el límite (con el texto del núcleo, que sabe si es por arriba o por abajo), no "lo normal"
    if (m && m.limite != null && m.estado !== 'bien' && (m.estadoPor === 'limite' || m.estadoPor === 'limite_equipo') && m.estadoTexto)
      return String(m.estadoTexto).replace(/\.$/, '');
    if (!m || !m.ref) return t('medida.sinBanda');
    return t('medida.normal', { lo: valor(id, m.ref.lo), hi: valor(id, m.ref.hi) });
  }
  /** Lo normal del equipo (su franja), aunque mande un límite fijo: para el cajón y la barra, que enseñan la franja. */
  function rangoBanda(id, m) {
    if (m && m.sinHistorico) return t('medida.sinHistorico');
    if (!m || !m.ref) return t('medida.sinBanda');
    return t('medida.normal', { lo: valor(id, m.ref.lo), hi: valor(id, m.ref.hi) });
  }
  /** Por qué tiene ese estado: la banda del equipo o un límite fijo (lo dice la tarjeta para que no parezca una contradicción). */
  function porque(id, m) {
    if (!m || !m.disponible) return m && m.motivo ? m.motivo : t('medida.noDisponible');
    if ((m.estadoPor === 'limite' || m.estadoPor === 'limite_equipo') && m.limite != null && m.estado !== 'bien') {
      // Qué límite es y que no es un cambio frente a su rango habitual (que se enseña aparte para no confundirlo)
      const quien = t(m.estadoPor === 'limite' ? 'medida.limiteDeTodos' : 'medida.limiteDelEquipo');
      if (!m.ref) return quien;
      // Solo se dice que no es un cambio si su banda también dice que está bien; si no, se dice que además está fuera
      const p = { quien, lo: valor(id, m.ref.lo), hi: valor(id, m.ref.hi) };
      return t(m.estadoBanda === 'atencion' || m.estadoBanda === 'critico' ? 'medida.porLimiteFuera' : m.estadoBanda === 'bien' ? 'medida.porLimiteRango' : 'medida.porLimiteSolo', p);
    }
    if (m.revisar === 'masivo' && m.estado !== 'atencion' && m.estado !== 'critico') return t('medida.masivo', { dias: (m.diasMasivos || []).map((x) => t('medida.masivoDia', { n: x.n, f: window.Nucleo.fechaCorta(new Date(x.fecha)) })).join(', ') });
    return m.estadoTexto || '';
  }

  /** Línea de las últimas semanas con la banda de lo normal sombreada y el último punto del color del estado. */
  function spark(vals, ref, opts) {
    opts = opts || {};
    const W = 100, H = opts.h || 34;
    const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null && isFinite(p[1]));
    if (pts.length < 2) return `<div class="spark-empty">${esc(t('comun.sinSerie'))}</div>`;
    const ys = pts.map((p) => p[1]).concat(ref ? [ref.lo, ref.hi] : []);
    let lo = Math.min(...ys), hi = Math.max(...ys); if (hi === lo) { hi += 1; lo = Math.max(0, lo - 1); }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const n = vals.length;
    const x = (i) => (n === 1 ? 0 : (i / (n - 1)) * W);
    const y = (v) => H - ((v - lo) / (hi - lo)) * H;
    let d = '', pen = false;
    vals.forEach((v, i) => { if (v == null || !isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(2) + ' ' + y(v).toFixed(2) + ' '; pen = true; });
    const banda = ref ? `<rect class="sp-band" x="0" y="${y(ref.hi).toFixed(2)}" width="${W}" height="${Math.max(0.5, y(ref.lo) - y(ref.hi)).toFixed(2)}"/>` : '';
    const last = pts[pts.length - 1];
    return `<svg class="spark tone-${opts.tone || 'neutral'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px" role="img" aria-label="${esc(opts.label || '')}">${banda}<path d="${d}"/><circle cx="${x(last[0]).toFixed(2)}" cy="${y(last[1]).toFixed(2)}" r="1.8"/></svg>`;
  }
  const serie = (m, k) => (m && Array.isArray(m.serie) ? m.serie.slice(-(k || 16)) : null);

  /** Máximo redondo del eje: el eje empieza en cero, así el ruido de una semana a otra no parece un cambio. */
  function techo(vals) {
    const max = Math.max(0, ...vals.filter((v) => v != null && isFinite(v)));
    if (max <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(max)));
    for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * e >= max * 1.12) return k * e;
    return 10 * e;
  }
  /**
   * Gráfico de baseline: las semanas de baseline con su banda de lo normal y, a la derecha, las últimas semanas.
   * Eje desde cero y altura fija. El punto final es el valor de ahora, del color de su estado.
   */
  function grafico(id, m, opts) {
    opts = opts || {};
    if (!m || !Array.isArray(m.serie)) return '';
    const R = S.vm.semanas.R, win = m.ventana || S.vm.semanas.K, L = m.serie.length - 1;
    const desde = Math.max(0, L - win - R + 1), corte = L - win;
    const vals = m.serie.slice(desde);
    if (vals.filter((v) => v != null).length < 2) return `<div class="spark-empty">${esc(t('comun.sinSerie'))}</div>`;
    const W = 300, H = opts.h || 64, n = vals.length, tope = techo(vals.concat(m.ref ? [m.ref.hi] : []));
    const x = (i) => (n === 1 ? 0 : (i / (n - 1)) * W), y = (v) => H - (v / tope) * (H - 4) - 2;
    const xc = x(Math.max(0, corte - desde));
    const tramo = (a, b) => { let d = '', pen = false; for (let i = a; i <= b; i++) { const v = vals[i]; if (v == null || !isFinite(v)) { pen = false; continue; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; pen = true; } return d; };
    const ic = Math.max(0, corte - desde), tono = tonoDe(m);
    const banda = m.ref ? `<rect class="g-band" x="0" y="${y(m.ref.hi).toFixed(1)}" width="${xc.toFixed(1)}" height="${Math.max(1, y(m.ref.lo) - y(m.ref.hi)).toFixed(1)}"/><rect class="g-band-now" x="${xc.toFixed(1)}" y="${y(m.ref.hi).toFixed(1)}" width="${(W - xc).toFixed(1)}" height="${Math.max(1, y(m.ref.lo) - y(m.ref.hi)).toFixed(1)}"/>` : '';
    const ultimo = vals[n - 1];
    const punto = ultimo != null ? `<line class="g-dot tone-${tono}" x1="${x(n - 1).toFixed(1)}" x2="${x(n - 1).toFixed(1)}" y1="${y(ultimo).toFixed(1)}" y2="${y(ultimo).toFixed(1)}"/>` : '';
    const svg = `<svg class="grafico" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px" role="img" aria-label="${esc(nombreMedida(id))}">
      <line class="g-base" x1="0" x2="${W}" y1="${H - 2}" y2="${H - 2}"/>${banda}<line class="g-corte" x1="${xc.toFixed(1)}" x2="${xc.toFixed(1)}" y1="0" y2="${H}"/>
      <path class="g-linea-base" d="${tramo(0, ic)}"/><path class="g-linea-ahora tone-${tono}" d="${tramo(ic, n - 1)}"/>${punto}</svg>`;
    const eje = `<div class="g-eje"><span>${esc(t('grafico.baseline', { r: R }))}</span><span>${esc(t('grafico.ahora', { k: win }))}</span></div>`;
    return svg + (opts.sinEje ? '' : eje);
  }
  /** Barra de baseline: la banda de lo normal y una marca donde está ahora. Escala desde cero. */
  function bala(id, m) {
    if (!m || !m.disponible || m.valor == null) return `<div class="bala vacia"></div>`;
    const tope = techo([m.valor].concat(m.ref ? [m.ref.hi, m.ref.lo] : []));
    const pc = (v) => Math.max(0, Math.min(100, (v / tope) * 100)).toFixed(1);
    const banda = m.ref ? `<i class="b-band" style="left:${pc(m.ref.lo)}%;width:${Math.max(1.5, pc(m.ref.hi) - pc(m.ref.lo))}%"></i>` : '';
    return `<div class="bala" title="${esc(rangoBanda(id, m))}">${banda}<b class="b-now tone-${tonoDe(m)}" style="left:${pc(m.valor)}%"></b></div>`;
  }
  /** Fila de baseline de un indicador: nombre, ahora, la barra y lo normal. */
  function filaBaseline(eq, id) {
    const m = eq.medidas[id];
    const ahora = m && m.disponible && m.valor != null ? valor(id, m.valor) : t('comun.sinDatos');
    // Lo que no se puede medir lo dice en la fila (con el motivo completo al pasar por encima), no se queda en blanco
    const normal = m && m.ref ? t('medida.rangoCorto', { lo: valor(id, m.ref.lo), hi: valor(id, m.ref.hi) })
      : m && m.disponible ? (m.sinHistorico ? t('medida.sinHistoricoCorto') : t('medida.sinBanda')) : m ? t('medida.noSeMide') : '';
    const motivo = m && !m.disponible ? porque(id, m) : m && m.sinHistorico ? t('medida.sinHistorico') : '';
    return `<div class="fb clickable" data-action="drill" data-kind="medida" data-team="${esc(eq.nombre)}" data-medida="${esc(id)}" role="button" tabindex="0"${motivo ? ` title="${esc(motivo)}"` : ''}>
      <span class="fb-n">${esc(nombreMedida(id))}</span><b class="fb-v t-${tonoDe(m)}">${esc(ahora)}</b>${bala(id, m)}<span class="fb-r">${esc(normal)}</span></div>`;
  }

  /** Indicadores destacados del rol: los elegidos en Personalizar o los cuatro primeros del Context. */
  /** Una medida se puede destacar si algún equipo (o el área) la puede medir con estos datos. */
  function medible(id) {
    const vm = S.vm; if (!vm) return false;
    if (id === 'coste' && !vm.hayCoste) return false;
    const ok = (e) => { const m = e && (e.medidas[id] || (id === 'coste' && e.kpis && e.kpis.coste)); return !!(m && m.disponible); };
    // Con lo que ve el rol: para el rol Equipo, solo su equipo
    return (S.role !== 'equipo' && ok(vm.area)) || window.EP.visibles().some(ok);
  }
  /**
   * Los cuatro indicadores destacados del rol. Uno elegido que no se puede medir con este export se queda (dice por qué
   * no se puede y qué falta); en Personalizar sale marcado y se puede cambiar por otro.
   */
  function destacados() {
    const by = S.prefs && S.prefs.byRole; const p = by && Array.isArray(by[S.role]) ? by[S.role].filter((k) => cat().medidas[k] || (k === 'coste' && S.vm.hayCoste)) : null;
    if (p && p.length) return p.slice(0, 4);
    const base = S.vm.kpis.slice();
    // Si el enfoque da menos de cuatro, se completan con medidas que suelen estar
    ['entregas', 'bugs', 'wip', 'edad', 'pendiente', 'errores'].forEach((k) => { if (base.length < 4 && base.indexOf(k) < 0) base.push(k); });
    return base.slice(0, 4);
  }

  /** Indicador de un equipo: etiqueta, cifra, banda, estado y línea de 16 semanas. */
  function tile(eq, id) {
    const m = eq.medidas[id], tono = tonoDe(m);
    const viz = m && m.serie ? grafico(id, m) : `<div class="spark-empty">${esc(m && m.disponible ? rango(id, m) : '')}</div>`;
    const def = cat().medidas[id];
    const ayuda = def ? def.como : t('medida.costeComo');
    return `<div class="tile clickable" data-action="drill" data-kind="medida" data-team="${esc(eq.nombre)}" data-medida="${esc(id)}" role="button" tabindex="0">
      <div class="t-label"><span>${esc(nombreMedida(id))}<span class="hint" title="${esc(ayuda)}">?</span></span>${m && m.disponible ? estadoChip(m) : ''}</div>
      <div class="t-value">${m && m.disponible && m.valor != null ? esc(valor(id, m.valor)) : `<span class="muted">${esc(t('comun.sinDatos'))}</span>`}</div>
      <div class="t-foot"><span>${esc(m && m.disponible ? rango(id, m) : porque(id, m))}</span></div>
      ${m && m.disponible && m.estadoPor && m.estadoPor !== 'banda' && m.estado !== 'bien' ? `<div class="t-why">${esc(porque(id, m))}</div>` : ''}
      <div class="t-viz">${viz}</div></div>`;
  }
  /** Indicador de cartera: etiqueta, cifra, una línea y un visual opcional. */
  function stat(label, value, foot, viz, opts) {
    opts = opts || {};
    const act = opts.action ? ` data-action="${opts.action}"${opts.view ? ` data-view="${opts.view}"` : ''}${opts.kind ? ` data-kind="${opts.kind}"` : ''} role="button" tabindex="0"` : '';
    return `<div class="tile${opts.action ? ' clickable' : ''}${opts.on ? ' on' : ''}"${act}><div class="t-label"><span>${esc(label)}</span></div><div class="t-value${opts.tone ? ' tone-' + opts.tone : ''}">${value}</div><div class="t-foot">${foot || ''}</div><div class="t-viz">${viz || ''}</div></div>`;
  }
  /** Un punto por equipo con su estado. */
  function puntos(fn) { return `<div class="dots">${window.EP.visibles().map((e) => { const r = fn(e); return `<span class="tdot tone-${r.tone}" title="${esc(e.nombre + ': ' + r.label)}"><i></i>${esc(e.nombre)}</span>`; }).join('')}</div>`; }
  /** Cifra pequeña dentro de una ficha. opts.base enseña la referencia en grande y el valor actual debajo. */
  function cifra(eq, id, opts) {
    opts = opts || {};
    const m = eq.medidas[id];
    const grande = opts.base ? (m && m.ref ? t('medida.rangoCorto', { lo: valor(id, m.ref.lo), hi: valor(id, m.ref.hi) }) : t('medida.sinBanda')) : (m && m.disponible ? valor(id, m.valor) : t('comun.sinDatos'));
    return `<div class="m clickable" data-action="drill" data-kind="medida" data-team="${esc(eq.nombre)}" data-medida="${esc(id)}" role="button" tabindex="0"><div class="m-l">${esc(nombreMedida(id))}</div><div class="m-v">${esc(grande)}</div>${opts.base ? `<div class="m-now">${esc(t('medida.ahora', { v: m && m.disponible ? valor(id, m.valor) : t('comun.sinDatos') }))}</div>` : ''}<div class="m-d">${m && m.disponible ? estadoChip(m) : ''}</div></div>`;
  }
  function statusBar(tono, titular, items) {
    return `<div class="status tone-${tono}"><span class="s-dot"></span><b>${titular}</b>${items && items.length ? `<span class="s-items">${items.join('<span class="sep">·</span>')}</span>` : ''}<button class="link s-help" data-action="drill" data-kind="ayuda">${esc(t('comun.comoLeer'))}</button></div>`;
  }
  const sec = (titulo, derecha) => `<div class="sec"><h2>${esc(titulo)}</h2>${derecha ? `<div class="sec-r">${derecha}</div>` : ''}</div>`;
  const ficha = (cab, cuerpo, pie, attrs) => `<div class="ficha"${attrs || ''}><div class="f-head">${cab}</div><div class="f-body">${cuerpo}</div>${pie ? `<div class="f-foot">${pie}</div>` : ''}</div>`;
  const tituloEquipo = (e) => `<button class="f-title link-plain" data-action="open-team" data-team="${esc(e.nombre)}">${esc(nombreEquipo(e.nombre))}</button>`;

  /**
   * Una recomendación vista desde unos equipos: el nivel y la evidencia son los de esos equipos, no los del peor
   * ni los de otro. Las de grupo (sin detalle por equipo) se quedan como están.
   */
  const RANGO_NIVEL = { alto: 0, medio: 1, bajo: 2 };
  function recPara(r, nombres) {
    if (!r.porEquipo || !nombres) return r;
    const mios = r.equipos.filter((e) => nombres.indexOf(e) >= 0 && r.porEquipo[e]);
    if (!mios.length || mios.length === r.equipos.length) return r;
    const nivel = mios.map((e) => r.porEquipo[e].nivel).sort((a, b) => RANGO_NIVEL[a] - RANGO_NIVEL[b])[0];
    return Object.assign({}, r, { nivel, equipos: mios, evidencias: mios.map((e) => [e, r.porEquipo[e].evidencia]), otros: r.equipos.length - mios.length, todos: r.equipos });
  }
  const ordenRecs = (a, b) => RANGO_NIVEL[a.nivel] - RANGO_NIVEL[b.nivel];
  /** Fila de recomendación: nivel, título, para quién y la primera evidencia. */
  function recFila(r) {
    const ev = r.evidencias[0] ? r.evidencias[0][1] : r.senal;
    const equipo = r.todos && r.equipos.length === 1 ? ` data-team="${esc(r.equipos[0])}"` : '';
    return `<div class="rrow clickable" data-action="drill" data-kind="caso" data-id="${esc(r.clave)}"${equipo} role="button" tabindex="0">${nivelChip(r.nivel)}<div class="rrow-t"><b>${esc(r.titulo)}</b><div class="small muted">${esc(paraQuien(r))} · ${esc(primeraFrase(ev))}</div></div><span class="go">›</span></div>`;
  }
  /** Equipos de una recomendación en texto; con más de cuatro, los tres primeros y cuántos más. */
  const equiposTexto = (eqs) => (eqs.length > 4 ? t('recs.yMas', { lista: eqs.slice(0, 3).map(nombreEquipo).join(', '), n: eqs.length - 3 }) : window.EP.lista(eqs.map(nombreEquipo)));
  const paraQuien = (r) => (r.grupo ? r.grupoNombre + ' (' + equiposTexto(r.equipos) + ')' : equiposTexto(r.equipos) + (r.otros ? ' ' + window.EP.tn('recs.yOtros', r.otros) : ''));
  const primeraFrase = (txt) => { const m = /^(.*?[.!?])(\s|$)/.exec(String(txt || '').trim()); return m ? m[1] : String(txt || ''); };
  /** Fila de un cambio: la medida fuera de lo normal, con su valor y su banda. */
  function cambioFila(eq, x) {
    return `<div class="rrow clickable" data-action="drill" data-kind="medida" data-team="${esc(eq.nombre)}" data-medida="${esc(x.id)}" role="button" tabindex="0">${estadoChip(x.m)}<div class="rrow-t"><b>${esc(nombreMedida(x.id))}: ${esc(valor(x.id, x.m.valor))}</b><div class="small muted">${esc(rango(x.id, x.m))} · ${esc(porque(x.id, x.m))}</div></div><span class="go">›</span></div>`;
  }
  const barra = (pct, tono) => `<div class="bar"><i class="tone-${tono}" style="width:${Math.max(2, Math.min(100, pct * 100)).toFixed(1)}%"></i></div>`;

  /** Baseline provisional: entregas o errores sin sus semanas completas de referencia (lo mismo en el menú y en la página). */
  const baselineProvisional = (e) => ['entregas', 'bugs'].some((id) => e.medidas[id] && e.medidas[id].disponible && e.medidas[id].referencia !== 'establecida');
  window.EP.kit = { TONO, tonoDe, grafico, bala, filaBaseline, techo, chip, estadoChip, equipoChip, nivelChip, rango, porque, spark, serie, destacados, tile, stat, puntos, cifra, statusBar, sec, ficha, tituloEquipo, baselineProvisional, rangoBanda, medible, recFila, recPara, ordenRecs, paraQuien, primeraFrase, cambioFila, barra, fmt };
})();
