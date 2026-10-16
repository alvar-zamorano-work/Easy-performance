// Easy Performance: tablero, recomendaciones y cómo funciona.
// Sin puesta en marcha: al cargar el export se detecta todo (campo de equipo, estados) y se ve el tablero.
// Lo que no se puede detectar (proveedores, áreas, FTE) y lo que se quiera corregir se cambia en "Cómo funciona".
// Usa el núcleo empaquetado en la página: window.Motor, window.Nucleo y window.CATALOGO.
(function () {
  'use strict';
  var C = window.CATALOGO, N = window.Nucleo, M = window.Motor;
  var CLAVE = 'easyperformance.config.v2', CLAVE_V1 = 'easyperformance.configuracion.v1';
  var App = {
    vista: 'inicio', ver: 'area', editar: null, demo: false, carpeta: null, origen: null,
    lectura: null, det: null, cfg: {}, iniciativas: [], contexto: null, r: null, lamina: 0, real: null, abiertas: {},
    fuente: null, simulada: null, generadas: false, recSel: null, recEquipo: 'todos', tiempoMs: 0
  };
  window.EasyPerformance = App;

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n1(v) { return (Math.round(v * 10) / 10).toLocaleString('es-ES'); }
  function lista(ns) { return ns.length < 2 ? (ns[0] || '') : ns.slice(0, -1).join(', ') + ' y ' + ns[ns.length - 1]; }
  function mayus(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  var NUMEROS = ['Ningún', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];
  var ICO = {
    responsable: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M15.8 14.2c2.3.2 4.1 1.8 4.7 4.8"/>',
    cumplir: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'
  };
  var ICP = {
    reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pregunta: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    escudo: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M12 8.5v4"/><circle cx="12" cy="15.5" r=".6" fill="currentColor"/>',
    equipo: ICO.responsable, espejo: '<path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M18.5 3.5v3.5H15"/><path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M5.5 20.5V17H9"/>',
    candado: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    fichero: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 13h6M9 16.5h6"/>',
    diana: ICO.cumplir, plan: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };
  function icp(k) { return '<span class="icp" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICP[k] + '</svg></span>'; }

  // Las cinco medidas del tablero: siempre las mismas, para todos los clientes
  var MED = {
    ciclo: { nombre: 'Plazo', formato: 'dias', unidad: 'días', que: 'Días para terminar 8 de cada 10 tareas, desde que empiezan. Mejor cuanto más bajo.' },
    entregas: { nombre: 'Entregas', formato: 'num', unidad: 'por semana', que: 'Tareas terminadas cada semana. Las descartadas no cuentan.' },
    retrabajo: { nombre: 'Retrabajo', formato: 'pct', unidad: 'de lo terminado', que: 'Parte de lo terminado que volvió a un estado por el que ya había pasado.' },
    arrastradas: { nombre: 'Pasa de sprint', formato: 'pct', unidad: 'de lo terminado', que: 'Parte de lo terminado que pasó por más de un sprint.' },
    agent_readiness: { nombre: 'Listo para agentes', formato: 'pct', unidad: 'de los tickets', que: 'Tickets que un agente de IA podría hacer sin preguntar: descripción, criterios de aceptación, alcance acotado, referencias y sin dependencias abiertas.' },
    coste: { nombre: 'Coste por entrega', formato: 'eur', unidad: 'por tarea', que: 'Coste del equipo al mes (FTE por lo que cuesta un FTE) entre las tareas terminadas al mes. Mejor cuanto más bajo. Solo si se indican FTE y coste.' }
  };
  var COLUMNAS = ['ciclo', 'entregas', 'retrabajo', 'arrastradas', 'agent_readiness'];
  // Fuentes de la entrada. Jira funciona hoy con el export CSV; la conexión directa y el resto son una simulación
  // que carga los datos de ejemplo. Los estados son ejemplos habituales de cada herramienta.
  var FUENTES = {
    jira: { nombre: 'Jira', sub: 'Cloud y Data Center', ico: 'J', unidad: 'incidencias', instancia: 'banco-ejemplo.atlassian.net', proyecto: 'Canales digitales', equipo: 'Campo Equipo o componente', csv: true,
      lee: ['Incidencias, su tipo y su épica', 'Estados y tiempo en cada estado', 'Sprints y estimación', 'Descripción, solo para ver si el ticket está bien definido'],
      estados: [['To Do', 'pendiente'], ['In Progress', 'en_curso'], ['In Review', 'en_revision'], ['Blocked', 'bloqueado'], ['Done', 'terminado']] },
    ado: { nombre: 'Azure DevOps', sub: 'Boards', ico: 'AZ', unidad: 'elementos de trabajo', instancia: 'dev.azure.com/banco-ejemplo', proyecto: 'Canales digitales', equipo: 'Area Path',
      lee: ['Elementos de trabajo y su tipo', 'Estados y su historial de cambios', 'Iteraciones y esfuerzo', 'Descripción y criterios de aceptación'],
      estados: [['New', 'nuevo'], ['Active', 'en_curso'], ['Resolved', 'en_pruebas'], ['Closed', 'terminado'], ['Removed', 'descartado']] },
    servicenow: { nombre: 'ServiceNow', sub: 'Agile Development', ico: 'SN', unidad: 'historias', instancia: 'banco-ejemplo.service-now.com', proyecto: 'Canales digitales', equipo: 'Grupo de asignación',
      lee: ['Historias, tareas y defectos', 'Estados y su historial', 'Sprints y puntos', 'Descripción y criterios de aceptación'],
      estados: [['Draft', 'nuevo'], ['Ready', 'pendiente'], ['Work in progress', 'en_curso'], ['Testing', 'en_pruebas'], ['Complete', 'terminado'], ['Cancelled', 'descartado']] },
    gitlab: { nombre: 'GitLab', sub: 'Issues y boards', ico: 'GL', unidad: 'issues', instancia: 'gitlab.banco-ejemplo.es', proyecto: 'Canales digitales', equipo: 'Grupo o etiqueta de equipo',
      lee: ['Issues y sus etiquetas', 'Estados y etiquetas de flujo', 'Iteraciones y peso', 'Descripción'],
      estados: [['Open', 'pendiente'], ['workflow::doing', 'en_curso'], ['workflow::review', 'en_revision'], ['Closed', 'terminado']] },
    otra: { nombre: 'Otra herramienta', sub: 'Con su adaptador', ico: '+', otra: true }
  };
  // El coste por entrega solo aparece si se ha indicado el coste de algún equipo; no cuenta para el titular
  // porque repite lo que ya dicen las entregas, visto desde el dinero.
  function hayCoste() { var c = App.cfg.coste; return !!(c && Object.keys(c).some(function (k) { return c[k] > 0; })); }
  function columnas() { return hayCoste() ? COLUMNAS.concat(['coste']) : COLUMNAS; }
  function med(eq, id) { return id === 'coste' ? (eq.kpis && eq.kpis.coste) || { id: 'coste', disponible: false, motivo: 'Indica el FTE y el coste de cada equipo en Cómo funciona.' } : eq.medidas[id]; }
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
    // Datos nuevos: las recomendaciones se vuelven a generar
    App.generadas = false; App.recSel = null; App.recEquipo = 'todos';
    App.vista = 'tablero';
    return true;
  }
  function cargarFicheros(files) {
    var csv = [].filter.call(files, function (f) { return /\.csv$/i.test(f.name) || /csv/.test(f.type); });
    if (!csv.length) { aviso('Elige uno o varios CSV exportados de Jira.'); return; }
    salirDemo(false);
    // El método se enseña al cargar desde la entrada, no al actualizar
    var animar = !App.r || App.vista === 'inicio';
    ocupado(true, 'Leyendo datos…');
    Promise.all(csv.map(function (f) { return f.arrayBuffer().then(descodificar).then(function (t) { return { nombre: f.name, texto: t }; }); }))
      .then(function (fs) { setTimeout(function () { try { if (procesar(fs, 'ficheros')) { App.fuente = null; render(); window.scrollTo(0, 0); if (animar) animarCarga(null); } } finally { ocupado(false); } }, 20); })
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
    var animar = !App.r || App.vista === 'inicio';
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
          try { if (procesar(fs, 'carpeta')) { guardarFoto(); App.fuente = null; render(); aviso('Leídos ' + fs.length + ' fichero(s) de la carpeta.'); if (animar) animarCarga(null); } } finally { ocupado(false); }
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

  // ---------- demo con datos de ejemplo ----------
  function verDemo(simulada) {
    var t = (document.getElementById('demo-csv') || {}).textContent || '';
    if (!t.trim()) { aviso('Esta copia no incluye datos de ejemplo.'); return; }
    var dc = {}; try { dc = JSON.parse(document.getElementById('demo-cliente').textContent || '{}'); } catch (e) { dc = {}; }
    if (!App.demo) App.real = { lectura: App.lectura, det: App.det, cfg: App.cfg, iniciativas: App.iniciativas, contexto: App.contexto, r: App.r, origen: App.origen, ver: App.ver, vista: App.vista, generadas: App.generadas, recSel: App.recSel, tiempoMs: App.tiempoMs };
    enSegundoPlano(function () {
      App.demo = true;
      App.cfg = { nombre: dc.nombre || 'Banco ficticio', equiposInfo: dc.equiposInfo || {}, fte: dc.fte || {}, fteOrigen: dc.fteOrigen || {}, coste: dc.coste || {} };
      App.iniciativas = dc.iniciativas || []; App.contexto = dc.contexto || null; App.ver = 'area'; App.editar = null;
      procesar([{ nombre: 'datos-de-ejemplo.csv', texto: t }], 'ejemplo');
      App.simulada = FUENTES[simulada] && !FUENTES[simulada].otra ? simulada : null; App.fuente = null;
      render(); window.scrollTo(0, 0);
      animarCarga(App.simulada);
    }, 'Preparando la demo…');
  }
  function salirDemo(pintar) {
    if (!App.demo) return;
    var r = App.real || {};
    App.demo = false;
    App.lectura = r.lectura || null; App.det = r.det || null; App.cfg = r.cfg || cfgInicial(); App.iniciativas = r.iniciativas || [];
    App.contexto = r.contexto || null; App.r = r.r || null; App.origen = r.origen || null; App.ver = r.ver || 'area';
    App.generadas = !!r.generadas; App.recSel = r.recSel || null; App.recEquipo = 'todos'; App.tiempoMs = r.tiempoMs || 0; App.simulada = null;
    App.vista = App.r ? 'tablero' : 'inicio'; App.real = null; App.editar = null;
    if (pintar !== false) { render(); window.scrollTo(0, 0); }
  }

  // ---------- pintado ----------
  function render() {
    var html;
    document.body.classList.toggle('en-presentacion', App.vista === 'presentacion');
    if (App.vista === 'presentacion') html = presentacion();
    else if (!App.r || App.vista === 'inicio') html = inicio();
    else html = cabecera() + (App.demo ? bandaDemo() : '') + '<main class="pagina">' + ({ tablero: tablero, recomendaciones: vistaRecomendaciones, como: comoFunciona }[App.vista] || tablero)() + '</main>';
    document.getElementById('app').innerHTML = html;
    if (App.vista === 'presentacion') ajustarLienzo();
  }
  function marca() { return '<div class="marca"><span class="logo" aria-hidden="true"></span><b>Easy Performance</b></div>'; }
  function cabecera() {
    var recs = recomendaciones().length;
    var pest = [['tablero', 'Tablero'], ['recomendaciones', 'Recomendaciones'], ['como', 'Cómo funciona']].map(function (p) {
      return '<button class="pestana" data-accion="vista" data-v="' + p[0] + '"' + (App.vista === p[0] ? ' aria-current="page"' : '') + '>' + p[1] +
        (p[0] === 'recomendaciones' && recs && App.generadas ? ' <span class="cuenta">' + recs + '</span>' : '') + '</button>';
    }).join('');
    var hasta = new Date(App.r.modelo.semanaFin.getTime() - 864e5);
    return '<header class="cab"><div class="cab-in">' + marca() + '<nav class="pestanas" aria-label="Secciones">' + pest + '</nav><span class="hueco"></span>' +
      '<span class="fecha">Datos hasta el ' + esc(fechaCorta(hasta)) + '</span><button class="btn btn-cab" data-accion="actualizar">Actualizar</button></div></header>';
  }
  function bandaDemo() {
    return '<div class="banda-demo"><span>' + (App.simulada ? '<b>Simulación de ' + esc(FUENTES[App.simulada].nombre) + ':</b> datos de ejemplo de un banco ficticio, con costes inventados.' :
      '<b>Datos de ejemplo:</b> un banco ficticio con dos equipos internos y dos de proveedores, un año de historia y costes inventados.') + '</span>' +
      '<span class="banda-acc"><button class="btn-txt" data-accion="presentacion">Ver la presentación</button><button class="btn btn-peq" data-accion="salir-demo">Cargar mis datos</button></span></div>';
  }

  // Pantalla de entrada: conectar una herramienta (simulación), cargar exports, o ver la demo o la presentación
  function inicio() {
    var f = App.fuente && FUENTES[App.fuente];
    return '<div class="inicio"><div class="inicio-in"><div class="inicio-txt">' + marca() +
      '<h1 class="claim">Deja de montar el informe. <em>Empieza a usarlo.</em></h1>' +
      '<p class="inicio-sub">Conecta la herramienta donde trabajan vuestros equipos. Verás cómo va cada uno, cuánto cuesta y qué hacer, con las mismas reglas para todos.</p>' +
      '<ol class="metodo-mini" aria-label="El método">' + ['Leer', 'Hacer fiable', 'Medir', 'Recomendar'].map(function (t, k) { return '<li><span>' + (k + 1) + '</span>' + t + '</li>'; }).join('') + '</ol>' +
      '<p class="inicio-pie"><button class="btn-txt" data-accion="demo">Ver con datos de ejemplo</button><button class="btn-txt" data-accion="presentacion">Ver la presentación</button></p>' +
      '<p class="nota">Los datos no salen de este ordenador: todo se calcula en el navegador.</p></div>' +
      '<section class="fuentes" aria-label="De dónde salen los datos">' + (f ? panelFuente(App.fuente, f) : panelFuentes()) + '</section></div></div>';
  }
  function panelFuentes() {
    var carpetaOk = !!window.showDirectoryPicker;
    var tiles = Object.keys(FUENTES).map(function (k) {
      var f = FUENTES[k], estado = k === 'jira' ? 'Export CSV hoy' : (f.otra ? 'Con adaptador' : 'Simulación');
      return '<button class="conector' + (f.otra ? ' otra' : '') + '" data-accion="fuente" data-f="' + k + '"><span class="con-cab"><span class="con-ico" aria-hidden="true">' + f.ico + '</span><b>' + esc(f.nombre) + '</b></span>' +
        '<small>' + esc(f.sub) + '</small><span class="con-estado' + (k === 'jira' ? ' si' : '') + '">' + estado + '</span></button>';
    }).join('');
    return '<h2>Conecta vuestra herramienta</h2><div class="conectores">' + tiles + '</div>' +
      '<p class="separador">o deja aquí los exports</p>' +
      '<div class="zona" id="zona"><b>Suelta aquí el CSV de Jira</b><span>Exportado con todos los campos. Puedes soltar varios.</span>' +
      '<div class="botones"><button class="btn" data-accion="ficheros">Elegir ficheros</button>' + (carpetaOk ? '<button class="btn btn-sec" data-accion="carpeta">Elegir carpeta</button>' : '') +
      (App.carpeta ? '<button class="btn btn-sec" data-accion="leer-carpeta">Leer la carpeta «' + esc(App.carpeta.name) + '»</button>' : '') + '</div></div>';
  }
  function panelFuente(k, f) {
    var volver = '<button class="btn-txt volver" data-accion="fuentes">Volver a las fuentes</button>';
    var li = function (t) { return '<li>' + esc(t) + '</li>'; };
    if (f.otra) {
      return volver + '<h2>Otra herramienta</h2><p class="con-texto">Cualquier herramienta con export o API sirve. Se añade un adaptador que traduce sus tareas, estados y equipos al modelo común. Lo demás no cambia: medidas, comparaciones y recomendaciones.</p>' +
        '<dl class="con-datos"><dt>Ya funciona</dt><dd>Export CSV de Jira</dd><dt>Siguientes</dt><dd>Azure DevOps, ServiceNow y GitLab</dd><dt>Plantilla y coste</dt><dd>Excel de la herramienta de plantilla o de finanzas</dd></dl>' +
        '<div class="botones"><button class="btn btn-claro" data-accion="demo">Ver con datos de ejemplo</button></div>';
    }
    return volver + '<h2>Conectar ' + esc(f.nombre) + '</h2>' +
      '<dl class="con-datos"><dt>Instancia</dt><dd class="mono">' + esc(f.instancia) + '</dd><dt>Proyecto</dt><dd>' + esc(f.proyecto) + '</dd><dt>Equipo</dt><dd>' + esc(f.equipo) + '</dd>' +
      '<dt>Periodo</dt><dd>Últimos 12 meses</dd><dt>Acceso</dt><dd>Solo lectura, lo concede vuestro administrador</dd></dl>' +
      '<div class="con-dos"><div><b>Qué leemos</b><ul>' + f.lee.map(li).join('') + '</ul></div><div><b>Qué no leemos</b><ul>' + ['Personas asignadas ni informadores', 'Comentarios ni adjuntos'].map(li).join('') + '</ul></div></div>' +
      '<div class="botones"><button class="btn btn-claro" data-accion="conectar" data-f="' + k + '">Conectar y cargar</button>' + (f.csv ? '<button class="btn btn-sec" data-accion="ficheros">Cargar un export CSV</button>' : '') + '</div>' +
      '<p class="nota">Simulación: carga los datos de ejemplo de un banco ficticio. ' + (f.csv ? 'Con el export CSV ya se usan datos reales. ' : '') + 'La conexión directa se configura en el piloto con vuestro equipo de sistemas.</p>';
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
    return '<article class="kpi"><div class="kpi-cab"><span>' + def.nombre + '</span>' + chip(e, true) + '</div>' +
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
    var criticos = eqs.filter(function (e) { return problemas(e).critico.length; }).map(function (e) { return e.nombre; });
    var atencion = eqs.filter(function (e) { return !problemas(e).critico.length && problemas(e).atencion.length; }).map(function (e) { return e.nombre; });
    var foco = criticos.length ? criticos : atencion;
    var titular = !foco.length ? 'Todos los equipos están dentro de lo normal' :
      (foco.length === 1 ? 'Un equipo necesita atención: ' + foco[0] : (NUMEROS[foco.length] || foco.length) + ' equipos necesitan atención: ' + lista(foco));
    var nRec = recomendaciones().length;
    var html = '<section class="titular"><div><h1>' + esc(titular) + '</h1><p>Cada cifra se compara con lo normal en ese mismo equipo.' +
      (nRec ? ' ' + (App.generadas ? '<button class="btn-txt" data-accion="vista" data-v="recomendaciones">Ver ' + (nRec === 1 ? 'la recomendación' : 'las ' + nRec + ' recomendaciones') + '</button>' :
        '<button class="btn-txt" data-accion="generar">Generar las recomendaciones</button>') : '') + '</p></div>' + selector() + '</section>';
    var nAvisos = avisosCalidad();
    if (nAvisos) html += '<div class="aviso-datos"><span class="chip chip-atencion">Datos</span><span>Hay ' + (nAvisos === 1 ? 'un aviso' : nAvisos + ' avisos') + ' sobre la calidad de los datos. Conviene revisarlos antes de sacar conclusiones.</span><button class="btn-txt" data-accion="editar" data-e="calidad">Verlos</button></div>';
    html += '<section class="kpis" aria-label="Indicadores del área">' + KPI_AREA.concat(hayCoste() ? ['coste'] : []).map(function (id) { return tarjetaKpi(id, med(a, id), false); }).join('') + '</section>';
    if (eqs.length > 1) {
      html += '<section class="bloque"><h2>Equipos</h2><div class="tabla-caja"><table class="tabla-equipos"><thead><tr><th scope="col">Equipo</th>' +
        columnas().map(function (id) { return '<th scope="col">' + MED[id].nombre + '</th>'; }).join('') + '</tr></thead><tbody>' +
        eqs.map(function (eq) {
          var info = (App.cfg.equiposInfo || {})[eq.nombre] || {}, tipo = info.tipo === 'proveedor' ? (info.proveedor || 'Proveedor') : (info.tipo === 'interno' ? 'Interno' : '');
          return '<tr><th scope="row"><button class="enlace" data-accion="ver" data-e="' + esc(eq.nombre) + '">' + esc(eq.nombre) + '</button>' + (tipo ? '<span class="sub">' + esc(tipo) + '</span>' : '') + '</th>' +
            columnas().map(function (id) { var m = med(eq, id), v = m && m.disponible ? valor(id, m.valor) : null; return '<td>' + (v ? '<b>' + esc(v) + '</b> ' + chip(estadoDe(m)) : '<span class="apagado">s/d</span>') + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div><p class="nota">Sin etiqueta: dentro de lo normal para ese equipo. Pulsa un equipo para ver su detalle.</p></section>';
    }
    var bloques = [bloqueGrupos(), bloqueIniciativas()].filter(Boolean);
    if (bloques.length) html += '<div class="dos">' + bloques.join('') + '</div>';
    return html;
  }
  function bloqueGrupos() {
    var c = App.r.comparaciones.filter(function (x) { return x.dimension === 'tipo'; })[0];
    if (!c) return '<section class="bloque"><h2>Internos y proveedores</h2><p class="nota">Para comparar, indica qué equipos son de un proveedor en <button class="btn-txt" data-accion="editar" data-e="equipos">Cómo funciona</button>.</p></section>';
    var g = c.grupos, peor = {}; c.diferencias.forEach(function (d) { peor[d.medida + '|' + d.peor] = 1; });
    var filas = [['plazo_p80', 'Plazo', 'ciclo'], ['retrabajo', 'Retrabajo', 'retrabajo'], ['arrastradas', 'Pasa de sprint', 'arrastradas']].filter(function (f) { return c.medidas[f[0]] && c.medidas[f[0]].disponible; });
    if (!filas.length) return '';
    var cg = N.costeDeGrupos(c, cfgCalculo());
    var capac = function (titulo, f) {
      if (!g.some(function (x) { return f(cg[x.id]) != null; })) return '';
      return '<tr class="fila-coste"><th scope="row">' + titulo + '</th>' + g.map(function (x) { var v = f(cg[x.id]); return '<td>' + (v != null ? esc(v) : '<span class="apagado">falta FTE o coste</span>') + '</td>'; }).join('') + '</tr>';
    };
    var filasCoste = capac('Entregas al mes por FTE', function (x) { return x.entregasPorFte != null ? n1(x.entregasPorFte) : null; }) +
      capac('Coste por entrega', function (x) { return x.costePorEntrega != null ? euros(x.costePorEntrega) : null; });
    return '<section class="bloque"><h2>Internos y proveedores</h2><table class="tabla-grupos"><thead><tr><th scope="col">Medida</th>' + g.map(function (x) { return '<th scope="col">' + esc(x.nombre) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      filas.map(function (f) {
        var seg = c.medidas[f[0]].segmentos[0];
        return '<tr><th scope="row">' + f[1] + '</th>' + g.map(function (x) {
          var cel = seg.porGrupo[x.id], v = cel && cel.valor != null ? valor(f[2], cel.valor) : null, mal = peor[f[0] + '|' + x.id];
          return '<td' + (mal ? ' class="peor"' : '') + '>' + (v ? esc(v) + (mal ? ' · peor' : '') : '<span class="apagado">pocos datos</span>') + '</td>';
        }).join('') + '</tr>';
      }).join('') + filasCoste + '</tbody></table><p class="nota">Plazo, retrabajo y paso de sprint, con el mismo tipo y tamaño de tarea. ' + (filasCoste ? 'Entregas y coste, con todo lo terminado en 12 semanas: dependen del tamaño de las tareas. ' : 'Con el FTE y el coste de cada equipo (en <button class="btn-txt" data-accion="editar" data-e="equipos">Cómo funciona</button>) se ven también entregas por FTE y coste por entrega. ') + 'Es una pregunta para la reunión, no un ranking.</p></section>';
  }
  function textoIni(ev) {
    var x = ev.resultados[0];
    if (!x || !x.disponible) return { e: 'sin', t: 'Aún no hay semanas suficientes después del inicio.' };
    var fmt = (N.MEDIDAS_INICIATIVA[x.medida] || {}).formato || 'num', F = function (v) { return M.formatear(v, fmt); };
    var t = mayus(NOMBRE_INI[x.medida] || x.medida) + ' de ' + F(x.antes) + ' a ' + F(x.despues) + '. Confianza ' + x.confianza + '.';
    return { e: N.conEfecto(ev) ? 'bien' : 'neutro', t: t };
  }
  function bloqueIniciativas() {
    var ev = App.r.iniciativas.slice().sort(function (a, b) { return (N.conEfecto(b.evaluacion) ? 1 : 0) - (N.conEfecto(a.evaluacion) ? 1 : 0); });
    if (!ev.length) return '<section class="bloque"><h2>Iniciativas</h2><p class="nota">Cuando registréis una iniciativa de mejora (un fichero en la carpeta iniciativas), aquí veréis si funciona.</p></section>';
    return '<section class="bloque"><h2>Iniciativas</h2>' + ev.map(function (x) {
      var t = textoIni(x.evaluacion);
      return '<div class="fila-ini"><div><b>' + esc(x.iniciativa.nombre) + '</b><span>' + esc(t.t) + '</span></div><span class="chip chip-' + (t.e === 'bien' ? 'bien' : 'neutro') + '">' + (t.e === 'bien' ? 'Funciona' : (t.e === 'sin' ? 'Aún sin datos' : 'Sin efecto claro')) + '</span></div>';
    }).join('') + '<p class="nota">No es un experimento controlado: dice si merece seguir, no demuestra la causa.</p></section>';
  }
  function vistaEquipo(eq) {
    if (!eq) { App.ver = 'area'; return vistaArea(); }
    var p = problemas(eq, KPI_EQUIPO), fuera = p.critico.concat(p.atencion).map(function (id) { return MED[id].nombre.toLowerCase(); });
    var titular = eq.nombre + ': ' + (fuera.length ? lista(fuera) + ', fuera de lo normal' : 'todo dentro de lo normal');
    var info = (App.cfg.equiposInfo || {})[eq.nombre] || {};
    var sub = (info.tipo === 'proveedor' ? (info.proveedor || 'Proveedor') + ' · ' : '') + 'comparado con sus propias 12 semanas anteriores';
    var recs = recomendaciones().filter(function (x) { return x.equipos.indexOf(eq.nombre) >= 0; });
    var html = '<section class="titular"><div><button class="btn-txt" data-accion="ver" data-e="area">Volver al área</button><h1>' + esc(titular) + '</h1><p>' + esc(sub) + '</p></div>' + selector() + '</section>';
    html += '<section class="kpis" aria-label="Indicadores del equipo">' + KPI_EQUIPO.concat(hayCoste() ? ['coste'] : []).map(function (id) { return tarjetaKpi(id, med(eq, id), true); }).join('') + '</section>';
    html += '<div class="equipo-abajo"><section class="bloque grafico-plazo"><h2>El plazo, semana a semana</h2><p class="nota">Días para terminar 8 de cada 10 tareas. La franja es lo normal en este equipo.</p>' + graficoPlazo(eq.medidas.ciclo) + '</section>' +
      bloqueRecEquipo(eq, recs, fuera) + '</div>';
    return html;
  }
  // Antes de generar: qué está fuera de lo normal y el botón. Después: las recomendaciones del equipo.
  function bloqueRecEquipo(eq, recs, fuera) {
    if (!recs.length) return '<section class="bloque bloque-oscuro"><h2>Sin recomendaciones para ' + esc(eq.nombre) + '</h2><p>No hay nada fuera de lo normal que pida actuar.</p></section>';
    if (!App.generadas) {
      return '<section class="bloque bloque-oscuro"><h2>Qué hacer en ' + esc(eq.nombre) + '</h2><p>' + (fuera.length ? mayus(lista(fuera)) + (fuera.length === 1 ? ' está' : ' están') + ' fuera de lo normal. ' : 'Hay cifras que piden actuar. ') +
        'Genera las recomendaciones para ver el plan de acción.</p><button class="btn btn-claro" data-accion="generar">Generar recomendaciones</button></section>';
    }
    return '<section class="bloque bloque-oscuro"><h2>' + (recs.length === 1 ? 'Una recomendación' : (NUMEROS[recs.length] || recs.length) + ' recomendaciones') + ' para ' + esc(eq.nombre) + '</h2>' +
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
  // Las recomendaciones se generan con un botón: antes se ve qué se ha detectado y cómo se van a generar.
  var PASOS_RECS = ['Señales', 'Contexto', 'Banco de casos', 'Priorizar', 'IA', 'Revisión'];
  function claveRec(x) { return x.id + '|' + x.para; }
  function plural(n, uno, varios) { return n === 1 ? uno : varios; }
  // Cifras fuera de lo normal en las cinco medidas de cada equipo
  function senales() {
    var n = 0, eqs = 0;
    App.r.modelo.equipos.forEach(function (eq) {
      var k = COLUMNAS.filter(function (id) { var e = estadoDe(eq.medidas[id]); return e === 'atencion' || e === 'critico'; }).length;
      n += k; if (k) eqs++;
    });
    // Diferencias entre grupos: internos y proveedores o entre proveedores; si no hay, entre equipos de un área
    var cmp = App.r.comparaciones, dims = cmp.some(function (c) { return c.dimension !== 'area'; }) ? ['tipo', 'proveedor'] : ['area'];
    var difs = cmp.filter(function (c) { return dims.indexOf(c.dimension) >= 0; }).reduce(function (s, c) { return s + c.diferencias.filter(function (d) { return d.peor; }).length; }, 0);
    return { n: n, equipos: eqs, difs: difs };
  }
  function pantallaGenerar() {
    var s = senales(), nCasos = Object.keys(C.casos).length;
    return '<section class="generar estrecho"><p class="kicker">Recomendaciones</p><h1>Del diagnóstico al plan de acción</h1>' +
      '<p>Cruzamos vuestras cifras con el banco de casos de Capgemini. Para cada equipo sale qué hacer, de qué cifra sale, el primer paso y cómo comprobar si funcionó.</p>' +
      '<div class="generar-datos"><div class="dato"><b>' + s.n + '</b><span>' + plural(s.n, 'cifra fuera de lo normal', 'cifras fuera de lo normal') + '</span></div>' +
      '<div class="dato"><b>' + s.equipos + '</b><span>' + plural(s.equipos, 'equipo afectado', 'equipos afectados') + '</span></div>' +
      '<div class="dato"><b>' + nCasos + '</b><span>casos en el banco de Capgemini</span></div></div>' +
      '<button class="btn btn-grande" data-accion="generar">Generar recomendaciones</button>' +
      '<ol class="generar-pasos" aria-label="Cómo se generan">' + PASOS_RECS.map(function (t, i) { return '<li><span>' + (i + 1) + '</span>' + t + '</li>'; }).join('') + '</ol></section>';
  }
  function vistaRecomendaciones() {
    if (!App.generadas) return pantallaGenerar();
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
      '<button class="btn-txt" data-accion="generar">Volver a generar</button></div></section>';
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
    html += '<p class="nota">Las recomendaciones salen del banco de casos de Capgemini a partir de vuestras cifras. El consultor las revisa con vosotros antes de ponerlas en marcha.</p>';
    return html;
  }
  function idIniciativa(x) { return 'rec-' + x.id + '-' + slug(x.equipos.join('-')); }
  function registrable(x) { return !!(x.caso.medida && N.MEDIDAS_INICIATIVA[x.caso.medida] && C.medidas[x.caso.medida]); }
  function nombreMedida(id) { return MED[id] ? MED[id].nombre : (C.medidas[id] ? C.medidas[id].nombre : id); }
  function detalleRec(x, n) {
    var c = x.caso, def = c.medida ? C.medidas[c.medida] : null;
    var ev = x.evidencias.map(function (e) { return '<li>' + (e[0] && x.evidencias.length > 1 ? '<b>' + esc(e[0]) + ':</b> ' : '') + esc(e[1]) + '</li>'; }).join('');
    var plan = c.plan.map(function (s, i) {
      return '<li' + (i ? '' : ' class="primero"') + '><span class="paso-n">' + (i + 1) + '</span><div><b>' + esc(s.paso) + '</b><span class="meta">' + (i ? '' : '<span class="empieza">Primer paso</span>') +
        '<span>Lo hace: ' + esc(s.quien.toLowerCase()) + '</span><span>Esfuerzo: ' + esc(s.esfuerzo.toLowerCase()) + '</span></span></div></li>';
    }).join('');
    var ini = '';
    if (def) ini += '<p><b>Medida objetivo:</b> ' + esc(nombreMedida(c.medida).toLowerCase()) + ', ' + (def.dir === 'mas' ? 'subir' : 'bajar') + '.</p>';
    ini += '<p><b>Cómo saber si funciona:</b> ' + esc(c.comprobar) + '</p>';
    if (registrable(x)) {
      var hecha = iniciativas().some(function (i) { return i.id === idIniciativa(x); });
      ini += hecha ? '<p class="registrada"><span class="chip chip-bien">Registrada</span> Se evalúa en el tablero, en Iniciativas.</p>' :
        '<p><button class="btn btn-sec btn-peq" data-accion="registrar" data-k="' + esc(claveRec(x)) + '">Registrar como iniciativa</button></p><p class="nota">Se evalúa antes y después, desde dos semanas tras el inicio, frente a los equipos que no la tienen.</p>';
    } else ini += '<p class="nota">Se sigue en el tablero con su propia medida.</p>';
    return '<div class="rec-cab"><span class="rec-n">' + n + '</span>' + chip(x.gravedad) + '<span class="rec-para">Para: ' + esc(x.para) + '</span></div>' +
      '<h2>' + esc(x.titulo) + '</h2>' + (c.senal ? '<p class="rec-senal">' + esc(c.senal) + '</p>' : '') +
      '<section class="rec-bloque"><h3>De dónde sale</h3><ul class="rec-de">' + ev + '</ul></section>' +
      '<section class="rec-bloque"><h3>Plan de acción</h3><ol class="rec-plan">' + plan + '</ol></section>' +
      '<div class="rec-dos"><section class="rec-caja"><h3>Iniciativa propuesta</h3>' + ini + '</section>' +
      (c.preguntas && c.preguntas.length ? '<section class="rec-caja"><h3>Para la reunión</h3><ul>' + c.preguntas.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></section>' : '') + '</div>' +
      '<details data-k="' + esc(claveRec(x)) + '"' + (App.abiertas[claveRec(x)] ? ' open' : '') + '><summary>Causas habituales y respaldo</summary><div class="rec-mas"><div><b>Causas habituales</b><ul>' +
      c.causas.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div><div><b>Respaldo</b><p>' + esc(c.respaldo || '') + '</p>' + (c.comun ? '<p>' + esc(c.comun) + '</p>' : '') + '</div></div></details>';
  }
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
  function generar() {
    if (!App.r) return;
    App.vista = 'recomendaciones'; App.editar = null;
    render(); window.scrollTo(0, 0);
    var cfg = configRecs();
    window.Proceso.reproducir(cfg).then(function () {
      App.generadas = true;
      var recs = recomendaciones();
      if (!recs.some(function (x) { return claveRec(x) === App.recSel; })) App.recSel = recs[0] ? claveRec(recs[0]) : null;
      if (App.vista === 'recomendaciones') { render(); window.scrollTo(0, 0); }
    });
  }

  // ---------- el método animado (proceso.js) ----------
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function miles(n) { return window.Proceso ? window.Proceso.miles(n) : String(n); }
  function cuenta(n, formato) { return '<b data-cuenta="' + n + '"' + (formato ? ' data-formato="' + formato + '"' : '') + '>' + miles(n) + '</b>'; }
  function recortar(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; }
  function vfila(etiqueta, n, clase, d) {
    return '<div class="v-fila pe ' + (clase || '') + '" style="--d:' + d + '"><span>' + etiqueta + '</span><b><i data-cuenta="' + n + '">' + miles(n) + '</i></b></div>';
  }
  function matriz(soloSenales) {
    var eqs = App.r.modelo.equipos.slice(0, 8);
    var cab = '<span></span>' + COLUMNAS.map(function (id) { return '<span class="h">' + MED[id].nombre + '</span>'; }).join('');
    var filas = eqs.map(function (eq, k) {
      return '<span class="eq pe" style="--d:' + (k + 2) + '">' + esc(eq.nombre) + '</span>' + COLUMNAS.map(function (id) {
        var m = eq.medidas[id], e = estadoDe(m), fuera = e === 'atencion' || e === 'critico';
        var v = m && m.disponible ? cifra(id, m.valor).g : '';
        return '<span class="v-celda pe ' + e + (soloSenales && !fuera ? ' apagada' : '') + '" style="--d:' + (k + 2) + '" title="' + esc(eq.nombre + ', ' + MED[id].nombre + ': ' + (ESTADO[e] || 'normal')) + '">' + esc(v) + '</span>';
      }).join('');
    }).join('');
    return '<div class="v-matriz">' + cab + filas + '</div><p class="v-leyenda pe" style="--d:9"><span class="v-l bien"></span>Bien <span class="v-l atencion"></span>Atención <span class="v-l critico"></span>Crítico <span class="v-l sin"></span>Sin datos</p>';
  }
  function listaAvisos() {
    var vistos = {};
    App.lectura.informe.avisos.concat(App.det.avisos).forEach(function (a) { vistos[a.texto] = 1; });
    App.r.modelo.equipos.forEach(function (e) { e.calidad.avisos.forEach(function (a) { vistos[a] = 1; }); });
    return Object.keys(vistos);
  }
  function segundos(ms) { var s = Math.max(0.1, Math.round(ms / 100) / 10); return s.toLocaleString('es-ES') + ' ' + (s === 1 ? 'segundo' : 'segundos'); }
  function configCarga(simulada) {
    var f = simulada ? FUENTES[simulada] : null, r = App.r, inf = App.lectura.informe, det = App.det, eqs = r.modelo.equipos, op = opcion(campo());
    var E = C.estados.estados, mp = mapeo(), info = App.cfg.equiposInfo || {};
    var hasta = new Date(Math.min(det.fechaRef, det.fechaMax));
    var origen = f ? f.nombre : 'Jira';
    var valores = op && op.id !== 'todos' ? op.valores : [];
    var tareasDe = function (nombre) { var v = valores.filter(function (x) { return x.valor === nombre; })[0]; return v ? v.n : null; };
    var campoTxt = f ? f.equipo.toLowerCase() : (op ? (op.id === 'todos' ? '' : op.nombre.replace(/^campo\s+/i, 'el campo ')) : '');
    // 1. Leer
    var p1 = {
      nombre: 'Leer', titulo: f ? 'Leemos los ' + f.unidad + ' de ' + f.nombre : 'Leemos los exports',
      texto: 'Unimos todo lo que llega y nos quedamos con la versión más reciente de cada tarea. Las épicas y las subtareas no cuentan como entregas.',
      visual: '<div class="v-lista">' + vfila(f ? 'Registros leídos de ' + f.nombre : 'Filas leídas de ' + inf.ficheros.length + ' ' + plural(inf.ficheros.length, 'fichero', 'ficheros'), inf.filasLeidas, '', 1) +
        vfila('Repetidas: cuentan una vez', inf.duplicadas, 'fuera', 2) + vfila('Épicas y subtareas: fuera del cálculo', inf.epicas + inf.subtareas, 'fuera', 3) +
        (inf.sinClave ? vfila('Sin clave: no se pueden seguir', inf.sinClave, 'fuera', 3) : '') +
        vfila('Tareas para medir', inf.tareas, 'total', 4) + '</div>',
      resultado: cuenta(inf.tareas) + ' tareas del ' + esc(fechaCorta(det.fechaMin)) + ' al ' + esc(fechaCorta(hasta))
    };
    // 2. Equipos
    var p2 = {
      nombre: 'Equipos', titulo: 'Reconocemos los equipos',
      texto: 'Detectamos el campo que dice de qué equipo es cada tarea' + (campoTxt ? ' (aquí, ' + esc(campoTxt) + ')' : '') + '. Lo que no se puede detectar, como qué equipo es de un proveedor, se indica una vez y se guarda.',
      visual: '<div class="v-chips">' + eqs.map(function (e, k) {
        var i = info[e.nombre] || {}, prov = i.tipo === 'proveedor', n = tareasDe(e.nombre);
        return '<span class="v-chip pe' + (prov ? ' prov' : '') + '" style="--d:' + (k + 2) + '"><b>' + esc(e.nombre) + '</b><small>' + (n != null ? miles(n) + ' tareas' : '') + (prov ? (n != null ? ', ' : '') + esc(i.proveedor || 'proveedor') : (i.tipo === 'interno' ? (n != null ? ', ' : '') + 'interno' : '')) + '</small></span>';
      }).join('') + '</div>',
      resultado: cuenta(eqs.length) + ' ' + plural(eqs.length, 'equipo', 'equipos') + ', cada uno medido por separado'
    };
    // 3. Estados
    var pares = f ? f.estados : det.estados.map(function (e) { return [e.nombre, mp[e.nombre] || e.estado]; });
    var p3 = {
      nombre: 'Estados', titulo: 'Traducimos los estados',
      texto: 'Cada estado de ' + esc(origen) + ' pasa a uno de nueve estados comunes. Así todos los equipos se miden con las mismas reglas, aunque cada uno trabaje con sus propios estados.',
      visual: '<div class="v-mapeo">' + pares.slice(0, 7).map(function (x, k) {
        var d = E[x[1]] || E.pendiente;
        return '<span class="v-org pe" style="--d:' + (k + 2) + '">' + esc(x[0]) + '</span><span class="v-flecha pe" aria-hidden="true" style="--d:' + (k + 2) + '">→</span><span class="v-comun pe e-' + d.etapa + '" style="--d:' + (k + 2) + '">' + esc(d.nombre) + '</span>';
      }).join('') + '</div>' + (pares.length > 7 ? '<p class="v-mas pe" style="--d:9">Y ' + (pares.length - 7) + ' estados más</p>' : ''),
      resultado: cuenta(pares.length) + ' estados de ' + esc(origen) + ' con su estado común'
    };
    // 4. Calidad
    var avisos = listaAvisos();
    var checks = [
      ['Tareas que se cierran sin pasar por en curso', /sin estar en curso/i],
      ['Cierres en bloque', /en bloque/i],
      ['Tiempo en cada estado', /tiempo en estado/i],
      ['Sprints creíbles', /sprint/i],
      ['Actividad hasta el final del periodo', /actividad/i],
    ];
    var p4 = {
      nombre: 'Calidad', titulo: 'Comprobamos que los datos son fiables',
      texto: 'Buscamos señales de que la herramienta no refleja el trabajo real. Si las hay, se avisan antes de sacar conclusiones, nunca se esconden.',
      visual: '<div class="v-checks">' + checks.map(function (c, k) {
        var malos = avisos.filter(function (a) { return c[1].test(a); });
        return '<div class="v-check pe" style="--d:' + (k + 2) + '"><span class="v-ico ' + (malos.length ? 'aviso' : 'ok') + '" aria-hidden="true">' + (malos.length ? '!' : CHECK) + '</span><div><b>' + c[0] + '</b><span>' + (malos.length ? esc(recortar(malos[0], 110)) : 'Sin problemas') + '</span></div></div>';
      }).join('') + '</div>',
      resultado: avisos.length ? cuenta(avisos.length) + ' ' + plural(avisos.length, 'aviso', 'avisos') + ' para revisar con los equipos' : '<b>Sin avisos</b>: los datos reflejan bien el trabajo'
    };
    // 5. Plantilla y coste
    var cfgC = cfgCalculo(), nombres = eqs.map(function (e) { return e.nombre; }), cap = N.capacidadArea(cfgC, nombres), fte = cfgC.fte || {}, coste = cfgC.coste || {};
    var p5 = {
      nombre: 'Coste', titulo: 'Unimos plantilla y coste',
      texto: 'Cruzamos cada equipo con sus personas equivalentes (FTE) y lo que cuesta cada una. ' + esc(origen) + ' no los trae: salen de la herramienta de plantilla, de los contratos o de finanzas. Siempre por equipo, nunca salarios.',
      visual: '<div class="v-tabla pe" style="--d:2"><table><thead><tr><th scope="col">Equipo</th><th scope="col">FTE</th><th scope="col">Un FTE al mes</th><th scope="col">Equipo al mes</th></tr></thead><tbody>' +
        nombres.slice(0, 8).map(function (e) {
          var a = fte[e], b = coste[e];
          return '<tr><th scope="row">' + esc(e) + '</th><td>' + (a ? n1(a) : '<span class="v-falta">Sin indicar</span>') + '</td><td>' + (b ? euros(b) : '<span class="v-falta">Sin indicar</span>') + '</td><td>' + (a && b ? euros(a * b) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>',
      resultado: cap.costeMes != null ? cuenta(Math.round(cap.costeMes), 'eur') + ' al mes en ' + n1(cap.fteTotal) + ' FTE' : '<b>Pendiente</b>: el FTE y el coste se indican en Cómo funciona'
    };
    // 6. Medir
    var total = eqs.length * COLUMNAS.length, s = senales();
    var p6 = {
      nombre: 'Medir', titulo: 'Medimos cada equipo contra sí mismo',
      texto: 'Cinco medidas por equipo y semana. Cada cifra se compara con las 12 semanas anteriores de ese mismo equipo. Entre grupos, solo con el mismo tipo y tamaño de tarea.',
      visual: matriz(false),
      resultado: cuenta(s.n) + ' de ' + total + ' cifras fuera de lo normal'
    };
    var semanas = r.modelo.semanas.length;
    return {
      kicker: 'El método', titulo: 'Así hacemos fiables vuestros datos',
      fuente: f ? esc(f.nombre) + ' (simulación)' : (App.origen === 'ejemplo' ? 'Datos de ejemplo' : esc(recortar(inf.ficheros.map(function (x) { return x.nombre; }).join(', '), 48))),
      pie: f ? 'Simulación con los datos de ejemplo de un banco ficticio' : 'Todo se calcula en este navegador: los datos no salen del ordenador',
      pasos: [p1, p2, p3, p4, p5, p6],
      final: {
        titulo: 'Datos listos para usar',
        texto: 'Calculado en este navegador en ' + segundos(App.tiempoMs || 0) + '. Cada cifra del tablero sale de estos pasos, y el documento de definiciones los recoge para firmarlos.',
        visual: '<div class="v-resumen">' + [[inf.tareas, 'tareas'], [eqs.length, plural(eqs.length, 'equipo', 'equipos')], [semanas, 'semanas'], [s.n, plural(s.n, 'cifra fuera de lo normal', 'cifras fuera de lo normal')]].map(function (x, k) {
          return '<div class="pe" style="--d:' + (k + 2) + '">' + cuenta(x[0]) + '<span>' + x[1] + '</span></div>';
        }).join('') + '</div>',
        boton: 'Ver el tablero'
      }
    };
  }
  function animarCarga(simulada) {
    if (!App.r || !window.Proceso) return;
    try { window.Proceso.reproducir(configCarga(simulada)); } catch (e) { if (window.console) console.error(e); }
  }
  function configRecs() {
    var r = App.r, recs = recomendaciones(), eqs = r.modelo.equipos, info = App.cfg.equiposInfo || {}, s = senales();
    var crit = recs.filter(function (x) { return x.gravedad === 'critico'; }).length;
    // 2. Contexto
    var internos = eqs.filter(function (e) { return (info[e.nombre] || {}).tipo !== 'proveedor'; }).length;
    var provs = {}; eqs.forEach(function (e) { var i = info[e.nombre] || {}; if (i.tipo === 'proveedor') provs[i.proveedor || 'Proveedor'] = 1; });
    var provLista = Object.keys(provs), nProv = eqs.length - internos;
    var funcionan = r.iniciativas.filter(function (x) { return N.conEfecto(x.evaluacion); }).length;
    var ctx = [[internos + ' ' + plural(internos, 'equipo interno', 'equipos internos'), ''], [nProv + ' de ' + plural(nProv, 'proveedor', 'proveedores'), provLista.join(', ')]];
    if (r.iniciativas.length) ctx.push([r.iniciativas.length + ' ' + plural(r.iniciativas.length, 'iniciativa evaluada', 'iniciativas evaluadas'), funcionan ? funcionan + ' ' + plural(funcionan, 'funciona', 'funcionan') : 'ninguna con efecto claro']);
    if (s.difs) ctx.push([s.difs + ' ' + plural(s.difs, 'diferencia entre grupos', 'diferencias entre grupos'), 'mismo tipo y tamaño de tarea']);
    if (hayCoste()) ctx.push(['Coste por entrega', 'por equipo y por grupo']);
    if (App.contexto && App.contexto.documentos) ctx.push([App.contexto.documentos.length + ' ' + plural(App.contexto.documentos.length, 'documento de contexto', 'documentos de contexto'), 'método, organización, stack']);
    // 3. Banco de casos
    var activos = {}; recs.forEach(function (x) { activos[x.id] = 1; });
    var ids = Object.keys(C.casos), nAct = Object.keys(activos).length, orden = 0;
    var banco = '<div class="v-banco">' + ids.map(function (id) {
      var on = activos[id];
      return '<span class="v-caso' + (on ? ' on' : '') + '"' + (on ? ' style="--d:' + (orden++) + '"' : '') + '>' + esc(C.casos[id].titulo) + '</span>';
    }).join('') + '</div>';
    // 4. Priorizar
    var orden4 = '<ol class="v-orden">' + recs.slice(0, 5).map(function (x, k) {
      return '<li class="pe" style="--d:' + (k + 2) + '"><span class="rec-n">' + (k + 1) + '</span><span><b>' + esc(x.titulo) + '</b><small>' + esc(recortar(x.para, 60)) + '</small></span>' + chip(x.gravedad) + '</li>';
    }).join('') + '</ol>' + (recs.length > 5 ? '<p class="v-mas pe" style="--d:8">Y ' + (recs.length - 5) + ' más</p>' : '');
    // 5. IA: borrador del primero, con sus cifras reales
    var top = recs[0], borrador = top ? '<div class="v-borrador pe" style="--d:1"><p class="v-borr-cab"><span>Borrador</span>' + esc(top.para) + '</p><h4>' + esc(top.titulo) + '</h4>' +
      top.evidencias.slice(0, 2).map(function (e, k) { return '<p class="v-linea" style="--d:' + (k + 1) + '">' + esc(recortar((e[0] && top.evidencias.length > 1 ? e[0] + ': ' : '') + e[1], 120)) + '</p>'; }).join('') +
      '<p class="v-linea" style="--d:3"><b>Primer paso:</b> ' + esc(recortar(top.caso.plan[0].paso, 100)) + '</p></div>' : '<p class="nota">Sin recomendaciones que redactar.</p>';
    var pasos = [
      { nombre: 'Señales', titulo: 'Buscamos las señales', texto: 'Miramos qué cifras están fuera de lo normal en cada equipo y qué diferencias claras hay entre grupos con el mismo tipo de trabajo.',
        visual: matriz(true), resultado: cuenta(s.n) + ' ' + plural(s.n, 'cifra fuera de lo normal', 'cifras fuera de lo normal') + (s.difs ? ' y ' + s.difs + ' ' + plural(s.difs, 'diferencia entre grupos', 'diferencias entre grupos') : '') },
      { nombre: 'Contexto', titulo: 'Añadimos el contexto', texto: 'Una cifra sola no explica nada. Sumamos qué equipos son propios o de proveedores, qué iniciativas están en marcha y si funcionan, y el coste.',
        visual: '<div class="v-chips">' + ctx.map(function (x, k) { return '<span class="v-chip pe" style="--d:' + (k + 2) + '"><b>' + esc(x[0]) + '</b>' + (x[1] ? '<small>' + esc(x[1]) + '</small>' : '') + '</span>'; }).join('') + '</div>',
        resultado: cuenta(eqs.length) + ' ' + plural(eqs.length, 'equipo', 'equipos') + ' con su contexto' },
      { nombre: 'Banco de casos', titulo: 'Cruzamos con el banco de casos', texto: 'Cada caso del banco de Capgemini une una señal con sus causas habituales, un plan de acción y cómo comprobar si funcionó. Solo se activan los que encajan con vuestras cifras.',
        visual: banco, resultado: cuenta(nAct) + ' de ' + ids.length + ' casos se activan con vuestras cifras', dur: 3000 },
      { nombre: 'Priorizar', titulo: 'Ordenamos por lo que más importa', texto: 'Primero lo más grave y lo que afecta a más equipos. Si un mismo problema aparece en varios equipos, va una sola vez.',
        visual: orden4, resultado: cuenta(recs.length) + ' ' + plural(recs.length, 'recomendación', 'recomendaciones') + (crit ? ', ' + crit + ' ' + plural(crit, 'crítica', 'críticas') : '') },
      { nombre: 'IA', titulo: 'La IA adapta el plan', etiqueta: 'Próxima fase', texto: 'La IA del consultor adaptará cada plan a vuestro contexto y lo redactará citando estas cifras. Los números los calcula siempre la herramienta, nunca la IA. Hoy el plan sale tal cual del banco de casos.',
        visual: borrador, resultado: '', dur: 3200 },
      { nombre: 'Revisión', titulo: 'El consultor lo revisa con vosotros', texto: 'Un consultor de Capgemini revisa cada recomendación con los responsables de equipo antes de ponerla en marcha.',
        visual: '<div class="v-checks">' + [['Cada recomendación cita la cifra de la que sale', true], ['Primer paso con quién lo hace y su esfuerzo', true], ['Cómo saber si funcionó, como iniciativa', true], ['Revisión con los responsables de equipo', false]].map(function (c, k) {
          return '<div class="v-check pe" style="--d:' + (k + 2) + '"><span class="v-ico ' + (c[1] ? 'ok' : 'pend') + '" aria-hidden="true">' + (c[1] ? CHECK : '') + '</span><div><b>' + c[0] + '</b>' + (c[1] ? '' : '<span>Con el consultor, antes de empezar</span>') + '</div></div>';
        }).join('') + '</div>',
        resultado: '<b>Plan listo</b> para revisar con vosotros' }
    ];
    return {
      kicker: 'Generar recomendaciones', titulo: 'Del diagnóstico al plan de acción', fuente: App.demo ? 'Datos de ejemplo' : '',
      pie: 'Las recomendaciones salen del banco de casos de Capgemini a partir de vuestras cifras',
      pasos: pasos,
      final: {
        titulo: recs.length ? 'Plan de acción listo' : 'Nada que pida actuar ahora',
        texto: recs.length ? 'Cada recomendación trae de qué cifra sale, el plan, la iniciativa para comprobarlo y las preguntas para la reunión.' : 'Todas las cifras están dentro de lo normal en cada equipo.',
        visual: '<div class="v-resumen">' + [[recs.length, plural(recs.length, 'recomendación', 'recomendaciones')], [crit, plural(crit, 'crítica', 'críticas')], [recs.filter(registrable).length, plural(recs.filter(registrable).length, 'iniciativa propuesta', 'iniciativas propuestas')]].map(function (x, k) {
          return '<div class="pe" style="--d:' + (k + 2) + '">' + cuenta(x[0]) + '<span>' + x[1] + '</span></div>';
        }).join('') + '</div>',
        boton: 'Ver las recomendaciones'
      }
    };
  }

  // ---------- cómo funciona ----------
  function comoFunciona() {
    var r = App.r, inf = App.lectura.informe, det = App.det, eqs = r.modelo.equipos.map(function (e) { return e.nombre; });
    var info = App.cfg.equiposInfo || {}, mp = mapeo(), E = C.estados.estados, op = opcion(campo());
    var provs = eqs.filter(function (e) { return (info[e] || {}).tipo === 'proveedor'; });
    var campoNombre = op ? (op.id === 'todos' ? 'ninguno: todo el trabajo como un solo equipo' : 'el campo ' + op.nombre.replace(/^campo\s+/i, '')) : '';
    var desde = det.fechaMin, hasta = new Date(Math.min(det.fechaRef, det.fechaMax));
    var html = '<section class="titular estrecho"><div><h1>Cómo funciona</h1><p>Lee lo que ya exportáis de Jira, mide cada equipo contra su propia historia y propone qué hacer. No hay nada que configurar: todo se calcula al cargar los datos.</p></div></section>';
    html += '<ol class="pasos estrecho">' +
      '<li><span>1</span><b>Exportáis de Jira</b><p>Un CSV con todos los campos, como hoy. Se deja en la carpeta exports y se pulsa Actualizar.</p></li>' +
      '<li><span>2</span><b>Medimos cada equipo</b><p>Cinco medidas, siempre las mismas, comparadas con lo normal en ese equipo. Con la plantilla y su coste, también el coste por entrega.</p></li>' +
      '<li><span>3</span><b>Proponemos qué hacer</b><p>Recomendaciones con su evidencia. Un consultor de Capgemini las revisa con vosotros cada mes.</p></li></ol>';
    html += '<section class="bloque estrecho"><h2>Las medidas</h2><dl class="defs">' + COLUMNAS.concat(['coste']).map(function (id) { return '<dt>' + MED[id].nombre + '</dt><dd>' + esc(MED[id].que) + '</dd>'; }).join('') + '</dl></section>';
    html += '<section class="bloque estrecho"><h2>Cómo se lee el estado</h2><p class="nota">Lo normal es el rango en el que está la medida 7 de cada 10 semanas en ese equipo, mirando las 12 semanas anteriores.</p><dl class="leyenda">' +
      '<dt>' + chip('bien', true) + '</dt><dd>Dentro de lo normal o mejor.</dd><dt>' + chip('atencion') + '</dt><dd>Peor que lo normal.</dd><dt>' + chip('critico') + '</dt><dd>Bastante peor que lo normal, o por encima de un límite fijo (por ejemplo, retrabajo del 30%).</dd></dl></section>';
    // Así hemos leído los datos, con lo que se puede cambiar
    var ed = App.editar;
    var fila = function (k, titulo, texto, panel) {
      return '<div class="leido"><div class="leido-cab"><b>' + titulo + '</b><p>' + texto + '</p>' + (panel !== undefined ? '<button class="btn btn-sec btn-peq" data-accion="editar" data-e="' + k + '" aria-expanded="' + (ed === k) + '">' + (ed === k ? 'Listo' : 'Cambiar') + '</button>' : '') + '</div>' + (ed === k && panel ? '<div class="leido-panel">' + panel() + '</div>' : '') + '</div>';
    };
    html += '<section class="bloque estrecho" id="leido"><div class="bloque-cab"><h2>Así hemos leído vuestros datos</h2></div>' +
      fila('fichero', 'Ficheros', esc(inf.ficheros.map(function (f) { return f.nombre; }).join(', ')) + ': ' + inf.tareas.toLocaleString('es-ES') + ' tareas del ' + esc(fechaCorta(desde)) + ' al ' + esc(fechaCorta(hasta)) + '. Sin épicas ni subtareas.') +
      fila('campo', 'Equipos', 'Según ' + esc(campoNombre) + ': ' + esc(lista(eqs)) + '.', panelCampo) +
      fila('equipos', 'Proveedores, áreas, FTE y coste', (provs.length ? esc(lista(provs.map(function (e) { return e + ' (' + ((info[e] || {}).proveedor || 'proveedor') + ')'; }))) + ' son de proveedores. El resto, internos.' : 'Todos los equipos se tratan como internos. Indica cuáles son de un proveedor para poder compararlos.') + ' ' + textoCapacidad(eqs), panelEquipos) +
      fila('estados', 'Estados', esc(det.estados.map(function (e) { return e.nombre + ' es ' + E[mp[e.nombre] || e.estado].nombre.toLowerCase(); }).join('; ')) + '.' + (det.estados.some(function (e) { return e.propuestaPor !== 'nombre' && !(App.cfg.mapeoEstados || {})[e.nombre]; }) ? ' <span class="chip chip-atencion">Revisar</span>' : ''), panelEstados) +
      calidad() + '</section>';
    html += modeloDeMedida();
    html += '<section class="bloque estrecho"><h2>Documentos para el consultor</h2><p class="nota">El documento de definiciones recoge todo lo anterior para firmarlo con el cliente. El paquete de diagnóstico lleva solo cifras agregadas para la IA del consultor.</p>' +
      '<label class="campo-linea">Nombre del cliente <input type="text" data-cambio="nombre" value="' + esc(App.cfg.nombre || '') + '" placeholder="Por ejemplo, Banco Ejemplo"></label>' +
      '<p class="botones"><button class="btn" data-accion="definiciones" data-f="docx">Descargar definiciones (Word)</button><button class="btn btn-sec" data-accion="definiciones" data-f="md">En markdown</button><button class="btn btn-sec" data-accion="paquete">Exportar paquete de diagnóstico</button><button class="btn btn-sec" data-accion="modelo">Descargar el modelo de medida</button></p>' +
      (App.demo ? '' : '<p class="nota">Para enseñarlo: <button class="btn-txt" data-accion="presentacion">ver la presentación</button> o <button class="btn-txt" data-accion="demo">ver con datos de ejemplo</button>. La demo no toca vuestros datos.</p>') + '</section>';
    html += '<section class="bloque bloque-oscuro estrecho"><h2>Lo que no hace</h2><ul><li>No mide a personas: todas las cifras son de equipo y no se lee quién hace cada tarea. El coste es el del equipo, nunca el salario de nadie.</li><li>No saca los datos de este ordenador: todo se calcula en el navegador.</li><li>No hace rankings: comparar internos y proveedores es una pregunta para la reunión, con el mismo tipo de trabajo.</li><li>No demuestra causas: una iniciativa que mejora una cifra dice si merece seguir, no por qué.</li></ul></section>';
    return html;
  }
  // Resumen de FTE y coste para "Así hemos leído vuestros datos"
  function textoCapacidad(eqs) {
    var cap = N.capacidadArea(cfgCalculo(), eqs);
    if (cap.costeMes != null) return 'Plantilla de ' + n1(cap.fteTotal) + ' FTE con un coste de ' + euros(cap.costeMes) + ' al mes.';
    if (cap.fteTotal != null) return 'Plantilla de ' + n1(cap.fteTotal) + ' FTE. Indica el coste de un FTE de cada equipo para ver el coste por entrega.';
    return 'Indica el FTE y el coste de cada equipo para ver entregas por FTE y coste por entrega.';
  }
  // El modelo de medida: las mismas definiciones, de cualquier fuente a cualquier herramienta
  function modeloDeMedida() {
    var col = function (titulo, items, oscuro) {
      return '<div class="modelo-col' + (oscuro ? ' modelo-centro' : '') + '"><b>' + titulo + '</b><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>';
    };
    return '<section class="bloque estrecho" id="modelo"><h2>El modelo de medida</h2>' +
      '<p>Lo que da valor no es el número de campos conectados, sino que todos midan con las mismas definiciones y que el trabajo, la plantilla y el coste se unan por el mismo equipo. Eso es el modelo de medida (lo que en una plataforma de datos se llama capa semántica). Esta página es una forma de usarlo.</p>' +
      '<div class="modelo" role="group" aria-label="De las fuentes a las salidas">' +
      col('Fuentes', ['<b>Gestión del trabajo:</b> Jira hoy, Azure DevOps u otra con su adaptador', '<b>Plantilla:</b> FTE de cada equipo por mes', '<b>Finanzas y contratos:</b> coste de un FTE']) +
      col('Modelo común', ['Tarea, equipo, capacidad, coste e iniciativa', 'Unidos por el equipo y el mes', 'Estados de cada herramienta traducidos a nueve estados comunes'], true) +
      col('Definiciones', ['Una por medida, firmada con el cliente', 'Cada equipo frente a su propia historia', 'Comparaciones solo con medidas normalizadas']) +
      col('Salidas', ['<b>Piloto:</b> esta página, sin servidor', '<b>Escala:</b> la plataforma de datos del cliente con conectores', '<b>IA:</b> paquete de diagnóstico solo con cifras agregadas']) +
      '</div>' +
      '<p class="nota">Probado con datos sintéticos: 200 equipos y 62.000 tareas al año (unos 1.000 desarrolladores) cargan en unos 13 segundos en un portátil. Con miles de desarrolladores, el mismo modelo se monta en la plataforma de datos del cliente. Lo que suele faltar para escalar es un identificador de equipo común en las tres fuentes.</p>' +
      '</section>';
  }
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

  // ---------- presentación ----------
  var LAMINAS = []; try { LAMINAS = JSON.parse(document.getElementById('laminas').textContent || '[]'); } catch (e) { LAMINAS = []; }
  var NOMBRES_LAMINA = ['Portada', 'El problema', 'La propuesta', 'Qué se mide', 'Cómo escala', 'La demo', 'Lo siguiente'];
  var LAMINA_DEMO = 5;
  function presentacion() {
    var i = App.lamina = Math.max(0, Math.min(App.lamina, LAMINAS.length - 1));
    var cuerpo = (LAMINAS[i] || '').replace(/<span class="lz-ico" data-icp="([a-z]+)" style="([^"]*)"><\/span>/g, function (m, k, st) { return '<span class="lz-ico" style="' + st + '">' + icp(k) + '</span>'; });
    var nav = '<nav class="pres-nav" aria-label="Presentación"><button class="btn-txt" data-accion="lamina" data-d="-1"' + (i ? '' : ' disabled') + '>Anterior</button><ol>' +
      LAMINAS.map(function (x, k) { return '<li><button data-accion="lamina-ir" data-i="' + k + '"' + (k === i ? ' aria-current="true"' : '') + '><span>0' + (k + 1) + '</span> ' + esc(NOMBRES_LAMINA[k] || '') + '</button></li>'; }).join('') + '</ol>' +
      (i >= LAMINA_DEMO ? '<button class="btn btn-peq" data-accion="demo">Ver la demo</button>' : '<button class="btn-txt" data-accion="lamina" data-d="1">Siguiente</button>') + '</nav>';
    return '<div class="presentacion"><header class="cab"><div class="cab-in">' + marca() + '<span class="hueco"></span><button class="btn btn-cab" data-accion="salir-presentacion">Ir a la herramienta</button></div></header>' +
      '<div class="lienzo-marco" id="lienzo-marco" aria-label="' + esc(NOMBRES_LAMINA[i] || '') + '"><div class="lienzo" id="lienzo">' + cuerpo + '</div></div>' + nav + '</div>';
  }
  function ajustarLienzo() {
    var marco = document.getElementById('lienzo-marco'), lz = document.getElementById('lienzo');
    if (!marco || !lz) return;
    var w = marco.clientWidth, h = marco.clientHeight, e = Math.min(w / 1920, h / 1080);
    lz.style.transform = 'translate(' + Math.round((w - 1920 * e) / 2) + 'px,' + Math.round((h - 1080 * e) / 2) + 'px) scale(' + e + ')';
  }

  // ---------- acciones ----------
  function cambiar(fn) {
    // Cambio de configuración: se guarda, se recalcula todo y se vuelve a pintar en el mismo sitio
    var y = window.scrollY;
    fn(); guardarCfg();
    enSegundoPlano(function () { recalcular(); render(); window.scrollTo(0, y); });
  }
  var ACC = {
    vista: function (el) { App.vista = el.getAttribute('data-v'); App.editar = null; render(); window.scrollTo(0, 0); },
    ver: function (el) { App.ver = el.getAttribute('data-e'); App.vista = 'tablero'; render(); window.scrollTo(0, 0); },
    ficheros: function () { document.getElementById('entrada-ficheros').click(); },
    carpeta: elegirCarpeta,
    'leer-carpeta': function () { if (App.carpeta) leerCarpeta(App.carpeta); },
    demo: function () { verDemo(null); },
    fuente: function (el) { App.fuente = el.getAttribute('data-f'); render(); },
    fuentes: function () { App.fuente = null; render(); },
    conectar: function (el) { verDemo(el.getAttribute('data-f')); },
    generar: generar,
    rec: function (el) {
      App.recSel = el.getAttribute('data-k'); render();
      var d = document.getElementById('rec-detalle');
      if (d) { d.classList.add('entra'); if (window.innerWidth < 1000) d.scrollIntoView({ block: 'start' }); }
    },
    registrar: function (el) { registrar(el.getAttribute('data-k')); },
    'ver-recs': function (el) { App.recEquipo = el.getAttribute('data-e') || 'todos'; App.recSel = null; App.vista = 'recomendaciones'; render(); window.scrollTo(0, 0); },
    'salir-demo': function () { salirDemo(); if (!App.r) { App.vista = 'inicio'; render(); } },
    presentacion: function () { App.vista = 'presentacion'; App.lamina = 0; render(); },
    'salir-presentacion': function () { App.vista = App.r ? 'tablero' : 'inicio'; render(); },
    lamina: function (el) { App.lamina += +el.getAttribute('data-d'); render(); },
    'lamina-ir': function (el) { App.lamina = +el.getAttribute('data-i'); render(); },
    actualizar: function () {
      if (App.demo) { aviso('En la demo los datos son fijos. Pulsa "Cargar mis datos" para usar los vuestros.'); return; }
      if (App.carpeta) return leerCarpeta(App.carpeta);
      if (App.origen === 'datosjs') return location.reload();
      document.getElementById('entrada-ficheros').click();
    },
    editar: function (el) {
      var k = el.getAttribute('data-e');
      if (App.vista !== 'como') { App.vista = 'como'; App.editar = k; render(); var s = document.getElementById('leido'); if (s) s.scrollIntoView(); return; }
      var y = window.scrollY; App.editar = App.editar === k ? null : k; render(); window.scrollTo(0, y);
    },
    definiciones: function (el) { definiciones(el.getAttribute('data-f')); },
    paquete: paquete,
    modelo: descargarModelo,
    'ver-demo': function () { verDemo(null); }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-accion]');
    if (!el) return;
    var f = ACC[el.getAttribute('data-accion')];
    if (f) { e.preventDefault(); f(el); }
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
  document.addEventListener('keydown', function (e) {
    if (App.vista !== 'presentacion' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight' && App.lamina < LAMINAS.length - 1) { App.lamina++; render(); }
    if (e.key === 'ArrowLeft' && App.lamina > 0) { App.lamina--; render(); }
  });
  var tRes = null;
  window.addEventListener('resize', function () { clearTimeout(tRes); tRes = setTimeout(ajustarLienzo, 100); });

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
  App.render = render; App.ACC = ACC; App.leerCarpeta = leerCarpeta; App.recomendaciones = recomendaciones; App.procesar = procesar;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
