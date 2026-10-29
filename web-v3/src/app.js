/* easyperformance v3: estado, persistencia, carga de datos, recálculo, navegación y acciones.
   Las pantallas (kit.js, vistas-*.js, onboarding.js, cortes.js, asistente.js) leen S.vm y publican sus funciones en EP.vistas. */
(function () {
  const N = window.Nucleo, P = window.Puente, I = window.I18N;
  const t = I.t, tn = I.tn;

  const CLAVE_CFG = 'easyperformance.config.v2';          // la misma que la v2: un cliente montado en la v2 abre aquí
  const CLAVE_PREFS = 'easyperformance.v3.prefs';
  const CLAVE_IA = 'easyperformance.v3.ia';               // solo en sessionStorage

  const S = {
    lectura: null, det: null, ficheros: null, cfg: {}, r: null, vm: null, contextoDocs: null, extraIni: [],
    demo: false, real: null, onboarded: false, ob: { step: 'welcome' },
    role: 'direccion', team: null, teamCompare: false, view: 'resumen', drill: null,
    prefs: { byRole: {} }, dismissed: {}, recFilter: 'todos', recLevel: null, fuentesTab: 'ficheros', iniForm: null,
    ia: { modelo: N.IA.MODELO_POR_DEFECTO, clave: '' }, iaRecs: null, iaRecsDe: null, iaDescartadas: 0, iaImpacto: null, iaEstado: {}, iaError: {},
    narrativas: {}, presenting: false, slide: 0, error: null, carpeta: null, cargadoEn: null,
  };

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (id) => document.getElementById(id);
  const leerLocal = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
  const guardarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const lista = (ns) => (ns.length < 2 ? (ns[0] || '') : ns.slice(0, -1).join(', ') + t('lista.y') + ns[ns.length - 1]);
  const fmt = (v, formato) => N.formatear(v, formato);
  const fecha = (d) => (d ? N.fechaCorta(d instanceof Date ? d : new Date(d)) : '');
  const cat = () => window.CATALOGO;
  /** Formato de una medida del catálogo (coste va en euros). */
  const formatoDe = (id) => (id === 'coste' ? 'eur' : (cat().medidas[id] ? cat().medidas[id].formato : 'num'));
  const nombreMedida = (id) => (id === 'coste' ? t('medida.coste') : (cat().medidas[id] ? cat().medidas[id].nombre : id));
  const valor = (id, v) => (v == null || isNaN(v) ? t('comun.sinDatos') : fmt(v, formatoDe(id)));
  // Nombres fijos del núcleo que son datos (se guardan en inglés) y se traducen al pintarlos
  const nombreEquipo = (n) => (n === 'All work' ? t('equipo.todo') : n === 'No team' ? t('equipo.sin') : n === N.NOMBRE_AREA ? t('equipo.area') : n);

  let tAviso = null;
  function toast(msg, tono) {
    const el = document.querySelector('.toast'); if (!el) return;
    el.innerHTML = `<span>${esc(msg)}</span> <button type="button" data-action="toast-close" aria-label="${esc(t('comun.cerrar'))}">×</button>`;
    el.classList.toggle('bad', tono === 'bad'); el.classList.remove('hidden');
    clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.add('hidden'), 5000);
  }
  function ocupado(si, texto) { byId('busy').classList.toggle('hidden', !si); if (texto) byId('busy-text').textContent = texto; }
  function enSegundoPlano(fn, texto) { ocupado(true, texto || t('comun.calculando')); setTimeout(() => { try { fn(); } catch (e) { S.error = { message: e.message, stack: e.stack }; render(); } finally { ocupado(false); } }, 20); }

  // ---------- persistencia ----------
  function guardarCfg() {
    if (S.demo) return;
    S.cfg.actualizada = new Date().toISOString();
    guardarLocal(CLAVE_CFG, S.cfg);
    if (EP.carpeta) EP.carpeta.escribir('configuracion', 'cliente.json', JSON.stringify(S.cfg, null, 2));
  }
  function guardarPrefs() {
    if (S.demo && !S.onboarded) return;
    guardarLocal(CLAVE_PREFS, { lang: I.lang, role: S.role, team: S.team, onboarded: S.onboarded && !S.demo, prefs: S.prefs, dismissed: S.dismissed, modelo: S.ia.modelo });
  }
  function cargarPrefs() {
    const p = leerLocal(CLAVE_PREFS) || {};
    I.fijar(p.lang || I.navegador());
    S.role = p.role || 'direccion'; S.team = p.team || null; S.onboarded = !!p.onboarded;
    S.prefs = p.prefs && typeof p.prefs === 'object' ? Object.assign({ byRole: {} }, p.prefs) : { byRole: {} };
    S.dismissed = p.dismissed || {};
    S.ia.modelo = p.modelo || N.IA.MODELO_POR_DEFECTO;
    try { S.ia.clave = sessionStorage.getItem(CLAVE_IA) || ''; } catch (e) { S.ia.clave = ''; }
    S.cfg = leerLocal(CLAVE_CFG) || {};
  }
  function guardarClave(clave) { S.ia.clave = clave || ''; try { if (S.ia.clave) sessionStorage.setItem(CLAVE_IA, S.ia.clave); else sessionStorage.removeItem(CLAVE_IA); } catch (e) { } }
  // Los ficheros cargados se guardan en este navegador (IndexedDB) para no tener que volver a cargarlos. Nunca salen de él.
  function idb() { return new Promise((res, rej) => { try { const q = indexedDB.open('easyperformance-v3', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } }); }
  async function idbSet(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) { } }
  async function idbGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const tx = db.transaction('kv', 'readonly'); const q = tx.objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }

  // ---------- cálculo ----------
  function recalcular() {
    S.r = P.diagnosticar(S.lectura, S.det, S.cfg, S.extraIni, S.contextoDocs);
    S.vm = P.construirVM(S.r, { lectura: S.lectura, det: S.det, cfg: S.cfg });
    if (!S.team || !S.vm.equipos.some((e) => e.nombre === S.team)) S.team = S.vm.equipos[0] ? S.vm.equipos[0].nombre : null;
    if (S.iaRecsDe && S.iaRecsDe !== S.lectura) { S.iaRecs = null; S.iaImpacto = null; S.iaRecsDe = null; }
    S.narrativas = {};
  }
  function desdeBase64(b64) { const bin = atob(b64), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return descodificar(b); }
  function descodificar(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  /** Lee los ficheros, detecta y calcula. Devuelve false si no hay tareas. */
  function procesar(ficheros) {
    const lectura = N.leerJira(ficheros);
    if (!lectura.tareas.length) { toast(t('carga.sinTareas') + ' ' + ((lectura.informe.avisos[0] || {}).texto || ''), 'bad'); return false; }
    S.lectura = lectura; S.det = N.detectar(lectura); S.ficheros = ficheros; S.cargadoEn = new Date();
    S.iaRecs = null; S.iaImpacto = null; S.iaRecsDe = null;
    recalcular();
    return true;
  }
  function cargarFicheros(files) {
    const todos = [].slice.call(files);
    const csv = todos.filter((f) => /\.csv$/i.test(f.name) || /csv/.test(f.type));
    const excel = todos.filter((f) => /\.xlsx?$/i.test(f.name));
    if (!csv.length) { toast(excel.length ? t('carga.excel') : t('carga.eligeCsv'), 'bad'); if (excel.length) { S.view = S.onboarded ? 'fuentes' : S.view; S.fuentesTab = 'ficheros'; S.ob.step = S.onboarded ? S.ob.step : 'data'; S.ob.ayudaCsv = true; render(); } return; }
    salirDemo(false);
    ocupado(true, t('carga.leyendo'));
    Promise.all(csv.map((f) => f.arrayBuffer().then(descodificar).then((texto) => ({ nombre: f.name, texto }))))
      .then((fs) => setTimeout(() => {
        try {
          if (!procesar(fs)) return;
          idbSet('ficheros', fs);
          if (EP.cortes) EP.cortes.capturar();
          if (S.onboarded) { S.view = 'fuentes'; S.fuentesTab = 'ficheros'; toast(tn('carga.hecho', fs.length)); }
          else S.ob.step = 'revision';
          render(); window.scrollTo(0, 0);
        } catch (e) { S.error = { message: e.message, stack: e.stack }; render(); } finally { ocupado(false); }
      }, 20))
      .catch(() => { ocupado(false); toast(t('carga.error'), 'bad'); });
  }

  // ---------- datos de ejemplo ----------
  function verDemo() {
    const csv = (byId('demo-csv') || {}).textContent || '';
    if (!csv.trim()) { toast(t('demo.noHay'), 'bad'); return false; }
    let dc = {}; try { dc = JSON.parse(byId('demo-cliente').textContent || '{}'); } catch (e) { dc = {}; }
    if (!S.demo) S.real = { lectura: S.lectura, det: S.det, ficheros: S.ficheros, cfg: S.cfg, r: S.r, vm: S.vm, contextoDocs: S.contextoDocs, extraIni: S.extraIni, onboarded: S.onboarded, view: S.view };
    S.demo = true;
    S.cfg = { nombre: dc.nombre, sector: dc.sector, equiposInfo: dc.equiposInfo || {}, fte: dc.fte || {}, fteOrigen: dc.fteOrigen || {}, coste: dc.coste || {}, contexto: dc.preguntas };
    S.extraIni = dc.iniciativas || []; S.contextoDocs = dc.contexto || null;
    return procesar([{ nombre: 'sample-data.csv', texto: csv }]);
  }
  function salirDemo(pintar) {
    if (!S.demo) return;
    const r = S.real || {};
    S.demo = false;
    Object.assign(S, { lectura: r.lectura || null, det: r.det || null, ficheros: r.ficheros || null, cfg: r.cfg || leerLocal(CLAVE_CFG) || {}, r: r.r || null, vm: r.vm || null, contextoDocs: r.contextoDocs || null, extraIni: r.extraIni || [] });
    S.onboarded = !!(r.onboarded && S.vm); S.view = r.view || 'resumen'; S.real = null;
    if (!S.vm) S.ob.step = 'welcome';
    if (pintar !== false) render();
  }

  // ---------- navegación y render ----------
  const PAGINAS = ['resumen', 'equipos', 'referencias', 'calidad', 'recomendaciones', 'iniciativas', 'cortes', 'fuentes', 'ajustes'];
  const POR_ROL = {
    direccion: ['resumen', 'equipos', 'referencias', 'recomendaciones', 'iniciativas', 'cortes', 'ajustes'],
    pmo: PAGINAS,
    equipo: ['equipos', 'referencias', 'calidad', 'recomendaciones', 'iniciativas', 'cortes', 'ajustes'],
  };
  const INICIO_ROL = { direccion: 'resumen', pmo: 'calidad', equipo: 'equipos' };
  /** Equipos que ve el rol: el rol Equipo solo ve el suyo. */
  const visibles = () => (!S.vm ? [] : S.role === 'equipo' && S.team ? S.vm.equipos.filter((e) => e.nombre === S.team) : S.vm.equipos);
  function go(view) { S.view = view; if (view !== 'equipos') S.teamCompare = false; S.drill = null; render(); window.scrollTo(0, 0); }
  function openTeam(team) { S.team = team; S.teamCompare = false; S.view = 'equipos'; S.drill = null; guardarPrefs(); render(); window.scrollTo(0, 0); }
  function openDrill(spec) { S.drill = spec; render(); }

  function pintarTextosFijos() {
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.getAttribute('data-t')); });
    document.querySelectorAll('#nav button').forEach((b) => { b.dataset.label = t('nav.' + b.dataset.view); });
    document.querySelectorAll('#role-seg button').forEach((b) => { b.textContent = t('rol.' + b.dataset.role); b.classList.toggle('on', b.dataset.role === S.role); });
    document.querySelectorAll('#lang-seg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === I.lang));
    byId('assistant-fab').textContent = t('asistente.abrir');
  }
  function errorHtml(err) {
    return `<div class="notice bad"><b>${esc(t('error.titulo'))}</b><div class="small">${esc(err.message || '')}</div>
      <details><summary class="small">${esc(t('error.detalle'))}</summary><pre class="tiny" style="white-space:pre-wrap">${esc(err.stack || '')}</pre></details>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-action="retry">${esc(t('error.reintentar'))}</button><button class="btn" data-action="clear-all">${esc(t('ajustes.borrar'))}</button></div></div>`;
  }
  function render() {
    const V = EP.vistas;
    pintarTextosFijos();
    const ob = byId('onboarding'), app = byId('app'), pr = byId('present');
    try {
      if (S.error) {
        ob.classList.add('hidden'); app.classList.remove('hidden'); pr.classList.add('hidden');
        byId('page-title').textContent = t('error.titulo'); byId('page-sub').textContent = ''; byId('page-actions').innerHTML = '';
        byId('page').innerHTML = errorHtml(S.error); return;
      }
      const enApp = S.onboarded && S.vm;
      ob.classList.toggle('hidden', !!enApp); app.classList.toggle('hidden', !enApp); pr.classList.toggle('hidden', !S.presenting);
      if (!S.vm || S.presenting) S.drill = null;
      if (S.presenting) { pr.innerHTML = V.presentacion(); V.asistente(); return; }
      if (!enApp) { ob.innerHTML = V.onboarding(); V.trasOnboarding(); V.cajon(); V.asistente(); return; }
      const permitidas = POR_ROL[S.role] || PAGINAS;
      if (permitidas.indexOf(S.view) < 0) S.view = INICIO_ROL[S.role];
      const vt = visibles().map((e) => e.nombre);
      const cuentas = {
        recomendaciones: S.vm.recs.filter((r) => !S.dismissed[r.clave] && r.equipos.some((e) => vt.indexOf(e) >= 0)).length,
        iniciativas: S.vm.iniciativas.filter((x) => x.ini.equipos.some((e) => vt.indexOf(e) >= 0)).length,
        calidad: S.vm.fiabilidad.revisar,
        referencias: visibles().filter((e) => e.estado === 'provisional').length,
      };
      document.querySelectorAll('#nav button').forEach((b) => {
        const v = b.dataset.view, c = cuentas[v];
        b.classList.toggle('hidden', permitidas.indexOf(v) < 0); b.classList.toggle('active', v === S.view);
        const etiqueta = v === 'equipos' && S.role === 'equipo' ? t('nav.miEquipo') : t('nav.' + v);
        b.innerHTML = esc(etiqueta) + (c ? `<span class="count">${c}</span>` : '');
      });
      const banda = byId('demo-band');
      banda.classList.toggle('hidden', !S.demo);
      if (S.demo) banda.innerHTML = `<span>${esc(t('demo.banda'))}</span><button class="link" data-action="demo-exit">${esc(t('demo.salir'))}</button>`;
      const cab = V.cabecera(S.view);
      byId('page-title').textContent = cab.titulo; byId('page-sub').textContent = cab.sub; byId('page-actions').innerHTML = cab.acciones || '';
      byId('page').innerHTML = (V[S.view] || V.resumen)();
      V.cajon(); V.asistente();
    } catch (e) {
      console.error(e);
      S.error = { message: e.message, stack: e.stack };
      try { render(); } catch (e2) { }
    }
  }

  // ---------- acciones ----------
  const acciones = {};
  function accion(nombre, fn) { acciones[nombre] = fn; }
  accion('go', (el) => go(el.dataset.view));
  accion('open-team', (el) => openTeam(el.dataset.team));
  accion('team-tab', (el) => { if (el.dataset.team === '__comparar') { S.teamCompare = true; } else { S.team = el.dataset.team; S.teamCompare = false; } S.drill = null; render(); });
  accion('set-role', (el) => { S.role = el.dataset.role; if (S.vm) S.view = INICIO_ROL[S.role]; guardarPrefs(); render(); toast(t('rol.cambiado.' + S.role)); });
  accion('set-lang', (el) => { I.fijar(el.dataset.lang); guardarPrefs(); if (S.vm) enSegundoPlano(() => { recalcular(); render(); }); else render(); });
  accion('toast-close', () => document.querySelector('.toast').classList.add('hidden'));
  accion('retry', () => { S.error = null; try { if (S.lectura) recalcular(); } catch (e) { S.error = { message: e.message, stack: e.stack }; } render(); });
  accion('import', () => byId('file-input').click());
  accion('demo', () => { enSegundoPlano(() => { if (verDemo()) { S.onboarded = true; S.role = S.role || 'direccion'; S.view = INICIO_ROL[S.role]; if (EP.cortes) EP.cortes.capturar(true); } render(); window.scrollTo(0, 0); }, t('carga.leyendo')); });
  accion('demo-exit', () => salirDemo(true));
  accion('drill', (el) => openDrill({ kind: el.dataset.kind, team: el.dataset.team || null, medida: el.dataset.medida || null, id: el.dataset.id || null }));
  accion('drill-close', () => { S.drill = null; render(); });
  accion('present', () => { S.presenting = true; S.slide = 0; render(); });
  accion('present-close', () => { S.presenting = false; render(); });
  accion('slide', (el) => { S.slide = Math.max(0, S.slide + parseInt(el.dataset.dir, 10)); render(); });
  accion('print', () => window.print());
  accion('clear-all', () => {
    if (!window.confirm(t('ajustes.borrarConfirma'))) return;
    try { localStorage.removeItem(CLAVE_CFG); localStorage.removeItem(CLAVE_PREFS); sessionStorage.removeItem(CLAVE_IA); } catch (e) { }
    idbSet('ficheros', null); if (EP.cortes) EP.cortes.borrarTodo();
    Object.assign(S, { lectura: null, det: null, ficheros: null, cfg: {}, r: null, vm: null, demo: false, real: null, onboarded: false, ob: { step: 'welcome' }, error: null, dismissed: {}, iaRecs: null, narrativas: {} });
    guardarClave(''); render();
  });

  function manejar(e, el) {
    const a = el.dataset.action; const fn = acciones[a];
    if (fn) { e.preventDefault(); fn(el, e); }
  }
  document.addEventListener('click', (e) => { const el = e.target.closest('[data-action]'); if (el && !el.disabled) manejar(e, el); });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-action][tabindex]')) manejar(e, e.target);
    if (e.key === 'Escape' && S.drill) { S.drill = null; render(); }
    if (S.presenting) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { S.slide++; render(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { S.slide = Math.max(0, S.slide - 1); render(); }
      if (e.key === 'Escape') { S.presenting = false; render(); }
    }
  });
  const cambios = {};
  function cambio(nombre, fn) { cambios[nombre] = fn; }
  document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && cambios[el.dataset.change]) cambios[el.dataset.change](el, e); });
  byId('file-input').addEventListener('change', (e) => { cargarFicheros(e.target.files); e.target.value = ''; });
  document.addEventListener('dragover', (e) => { const z = e.target.closest && e.target.closest('.drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('.drop'); if (z) z.classList.remove('over'); });
  document.addEventListener('drop', (e) => { const z = e.target.closest && e.target.closest('.drop'); if (z) { e.preventDefault(); z.classList.remove('over'); cargarFicheros(e.dataTransfer.files); } });

  function descargar(nombre, datos, tipo) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([datos], { type: tipo || 'application/json' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvCelda = (v) => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function descargarCsv(nombre, cabecera, filas) { descargar(nombre, '﻿' + [cabecera, ...filas].map((f) => f.map(csvCelda).join(',')).join('\n'), 'text/csv'); }

  async function arrancar() {
    cargarPrefs();
    // Si hay exports de la carpeta (actualizar.ps1), se cargan primero; si no, los últimos ficheros guardados en el navegador
    // exports/datos.js (actualizar.ps1, el mismo de la v2): ficheros en base64, configuración, iniciativas y contexto
    const ex = window.EASY_PERFORMANCE_EXPORTS;
    const lista = Array.isArray(ex) ? ex : ex && Array.isArray(ex.ficheros) ? ex.ficheros : null;
    let fs = null, deCarpeta = false;
    if (lista && lista.length) {
      try { fs = lista.map((f) => ({ nombre: f.nombre, texto: f.b64 != null ? desdeBase64(f.b64) : f.texto })); deCarpeta = true; }
      catch (e) { toast(t('carga.datosJsMal'), 'bad'); fs = null; }
      if (window.EASY_PERFORMANCE_CONFIG && !leerLocal(CLAVE_CFG)) S.cfg = window.EASY_PERFORMANCE_CONFIG;
      if (window.EASY_PERFORMANCE_INICIATIVAS) S.extraIni = [].concat(window.EASY_PERFORMANCE_INICIATIVAS).filter(Boolean);
      if (window.EASY_PERFORMANCE_CONTEXTO && window.EASY_PERFORMANCE_CONTEXTO.documentos) S.contextoDocs = window.EASY_PERFORMANCE_CONTEXTO;
    }
    if (!fs) fs = await idbGet('ficheros');
    if (fs && fs.length) { try { if (procesar(fs) && EP.cortes) EP.cortes.capturar(false, !deCarpeta); } catch (e) { S.error = { message: e.message, stack: e.stack }; } }
    if (!S.vm) S.onboarded = false;
    if (S.onboarded && S.vm) S.view = INICIO_ROL[S.role];
    render();
  }

  window.EP = {
    S, N, P, t, tn, esc, lista, fmt, fecha, valor, formatoDe, nombreMedida, nombreEquipo, cat, toast, ocupado, enSegundoPlano,
    guardarCfg, guardarPrefs, guardarClave, recalcular, procesar, cargarFicheros, verDemo, salirDemo, go, openTeam, openDrill, render,
    visibles, POR_ROL, INICIO_ROL, accion, cambio, descargar, descargarCsv, idbGet, idbSet, arrancar, vistas: {},
  };
})();
