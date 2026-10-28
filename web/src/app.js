// Easy Performance: tablero, recomendaciones, iniciativas, datos y ajustes.
// Al cargar el export se detecta todo (campo de equipo, estados) y se ve el tablero.
// Lo que no se puede detectar (proveedores, áreas, FTE) y lo que se quiera corregir se cambia en Ajustes.
// El tutorial (tutorial.js) recorre la interfaz con los datos de ejemplo o con los del cliente.
// Usa el núcleo empaquetado en la página: window.Motor, window.Nucleo y window.CATALOGO.
(function () {
  'use strict';
  var C = window.CATALOGO, N = window.Nucleo, M = window.Motor;
  var CLAVE = 'easyperformance.config.v2', CLAVE_V1 = 'easyperformance.configuracion.v1', CLAVE_TUT = 'easyperformance.tutorial';
  var App = {
    vista: 'inicio', ver: 'area', editar: null, demo: false, carpeta: null, origen: null,
    lectura: null, det: null, cfg: {}, iniciativas: [], contexto: null, r: null, real: null, abiertas: {},
    recSel: null, recEquipo: 'todos', tiempoMs: 0, datos: 'fiabilidad', ajustes: null, nuevaIni: false
  };
  window.EasyPerformance = App;
  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n1(v) { return (Math.round(v * 10) / 10).toLocaleString('es-ES'); }
  function lista(ns) { return ns.length < 2 ? (ns[0] || '') : ns.slice(0, -1).join(', ') + ' y ' + ns[ns.length - 1]; }
  function mayus(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  var NUMEROS = ['Ningún', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];

  // Las cinco medidas del tablero: siempre las mismas, para todos los clientes
  var MED = {
    ciclo: { nombre: 'Plazo', formato: 'dias', unidad: 'días', que: 'Lo que se empieza hoy estará terminado, casi seguro, en este plazo o antes. Si sube, se tarda más en terminar lo que se empieza.' },
    entregas: { nombre: 'Entregas', formato: 'num', unidad: 'por semana', que: 'Tareas terminadas cada semana. Las descartadas no cuentan.' },
    retrabajo: { nombre: 'Retrabajo', formato: 'pct', unidad: 'de lo terminado', que: 'Parte de lo terminado que volvió a un estado por el que ya había pasado.' },
    arrastradas: { nombre: 'Pasa de sprint', formato: 'pct', unidad: 'de lo terminado', que: 'Parte de lo terminado que pasó por más de un sprint.' },
    agent_readiness: { nombre: 'Listo para agentes', formato: 'pct', unidad: 'de los tickets', que: 'Tickets que un agente de IA podría hacer sin preguntar: descripción, criterios de aceptación, alcance acotado, referencias y sin dependencias abiertas.' },
    coste: { nombre: 'Coste por entrega', formato: 'eur', unidad: 'por tarea', que: 'Coste del equipo al mes (FTE por lo que cuesta un FTE) entre las tareas terminadas al mes. Mejor cuanto más bajo. Solo si se indican FTE y coste.' }
  };
  var COLUMNAS = ['ciclo', 'entregas', 'retrabajo', 'arrastradas', 'agent_readiness'];
  // Fuentes de la entrada. Jira funciona hoy con el export CSV; la conexión directa y el resto son una simulación
  function hayCoste() { var c = App.cfg.coste; return !!(c && Object.keys(c).some(function (k) { return c[k] > 0; })); }
  function columnas() { return hayCoste() ? COLUMNAS.concat(['coste']) : COLUMNAS; }
  function med(eq, id) { return id === 'coste' ? (eq.kpis && eq.kpis.coste) || { id: 'coste', disponible: false, motivo: 'Indica el FTE y el coste de cada equipo en Ajustes.' } : eq.medidas[id]; }
  // Siempre con punto de miles (en castellano, toLocaleString no lo pone en las cifras de cuatro dígitos)
  function euros(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  var KPI_AREA = ['ciclo', 'entregas', 'retrabajo', 'agent_readiness'];
  var KPI_EQUIPO = ['ciclo', 'entregas', 'retrabajo', 'arrastradas'];
  var ESTADO = { bien: 'Bien', atencion: 'Atención', critico: 'Crítico', sin: 'Sin datos' };
  var NOMBRE_INI = { ciclo: 'plazo', total: 'tiempo total', entregas: 'entregas por semana', espera: 'tiempo en espera', retrabajo: 'retrabajo', errores: 'errores', reabiertas: 'reaperturas', bloqueo: 'tiempo bloqueado', agent_readiness: 'tickets listos para agentes' };

  function valor(id, v) {
    if (v == null || isNaN(v)) return null;
    var f = MED[id] ? MED[id].formato : 'num';
    if (f === 'pct') return Math.round(v * 100) + '%';
    if (f === 'dias') return n1(v) + (Math.abs(v - 1) < 0.05 ? ' día' : ' días');
    if (f === 'eur') return euros(v);
    return n1(v);
  }
  // "6,5 a 7,1 días": la unidad una sola vez
  function rango(id, lo, hi) { return MED[id] && MED[id].formato === 'dias' ? n1(lo) + ' a ' + valor(id, hi) : valor(id, lo) + ' a ' + valor(id, hi); }
  function cifra(id, v) {
    if (v == null || isNaN(v)) return { g: 's/d', u: '' };
    var f = MED[id].formato;
    if (f === 'pct') return { g: Math.round(v * 100) + '%', u: MED[id].unidad };
    if (f === 'eur') return { g: euros(v), u: MED[id].unidad };
    return { g: n1(v), u: f === 'dias' && Math.abs(v - 1) < 0.05 ? 'día' : MED[id].unidad };
  }
  function estadoDe(m) { return !m || !m.disponible ? 'sin' : (m.estado === 'atencion' || m.estado === 'critico' ? m.estado : (m.estado === 'bien' ? 'bien' : 'neutro')); }
  function chip(e, siempre) {
    if (e === 'atencion' || e === 'critico' || (siempre && (e === 'bien' || e === 'sin'))) return '<span class="chip chip-' + e + '">' + ESTADO[e] + '</span>';
    return '';
  }
  function fechaCorta(d) { return M.fechaCorta(d); }

  // ---------- avisos y ocupado ----------
  var tAviso = null;
  function aviso(t) { var el = document.getElementById('aviso'); el.textContent = t; el.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(function () { el.hidden = true; }, 5000); }
  function ocupado(si, texto) { var el = document.getElementById('ocupado'); el.hidden = !si; if (texto) el.firstChild.textContent = texto; }
  function enSegundoPlano(fn, texto) { ocupado(true, texto || 'Calculando…'); setTimeout(function () { try { fn(); } finally { ocupado(false); } }, 20); }

  // ---------- configuración ----------
  // Solo guarda lo que no se puede detectar o lo que se ha corregido. Lo demás se calcula al cargar.
  function leerLocal(k) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function cfgInicial() {
    var c = leerLocal(CLAVE);
    if (c) return c;
    var v1 = leerLocal(CLAVE_V1) || window.EASY_PERFORMANCE_CONFIG;
    if (!v1) return {};
    // Configuración de la versión anterior: se aprovecha lo que sigue teniendo sentido
    var out = {};
    ['nombre', 'campoEquipo', 'equipos', 'equiposInfo', 'fte', 'fteOrigen', 'coste', 'mapeoEstados', 'etapas', 'iniciativas'].forEach(function (k) { if (v1[k] != null) out[k] = v1[k]; });
    return out;
  }
  function guardarCfg() {
    if (App.demo) return; // la demo vive solo en memoria
    App.cfg.actualizada = new Date().toISOString();
    guardarLocal(CLAVE, App.cfg);
    escribirEnCarpeta('configuracion', 'cliente.json', JSON.stringify(App.cfg, null, 2));
  }
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
    if (!nombres.length) nombres = ['Todo el trabajo'];
    var lista = nombres.map(function (n) {
      var i = info[n] || {}, prov = i.tipo === 'proveedor';
      return { id: n, nombre: n, tipo: prov ? 'proveedor' : 'interno', proveedor: prov ? (i.proveedor || 'Proveedor sin nombre') : null, area: i.area || null,
        usa_sprints: true, fte: fte[n] ? [{ periodo: periodo, valor: fte[n], origen: orig[n] || 'declarado' }] : [], limites: {} };
    });
    return { version: 2, nombre: c.nombre || '', sector: c.sector || '', plataforma: 'jira', mapeoEstados: mapeo(), equipos: { campo: campo(), lista: lista },
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
  }

  // ---------- carga de datos ----------
  function descodificar(buf) {
    var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  function desdeBase64(b64) { var bin = atob(b64), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return descodificar(b); }
  function procesar(ficheros, origen) {
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var r = M.ingerir(ficheros);
    if (!r.tareas.length) { aviso('No se encontraron tareas en los ficheros. ' + ((r.informe.avisos[0] || {}).texto || '')); return false; }
    App.lectura = r.lectura; App.det = M.detectar(r.tareas); App.origen = origen; App.ficheros = ficheros;
    recalcular();
    App.tiempoMs = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
    App.recSel = null; App.recEquipo = 'todos'; App.nuevaIni = false;
    App.vista = 'tablero';
    return true;
  }
  function cargarFicheros(files) {
    var csv = [].filter.call(files, function (f) { return /\.csv$/i.test(f.name) || /csv/.test(f.type); });
    if (!csv.length) { aviso('Elige uno o varios CSV exportados de Jira.'); return; }
    salirDemo(false);
    ocupado(true, 'Leyendo datos…');
    Promise.all(csv.map(function (f) { return f.arrayBuffer().then(descodificar).then(function (t) { return { nombre: f.name, texto: t }; }); }))
      .then(function (fs) { setTimeout(function () { try { if (procesar(fs, 'ficheros')) { render(); window.scrollTo(0, 0); } } finally { ocupado(false); } }, 20); })
      .catch(function () { ocupado(false); aviso('No se pudieron leer los ficheros.'); });
  }

  // Carpeta compartida (Chrome y Edge): exports/, configuracion/, iniciativas/, contexto/, historico/, diagnostico/
  function idb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('sin idb'));
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
    if (!window.showDirectoryPicker) { aviso('Este navegador no permite elegir carpetas. Usa Chrome o Edge, o elige los ficheros.'); return; }
    window.showDirectoryPicker({ id: 'easyperformance', mode: 'readwrite' }).then(function (h) { App.carpeta = h; idbSet('carpeta', h); return leerCarpeta(h); })
      .catch(function (e) { if (e && e.name !== 'AbortError') aviso('No se pudo abrir la carpeta.'); });
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
    ocupado(true, 'Leyendo la carpeta…');
    return permiso(h, 'readwrite').catch(function () { return permiso(h, 'read'); }).then(function (ok) {
      if (!ok) throw new Error('permiso');
      return sub(h, 'exports').then(function (d) { return ficherosDe(d || h, /\.csv$/i, function (f) { return f.arrayBuffer().then(descodificar); }); });
    }).then(function (fs) {
      if (!fs.length) { ocupado(false); aviso('No hay ficheros CSV en la carpeta exports.'); return; }
      var json = function (nombre) { return sub(h, nombre).then(function (d) { return d ? ficherosDe(d, /\.json$/i, function (f) { return f.text(); }) : []; }); };
      return Promise.all([json('configuracion'), json('iniciativas'), json('contexto')]).then(function (x) {
        var leer = function (t, donde) { try { return JSON.parse(t); } catch (e) { aviso('No se pudo leer ' + donde + ': no es JSON válido.'); return null; } };
        var cli = x[0].filter(function (f) { return f.nombre === 'cliente.json'; })[0];
        if (cli && !leerLocal(CLAVE)) { var c = leer(cli.texto, 'configuracion/cliente.json'); if (c) App.cfg = c; }
        App.iniciativas = x[1].map(function (f) { return leer(f.texto, 'iniciativas/' + f.nombre); }).filter(iniciativaValida);
        var docs = [];
        x[2].forEach(function (f) { var d = leer(f.texto, 'contexto/' + f.nombre); if (d && d.documentos) docs = docs.concat(d.documentos); });
        App.contexto = docs.length ? { documentos: docs } : null;
        setTimeout(function () {
          try { if (procesar(fs, 'carpeta')) { guardarFoto(); guardarSeguimiento(); render(); aviso('Leídos ' + fs.length + ' fichero(s) de la carpeta.'); } } finally { ocupado(false); }
        }, 20);
      });
    }).catch(function () { ocupado(false); aviso('No hay permiso para leer la carpeta. Pulsa otra vez "Leer la carpeta".'); });
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
  // Foto semanal de lo abierto: con varias, se podrá medir la fiabilidad del sprint
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

  // ---------- datos de ejemplo ----------
  // Un banco ficticio con dos equipos internos y dos de proveedores, un año de historia, dos iniciativas y costes
  // inventados. Los usa el tutorial y se pueden cargar para probar la página. Nunca tocan los datos reales.
  var DEMO = { fichero: 'datos-de-ejemplo.csv', nombre: 'Banco ficticio' };
  function hayDemo() { var t = document.getElementById('demo-csv'); return !!(t && t.textContent.trim()); }
  function verDemo() {
    var t = (document.getElementById('demo-csv') || {}).textContent || '';
    if (!t.trim()) { aviso('Esta copia no incluye datos de ejemplo.'); return false; }
    var dc = {}; try { dc = JSON.parse(document.getElementById('demo-cliente').textContent || '{}'); } catch (e) { dc = {}; }
    if (!App.demo) App.real = { lectura: App.lectura, det: App.det, cfg: App.cfg, iniciativas: App.iniciativas, contexto: App.contexto, r: App.r, origen: App.origen, ver: App.ver, vista: App.vista, recSel: App.recSel, tiempoMs: App.tiempoMs, ficheros: App.ficheros };
    App.demo = true;
    App.cfg = { nombre: dc.nombre || DEMO.nombre, equiposInfo: dc.equiposInfo || {}, fte: dc.fte || {}, fteOrigen: dc.fteOrigen || {}, coste: dc.coste || {} };
    App.iniciativas = dc.iniciativas || []; App.contexto = dc.contexto || null; App.ver = 'area'; App.editar = null; App.nuevaIni = false;
    procesar([{ nombre: DEMO.fichero, texto: t }], 'ejemplo');
    render(); window.scrollTo(0, 0);
    return true;
  }
  function salirDemo(pintar) {
    if (!App.demo) return;
    if (window.Tutorial) window.Tutorial.cerrar();
    var r = App.real || {};
    App.demo = false;
    App.lectura = r.lectura || null; App.det = r.det || null; App.cfg = r.cfg || cfgInicial(); App.iniciativas = r.iniciativas || [];
    App.contexto = r.contexto || null; App.r = r.r || null; App.origen = r.origen || null; App.ver = r.ver || 'area'; App.ficheros = r.ficheros || null;
    App.recSel = r.recSel || null; App.recEquipo = 'todos'; App.tiempoMs = r.tiempoMs || 0;
    App.vista = App.r ? 'tablero' : 'inicio'; App.real = null; App.editar = null; App.nuevaIni = false;
    if (pintar !== false) { render(); window.scrollTo(0, 0); }
  }

  // ---------- pintado ----------
  var VISTAS = [['tablero', 'Tablero'], ['recomendaciones', 'Recomendaciones'], ['iniciativas', 'Iniciativas'], ['datos', 'Datos'], ['ajustes', 'Ajustes']];
  function render() {
    var html;
    if (!App.r || App.vista === 'inicio') html = inicio();
    else html = cabecera() + (App.demo ? bandaDemo() : '') + '<main class="pagina">' + ({ tablero: tablero, recomendaciones: vistaRecomendaciones, iniciativas: vistaIniciativas, datos: vistaDatos, ajustes: vistaAjustes }[App.vista] || tablero)() + '</main>';
    document.getElementById('app').innerHTML = html;
  }
  function marca() { return '<div class="marca"><span class="logo" aria-hidden="true"></span><b>Easy Performance</b></div>'; }
  function cabecera() {
    var recs = recomendaciones().length;
    var pest = VISTAS.map(function (p) {
      return '<button class="pestana" data-accion="vista" data-v="' + p[0] + '"' + (App.vista === p[0] ? ' aria-current="page"' : '') + '>' + p[1] +
        (p[0] === 'recomendaciones' && recs ? ' <span class="cuenta">' + recs + '</span>' : '') + '</button>';
    }).join('');
    var hasta = new Date(App.r.modelo.semanaFin.getTime() - 864e5);
    return '<header class="cab"><div class="cab-in">' + marca() + '<nav class="pestanas" aria-label="Secciones">' + pest + '</nav><span class="hueco"></span>' +
      '<span class="fecha">Datos hasta el ' + esc(fechaCorta(hasta)) + '</span><button class="btn btn-cab" data-accion="tutorial">Tutorial</button><button class="btn btn-cab btn-actualizar" data-accion="actualizar">Actualizar</button></div></header>';
  }
  function bandaDemo() {
    return '<div class="banda-demo"><span><b>Datos de ejemplo:</b> un banco ficticio con dos equipos internos y dos de proveedores, un año de historia y costes inventados. Lo que cambies aquí no se guarda.</span>' +
      '<span class="banda-acc"><button class="btn btn-peq" data-accion="salir-demo">' + (App.real && App.real.r ? 'Volver a mis datos' : 'Cargar mis datos') + '</button></span></div>';
  }

  // Pantalla de entrada: cargar los exports (ficheros o carpeta) o empezar por el tutorial con datos de ejemplo
  function inicio() {
    var carpetaOk = !!window.showDirectoryPicker, demo = hayDemo();
    return '<div class="inicio"><div class="inicio-in">' +
      '<div class="inicio-txt">' + marca() + '<h1>Rendimiento de equipos desde Jira</h1>' +
      '<p class="inicio-sub">Carga el export de Jira y verás cómo va cada equipo, qué hacer y si las iniciativas de mejora funcionan. Solo equipos, nunca personas.</p>' +
      (demo ? '<div class="inicio-tut"><button class="btn btn-claro" data-accion="tutorial">Ver el tutorial con datos de ejemplo</button><span>Cinco minutos. No toca tus datos.</span></div>' : '') +
      '<p class="nota">Los datos no salen de este ordenador: todo se calcula en el navegador.</p></div>' +
      '<section class="fuentes" aria-label="Cargar los datos"><h2>Cargar los datos</h2>' +
      '<div class="zona" id="zona"><b>Suelta aquí el CSV de Jira</b><span>Exportado con todos los campos, en Jira Cloud o Data Center. Puedes soltar varios ficheros: se unen y se quitan los repetidos.</span>' +
      '<div class="botones"><button class="btn" data-accion="ficheros">Elegir ficheros</button>' + (carpetaOk ? '<button class="btn btn-sec" data-accion="carpeta">Elegir carpeta</button>' : '') +
      (App.carpeta ? '<button class="btn btn-sec" data-accion="leer-carpeta">Leer la carpeta «' + esc(App.carpeta.name) + '»</button>' : '') + '</div></div>' +
      '<dl class="con-datos"><dt>Ficheros</dt><dd>Uno o varios CSV. Para cargar más de 10.000 tareas, exporta por partes.</dd>' +
      '<dt>Carpeta</dt><dd>Con una carpeta (exports, configuracion, iniciativas, contexto) cada semana basta con dejar el export nuevo y pulsar Actualizar.</dd>' +
      '<dt>Otras herramientas</dt><dd>Azure DevOps, GitLab y ServiceNow entran con su adaptador al mismo modelo. Hoy funciona Jira.</dd></dl>' +
      '</section></div></div>';
  }
  // ---------- tablero ----------
  function selector() {
    var eqs = App.r.modelo.equipos;
    return '<label class="selector">Ver <select data-cambio="ver" aria-label="Qué ver"><option value="area"' + (App.ver === 'area' ? ' selected' : '') + '>Todo el área</option>' +
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
    if (m && !m.disponible) normal = m.motivo || 'Sin datos suficientes.';
    else if ((e === 'atencion' || e === 'critico') && m.estadoTexto) normal = m.estadoTexto.replace(/su rango habitual/g, 'lo normal');
    else if (m && m.ref) normal = 'Lo normal: ' + rango(id, m.ref.lo, m.ref.hi);
    else normal = def.que.split('.')[0] + '.';
    // La ayuda del plazo lleva la cifra real: qué se puede esperar de lo que se empieza hoy
    var tip = def.que;
    if (id === 'ciclo' && m && m.disponible && m.valor != null) {
      var quien = App.ver && App.ver !== 'area' ? 'este equipo' : 'el área';
      tip = 'Lo que ' + quien + ' empieza hoy estará terminado, casi seguro, en ' + c.g + ' ' + c.u + ' o menos. Si sube, ' + quien.replace('este ', 'el ') + ' tarda más en terminar lo que empieza.';
    }
    // Solo se marca lo que está fuera de lo normal: sin etiqueta es que está bien
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
    return '<svg class="chispa chispa-' + e + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(nombre) + ' en las últimas 12 semanas"><polyline points="' + pts.join(' ') + '"/></svg>';
  }
  function vistaArea() {
    var r = App.r, eqs = r.modelo.equipos.slice(), a = r.area.equipos[0];
    var peso = function (eq) { var p = problemas(eq); return p.critico.length * 10 + p.atencion.length; };
    eqs.sort(function (x, y) { return peso(y) - peso(x) || x.nombre.localeCompare(y.nombre, 'es'); });
    var fuera = eqs.filter(function (e) { var p = problemas(e); return p.critico.length || p.atencion.length; });
    var nRec = recomendaciones().length, info = App.cfg.equiposInfo || {};
    var de = function (t) { return eqs.filter(function (e) { return (info[e.nombre] || {}).tipo === t; }).length; };
    var nProv = de('proveedor'), nInt = de('interno');
    var sub = eqs.length + ' ' + plural(eqs.length, 'equipo', 'equipos') + (nProv ? ': ' + nInt + ' ' + plural(nInt, 'interno', 'internos') + ' y ' + nProv + ' de ' + plural(nProv, 'proveedor', 'proveedores') : '');
    var accion = !nRec ? '' : '<button class="btn" data-accion="vista" data-v="recomendaciones">Ver ' + (nRec === 1 ? 'la recomendación' : 'las ' + nRec + ' recomendaciones') + '</button>';
    var html = '<section class="titular cab-area"><div><h1>' + esc(App.cfg.nombre || 'Todo el área') + '</h1><p>' + esc(sub) + '</p></div><div class="cab-acc">' + selector() + accion + '</div></section>';
    html += estadoArea(fuera);
    html += '<section class="kpis" aria-label="Indicadores del área">' + KPI_AREA.concat(hayCoste() ? ['coste'] : []).map(function (id) { return tarjetaKpi(id, med(a, id), true); }).join('') + '</section>';
    if (eqs.length > 1) {
      var marca_ = function (st) { return st === 'atencion' || st === 'critico' ? '<span class="sr"> (' + ESTADO[st].toLowerCase() + ')</span>' : ''; };
      html += '<section class="bloque"><h2>Equipos</h2><div class="tabla-caja"><table class="tabla-equipos"><thead><tr><th scope="col">Equipo</th>' +
        columnas().map(function (id) { return '<th scope="col">' + conTip(MED[id].nombre, MED[id].que) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        eqs.map(function (eq) {
          var inf = info[eq.nombre] || {}, tipo = inf.tipo === 'proveedor' ? (inf.proveedor || 'Proveedor') : (inf.tipo === 'interno' ? 'Interno' : '');
          var p = problemas(eq), peor = p.critico.length ? 'critico' : p.atencion.length ? 'atencion' : 'bien';
          return '<tr><th scope="row"><span class="eq-nom"><span class="punto punto-' + peor + '" aria-hidden="true"></span><button class="enlace" data-accion="ver" data-e="' + esc(eq.nombre) + '">' + esc(eq.nombre) + '</button></span>' + (tipo ? '<span class="sub">' + esc(tipo) + '</span>' : '') + '</th>' +
            columnas().map(function (id) {
              var m = med(eq, id), v = m && m.disponible ? valor(id, m.valor) : null, st = estadoDe(m);
              return '<td>' + (v ? '<span class="v v-' + st + '">' + esc(v) + marca_(st) + '</span>' : '<span class="apagado">s/d</span>') + '</td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="leyenda-mat"><span class="v v-atencion">Atención</span><span class="v v-critico">Crítico</span><span>Sin color: dentro de lo normal. Cada cifra se compara con lo normal en ese mismo equipo; pulsa un equipo para ver su detalle.</span></p></section>';
    }
    var bloques = [bloqueGrupos(), bloqueIniciativas()].filter(Boolean);
    if (bloques.length) html += '<div class="dos">' + bloques.join('') + '</div>';
    return html;
  }
  function bloqueGrupos() {
    var c = App.r.comparaciones.filter(function (x) { return x.dimension === 'tipo'; })[0];
    if (!c) return '<section class="bloque"><h2>Internos y proveedores</h2><p class="nota">Para comparar, indica qué equipos son de un proveedor en <button class="btn-txt" data-accion="editar" data-e="equipos">Ajustes</button>.</p></section>';
    var g = c.grupos, peor = {}; c.diferencias.forEach(function (d) { peor[d.medida + '|' + d.peor] = 1; });
    var filas = [['plazo_p85', 'Plazo', 'ciclo'], ['retrabajo', 'Retrabajo', 'retrabajo'], ['arrastradas', 'Pasa de sprint', 'arrastradas']].filter(function (f) { return c.medidas[f[0]] && c.medidas[f[0]].disponible; });
    if (!filas.length) return '';
    var cg = N.costeDeGrupos(c, cfgCalculo());
    var capac = function (titulo, f, tip) {
      if (!g.some(function (x) { return f(cg[x.id]) != null; })) return '';
      return '<tr class="fila-coste"><th scope="row">' + conTip(titulo, tip) + '</th>' + g.map(function (x) { var v = f(cg[x.id]); return '<td>' + (v != null ? esc(v) : '<span class="apagado">falta FTE o coste</span>') + '</td>'; }).join('') + '</tr>';
    };
    var filasCoste = capac('Entregas al mes por FTE', function (x) { return x.entregasPorFte != null ? n1(x.entregasPorFte) : null; }, 'Tareas terminadas al mes entre las personas equivalentes (FTE) del grupo, en las últimas 12 semanas.') +
      capac('Coste por entrega', function (x) { return x.costePorEntrega != null ? euros(x.costePorEntrega) : null; }, MED.coste.que);
    return '<section class="bloque"><h2>Internos y proveedores</h2><table class="tabla-grupos"><thead><tr><th scope="col">Medida</th>' + g.map(function (x) { return '<th scope="col">' + esc(x.nombre) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      filas.map(function (f) {
        var seg = c.medidas[f[0]].segmentos[0];
        return '<tr><th scope="row">' + conTip(f[1], MED[f[2]].que) + '</th>' + g.map(function (x) {
          var cel = seg.porGrupo[x.id], v = cel && cel.valor != null ? valor(f[2], cel.valor) : null, mal = peor[f[0] + '|' + x.id];
          return '<td' + (mal ? ' class="peor"' : '') + '>' + (v ? esc(v) + (mal ? ' · peor' : '') : '<span class="apagado">pocos datos</span>') + '</td>';
        }).join('') + '</tr>';
      }).join('') + filasCoste + '</tbody></table><p class="nota">Plazo, retrabajo y paso de sprint, con el mismo tipo y tamaño de tarea. ' + (filasCoste ? 'Entregas y coste, con todo lo terminado en 12 semanas: dependen del tamaño de las tareas. ' : 'Con el FTE y el coste de cada equipo (en <button class="btn-txt" data-accion="editar" data-e="equipos">Ajustes</button>) se ven también entregas por FTE y coste por entrega. ') + 'Es una pregunta para la reunión, no un ranking.</p></section>';
  }
  function textoIni(ev) {
    var x = ev.resultados[0];
    if (!x || !x.disponible) return { e: 'sin', t: 'Aún no hay semanas suficientes después del inicio.' };
    var fmt = (N.MEDIDAS_INICIATIVA[x.medida] || {}).formato || 'num', F = function (v) { return M.formatear(v, fmt); };
    var t = mayus(NOMBRE_INI[x.medida] || x.medida) + ' de ' + F(x.antes) + ' a ' + F(x.despues) + '. Confianza ' + x.confianza + '.';
    return { e: N.conEfecto(ev) ? 'bien' : 'neutro', t: t };
  }
  function bloqueIniciativas() {
    var v = seguimientos();
    if (!v.length) return '<section class="bloque"><h2>Iniciativas</h2><p class="nota">Cuando registréis una iniciativa de mejora, desde una recomendación o en la carpeta iniciativas, aquí veréis si funciona.</p></section>';
    return '<section class="bloque"><h2>Iniciativas</h2>' + v.slice(0, 4).map(function (x) {
      return '<div class="fila-ini"><div><b>' + esc(x.ini.nombre) + '</b><span>' + esc(x.s.texto) + '</span></div>' + chipSeg(x.s.estado) + '</div>';
    }).join('') + '<p class="nota">Se siguen solas con cada carga. <button class="btn-txt" data-accion="vista" data-v="iniciativas">Ver el seguimiento</button></p></section>';
  }
  function vistaEquipo(eq) {
    if (!eq) { App.ver = 'area'; return vistaArea(); }
    var p = problemas(eq, KPI_EQUIPO), fuera = p.critico.concat(p.atencion).map(function (id) { return MED[id].nombre.toLowerCase(); });
    var info = (App.cfg.equiposInfo || {})[eq.nombre] || {};
    var sub = (info.tipo === 'proveedor' ? (info.proveedor || 'Proveedor') + '. ' : info.tipo === 'interno' ? 'Interno. ' : '') + 'Comparado con sus propias 12 semanas anteriores.';
    var recs = recomendaciones().filter(function (x) { return x.equipos.indexOf(eq.nombre) >= 0; });
    var html = '<section class="titular cab-area"><div><button class="btn-txt" data-accion="ver" data-e="area">Volver al área</button><h1>' + esc(eq.nombre) + '</h1><p>' + esc(sub) + '</p></div><div class="cab-acc">' + selector() + '</div></section>';
    html += '<section class="kpis" aria-label="Indicadores del equipo">' + KPI_EQUIPO.concat(hayCoste() ? ['coste'] : []).map(function (id) { return tarjetaKpi(id, med(eq, id), true); }).join('') + '</section>';
    html += '<div class="equipo-abajo"><section class="bloque grafico-plazo"><h2>El plazo, semana a semana</h2><p class="nota">Cuánto tarda el equipo en terminar lo que empieza, semana a semana. La franja es lo normal en este equipo.</p>' + graficoPlazo(eq.medidas.ciclo) + '</section>' +
      bloqueRecEquipo(eq, recs, fuera) + '</div>';
    return html;
  }
  // Las recomendaciones del equipo, si las hay
  function bloqueRecEquipo(eq, recs, fuera) {
    if (!recs.length) return '<section class="bloque bloque-oscuro"><h2>Sin recomendaciones para ' + esc(eq.nombre) + '</h2><p>No hay nada fuera de lo normal que pida actuar.</p></section>';
    return '<section class="bloque bloque-oscuro"><h2>' + (recs.length === 1 ? 'Una recomendación' : (NUMEROS[recs.length] || recs.length) + ' recomendaciones') + ' para ' + esc(eq.nombre) + '</h2>' +
      (fuera.length ? '<p>' + mayus(lista(fuera)) + (fuera.length === 1 ? ' está' : ' están') + ' fuera de lo normal.</p>' : '') +
      '<ol>' + recs.map(function (x) { return '<li>' + esc(x.titulo) + '</li>'; }).join('') + '</ol><button class="btn btn-claro" data-accion="ver-recs" data-e="' + esc(eq.nombre) + '">Ver qué hacer</button></section>';
  }
  function graficoPlazo(m) {
    if (!m || !m.disponible) return '<p class="nota">' + esc((m && m.motivo) || 'Sin datos de plazo.') + '</p>';
    var s = serieUltima(m, 12), sem = App.r.modelo.semanas.slice(-s.length), vals = s.filter(function (x) { return x != null; });
    if (vals.length < 2) return '<p class="nota">Aún no hay semanas suficientes.</p>';
    var lo = m.ref ? m.ref.lo : null, hi = m.ref ? m.ref.hi : null;
    var mn = Math.min.apply(null, vals.concat(lo != null ? [lo] : [])), mx = Math.max.apply(null, vals.concat(hi != null ? [hi] : [])), r = (mx - mn) || 1;
    var w = 700, h = 200, p = 10, X = function (i) { return p + i * (w - 2 * p) / (s.length - 1); }, Y = function (v) { return p + (h - 2 * p) * (1 - (v - mn) / r); };
    var pts = []; s.forEach(function (v, i) { if (v != null) pts.push(X(i).toFixed(1) + ',' + Y(v).toFixed(1)); });
    var ult = s.length - 1; while (ult > 0 && s[ult] == null) ult--;
    var e = estadoDe(m);
    var banda = lo != null ? '<rect class="banda" x="' + p + '" y="' + Y(hi).toFixed(1) + '" width="' + (w - 2 * p) + '" height="' + (Y(lo) - Y(hi)).toFixed(1) + '"/>' : '';
    return '<svg class="grafico" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Plazo de las últimas ' + s.length + ' semanas' + (lo != null ? ', con lo normal entre ' + valor('ciclo', lo) + ' y ' + valor('ciclo', hi) : '') + '">' + banda +
      '<polyline points="' + pts.join(' ') + '"/><circle class="punto-' + e + '" cx="' + X(ult).toFixed(1) + '" cy="' + Y(s[ult]).toFixed(1) + '" r="6"/></svg>' +
      '<div class="eje"><span>' + esc(fechaCorta(sem[0])) + '</span>' + (lo != null ? '<span>Lo normal: ' + esc(rango('ciclo', lo, hi)) + '</span>' : '') + '<span>' + esc(fechaCorta(sem[sem.length - 1])) + '</span></div>';
  }

  // ---------- recomendaciones ----------
  // Salen de los casos del catálogo que se activan con las cifras. Se agrupan si se repiten en varios equipos.
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
    // Diferencias entre grupos: internos y proveedores, o entre proveedores; si no hay, equipos de un área
    var dims = r.casosGrupo.some(function (x) { return x.dimension !== 'area'; }) ? ['tipo', 'proveedor'] : ['area'];
    r.casosGrupo.filter(function (x) { return dims.indexOf(x.dimension) >= 0 && C.casos[x.id]; }).forEach(function (x) {
      var cmp = r.comparaciones.filter(function (c) { return c.dimension === x.dimension && c.ambito === x.ambito; })[0];
      var g = cmp ? cmp.grupos.filter(function (y) { return y.id === x.grupo; })[0] : null;
      var eqs = g ? g.equipos : [x.grupo];
      // Si cada equipo del grupo ya tiene su propia recomendación del mismo tema, no se repite
      if (x.id === 'grupo_calidad' && porId.retrabajo && eqs.every(function (e) { return porId.retrabajo.equipos.indexOf(e) >= 0; })) return;
      if (x.id === 'grupo_agent_ready' && porId.backlog_no_listo && eqs.some(function (e) { return porId.backlog_no_listo.equipos.indexOf(e) >= 0; })) return;
      var nombre = g ? g.nombre : x.grupo;
      out.push({ id: x.id, gravedad: x.gravedad, equipos: eqs, grupo: true, para: (eqs.length === 1 && eqs[0] === nombre ? nombre : nombre + ' (' + lista(eqs) + ')'),
        evidencias: [[null, x.evidencia.replace(/ Comparación: [^.]*\.$/, '')]] });
    });
    out.forEach(function (x) { var c = C.casos[x.id]; x.titulo = c.titulo; x.caso = c; if (!x.para) x.para = lista(x.equipos); });
    out.sort(function (a, b) { return (a.gravedad === 'critico' ? 0 : 1) - (b.gravedad === 'critico' ? 0 : 1) || (b.grupo ? 1 : 0) - (a.grupo ? 1 : 0) || b.equipos.length - a.equipos.length || a.titulo.localeCompare(b.titulo, 'es'); });
    cacheRecs = { r: App.r, v: out };
    return out;
  }
  function claveRec(x) { return x.id + '|' + x.para; }
  function plural(n, uno, varios) { return n === 1 ? uno : varios; }
  function vistaRecomendaciones() {
    var todas = recomendaciones(), funcionan = App.r.iniciativas.filter(function (x) { return N.conEfecto(x.evaluacion); });
    var filtro = App.recEquipo && App.recEquipo !== 'todos' ? App.recEquipo : null;
    var recs = filtro ? todas.filter(function (x) { return x.equipos.indexOf(filtro) >= 0; }) : todas;
    var sel = recs.filter(function (x) { return claveRec(x) === App.recSel; })[0] || recs[0];
    var afectados = {}; todas.forEach(function (x) { x.equipos.forEach(function (e) { afectados[e] = 1; }); });
    var nEq = Object.keys(afectados).length, crit = todas.filter(function (x) { return x.gravedad === 'critico'; }).length;
    var resumen = todas.length ? todas.length + ' ' + plural(todas.length, 'recomendación', 'recomendaciones') + ' para ' + nEq + ' ' + plural(nEq, 'equipo', 'equipos') +
      (crit ? ', ' + crit + ' ' + plural(crit, 'crítica', 'críticas') : '') + '. Primero lo más grave y lo que afecta a más equipos.' : 'Todas las cifras están dentro de lo normal en cada equipo.';
    var opciones = '<option value="todos">Todos los equipos</option>' + App.r.modelo.equipos.map(function (e) { return '<option value="' + esc(e.nombre) + '"' + (filtro === e.nombre ? ' selected' : '') + '>' + esc(e.nombre) + '</option>'; }).join('');
    var html = '<section class="titular"><div><h1>Qué hacer, por orden</h1><p>' + esc(resumen) + '</p></div>' +
      '<div class="rec-filtros"><label class="selector">Ver <select data-cambio="rec-equipo" aria-label="Equipo">' + opciones + '</select></label>' +
      '</div></section>';
    html += funcionan.map(function (x) { return '<div class="funciona"><span class="chip chip-bien-fuerte">Funciona</span><p><b>' + esc(x.iniciativa.nombre) + '.</b> ' + esc(textoIni(x.evaluacion).t) + ' Merece la pena seguir.</p></div>'; }).join('');
    if (!recs.length) {
      html += '<section class="bloque"><h2>' + (filtro ? 'Sin recomendaciones para ' + esc(filtro) : 'Nada que pida actuar ahora') + '</h2><p class="nota">' + (filtro ? 'Sus cifras están dentro de lo normal.' : 'Todas las cifras están dentro de lo normal en cada equipo.') + '</p></section>';
      return html;
    }
    var items = recs.map(function (x) {
      var n = todas.indexOf(x) + 1, k = claveRec(x);
      return '<button class="rec-item" data-accion="rec" data-k="' + esc(k) + '"' + (x === sel ? ' aria-current="true"' : '') + '><span class="rec-n">' + n + '</span>' +
        '<span class="rec-item-txt"><b>' + esc(x.titulo) + '</b><small>' + esc(x.para) + '</small></span>' + chip(x.gravedad) + '</button>';
    }).join('');
    html += '<div class="recs-md"><nav class="recs-lista" aria-label="Recomendaciones">' + items + '</nav>' +
      '<article class="rec rec-detalle" id="rec-detalle" aria-live="polite">' + detalleRec(sel, todas.indexOf(sel) + 1) + '</article></div>';
    html += '<p class="nota">Las recomendaciones salen del banco de casos a partir de vuestras cifras. Conviene revisarlas con los responsables de equipo antes de ponerlas en marcha.</p>';
    return html;
  }
  function idIniciativa(x) { return 'rec-' + x.id + '-' + slug(x.equipos.join('-')); }
  function registrable(x) { return !!(x.caso.medida && N.MEDIDAS_INICIATIVA[x.caso.medida] && C.medidas[x.caso.medida]); }
  function nombreMedida(id) { return MED[id] ? MED[id].nombre : (C.medidas[id] ? C.medidas[id].nombre : id); }
  function hoyTexto() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }
  function registrar(clave) {
    var x = recomendaciones().filter(function (r) { return claveRec(r) === clave; })[0];
    if (!x || !registrable(x)) return;
    var c = x.caso, def = C.medidas[c.medida];
    var ini = {
      id: idIniciativa(x), nombre: c.titulo + ': ' + lista(x.equipos), descripcion: c.plan[0].paso, fecha_inicio: hoyTexto(), fecha_fin: null,
      equipos: x.equipos.slice(), medidas_objetivo: [{ medida: c.medida, direccion: def.dir === 'mas' ? 'subir' : 'bajar' }],
      efecto_esperado: c.comprobar, estado: 'planificada', origen: x.id, evaluacion: null, notas: 'Registrada desde las recomendaciones.'
    };
    App.cfg.iniciativas = (App.cfg.iniciativas || []).filter(function (i) { return i.id !== ini.id; }).concat([ini]);
    guardarCfg();
    escribirEnCarpeta('iniciativas', ini.id + '.json', JSON.stringify(ini, null, 2));
    var y = window.scrollY;
    enSegundoPlano(function () { recalcular(); render(); window.scrollTo(0, y); aviso('Iniciativa registrada. Su evolución se ve en el tablero, en Iniciativas.'); });
  }
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function miles(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function listaAvisos() {
    var vistos = {};
    App.lectura.informe.avisos.concat(App.det.avisos).forEach(function (a) { vistos[a.texto] = 1; });
    App.r.modelo.equipos.forEach(function (e) { e.calidad.avisos.forEach(function (a) { vistos[a] = 1; }); });
    return Object.keys(vistos);
  }
  function medTip(id) {
    if (MED[id]) return MED[id].que;
    var d = C.medidas[id];
    return d ? d.como + (d.dir ? ' Mejor cuanto ' + (d.dir === 'menos' ? 'más bajo.' : 'más alto.') : '') : '';
  }
  function conTip(texto, tip) { return tip ? '<span class="con-tip" tabindex="0" data-tip="' + esc(tip) + '">' + texto + '</span>' : texto; }
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

  // ---------- seguimiento automático de iniciativas ----------
  var cacheSeg = { r: null, v: null };
  function seguimientos() {
    if (!App.r) return [];
    if (cacheSeg.r === App.r) return cacheSeg.v;
    var v = App.r.iniciativas.map(function (x) { return { ini: x.iniciativa, ev: x.evaluacion, s: N.seguimiento(x.iniciativa, x.evaluacion, App.r.preparacion) }; });
    var orden = { empeora: 0, funciona: 1, sin_efecto: 2, midiendo: 3, planificada: 4, sin_datos: 5 };
    v.sort(function (a, b) { return orden[a.s.estado] - orden[b.s.estado] || a.ini.nombre.localeCompare(b.ini.nombre, 'es'); });
    cacheSeg = { r: App.r, v: v };
    return v;
  }
  var EST_SEG = {
    funciona: ['bien-fuerte', 'Funciona'], sin_efecto: ['neutro', 'Sin efecto claro'], empeora: ['critico', 'Va a peor'],
    midiendo: ['sin', 'Midiendo'], planificada: ['sin', 'Planificada'], sin_datos: ['sin', 'Sin datos']
  };
  function chipSeg(e) { var x = EST_SEG[e] || EST_SEG.sin_datos; return '<span class="chip chip-' + x[0] + '">' + x[1] + '</span>'; }
  function fmtSeg(s, v) { return v == null ? 's/d' : M.formatear(v, s.formato); }
  // Gráfico de la medida objetivo: la iniciativa frente al resto, con el inicio y la ventana que se evalúa
  function graficoSeg(s) {
    var pts = s.serie.filter(function (p) { return p.iniciativa != null || p.control != null; });
    if (pts.length < 3) return '<p class="nota">Aún no hay semanas suficientes para dibujar la evolución.</p>';
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
    var desc = 'Evolución de ' + nombreMedida(s.medida).toLowerCase() + ': equipos de la iniciativa frente al resto';
    return '<svg class="seg-graf" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(desc) + '">' +
      (s.inicio.getTime() <= t1 ? '<rect class="seg-margen" x="' + xi.toFixed(1) + '" y="' + ar + '" width="' + Math.max(0, xd - xi).toFixed(1) + '" height="' + (h - ar - ab) + '"/>' +
        (xc > xd ? '<rect class="seg-ventana" x="' + xd.toFixed(1) + '" y="' + ar + '" width="' + (xc - xd).toFixed(1) + '" height="' + (h - ar - ab) + '"/>' : '') +
        '<line class="seg-inicio" x1="' + xi.toFixed(1) + '" x2="' + xi.toFixed(1) + '" y1="' + (ar - 6) + '" y2="' + (h - ab) + '"/><text class="seg-et" x="' + (xi + 4).toFixed(1) + '" y="' + (ar + 4) + '">Inicio</text>' : '') +
      '<polyline class="seg-resto" points="' + linea('control') + '"/><polyline class="seg-ini" points="' + linea('iniciativa') + '"/>' +
      (ult ? '<circle class="seg-punto" cx="' + X(ult.fecha).toFixed(1) + '" cy="' + Y(ult.iniciativa).toFixed(1) + '" r="5"/>' : '') +
      '<text class="seg-eje" x="0" y="' + (ar + 4) + '">' + esc(fmtSeg(s, mx)) + '</text><text class="seg-eje" x="0" y="' + (h - ab) + '">' + esc(fmtSeg(s, mn)) + '</text>' +
      '<text class="seg-eje" x="' + iz + '" y="' + (h - 6) + '">' + esc(fechaCorta(pts[0].fecha)) + '</text><text class="seg-eje" x="' + (w - de) + '" y="' + (h - 6) + '" text-anchor="end">' + esc(fechaCorta(pts[pts.length - 1].fecha)) + '</text>' +
      '</svg><p class="seg-leyenda"><span class="sl sl-ini"></span>Equipos de la iniciativa <span class="sl sl-resto"></span>Resto de equipos <span class="sl sl-margen"></span>Dos semanas de margen <span class="sl sl-ventana"></span>Ventana que se evalúa</p>';
  }
  // Antes y después cuando ya hay evaluación; si no, cómo está ahora la medida en los equipos y en el resto
  function cifrasSeg(s) {
    var celda = function (et, v, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + et + '</span><b>' + esc(fmtSeg(s, v)) + '</b></div>'; };
    if (s.antes != null && s.despues != null) {
      return '<div class="seg-cifras">' + celda('Antes', s.antes) + '<span class="seg-fl" aria-hidden="true">→</span>' + celda('Después', s.despues) +
        (s.control && s.control.despues != null ? celda('Resto, después', s.control.despues, 'seg-ctrl') : '') + '</div>';
    }
    var ult = s.serie.filter(function (p) { return p.iniciativa != null; }).pop();
    if (!ult) return '';
    return '<div class="seg-cifras">' + celda('Ahora en estos equipos', ult.iniciativa) + (ult.control != null ? celda('Ahora en el resto', ult.control, 'seg-ctrl') : '') + '</div>';
  }
  // ---------- cómo se evalúa una iniciativa, paso a paso y con sus cifras ----------
  function resultadoEval(x) {
    var r = (x.ev.resultados || []).filter(function (y) { return y.medida === x.s.medida; })[0] || x.ev.resultados[0];
    return r && r.disponible && r.ventanas && r.antes != null && r.despues != null ? r : null;
  }
  function fmtDif(s, v) {
    if (v == null) return 's/d';
    var signo = v > 0.0000001 ? '+' : v < -0.0000001 ? '\u2212' : '', a = Math.abs(v);
    if (s.formato === 'pct') { var p = Math.round(a * 100); return signo + p + ' ' + plural(p, 'punto', 'puntos'); }
    return signo + M.formatear(a, s.formato);
  }
  function lineaEval(r, foco) {
    var v = r.ventanas, dia = 864e5, menos1 = function (d) { return new Date(d.getTime() - dia); };
    var ant = (v.antes.hasta - v.antes.desde) / dia, mar = (v.despues.desde - v.antes.hasta) / dia, des = Math.max((v.despues.hasta - v.despues.desde) / dia, 7);
    var seg = function (cls, dias, et, sub) { return '<div class="v-tl-seg v-tl-' + cls + (foco === cls ? ' on' : '') + '" style="flex:' + dias + '"><b>' + et + '</b><small>' + sub + '</small></div>'; };
    return '<div class="v-tl pe" style="--d:1">' + seg('antes', ant, 'Antes', fechaCorta(v.antes.desde) + ' a ' + fechaCorta(menos1(v.antes.hasta))) +
      seg('margen', mar, 'Margen', 'no cuenta') + seg('despues', des, 'Después', fechaCorta(v.despues.desde) + ' a ' + fechaCorta(menos1(v.despues.hasta))) + '</div>';
  }
  // Cómo se ha evaluado una iniciativa, con sus cifras: antes, margen, después, el resto de equipos, efecto y confianza
  function detalleEval(x) {
    var s = x.s, ini = x.ini, r = resultadoEval(x), F = function (v) { return fmtSeg(s, v); }, D = function (v) { return fmtDif(s, v); };
    if (s.formato === 'pct') {
      var dec = function (v) { return (Math.round(v * 1000) / 10).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
      F = function (v) { return v == null ? 's/d' : dec(v) + '%'; };
      D = function (v) { return v == null ? 's/d' : (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '') + dec(Math.abs(v)) + ' puntos'; };
    }
    var nom = nombreMedida(s.medida).toLowerCase(), eqs = lista(ini.equipos), m = r.muestra || { antes: 0, despues: 0, controlAntes: 0, controlDespues: 0 };
    var W = Math.round((r.ventanas.antes.hasta - r.ventanas.antes.desde) / (7 * 864e5));
    var hayCtrl = !!(r.control && r.control.antes != null && r.control.despues != null);
    var cambio = r.despues - r.antes, cambioCtrl = hayCtrl ? r.control.despues - r.control.antes : 0;
    var tareas = function (n) { return miles(n) + ' ' + plural(n, 'tarea terminada', 'tareas terminadas'); };
    var fila = function (et, a, d, n, cls) {
      return '<div class="v-fila' + (cls ? ' ' + cls : '') + '"><span>' + et + '<small>' + n + '</small></span><b>' + F(a) + '</b><i aria-hidden="true">→</i><b>' + F(d) + '</b><em>' + D(d - a) + '</em></div>';
    };
    var veces = r.ruido ? Math.abs(r.efecto) / r.ruido : null, nMin = Math.min(m.antes, m.despues);
    var check = function (ok, titulo, sub) {
      return '<div class="v-check"><span class="v-ico ' + (ok ? 'ok' : 'aviso') + '" aria-hidden="true">' + (ok ? CHECK : '!') + '</span><div><b>' + titulo + '</b><span>' + sub + '</span></div></div>';
    };
    var paso = function (n, titulo, texto, visual) { return '<li class="ev-paso"><div class="ev-cab"><span class="paso-n">' + n + '</span><div><b>' + titulo + '</b><p>' + texto + '</p></div></div><div class="ev-visual">' + visual + '</div></li>'; };
    return '<ol class="ev-pasos">' +
      paso(1, 'Antes de empezar', 'Se toma ' + esc(nom) + ' de ' + esc(eqs) + ' en las ' + W + ' semanas anteriores al inicio, el ' + esc(fechaCorta(s.inicio)) + '.',
        lineaEval(r, 'antes') + '<div class="v-filas"><div class="v-fila"><span>' + esc(eqs) + '<small>' + tareas(m.antes) + '</small></span><b>' + F(r.antes) + '</b></div></div>') +
      paso(2, 'Dos semanas de margen', 'Un cambio tarda en notarse. Del ' + esc(fechaCorta(s.inicio)) + ' al ' + esc(fechaCorta(s.desdeDespues)) + ' no cuenta, ni para bien ni para mal.', lineaEval(r, 'margen')) +
      paso(3, 'Después', 'La misma medida en las ' + W + ' semanas siguientes' + (r.ventanas.completa ? '.' : ', que aún no se han completado.'),
        lineaEval(r, 'despues') + '<div class="v-filas">' + fila(esc(eqs), r.antes, r.despues, tareas(m.despues) + ' después', '') + '</div>') +
      paso(4, 'El resto de equipos', 'En las mismas fechas, ¿cambió también el resto? Así se descuenta lo que afecta a todos, como vacaciones o picos de trabajo.',
        '<div class="v-filas">' + fila(esc(eqs), r.antes, r.despues, 'equipos de la iniciativa', '') +
        (hayCtrl ? fila('El resto de equipos', r.control.antes, r.control.despues, tareas(m.controlDespues) + ' después', 'v-fila-ctrl') : '<p class="v-mas">No hay otros equipos con los que comparar.</p>') + '</div>') +
      paso(5, 'Efecto propio', 'Es el cambio de los equipos de la iniciativa menos el cambio del resto en las mismas fechas. ' + (r.enDireccionEsperada ? 'Va en la dirección buscada.' : 'Va en contra de lo buscado.'),
        '<div class="v-ecu"><span>' + D(cambio) + '<small>la iniciativa</small></span><i aria-hidden="true">−</i><span>' + (cambioCtrl < 0 ? '(' + D(cambioCtrl) + ')' : D(cambioCtrl)) + '<small>el resto</small></span><i aria-hidden="true">=</i><span class="v-ecu-res">' + D(r.efecto) + '<small>efecto propio</small></span></div>') +
      paso(6, 'Confianza ' + esc(r.confianza || 'baja'), 'El efecto se compara con lo que ' + esc(nom) + ' suele variar sola en estos equipos, y se mira cuántas tareas hay detrás.',
        '<div class="v-checks">' +
        check(veces != null && veces >= 1, veces != null ? 'El efecto es ' + (Math.round(veces * 10) / 10).toLocaleString('es-ES') + ' veces lo que varía sola' : 'No hay historia para saber cuánto varía sola', veces != null ? 'Varía sola unos ' + D(r.ruido).replace(/^\+/, '') + '. Confianza alta desde el doble.' : 'Hacen falta varias ventanas anteriores al inicio.') +
        check(nMin >= 10, miles(nMin) + ' ' + plural(nMin, 'tarea', 'tareas') + ' en la ventana más pequeña', 'Media desde 10 tareas; alta desde 20.') +
        check(r.ventanas.completa, r.ventanas.completa ? 'Ventana de después completa' : 'Ventana de después aún incompleta', r.ventanas.completa ? 'Las ' + W + ' semanas ya tienen datos.' : 'Completa el ' + esc(fechaCorta(s.completaEl)) + '.') + '</div>') +
      '</ol><p class="nota">No es un experimento controlado: dice si merece seguir, no demuestra la causa.</p>';
  }

  // En qué consiste la iniciativa: qué se hace, por qué y qué se espera. Si viene de una recomendación, su plan entero.
  function fichaIni(ini, caso) {
    var desdeRec = caso && caso.plan && caso.plan.length && ini.descripcion === caso.plan[0].paso;
    var hace = desdeRec ? '<ol>' + caso.plan.map(function (p) { return '<li>' + esc(p.paso) + '</li>'; }).join('') + '</ol>' : '<p>' + esc(ini.descripcion || 'Sin descripción.') + '</p>';
    var parte = function (et, html) { return html ? '<div><h3 class="seg-h3">' + et + '</h3>' + html + '</div>' : ''; };
    return '<div class="seg-ficha">' + parte('En qué consiste', hace) + parte('Por qué', caso && caso.senal ? '<p>' + esc(caso.senal) + '</p>' : '') +
      parte('Qué se espera', ini.efecto_esperado ? '<p>' + esc(ini.efecto_esperado) + '</p>' : '') + '</div>';
  }
  // Una iniciativa se puede quitar desde la página si se registró aquí (vive en la configuración), no si viene de la carpeta
  function propiaIni(id) { return (App.cfg.iniciativas || []).some(function (i) { return i.id === id; }); }
  function tarjetaSeg(x) {
    var s = x.s, ini = x.ini, caso = C.casos[ini.origen];
    var dato = function (et, v) { return '<div><dt>' + et + '</dt><dd>' + v + '</dd></div>'; };
    var progreso = s.estado === 'planificada' ? 0 : s.progreso;
    var origen = caso ? ', desde la recomendación «' + esc(caso.titulo) + '»' : (propiaIni(ini.id) ? ', registrada en esta página' : ', de la carpeta iniciativas');
    var k = 'ev|' + ini.id;
    return '<article class="seg" data-ini="' + esc(ini.id) + '">' +
      '<header class="seg-cab"><div><h2>' + esc(ini.nombre) + '</h2><p>' + esc(lista(ini.equipos)) + origen + '</p></div><div class="seg-cab-acc">' + chipSeg(s.estado) +
      (propiaIni(ini.id) ? '<button class="btn-txt" data-accion="quitar-ini" data-i="' + esc(ini.id) + '">Quitar</button>' : '') + '</div></header>' +
      fichaIni(ini, caso) +
      '<div class="seg-cuerpo"><div class="seg-datos"><h3 class="seg-h3">Cómo va</h3><p class="seg-texto">' + esc(s.texto) + '</p>' +
      cifrasSeg(s) +
      '<dl class="seg-dl">' + dato('Medida objetivo', nomMed(s.medida) + ', ' + s.direccion) + dato('Inicio', esc(fechaCorta(s.inicio))) +
      dato('Se mide desde', esc(fechaCorta(s.desdeDespues))) + dato('Evaluación completa', esc(fechaCorta(s.completaEl))) + (s.confianza ? dato('Confianza', s.confianza) : '') + '</dl>' +
      '<div class="seg-prog" role="progressbar" aria-label="Ventana evaluada" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(progreso * 100) + '"><span style="transform:scaleX(' + progreso.toFixed(3) + ')"></span></div>' +
      '<p class="nota">' + (s.completa ? 'Ventana de evaluación completa.' : Math.round(progreso * 100) + '% de la ventana de evaluación con datos.') + '</p></div>' +
      '<div class="seg-grafico">' + graficoSeg(s) + '</div></div>' +
      (resultadoEval(x) ? '<details class="seg-eval" data-k="' + esc(k) + '"' + (App.abiertas[k] ? ' open' : '') + '><summary>Cómo se ha evaluado</summary>' + detalleEval(x) + '</details>' : '') +
      '</article>';
  }
  // Alta de una iniciativa desde la página: lo mismo que se registra desde una recomendación, pero escrito a mano
  function formularioIni() {
    var eqs = App.r.modelo.equipos.map(function (e) { return e.nombre; });
    var medidas = Object.keys(N.MEDIDAS_INICIATIVA).filter(function (id) { return C.medidas[id]; });
    var hoy = hoyTexto();
    return '<form class="bloque form-ini" id="form-ini" data-accion-form="guardar-ini"><h2>Nueva iniciativa</h2>' +
      '<p class="nota">Un cambio que se prueba en uno o varios equipos, con una medida objetivo. Desde que se registra, cada carga de datos recalcula su efecto frente a los equipos que no la tienen.</p>' +
      '<div class="form-grid">' +
      '<label class="campo-linea">Nombre <input type="text" name="nombre" required maxlength="120" placeholder="Por ejemplo, límite de trabajo en curso en Pagos"></label>' +
      '<label class="campo-linea">Fecha de inicio <input type="date" name="fecha_inicio" required value="' + hoy + '"></label>' +
      '<label class="campo-linea">Fecha de fin (opcional) <input type="date" name="fecha_fin"></label>' +
      '<label class="campo-linea">Medida objetivo <select name="medida">' + medidas.map(function (id) { var d = C.medidas[id]; return '<option value="' + esc(id) + '">' + esc(nombreMedida(id)) + ' (' + (d.dir === 'mas' ? 'subir' : 'bajar') + ')</option>'; }).join('') + '</select></label>' +
      '<label class="campo-linea form-ancho">En qué consiste <textarea name="descripcion" rows="2" maxlength="600" placeholder="Qué se cambia y quién lo hace"></textarea></label>' +
      '<label class="campo-linea form-ancho">Qué se espera <input type="text" name="efecto_esperado" maxlength="300" placeholder="Por ejemplo, que el plazo baje a lo normal en ocho semanas"></label>' +
      '<fieldset class="form-ancho form-eqs"><legend>Equipos</legend>' + eqs.map(function (e) { return '<label><input type="checkbox" name="equipos" value="' + esc(e) + '"> ' + esc(e) + '</label>'; }).join('') + '</fieldset>' +
      '</div><p class="botones"><button type="submit" class="btn">Registrar la iniciativa</button><button type="button" class="btn btn-sec" data-accion="cancelar-ini">Cancelar</button></p></form>';
  }
  function guardarIni(form) {
    var d = function (n) { var el = form.elements[n]; return el ? String(el.value || '').trim() : ''; };
    var equipos = [].map.call(form.querySelectorAll('input[name="equipos"]:checked'), function (c) { return c.value; });
    if (!d('nombre')) { aviso('Ponle un nombre a la iniciativa.'); return; }
    if (!equipos.length) { aviso('Elige al menos un equipo.'); return; }
    if (!d('fecha_inicio')) { aviso('Indica la fecha de inicio.'); return; }
    var medida = d('medida'), def = C.medidas[medida];
    if (!def) { aviso('Elige la medida objetivo.'); return; }
    var ini = {
      id: 'ini-' + slug(d('nombre')).slice(0, 40) + '-' + d('fecha_inicio'), nombre: d('nombre'), descripcion: d('descripcion') || null, fecha_inicio: d('fecha_inicio'), fecha_fin: d('fecha_fin') || null,
      equipos: equipos, medidas_objetivo: [{ medida: medida, direccion: def.dir === 'mas' ? 'subir' : 'bajar' }],
      efecto_esperado: d('efecto_esperado') || null, estado: 'planificada', origen: null, evaluacion: null, notas: 'Registrada desde la página.'
    };
    if (ini.fecha_fin && ini.fecha_fin < ini.fecha_inicio) { aviso('La fecha de fin no puede ser anterior al inicio.'); return; }
    App.cfg.iniciativas = (App.cfg.iniciativas || []).filter(function (i) { return i.id !== ini.id; }).concat([ini]);
    guardarCfg();
    escribirEnCarpeta('iniciativas', ini.id + '.json', JSON.stringify(ini, null, 2));
    App.nuevaIni = false;
    enSegundoPlano(function () { recalcular(); render(); window.scrollTo(0, 0); aviso('Iniciativa registrada. Se mide sola con cada carga de datos.'); });
  }
  function quitarIni(id) {
    var ini = (App.cfg.iniciativas || []).filter(function (i) { return i.id === id; })[0];
    if (!ini) return;
    if (!window.confirm('¿Quitar la iniciativa «' + ini.nombre + '»? Se deja de medir. Si está en la carpeta iniciativas, borra también su fichero.')) return;
    App.cfg.iniciativas = App.cfg.iniciativas.filter(function (i) { return i.id !== id; });
    guardarCfg();
    enSegundoPlano(function () { recalcular(); render(); aviso('Iniciativa quitada.'); });
  }
  function vistaIniciativas() {
    var v = seguimientos();
    var cuenta = {}; v.forEach(function (x) { cuenta[x.s.estado] = (cuenta[x.s.estado] || 0) + 1; });
    var html = '<section class="titular"><div><h1>Iniciativas</h1><p>Cada iniciativa se mide sola con cada carga de datos: estado, evolución de la medida y cuándo estará completa la evaluación.</p>' +
      (v.length ? '<div class="seg-resumen">' + ['funciona', 'sin_efecto', 'empeora', 'midiendo', 'planificada'].filter(function (k) { return cuenta[k]; }).map(function (k) { return '<span>' + chipSeg(k) + ' ' + cuenta[k] + '</span>'; }).join('') + '</div>' : '') + '</div>' +
      '<div class="cab-acc">' + (App.nuevaIni ? '' : '<button class="btn" data-accion="nueva-ini">Nueva iniciativa</button>') + '</div></section>';
    if (App.nuevaIni) html += formularioIni();
    if (!v.length) {
      return html + (App.nuevaIni ? '' : '<section class="bloque estrecho"><h2>Aún no hay iniciativas</h2><p>Una iniciativa es un cambio que se prueba en uno o varios equipos, con una medida objetivo. Se registra desde una recomendación, con el botón Nueva iniciativa, o dejando un fichero en la carpeta iniciativas.</p>' +
        '<p class="botones"><button class="btn" data-accion="nueva-ini">Nueva iniciativa</button><button class="btn btn-sec" data-accion="vista" data-v="recomendaciones">Ver las recomendaciones</button></p></section>');
    }
    html += v.map(tarjetaSeg).join('');
    html += '<p class="nota">Cómo se evalúa: la medida en las semanas antes del inicio frente a las mismas semanas después, dejando dos semanas de margen, y el cambio de los equipos de la iniciativa frente al del resto. Cada tarjeta lo detalla con sus cifras en «Cómo se ha evaluado».</p>';
    return html;
  }
  function guardarSeguimiento() {
    if (!App.carpeta || !App.r || !App.r.iniciativas.length) return;
    var foto = seguimientos().map(function (x) { return { id: x.ini.id, nombre: x.ini.nombre, estado: x.s.estado, texto: x.s.texto, antes: x.s.antes, despues: x.s.despues, confianza: x.s.confianza, progreso: x.s.progreso }; });
    escribirEnCarpeta('historico', 'iniciativas-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ fecha: new Date().toISOString(), iniciativas: foto }, null, 1));
  }

  // ---------- fiabilidad de los datos ----------
  var cacheFiab = { r: null, v: null };
  function fiab() {
    if (cacheFiab.r === App.r) return cacheFiab.v;
    // Para la fiabilidad cuentan como confirmados solo los estados que alguien ha fijado, no las propuestas de la detección
    var c = cfgCalculo(), m = {};
    if (!App.cfg.mapeoEstados && App.cfg.etapas) Object.assign(m, N.etapasV0AMapeo(App.cfg.etapas, App.det.mapeoEstados));
    c.mapeoEstados = Object.assign(m, App.cfg.mapeoEstados || {});
    var v = N.fiabilidad(App.lectura, App.r.det, App.r.preparacion, App.r.modelo, c);
    cacheFiab = { r: App.r, v: v };
    return v;
  }
  var NIVEL = { alta: ['bien', 'Alta'], media: ['atencion', 'Media'], baja: ['critico', 'Baja'] };
  function estadoArea(fuera) {
    var f = fiab(), n = NIVEL[f.nivel], rev = f.comprobaciones.filter(function (c) { return c.estado === 'revisar'; });
    var txt = !rev.length ? f.bien + ' de ' + f.comprobaciones.length + ' comprobaciones de los datos bien.' :
      rev.length <= 3 ? 'Por revisar: ' + lista(rev.map(function (c) { return c.nombre.toLowerCase(); })) + '.' : rev.length + ' de ' + f.comprobaciones.length + ' comprobaciones de los datos por revisar.';
    var izq = '<div class="fiab-tira fiab-' + f.nivel + '"><span class="chip chip-' + n[0] + '">Fiabilidad ' + n[1].toLowerCase() + '</span><span>' + esc(txt) + '</span><button class="btn-txt" data-accion="fiabilidad">Ver la fiabilidad</button></div>';
    var criticos = fuera.filter(function (e) { return problemas(e).critico.length; }), foco = criticos.length ? criticos : fuera, resto = fuera.length - foco.length;
    var der = '<div class="fuera"><span class="fuera-tit">' + (foco.length ? 'Necesitan atención' : 'Todos los equipos dentro de lo normal') + '</span>' + foco.map(function (e) {
      var g = problemas(e).critico.length ? 'critico' : 'atencion';
      return '<button class="pill-eq" data-accion="ver" data-e="' + esc(e.nombre) + '"><span class="punto punto-' + g + '" aria-hidden="true"></span>' + esc(e.nombre) + '<span class="sr"> (' + ESTADO[g].toLowerCase() + ')</span></button>';
    }).join('') + (resto ? '<span class="fuera-mas">y ' + resto + ' ' + plural(resto, 'equipo', 'equipos') + ' con algún aviso</span>' : '') + '</div>';
    return '<section class="estado-area" aria-label="Estado del área">' + izq + der + '</section>';
  }
  var ICO_EST = { bien: CHECK, revisar: '!', sin: '' };
  var COLS_FIAB = { tiempos: 'Tiempo en cada estado', flujo: 'Pasan por en curso', registro: 'Registro a tiempo', estimacion: 'Historias estimadas', sprints: 'Sprints creíbles', historia: 'Historia' };
  // ---------- datos: fiabilidad y cómo se ha leído el export ----------
  var SECCIONES_DATOS = [['fiabilidad', 'Fiabilidad'], ['lectura', 'Cómo se ha leído el export']];
  function vistaDatos() {
    var s = SECCIONES_DATOS.some(function (x) { return x[0] === App.datos; }) ? App.datos : 'fiabilidad';
    var html = '<section class="titular"><div><h1>Datos</h1><p>Si la herramienta no refleja bien el trabajo, las cifras tampoco. Aquí se ve qué hay que revisar y qué se ha leído del export.</p></div></section>' +
      '<nav class="subnav" aria-label="Secciones de Datos">' + SECCIONES_DATOS.map(function (x) {
        return '<button class="subnav-b" data-accion="datos-sec" data-s="' + x[0] + '"' + (x[0] === s ? ' aria-current="page"' : '') + '>' + x[1] + '</button>';
      }).join('') + '</nav>';
    return html + (s === 'lectura' ? secLectura() : secFiabilidad());
  }
  function secFiabilidad() {
    var f = fiab(), n = NIVEL[f.nivel];
    var html = '<section class="bloque fiab-cab"><div class="fiab-nivel fiab-' + f.nivel + '"><span>Fiabilidad</span><b>' + n[1] + '</b></div><div><h2>Fiabilidad de los datos</h2>' +
      '<p>' + f.bien + ' de ' + f.comprobaciones.length + ' comprobaciones están bien' + (f.revisar ? ' y ' + f.revisar + (f.revisar === 1 ? ' hay que revisarla' : ' hay que revisarlas') : '') + '. Las comprobaciones no cambian ninguna cifra: avisan.</p>' +
      '<p class="nota">Alta: como mucho una comprobación por revisar. Media: dos o tres, o falta el tiempo en cada estado. Baja: cuatro o más, o menos de la mitad de las tareas tiene equipo.</p></div></section>';
    html += '<div class="fiab-grid">' + f.comprobaciones.map(function (c) {
      return '<article class="fiab-c fiab-' + c.estado + '"><div class="fiab-c-cab"><span class="v-ico ' + (c.estado === 'bien' ? 'ok' : c.estado === 'revisar' ? 'aviso' : 'pend') + '" aria-hidden="true">' + ICO_EST[c.estado] + '</span>' +
        '<h3>' + conTip(esc(c.nombre), c.que) + '</h3><b class="fiab-valor">' + esc(c.valor) + '</b></div>' +
        '<p>' + esc(c.detalle) + '</p><p class="nota">Bien desde: ' + esc(c.umbral) + '.' + (c.estado === 'revisar' ? ' <b>Cómo se arregla:</b> ' + esc(c.arreglo) : '') + '</p></article>';
    }).join('') + '</div>';
    var COLS = COLS_FIAB;
    var queDe = {}; f.comprobaciones.forEach(function (c) { queDe[c.id] = c.que; });
    html += '<section class="bloque"><h2>Por equipo</h2><div class="tabla-caja"><table class="tabla-fiab"><thead><tr><th scope="col">Equipo</th>' +
      Object.keys(COLS).map(function (k) { return '<th scope="col">' + conTip(COLS[k], queDe[k]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      f.porEquipo.map(function (e) {
        return '<tr><th scope="row">' + esc(e.equipo) + '</th>' + Object.keys(COLS).map(function (k) { var x = e.valores[k]; return '<td><span class="fv fv-' + x.estado + '">' + esc(x.valor) + '</span></td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><p class="nota">En rojo, lo que conviene revisar con ese equipo. Se miran las últimas 16 semanas.</p></section>';
    html += '<section class="bloque"><h2>Avisos de los datos</h2>' + calidad() + '</section>';
    return html;
  }
  // Cómo se ha leído el export: ficheros, qué resuelve la página sola y qué hay que confirmar, cuánta historia trae y columna a columna
  function secLectura() {
    var inf = App.lectura.informe, det = App.det, desde = det.fechaMin, hasta = new Date(Math.min(det.fechaRef, det.fechaMax));
    var html = '<section class="bloque"><h2>Ficheros</h2><p>' + esc(inf.ficheros.map(function (f) { return f.nombre; }).join(', ')) + ': ' + miles(inf.tareas) + ' tareas del ' + esc(fechaCorta(desde)) + ' al ' + esc(fechaCorta(hasta)) +
      (inf.duplicadas ? ', ' + miles(inf.duplicadas) + ' repetidas que cuentan una vez' : '') + (inf.epicas + inf.subtareas ? ', ' + miles(inf.epicas + inf.subtareas) + ' épicas y subtareas fuera del cálculo' : '') + '.</p>' +
      (App.origen === 'carpeta' || App.origen === 'datosjs' ? '<p class="nota">Leídos de la carpeta. Para actualizar, deja el export nuevo en exports y pulsa Actualizar.</p>' : '') + '</section>';
    html += '<section class="bloque">' + hallazgosExport() + '</section>';
    html += '<section class="bloque">' + historiaExport() + '</section>';
    var cols = columnasLeidas();
    if (cols) html += '<section class="bloque">' + cols + '</section>';
    return html;
  }

  // ---------- ajustes ----------
  // Lo que no se puede detectar (proveedores, áreas, FTE, coste) y lo que se quiera corregir (campo de equipo, estados).
  // Se guarda en el navegador y, con la carpeta, en configuracion/cliente.json.
  function vistaAjustes() {
    var r = App.r, det = App.det, eqs = r.modelo.equipos.map(function (e) { return e.nombre; });
    var info = App.cfg.equiposInfo || {}, mp = mapeo(), E = C.estados.estados, op = opcion(campo());
    var provs = eqs.filter(function (e) { return (info[e] || {}).tipo === 'proveedor'; });
    var campoNombre = op ? (op.id === 'todos' ? 'ninguno: todo el trabajo como un solo equipo' : 'el campo ' + op.nombre.replace(/^campo\s+/i, '')) : '';
    var ed = App.editar;
    var fila = function (k, titulo, texto, panel) {
      return '<div class="leido" id="ajuste-' + k + '"><div class="leido-cab"><b>' + titulo + '</b><p>' + texto + '</p>' + (panel ? '<button class="btn btn-sec btn-peq" data-accion="editar" data-e="' + k + '" aria-expanded="' + (ed === k) + '">' + (ed === k ? 'Listo' : 'Cambiar') + '</button>' : '') + '</div>' + (ed === k && panel ? '<div class="leido-panel">' + panel() + '</div>' : '') + '</div>';
    };
    var html = '<section class="titular"><div><h1>Ajustes</h1><p>Lo que la página detecta sola y lo que hay que indicar una vez. Se guarda en el navegador' + (App.carpeta ? ' y en la carpeta, en configuracion/cliente.json' : '') + '.</p></div></section>';
    html += '<section class="bloque" id="leido"><div class="bloque-cab"><h2>Equipos y estados</h2></div>' +
      fila('campo', 'Campo de equipo', 'Según ' + esc(campoNombre) + ': ' + esc(lista(eqs)) + '.', panelCampo) +
      fila('equipos', 'Proveedores, áreas, FTE y coste', (provs.length ? esc(lista(provs.map(function (e) { return e + ' (' + ((info[e] || {}).proveedor || 'proveedor') + ')'; }))) + ' son de proveedores. El resto, internos.' : 'Todos los equipos se tratan como internos. Indica cuáles son de un proveedor para poder compararlos.') + ' ' + textoCapacidad(eqs), panelEquipos) +
      fila('estados', 'Estados', esc(det.estados.map(function (e) { return e.nombre + ' es ' + E[mp[e.nombre] || e.estado].nombre.toLowerCase(); }).join('; ')) + '.' + (det.estados.some(function (e) { return e.propuestaPor !== 'nombre' && !(App.cfg.mapeoEstados || {})[e.nombre]; }) ? ' <span class="chip chip-atencion">Revisar</span>' : ''), panelEstados) +
      '</section>';
    html += '<section class="bloque" id="ajuste-cliente"><h2>Cliente y documentos</h2>' +
      '<label class="campo-linea">Nombre del cliente <input type="text" data-cambio="nombre" value="' + esc(App.cfg.nombre || '') + '" placeholder="Por ejemplo, Banco Ejemplo"></label>' +
      '<p class="nota">El documento de definiciones recoge el campo de equipo, los equipos, los estados y las medidas, para firmarlo con el cliente. El paquete de diagnóstico lleva solo cifras agregadas, sin títulos ni claves de ticket. El modelo de medida es la definición de cada medida en JSON.</p>' +
      '<p class="botones"><button class="btn" data-accion="definiciones" data-f="docx">Descargar definiciones (Word)</button><button class="btn btn-sec" data-accion="definiciones" data-f="md">En markdown</button><button class="btn btn-sec" data-accion="paquete">Exportar paquete de diagnóstico</button><button class="btn btn-sec" data-accion="modelo">Descargar el modelo de medida</button></p></section>';
    html += '<section class="bloque" id="ajuste-datos"><h2>Datos de ejemplo</h2><p class="nota">' + (App.demo ? 'Estás viendo los datos de ejemplo. Lo que cambies aquí no se guarda.' : 'Para ver la página con un banco ficticio sin tocar tus datos: <button class="btn-txt" data-accion="demo">cargar los datos de ejemplo</button>. Para repasar cómo funciona: <button class="btn-txt" data-accion="tutorial">ver el tutorial</button>.') + '</p></section>';
    return html;
  }
  var CAMPO_TXT = { equipo: 'del campo Equipo', componentes: 'del componente', proyecto: 'del proyecto', etiquetas: 'de las etiquetas' };
  var nombresCol = function (cs) { return lista(cs.map(function (c) { return '«' + c.columna + '»'; })); };
  function hallazgosExport() {
    var fs = App.ficheros || [], inf = App.lectura.informe, det = App.det, E = C.estados.estados, mp = mapeo();
    var cols = fs.length && fs[0].texto && N.describirColumnas ? N.describirColumnas(fs[0].texto) : [];
    var fuera = cols.filter(function (c) { return c.accion === 'descarta'; }), ign = cols.filter(function (c) { return c.accion === 'ignora'; });
    var solo = [], consultor = [], cliente = [];
    if (fuera.length) solo.push('Descarta ' + fuera.length + ' ' + plural(fuera.length, 'columna', 'columnas') + ' con personas o comentarios: ' + nombresCol(fuera) + '. No se leen.');
    if (inf.duplicadas) solo.push(miles(inf.duplicadas) + ' ' + plural(inf.duplicadas, 'tarea venía repetida', 'tareas venían repetidas') + ': cuenta la versión más reciente.');
    if (ign.length) solo.push('Ignora ' + ign.length + ' ' + plural(ign.length, 'columna que no reconoce', 'columnas que no reconoce') + (ign.length <= 4 ? ': ' + nombresCol(ign) : '') + '. No hacen falta para medir.');
    if (!App.cfg.campoEquipo) consultor.push('Confirmar en Ajustes que el equipo de cada tarea sale ' + (CAMPO_TXT[campo()] || 'de la columna propuesta') + '.');
    det.estados.filter(function (e) { return e.propuestaPor !== 'nombre' && !(App.cfg.mapeoEstados || {})[e.nombre]; }).forEach(function (e) {
      var com = E[mp[e.nombre] || e.estado];
      consultor.push('Confirmar en Ajustes el estado «' + e.nombre + '»: no se reconoce por el nombre y ahora cuenta como ' + (com ? com.nombre.toLowerCase() : 'sin traducir') + '.');
    });
    if (!det.hayTiempos) cliente.push('No trae el tiempo en cada estado. Sin él no hay plazo desde que se empieza, retrabajo ni bloqueo. Hay que exportar con ese campo.');
    if (!det.haySprints) cliente.push('No trae sprints: no se ve lo que pasa de un sprint a otro. Si los equipos trabajan por sprints, hay que exportar con el campo Sprint.');
    if ([1000, 10000].indexOf(inf.filasLeidas) >= 0) cliente.push('Tiene justo ' + miles(inf.filasLeidas) + ' filas: el export puede estar cortado. Hay que exportarlo por partes, por fechas o por equipos.');
    var act = fiab().comprobaciones.filter(function (c) { return c.id === 'actividad'; })[0];
    if (act && act.estado === 'revisar') cliente.push('Las últimas semanas casi no tienen actividad: parece que el export se cortó. Hay que exportar de nuevo todo el periodo.');
    var grupo = function (cls, titulo, xs, vacio) {
      return '<div class="hall hall-' + cls + (xs.length ? ' con' : '') + '"><h4>' + titulo + '</h4>' + (xs.length ? '<ul>' + xs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>' + vacio + '</p>') + '</div>';
    };
    return '<h3 class="sem-h3">Qué ha encontrado en este export</h3><div class="hallazgos">' +
      grupo('solo', 'Lo resuelve la página sola', solo, 'Nada que resolver.') +
      grupo('consultor', 'Por confirmar en Ajustes', consultor, 'Nada pendiente.') +
      grupo('cliente', 'Se arregla al exportar', cliente, 'Nada: el export trae lo necesario.') + '</div>' +
      '<p class="nota">Esto es sobre el export. Lo que los equipos registran mal en la herramienta se ve en <button class="btn-txt" data-accion="datos-sec" data-s="fiabilidad">Fiabilidad</button>.</p>';
  }
  // Cuánta historia trae el export: de ella depende qué se puede medir
  function historiaExport() {
    var nivel = App.det.hayTiempos ? 1 : 0;
    var pasos = [
      ['Foto del día', 'El estado de cada tarea hoy y sus fechas.', 'Entregas, plazo desde que se crea la tarea y edad de lo pendiente.'],
      ['Tiempo en cada estado', 'Cuánto pasó cada tarea en cada estado, sin el orden de los cambios.', 'Además: plazo desde que se empieza, tiempo bloqueado y en espera, y retrabajo.'],
      ['Historia de cambios', 'Cada cambio de estado con su fecha. Llega por la API.', 'Además: reaperturas exactas y cuánto lleva bloqueada cada tarea.'],
      ['Historia de sprints', 'Qué entró y qué salió de cada sprint. Llega por la API.', 'Además: si se cumple lo comprometido en cada sprint.']
    ];
    return '<h3 class="sem-h3">Cuánta historia trae este export</h3><ol class="escalera">' + pasos.map(function (p, k) {
      return '<li class="' + (k === nivel ? 'actual' : k > nivel ? 'falta' : 'hecho') + '"><b>' + p[0] + '</b>' + (k === nivel ? '<span class="chip chip-bien">Este export</span>' : '') + '<p>' + p[1] + '</p><p class="esc-med">' + p[2] + '</p></li>';
    }).join('') + '</ol>' +
      '<p class="nota">' + (nivel ? 'Este export trae el tiempo en cada estado, así que se miden plazo, retrabajo y bloqueo.' : 'Este export solo trae la foto del día. Exportar con el campo Tiempo en estado añade plazo desde que se empieza, retrabajo y bloqueo.') +
      ' Lo que pasa de un sprint a otro sale de las columnas Sprint. Los dos últimos pasos necesitan la conexión por API.</p>';
  }

  // Cómo se ha leído el export cargado, columna a columna: qué es cada una y qué se hace con ella
  var ACCION_COL = { usa: ['bien', 'Se usa'], descarta: ['critico', 'Se descarta'], ignora: ['sin', 'Se ignora'] };
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
      if (c.campo && c.campo === eqCampo) que = 'Equipo de cada tarea: ' + (confirmado ? 'confirmado en Ajustes' : 'propuesto; se confirma en Ajustes');
      var ej = c.accion === 'descarta' ? '<span class="apagado">No se lee</span>' : c.ejemplo ? '<code>' + esc(c.ejemplo) + '</code>' : '';
      return '<tr' + (c.accion === 'descarta' ? ' class="col-fuera"' : '') + '><th scope="row"><code>' + esc(c.columna) + '</code>' + (c.veces > 1 ? ' <small>(' + c.veces + ' columnas)</small>' : '') + '</th>' +
        '<td>' + esc(que) + '</td><td>' + ej + '</td><td><span class="chip chip-' + a[0] + '">' + a[1] + '</span></td></tr>';
    };
    var vistas = cols.filter(function (c) { return c.accion !== 'ignora'; }), ignoradas = cols.filter(function (c) { return c.accion === 'ignora'; });
    var pocas = ignoradas.length <= 8;
    return '<h3 class="sem-h3">Así se ha leído este export</h3>' +
      '<p class="nota">' + esc(fs[0].nombre) + (fs.length > 1 ? ' (y ' + (fs.length - 1) + ' ' + plural(fs.length - 1, 'fichero más', 'ficheros más') + ', con las mismas columnas)' : '') + ': ' +
      miles(cuenta.usa) + ' columnas se usan, ' + miles(cuenta.descarta) + ' se descartan y ' + miles(cuenta.ignora) + ' no se reconocen y se ignoran. Se calcula con el export cargado.</p>' +
      '<div class="tabla-caja"><table class="tabla-sem tabla-cols"><thead><tr><th scope="col">Columna del export</th><th scope="col">Qué es</th><th scope="col">Ejemplo</th><th scope="col">Qué se hace</th></tr></thead><tbody>' +
      vistas.concat(pocas ? ignoradas : []).map(fila).join('') + '</tbody></table></div>' +
      (pocas || !ignoradas.length ? '' : '<details class="cols-ign"><summary>' + miles(ignoradas.length) + ' columnas sin reconocer: se ignoran</summary><p>' +
        ignoradas.map(function (c) { return '<code>' + esc(c.columna) + '</code>'; }).join(' ') + '</p></details>');
  }

  // Las cifras de una recomendación: el valor de su medida en cada equipo frente a lo normal, con la frase de la evidencia
  function cifrasRec(x) {
    var c = x.caso, eqs = {}; App.r.modelo.equipos.forEach(function (e) { eqs[e.nombre] = e; });
    var def = c.medida ? C.medidas[c.medida] : null;
    return x.evidencias.map(function (ev) {
      var eq = ev[0] ? eqs[ev[0]] : (x.equipos.length === 1 ? eqs[x.equipos[0]] : null);
      var m = !x.grupo && eq && c.medida ? eq.medidas[c.medida] : null;
      if (!m || !m.disponible || m.valor == null || !def) return '<div class="cifra"><p class="cf-txt">' + (ev[0] && x.evidencias.length > 1 ? '<b>' + esc(ev[0]) + ':</b> ' : '') + esc(ev[1]) + '</p></div>';
      var F = function (v) { return M.formatear(v, def.formato); }, e = estadoDe(m);
      return '<div class="cifra"><div class="cf-fila"><span class="cf-eq">' + esc(eq.nombre) + '</span><span class="cf-med">' + nomMed(c.medida) + '</span><b class="cf-val">' + esc(F(m.valor)) + '</b>' +
        '<span class="cf-normal">' + (m.ref ? 'Lo normal: ' + esc(F(m.ref.lo)) + ' a ' + esc(F(m.ref.hi)) : '') + '</span>' + chip(e === 'neutro' ? 'sin' : e, true) + '</div><p class="cf-txt">' + esc(ev[1]) + '</p></div>';
    }).join('');
  }
  function detalleRec(x, n) {
    var c = x.caso, def = c.medida ? C.medidas[c.medida] : null, p0 = c.plan[0];
    var plan = c.plan.map(function (s, i) {
      return '<li' + (i ? '' : ' class="primero"') + '><span class="paso-n">' + (i + 1) + '</span><div><b>' + esc(s.paso) + '</b><span class="meta">' +
        '<span>Lo hace: ' + esc(s.quien.toLowerCase()) + '</span><span>Esfuerzo: ' + esc(s.esfuerzo.toLowerCase()) + '</span></span></div></li>';
    }).join('');
    // Seguimiento: si ya está registrada, su estado automático; si no, el botón
    var seg = '';
    if (def) seg += '<p><b>Medida objetivo:</b> ' + nomMed(c.medida) + ', ' + (def.dir === 'mas' ? 'subir' : 'bajar') + '.</p>';
    seg += '<p><b>Cómo saber si funciona:</b> ' + esc(c.comprobar) + '</p>';
    if (registrable(x)) {
      var id = idIniciativa(x), sx = seguimientos().filter(function (y) { return y.ini.id === id; })[0];
      seg += sx ? '<div class="rec-seg-estado">' + chipSeg(sx.s.estado) + '<span>' + esc(sx.s.texto) + '</span><button class="btn-txt" data-accion="vista" data-v="iniciativas">Ver el seguimiento</button></div>' :
        '<p><button class="btn btn-sec btn-peq" data-accion="registrar" data-k="' + esc(claveRec(x)) + '">Registrar como iniciativa</button></p><p class="nota">Desde ese momento se sigue sola: cada carga de datos recalcula su efecto frente a los equipos que no la tienen.</p>';
    } else seg += '<p class="nota">Se sigue en el tablero con su propia medida.</p>';
    return '<div class="rec-cab"><span class="rec-n">' + n + '</span>' + chip(x.gravedad) + '<span class="rec-para">Para: ' + esc(x.para) + '</span></div>' +
      '<h2>' + esc(x.titulo) + '</h2>' +
      '<div class="rec-resumen"><div><span class="rr-et">Qué pasa</span><p>' + esc(c.senal || x.evidencias[0][1]) + '</p></div>' +
      '<div><span class="rr-et">Qué hacer primero</span><p><b>' + esc(p0.paso) + '.</b> Lo hace: ' + esc(p0.quien.toLowerCase()) + '. Esfuerzo: ' + esc(p0.esfuerzo.toLowerCase()) + '.</p></div></div>' +
      '<section class="rec-bloque"><h3>Las cifras</h3>' + cifrasRec(x) + '</section>' +
      '<section class="rec-bloque"><h3>Plan de acción</h3><ol class="rec-plan">' + plan + '</ol></section>' +
      '<section class="rec-bloque rec-seg"><h3>Cómo se sigue</h3>' + seg + '</section>' +
      '<details data-k="' + esc(claveRec(x)) + '"' + (App.abiertas[claveRec(x)] ? ' open' : '') + '><summary>Para la reunión, causas habituales y respaldo</summary><div class="rec-mas">' +
      (c.preguntas && c.preguntas.length ? '<div><b>Para la reunión</b><ul>' + c.preguntas.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div><b>Causas habituales</b><ul>' + c.causas.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div><b>Respaldo</b><p>' + esc(c.respaldo || '') + '</p>' + (c.comun ? '<p>' + esc(c.comun) + '</p>' : '') + '</div></div></details>';
  }
  function textoCapacidad(eqs) {
    var cap = N.capacidadArea(cfgCalculo(), eqs);
    if (cap.costeMes != null) return 'Plantilla de ' + n1(cap.fteTotal) + ' FTE con un coste de ' + euros(cap.costeMes) + ' al mes.';
    if (cap.fteTotal != null) return 'Plantilla de ' + n1(cap.fteTotal) + ' FTE. Indica el coste de un FTE de cada equipo para ver el coste por entrega.';
    return 'Indica el FTE y el coste de cada equipo para ver entregas por FTE y coste por entrega.';
  }
  // El modelo de medida: las mismas definiciones, de cualquier fuente a cualquier herramienta
  function descargarModelo() {
    var m = N.modeloDeMedida({ generado: new Date() }), nombre = 'modelo-de-medida.json', texto = JSON.stringify(m, null, 2);
    escribirEnCarpeta('configuracion', nombre, texto).then(function (ok) { if (ok) aviso('Modelo guardado en la carpeta configuracion.'); else descargar(nombre, texto); });
  }
  // Número de avisos distintos sobre la calidad de los datos (del export y de los equipos)
  function avisosCalidad() { return listaAvisos().length; }
  function calidad() {
    var r = App.r, inf = App.lectura.informe, generales = inf.avisos.concat(App.det.avisos).map(function (a) { return a.texto; });
    var eqs = r.modelo.equipos, comunes = eqs.length > 1 ? eqs[0].calidad.avisos.filter(function (a) { return eqs.every(function (e) { return e.calidad.avisos.indexOf(a) >= 0; }); }) : [];
    var propios = eqs.filter(function (e) { return e.calidad.avisos.some(function (a) { return comunes.indexOf(a) < 0; }); });
    var todos = generales.concat(comunes.filter(function (a) { return generales.indexOf(a) < 0; }));
    var texto = !todos.length && !propios.length ? 'Sin avisos: los datos parecen reflejar bien el trabajo.' :
      '<ul>' + todos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + propios.map(function (e) { return '<li><b>' + esc(e.nombre) + ':</b> ' + esc(e.calidad.avisos.filter(function (a) { return comunes.indexOf(a) < 0; }).join(' ')) + '</li>'; }).join('') + '</ul>';
    return '<div class="leido"><div class="leido-cab"><b>Calidad de los datos</b><div class="leido-texto">' + texto + '</div></div></div>';
  }
  function panelCampo() {
    var ops = App.det.opcionesEquipo.filter(function (o) { return o.valida; }), c = campo();
    return '<label class="campo-linea">Campo que dice de qué equipo es cada tarea <select data-cambio="campo">' + ops.map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (o.id === c ? ' selected' : '') + '>' + esc(o.id === 'todos' ? 'Ninguno: todo es un solo equipo' : o.nombre.replace(/^campo\s+/i, '') + ' (' + o.valores.length + ' equipos)') + '</option>';
    }).join('') + '</select></label>';
  }
  function panelEquipos() {
    var eqs = App.r.modelo.equipos.map(function (e) { return e.nombre; }), info = App.cfg.equiposInfo || {}, fte = App.cfg.fte || {}, orig = App.cfg.fteOrigen || {}, coste = App.cfg.coste || {};
    return '<div class="tabla-caja"><table class="tabla-editar"><thead><tr><th scope="col">Equipo</th><th scope="col">Tipo</th><th scope="col">Proveedor</th><th scope="col">Área</th><th scope="col">FTE</th><th scope="col">De dónde sale el FTE</th><th scope="col">Coste de un FTE al mes</th></tr></thead><tbody>' +
      eqs.map(function (e) {
        var i = info[e] || {}, prov = i.tipo === 'proveedor', o = orig[e] || 'declarado', a = ' data-e="' + esc(e) + '"';
        return '<tr><th scope="row">' + esc(e) + '</th><td><select data-cambio="eq" data-campo="tipo"' + a + ' aria-label="Tipo de ' + esc(e) + '"><option value="interno"' + (prov ? '' : ' selected') + '>Interno</option><option value="proveedor"' + (prov ? ' selected' : '') + '>Proveedor</option></select></td>' +
          '<td><input type="text" data-cambio="eq" data-campo="proveedor"' + a + ' value="' + esc(i.proveedor || '') + '" placeholder="Nombre"' + (prov ? '' : ' disabled') + ' aria-label="Proveedor de ' + esc(e) + '"></td>' +
          '<td><input type="text" data-cambio="eq" data-campo="area"' + a + ' value="' + esc(i.area || '') + '" placeholder="Área" aria-label="Área de ' + esc(e) + '"></td>' +
          '<td><input type="number" min="0" step="0.5" data-cambio="eq" data-campo="fte"' + a + ' value="' + (fte[e] != null ? fte[e] : '') + '" aria-label="FTE de ' + esc(e) + '"></td>' +
          '<td><select data-cambio="eq" data-campo="fteOrigen"' + a + ' aria-label="Origen del FTE de ' + esc(e) + '">' + [['contrato', 'Contrato'], ['declarado', 'Declarado'], ['estimado', 'Estimado']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === o ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></td>' +
          '<td><input type="number" min="0" step="100" data-cambio="eq" data-campo="coste"' + a + ' value="' + (coste[e] != null ? coste[e] : '') + '" placeholder="€" aria-label="Coste de un FTE de ' + esc(e) + ' al mes, en euros"></td></tr>';
      }).join('') + '</tbody></table></div><p class="nota">FTE: personas a jornada completa. Coste de un FTE: coste interno cargado en los equipos propios y tarifa del contrato en los de proveedores, en euros al mes. Jira no trae ninguno de los dos; salen de la herramienta de plantilla, del contrato o de finanzas. Es un dato de equipo, nunca el salario de una persona.</p>';
  }
  var ORDEN_COMUN = ['nuevo', 'pendiente', 'en_curso', 'bloqueado', 'en_revision', 'en_pruebas', 'en_espera', 'terminado', 'descartado'];
  function panelEstados() {
    var E = C.estados.estados, mp = mapeo(), cambiados = App.cfg.mapeoEstados || {};
    return '<div class="tabla-caja"><table class="tabla-editar"><thead><tr><th scope="col">Estado en Jira</th><th scope="col">Tareas ahora</th><th scope="col">Estado común</th></tr></thead><tbody>' +
      App.det.estados.map(function (e) {
        var sel = mp[e.nombre] || e.estado, rev = e.propuestaPor !== 'nombre' && !cambiados[e.nombre];
        return '<tr><th scope="row">' + esc(e.nombre) + (rev ? ' <span class="chip chip-atencion">Revisar</span>' : '') + '</th><td>' + e.actuales.toLocaleString('es-ES') + '</td><td><select data-cambio="estado" data-e="' + esc(e.nombre) + '" aria-label="Estado común de ' + esc(e.nombre) + '">' +
          ORDEN_COMUN.map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(E[k].nombre) + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</tbody></table></div><p class="nota">' + ORDEN_COMUN.map(function (k) { return '<b>' + esc(E[k].nombre) + ':</b> ' + esc(E[k].descripcion); }).join(' ') + '</p>';
  }

  // ---------- documentos ----------
  function slug(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function definiciones(formato) {
    var doc;
    try { doc = N.definiciones(App.lectura, clienteDe(App.r.modelo), { config: cfgCalculo(), det: App.det, modelo: App.r.modelo, generado: new Date() }); }
    catch (e) { if (window.console) console.error(e); aviso('No se pudo generar el documento.'); return; }
    var nombre = 'definiciones-' + (slug(App.cfg.nombre) || 'cliente') + '-' + new Date().toISOString().slice(0, 10) + (formato === 'docx' ? '.docx' : '.md');
    var datos = formato === 'docx' ? N.aDocx(doc, new Date()) : N.aMarkdown(doc);
    var tipo = formato === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/markdown;charset=utf-8';
    escribirEnCarpeta('configuracion', nombre, datos).then(function (ok) { if (ok) aviso('Documento guardado en la carpeta configuracion.'); else descargar(nombre, datos, tipo); });
  }
  function paquete() {
    var p = App.r.paquete, problemas = N.comprobarPaquete(p);
    if (problemas.length) { aviso('No se exporta: ' + problemas[0]); return; }
    var nombre = 'paquete-diagnostico-' + new Date().toISOString().slice(0, 10) + '.json', texto = JSON.stringify(p, null, 1);
    escribirEnCarpeta('diagnostico', nombre, texto).then(function (ok) { if (ok) aviso('Paquete guardado en la carpeta diagnostico.'); else descargar(nombre, texto); });
  }

  // ---------- acciones ----------
  // ---------- tutorial ----------
  // Recorre la interfaz con los datos que haya cargados. Sin datos, carga los de ejemplo (y los quita al terminar).
  function pasosTutorial() {
    var eqs = App.r.modelo.equipos, conProblema = eqs.filter(function (e) { var p = problemas(e); return p.critico.length || p.atencion.length; })[0] || eqs[0];
    var conRec = recomendaciones().filter(function (x) { return x.equipos.indexOf(conProblema.nombre) >= 0; })[0];
    var ver = function (v) { return function () { if (App.vista !== v || App.ver !== 'area') { App.vista = v; App.ver = 'area'; App.editar = null; App.nuevaIni = false; render(); } }; };
    var pasos = [
      { sel: '.kpis', titulo: 'Las medidas del área', antes: ver('tablero'),
        texto: 'Plazo, entregas, retrabajo y tickets listos para agentes, con su tendencia. Cada cifra se compara con lo normal en las 12 semanas anteriores. Solo se marca lo que se sale de lo normal: sin etiqueta es que está bien.' },
      { sel: '.estado-area', titulo: 'Fiabilidad y equipos que necesitan atención',
        texto: 'A la izquierda, si los datos reflejan bien el trabajo. A la derecha, los equipos con alguna cifra fuera de lo normal. Pulsa uno para ver su detalle.' },
      { sel: '.tabla-equipos', titulo: 'Un equipo por fila',
        texto: 'Las cinco medidas de cada equipo. El color es el estado: atención o crítico frente a su propia historia. No es un ranking: cada equipo se compara consigo mismo.' },
      { sel: '.grafico-plazo', titulo: 'El detalle de un equipo', antes: function () { App.vista = 'tablero'; App.ver = conProblema.nombre; App.editar = null; render(); },
        texto: 'El plazo semana a semana, con la franja de lo normal en ese equipo. Debajo, sus recomendaciones.' },
      { sel: '.recs-lista', titulo: 'Qué hacer, por orden', antes: function () { App.vista = 'recomendaciones'; App.recEquipo = 'todos'; App.recSel = conRec ? claveRec(conRec) : null; App.editar = null; render(); },
        texto: 'Salen del banco de casos a partir de las cifras. Primero lo más grave y lo que afecta a más equipos. Cada una dice de qué cifra sale, el primer paso y el plan.' },
      { sel: '.rec-seg', titulo: 'Registrar como iniciativa',
        texto: 'Si decidís probar el plan, se registra como iniciativa. Desde ese momento se mide sola: antes, después y frente a los equipos que no la tienen.' },
      { sel: '.seg', titulo: 'Si las iniciativas funcionan', antes: ver('iniciativas'),
        texto: 'Cada iniciativa con su estado (funciona, sin efecto claro, va a peor, midiendo) y la evolución de su medida frente al resto. «Cómo se ha evaluado» enseña las cifras paso a paso. Con «Nueva iniciativa» se registra una a mano.' },
      { sel: '.fiab-grid', titulo: 'Fiabilidad de los datos', antes: function () { App.vista = 'datos'; App.datos = 'fiabilidad'; App.editar = null; render(); },
        texto: 'Diez comprobaciones sobre cómo se registra el trabajo en la herramienta, con cómo se arregla cada una. Avisan, no cambian ninguna cifra. En «Cómo se ha leído el export» está el detalle columna a columna.' },
      { sel: '#leido', titulo: 'Ajustes', antes: function () { App.vista = 'ajustes'; App.editar = null; render(); },
        texto: 'Lo que la página detecta sola (campo de equipo, estados) se puede corregir. Lo que no puede saber (qué equipos son de un proveedor, cuántas personas tiene cada uno, lo que cuestan) se indica una vez y se guarda.' },
      { sel: '.btn-actualizar', titulo: 'Cada semana, Actualizar', antes: ver('tablero'), ultimo: 'Terminar',
        texto: 'Con una carpeta (exports, configuracion, iniciativas), cada semana basta con dejar el export nuevo y pulsar Actualizar. Sin carpeta, se vuelven a cargar los ficheros.' }
    ];
    return pasos;
  }
  function tutorial() {
    if (!window.Tutorial) return;
    var cargadoAqui = false;
    if (!App.r) { if (!verDemo()) return; cargadoAqui = true; }
    guardarLocal(CLAVE_TUT, { visto: new Date().toISOString() });
    window.Tutorial.iniciar(pasosTutorial(), {
      alCerrar: function () {
        if (cargadoAqui && App.demo) { aviso('Fin del tutorial. Pulsa «Cargar mis datos» para empezar con los vuestros.'); }
      }
    });
  }

  // ---------- acciones ----------
  function cambiar(fn) {
    // Cambio de configuración: se guarda, se recalcula todo y se vuelve a pintar en el mismo sitio
    var y = window.scrollY;
    fn(); guardarCfg();
    enSegundoPlano(function () { recalcular(); render(); window.scrollTo(0, y); });
  }
  var ACC = {
    vista: function (el) { App.vista = el.getAttribute('data-v'); App.editar = null; App.nuevaIni = false; ocultarTip(null); render(); window.scrollTo(0, 0); },
    ver: function (el) { App.ver = el.getAttribute('data-e'); App.vista = 'tablero'; render(); window.scrollTo(0, 0); },
    ficheros: function () { document.getElementById('entrada-ficheros').click(); },
    carpeta: elegirCarpeta,
    'leer-carpeta': function () { if (App.carpeta) leerCarpeta(App.carpeta); },
    demo: function () { verDemo(); },
    tutorial: tutorial,
    rec: function (el) {
      App.recSel = el.getAttribute('data-k'); render();
      var d = document.getElementById('rec-detalle');
      if (d) { d.classList.add('entra'); if (window.innerWidth < 1000) d.scrollIntoView({ block: 'start' }); }
    },
    registrar: function (el) { registrar(el.getAttribute('data-k')); },
    'ver-recs': function (el) { App.recEquipo = el.getAttribute('data-e') || 'todos'; App.recSel = null; App.vista = 'recomendaciones'; render(); window.scrollTo(0, 0); },
    'nueva-ini': function () { App.nuevaIni = true; render(); var f = document.getElementById('form-ini'); if (f) { f.scrollIntoView({ block: 'start' }); var n = f.elements.nombre; if (n) n.focus(); } },
    'cancelar-ini': function () { App.nuevaIni = false; render(); },
    'quitar-ini': function (el) { quitarIni(el.getAttribute('data-i')); },
    'salir-demo': function () { salirDemo(); if (!App.r) { App.vista = 'inicio'; render(); } },
    actualizar: function () {
      if (App.demo) { aviso('En los datos de ejemplo no hay nada que actualizar. Pulsa «Cargar mis datos» para usar los vuestros.'); return; }
      if (App.carpeta) return leerCarpeta(App.carpeta);
      if (App.origen === 'datosjs') return location.reload();
      document.getElementById('entrada-ficheros').click();
    },
    'datos-sec': function (el) { App.vista = 'datos'; App.datos = el.getAttribute('data-s'); App.editar = null; render(); window.scrollTo(0, 0); },
    fiabilidad: function () { App.vista = 'datos'; App.datos = 'fiabilidad'; App.editar = null; render(); window.scrollTo(0, 0); },
    editar: function (el) {
      var k = el.getAttribute('data-e');
      if (k === 'calidad') { ACC.fiabilidad(); return; }
      if (App.vista !== 'ajustes') { App.vista = 'ajustes'; App.editar = k; render(); var s = document.getElementById('ajuste-' + k) || document.getElementById('leido'); if (s) s.scrollIntoView(); return; }
      var y = window.scrollY; App.editar = App.editar === k ? null : k; render(); window.scrollTo(0, y);
    },
    definiciones: function (el) { definiciones(el.getAttribute('data-f')); },
    paquete: paquete,
    modelo: descargarModelo
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
  // Arrastrar ficheros a la página
  document.addEventListener('dragover', function (e) { e.preventDefault(); var z = document.getElementById('zona'); if (z) z.classList.add('encima'); });
  document.addEventListener('dragleave', function (e) { var z = document.getElementById('zona'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('encima'); });
  document.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) cargarFicheros(e.dataTransfer.files); });

  // ---------- arranque ----------
  function iniciar() {
    App.cfg = cfgInicial();
    if (window.EASY_PERFORMANCE_INICIATIVAS) App.iniciativas = [].concat(window.EASY_PERFORMANCE_INICIATIVAS).filter(iniciativaValida);
    if (window.EASY_PERFORMANCE_CONTEXTO && window.EASY_PERFORMANCE_CONTEXTO.documentos) App.contexto = window.EASY_PERFORMANCE_CONTEXTO;
    idbGet('carpeta').then(function (h) {
      App.carpeta = h;
      var ex = window.EASY_PERFORMANCE_EXPORTS;
      if (ex && ex.length) {
        var fs;
        try { fs = ex.map(function (f) { return { nombre: f.nombre, texto: f.b64 != null ? desdeBase64(f.b64) : f.texto }; }); }
        catch (e) { aviso('No se pudo leer exports/datos.js. Vuelve a ejecutar actualizar.'); render(); return; }
        enSegundoPlano(function () { procesar(fs, 'datosjs'); render(); }, 'Leyendo datos…');
      } else render();
    });
  }
  App.render = render; App.ACC = ACC; App.leerCarpeta = leerCarpeta; App.recomendaciones = recomendaciones; App.procesar = procesar; App.tutorial = tutorial; App.verDemo = verDemo; App.fiab = fiab;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
