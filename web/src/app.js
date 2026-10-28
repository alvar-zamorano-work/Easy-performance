// Easy Performance: the four steps as navigation (Measure, Analyze, Improve, Learn), plus Settings.
// Loading the export detects everything (team field, states) and shows the baseline. What cannot be detected
// (vendors, areas, FTE, cost) and anything to correct lives in Measure > Context.
// Connectors other than Jira are demo connectors: they load the sample data and are labelled as such.
// The AI assistant (Settings) only ever receives the diagnostic package: aggregated figures, no tickets, no people.
// Uses the core bundled in the page: window.Motor, window.Nucleo and window.CATALOGO.
(function () {
  'use strict';
  var C = window.CATALOGO, N = window.Nucleo, M = window.Motor;
  var CLAVE = 'easyperformance.config.v2', CLAVE_V1 = 'easyperformance.configuracion.v1', CLAVE_TUT = 'easyperformance.tutorial', CLAVE_IA = 'easyperformance.ai';
  var App = {
    vista: 'inicio', medir: 'baseline', ver: 'area', editar: null, demo: false, carpeta: null, origen: null, fuente: null, simulada: null,
    lectura: null, det: null, cfg: {}, iniciativas: [], contexto: null, r: null, real: null, abiertas: {},
    recSel: null, recEquipo: 'todos', tiempoMs: 0, datos: 'fiabilidad', nuevaIni: false,
    ia: { modelo: '', clave: '', recordar: false }, iaRecs: null, iaRecsDe: null, iaImpacto: null, iaMapeo: null, iaEstado: 'idle', iaError: null
  };
  window.EasyPerformance = App;
  // ---------- utilities ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n1(v) { return (Math.round(v * 10) / 10).toLocaleString('en-GB'); }
  function lista(ns) { return ns.length < 2 ? (ns[0] || '') : ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1]; }
  function mayus(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function plural(n, uno, varios) { return n === 1 ? uno : varios; }
  function miles(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function euros(v) { return '€' + miles(v); }
  var NUMEROS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

  // The five measures of the baseline: the same for every client
  var MED = {
    ciclo: { nombre: 'Lead time', formato: 'dias', unidad: 'days', que: 'What starts today will almost surely be done within this many days. If it rises, the team takes longer to finish what it starts.' },
    entregas: { nombre: 'Deliveries', formato: 'num', unidad: 'per week', que: 'Tasks finished each week. Discarded tasks do not count.' },
    retrabajo: { nombre: 'Rework', formato: 'pct', unidad: 'of what is done', que: 'Share of finished tasks that went back to a state they had already passed.' },
    arrastradas: { nombre: 'Carried over', formato: 'pct', unidad: 'of what is done', que: 'Share of finished tasks that went through more than one sprint.' },
    agent_readiness: { nombre: 'Agent-ready', formato: 'pct', unidad: 'of tickets', que: 'Tickets an AI agent could complete without asking: description, acceptance criteria, bounded scope, references and no open dependencies.' },
    coste: { nombre: 'Cost per delivery', formato: 'eur', unidad: 'per task', que: 'Monthly team cost (FTE times the cost of one FTE) divided by the tasks finished per month. Lower is better. Only when FTE and cost are set.' }
  };
  var COLUMNAS = ['ciclo', 'entregas', 'retrabajo', 'arrastradas', 'agent_readiness'];
  function hayCoste() { var c = App.cfg.coste; return !!(c && Object.keys(c).some(function (k) { return c[k] > 0; })); }
  function columnas() { return hayCoste() ? COLUMNAS.concat(['coste']) : COLUMNAS; }
  function med(eq, id) { return id === 'coste' ? (eq.kpis && eq.kpis.coste) || { id: 'coste', disponible: false, motivo: 'Set the FTE and cost of each team in Measure > Context.' } : eq.medidas[id]; }
  var KPI_AREA = ['ciclo', 'entregas', 'retrabajo', 'agent_readiness'];
  var KPI_EQUIPO = ['ciclo', 'entregas', 'retrabajo', 'arrastradas'];
  var ESTADO = { bien: 'Good', atencion: 'Attention', critico: 'Critical', sin: 'No data' };
  var NOMBRE_INI = { ciclo: 'lead time', total: 'total time', entregas: 'deliveries per week', espera: 'waiting time', retrabajo: 'rework', errores: 'bugs', reabiertas: 'reopened', bloqueo: 'blocked time', agent_readiness: 'agent-ready tickets' };
  var PASOS = [
    ['measure', '1', 'Measure', 'Baseline per team'],
    ['analyze', '2', 'Analyze', 'Signals and drivers'],
    ['improve', '3', 'Improve', 'Initiatives and standards'],
    ['learn', '4', 'Learn', 'Did it work?']
  ];

  function valor(id, v) {
    if (v == null || isNaN(v)) return null;
    var f = MED[id] ? MED[id].formato : 'num';
    if (f === 'pct') return Math.round(v * 100) + '%';
    if (f === 'dias') return n1(v) + (Math.abs(v - 1) < 0.05 ? ' day' : ' days');
    if (f === 'eur') return euros(v);
    return n1(v);
  }
  function rango(id, lo, hi) { return MED[id] && MED[id].formato === 'dias' ? n1(lo) + ' to ' + valor(id, hi) : valor(id, lo) + ' to ' + valor(id, hi); }
  function cifra(id, v) {
    if (v == null || isNaN(v)) return { g: 'n/a', u: '' };
    var f = MED[id].formato;
    if (f === 'pct') return { g: Math.round(v * 100) + '%', u: MED[id].unidad };
    if (f === 'eur') return { g: euros(v), u: MED[id].unidad };
    return { g: n1(v), u: f === 'dias' && Math.abs(v - 1) < 0.05 ? 'day' : MED[id].unidad };
  }
  function estadoDe(m) { return !m || !m.disponible ? 'sin' : (m.estado === 'atencion' || m.estado === 'critico' ? m.estado : (m.estado === 'bien' ? 'bien' : 'neutro')); }
  function chip(e, siempre) {
    if (e === 'atencion' || e === 'critico' || (siempre && (e === 'bien' || e === 'sin'))) return '<span class="chip chip-' + e + '">' + ESTADO[e] + '</span>';
    return '';
  }
  function fechaCorta(d) { return M.fechaCorta(d); }

  // ---------- notices and busy state ----------
  var tAviso = null;
  function aviso(t) { var el = document.getElementById('aviso'); el.textContent = t; el.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(function () { el.hidden = true; }, 5000); }
  function ocupado(si, texto) { var el = document.getElementById('ocupado'); el.hidden = !si; if (texto) el.firstChild.textContent = texto; }
  function enSegundoPlano(fn, texto) { ocupado(true, texto || 'Calculating…'); setTimeout(function () { try { fn(); } finally { ocupado(false); } }, 20); }

  // ---------- configuration ----------
  function leerLocal(k) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function cfgInicial() {
    var c = leerLocal(CLAVE);
    if (c) return c;
    var v1 = leerLocal(CLAVE_V1) || window.EASY_PERFORMANCE_CONFIG;
    if (!v1) return {};
    var out = {};
    ['nombre', 'campoEquipo', 'equipos', 'equiposInfo', 'fte', 'fteOrigen', 'coste', 'mapeoEstados', 'etapas', 'iniciativas'].forEach(function (k) { if (v1[k] != null) out[k] = v1[k]; });
    return out;
  }
  function guardarCfg() {
    if (App.demo) return;
    App.cfg.actualizada = new Date().toISOString();
    guardarLocal(CLAVE, App.cfg);
    escribirEnCarpeta('configuracion', 'cliente.json', JSON.stringify(App.cfg, null, 2));
  }
  // The AI key lives only in this browser (session by default, device if asked). Never in cliente.json, never in files.
  function cargarIa() {
    var s = null;
    try { s = sessionStorage.getItem(CLAVE_IA); } catch (e) { }
    var l = leerLocal(CLAVE_IA);
    var ia = s ? JSON.parse(s) : (l || {});
    App.ia = { modelo: ia.modelo || N.IA.MODELO_POR_DEFECTO, clave: ia.clave || '', recordar: !!l };
  }
  function guardarIa() {
    var v = JSON.stringify({ modelo: App.ia.modelo, clave: App.ia.clave });
    try { sessionStorage.setItem(CLAVE_IA, v); } catch (e) { }
    try { if (App.ia.recordar) localStorage.setItem(CLAVE_IA, v); else localStorage.removeItem(CLAVE_IA); } catch (e) { }
  }
  function hayIa() { return !!(App.ia && App.ia.clave); }
  function opcion(id) { return App.det ? App.det.opcionesEquipo.filter(function (o) { return o.id === id; })[0] : null; }
  function campo() {
    var c = App.cfg.campoEquipo, o = c && opcion(c);
    return o && o.valida ? c : App.det.equipoRecomendado;
  }
  function equipos() {
    var cp = campo(), o = opcion(cp);
    if (!o || o.id === 'todos') return [];
    if (App.cfg.equipos && App.cfg.equipos.length && App.cfg.campoEquipo === cp) {
      var hay = App.cfg.equipos.filter(function (e) { return o.valores.some(function (v) { return v.valor === e; }); });
      if (hay.length) return hay;
    }
    var total = o.valores.reduce(function (s, v) { return s + v.n; }, 0);
    return o.valores.filter(function (v) { return v.n / total >= 0.02; }).map(function (v) { return v.valor; });
  }
  function mapeo() {
    var m = Object.assign({}, App.det.mapeoEstados);
    if (!App.cfg.mapeoEstados && App.cfg.etapas) Object.assign(m, N.etapasV0AMapeo(App.cfg.etapas, App.det.mapeoEstados));
    return Object.assign(m, App.cfg.mapeoEstados || {});
  }
  function cfgCalculo() {
    var c = { campoEquipo: campo(), equipos: equipos(), mapeoEstados: mapeo(), fte: App.cfg.fte || {}, limites: {} };
    if (hayCoste()) c.coste = App.cfg.coste;
    return c;
  }
  function mesTexto(d) { return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1); }
  function clienteDe(modelo) {
    var c = App.cfg, info = c.equiposInfo || {}, fte = c.fte || {}, orig = c.fteOrigen || {}, periodo = mesTexto(modelo ? modelo.semanaFin : new Date());
    var nombres = modelo ? modelo.equipos.map(function (e) { return e.nombre; }) : equipos();
    if (!nombres.length) nombres = ['All work'];
    var l = nombres.map(function (n) {
      var i = info[n] || {}, prov = i.tipo === 'proveedor';
      return { id: n, nombre: n, tipo: prov ? 'proveedor' : 'interno', proveedor: prov ? (i.proveedor || 'Unnamed vendor') : null, area: i.area || null,
        usa_sprints: true, fte: fte[n] ? [{ periodo: periodo, valor: fte[n], origen: orig[n] || 'declarado' }] : [], limites: {} };
    });
    return { version: 2, nombre: c.nombre || '', sector: c.sector || '', plataforma: 'jira', mapeoEstados: mapeo(), equipos: { campo: campo(), lista: l },
      objetivos: [], medidas: COLUMNAS.slice() };
  }
  function iniciativaValida(i) { return !!(i && i.id && i.nombre && i.fecha_inicio && i.equipos && i.equipos.length && i.medidas_objetivo && i.medidas_objetivo.length); }
  function iniciativas() {
    var porId = {};
    (App.iniciativas || []).concat(App.cfg.iniciativas || []).forEach(function (i) { if (iniciativaValida(i)) porId[i.id] = i; });
    return Object.keys(porId).map(function (k) { return porId[k]; });
  }
  function recalcular() {
    App.r = N.diagnosticar(App.lectura, clienteDe(null), iniciativas(), App.contexto, { config: cfgCalculo(), generado: new Date() });
    if (App.ver !== 'area' && !App.r.modelo.equipos.some(function (e) { return e.nombre === App.ver; })) App.ver = 'area';
    if (App.iaRecsDe && App.iaRecsDe !== App.lectura) { App.iaRecs = null; App.iaImpacto = null; App.iaRecsDe = null; }
  }

  // ---------- loading data ----------
  function descodificar(buf) {
    var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  function desdeBase64(b64) { var bin = atob(b64), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return descodificar(b); }
  function procesar(ficheros, origen) {
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var r = M.ingerir(ficheros);
    if (!r.tareas.length) { aviso('No tasks found in the files. ' + ((r.informe.avisos[0] || {}).texto || '')); return false; }
    App.lectura = r.lectura; App.det = M.detectar(r.tareas); App.origen = origen; App.ficheros = ficheros;
    App.iaRecs = null; App.iaImpacto = null; App.iaRecsDe = null; App.iaMapeo = null;
    recalcular();
    App.tiempoMs = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
    App.recSel = null; App.recEquipo = 'todos'; App.nuevaIni = false;
    App.vista = 'measure'; App.medir = 'baseline'; App.ver = 'area';
    return true;
  }
  function cargarFicheros(files) {
    var csv = [].filter.call(files, function (f) { return /\.csv$/i.test(f.name) || /csv/.test(f.type); });
    if (!csv.length) { aviso('Choose one or more CSV files exported from Jira.'); return; }
    salirDemo(false);
    ocupado(true, 'Reading data…');
    Promise.all(csv.map(function (f) { return f.arrayBuffer().then(descodificar).then(function (t) { return { nombre: f.name, texto: t }; }); }))
      .then(function (fs) { setTimeout(function () { try { if (procesar(fs, 'ficheros')) { render(); window.scrollTo(0, 0); animarCarga(null); } } finally { ocupado(false); } }, 20); })
      .catch(function () { ocupado(false); aviso('The files could not be read.'); });
  }

  // Shared folder (Chrome and Edge): exports/, configuracion/, iniciativas/, contexto/, historico/, diagnostico/
  function idb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open('easyperformance', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet(k) { return idb().then(function (db) { return new Promise(function (res) { var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function idbSet(k, v) { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); }; }); }).catch(function () { return false; }); }
  function permiso(h, modo) {
    if (!h.queryPermission) return Promise.resolve(true);
    return h.queryPermission({ mode: modo }).then(function (p) { return p === 'granted' ? true : h.requestPermission({ mode: modo }).then(function (p2) { return p2 === 'granted'; }); });
  }
  function elegirCarpeta() {
    if (!window.showDirectoryPicker) { aviso('This browser cannot open folders. Use Chrome or Edge, or choose the files.'); return; }
    window.showDirectoryPicker({ id: 'easyperformance', mode: 'readwrite' }).then(function (h) { App.carpeta = h; idbSet('carpeta', h); return leerCarpeta(h); })
      .catch(function (e) { if (e && e.name !== 'AbortError') aviso('The folder could not be opened.'); });
  }
  function ficherosDe(dir, patron, lector) {
    var out = [], it = dir.values();
    function sig() {
      return it.next().then(function (r) {
        if (r.done) return out;
        var e = r.value;
        if (e.kind === 'file' && patron.test(e.name)) return e.getFile().then(lector).then(function (x) { out.push({ nombre: e.name, texto: x }); }).then(sig);
        return sig();
      });
    }
    return sig();
  }
  function sub(h, nombre) { return h.getDirectoryHandle(nombre).catch(function () { return null; }); }
  function leerCarpeta(h) {
    salirDemo(false);
    ocupado(true, 'Reading the folder…');
    return permiso(h, 'readwrite').catch(function () { return permiso(h, 'read'); }).then(function (ok) {
      if (!ok) throw new Error('permission');
      return sub(h, 'exports').then(function (d) { return ficherosDe(d || h, /\.csv$/i, function (f) { return f.arrayBuffer().then(descodificar); }); });
    }).then(function (fs) {
      if (!fs.length) { ocupado(false); aviso('There are no CSV files in the exports folder.'); return; }
      var json = function (nombre) { return sub(h, nombre).then(function (d) { return d ? ficherosDe(d, /\.json$/i, function (f) { return f.text(); }) : []; }); };
      return Promise.all([json('configuracion'), json('iniciativas'), json('contexto')]).then(function (x) {
        var leer = function (t, donde) { try { return JSON.parse(t); } catch (e) { aviso('Could not read ' + donde + ': not valid JSON.'); return null; } };
        var cli = x[0].filter(function (f) { return f.nombre === 'cliente.json'; })[0];
        if (cli && !leerLocal(CLAVE)) { var c = leer(cli.texto, 'configuracion/cliente.json'); if (c) App.cfg = c; }
        App.iniciativas = x[1].map(function (f) { return leer(f.texto, 'iniciativas/' + f.nombre); }).filter(iniciativaValida);
        var docs = [];
        x[2].forEach(function (f) { var d = leer(f.texto, 'contexto/' + f.nombre); if (d && d.documentos) docs = docs.concat(d.documentos); });
        App.contexto = docs.length ? { documentos: docs } : null;
        setTimeout(function () {
          try { if (procesar(fs, 'carpeta')) { guardarFoto(); guardarSeguimiento(); render(); aviso('Read ' + fs.length + ' file(s) from the folder.'); animarCarga(null); } } finally { ocupado(false); }
        }, 20);
      });
    }).catch(function () { ocupado(false); aviso('No permission to read the folder. Press "Read the folder" again.'); });
  }
  function escribirEnCarpeta(subc, nombre, datos) {
    var h = App.carpeta;
    if (!h || !h.queryPermission || App.demo) return Promise.resolve(false);
    return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') return false;
      return h.getDirectoryHandle(subc, { create: true }).then(function (d) { return d.getFileHandle(nombre, { create: true }); })
        .then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(datos).then(function () { return w.close(); }); }).then(function () { return true; });
    }).catch(function () { return false; });
  }
  function guardarFoto() {
    if (!App.carpeta || !App.lectura) return;
    var abiertas = App.lectura.tareas.filter(function (t) { return !t.fechas.terminada; }).map(function (t) { var a = t.agrupadores || {}; return { clave: t.clave_origen, estado: t.estado_origen, sprints: t.sprints, equipo: a[campo()] || '' }; });
    escribirEnCarpeta('historico', 'foto-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ fecha: new Date().toISOString(), abiertas: abiertas }));
  }
  function descargar(nombre, datos, tipo) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([datos], { type: tipo || 'application/json' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- sample data ----------
  // A fictional bank with two in-house teams and two vendor teams, a year of history, two initiatives and invented costs.
  var DEMO = { fichero: 'sample-data.csv', nombre: 'Sample bank' };
  function hayDemo() { var t = document.getElementById('demo-csv'); return !!(t && t.textContent.trim()); }
  function verDemo(simulada) {
    var t = (document.getElementById('demo-csv') || {}).textContent || '';
    if (!t.trim()) { aviso('This copy does not include sample data.'); return false; }
    var dc = {}; try { dc = JSON.parse(document.getElementById('demo-cliente').textContent || '{}'); } catch (e) { dc = {}; }
    if (!App.demo) App.real = { lectura: App.lectura, det: App.det, cfg: App.cfg, iniciativas: App.iniciativas, contexto: App.contexto, r: App.r, origen: App.origen, ver: App.ver, vista: App.vista, recSel: App.recSel, tiempoMs: App.tiempoMs, ficheros: App.ficheros, iaRecs: App.iaRecs, iaImpacto: App.iaImpacto, iaRecsDe: App.iaRecsDe };
    App.demo = true;
    App.cfg = { nombre: dc.nombre || DEMO.nombre, equiposInfo: dc.equiposInfo || {}, fte: dc.fte || {}, fteOrigen: dc.fteOrigen || {}, coste: dc.coste || {} };
    App.iniciativas = dc.iniciativas || []; App.contexto = dc.contexto || null; App.ver = 'area'; App.editar = null; App.nuevaIni = false;
    App.simulada = simulada && FUENTES[simulada] && !FUENTES[simulada].otra ? simulada : null; App.fuente = null;
    procesar([{ nombre: DEMO.fichero, texto: t }], 'ejemplo');
    render(); window.scrollTo(0, 0);
    return true;
  }
  function salirDemo(pintar) {
    if (!App.demo) return;
    if (window.Tutorial) window.Tutorial.cerrar();
    var r = App.real || {};
    App.demo = false; App.simulada = null;
    App.lectura = r.lectura || null; App.det = r.det || null; App.cfg = r.cfg || cfgInicial(); App.iniciativas = r.iniciativas || [];
    App.contexto = r.contexto || null; App.r = r.r || null; App.origen = r.origen || null; App.ver = r.ver || 'area'; App.ficheros = r.ficheros || null;
    App.recSel = r.recSel || null; App.recEquipo = 'todos'; App.tiempoMs = r.tiempoMs || 0;
    App.iaRecs = r.iaRecs || null; App.iaImpacto = r.iaImpacto || null; App.iaRecsDe = r.iaRecsDe || null;
    App.vista = App.r ? 'measure' : 'inicio'; App.medir = 'baseline'; App.real = null; App.editar = null; App.nuevaIni = false;
    if (pintar !== false) { render(); window.scrollTo(0, 0); }
  }

  // ---------- sources (entry) ----------
  // Jira works today with the CSV export or a folder. The other connectors are demo connectors: they load the sample data.
  var FUENTES = {
    jira: { nombre: 'Jira', sub: 'Cloud and Data Center', ico: 'J', unidad: 'issues', instancia: 'sample-bank.atlassian.net', proyecto: 'Digital Channels', equipo: 'Team field or component', csv: true, vivo: true,
      lee: ['Issues, their type and their epic', 'States and time in each state', 'Sprints and estimates', 'Description, only to check whether the ticket is well defined'],
      estados: [['To Do', 'pendiente'], ['In Progress', 'en_curso'], ['In Review', 'en_revision'], ['Blocked', 'bloqueado'], ['Done', 'terminado']] },
    ado: { nombre: 'Azure DevOps', sub: 'Boards', ico: 'AZ', unidad: 'work items', instancia: 'dev.azure.com/sample-bank', proyecto: 'Digital Channels', equipo: 'Area Path',
      lee: ['Work items and their type', 'States and their change history', 'Iterations and effort', 'Description and acceptance criteria'],
      estados: [['New', 'nuevo'], ['Active', 'en_curso'], ['Resolved', 'en_pruebas'], ['Closed', 'terminado'], ['Removed', 'descartado']] },
    servicenow: { nombre: 'ServiceNow', sub: 'Agile Development', ico: 'SN', unidad: 'stories', instancia: 'sample-bank.service-now.com', proyecto: 'Digital Channels', equipo: 'Assignment group',
      lee: ['Stories, tasks and defects', 'States and their history', 'Sprints and points', 'Description and acceptance criteria'],
      estados: [['Draft', 'nuevo'], ['Ready', 'pendiente'], ['Work in progress', 'en_curso'], ['Testing', 'en_pruebas'], ['Complete', 'terminado'], ['Cancelled', 'descartado']] },
    gitlab: { nombre: 'GitLab', sub: 'Issues and boards', ico: 'GL', unidad: 'issues', instancia: 'gitlab.sample-bank.com', proyecto: 'Digital Channels', equipo: 'Group or team label',
      lee: ['Issues and their labels', 'States and workflow labels', 'Iterations and weight', 'Description'],
      estados: [['Open', 'pendiente'], ['workflow::doing', 'en_curso'], ['workflow::review', 'en_revision'], ['Closed', 'terminado']] },
    github: { nombre: 'GitHub', sub: 'Issues and Projects', ico: 'GH', unidad: 'issues', instancia: 'github.com/sample-bank', proyecto: 'Digital Channels', equipo: 'Project field or label',
      lee: ['Issues and pull requests', 'Project status fields', 'Iterations and size', 'Description'],
      estados: [['Todo', 'pendiente'], ['In Progress', 'en_curso'], ['In review', 'en_revision'], ['Done', 'terminado']] },
    otra: { nombre: 'Another tool', sub: 'With its adapter', ico: '+', otra: true }
  };

  function inicio() {
    var f = App.fuente && FUENTES[App.fuente], demo = hayDemo();
    return '<div class="inicio"><div class="inicio-in">' +
      '<div class="inicio-txt">' + marca() + '<h1>Team performance from your delivery tools</h1>' +
      '<p class="inicio-sub">Measure every team with the same rules, see what stands out and why, act on it, and learn whether it worked. Teams only, never people.</p>' +
      '<ol class="metodo-mini" aria-label="The four steps">' + PASOS.map(function (p) { return '<li><span>' + p[1] + '</span>' + p[2] + '</li>'; }).join('') + '</ol>' +
      (demo ? '<div class="inicio-tut"><button class="btn btn-claro" data-accion="tutorial">Take the tutorial with sample data</button><span>Five minutes. Does not touch your data.</span></div>' : '') +
      '<p class="nota">Your data never leaves this computer: everything is calculated in the browser.</p></div>' +
      '<section class="fuentes" aria-label="Where the data comes from">' + (f ? panelFuente(App.fuente, f) : panelFuentes()) + '</section></div></div>';
  }
  function panelFuentes() {
    var carpetaOk = !!window.showDirectoryPicker;
    var tiles = Object.keys(FUENTES).map(function (k) {
      var f = FUENTES[k], estado = f.vivo ? 'Live: CSV export or folder' : (f.otra ? 'With an adapter' : 'Demo connector');
      return '<button class="conector' + (f.otra ? ' otra' : '') + '" data-accion="fuente" data-f="' + k + '"><span class="con-cab"><span class="con-ico" aria-hidden="true">' + f.ico + '</span><b>' + esc(f.nombre) + '</b></span>' +
        '<small>' + esc(f.sub) + '</small><span class="con-estado' + (f.vivo ? ' si' : '') + '">' + estado + '</span></button>';
    }).join('');
    return '<h2>Connect your delivery tool</h2><div class="conectores">' + tiles + '</div>' +
      '<p class="separador">or drop the exports here</p>' +
      '<div class="zona" id="zona"><b>Drop the Jira CSV here</b><span>Exported with all fields, from Jira Cloud or Data Center. You can drop several files: they are merged and duplicates removed.</span>' +
      '<div class="botones"><button class="btn" data-accion="ficheros">Choose files</button>' + (carpetaOk ? '<button class="btn btn-sec" data-accion="carpeta">Choose a folder</button>' : '') +
      (App.carpeta ? '<button class="btn btn-sec" data-accion="leer-carpeta">Read the folder "' + esc(App.carpeta.name) + '"</button>' : '') + '</div></div>';
  }
  function panelFuente(k, f) {
    var volver = '<button class="btn-txt volver" data-accion="fuentes">Back to the sources</button>';
    var li = function (t) { return '<li>' + esc(t) + '</li>'; };
    if (f.otra) {
      return volver + '<h2>Another tool</h2><p class="con-texto">Any tool with an export or an API works. An adapter translates its tasks, states and teams into the common model. Nothing else changes: measures, comparisons and recommendations are the same.</p>' +
        '<dl class="con-datos"><dt>Live today</dt><dd>Jira CSV export and shared folder</dd><dt>Next adapters</dt><dd>Azure DevOps, ServiceNow, GitLab, GitHub</dd><dt>Headcount and cost</dt><dd>From the staffing tool, the contracts or finance</dd></dl>' +
        '<div class="botones"><button class="btn btn-claro" data-accion="demo">See it with sample data</button></div>';
    }
    return volver + '<h2>Connect ' + esc(f.nombre) + (f.vivo ? '' : ' <span class="chip chip-atencion">Demo connector</span>') + '</h2>' +
      '<dl class="con-datos"><dt>Instance</dt><dd class="mono">' + esc(f.instancia) + '</dd><dt>Project</dt><dd>' + esc(f.proyecto) + '</dd><dt>Team</dt><dd>' + esc(f.equipo) + '</dd>' +
      '<dt>Period</dt><dd>Last 12 months</dd><dt>Access</dt><dd>Read only, granted by your administrator</dd></dl>' +
      '<div class="con-dos"><div><b>What we read</b><ul>' + f.lee.map(li).join('') + '</ul></div><div><b>What we never read</b><ul>' + ['Assignees or reporters', 'Comments or attachments'].map(li).join('') + '</ul></div></div>' +
      '<div class="botones"><button class="btn btn-claro" data-accion="conectar" data-f="' + k + '">' + (f.vivo ? 'Connect and load (demo)' : 'Connect and load') + '</button>' + (f.csv ? '<button class="btn btn-sec" data-accion="ficheros">Load a CSV export</button>' + (window.showDirectoryPicker ? '<button class="btn btn-sec" data-accion="carpeta">Choose a folder</button>' : '') : '') + '</div>' +
      '<p class="nota">' + (f.vivo ? 'The CSV export and the shared folder use your real data today. The direct API connection is set up during the pilot with your IT team; here it loads the sample data.' : 'Demo connector: it loads the sample data of a fictional bank. The ' + esc(f.nombre) + ' adapter is on the roadmap and follows the same common model.') + '</p>';
  }

  // ---------- header with the four steps ----------
  var VISTAS = { measure: vistaMeasure, analyze: vistaAnalyze, improve: vistaImprove, learn: vistaLearn, settings: vistaSettings };
  function render() {
    var html;
    if (!App.r || App.vista === 'inicio') html = inicio();
    else html = cabecera() + (App.demo ? bandaDemo() : '') + '<main class="pagina">' + (VISTAS[App.vista] || vistaMeasure)() + '</main>';
    document.getElementById('app').innerHTML = html;
  }
  function marca() { return '<div class="marca"><span class="logo" aria-hidden="true"></span><b>Easy Performance</b></div>'; }
  function estadoPasos() {
    var recs = recomendaciones().length + (App.iaRecs ? App.iaRecs.length : 0), segs = seguimientos();
    var evaluadas = segs.filter(function (x) { return x.s.estado === 'funciona' || x.s.estado === 'sin_efecto' || x.s.estado === 'empeora'; }).length;
    return {
      measure: App.r.modelo.equipos.length + ' ' + plural(App.r.modelo.equipos.length, 'team', 'teams'),
      analyze: recs ? recs + ' ' + plural(recs, 'recommendation', 'recommendations') : 'All within normal',
      improve: segs.length ? segs.length + ' ' + plural(segs.length, 'initiative', 'initiatives') : 'No initiatives yet',
      learn: evaluadas ? evaluadas + ' evaluated' : 'Measuring'
    };
  }
  function cabecera() {
    var st = estadoPasos();
    var pasos = PASOS.map(function (p) {
      return '<button class="paso" data-accion="vista" data-v="' + p[0] + '"' + (App.vista === p[0] ? ' aria-current="page"' : '') + '><span class="paso-num">' + p[1] + '</span><span class="paso-txt"><b>' + p[2] + '</b><small>' + esc(st[p[0]]) + '</small></span></button>';
    }).join('<span class="paso-sep" aria-hidden="true"></span>');
    var hasta = new Date(App.r.modelo.semanaFin.getTime() - 864e5);
    return '<header class="cab"><div class="cab-in">' + marca() + '<nav class="pasos-nav" aria-label="The four steps">' + pasos + '</nav><span class="hueco"></span>' +
      '<span class="fecha">Data up to ' + esc(fechaCorta(hasta)) + '</span><button class="btn btn-cab" data-accion="tutorial">Tutorial</button><button class="btn btn-cab btn-actualizar" data-accion="actualizar">Update</button>' +
      '<button class="btn btn-cab btn-ajustes" data-accion="vista" data-v="settings"' + (App.vista === 'settings' ? ' aria-current="page"' : '') + '>Settings</button></div></header>';
  }
  function bandaDemo() {
    var txt = App.simulada ? '<b>Demo connector for ' + esc(FUENTES[App.simulada].nombre) + ':</b> sample data of a fictional bank, with invented costs. Nothing you change here is saved.' :
      '<b>Sample data:</b> a fictional bank with two in-house teams and two vendor teams, a year of history and invented costs. Nothing you change here is saved.';
    return '<div class="banda-demo"><span>' + txt + '</span><span class="banda-acc"><button class="btn btn-peq" data-accion="salir-demo">' + (App.real && App.real.r ? 'Back to my data' : 'Load my data') + '</button></span></div>';
  }
  function subnav(items, actual, accion) {
    return '<nav class="subnav" aria-label="Sections">' + items.map(function (x) {
      return '<button class="subnav-b" data-accion="' + accion + '" data-s="' + x[0] + '"' + (x[0] === actual ? ' aria-current="page"' : '') + '>' + x[1] + '</button>';
    }).join('') + '</nav>';
  }
  function titularPaso(n, titulo, texto, acciones) {
    return '<section class="titular"><div><p class="kicker">Step ' + n + ' of 4</p><h1>' + titulo + '</h1><p>' + texto + '</p></div>' + (acciones ? '<div class="cab-acc">' + acciones + '</div>' : '') + '</section>';
  }

  // ---------- step 1: Measure ----------
  var SECCIONES_MEASURE = [['baseline', 'Baseline'], ['data', 'Data'], ['context', 'Context']];
  function vistaMeasure() {
    var s = SECCIONES_MEASURE.some(function (x) { return x[0] === App.medir; }) ? App.medir : 'baseline';
    var html = titularPaso(1, 'Measure', 'Each team against its own history, with the same definitions for everyone. Data and context make the baseline trustworthy.',
      subnav(SECCIONES_MEASURE, s, 'medir-sec'));
    return html + (s === 'data' ? vistaDatos() : s === 'context' ? vistaContexto() : tablero());
  }
  function selector() {
    var eqs = App.r.modelo.equipos;
    return '<label class="selector">View <select data-cambio="ver" aria-label="What to view"><option value="area"' + (App.ver === 'area' ? ' selected' : '') + '>Whole area</option>' +
      eqs.map(function (e) { return '<option value="' + esc(e.nombre) + '"' + (App.ver === e.nombre ? ' selected' : '') + '>' + esc(e.nombre) + '</option>'; }).join('') + '</select></label>';
  }
  function tablero() { return App.ver === 'area' ? vistaArea() : vistaEquipo(App.r.modelo.equipos.filter(function (e) { return e.nombre === App.ver; })[0]); }
  function problemas(eq, ids) {
    var out = { critico: [], atencion: [] };
    (ids || COLUMNAS).forEach(function (id) { var e = estadoDe(eq.medidas[id]); if (out[e]) out[e].push(id); });
    return out;
  }
  function tarjetaKpi(id, m, conSerie) {
    var e = estadoDe(m), c = cifra(id, m && m.disponible ? m.valor : null), def = MED[id];
    var normal;
    if (m && !m.disponible) normal = m.motivo || 'Not enough data.';
    else if ((e === 'atencion' || e === 'critico') && m.estadoTexto) normal = m.estadoTexto.replace(/its usual range/g, 'what is normal here');
    else if (m && m.ref) normal = 'Normal here: ' + rango(id, m.ref.lo, m.ref.hi);
    else normal = def.que.split('.')[0] + '.';
    var tip = def.que;
    if (id === 'ciclo' && m && m.disponible && m.valor != null) {
      var quien = App.ver && App.ver !== 'area' ? 'this team' : 'the area';
      tip = 'What ' + quien + ' starts today will almost surely be done in ' + c.g + ' ' + c.u + ' or less. If it rises, ' + quien + ' takes longer to finish what it starts.';
    }
    return '<article class="kpi kpi-' + e + '"><div class="kpi-cab">' + conTip(def.nombre, tip) + chip(e) + '</div>' +
      '<div class="kpi-v"><b>' + esc(c.g) + '</b><span>' + esc(c.u) + '</span></div><p class="kpi-n">' + esc(normal) + '</p>' + (conSerie ? chispa(m, e, def.nombre) : '') + '</article>';
  }
  function serieUltima(m, k) { var s = (m && m.serie) || []; return s.slice(Math.max(0, s.length - k)); }
  function chispa(m, e, nombre) {
    var s = serieUltima(m, 12), vals = s.filter(function (x) { return x != null; });
    if (vals.length < 3) return '';
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), r = (mx - mn) || 1, w = 120, h = 34, p = 3;
    var pts = [];
    s.forEach(function (v, i) { if (v != null) pts.push((p + i * (w - 2 * p) / (s.length - 1)).toFixed(1) + ',' + (p + (h - 2 * p) * (1 - (v - mn) / r)).toFixed(1)); });
    return '<svg class="chispa chispa-' + e + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(nombre) + ' over the last 12 weeks"><polyline points="' + pts.join(' ') + '"/></svg>';
  }
  function vistaArea() {
    var r = App.r, eqs = r.modelo.equipos.slice(), a = r.area.equipos[0];
    var peso = function (eq) { var p = problemas(eq); return p.critico.length * 10 + p.atencion.length; };
    eqs.sort(function (x, y) { return peso(y) - peso(x) || x.nombre.localeCompare(y.nombre, 'en'); });
    var fuera = eqs.filter(function (e) { var p = problemas(e); return p.critico.length || p.atencion.length; });
    var nRec = recomendaciones().length, info = App.cfg.equiposInfo || {};
    var de = function (t) { return eqs.filter(function (e) { return (info[e.nombre] || {}).tipo === t; }).length; };
    var nProv = de('proveedor'), nInt = de('interno');
    var sub = eqs.length + ' ' + plural(eqs.length, 'team', 'teams') + (nProv ? ': ' + nInt + ' in-house and ' + nProv + ' from ' + plural(nProv, 'a vendor', 'vendors') : '');
    var accion = !nRec ? '' : '<button class="btn" data-accion="vista" data-v="analyze">See ' + (nRec === 1 ? 'the recommendation' : 'the ' + nRec + ' recommendations') + '</button>';
    var html = '<section class="titular cab-area"><div><h2 class="h-area">' + esc(App.cfg.nombre || 'Whole area') + '</h2><p>' + esc(sub) + '</p></div><div class="cab-acc">' + selector() + accion + '</div></section>';
    html += estadoArea(fuera);
    html += '<section class="kpis" aria-label="Area indicators">' + KPI_AREA.concat(hayCoste() ? ['coste'] : []).map(function (id) { return tarjetaKpi(id, med(a, id), true); }).join('') + '</section>';
    if (eqs.length > 1) {
      var marca_ = function (st) { return st === 'atencion' || st === 'critico' ? '<span class="sr"> (' + ESTADO[st].toLowerCase() + ')</span>' : ''; };
      html += '<section class="bloque"><h2>Teams</h2><div class="tabla-caja"><table class="tabla-equipos"><thead><tr><th scope="col">Team</th>' +
        columnas().map(function (id) { return '<th scope="col">' + conTip(MED[id].nombre, MED[id].que) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        eqs.map(function (eq) {
          var inf = info[eq.nombre] || {}, tipo = inf.tipo === 'proveedor' ? (inf.proveedor || 'Vendor') : (inf.tipo === 'interno' ? 'In-house' : '');
          var p = problemas(eq), peor = p.critico.length ? 'critico' : p.atencion.length ? 'atencion' : 'bien';
          return '<tr><th scope="row"><span class="eq-nom"><span class="punto punto-' + peor + '" aria-hidden="true"></span><button class="enlace" data-accion="ver" data-e="' + esc(eq.nombre) + '">' + esc(eq.nombre) + '</button></span>' + (tipo ? '<span class="sub">' + esc(tipo) + '</span>' : '') + '</th>' +
            columnas().map(function (id) {
              var m = med(eq, id), v = m && m.disponible ? valor(id, m.valor) : null, st = estadoDe(m);
              return '<td>' + (v ? '<span class="v v-' + st + '">' + esc(v) + marca_(st) + '</span>' : '<span class="apagado">n/a</span>') + '</td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="leyenda-mat"><span class="v v-atencion">Attention</span><span class="v v-critico">Critical</span><span>No colour: within what is normal. Each figure is compared with what is normal in that same team; click a team for its detail.</span></p></section>';
    }
    return html;
  }
  function vistaEquipo(eq) {
    if (!eq) { App.ver = 'area'; return vistaArea(); }
    var p = problemas(eq, KPI_EQUIPO), fuera = p.critico.concat(p.atencion).map(function (id) { return MED[id].nombre.toLowerCase(); });
    var info = (App.cfg.equiposInfo || {})[eq.nombre] || {};
    var sub = (info.tipo === 'proveedor' ? (info.proveedor || 'Vendor') + '. ' : info.tipo === 'interno' ? 'In-house. ' : '') + 'Compared with its own previous 12 weeks.';
    var recs = recomendaciones().filter(function (x) { return x.equipos.indexOf(eq.nombre) >= 0; });
    var html = '<section class="titular cab-area"><div><button class="btn-txt" data-accion="ver" data-e="area">Back to the area</button><h2 class="h-area">' + esc(eq.nombre) + '</h2><p>' + esc(sub) + '</p></div><div class="cab-acc">' + selector() + '</div></section>';
    html += '<section class="kpis" aria-label="Team indicators">' + KPI_EQUIPO.concat(hayCoste() ? ['coste'] : []).map(function (id) { return tarjetaKpi(id, med(eq, id), true); }).join('') + '</section>';
    html += '<div class="equipo-abajo"><section class="bloque grafico-plazo"><h2>Lead time, week by week</h2><p class="nota">How long the team takes to finish what it starts, week by week. The band is what is normal in this team.</p>' + graficoPlazo(eq.medidas.ciclo) + '</section>' +
      bloqueRecEquipo(eq, recs, fuera) + '</div>';
    return html;
  }
  function bloqueRecEquipo(eq, recs, fuera) {
    if (!recs.length) return '<section class="bloque bloque-oscuro"><h2>No recommendations for ' + esc(eq.nombre) + '</h2><p>Nothing outside what is normal calls for action.</p></section>';
    return '<section class="bloque bloque-oscuro"><h2>' + (recs.length === 1 ? 'One recommendation' : (NUMEROS[recs.length] || recs.length) + ' recommendations') + ' for ' + esc(eq.nombre) + '</h2>' +
      (fuera.length ? '<p>' + mayus(lista(fuera)) + (fuera.length === 1 ? ' is' : ' are') + ' outside what is normal.</p>' : '') +
      '<ol>' + recs.map(function (x) { return '<li>' + esc(x.titulo) + '</li>'; }).join('') + '</ol><button class="btn btn-claro" data-accion="ver-recs" data-e="' + esc(eq.nombre) + '">See what to do</button></section>';
  }
  function graficoPlazo(m) {
    if (!m || !m.disponible) return '<p class="nota">' + esc((m && m.motivo) || 'No lead time data.') + '</p>';
    var s = serieUltima(m, 12), sem = App.r.modelo.semanas.slice(-s.length), vals = s.filter(function (x) { return x != null; });
    if (vals.length < 2) return '<p class="nota">Not enough weeks yet.</p>';
    var lo = m.ref ? m.ref.lo : null, hi = m.ref ? m.ref.hi : null;
    var mn = Math.min.apply(null, vals.concat(lo != null ? [lo] : [])), mx = Math.max.apply(null, vals.concat(hi != null ? [hi] : [])), r = (mx - mn) || 1;
    var w = 700, h = 200, p = 10, X = function (i) { return p + i * (w - 2 * p) / (s.length - 1); }, Y = function (v) { return p + (h - 2 * p) * (1 - (v - mn) / r); };
    var pts = []; s.forEach(function (v, i) { if (v != null) pts.push(X(i).toFixed(1) + ',' + Y(v).toFixed(1)); });
    var ult = s.length - 1; while (ult > 0 && s[ult] == null) ult--;
    var e = estadoDe(m);
    var banda = lo != null ? '<rect class="banda" x="' + p + '" y="' + Y(hi).toFixed(1) + '" width="' + (w - 2 * p) + '" height="' + (Y(lo) - Y(hi)).toFixed(1) + '"/>' : '';
    return '<svg class="grafico" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Lead time over the last ' + s.length + ' weeks' + (lo != null ? ', normal between ' + valor('ciclo', lo) + ' and ' + valor('ciclo', hi) : '') + '">' + banda +
      '<polyline points="' + pts.join(' ') + '"/><circle class="punto-' + e + '" cx="' + X(ult).toFixed(1) + '" cy="' + Y(s[ult]).toFixed(1) + '" r="6"/></svg>' +
      '<div class="eje"><span>' + esc(fechaCorta(sem[0])) + '</span>' + (lo != null ? '<span>Normal: ' + esc(rango('ciclo', lo, hi)) + '</span>' : '') + '<span>' + esc(fechaCorta(sem[sem.length - 1])) + '</span></div>';
  }
  var NIVEL = { alta: ['bien', 'High'], media: ['atencion', 'Medium'], baja: ['critico', 'Low'] };
  function estadoArea(fuera) {
    var f = fiab(), n = NIVEL[f.nivel], rev = f.comprobaciones.filter(function (c) { return c.estado === 'revisar'; });
    var txt = !rev.length ? f.bien + ' of ' + f.comprobaciones.length + ' data checks pass.' :
      rev.length <= 3 ? 'To review: ' + lista(rev.map(function (c) { return c.nombre.toLowerCase(); })) + '.' : rev.length + ' of ' + f.comprobaciones.length + ' data checks to review.';
    var izq = '<div class="fiab-tira fiab-' + f.nivel + '"><span class="chip chip-' + n[0] + '">Reliability ' + n[1].toLowerCase() + '</span><span>' + esc(txt) + '</span><button class="btn-txt" data-accion="fiabilidad">See the data checks</button></div>';
    var criticos = fuera.filter(function (e) { return problemas(e).critico.length; }), foco = criticos.length ? criticos : fuera, resto = fuera.length - foco.length;
    var der = '<div class="fuera"><span class="fuera-tit">' + (foco.length ? 'Need attention' : 'All teams within normal') + '</span>' + foco.map(function (e) {
      var g = problemas(e).critico.length ? 'critico' : 'atencion';
      return '<button class="pill-eq" data-accion="ver" data-e="' + esc(e.nombre) + '"><span class="punto punto-' + g + '" aria-hidden="true"></span>' + esc(e.nombre) + '<span class="sr"> (' + ESTADO[g].toLowerCase() + ')</span></button>';
    }).join('') + (resto ? '<span class="fuera-mas">and ' + resto + ' ' + plural(resto, 'team', 'teams') + ' with a notice</span>' : '') + '</div>';
    return '<section class="estado-area" aria-label="Area status">' + izq + der + '</section>';
  }

  // ---------- Measure > Data: reliability and how the export was read ----------
  var cacheFiab = { r: null, v: null };
  function fiab() {
    if (cacheFiab.r === App.r) return cacheFiab.v;
    var c = cfgCalculo(), m = {};
    if (!App.cfg.mapeoEstados && App.cfg.etapas) Object.assign(m, N.etapasV0AMapeo(App.cfg.etapas, App.det.mapeoEstados));
    c.mapeoEstados = Object.assign(m, App.cfg.mapeoEstados || {});
    var v = N.fiabilidad(App.lectura, App.r.det, App.r.preparacion, App.r.modelo, c);
    cacheFiab = { r: App.r, v: v };
    return v;
  }
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var ICO_EST = { bien: CHECK, revisar: '!', sin: '' };
  var COLS_FIAB = { tiempos: 'Time in each state', flujo: 'Go through in progress', registro: 'Logged on time', estimacion: 'Stories estimated', sprints: 'Credible sprints', historia: 'History' };
  var SECCIONES_DATOS = [['fiabilidad', 'Data reliability'], ['lectura', 'How the export was read']];
  function vistaDatos() {
    var s = SECCIONES_DATOS.some(function (x) { return x[0] === App.datos; }) ? App.datos : 'fiabilidad';
    var html = '<section class="titular cab-area"><div><h2 class="h-area">Data</h2><p>If the tool does not reflect the work, the figures will not either. Here is what to review and what was read from the export.</p></div><div class="cab-acc">' + subnav(SECCIONES_DATOS, s, 'datos-sec') + '</div></section>';
    return html + (s === 'lectura' ? secLectura() : secFiabilidad());
  }
  function secFiabilidad() {
    var f = fiab(), n = NIVEL[f.nivel];
    var html = '<section class="bloque fiab-cab"><div class="fiab-nivel fiab-' + f.nivel + '"><span>Reliability</span><b>' + n[1] + '</b></div><div><h2>Data reliability</h2>' +
      '<p>' + f.bien + ' of ' + f.comprobaciones.length + ' checks pass' + (f.revisar ? ' and ' + f.revisar + (f.revisar === 1 ? ' needs review' : ' need review') : '') + '. Checks never change a figure: they warn.</p>' +
      '<p class="nota">High: at most one check to review. Medium: two or three, or no time in each state. Low: four or more, or less than half of the tasks have a team.</p></div></section>';
    html += '<div class="fiab-grid">' + f.comprobaciones.map(function (c) {
      return '<article class="fiab-c fiab-' + c.estado + '"><div class="fiab-c-cab"><span class="v-ico ' + (c.estado === 'bien' ? 'ok' : c.estado === 'revisar' ? 'aviso' : 'pend') + '" aria-hidden="true">' + ICO_EST[c.estado] + '</span>' +
        '<h3>' + conTip(esc(c.nombre), c.que) + '</h3><b class="fiab-valor">' + esc(c.valor) + '</b></div>' +
        '<p>' + esc(c.detalle) + '</p><p class="nota">Good from: ' + esc(c.umbral) + '.' + (c.estado === 'revisar' ? ' <b>How to fix it:</b> ' + esc(c.arreglo) : '') + '</p></article>';
    }).join('') + '</div>';
    var queDe = {}; f.comprobaciones.forEach(function (c) { queDe[c.id] = c.que; });
    html += '<section class="bloque"><h2>By team</h2><div class="tabla-caja"><table class="tabla-fiab"><thead><tr><th scope="col">Team</th>' +
      Object.keys(COLS_FIAB).map(function (k) { return '<th scope="col">' + conTip(COLS_FIAB[k], queDe[k]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      f.porEquipo.map(function (e) {
        return '<tr><th scope="row">' + esc(e.equipo) + '</th>' + Object.keys(COLS_FIAB).map(function (k) { var x = e.valores[k]; return '<td><span class="fv fv-' + x.estado + '">' + esc(x.valor) + '</span></td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><p class="nota">In red, what to review with that team. The last 16 weeks are considered.</p></section>';
    html += '<section class="bloque"><h2>Data notices</h2>' + calidad() + '</section>';
    return html;
  }
  function secLectura() {
    var inf = App.lectura.informe, det = App.det, desde = det.fechaMin, hasta = new Date(Math.min(det.fechaRef, det.fechaMax));
    var html = '<section class="bloque"><h2>Files</h2><p>' + esc(inf.ficheros.map(function (f) { return f.nombre; }).join(', ')) + ': ' + miles(inf.tareas) + ' tasks from ' + esc(fechaCorta(desde)) + ' to ' + esc(fechaCorta(hasta)) +
      (inf.duplicadas ? ', ' + miles(inf.duplicadas) + ' duplicates counted once' : '') + (inf.epicas + inf.subtareas ? ', ' + miles(inf.epicas + inf.subtareas) + ' epics and subtasks left out of the calculation' : '') + '.</p>' +
      (App.origen === 'carpeta' || App.origen === 'datosjs' ? '<p class="nota">Read from the folder. To update, drop the new export in exports and press Update.</p>' : '') + '</section>';
    html += '<section class="bloque">' + hallazgosExport() + '</section>';
    html += '<section class="bloque">' + historiaExport() + '</section>';
    var cols = columnasLeidas();
    if (cols) html += '<section class="bloque">' + cols + '</section>';
    return html;
  }
  var CAMPO_TXT = { equipo: 'the Team field', componentes: 'the component', proyecto: 'the project', etiquetas: 'the labels' };
  var nombresCol = function (cs) { return lista(cs.map(function (c) { return '"' + c.columna + '"'; })); };
  function hallazgosExport() {
    var fs = App.ficheros || [], inf = App.lectura.informe, det = App.det, E = C.estados.estados, mp = mapeo();
    var cols = fs.length && fs[0].texto && N.describirColumnas ? N.describirColumnas(fs[0].texto) : [];
    var fuera = cols.filter(function (c) { return c.accion === 'descarta'; }), ign = cols.filter(function (c) { return c.accion === 'ignora'; });
    var solo = [], consultor = [], cliente = [];
    if (fuera.length) solo.push('Discards ' + fuera.length + ' ' + plural(fuera.length, 'column', 'columns') + ' with people or comments: ' + nombresCol(fuera) + '. They are never read.');
    if (inf.duplicadas) solo.push(miles(inf.duplicadas) + ' ' + plural(inf.duplicadas, 'task was duplicated', 'tasks were duplicated') + ': the latest version counts.');
    if (ign.length) solo.push('Ignores ' + ign.length + ' ' + plural(ign.length, 'column it does not recognise', 'columns it does not recognise') + (ign.length <= 4 ? ': ' + nombresCol(ign) : '') + '. Not needed to measure.');
    if (!App.cfg.campoEquipo) consultor.push('Confirm in Context that the team of each task comes from ' + (CAMPO_TXT[campo()] || 'the proposed column') + '.');
    det.estados.filter(function (e) { return e.propuestaPor !== 'nombre' && !(App.cfg.mapeoEstados || {})[e.nombre]; }).forEach(function (e) {
      var com = E[mp[e.nombre] || e.estado];
      consultor.push('Confirm in Context the state "' + e.nombre + '": not recognised by name, now counted as ' + (com ? com.nombre.toLowerCase() : 'unmapped') + '.');
    });
    if (!det.hayTiempos) cliente.push('No time in each state. Without it there is no lead time from start, no rework and no blocked time. Export with that field.');
    if (!det.haySprints) cliente.push('No sprints: carried-over work cannot be seen. If teams work in sprints, export with the Sprint field.');
    if ([1000, 10000].indexOf(inf.filasLeidas) >= 0) cliente.push('Exactly ' + miles(inf.filasLeidas) + ' rows: the export may be truncated. Export in parts, by date or by team.');
    var act = fiab().comprobaciones.filter(function (c) { return c.id === 'actividad'; })[0];
    if (act && act.estado === 'revisar') cliente.push('The last weeks have almost no activity: the export seems cut. Export the whole period again.');
    var grupo = function (cls, titulo, xs, vacio) {
      return '<div class="hall hall-' + cls + (xs.length ? ' con' : '') + '"><h4>' + titulo + '</h4>' + (xs.length ? '<ul>' + xs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>' + vacio + '</p>') + '</div>';
    };
    return '<h3 class="sem-h3">What was found in this export</h3><div class="hallazgos">' +
      grupo('solo', 'Solved by the page itself', solo, 'Nothing to solve.') +
      grupo('consultor', 'To confirm in Context', consultor, 'Nothing pending.') +
      grupo('cliente', 'Fixed when exporting', cliente, 'Nothing: the export has what is needed.') + '</div>' +
      '<p class="nota">This is about the export. What teams log badly in the tool shows in <button class="btn-txt" data-accion="datos-sec" data-s="fiabilidad">Data reliability</button>.</p>';
  }
  function historiaExport() {
    var nivel = App.det.hayTiempos ? 1 : 0;
    var pasos = [
      ['Snapshot of today', 'The state of each task today and its dates.', 'Deliveries, lead time from creation and age of the backlog.'],
      ['Time in each state', 'How long each task spent in each state, without the order of changes.', 'Plus: lead time from start, blocked and waiting time, and rework.'],
      ['Change history', 'Every state change with its date. Comes through the API.', 'Plus: exact reopenings and how long each task has been blocked.'],
      ['Sprint history', 'What entered and left each sprint. Comes through the API.', 'Plus: whether each sprint commitment is met.']
    ];
    return '<h3 class="sem-h3">How much history this export brings</h3><ol class="escalera">' + pasos.map(function (p, k) {
      return '<li class="' + (k === nivel ? 'actual' : k > nivel ? 'falta' : 'hecho') + '"><b>' + p[0] + '</b>' + (k === nivel ? '<span class="chip chip-bien">This export</span>' : '') + '<p>' + p[1] + '</p><p class="esc-med">' + p[2] + '</p></li>';
    }).join('') + '</ol>' +
      '<p class="nota">' + (nivel ? 'This export brings the time in each state, so lead time, rework and blocked time are measured.' : 'This export only brings the snapshot of today. Exporting with the Time in Status field adds lead time from start, rework and blocked time.') +
      ' Carried-over work comes from the Sprint columns. The last two levels need the API connection.</p>';
  }
  var ACCION_COL = { usa: ['bien', 'Used'], descarta: ['critico', 'Discarded'], ignora: ['sin', 'Ignored'] };
  function columnasLeidas() {
    var fs = App.ficheros || [];
    if (!fs.length || !fs[0].texto || !N.describirColumnas) return '';
    var cols = N.describirColumnas(fs[0].texto);
    if (!cols.length) return '';
    var eqCampo = campo(), confirmado = !!App.cfg.campoEquipo;
    var cuenta = { usa: 0, descarta: 0, ignora: 0 };
    cols.forEach(function (c) { cuenta[c.accion] += c.veces; });
    var fila = function (c) {
      var que = c.que, a = ACCION_COL[c.accion];
      if (c.campo && c.campo === eqCampo) que = 'Team of each task: ' + (confirmado ? 'confirmed in Context' : 'proposed; confirm it in Context');
      var ej = c.accion === 'descarta' ? '<span class="apagado">Not read</span>' : c.ejemplo ? '<code>' + esc(c.ejemplo) + '</code>' : '';
      return '<tr' + (c.accion === 'descarta' ? ' class="col-fuera"' : '') + '><th scope="row"><code>' + esc(c.columna) + '</code>' + (c.veces > 1 ? ' <small>(' + c.veces + ' columns)</small>' : '') + '</th>' +
        '<td>' + esc(que) + '</td><td>' + ej + '</td><td><span class="chip chip-' + a[0] + '">' + a[1] + '</span></td></tr>';
    };
    var vistas = cols.filter(function (c) { return c.accion !== 'ignora'; }), ignoradas = cols.filter(function (c) { return c.accion === 'ignora'; });
    var pocas = ignoradas.length <= 8;
    return '<h3 class="sem-h3">How this export was read</h3>' +
      '<p class="nota">' + esc(fs[0].nombre) + (fs.length > 1 ? ' (and ' + (fs.length - 1) + ' more ' + plural(fs.length - 1, 'file', 'files') + ' with the same columns)' : '') + ': ' +
      miles(cuenta.usa) + ' columns are used, ' + miles(cuenta.descarta) + ' are discarded and ' + miles(cuenta.ignora) + ' are not recognised and ignored. Calculated on the loaded export.</p>' +
      '<div class="tabla-caja"><table class="tabla-sem tabla-cols"><thead><tr><th scope="col">Export column</th><th scope="col">What it is</th><th scope="col">Example</th><th scope="col">What is done</th></tr></thead><tbody>' +
      vistas.concat(pocas ? ignoradas : []).map(fila).join('') + '</tbody></table></div>' +
      (pocas || !ignoradas.length ? '' : '<details class="cols-ign"><summary>' + miles(ignoradas.length) + ' unrecognised columns, ignored</summary><p>' +
        ignoradas.map(function (c) { return '<code>' + esc(c.columna) + '</code>'; }).join(' ') + '</p></details>');
  }
  function listaAvisos() {
    var vistos = {};
    App.lectura.informe.avisos.concat(App.det.avisos).forEach(function (a) { vistos[a.texto] = 1; });
    App.r.modelo.equipos.forEach(function (e) { e.calidad.avisos.forEach(function (a) { vistos[a] = 1; }); });
    return Object.keys(vistos);
  }
  function calidad() {
    var r = App.r, inf = App.lectura.informe, generales = inf.avisos.concat(App.det.avisos).map(function (a) { return a.texto; });
    var eqs = r.modelo.equipos, comunes = eqs.length > 1 ? eqs[0].calidad.avisos.filter(function (a) { return eqs.every(function (e) { return e.calidad.avisos.indexOf(a) >= 0; }); }) : [];
    var propios = eqs.filter(function (e) { return e.calidad.avisos.some(function (a) { return comunes.indexOf(a) < 0; }); });
    var todos = generales.concat(comunes.filter(function (a) { return generales.indexOf(a) < 0; }));
    var texto = !todos.length && !propios.length ? 'No notices: the data seems to reflect the work well.' :
      '<ul>' + todos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + propios.map(function (e) { return '<li><b>' + esc(e.nombre) + ':</b> ' + esc(e.calidad.avisos.filter(function (a) { return comunes.indexOf(a) < 0; }).join(' ')) + '</li>'; }).join('') + '</ul>';
    return '<div class="leido"><div class="leido-cab"><b>Data quality</b><div class="leido-texto">' + texto + '</div></div></div>';
  }

  // ---------- Measure > Context: what cannot be detected and what to confirm ----------
  function vistaContexto() {
    var r = App.r, det = App.det, eqs = r.modelo.equipos.map(function (e) { return e.nombre; });
    var info = App.cfg.equiposInfo || {}, mp = mapeo(), E = C.estados.estados, op = opcion(campo());
    var provs = eqs.filter(function (e) { return (info[e] || {}).tipo === 'proveedor'; });
    var campoNombre = op ? (op.id === 'todos' ? 'none: all work as a single team' : 'the field ' + op.nombre.replace(/^campo\s+/i, '')) : '';
    var ed = App.editar;
    var fila = function (k, titulo, texto, panel) {
      return '<div class="leido" id="ajuste-' + k + '"><div class="leido-cab"><b>' + titulo + '</b><p>' + texto + '</p>' + (panel ? '<button class="btn btn-sec btn-peq" data-accion="editar" data-e="' + k + '" aria-expanded="' + (ed === k) + '">' + (ed === k ? 'Done' : 'Change') + '</button>' : '') + '</div>' + (ed === k && panel ? '<div class="leido-panel">' + panel() + '</div>' : '') + '</div>';
    };
    var revisar = det.estados.some(function (e) { return e.propuestaPor !== 'nombre' && !(App.cfg.mapeoEstados || {})[e.nombre]; });
    var html = '<section class="titular cab-area"><div><h2 class="h-area">Context</h2><p>What the page detects by itself can be corrected. What it cannot know (vendors, areas, headcount, cost) is set once and saved' + (App.carpeta ? ' in the browser and in configuracion/cliente.json' : ' in the browser') + '.</p></div></section>';
    html += '<section class="bloque" id="leido"><div class="bloque-cab"><h2>Teams and states</h2></div>' +
      fila('campo', 'Team field', 'From ' + esc(campoNombre) + ': ' + esc(lista(eqs)) + '.', panelCampo) +
      fila('equipos', 'Vendors, areas, FTE and cost', (provs.length ? esc(lista(provs.map(function (e) { return e + ' (' + ((info[e] || {}).proveedor || 'vendor') + ')'; }))) + ' belong to vendors. The rest are in-house.' : 'All teams are treated as in-house. Mark which ones belong to a vendor to compare them.') + ' ' + textoCapacidad(eqs), panelEquipos) +
      fila('estados', 'States', esc(det.estados.map(function (e) { return e.nombre + ' is ' + E[mp[e.nombre] || e.estado].nombre.toLowerCase(); }).join('; ')) + '.' + (revisar ? ' <span class="chip chip-atencion">Review</span>' : '') + (App.iaMapeo ? ' <span class="chip chip-bien">AI proposal applied</span>' : ''), panelEstados) +
      '</section>';
    html += '<section class="bloque" id="ajuste-contexto"><h2>Context documents</h2>' + bloqueContextoDocs() + '</section>';
    html += '<section class="bloque" id="ajuste-definiciones"><h2>KPI catalogue</h2><p class="nota">The definitions document records the team field, the teams, the states and the measures, to sign off with the client. It is the standard every team is measured against.</p>' +
      '<p class="botones"><button class="btn" data-accion="definiciones" data-f="docx">Download the KPI catalogue (Word)</button><button class="btn btn-sec" data-accion="definiciones" data-f="md">Markdown</button></p></section>';
    return html;
  }
  var CATEGORIA_CTX = { metodo: 'Way of working', organizacion: 'Organisation', stack: 'Technology stack', contratos: 'Vendor contracts', otro: 'Other' };
  function bloqueContextoDocs() {
    var docs = (App.contexto && App.contexto.documentos) || [];
    var por = {}; docs.forEach(function (d) { (por[d.categoria] = por[d.categoria] || []).push(d); });
    var cats = Object.keys(CATEGORIA_CTX);
    return '<p class="nota">Short summaries the consultant writes or approves: way of working, organisation, technology, contracts. They live in the contexto folder and they are the only context the AI assistant can use. An empty category means the AI gives no opinion on it.</p>' +
      '<div class="ctx-grid">' + cats.map(function (c) {
        var ds = por[c] || [];
        return '<div class="ctx-cat' + (ds.length ? ' con' : '') + '"><b>' + CATEGORIA_CTX[c] + '</b>' + (ds.length ? '<ul>' + ds.map(function (d) { return '<li><b>' + esc(d.titulo) + '</b> ' + esc(d.resumen || '') + '</li>'; }).join('') + '</ul>' : '<p>Empty</p>') + '</div>';
      }).join('') + '</div>';
  }
  function textoCapacidad(eqs) {
    var cap = N.capacidadArea(cfgCalculo(), eqs);
    if (cap.costeMes != null) return 'Headcount of ' + n1(cap.fteTotal) + ' FTE costing ' + euros(cap.costeMes) + ' a month.';
    if (cap.fteTotal != null) return 'Headcount of ' + n1(cap.fteTotal) + ' FTE. Set the cost of one FTE per team to see the cost per delivery.';
    return 'Set the FTE and cost of each team to see deliveries per FTE and cost per delivery.';
  }
  function panelCampo() {
    var ops = App.det.opcionesEquipo.filter(function (o) { return o.valida; }), c = campo();
    return '<label class="campo-linea">Field that says which team each task belongs to <select data-cambio="campo">' + ops.map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (o.id === c ? ' selected' : '') + '>' + esc(o.id === 'todos' ? 'None: everything is one team' : o.nombre.replace(/^campo\s+/i, '') + ' (' + o.valores.length + ' teams)') + '</option>';
    }).join('') + '</select></label>';
  }
  function panelEquipos() {
    var eqs = App.r.modelo.equipos.map(function (e) { return e.nombre; }), info = App.cfg.equiposInfo || {}, fte = App.cfg.fte || {}, orig = App.cfg.fteOrigen || {}, coste = App.cfg.coste || {};
    return '<div class="tabla-caja"><table class="tabla-editar"><thead><tr><th scope="col">Team</th><th scope="col">Type</th><th scope="col">Vendor</th><th scope="col">Area</th><th scope="col">FTE</th><th scope="col">FTE source</th><th scope="col">Cost of one FTE a month</th></tr></thead><tbody>' +
      eqs.map(function (e) {
        var i = info[e] || {}, prov = i.tipo === 'proveedor', o = orig[e] || 'declarado', a = ' data-e="' + esc(e) + '"';
        return '<tr><th scope="row">' + esc(e) + '</th><td><select data-cambio="eq" data-campo="tipo"' + a + ' aria-label="Type of ' + esc(e) + '"><option value="interno"' + (prov ? '' : ' selected') + '>In-house</option><option value="proveedor"' + (prov ? ' selected' : '') + '>Vendor</option></select></td>' +
          '<td><input type="text" data-cambio="eq" data-campo="proveedor"' + a + ' value="' + esc(i.proveedor || '') + '" placeholder="Name"' + (prov ? '' : ' disabled') + ' aria-label="Vendor of ' + esc(e) + '"></td>' +
          '<td><input type="text" data-cambio="eq" data-campo="area"' + a + ' value="' + esc(i.area || '') + '" placeholder="Area" aria-label="Area of ' + esc(e) + '"></td>' +
          '<td><input type="number" min="0" step="0.5" data-cambio="eq" data-campo="fte"' + a + ' value="' + (fte[e] != null ? fte[e] : '') + '" aria-label="FTE of ' + esc(e) + '"></td>' +
          '<td><select data-cambio="eq" data-campo="fteOrigen"' + a + ' aria-label="FTE source of ' + esc(e) + '">' + [['contrato', 'Contract'], ['declarado', 'Declared'], ['estimado', 'Estimated']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === o ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></td>' +
          '<td><input type="number" min="0" step="100" data-cambio="eq" data-campo="coste"' + a + ' value="' + (coste[e] != null ? coste[e] : '') + '" placeholder="€" aria-label="Monthly cost of one FTE in ' + esc(e) + ', in euros"></td></tr>';
      }).join('') + '</tbody></table></div><p class="nota">FTE: full-time people. Cost of one FTE: loaded internal cost for in-house teams and contract rate for vendor teams, in euros a month. Jira brings neither; they come from the staffing tool, the contract or finance. A team figure, never a salary.</p>';
  }
  var ORDEN_COMUN = ['nuevo', 'pendiente', 'en_curso', 'bloqueado', 'en_revision', 'en_pruebas', 'en_espera', 'terminado', 'descartado'];
  function panelEstados() {
    var E = C.estados.estados, mp = mapeo(), cambiados = App.cfg.mapeoEstados || {};
    var ia = hayIa() ? '<p class="botones"><button class="btn btn-sec btn-peq" data-accion="ia-mapeo"' + (App.iaEstado === 'working' ? ' disabled' : '') + '>Ask the AI assistant to check the mapping</button><span class="nota">It only sees state names and counts. Its proposal is applied here and marked; you can still change it.</span></p>' :
      '<p class="nota">With an API key in Settings, the AI assistant can check this mapping from the state names.</p>';
    return '<div class="tabla-caja"><table class="tabla-editar"><thead><tr><th scope="col">State in the tool</th><th scope="col">Tasks now</th><th scope="col">Common state</th></tr></thead><tbody>' +
      App.det.estados.map(function (e) {
        var sel = mp[e.nombre] || e.estado, rev = e.propuestaPor !== 'nombre' && !cambiados[e.nombre];
        return '<tr><th scope="row">' + esc(e.nombre) + (rev ? ' <span class="chip chip-atencion">Review</span>' : '') + '</th><td>' + e.actuales.toLocaleString('en-GB') + '</td><td><select data-cambio="estado" data-e="' + esc(e.nombre) + '" aria-label="Common state of ' + esc(e.nombre) + '">' +
          ORDEN_COMUN.map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(E[k].nombre) + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</tbody></table></div>' + ia + '<p class="nota">' + ORDEN_COMUN.map(function (k) { return '<b>' + esc(E[k].nombre) + ':</b> ' + esc(E[k].descripcion); }).join(' ') + '</p>';
  }

  // ---------- tooltips ----------
  function medTip(id) {
    if (MED[id]) return MED[id].que;
    var d = C.medidas[id];
    return d ? d.como + (d.dir ? ' ' + (d.dir === 'menos' ? 'Lower is better.' : 'Higher is better.') : '') : '';
  }
  function conTip(texto, tip) { return tip ? '<span class="con-tip" tabindex="0" data-tip="' + esc(tip) + '">' + texto + '</span>' : texto; }
  function nombreMedida(id) { return MED[id] ? MED[id].nombre : (C.medidas[id] ? C.medidas[id].nombre : id); }
  function nomMed(id) { return conTip(esc(nombreMedida(id)), medTip(id)); }
  var globo = null;
  function mostrarTip(el) {
    var t = el.getAttribute('data-tip');
    if (!t) return;
    if (!globo) { globo = document.createElement('div'); globo.className = 'tip'; globo.setAttribute('role', 'tooltip'); globo.id = 'tip'; document.body.appendChild(globo); }
    globo.textContent = t; globo.hidden = false; globo.classList.remove('visible');
    el.setAttribute('aria-describedby', 'tip');
    var r = el.getBoundingClientRect(), g = globo.getBoundingClientRect();
    var x = Math.max(8, Math.min(window.innerWidth - g.width - 8, r.left + r.width / 2 - g.width / 2));
    var arriba = r.top - g.height - 10 >= 8, y = arriba ? r.top - g.height - 10 : r.bottom + 10;
    globo.style.left = Math.round(x) + 'px'; globo.style.top = Math.round(y) + 'px';
    globo.classList.toggle('abajo', !arriba);
    requestAnimationFrame(function () { if (globo) globo.classList.add('visible'); });
  }
  function ocultarTip(el) { if (globo) { globo.hidden = true; globo.classList.remove('visible'); } if (el && el.removeAttribute) el.removeAttribute('aria-describedby'); }
  document.addEventListener('mouseover', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) mostrarTip(el); });
  document.addEventListener('mouseout', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) ocultarTip(el); });
  document.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) mostrarTip(el); });
  document.addEventListener('focusout', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) ocultarTip(el); });
  window.addEventListener('scroll', function () { ocultarTip(null); }, true);

  // ---------- step 2: Analyze ----------
  // Recommendations come from the case bank activated by the figures, grouped when they repeat across teams,
  // plus the AI assistant's recommendations (validated against the diagnostic package) when there is an API key.
  var cacheRecs = { r: null, v: null };
  function recomendaciones() {
    if (!App.r) return [];
    if (cacheRecs.r === App.r) return cacheRecs.v;
    var r = App.r, porId = {}, out = [];
    function deEquipo(id, gravedad, equipo, evidencia) {
      if (!C.casos[id]) return;
      var x = porId[id] = porId[id] || { id: id, gravedad: 'atencion', equipos: [], evidencias: [], grupo: false };
      if (gravedad === 'critico') x.gravedad = 'critico';
      x.equipos.push(equipo); x.evidencias.push([equipo, evidencia]);
    }
    r.modelo.equipos.forEach(function (eq) { eq.casos.forEach(function (c) { deEquipo(c.id, c.gravedad, eq.nombre, c.evidencia); }); });
    r.casosAgentReady.forEach(function (c) { deEquipo(c.id, c.gravedad, c.equipo, c.evidencia); });
    Object.keys(porId).forEach(function (k) { out.push(porId[k]); });
    var dims = r.casosGrupo.some(function (x) { return x.dimension !== 'area'; }) ? ['tipo', 'proveedor'] : ['area'];
    r.casosGrupo.filter(function (x) { return dims.indexOf(x.dimension) >= 0 && C.casos[x.id]; }).forEach(function (x) {
      var cmp = r.comparaciones.filter(function (c) { return c.dimension === x.dimension && c.ambito === x.ambito; })[0];
      var g = cmp ? cmp.grupos.filter(function (y) { return y.id === x.grupo; })[0] : null;
      var eqs = g ? g.equipos : [x.grupo];
      if (x.id === 'grupo_calidad' && porId.retrabajo && eqs.every(function (e) { return porId.retrabajo.equipos.indexOf(e) >= 0; })) return;
      if (x.id === 'grupo_agent_ready' && porId.backlog_no_listo && eqs.some(function (e) { return porId.backlog_no_listo.equipos.indexOf(e) >= 0; })) return;
      var nombre = g ? g.nombre : x.grupo;
      out.push({ id: x.id, gravedad: x.gravedad, equipos: eqs, grupo: true, para: (eqs.length === 1 && eqs[0] === nombre ? nombre : nombre + ' (' + lista(eqs) + ')'),
        evidencias: [[null, x.evidencia.replace(/ Comparison: [^.]*\.$/, '')]] });
    });
    out.forEach(function (x) { var c = C.casos[x.id]; x.titulo = c.titulo; x.caso = c; x.fuente = 'catalogo'; if (!x.para) x.para = lista(x.equipos); });
    out.sort(function (a, b) { return (a.gravedad === 'critico' ? 0 : 1) - (b.gravedad === 'critico' ? 0 : 1) || (b.grupo ? 1 : 0) - (a.grupo ? 1 : 0) || b.equipos.length - a.equipos.length || a.titulo.localeCompare(b.titulo, 'en'); });
    cacheRecs = { r: App.r, v: out };
    return out;
  }
  // AI recommendations that explain the same case for the same teams as a case-bank one are attached to it, not listed twice
  function recsIa() {
    if (!App.iaRecs || App.iaRecsDe !== App.lectura) return [];
    var cat = recomendaciones();
    cat.forEach(function (c) { c.ia = null; });
    return App.iaRecs.filter(function (x) {
      var mismo = x.causa.caso && cat.filter(function (c) { return c.id === x.causa.caso && !c.ia && x.equipos.some(function (e) { return c.equipos.indexOf(e) >= 0; }); })[0];
      if (mismo) { mismo.ia = x; return false; }
      return true;
    });
  }
  function todasRecs() { var ia = recsIa(); return recomendaciones().concat(ia); }
  function claveRec(x) { return (x.fuente === 'ia' ? 'ia|' : '') + x.id + '|' + x.para; }
  function senales() {
    var n = 0; App.r.modelo.equipos.forEach(function (eq) { var p = problemas(eq); n += p.critico.length + p.atencion.length; });
    var difs = 0; App.r.comparaciones.forEach(function (c) { difs += c.diferencias.length; });
    return { n: n, difs: difs };
  }
  function vistaAnalyze() {
    var catalogo = recomendaciones(), ia = recsIa(), todas = catalogo.concat(ia), s = senales();
    var funcionan = App.r.iniciativas.filter(function (x) { return N.conEfecto(x.evaluacion); });
    var filtro = App.recEquipo && App.recEquipo !== 'todos' ? App.recEquipo : null;
    var recs = filtro ? todas.filter(function (x) { return x.equipos.indexOf(filtro) >= 0; }) : todas;
    var sel = recs.filter(function (x) { return claveRec(x) === App.recSel; })[0] || recs[0];
    var afectados = {}; todas.forEach(function (x) { x.equipos.forEach(function (e) { afectados[e] = 1; }); });
    var nEq = Object.keys(afectados).length, crit = catalogo.filter(function (x) { return x.gravedad === 'critico'; }).length;
    var opciones = '<option value="todos">All teams</option>' + App.r.modelo.equipos.map(function (e) { return '<option value="' + esc(e.nombre) + '"' + (filtro === e.nombre ? ' selected' : '') + '>' + esc(e.nombre) + '</option>'; }).join('');
    var html = titularPaso(2, 'Analyze', 'What stands out, the probable drivers behind it, and what to do first. Every recommendation cites the figure it comes from.',
      '<label class="selector">View <select data-cambio="rec-equipo" aria-label="Team">' + opciones + '</select></label>');
    html += '<section class="senales" aria-label="Signals"><div class="senal"><b>' + s.n + '</b><span>' + plural(s.n, 'figure', 'figures') + ' outside normal</span></div>' +
      '<div class="senal"><b>' + s.difs + '</b><span>' + plural(s.difs, 'difference', 'differences') + ' between groups</span></div>' +
      '<div class="senal"><b>' + catalogo.length + '</b><span>' + plural(catalogo.length, 'recommendation', 'recommendations') + ' from the case bank' + (crit ? ', ' + crit + ' critical' : '') + '</span></div>' +
      '<div class="senal senal-ia"><b>' + (App.iaRecs && App.iaRecsDe === App.lectura ? App.iaRecs.length : 0) + '</b><span>from the AI assistant' + (ia.length !== (App.iaRecs && App.iaRecsDe === App.lectura ? App.iaRecs.length : 0) ? ', ' + ia.length + ' new' : '') + '</span></div></section>';
    html += funcionan.map(function (x) { return '<div class="funciona"><span class="chip chip-bien-fuerte">Works</span><p><b>' + esc(x.iniciativa.nombre) + '.</b> ' + esc(textoIni(x.evaluacion).t) + ' Worth continuing.</p></div>'; }).join('');
    html += panelIa();
    if (!recs.length) {
      html += '<section class="bloque"><h2>' + (filtro ? 'No recommendations for ' + esc(filtro) : 'Nothing calls for action now') + '</h2><p class="nota">' + (filtro ? 'Its figures are within what is normal.' : 'Every figure is within what is normal in each team.') + '</p></section>';
    } else {
      var items = recs.map(function (x) {
        var n = todas.indexOf(x) + 1, k = claveRec(x);
        return '<button class="rec-item" data-accion="rec" data-k="' + esc(k) + '"' + (x === sel ? ' aria-current="true"' : '') + '><span class="rec-n">' + n + '</span>' +
          '<span class="rec-item-txt"><b>' + esc(x.titulo) + '</b><small>' + esc(x.para) + (x.ia ? ' · <span class="ia-ok">AI agrees</span>' : '') + '</small></span>' + (x.fuente === 'ia' ? '<span class="chip chip-ia">AI</span>' : chip(x.gravedad)) + '</button>';
      }).join('');
      html += '<div class="recs-md"><nav class="recs-lista" aria-label="Recommendations">' + items + '</nav>' +
        '<article class="rec rec-detalle" id="rec-detalle" aria-live="polite">' + (sel.fuente === 'ia' ? detalleRecIa(sel, todas.indexOf(sel) + 1) : detalleRec(sel, todas.indexOf(sel) + 1)) + '</article></div>';
      html += '<p class="nota">Recommendations come from the case bank and, with an API key, from the AI assistant, always from your figures. Review them with the team leads before starting.</p>';
    }
    html += bloqueGrupos();
    return html;
  }
  function panelIa() {
    if (!hayIa()) return '<section class="bloque bloque-ia"><div><h2>AI assistant</h2><p class="nota">With an API key the assistant reads the diagnostic package (aggregated figures only, no tickets, no people) and adds recommendations with cited evidence. <button class="btn-txt" data-accion="vista" data-v="settings">Add a key in Settings</button>.</p></div></section>';
    var ia = recsIa(), estado = App.iaEstado;
    var txt = estado === 'working' ? 'Asking the assistant… it reads the package and answers in JSON, then every cited figure is checked against the package.' :
      estado === 'error' ? 'The assistant could not answer: ' + esc(App.iaError || 'unknown error') :
      ia.length ? ia.length + ' ' + plural(ia.length, 'recommendation', 'recommendations') + ' validated' + (App.iaDescartadas ? ', ' + App.iaDescartadas + ' discarded for citing figures that are not in the package' : '') + '. Marked AI in the list.' :
      App.iaRecsDe === App.lectura ? 'The assistant returned nothing that passed validation.' : 'The assistant receives the diagnostic package (aggregated figures, no tickets, no people) and the case bank, and answers with recommendations that cite the figures. Anything that does not match the package is discarded.';
    return '<section class="bloque bloque-ia"><div><h2>AI assistant <span class="nota">' + esc(App.ia.modelo) + '</span></h2><p class="nota">' + txt + '</p></div>' +
      '<div class="cab-acc"><button class="btn" data-accion="ia-recs"' + (estado === 'working' ? ' disabled' : '') + '>' + (ia.length ? 'Ask again' : 'Generate AI recommendations') + '</button><button class="btn-txt" data-accion="paquete">See what it receives</button></div></section>';
  }
  function bloqueGrupos() {
    var c = App.r.comparaciones.filter(function (x) { return x.dimension === 'tipo'; })[0];
    if (!c) return '<section class="bloque"><h2>In-house and vendors</h2><p class="nota">To compare, mark which teams belong to a vendor in <button class="btn-txt" data-accion="editar" data-e="equipos">Measure &gt; Context</button>.</p></section>';
    var g = c.grupos, peor = {}; c.diferencias.forEach(function (d) { peor[d.medida + '|' + d.peor] = 1; });
    var filas = [['plazo_p85', 'Lead time', 'ciclo'], ['retrabajo', 'Rework', 'retrabajo'], ['arrastradas', 'Carried over', 'arrastradas']].filter(function (f) { return c.medidas[f[0]] && c.medidas[f[0]].disponible; });
    if (!filas.length) return '';
    var cg = N.costeDeGrupos(c, cfgCalculo());
    var capac = function (titulo, f, tip) {
      if (!g.some(function (x) { return f(cg[x.id]) != null; })) return '';
      return '<tr class="fila-coste"><th scope="row">' + conTip(titulo, tip) + '</th>' + g.map(function (x) { var v = f(cg[x.id]); return '<td>' + (v != null ? esc(v) : '<span class="apagado">FTE or cost missing</span>') + '</td>'; }).join('') + '</tr>';
    };
    var filasCoste = capac('Deliveries a month per FTE', function (x) { return x.entregasPorFte != null ? n1(x.entregasPorFte) : null; }, 'Tasks finished a month divided by the full-time people (FTE) of the group, over the last 12 weeks.') +
      capac('Cost per delivery', function (x) { return x.costePorEntrega != null ? euros(x.costePorEntrega) : null; }, MED.coste.que);
    return '<section class="bloque" id="grupos"><h2>In-house and vendors, same type and size of task</h2><table class="tabla-grupos"><thead><tr><th scope="col">Measure</th>' + g.map(function (x) { return '<th scope="col">' + esc(x.nombre) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      filas.map(function (f) {
        var seg = c.medidas[f[0]].segmentos[0];
        return '<tr><th scope="row">' + conTip(f[1], MED[f[2]].que) + '</th>' + g.map(function (x) {
          var cel = seg.porGrupo[x.id], v = cel && cel.valor != null ? valor(f[2], cel.valor) : null, mal = peor[f[0] + '|' + x.id];
          return '<td' + (mal ? ' class="peor"' : '') + '>' + (v ? esc(v) + (mal ? ' · worse' : '') : '<span class="apagado">few data</span>') + '</td>';
        }).join('') + '</tr>';
      }).join('') + filasCoste + '</tbody></table><p class="nota">Lead time, rework and carried-over work with the same type and size of task. ' + (filasCoste ? 'Deliveries and cost with everything finished in 12 weeks: they depend on task size. ' : 'With the FTE and cost of each team (in <button class="btn-txt" data-accion="editar" data-e="equipos">Context</button>) deliveries per FTE and cost per delivery appear too. ') + 'It is a question for the meeting, not a ranking.</p></section>';
  }
  function idIniciativa(x) { return 'rec-' + x.id + '-' + slug(x.equipos.join('-')); }
  function registrable(x) { return x.fuente === 'ia' ? !!(x.medida && N.MEDIDAS_INICIATIVA[x.medida] && C.medidas[x.medida]) : !!(x.caso.medida && N.MEDIDAS_INICIATIVA[x.caso.medida] && C.medidas[x.caso.medida]); }
  function hoyTexto() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }
  function registrar(clave) {
    var x = todasRecs().filter(function (r) { return claveRec(r) === clave; })[0];
    if (!x || !registrable(x)) return;
    var ini;
    if (x.fuente === 'ia') {
      var defIa = C.medidas[x.medida];
      ini = { id: idIniciativa(x), nombre: x.titulo + ': ' + lista(x.equipos), descripcion: x.primer_paso || x.accion, fecha_inicio: hoyTexto(), fecha_fin: null,
        equipos: x.equipos.slice(), medidas_objetivo: [{ medida: x.medida, direccion: defIa.dir === 'mas' ? 'subir' : 'bajar' }],
        efecto_esperado: x.comprobar || null, estado: 'planificada', origen: x.causa.caso || null, evaluacion: null, notas: 'Registered from an AI assistant recommendation.' };
    } else {
      var c = x.caso, def = C.medidas[c.medida];
      ini = { id: idIniciativa(x), nombre: c.titulo + ': ' + lista(x.equipos), descripcion: c.plan[0].paso, fecha_inicio: hoyTexto(), fecha_fin: null,
        equipos: x.equipos.slice(), medidas_objetivo: [{ medida: c.medida, direccion: def.dir === 'mas' ? 'subir' : 'bajar' }],
        efecto_esperado: c.comprobar, estado: 'planificada', origen: x.id, evaluacion: null, notas: 'Registered from the recommendations.' };
    }
    App.cfg.iniciativas = (App.cfg.iniciativas || []).filter(function (i) { return i.id !== ini.id; }).concat([ini]);
    guardarCfg();
    escribirEnCarpeta('iniciativas', ini.id + '.json', JSON.stringify(ini, null, 2));
    var y = window.scrollY;
    enSegundoPlano(function () { recalcular(); render(); window.scrollTo(0, y); aviso('Initiative registered. Follow it in Improve and Learn.'); });
  }
  function cifrasRec(x) {
    var c = x.caso, eqs = {}; App.r.modelo.equipos.forEach(function (e) { eqs[e.nombre] = e; });
    var def = c.medida ? C.medidas[c.medida] : null;
    return x.evidencias.map(function (ev) {
      var eq = ev[0] ? eqs[ev[0]] : (x.equipos.length === 1 ? eqs[x.equipos[0]] : null);
      var m = !x.grupo && eq && c.medida ? eq.medidas[c.medida] : null;
      if (!m || !m.disponible || m.valor == null || !def) return '<div class="cifra"><p class="cf-txt">' + (ev[0] && x.evidencias.length > 1 ? '<b>' + esc(ev[0]) + ':</b> ' : '') + esc(ev[1]) + '</p></div>';
      var F = function (v) { return M.formatear(v, def.formato); }, e = estadoDe(m);
      return '<div class="cifra"><div class="cf-fila"><span class="cf-eq">' + esc(eq.nombre) + '</span><span class="cf-med">' + nomMed(c.medida) + '</span><b class="cf-val">' + esc(F(m.valor)) + '</b>' +
        '<span class="cf-normal">' + (m.ref ? 'Normal: ' + esc(F(m.ref.lo)) + ' to ' + esc(F(m.ref.hi)) : '') + '</span>' + chip(e === 'neutro' ? 'sin' : e, true) + '</div><p class="cf-txt">' + esc(ev[1]) + '</p></div>';
    }).join('');
  }
  function bloqueSeguimientoRec(x, def, medida, comprobar) {
    var seg = '';
    if (def) seg += '<p><b>Target measure:</b> ' + nomMed(medida) + ', ' + (def.dir === 'mas' ? 'up' : 'down') + '.</p>';
    if (comprobar) seg += '<p><b>How to know it works:</b> ' + esc(comprobar) + '</p>';
    if (registrable(x)) {
      var id = idIniciativa(x), sx = seguimientos().filter(function (y) { return y.ini.id === id; })[0];
      seg += sx ? '<div class="rec-seg-estado">' + chipSeg(sx.s.estado) + '<span>' + esc(sx.s.texto) + '</span><button class="btn-txt" data-accion="vista" data-v="learn">See the follow-up</button></div>' :
        '<p><button class="btn btn-sec btn-peq" data-accion="registrar" data-k="' + esc(claveRec(x)) + '">Register as an initiative</button></p><p class="nota">From then on it follows itself: each data load recalculates its effect against the teams that do not have it.</p>';
    } else seg += '<p class="nota">Followed in the baseline with its own measure.</p>';
    return seg;
  }
  function detalleRec(x, n) {
    var c = x.caso, def = c.medida ? C.medidas[c.medida] : null, p0 = c.plan[0];
    var plan = c.plan.map(function (s, i) {
      return '<li' + (i ? '' : ' class="primero"') + '><span class="paso-n">' + (i + 1) + '</span><div><b>' + esc(s.paso) + '</b><span class="meta">' +
        '<span>Who: ' + esc(s.quien.toLowerCase()) + '</span><span>Effort: ' + esc(s.esfuerzo.toLowerCase()) + '</span></span></div></li>';
    }).join('');
    return '<div class="rec-cab"><span class="rec-n">' + n + '</span>' + chip(x.gravedad) + '<span class="rec-para">For: ' + esc(x.para) + '</span></div>' +
      '<h2>' + esc(x.titulo) + '</h2>' +
      '<div class="rec-resumen"><div><span class="rr-et">What is happening</span><p>' + esc(c.senal || x.evidencias[0][1]) + '</p></div>' +
      '<div><span class="rr-et">What to do first</span><p><b>' + esc(p0.paso) + '.</b> Who: ' + esc(p0.quien.toLowerCase()) + '. Effort: ' + esc(p0.esfuerzo.toLowerCase()) + '.</p></div></div>' +
      '<section class="rec-bloque"><h3>The figures</h3>' + cifrasRec(x) + '</section>' +
      '<section class="rec-bloque"><h3>Action plan</h3><ol class="rec-plan">' + plan + '</ol></section>' +
      (x.ia ? '<section class="rec-bloque rec-ia-extra"><h3><span class="chip chip-ia">AI assistant</span> agrees, confidence ' + esc(x.ia.confianza) + '</h3><p><b>' + esc(x.ia.primer_paso) + '</b> ' + esc(x.ia.accion) + '</p>' + (x.ia.pregunta ? '<p class="nota">For the meeting: ' + esc(x.ia.pregunta) + '</p>' : '') + '</section>' : '') +
      '<section class="rec-bloque rec-seg"><h3>How it is followed</h3>' + bloqueSeguimientoRec(x, def, c.medida, c.comprobar) + '</section>' +
      '<details data-k="' + esc(claveRec(x)) + '"' + (App.abiertas[claveRec(x)] ? ' open' : '') + '><summary>For the meeting, usual causes and evidence base</summary><div class="rec-mas">' +
      (c.preguntas && c.preguntas.length ? '<div><b>For the meeting</b><ul>' + c.preguntas.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div><b>Usual causes</b><ul>' + c.causas.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div><b>Evidence base</b><p>' + esc(c.respaldo || '') + '</p>' + (c.comun ? '<p>' + esc(c.comun) + '</p>' : '') + '</div></div></details>';
  }
  function detalleRecIa(x, n) {
    var def = x.medida ? C.medidas[x.medida] : null;
    var evid = x.evidencia.map(function (e) {
      var F = function (v) { var d = C.medidas[e.medida]; return d ? M.formatear(v, d.formato) : String(v); };
      return '<div class="cifra"><div class="cf-fila"><span class="cf-eq">' + esc(e.equipo || 'Whole area') + '</span><span class="cf-med">' + nomMed(e.medida) + '</span><b class="cf-val">' + esc(F(e.valor)) + '</b><span class="chip chip-bien">In the package</span></div>' + (e.texto ? '<p class="cf-txt">' + esc(e.texto) + '</p>' : '') + '</div>';
    }).join('');
    var caso = x.causa.caso ? C.casos[x.causa.caso] : null;
    return '<div class="rec-cab"><span class="rec-n">' + n + '</span><span class="chip chip-ia">AI assistant</span><span class="chip chip-sin">Confidence ' + esc(x.confianza) + '</span><span class="rec-para">For: ' + esc(x.para) + '</span></div>' +
      '<h2>' + esc(x.titulo) + '</h2>' +
      '<div class="rec-resumen"><div><span class="rr-et">Probable driver</span><p>' + esc(x.causa.texto || (caso ? caso.senal : '')) + (caso ? ' <span class="nota">(case bank: ' + esc(caso.titulo) + ')</span>' : ' <span class="nota">(new cause, not in the case bank)</span>') + '</p></div>' +
      '<div><span class="rr-et">What to do first</span><p><b>' + esc(x.primer_paso) + '</b></p></div></div>' +
      '<section class="rec-bloque"><h3>The figures it cites</h3>' + evid + '<p class="nota">Every figure was checked against the diagnostic package before showing this recommendation.</p></section>' +
      '<section class="rec-bloque"><h3>Action</h3><p>' + esc(x.accion) + '</p>' + (x.contexto_necesario ? '<p class="nota"><b>Needs context:</b> ' + esc(CATEGORIA_CTX[x.contexto_necesario] || x.contexto_necesario) + ' is empty in Measure &gt; Context, so the assistant kept to what the data supports.</p>' : '') + '</section>' +
      '<section class="rec-bloque rec-seg"><h3>How it is followed</h3>' + bloqueSeguimientoRec(x, def, x.medida, x.comprobar) + '</section>' +
      (x.pregunta ? '<section class="rec-bloque"><h3>For the meeting</h3><p>' + esc(x.pregunta) + '</p></section>' : '');
  }
  // Calls to the AI assistant. Only the package (or the state names) leaves the browser; the key is sent as a header and never stored anywhere else.
  function proveedor() { return N.IA.proveedorAnthropic({ clave: App.ia.clave, modelo: App.ia.modelo || N.IA.MODELO_POR_DEFECTO }); }
  function pedirRecsIa() {
    if (!hayIa() || !App.r || App.iaEstado === 'working') return;
    var problemas = N.comprobarPaquete(App.r.paquete);
    if (problemas.length) { aviso('The package cannot be sent: ' + problemas[0]); return; }
    var lectura = App.lectura;
    App.iaEstado = 'working'; App.iaError = null; render();
    proveedor()(N.IA.peticionRecomendaciones(App.r.paquete, C)).then(function (texto) {
      if (App.lectura !== lectura) return;
      var v = N.IA.validarRecomendaciones(texto, App.r.paquete, C);
      App.iaRecs = v.recomendaciones.map(function (x) { return Object.assign(x, { fuente: 'ia', id: slug(x.titulo).slice(0, 40), para: x.destinatario.tipo === 'area' ? 'Whole area' : lista(x.equipos), gravedad: 'atencion' }); });
      App.iaRecsDe = lectura; App.iaDescartadas = v.descartadas.length; App.iaEstado = 'idle';
      if (v.problemas.length && window.console) console.warn(v.problemas.join('\n'));
      if (v.descartadas.length && window.console) console.info('AI recommendations discarded:', v.descartadas.map(function (d) { return d.motivo; }));
      if (App.iaRecs.length && !todasRecs().some(function (x) { return claveRec(x) === App.recSel; })) App.recSel = claveRec(App.iaRecs[0]);
      render();
    }).catch(function (e) { App.iaEstado = 'error'; App.iaError = e && e.message ? e.message : String(e); render(); });
  }
  function pedirMapeoIa() {
    if (!hayIa() || !App.det || App.iaEstado === 'working') return;
    var estados = App.det.estados.map(function (e) { return { nombre: e.nombre, actuales: e.actuales, propuesta: mapeo()[e.nombre] || e.estado }; });
    App.iaEstado = 'working'; render();
    proveedor()(N.IA.peticionMapeoEstados(estados, C)).then(function (texto) {
      var v = N.IA.validarMapeo(texto, estados, C);
      App.iaEstado = 'idle';
      if (!Object.keys(v.mapeo).length) { aviso('The assistant did not return a usable mapping.' + (v.problemas[0] ? ' ' + v.problemas[0] : '')); render(); return; }
      App.iaMapeo = v;
      if (!v.cambios) { aviso('The assistant agrees with the current mapping.'); render(); return; }
      cambiar(function () { App.cfg.mapeoEstados = Object.assign({}, App.cfg.mapeoEstados || {}, v.mapeo); });
      aviso('The assistant changed ' + v.cambios + ' ' + plural(v.cambios, 'state', 'states') + '. Review the table.');
    }).catch(function (e) { App.iaEstado = 'idle'; aviso('The assistant could not answer: ' + (e && e.message ? e.message : e)); render(); });
  }
  function pedirImpactoIa() {
    if (!hayIa() || !App.r || App.iaEstado === 'working' || !App.r.paquete.iniciativas.length) return;
    var lectura = App.lectura;
    App.iaEstado = 'working'; render();
    proveedor()(N.IA.peticionImpacto(App.r.paquete)).then(function (texto) {
      if (App.lectura !== lectura) return;
      var v = N.IA.validarImpacto(texto, App.r.paquete);
      App.iaImpacto = { lecturas: v.lecturas, descartadas: v.descartadas.length }; App.iaEstado = 'idle';
      if (!v.lecturas.length) aviso('The assistant returned nothing that passed validation.' + (v.problemas[0] ? ' ' + v.problemas[0] : ''));
      render();
    }).catch(function (e) { App.iaEstado = 'idle'; aviso('The assistant could not answer: ' + (e && e.message ? e.message : e)); render(); });
  }
  function probarIa() {
    if (!hayIa()) { aviso('Enter an API key first.'); return; }
    App.iaEstado = 'working'; render();
    proveedor()({ system: 'Answer with the single word OK.', user: 'Connection test.', maxTokens: 5 }).then(function (t) {
      App.iaEstado = 'idle'; App.iaProbada = /ok/i.test(t) ? 'ok' : 'odd'; render(); aviso(App.iaProbada === 'ok' ? 'Connected: the assistant answered.' : 'The assistant answered, but not as expected: ' + t.slice(0, 60));
    }).catch(function (e) { App.iaEstado = 'idle'; App.iaProbada = 'error'; App.iaError = e && e.message ? e.message : String(e); render(); aviso('Connection failed: ' + App.iaError); });
  }

  // ---------- initiatives: automatic follow-up ----------
  function textoIni(ev) {
    var x = ev.resultados[0];
    if (!x || !x.disponible) return { e: 'sin', t: 'Not enough weeks after the start yet.' };
    var fmt = (N.MEDIDAS_INICIATIVA[x.medida] || {}).formato || 'num', F = function (v) { return M.formatear(v, fmt); };
    var t = mayus(NOMBRE_INI[x.medida] || x.medida) + ' from ' + F(x.antes) + ' to ' + F(x.despues) + '. Confidence ' + x.confianza + '.';
    return { e: N.conEfecto(ev) ? 'bien' : 'neutro', t: t };
  }
  var cacheSeg = { r: null, v: null };
  function seguimientos() {
    if (!App.r) return [];
    if (cacheSeg.r === App.r) return cacheSeg.v;
    var v = App.r.iniciativas.map(function (x) { return { ini: x.iniciativa, ev: x.evaluacion, s: N.seguimiento(x.iniciativa, x.evaluacion, App.r.preparacion) }; });
    var orden = { empeora: 0, funciona: 1, sin_efecto: 2, midiendo: 3, planificada: 4, sin_datos: 5 };
    v.sort(function (a, b) { return orden[a.s.estado] - orden[b.s.estado] || a.ini.nombre.localeCompare(b.ini.nombre, 'en'); });
    cacheSeg = { r: App.r, v: v };
    return v;
  }
  var EST_SEG = {
    funciona: ['bien-fuerte', 'Works'], sin_efecto: ['neutro', 'No clear effect'], empeora: ['critico', 'Getting worse'],
    midiendo: ['sin', 'Measuring'], planificada: ['sin', 'Planned'], sin_datos: ['sin', 'No data']
  };
  function chipSeg(e) { var x = EST_SEG[e] || EST_SEG.sin_datos; return '<span class="chip chip-' + x[0] + '">' + x[1] + '</span>'; }
  function fmtSeg(s, v) { return v == null ? 'n/a' : M.formatear(v, s.formato); }
  function evaluada(x) { return x.s.estado === 'funciona' || x.s.estado === 'sin_efecto' || x.s.estado === 'empeora'; }
  function graficoSeg(s) {
    var pts = s.serie.filter(function (p) { return p.iniciativa != null || p.control != null; });
    if (pts.length < 3) return '<p class="nota">Not enough weeks yet to draw the evolution.</p>';
    var vals = []; pts.forEach(function (p) { if (p.iniciativa != null) vals.push(p.iniciativa); if (p.control != null) vals.push(p.control); });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = (mx - mn) || 1;
    mn -= rg * 0.1; mx += rg * 0.1; rg = mx - mn;
    var w = 560, h = 190, iz = 58, de = 8, ar = 14, ab = 22;
    var t0 = pts[0].fecha.getTime(), t1 = pts[pts.length - 1].fecha.getTime(), dt = (t1 - t0) || 1;
    var X = function (d) { return iz + (w - iz - de) * Math.max(0, Math.min(1, (d.getTime() - t0) / dt)); };
    var Y = function (v) { return ar + (h - ar - ab) * (1 - (v - mn) / rg); };
    var linea = function (k) { var a = []; pts.forEach(function (p) { if (p[k] != null) a.push(X(p.fecha).toFixed(1) + ',' + Y(p[k]).toFixed(1)); }); return a.join(' '); };
    var xi = X(s.inicio), xd = X(s.desdeDespues), xc = X(new Date(Math.min(s.completaEl.getTime(), t1)));
    var ult = pts.filter(function (p) { return p.iniciativa != null; }).pop();
    var desc = 'Evolution of ' + nombreMedida(s.medida).toLowerCase() + ': initiative teams against the rest';
    return '<svg class="seg-graf" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(desc) + '">' +
      (s.inicio.getTime() <= t1 ? '<rect class="seg-margen" x="' + xi.toFixed(1) + '" y="' + ar + '" width="' + Math.max(0, xd - xi).toFixed(1) + '" height="' + (h - ar - ab) + '"/>' +
        (xc > xd ? '<rect class="seg-ventana" x="' + xd.toFixed(1) + '" y="' + ar + '" width="' + (xc - xd).toFixed(1) + '" height="' + (h - ar - ab) + '"/>' : '') +
        '<line class="seg-inicio" x1="' + xi.toFixed(1) + '" x2="' + xi.toFixed(1) + '" y1="' + (ar - 6) + '" y2="' + (h - ab) + '"/><text class="seg-et" x="' + (xi + 4).toFixed(1) + '" y="' + (ar + 4) + '">Start</text>' : '') +
      '<polyline class="seg-resto" points="' + linea('control') + '"/><polyline class="seg-ini" points="' + linea('iniciativa') + '"/>' +
      (ult ? '<circle class="seg-punto" cx="' + X(ult.fecha).toFixed(1) + '" cy="' + Y(ult.iniciativa).toFixed(1) + '" r="5"/>' : '') +
      '<text class="seg-eje" x="0" y="' + (ar + 4) + '">' + esc(fmtSeg(s, mx)) + '</text><text class="seg-eje" x="0" y="' + (h - ab) + '">' + esc(fmtSeg(s, mn)) + '</text>' +
      '<text class="seg-eje" x="' + iz + '" y="' + (h - 6) + '">' + esc(fechaCorta(pts[0].fecha)) + '</text><text class="seg-eje" x="' + (w - de) + '" y="' + (h - 6) + '" text-anchor="end">' + esc(fechaCorta(pts[pts.length - 1].fecha)) + '</text>' +
      '</svg><p class="seg-leyenda"><span class="sl sl-ini"></span>Initiative teams <span class="sl sl-resto"></span>Other teams <span class="sl sl-margen"></span>Two weeks of margin <span class="sl sl-ventana"></span>Window evaluated</p>';
  }
  function cifrasSeg(s) {
    var celda = function (et, v, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + et + '</span><b>' + esc(fmtSeg(s, v)) + '</b></div>'; };
    if (s.antes != null && s.despues != null) {
      return '<div class="seg-cifras">' + celda('Before', s.antes) + '<span class="seg-fl" aria-hidden="true">→</span>' + celda('After', s.despues) +
        (s.control && s.control.despues != null ? celda('Others, after', s.control.despues, 'seg-ctrl') : '') + '</div>';
    }
    var ult = s.serie.filter(function (p) { return p.iniciativa != null; }).pop();
    if (!ult) return '';
    return '<div class="seg-cifras">' + celda('Now in these teams', ult.iniciativa) + (ult.control != null ? celda('Now in the others', ult.control, 'seg-ctrl') : '') + '</div>';
  }
  function resultadoEval(x) {
    var r = (x.ev.resultados || []).filter(function (y) { return y.medida === x.s.medida; })[0] || x.ev.resultados[0];
    return r && r.disponible && r.ventanas && r.antes != null && r.despues != null ? r : null;
  }
  function fmtDif(s, v) {
    if (v == null) return 'n/a';
    var signo = v > 0.0000001 ? '+' : v < -0.0000001 ? '−' : '', a = Math.abs(v);
    if (s.formato === 'pct') { var p = Math.round(a * 100); return signo + p + ' ' + plural(p, 'point', 'points'); }
    return signo + M.formatear(a, s.formato);
  }
  function lineaEval(r, foco) {
    var v = r.ventanas, dia = 864e5, menos1 = function (d) { return new Date(d.getTime() - dia); };
    var ant = (v.antes.hasta - v.antes.desde) / dia, mar = (v.despues.desde - v.antes.hasta) / dia, des = Math.max((v.despues.hasta - v.despues.desde) / dia, 7);
    var seg = function (cls, dias, et, sub) { return '<div class="v-tl-seg v-tl-' + cls + (foco === cls ? ' on' : '') + '" style="flex:' + dias + '"><b>' + et + '</b><small>' + sub + '</small></div>'; };
    return '<div class="v-tl pe" style="--d:1">' + seg('antes', ant, 'Before', fechaCorta(v.antes.desde) + ' to ' + fechaCorta(menos1(v.antes.hasta))) +
      seg('margen', mar, 'Margin', 'not counted') + seg('despues', des, 'After', fechaCorta(v.despues.desde) + ' to ' + fechaCorta(menos1(v.despues.hasta))) + '</div>';
  }
  function detalleEval(x) {
    var s = x.s, ini = x.ini, r = resultadoEval(x), F = function (v) { return fmtSeg(s, v); }, D = function (v) { return fmtDif(s, v); };
    if (s.formato === 'pct') {
      var dec = function (v) { return (Math.round(v * 1000) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
      F = function (v) { return v == null ? 'n/a' : dec(v) + '%'; };
      D = function (v) { return v == null ? 'n/a' : (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '') + dec(Math.abs(v)) + ' points'; };
    }
    var nom = nombreMedida(s.medida).toLowerCase(), eqs = lista(ini.equipos), m = r.muestra || { antes: 0, despues: 0, controlAntes: 0, controlDespues: 0 };
    var W = Math.round((r.ventanas.antes.hasta - r.ventanas.antes.desde) / (7 * 864e5));
    var hayCtrl = !!(r.control && r.control.antes != null && r.control.despues != null);
    var cambio = r.despues - r.antes, cambioCtrl = hayCtrl ? r.control.despues - r.control.antes : 0;
    var tareas = function (n) { return miles(n) + ' ' + plural(n, 'task finished', 'tasks finished'); };
    var fila = function (et, a, d, n, cls) {
      return '<div class="v-fila' + (cls ? ' ' + cls : '') + '"><span>' + et + '<small>' + n + '</small></span><b>' + F(a) + '</b><i aria-hidden="true">→</i><b>' + F(d) + '</b><em>' + D(d - a) + '</em></div>';
    };
    var veces = r.ruido ? Math.abs(r.efecto) / r.ruido : null, nMin = Math.min(m.antes, m.despues);
    var check = function (ok, titulo, sub) {
      return '<div class="v-check"><span class="v-ico ' + (ok ? 'ok' : 'aviso') + '" aria-hidden="true">' + (ok ? CHECK : '!') + '</span><div><b>' + titulo + '</b><span>' + sub + '</span></div></div>';
    };
    var paso = function (n, titulo, texto, visual) { return '<li class="ev-paso"><div class="ev-cab"><span class="paso-n">' + n + '</span><div><b>' + titulo + '</b><p>' + texto + '</p></div></div><div class="ev-visual">' + visual + '</div></li>'; };
    return '<ol class="ev-pasos">' +
      paso(1, 'Before the start', esc(mayus(nom)) + ' of ' + esc(eqs) + ' in the ' + W + ' weeks before the start, on ' + esc(fechaCorta(s.inicio)) + '.',
        lineaEval(r, 'antes') + '<div class="v-filas"><div class="v-fila"><span>' + esc(eqs) + '<small>' + tareas(m.antes) + '</small></span><b>' + F(r.antes) + '</b></div></div>') +
      paso(2, 'Two weeks of margin', 'A change takes time to show. From ' + esc(fechaCorta(s.inicio)) + ' to ' + esc(fechaCorta(s.desdeDespues)) + ' nothing counts, for better or worse.', lineaEval(r, 'margen')) +
      paso(3, 'After', 'The same measure in the ' + W + ' following weeks' + (r.ventanas.completa ? '.' : ', not complete yet.'),
        lineaEval(r, 'despues') + '<div class="v-filas">' + fila(esc(eqs), r.antes, r.despues, tareas(m.despues) + ' after', '') + '</div>') +
      paso(4, 'The other teams', 'In the same weeks, did the others change too? This discounts what affects everyone, like holidays or peaks.',
        '<div class="v-filas">' + fila(esc(eqs), r.antes, r.despues, 'initiative teams', '') +
        (hayCtrl ? fila('The other teams', r.control.antes, r.control.despues, tareas(m.controlDespues) + ' after', 'v-fila-ctrl') : '<p class="v-mas">There are no other teams to compare with.</p>') + '</div>') +
      paso(5, 'Own effect', 'The change in the initiative teams minus the change in the others over the same weeks. ' + (r.enDireccionEsperada ? 'It goes in the expected direction.' : 'It goes against the expected direction.'),
        '<div class="v-ecu"><span>' + D(cambio) + '<small>the initiative</small></span><i aria-hidden="true">−</i><span>' + (cambioCtrl < 0 ? '(' + D(cambioCtrl) + ')' : D(cambioCtrl)) + '<small>the others</small></span><i aria-hidden="true">=</i><span class="v-ecu-res">' + D(r.efecto) + '<small>own effect</small></span></div>') +
      paso(6, 'Confidence ' + esc(r.confianza || 'low'), 'The effect is compared with how much ' + esc(nom) + ' varies on its own in these teams, and with how many tasks are behind it.',
        '<div class="v-checks">' +
        check(veces != null && veces >= 1, veces != null ? 'The effect is ' + (Math.round(veces * 10) / 10).toLocaleString('en-GB') + ' times the natural variation' : 'No history to know the natural variation', veces != null ? 'It varies about ' + D(r.ruido).replace(/^\+/, '') + ' on its own. High confidence from twice that.' : 'Several windows before the start are needed.') +
        check(nMin >= 10, miles(nMin) + ' ' + plural(nMin, 'task', 'tasks') + ' in the smallest window', 'Medium from 10 tasks; high from 20.') +
        check(r.ventanas.completa, r.ventanas.completa ? 'After window complete' : 'After window still incomplete', r.ventanas.completa ? 'The ' + W + ' weeks already have data.' : 'Complete on ' + esc(fechaCorta(s.completaEl)) + '.') + '</div>') +
      '</ol><p class="nota">Not a controlled experiment: it says whether it is worth continuing, not what caused it.</p>';
  }
  function fichaIni(ini, caso) {
    var desdeRec = caso && caso.plan && caso.plan.length && ini.descripcion === caso.plan[0].paso;
    var hace = desdeRec ? '<ol>' + caso.plan.map(function (p) { return '<li>' + esc(p.paso) + '</li>'; }).join('') + '</ol>' : '<p>' + esc(ini.descripcion || 'No description.') + '</p>';
    var parte = function (et, html) { return html ? '<div><h3 class="seg-h3">' + et + '</h3>' + html + '</div>' : ''; };
    return '<div class="seg-ficha">' + parte('What it is', hace) + parte('Why', caso && caso.senal ? '<p>' + esc(caso.senal) + '</p>' : '') +
      parte('What is expected', ini.efecto_esperado ? '<p>' + esc(ini.efecto_esperado) + '</p>' : '') + '</div>';
  }
  function propiaIni(id) { return (App.cfg.iniciativas || []).some(function (i) { return i.id === id; }); }
  function origenIni(ini, caso) { return caso ? ', from the recommendation "' + esc(caso.titulo) + '"' : (propiaIni(ini.id) ? ', registered on this page' : ', from the iniciativas folder'); }
  // Improve: the plan card (what, who, when, target); Learn: the evaluation card (figures, chart, how it was evaluated)
  function tarjetaPlan(x) {
    var s = x.s, ini = x.ini, caso = C.casos[ini.origen];
    var dato = function (et, v) { return '<div><dt>' + et + '</dt><dd>' + v + '</dd></div>'; };
    return '<article class="seg seg-plan" data-ini="' + esc(ini.id) + '">' +
      '<header class="seg-cab"><div><h2>' + esc(ini.nombre) + '</h2><p>' + esc(lista(ini.equipos)) + origenIni(ini, caso) + '</p></div><div class="seg-cab-acc">' + chipSeg(s.estado) +
      (propiaIni(ini.id) ? '<button class="btn-txt" data-accion="quitar-ini" data-i="' + esc(ini.id) + '">Remove</button>' : '') + '</div></header>' +
      fichaIni(ini, caso) +
      '<dl class="seg-dl seg-dl-4">' + dato('Target measure', nomMed(s.medida) + ', ' + (s.direccion === 'subir' ? 'up' : s.direccion === 'bajar' ? 'down' : esc(s.direccion))) + dato('Start', esc(fechaCorta(s.inicio))) +
      dato('Measured from', esc(fechaCorta(s.desdeDespues))) + dato('Evaluation complete', esc(fechaCorta(s.completaEl))) + '</dl></article>';
  }
  function tarjetaSeg(x) {
    var s = x.s, ini = x.ini, caso = C.casos[ini.origen];
    var progreso = s.estado === 'planificada' ? 0 : s.progreso;
    var k = 'ev|' + ini.id, lecturaIa = App.iaImpacto ? App.iaImpacto.lecturas.filter(function (l) { return l.id === ini.id; })[0] : null;
    return '<article class="seg" data-ini="' + esc(ini.id) + '">' +
      '<header class="seg-cab"><div><h2>' + esc(ini.nombre) + '</h2><p>' + esc(lista(ini.equipos)) + origenIni(ini, caso) + '</p></div><div class="seg-cab-acc">' + chipSeg(s.estado) + '</div></header>' +
      '<div class="seg-cuerpo"><div class="seg-datos"><h3 class="seg-h3">How it is going</h3><p class="seg-texto">' + esc(s.texto) + '</p>' +
      cifrasSeg(s) +
      (lecturaIa ? '<div class="ia-lectura"><span class="chip chip-ia">AI reading</span><p>' + esc(lecturaIa.lectura) + '</p></div>' : '') +
      '<dl class="seg-dl">' + '<div><dt>Target measure</dt><dd>' + nomMed(s.medida) + ', ' + (s.direccion === 'subir' ? 'up' : s.direccion === 'bajar' ? 'down' : esc(s.direccion)) + '</dd></div><div><dt>Start</dt><dd>' + esc(fechaCorta(s.inicio)) + '</dd></div>' +
      '<div><dt>Measured from</dt><dd>' + esc(fechaCorta(s.desdeDespues)) + '</dd></div><div><dt>Evaluation complete</dt><dd>' + esc(fechaCorta(s.completaEl)) + '</dd></div>' + (s.confianza ? '<div><dt>Confidence</dt><dd>' + esc(s.confianza) + '</dd></div>' : '') + '</dl>' +
      '<div class="seg-prog" role="progressbar" aria-label="Window evaluated" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(progreso * 100) + '"><span style="transform:scaleX(' + progreso.toFixed(3) + ')"></span></div>' +
      '<p class="nota">' + (s.completa ? 'Evaluation window complete.' : Math.round(progreso * 100) + '% of the evaluation window has data.') + '</p></div>' +
      '<div class="seg-grafico">' + graficoSeg(s) + '</div></div>' +
      (resultadoEval(x) ? '<details class="seg-eval" data-k="' + esc(k) + '"' + (App.abiertas[k] ? ' open' : '') + '><summary>How it was evaluated</summary>' + detalleEval(x) + '</details>' : '') +
      '</article>';
  }
  function formularioIni() {
    var eqs = App.r.modelo.equipos.map(function (e) { return e.nombre; });
    var medidas = Object.keys(N.MEDIDAS_INICIATIVA).filter(function (id) { return C.medidas[id]; });
    var hoy = hoyTexto();
    return '<form class="bloque form-ini" id="form-ini" data-accion-form="guardar-ini"><h2>New initiative</h2>' +
      '<p class="nota">A change tried in one or more teams, with a target measure. From the moment it is registered, each data load recalculates its effect against the teams that do not have it.</p>' +
      '<div class="form-grid">' +
      '<label class="campo-linea">Name <input type="text" name="nombre" required maxlength="120" placeholder="For example, work-in-progress limit in Payments"></label>' +
      '<label class="campo-linea">Start date <input type="date" name="fecha_inicio" required value="' + hoy + '"></label>' +
      '<label class="campo-linea">End date (optional) <input type="date" name="fecha_fin"></label>' +
      '<label class="campo-linea">Target measure <select name="medida">' + medidas.map(function (id) { var d = C.medidas[id]; return '<option value="' + esc(id) + '">' + esc(nombreMedida(id)) + ' (' + (d.dir === 'mas' ? 'up' : 'down') + ')</option>'; }).join('') + '</select></label>' +
      '<label class="campo-linea form-ancho">What it is <textarea name="descripcion" rows="2" maxlength="600" placeholder="What changes and who does it"></textarea></label>' +
      '<label class="campo-linea form-ancho">What is expected <input type="text" name="efecto_esperado" maxlength="300" placeholder="For example, lead time back to normal within eight weeks"></label>' +
      '<fieldset class="form-ancho form-eqs"><legend>Teams</legend>' + eqs.map(function (e) { return '<label><input type="checkbox" name="equipos" value="' + esc(e) + '"> ' + esc(e) + '</label>'; }).join('') + '</fieldset>' +
      '</div><p class="botones"><button type="submit" class="btn">Register the initiative</button><button type="button" class="btn btn-sec" data-accion="cancelar-ini">Cancel</button></p></form>';
  }
  function guardarIni(form) {
    var d = function (n) { var el = form.elements[n]; return el ? String(el.value || '').trim() : ''; };
    var equipos = [].map.call(form.querySelectorAll('input[name="equipos"]:checked'), function (c) { return c.value; });
    if (!d('nombre')) { aviso('Give the initiative a name.'); return; }
    if (!equipos.length) { aviso('Choose at least one team.'); return; }
    if (!d('fecha_inicio')) { aviso('Set the start date.'); return; }
    var medida = d('medida'), def = C.medidas[medida];
    if (!def) { aviso('Choose the target measure.'); return; }
    var ini = {
      id: 'ini-' + slug(d('nombre')).slice(0, 40) + '-' + d('fecha_inicio'), nombre: d('nombre'), descripcion: d('descripcion') || null, fecha_inicio: d('fecha_inicio'), fecha_fin: d('fecha_fin') || null,
      equipos: equipos, medidas_objetivo: [{ medida: medida, direccion: def.dir === 'mas' ? 'subir' : 'bajar' }],
      efecto_esperado: d('efecto_esperado') || null, estado: 'planificada', origen: null, evaluacion: null, notas: 'Registered on the page.'
    };
    if (ini.fecha_fin && ini.fecha_fin < ini.fecha_inicio) { aviso('The end date cannot be before the start.'); return; }
    App.cfg.iniciativas = (App.cfg.iniciativas || []).filter(function (i) { return i.id !== ini.id; }).concat([ini]);
    guardarCfg();
    escribirEnCarpeta('iniciativas', ini.id + '.json', JSON.stringify(ini, null, 2));
    App.nuevaIni = false;
    enSegundoPlano(function () { recalcular(); render(); window.scrollTo(0, 0); aviso('Initiative registered. It is measured on its own with each data load.'); });
  }
  function quitarIni(id) {
    var ini = (App.cfg.iniciativas || []).filter(function (i) { return i.id === id; })[0];
    if (!ini) return;
    if (!window.confirm('Remove the initiative "' + ini.nombre + '"? It will no longer be measured. If it is in the iniciativas folder, delete its file too.')) return;
    App.cfg.iniciativas = App.cfg.iniciativas.filter(function (i) { return i.id !== id; });
    guardarCfg();
    enSegundoPlano(function () { recalcular(); render(); aviso('Initiative removed.'); });
  }
  function guardarSeguimiento() {
    if (!App.carpeta || !App.r || !App.r.iniciativas.length) return;
    var foto = seguimientos().map(function (x) { return { id: x.ini.id, nombre: x.ini.nombre, estado: x.s.estado, texto: x.s.texto, antes: x.s.antes, despues: x.s.despues, confianza: x.s.confianza, progreso: x.s.progreso }; });
    escribirEnCarpeta('historico', 'iniciativas-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ fecha: new Date().toISOString(), iniciativas: foto }, null, 1));
  }

  // ---------- step 3: Improve and standardize ----------
  function vistaImprove() {
    var v = seguimientos(), recs = todasRecs().filter(registrable);
    var noReg = recs.filter(function (x) { return !v.some(function (y) { return y.ini.id === idIniciativa(x); }); });
    var html = titularPaso(3, 'Improve and standardize', 'Turn a recommendation into an initiative with a target measure, and keep the same definitions and states for every team.',
      App.nuevaIni ? '' : '<button class="btn" data-accion="nueva-ini">New initiative</button>');
    if (App.nuevaIni) html += formularioIni();
    html += '<section class="bloque" id="plan"><div class="bloque-cab"><h2>Action plan: ' + (v.length ? v.length + ' ' + plural(v.length, 'initiative', 'initiatives') : 'no initiatives yet') + '</h2></div>' +
      (v.length ? '' : '<p class="nota">An initiative is a change tried in one or more teams, with a target measure. Register one from a recommendation, with New initiative, or by dropping a file in the iniciativas folder.</p>') +
      (noReg.length ? '<div class="pendientes"><b>Ready to register from the recommendations:</b> ' + noReg.slice(0, 4).map(function (x) { return '<button class="btn btn-sec btn-peq" data-accion="registrar" data-k="' + esc(claveRec(x)) + '">' + esc(x.titulo) + ' (' + esc(x.para) + ')</button>'; }).join('') + '</div>' : '') +
      '</section>';
    html += v.map(tarjetaPlan).join('');
    html += bloqueEstandar();
    return html;
  }
  function bloqueEstandar() {
    var det = App.det, mp = mapeo(), E = C.estados.estados, n = det.estados.length;
    var comunes = {}; det.estados.forEach(function (e) { comunes[mp[e.nombre] || e.estado] = 1; });
    var fijados = Object.keys(App.cfg.mapeoEstados || {}).length;
    return '<section class="bloque" id="estandar"><h2>The same rules for every team</h2><div class="estandar-grid">' +
      '<div><b>Five measures, one definition each</b><p>' + COLUMNAS.map(function (id) { return MED[id].nombre; }).join(', ') + '. Each one compared with the same team\'s own history.</p></div>' +
      '<div><b>' + n + ' tool ' + plural(n, 'state', 'states') + ' mapped to ' + Object.keys(comunes).length + ' common states</b><p>' + Object.keys(comunes).map(function (k) { return E[k].nombre; }).join(', ') + '. ' + (fijados ? fijados + ' confirmed by hand.' : 'All proposed from the state names.') + ' <button class="btn-txt" data-accion="editar" data-e="estados">Review</button></p></div>' +
      '<div><b>One KPI catalogue to sign off</b><p>Team field, teams, states and measures, in a document the client signs. <button class="btn-txt" data-accion="definiciones" data-f="docx">Download (Word)</button></p></div>' +
      '<div><b>One measurement model for any tool</b><p>The definitions as JSON, so another platform or data team measures the same. <button class="btn-txt" data-accion="modelo">Download the model</button></p></div>' +
      '</div></section>';
  }

  // ---------- step 4: Learn and evolve ----------
  function vistaLearn() {
    var v = seguimientos(), con = v.filter(function (x) { return x.s.estado !== 'planificada' && x.s.estado !== 'sin_datos'; });
    var cuenta = {}; v.forEach(function (x) { cuenta[x.s.estado] = (cuenta[x.s.estado] || 0) + 1; });
    var hasta = new Date(App.r.modelo.semanaFin.getTime() - 864e5);
    var html = titularPaso(4, 'Learn and evolve', 'Each initiative is measured on its own with every data load: before, after and against the teams that do not have it. What works stays; what does not is dropped; the baseline moves on.',
      (v.length ? '<div class="seg-resumen">' + ['funciona', 'sin_efecto', 'empeora', 'midiendo', 'planificada'].filter(function (k) { return cuenta[k]; }).map(function (k) { return '<span>' + chipSeg(k) + ' ' + cuenta[k] + '</span>'; }).join('') + '</div>' : ''));
    if (!con.length) {
      html += '<section class="bloque estrecho"><h2>' + (v.length ? 'Nothing measured yet' : 'No initiatives yet') + '</h2><p>' + (v.length ? 'The initiatives are planned but their first reading has not arrived. It comes two weeks after the start, with the next data load.' : 'Register an initiative in Improve and come back after the next data loads.') + '</p>' +
        '<p class="botones"><button class="btn btn-sec" data-accion="vista" data-v="improve">Go to Improve</button></p></section>';
    } else {
      html += panelImpactoIa(con);
      html += con.map(tarjetaSeg).join('');
      html += '<p class="nota">How it is evaluated: the measure in the weeks before the start against the same weeks after, leaving two weeks of margin, and the change in the initiative teams against the change in the rest. Each card details it with its figures in "How it was evaluated".</p>';
    }
    html += '<section class="bloque" id="ciclo"><h2>Next cycle</h2><div class="ciclo-grid">' +
      '<div><b>Data up to ' + esc(fechaCorta(hasta)) + '</b><p>' + (App.carpeta ? 'Drop the new export in the exports folder and press Update.' : 'Load the new export, or choose a folder once and press Update every week.') + '</p><button class="btn btn-peq" data-accion="actualizar">Update</button></div>' +
      '<div><b>Weekly</b><p>Team leads review their baseline and the open recommendations.</p></div>' +
      '<div><b>Monthly</b><p>Cross-team review: initiatives that work, new recommendations, standards to extend.</p></div>' +
      '<div><b>Quarterly</b><p>Re-baseline: the improved teams set the new normal, and the roadmap is refreshed.</p></div></div></section>';
    return html;
  }
  function panelImpactoIa(con) {
    if (!hayIa()) return '';
    var estado = App.iaEstado, hay = App.iaImpacto && App.iaImpacto.lecturas.length;
    var txt = estado === 'working' ? 'Asking the assistant to read the evaluations…' : hay ? App.iaImpacto.lecturas.length + ' ' + plural(App.iaImpacto.lecturas.length, 'reading', 'readings') + ' validated: every number in them is in the evaluation.' + (App.iaImpacto.descartadas ? ' ' + App.iaImpacto.descartadas + ' discarded.' : '') : 'The assistant reads the evaluation figures and writes a short reading per initiative. Numbers that are not in the evaluation are rejected.';
    return '<section class="bloque bloque-ia"><div><h2>AI reading of the results</h2><p class="nota">' + txt + '</p></div><div class="cab-acc"><button class="btn" data-accion="ia-impacto"' + (estado === 'working' ? ' disabled' : '') + '>' + (hay ? 'Ask again' : 'Read the results with AI') + '</button></div></section>';
  }

  // ---------- settings ----------
  function vistaSettings() {
    var ia = App.ia, probada = App.iaProbada;
    var html = '<section class="titular"><div><h1>Settings</h1><p>Client name, the AI assistant and what is live in this copy.</p></div></section>';
    html += '<section class="bloque" id="ajuste-cliente"><h2>Client</h2>' +
      '<label class="campo-linea">Client name <input type="text" data-cambio="nombre" value="' + esc(App.cfg.nombre || '') + '" placeholder="For example, Sample Bank"></label>' +
      '<p class="nota">Teams, vendors, FTE, cost and states are set in <button class="btn-txt" data-accion="medir-sec" data-s="context">Measure &gt; Context</button>.</p></section>';
    html += '<section class="bloque" id="ajuste-ia"><h2>AI assistant</h2>' +
      '<p class="nota">The assistant only receives the diagnostic package (aggregated figures per team, cases, comparisons, initiatives, context summaries), never tickets, titles or people. The key is sent as a header on each call and stays in this browser: for this session, or on this device if you ask. It is never written to cliente.json or any file.</p>' +
      '<div class="form-grid ia-grid">' +
      '<label class="campo-linea">Provider <select data-cambio="ia-proveedor"><option value="anthropic" selected>Claude (Anthropic API)</option></select></label>' +
      '<label class="campo-linea">Model <input type="text" data-cambio="ia-modelo" value="' + esc(ia.modelo || N.IA.MODELO_POR_DEFECTO) + '" placeholder="' + esc(N.IA.MODELO_POR_DEFECTO) + '"></label>' +
      '<label class="campo-linea form-ancho">API key <input type="password" data-cambio="ia-clave" value="' + esc(ia.clave || '') + '" autocomplete="off" placeholder="sk-ant-…"></label>' +
      '<label class="campo-check form-ancho"><input type="checkbox" data-cambio="ia-recordar"' + (ia.recordar ? ' checked' : '') + '> Remember the key on this device (otherwise it is forgotten when the tab closes)</label>' +
      '</div><p class="botones"><button class="btn btn-sec" data-accion="ia-probar"' + (App.iaEstado === 'working' ? ' disabled' : '') + '>Test the connection</button>' + (hayIa() ? '<button class="btn btn-sec" data-accion="ia-olvidar">Forget the key</button>' : '') +
      (probada === 'ok' ? '<span class="chip chip-bien">Connected</span>' : probada === 'error' ? '<span class="chip chip-critico">Failed</span>' : '') + '</p>' +
      '<p class="nota">Where it is used: Measure &gt; Context (check the state mapping), Analyze (recommendations with cited evidence) and Learn (reading of the results). Without a key everything else works the same, with the case bank.</p></section>';
    html += '<section class="bloque" id="ajuste-vivo"><h2>What is live in this copy</h2><ul class="vivo">' +
      '<li><span class="chip chip-bien">Live</span> Jira CSV export and shared folder, with your real data.</li>' +
      '<li><span class="chip chip-bien">Live</span> Measures, data checks, recommendations from the case bank, initiatives and their evaluation, documents.</li>' +
      '<li><span class="chip ' + (hayIa() ? 'chip-bien">Live' : 'chip-sin">Needs a key') + '</span> AI assistant on the diagnostic package.</li>' +
      '<li><span class="chip chip-atencion">Demo</span> Connectors for Azure DevOps, ServiceNow, GitLab and GitHub: they load the sample data. Their adapters are on the roadmap.</li>' +
      '<li><span class="chip chip-atencion">Roadmap</span> Direct API connection to Jira and change history (reopenings, sprint commitments).</li></ul></section>';
    html += '<section class="bloque" id="ajuste-exportar"><h2>Exports</h2><p class="nota">The diagnostic package carries only aggregated figures, no titles, no ticket keys, no people. It is what the AI assistant receives and what the consultant takes to the office.</p>' +
      '<p class="botones"><button class="btn btn-sec" data-accion="paquete">Export the diagnostic package</button><button class="btn btn-sec" data-accion="definiciones" data-f="docx">KPI catalogue (Word)</button><button class="btn btn-sec" data-accion="modelo">Measurement model (JSON)</button></p></section>';
    html += '<section class="bloque" id="ajuste-datos"><h2>Sample data</h2><p class="nota">' + (App.demo ? 'You are viewing the sample data. Nothing you change here is saved.' : 'To see the page with a fictional bank without touching your data: <button class="btn-txt" data-accion="demo">load the sample data</button>. To go over how it works: <button class="btn-txt" data-accion="tutorial">take the tutorial</button>.') + '</p></section>';
    return html;
  }

  // ---------- documents ----------
  function slug(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function definiciones(formato) {
    var doc;
    try { doc = N.definiciones(App.lectura, clienteDe(App.r.modelo), { config: cfgCalculo(), det: App.det, modelo: App.r.modelo, generado: new Date() }); }
    catch (e) { if (window.console) console.error(e); aviso('The document could not be generated.'); return; }
    var nombre = 'kpi-catalogue-' + (slug(App.cfg.nombre) || 'client') + '-' + new Date().toISOString().slice(0, 10) + (formato === 'docx' ? '.docx' : '.md');
    var datos = formato === 'docx' ? N.aDocx(doc, new Date()) : N.aMarkdown(doc);
    var tipo = formato === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/markdown;charset=utf-8';
    escribirEnCarpeta('configuracion', nombre, datos).then(function (ok) { if (ok) aviso('Document saved in the configuracion folder.'); else descargar(nombre, datos, tipo); });
  }
  function paquete() {
    var p = App.r.paquete, problemas = N.comprobarPaquete(p);
    if (problemas.length) { aviso('Not exported: ' + problemas[0]); return; }
    var nombre = 'diagnostic-package-' + new Date().toISOString().slice(0, 10) + '.json', texto = JSON.stringify(p, null, 1);
    escribirEnCarpeta('diagnostico', nombre, texto).then(function (ok) { if (ok) aviso('Package saved in the diagnostico folder.'); else descargar(nombre, texto); });
  }
  function descargarModelo() {
    var m = N.modeloDeMedida({ generado: new Date() }), nombre = 'measurement-model.json', texto = JSON.stringify(m, null, 2);
    escribirEnCarpeta('configuracion', nombre, texto).then(function (ok) { if (ok) aviso('Model saved in the configuracion folder.'); else descargar(nombre, texto); });
  }

  // ---------- the loading method, animated (proceso.js) ----------
  // The stages are the real ones the page runs on the export; the animation shows them with the real figures.
  function cuenta(n, formato) { return '<b data-cuenta="' + n + '"' + (formato ? ' data-formato="' + formato + '"' : '') + '>' + miles(n) + '</b>'; }
  function recortar(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; }
  function vfila(etiqueta, n, clase, d) {
    return '<div class="v-fila pe ' + (clase || '') + '" style="--d:' + d + '"><span>' + etiqueta + '</span><b><i data-cuenta="' + n + '">' + miles(n) + '</i></b></div>';
  }
  function matriz() {
    var eqs = App.r.modelo.equipos.slice(0, 8);
    var cab = '<span></span>' + COLUMNAS.map(function (id) { return '<span class="h">' + esc(MED[id].nombre) + '</span>'; }).join('');
    var filas = eqs.map(function (eq, k) {
      return '<span class="eq pe" style="--d:' + (k + 2) + '">' + esc(eq.nombre) + '</span>' + COLUMNAS.map(function (id) {
        var m = eq.medidas[id], e = estadoDe(m);
        var v = m && m.disponible ? cifra(id, m.valor).g : '';
        return '<span class="v-celda pe ' + e + '" style="--d:' + (k + 2) + '" title="' + esc(eq.nombre + ', ' + MED[id].nombre + ': ' + (ESTADO[e] || 'normal')) + '">' + esc(v) + '</span>';
      }).join('');
    }).join('');
    return '<div class="v-matriz">' + cab + filas + '</div><p class="v-leyenda pe" style="--d:9"><span class="v-l bien"></span>Good <span class="v-l atencion"></span>Attention <span class="v-l critico"></span>Critical <span class="v-l sin"></span>No data</p>';
  }
  function segundos(ms) { var s = Math.max(0.1, Math.round(ms / 100) / 10); return s.toLocaleString('en-GB') + ' ' + (s === 1 ? 'second' : 'seconds'); }
  function configCarga(simulada) {
    var f = simulada ? FUENTES[simulada] : null, r = App.r, inf = App.lectura.informe, det = App.det, eqs = r.modelo.equipos, op = opcion(campo());
    var E = C.estados.estados, mp = mapeo(), info = App.cfg.equiposInfo || {};
    var hasta = new Date(Math.min(det.fechaRef, det.fechaMax));
    var origen = f ? f.nombre : 'Jira';
    var valores = op && op.id !== 'todos' ? op.valores : [];
    var tareasDe = function (nombre) { var v = valores.filter(function (x) { return x.valor === nombre; })[0]; return v ? v.n : null; };
    var campoTxt = f ? f.equipo.toLowerCase() : (op ? (op.id === 'todos' ? '' : op.nombre.replace(/^campo\s+/i, 'the field ')) : '');
    var p1 = {
      nombre: 'Ingest', titulo: f ? 'We read the ' + f.unidad + ' from ' + f.nombre : 'We read the exports',
      texto: 'Everything that arrives is merged and the latest version of each task is kept. Each piece of work counts once. Columns with people or comments are never read.',
      visual: '<div class="v-lista">' + vfila(f ? 'Records read from ' + f.nombre : 'Rows read from ' + inf.ficheros.length + ' ' + plural(inf.ficheros.length, 'file', 'files'), inf.filasLeidas, '', 1) +
        vfila('Duplicates: counted once', inf.duplicadas, 'fuera', 2) + (inf.epicas + inf.subtareas ? vfila('Epics and subtasks', inf.epicas + inf.subtareas, 'fuera', 3) : '') +
        (inf.sinClave ? vfila('Without a key: cannot be followed', inf.sinClave, 'fuera', 3) : '') +
        vfila('Tasks to measure', inf.tareas, 'total', 4) + '</div>',
      resultado: cuenta(inf.tareas) + ' tasks from ' + esc(fechaCorta(det.fechaMin)) + ' to ' + esc(fechaCorta(hasta))
    };
    var p2 = {
      nombre: 'Teams', titulo: 'We recognise the teams',
      texto: 'The field that says which team each task belongs to is detected' + (campoTxt ? ' (here, ' + esc(campoTxt) + ')' : '') + '. What cannot be detected, such as which team belongs to a vendor, is set once in Context and saved.',
      visual: '<div class="v-chips">' + eqs.map(function (e, k) {
        var i = info[e.nombre] || {}, prov = i.tipo === 'proveedor', n = tareasDe(e.nombre);
        return '<span class="v-chip pe' + (prov ? ' prov' : '') + '" style="--d:' + (k + 2) + '"><b>' + esc(e.nombre) + '</b><small>' + (n != null ? miles(n) + ' tasks' : '') + (prov ? (n != null ? ', ' : '') + esc(i.proveedor || 'vendor') : (i.tipo === 'interno' ? (n != null ? ', ' : '') + 'in-house' : '')) + '</small></span>';
      }).join('') + '</div>',
      resultado: cuenta(eqs.length) + ' ' + plural(eqs.length, 'team', 'teams') + ', each measured on its own'
    };
    var pares = f ? f.estados : det.estados.map(function (e) { return [e.nombre, mp[e.nombre] || e.estado]; });
    var p3 = {
      nombre: 'States', titulo: 'We translate the states',
      texto: 'Each state in ' + esc(origen) + ' becomes one of nine common states. So every team is measured with the same rules, even if each one works with its own states.',
      visual: '<div class="v-mapeo">' + pares.slice(0, 7).map(function (x, k) {
        var d = E[x[1]] || E.pendiente;
        return '<span class="v-org pe" style="--d:' + (k + 2) + '">' + esc(x[0]) + '</span><span class="v-flecha pe" aria-hidden="true" style="--d:' + (k + 2) + '">→</span><span class="v-comun pe e-' + d.etapa + '" style="--d:' + (k + 2) + '">' + esc(d.nombre) + '</span>';
      }).join('') + '</div>' + (pares.length > 7 ? '<p class="v-mas pe" style="--d:9">And ' + (pares.length - 7) + ' more states</p>' : ''),
      resultado: cuenta(pares.length) + ' states in ' + esc(origen) + ' with their common state'
    };
    var fz = fiab(), revs = fz.comprobaciones.filter(function (c) { return c.estado === 'revisar'; });
    var p4 = {
      nombre: 'Quality', titulo: 'We check that the data is reliable',
      texto: 'Ten checks look for signs that the tool does not reflect the real work. If there are any, they are flagged before drawing conclusions, never hidden.',
      visual: '<div class="v-checks v-checks-2">' + fz.comprobaciones.map(function (c, k) {
        var ico = c.estado === 'revisar' ? 'aviso' : c.estado === 'bien' ? 'ok' : 'pend';
        return '<div class="v-check pe" style="--d:' + (Math.floor(k / 2) + 2) + '"><span class="v-ico ' + ico + '" aria-hidden="true">' + ICO_EST[c.estado] + '</span><div><b>' + esc(c.nombre) + '</b><span>' + esc(c.valor) + (c.estado === 'revisar' ? ', review' : '') + '</span></div></div>';
      }).join('') + '</div>',
      resultado: '<b>Reliability ' + NIVEL[fz.nivel][1].toLowerCase() + '</b>: ' + (revs.length ? cuenta(revs.length) + ' ' + plural(revs.length, 'check', 'checks') + ' to review with the teams' : 'the data reflects the work well')
    };
    var cfgC = cfgCalculo(), nombres = eqs.map(function (e) { return e.nombre; }), cap = N.capacidadArea(cfgC, nombres), fte = cfgC.fte || {}, coste = cfgC.coste || {};
    var p5 = {
      nombre: 'Capacity', titulo: 'We add headcount and cost',
      texto: 'Each team is joined with its full-time people (FTE) and what each one costs. ' + esc(origen) + ' does not bring them: they come from the staffing tool, the contracts or finance. Always per team, never salaries.',
      visual: '<div class="v-tabla pe" style="--d:2"><table><thead><tr><th scope="col">Team</th><th scope="col">FTE</th><th scope="col">One FTE a month</th><th scope="col">Team a month</th></tr></thead><tbody>' +
        nombres.slice(0, 8).map(function (e) {
          var a = fte[e], b = coste[e];
          return '<tr><th scope="row">' + esc(e) + '</th><td>' + (a ? n1(a) : '<span class="v-falta">Not set</span>') + '</td><td>' + (b ? euros(b) : '<span class="v-falta">Not set</span>') + '</td><td>' + (a && b ? euros(a * b) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>',
      resultado: cap.costeMes != null ? cuenta(Math.round(cap.costeMes), 'eur') + ' a month for ' + n1(cap.fteTotal) + ' FTE' : '<b>Pending</b>: FTE and cost are set in Measure &gt; Context'
    };
    var total = eqs.length * COLUMNAS.length, s = senales();
    var p6 = {
      nombre: 'Baseline', titulo: 'We measure each team against itself',
      texto: 'Five measures per team and week. Each figure is compared with the previous 12 weeks of that same team. Between groups, only with the same type and size of task.',
      visual: matriz(),
      resultado: cuenta(s.n) + ' of ' + total + ' figures outside what is normal'
    };
    var semanas = r.modelo.semanas.length;
    return {
      kicker: 'Step 1 · Measure', titulo: 'This is how your data becomes a trusted baseline',
      fuente: f ? esc(f.nombre) + ' (demo connector)' : (App.origen === 'ejemplo' ? 'Sample data' : esc(recortar(inf.ficheros.map(function (x) { return x.nombre; }).join(', '), 48))),
      pie: f ? 'Demo connector with the sample data of a fictional bank' : 'Everything is calculated in this browser: the data does not leave the computer',
      pasos: [p1, p2, p3, p4, p5, p6], ultimo: 'See the summary',
      final: {
        titulo: 'Data ready to use',
        texto: 'Calculated in this browser in ' + segundos(App.tiempoMs || 0) + '. Every figure in the baseline comes from these stages, and the KPI catalogue records them to sign off.',
        visual: '<div class="v-resumen">' + [[inf.tareas, 'tasks'], [eqs.length, plural(eqs.length, 'team', 'teams')], [semanas, 'weeks'], [s.n, plural(s.n, 'figure outside normal', 'figures outside normal')]].map(function (x, k) {
          return '<div class="pe" style="--d:' + (k + 2) + '">' + cuenta(x[0]) + '<span>' + x[1] + '</span></div>';
        }).join('') + '</div>',
        boton: 'See the baseline'
      }
    };
  }
  function animarCarga(simulada) {
    if (!App.r || !window.Proceso) return Promise.resolve('sin-animacion');
    try { return window.Proceso.reproducir(configCarga(simulada)); } catch (e) { if (window.console) console.error(e); return Promise.resolve('error'); }
  }

  // ---------- tutorial: the four steps on the real interface ----------
  function pasosTutorial() {
    var eqs = App.r.modelo.equipos, conProblema = eqs.filter(function (e) { var p = problemas(e); return p.critico.length || p.atencion.length; })[0] || eqs[0];
    var conRec = recomendaciones().filter(function (x) { return x.equipos.indexOf(conProblema.nombre) >= 0; })[0];
    var hayEval = seguimientos().some(function (x) { return x.s.estado !== 'planificada' && x.s.estado !== 'sin_datos'; });
    var ir = function (v, sec) { return function () { App.vista = v; App.ver = 'area'; App.editar = null; App.nuevaIni = false; if (sec) App.medir = sec; render(); }; };
    var pasos = [
      { sel: '.pasos-nav', kicker: 'The four steps', titulo: 'Measure, Analyze, Improve, Learn', antes: ir('measure', 'baseline'),
        texto: 'The page is organised as the four steps of the method. Each one is a real screen with real figures: the baseline, the signals and recommendations, the initiatives and the results. Settings and the AI assistant are on the right.' },
      { sel: '.kpis', kicker: 'Step 1 · Measure', titulo: 'The baseline of the area',
        texto: 'Lead time, deliveries, rework and agent-ready tickets, with their trend. Each figure is compared with what was normal in the previous 12 weeks. Only what stands out is marked: no label means it is fine.' },
      { sel: '.estado-area', kicker: 'Step 1 · Measure', titulo: 'Data reliability and teams that need attention',
        texto: 'On the left, whether the data reflects the work (ten checks, in Measure > Data). On the right, the teams with a figure outside normal. Click one for its detail.' },
      { sel: '.tabla-equipos', kicker: 'Step 1 · Measure', titulo: 'One team per row',
        texto: 'The five measures of each team. The colour is the status against its own history. It is not a ranking: each team is compared with itself. Who is in-house and who is a vendor is set in Measure > Context.' },
      { sel: '.grafico-plazo', kicker: 'Step 1 · Measure', titulo: 'The detail of a team', antes: function () { App.vista = 'measure'; App.medir = 'baseline'; App.ver = conProblema.nombre; App.editar = null; render(); },
        texto: 'Lead time week by week, with the band of what is normal in that team. Beside it, its recommendations.' },
      { sel: '.senales', kicker: 'Step 2 · Analyze', titulo: 'The signals', antes: function () { App.vista = 'analyze'; App.recEquipo = 'todos'; App.recSel = conRec ? claveRec(conRec) : null; App.editar = null; render(); },
        texto: 'How many figures are outside normal, how many clear differences between groups with the same type of task, and how many recommendations come out of the case bank and the AI assistant.' },
      { sel: '.recs-lista', kicker: 'Step 2 · Analyze', titulo: 'What to do, in order',
        texto: 'Each recommendation says which figure it comes from, the probable driver, the first step and the plan. First the most serious and what affects more teams. With an API key, the AI assistant adds its own, with every cited figure checked against the package.' },
      { sel: '.rec-seg', kicker: 'Step 3 · Improve', titulo: 'Register as an initiative',
        texto: 'If you decide to try the plan, register it as an initiative. From then on it is measured on its own: before, after and against the teams that do not have it.' },
      { sel: '#estandar', kicker: 'Step 3 · Standardize', titulo: 'The same rules for every team', antes: ir('improve'),
        texto: 'Five measures with one definition each, the tool states mapped to nine common states, a KPI catalogue to sign off and a measurement model any platform can use.' },
      { sel: hayEval ? '.seg' : '#ciclo', kicker: 'Step 4 · Learn', titulo: hayEval ? 'Did it work?' : 'The next cycle', antes: ir('learn'),
        texto: hayEval ? 'Each initiative with its status (works, no clear effect, getting worse, measuring) and the evolution of its measure against the rest. "How it was evaluated" shows the figures step by step.' : 'Once initiatives have two weeks of data, their evaluation appears here with before, after and the other teams as control.' },
      { sel: '.btn-actualizar', kicker: 'Step 4 · Evolve', titulo: 'Every week, Update', antes: ir('measure', 'baseline'), ultimo: 'Finish',
        texto: 'With a folder (exports, configuracion, iniciativas), every week it is enough to drop the new export and press Update. The baseline moves on and the cycle starts again.' }
    ];
    return pasos;
  }
  function tutorial() {
    if (!window.Tutorial) return;
    if (window.Proceso) window.Proceso.cerrar();
    var cargadoAqui = false;
    if (!App.r) { if (!verDemo(null)) return; cargadoAqui = true; }
    guardarLocal(CLAVE_TUT, { visto: new Date().toISOString() });
    window.Tutorial.iniciar(pasosTutorial(), {
      alCerrar: function () {
        if (cargadoAqui && App.demo) { aviso('End of the tutorial. Press "Load my data" to start with yours.'); }
      }
    });
  }

  // ---------- actions ----------
  function cambiar(fn) {
    var y = window.scrollY;
    fn(); guardarCfg();
    enSegundoPlano(function () { recalcular(); render(); window.scrollTo(0, y); });
  }
  var ACC = {
    vista: function (el) { App.vista = el.getAttribute('data-v'); App.editar = null; App.nuevaIni = false; ocultarTip(null); render(); window.scrollTo(0, 0); },
    ver: function (el) { App.ver = el.getAttribute('data-e'); App.vista = 'measure'; App.medir = 'baseline'; render(); window.scrollTo(0, 0); },
    'medir-sec': function (el) { App.vista = 'measure'; App.medir = el.getAttribute('data-s'); App.editar = null; render(); window.scrollTo(0, 0); },
    ficheros: function () { document.getElementById('entrada-ficheros').click(); },
    carpeta: elegirCarpeta,
    'leer-carpeta': function () { if (App.carpeta) leerCarpeta(App.carpeta); },
    fuente: function (el) { App.fuente = el.getAttribute('data-f'); render(); },
    fuentes: function () { App.fuente = null; render(); },
    conectar: function (el) { var k = el.getAttribute('data-f'); if (verDemo(k)) animarCarga(App.simulada); },
    demo: function () { if (verDemo(null)) animarCarga(null); },
    tutorial: tutorial,
    rec: function (el) {
      App.recSel = el.getAttribute('data-k'); render();
      var d = document.getElementById('rec-detalle');
      if (d) { d.classList.add('entra'); if (window.innerWidth < 1000) d.scrollIntoView({ block: 'start' }); }
    },
    registrar: function (el) { registrar(el.getAttribute('data-k')); },
    'ver-recs': function (el) { App.recEquipo = el.getAttribute('data-e') || 'todos'; App.recSel = null; App.vista = 'analyze'; render(); window.scrollTo(0, 0); },
    'nueva-ini': function () { App.vista = 'improve'; App.nuevaIni = true; render(); var f = document.getElementById('form-ini'); if (f) { f.scrollIntoView({ block: 'start' }); var n = f.elements.nombre; if (n) n.focus(); } },
    'cancelar-ini': function () { App.nuevaIni = false; render(); },
    'quitar-ini': function (el) { quitarIni(el.getAttribute('data-i')); },
    'salir-demo': function () { salirDemo(); if (!App.r) { App.vista = 'inicio'; render(); } },
    actualizar: function () {
      if (App.demo) { aviso('There is nothing to update in the sample data. Press "Load my data" to use yours.'); return; }
      if (App.carpeta) return leerCarpeta(App.carpeta);
      if (App.origen === 'datosjs') return location.reload();
      document.getElementById('entrada-ficheros').click();
    },
    'datos-sec': function (el) { App.vista = 'measure'; App.medir = 'data'; App.datos = el.getAttribute('data-s'); App.editar = null; render(); window.scrollTo(0, 0); },
    fiabilidad: function () { App.vista = 'measure'; App.medir = 'data'; App.datos = 'fiabilidad'; App.editar = null; render(); window.scrollTo(0, 0); },
    editar: function (el) {
      var k = el.getAttribute('data-e');
      if (k === 'calidad') { ACC.fiabilidad(); return; }
      if (App.vista !== 'measure' || App.medir !== 'context') { App.vista = 'measure'; App.medir = 'context'; App.editar = k; render(); var s = document.getElementById('ajuste-' + k) || document.getElementById('leido'); if (s) s.scrollIntoView(); return; }
      var y = window.scrollY; App.editar = App.editar === k ? null : k; render(); window.scrollTo(0, y);
    },
    definiciones: function (el) { definiciones(el.getAttribute('data-f')); },
    paquete: paquete,
    modelo: descargarModelo,
    'ia-recs': pedirRecsIa,
    'ia-mapeo': pedirMapeoIa,
    'ia-impacto': pedirImpactoIa,
    'ia-probar': probarIa,
    'ia-olvidar': function () { App.ia.clave = ''; App.iaProbada = null; try { sessionStorage.removeItem(CLAVE_IA); localStorage.removeItem(CLAVE_IA); } catch (e) { } render(); aviso('Key forgotten.'); }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-accion]');
    if (!el) return;
    var f = ACC[el.getAttribute('data-accion')];
    if (f) { e.preventDefault(); f(el); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.getAttribute && f.getAttribute('data-accion-form') === 'guardar-ini') { e.preventDefault(); guardarIni(f); }
  });
  document.addEventListener('toggle', function (e) { var d = e.target; if (d.tagName === 'DETAILS' && d.getAttribute('data-k')) App.abiertas[d.getAttribute('data-k')] = d.open; }, true);
  document.addEventListener('change', function (e) {
    var el = e.target, tipo = el.getAttribute('data-cambio');
    if (el.id === 'entrada-ficheros') { cargarFicheros(el.files); el.value = ''; return; }
    if (!tipo) return;
    var en = el.getAttribute('data-e');
    if (tipo === 'ver') { App.ver = el.value; render(); window.scrollTo(0, 0); return; }
    if (tipo === 'rec-equipo') { App.recEquipo = el.value; App.recSel = null; render(); return; }
    if (tipo === 'nombre') { App.cfg.nombre = el.value.trim(); guardarCfg(); return; }
    if (tipo === 'ia-modelo') { App.ia.modelo = el.value.trim() || N.IA.MODELO_POR_DEFECTO; guardarIa(); return; }
    if (tipo === 'ia-clave') { App.ia.clave = el.value.trim(); App.iaProbada = null; guardarIa(); render(); return; }
    if (tipo === 'ia-recordar') { App.ia.recordar = !!el.checked; guardarIa(); return; }
    if (tipo === 'ia-proveedor') return;
    if (tipo === 'campo') return cambiar(function () { App.cfg.campoEquipo = el.value; delete App.cfg.equipos; });
    if (tipo === 'estado') return cambiar(function () { App.cfg.mapeoEstados = App.cfg.mapeoEstados || {}; App.cfg.mapeoEstados[en] = el.value; });
    if (tipo === 'eq') {
      var k = el.getAttribute('data-campo');
      return cambiar(function () {
        if (k === 'fte') { App.cfg.fte = App.cfg.fte || {}; var v = parseFloat(String(el.value).replace(',', '.')); if (isNaN(v) || v <= 0) delete App.cfg.fte[en]; else App.cfg.fte[en] = v; return; }
        if (k === 'fteOrigen') { App.cfg.fteOrigen = App.cfg.fteOrigen || {}; App.cfg.fteOrigen[en] = el.value; return; }
        if (k === 'coste') { App.cfg.coste = App.cfg.coste || {}; var cv = parseFloat(String(el.value).replace(',', '.')); if (isNaN(cv) || cv <= 0) delete App.cfg.coste[en]; else App.cfg.coste[en] = cv; return; }
        App.cfg.equiposInfo = App.cfg.equiposInfo || {};
        var i = App.cfg.equiposInfo[en] = App.cfg.equiposInfo[en] || {};
        i[k] = el.value.trim() || null;
      });
    }
  });
  document.addEventListener('dragover', function (e) { e.preventDefault(); var z = document.getElementById('zona'); if (z) z.classList.add('encima'); });
  document.addEventListener('dragleave', function (e) { var z = document.getElementById('zona'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('encima'); });
  document.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) cargarFicheros(e.dataTransfer.files); });

  // ---------- start ----------
  function iniciar() {
    App.cfg = cfgInicial();
    cargarIa();
    if (window.EASY_PERFORMANCE_INICIATIVAS) App.iniciativas = [].concat(window.EASY_PERFORMANCE_INICIATIVAS).filter(iniciativaValida);
    if (window.EASY_PERFORMANCE_CONTEXTO && window.EASY_PERFORMANCE_CONTEXTO.documentos) App.contexto = window.EASY_PERFORMANCE_CONTEXTO;
    idbGet('carpeta').then(function (h) {
      App.carpeta = h;
      var ex = window.EASY_PERFORMANCE_EXPORTS;
      if (ex && ex.length) {
        var fs;
        try { fs = ex.map(function (f) { return { nombre: f.nombre, texto: f.b64 != null ? desdeBase64(f.b64) : f.texto }; }); }
        catch (e) { aviso('Could not read exports/datos.js. Run actualizar again.'); render(); return; }
        enSegundoPlano(function () { procesar(fs, 'datosjs'); render(); }, 'Reading data…');
      } else render();
    });
  }
  App.render = render; App.ACC = ACC; App.leerCarpeta = leerCarpeta; App.recomendaciones = recomendaciones; App.procesar = procesar; App.tutorial = tutorial; App.verDemo = verDemo; App.fiab = fiab; App.seguimientos = seguimientos; App.todasRecs = todasRecs;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
