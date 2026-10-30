/* easyperformance v3: kit de fichas. Barra de estado, indicadores, fichas, chips y gráficos pequeños en SVG.
   Todas las páginas de análisis usan la misma plantilla: barra de estado, cuatro indicadores y una rejilla de fichas. */
(function () {
  const { S, t, tn, esc, valor, nombreMedida, nombreEquipo, fmt, cat } = window.EP;

  const TONO = { bien: 'good', atencion: 'warn', critico: 'bad', sin: 'neutral', neutro: 'neutral' };
  const tonoDe = (m) => (!m || !m.disponible ? 'neutral' : TONO[m.estado] || 'neutral');
  const chip = (tono, texto, title) => `<span class="chip ${tono}"${title ? ` title="${esc(title)}"` : ''}>${esc(texto)}</span>`;
  const estadoChip = (m) => (!m || !m.disponible ? chip('neutral', t('estado.sin')) : m.estado === 'bien' ? chip('good', t('estado.bien')) : m.estado === 'atencion' ? chip('warn', t('estado.atencion')) : m.estado === 'critico' ? chip('bad', t('estado.critico')) : chip('neutral', t('estado.sinBanda')));
  const ESTADO_EQUIPO = { poco_fiable: 'bad', alerta: 'bad', provisional: 'warn', estable: 'good' };
  const equipoChip = (e) => chip(ESTADO_EQUIPO[e.estado], t('equipo.estado.' + e.estado));
  const nivelChip = (nivel) => `<span class="chip level-${nivel}">${esc(t('nivel.' + nivel))}</span>`;

  /** Rango habitual en texto: "6 a 9 tareas por semana". */
  function rango(id, m) {
    if (!m || !m.ref) return t('medida.sinBanda');
    return t('medida.normal', { lo: valor(id, m.ref.lo), hi: valor(id, m.ref.hi) });
  }
  /** Por qué tiene ese estado: la banda del equipo o un límite fijo (lo dice la tarjeta para que no parezca una contradicción). */
  function porque(id, m) {
    if (!m || !m.disponible) return m && m.motivo ? m.motivo : t('medida.noDisponible');
    if (m.estadoPor === 'limite' && m.limite != null && m.estado !== 'bien') return t('medida.porLimite', { limite: valor(id, m.limite) });
    if (m.estadoPor === 'limite_equipo' && m.limite != null && m.estado !== 'bien') return t('medida.porLimiteEquipo', { limite: valor(id, m.limite) });
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
    return `<div class="bala" title="${esc(rango(id, m))}">${banda}<b class="b-now tone-${tonoDe(m)}" style="left:${pc(m.valor)}%"></b></div>`;
  }
  /** Fila de baseline de un indicador: nombre, ahora, la barra y lo normal. */
  function filaBaseline(eq, id) {
    const m = eq.medidas[id];
    const ahora = m && m.disponible && m.valor != null ? valor(id, m.valor) : t('comun.sinDatos');
    const normal = m && m.ref ? t('medida.rangoCorto', { lo: valor(id, m.ref.lo), hi: valor(id, m.ref.hi) }) : (m && m.disponible ? t('medida.sinBanda') : '');
    return `<div class="fb clickable" data-action="drill" data-kind="medida" data-team="${esc(eq.nombre)}" data-medida="${esc(id)}" role="button" tabindex="0">
      <span class="fb-n">${esc(nombreMedida(id))}</span><b class="fb-v t-${tonoDe(m)}">${esc(ahora)}</b>${bala(id, m)}<span class="fb-r">${esc(normal)}</span></div>`;
  }

  /** Indicadores destacados del rol: los elegidos en Personalizar o los cuatro primeros del Context. */
  function destacados() {
    const by = S.prefs && S.prefs.byRole; const p = by && Array.isArray(by[S.role]) ? by[S.role].filter((k) => cat().medidas[k] || k === 'coste') : null;
    if (p && p.length) return p.slice(0, 4);
    const base = S.vm.kpis.slice();
    // Si el Context da menos de cuatro, se completan con medidas que suelen estar
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

  /** Fila de recomendación: nivel, título, para quién y la primera evidencia. */
  function recFila(r) {
    const ev = r.evidencias[0] ? r.evidencias[0][1] : r.senal;
    return `<div class="rrow clickable" data-action="drill" data-kind="caso" data-id="${esc(r.clave)}" role="button" tabindex="0">${nivelChip(r.nivel)}<div class="rrow-t"><b>${esc(r.titulo)}</b><div class="small muted">${esc(paraQuien(r))} · ${esc(primeraFrase(ev))}</div></div><span class="go">›</span></div>`;
  }
  /** Equipos de una recomendación en texto; con más de cuatro, los tres primeros y cuántos más. */
  const equiposTexto = (eqs) => (eqs.length > 4 ? t('recs.yMas', { lista: eqs.slice(0, 3).map(nombreEquipo).join(', '), n: eqs.length - 3 }) : window.EP.lista(eqs.map(nombreEquipo)));
  const paraQuien = (r) => (r.grupo ? r.grupoNombre + ' (' + equiposTexto(r.equipos) + ')' : equiposTexto(r.equipos));
  const primeraFrase = (txt) => { const m = /^(.*?[.!?])(\s|$)/.exec(String(txt || '').trim()); return m ? m[1] : String(txt || ''); };
  /** Fila de un cambio: la medida fuera de lo normal, con su valor y su banda. */
  function cambioFila(eq, x) {
    return `<div class="rrow clickable" data-action="drill" data-kind="medida" data-team="${esc(eq.nombre)}" data-medida="${esc(x.id)}" role="button" tabindex="0">${estadoChip(x.m)}<div class="rrow-t"><b>${esc(nombreMedida(x.id))}: ${esc(valor(x.id, x.m.valor))}</b><div class="small muted">${esc(rango(x.id, x.m))} · ${esc(porque(x.id, x.m))}</div></div><span class="go">›</span></div>`;
  }
  const barra = (pct, tono) => `<div class="bar"><i class="tone-${tono}" style="width:${Math.max(2, Math.min(100, pct * 100)).toFixed(1)}%"></i></div>`;

  window.EP.kit = { TONO, tonoDe, grafico, bala, filaBaseline, techo, chip, estadoChip, equipoChip, nivelChip, rango, porque, spark, serie, destacados, tile, stat, puntos, cifra, statusBar, sec, ficha, tituloEquipo, recFila, paraQuien, primeraFrase, cambioFila, barra, fmt };
})();
