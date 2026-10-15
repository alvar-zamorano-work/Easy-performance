/* Interfaz de Easy Performance: onboarding en seis pasos, vistas por perfil, detalle de medida, chequeo y configuración. */
(function () {
  'use strict';
  var C = CATALOGO, esc = G.esc, F = Motor.formatear;
  var CLAVE_CFG = 'easyperformance.configuracion.v1';
  var App = { cfg: null, tareas: null, informe: null, det: null, modelo: null, pre: null, origen: null, vista: 'equipo', equipo: null,
    medida: null, paso: 1, borrador: null, carpeta: null, editando: false, onboarding: true, cola: [], verNoAplica: false,
    // Presentación inicial (diapositivas), demo con datos de ejemplo y pantallas dentro de cada vista
    presentacion: false, diap: 0, demo: false, cfgReal: null, pant: {}, pantActual: null, casoSel: {}, grafSel: {}, imprimiendo: false,
    // Nuevo en la v1: lectura en el modelo neutro, iniciativas y contexto de la carpeta, y el diagnóstico calculado
    lectura: null, iniciativasCarpeta: [], contexto: null, diag: null };
  window.EasyPerformance = App; // útil para pruebas

  // ---------- iconos ----------
  var IC = {
    bien: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.2l2.1 2.1 4.3-4.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    atencion: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l7 12.6H1z" fill="currentColor"/><path d="M8 5.6v4" stroke="#3a2a00" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.9" r="1" fill="#3a2a00"/></svg>',
    critico: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
    no: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.5"/></svg>',
    aviso: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l7 12.6H1z" fill="currentColor"/><path d="M8 5.6v4" stroke="#3a2a00" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.9" r="1" fill="#3a2a00"/></svg>',
    marca: '<svg viewBox="0 0 30 30" aria-hidden="true"><defs><linearGradient id="ep-grad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0058ab"/><stop offset="0.6" stop-color="#1db8f2"/><stop offset="1" stop-color="#00d5d0"/></linearGradient></defs><rect width="30" height="30" rx="8" fill="url(#ep-grad)"/><path d="M7 19.5l4.5-5.5 4 3 7-8.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="22.5" cy="8.5" r="2" fill="#fff"/></svg>'
  };
  // Iconos de línea para las opciones del onboarding (24x24, trazo del color del texto)
  function ico(d) { return '<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg></span>'; }
  var ICO = {
    cumplir: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    tardamos: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    avez: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
    arreglos: '<path d="M4.5 11a7.5 7.5 0 0 1 13-4.6L19.5 8.5"/><path d="M19.5 4v4.5H15"/><path d="M19.5 13a7.5 7.5 0 0 1-13 4.6L4.5 15.5"/><path d="M4.5 20v-4.5H9"/>',
    pendiente: '<path d="M4 14v5h16v-5"/><path d="M4 14l2.5-8h11l2.5 8"/><path d="M4 14h4.5l1.5 2h4l1.5-2H20"/>',
    tiempo: '<path d="M11 4.1A8 8 0 1 0 19.9 13H11z"/><path d="M14 3.6a8 8 0 0 1 6.4 6.4H14z"/>',
    datos: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    responsable: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M15.8 14.2c2.3.2 4.1 1.8 4.7 4.8"/>',
    direccion: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    pmo: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>',
    negocio: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5v-2A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2"/><path d="M3.5 12.5h17"/>'
  };
  var ETQ = { bien: 'Bien', atencion: 'Atención', critico: 'Crítico', sin: 'Sin datos' };
  function cuentaEstado(cs) {
    var crit = cs.filter(function (c) { return c.gravedad === 'critico'; }).length, at = cs.length - crit;
    if (!cs.length) return estado('bien');
    return (crit ? '<span class="est est-critico">' + crit + (crit > 1 ? ' críticos' : ' crítico') + '</span> ' : '') + (at ? '<span class="est est-atencion">' + at + ' de atención</span>' : '');
  }
  function estado(e, txt) {
    if (!e || e === 'neutro') return '';
    return '<span class="est est-' + e + '" title="' + esc(txt || '') + '">' + ETQ[e] + '</span>';
  }
  // Unidad de cada medida: un sufijo corto que va junto a la cifra y una explicación que va debajo
  var UNIDAD = {
    ciclo: ['días', 'para terminar 8 de cada 10 tareas'], total: ['días', 'desde que se pide (8 de cada 10)'], entregas: ['', 'tareas por semana (media de 4 semanas)'],
    espera: ['', 'del tiempo de ciclo en espera'], edad: ['', 'tareas en curso por encima de lo habitual'], wip: ['', 'tareas en curso'], pendiente: ['', 'tareas sin empezar'],
    errores: ['', 'de lo terminado son errores'], retrabajo: ['', 'de lo terminado volvió atrás'], arrastradas: ['', 'de lo terminado pasó por más de un sprint'],
    regularidad: ['', 'de variación de una semana a otra'], estimacion: ['', 'relación entre puntos y duración (0 a 1)'], velocidad: ['', 'puntos por semana (media de 4 semanas)'],
    primera: ['h', 'hasta la primera respuesta (8 de cada 10)'], reparto: ['', 'de lo terminado son historias'], fiabilidad: ['', 'de lo comprometido se cumple']
  };
  function sufijo(id, v) { var u = (UNIDAD[id] || [''])[0]; return u === 'días' && v != null && Math.abs(v - 1) < 0.05 ? 'día' : u; }
  function unidadLarga(id) { var u = UNIDAD[id]; if (!u) return (C.medidas[id] || {}).unidad || ''; return (u[0] ? u[0] + ' ' : '') + u[1]; }
  function corto(v, formato) {
    if (v == null || isNaN(v)) return 'sin datos';
    if (formato === 'pct') return Math.round(v * 100) + '%';
    if (formato === 'dec') return (Math.round(v * 100) / 100).toLocaleString('es-ES');
    return (Math.round(v * 10) / 10).toLocaleString('es-ES');
  }
  // Cifra grande con su sufijo en pequeño: "23,8 días"
  function cifraHtml(id, v) {
    var def = C.medidas[id], suf = sufijo(id, v);
    return esc(corto(v, def.formato)) + (suf && v != null ? '<small>' + esc(suf) + '</small>' : '');
  }
  // Pone en negrita las cifras con unidad de un texto ("42%", "6,1 días", "de 3 a 14 tareas")
  var RE_CIFRA = /\d+(?:[.,]\d+)?(?:\s(?:a|y)\s\d+(?:[.,]\d+)?)?(?:%|\s(?:días|día|tareas|tarea|semanas|puntos|punto|h)\b)/g;
  function resaltar(txt) {
    txt = String(txt == null ? '' : txt);
    var out = '', ultimo = 0, m;
    RE_CIFRA.lastIndex = 0;
    while ((m = RE_CIFRA.exec(txt))) {
      var antes = m.index > 0 ? txt.charAt(m.index - 1) : '';
      if (/[\w-]/.test(antes) || /cada\s$/.test(txt.slice(Math.max(0, m.index - 5), m.index))) continue;
      out += esc(txt.slice(ultimo, m.index)) + '<b>' + esc(m[0]) + '</b>';
      ultimo = m.index + m[0].length;
    }
    return out + esc(txt.slice(ultimo));
  }
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function semanaTexto(fin) {
    var a = new Date(fin.getTime() - 7 * 864e5), b = new Date(fin.getTime() - 864e5);
    if (a.getMonth() === b.getMonth()) return 'semana del ' + a.getDate() + ' al ' + b.getDate() + ' de ' + MESES_L[b.getMonth()] + ' de ' + b.getFullYear();
    return 'semana del ' + a.getDate() + ' de ' + MESES_L[a.getMonth()] + ' al ' + b.getDate() + ' de ' + MESES_L[b.getMonth()] + ' de ' + b.getFullYear();
  }
  // Compara el valor con lo habitual del equipo y dice si está peor, mejor o igual
  // Definición de una medida o de un indicador de comité (tienen formato y dirección)
  var KPI = {}; (C.kpis || []).forEach(function (k) { KPI[k.id] = k; });
  function defMedida(id) { return C.medidas[id] || KPI[id] || {}; }
  function comparar(id, m) {
    var def = defMedida(id);
    if (!m || m.valor == null || !m.ref || m.ref.med == null || !def.dir) return null;
    var r = m.ref, arriba = m.valor > r.hi, abajo = m.valor < r.lo;
    var sentido = arriba ? 'sube' : (abajo ? 'baja' : 'igual');
    var peor = (def.dir === 'menos' && arriba) || (def.dir === 'mas' && abajo);
    var mejor = (def.dir === 'menos' && abajo) || (def.dir === 'mas' && arriba);
    return { sentido: sentido, clase: peor ? 'peor' : (mejor ? 'mejor' : ''), habitual: F(r.med, def.formato) };
  }
  function deltaHtml(id, m) {
    var c = comparar(id, m);
    if (!c) return '';
    var fl = c.sentido === 'sube' ? '↑ ' : (c.sentido === 'baja' ? '↓ ' : '');
    return '<span class="delta ' + c.clase + '">' + fl + 'Lo habitual: ' + esc(c.habitual) + '</span>';
  }

  // ---------- almacenamiento ----------
  function leerLocal() { try { var s = localStorage.getItem(CLAVE_CFG); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function guardarLocal(c) { try { localStorage.setItem(CLAVE_CFG, JSON.stringify(c)); } catch (e) { } }
  function borrarLocal() { try { localStorage.removeItem(CLAVE_CFG); } catch (e) { } }
  function idb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('sin idb'));
      var r = indexedDB.open('easyperformance', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet(k) { return idb().then(function (db) { return new Promise(function (res) { var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function idbSet(k, v) { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); }; }); }).catch(function () { return false; }); }

  function T(k) { return (App.cfg && App.cfg.textos && App.cfg.textos[k]) || C.textos[k] || ''; }
  function editable(tag, k, cls) { return '<' + tag + ' class="editable ' + (cls || '') + '" data-t="' + k + '"' + (App.editando ? ' contenteditable="true"' : '') + '>' + esc(T(k)) + '</' + tag + '>'; }

  // ---------- avisos ----------
  var tToast = null;
  function aviso(txt) {
    var el = document.getElementById('toast');
    el.textContent = txt; el.hidden = false;
    clearTimeout(tToast); tToast = setTimeout(function () { el.hidden = true; }, 5200);
  }
  function ocupado(si) { document.getElementById('ocupado').hidden = !si; }

  // ---------- carga de datos ----------
  // Jira exporta en UTF-8; si alguien guarda el CSV desde Excel puede quedar en Windows-1252.
  function descodificar(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  function leerFichero(f) { return f.arrayBuffer().then(descodificar); }
  function desdeBase64(b64) {
    var bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
    for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return descodificar(bytes);
  }
  function cargarFicheros(files) {
    var csv = [].filter.call(files, function (f) { return /\.csv$/i.test(f.name) || /csv/.test(f.type); });
    if (!csv.length) { aviso('Elige uno o varios ficheros CSV exportados de Jira.'); return; }
    ocupado(true);
    Promise.all(csv.map(function (f) { return leerFichero(f).then(function (t) { return { nombre: f.name, texto: t }; }); }))
      .then(function (fs) { setTimeout(function () { procesar(fs, 'ficheros'); ocupado(false); }, 10); })
      .catch(function () { ocupado(false); aviso('No se pudieron leer los ficheros.'); });
  }
  function cargarEjemplo() {
    var t = (document.getElementById('demo-csv') || {}).textContent || '';
    if (!t.trim()) { aviso('Esta copia no incluye datos de ejemplo.'); return; }
    ocupado(true);
    setTimeout(function () { procesar([{ nombre: 'datos-de-ejemplo.csv', texto: t }], 'ejemplo'); ocupado(false); }, 10);
  }
  function permiso(h, modo) {
    if (!h.queryPermission) return Promise.resolve(true);
    return h.queryPermission({ mode: modo }).then(function (p) {
      if (p === 'granted') return true;
      return h.requestPermission({ mode: modo }).then(function (p2) { return p2 === 'granted'; });
    });
  }
  function elegirCarpeta() {
    if (!window.showDirectoryPicker) { aviso('Este navegador no permite elegir carpetas. Usa Chrome o Edge, o arrastra los ficheros.'); return; }
    window.showDirectoryPicker({ id: 'easyperformance', mode: 'readwrite' }).then(function (h) {
      App.carpeta = h; idbSet('carpeta', h);
      return leerCarpeta(h);
    }).catch(function (e) { if (e && e.name !== 'AbortError') aviso('No se pudo abrir la carpeta.'); });
  }
  function leerCarpeta(h) {
    ocupado(true);
    return permiso(h, 'readwrite').catch(function () { return permiso(h, 'read'); }).then(function (ok) {
      if (!ok) throw new Error('permiso');
      return h.getDirectoryHandle('exports').catch(function () { return h; });
    }).then(function (dir) {
      var fs = [], it = dir.values();
      function sig() {
        return it.next().then(function (r) {
          if (r.done) return;
          var e = r.value;
          if (e.kind === 'file' && /\.csv$/i.test(e.name)) return e.getFile().then(leerFichero).then(function (t) { fs.push({ nombre: e.name, texto: t }); }).then(sig);
          return sig();
        });
      }
      return sig().then(function () { return fs; });
    }).then(function (fs) {
      if (!fs.length) { ocupado(false); aviso('No hay ficheros CSV en la carpeta exports.'); return; }
      return leerConfigCarpeta(h).then(function () { return leerExtrasCarpeta(h); }).then(function (n) { procesar(fs, 'carpeta'); ocupado(false); guardarFoto(); aviso('Leídos ' + fs.length + ' fichero(s) de la carpeta' + (n ? ' y ' + n + ' iniciativa' + (n === 1 ? '' : 's') : '') + '.'); });
    }).catch(function () { ocupado(false); aviso('No hay permiso para leer la carpeta. Pulsa otra vez "Leer la carpeta".'); });
  }
  function leerConfigCarpeta(h) {
    if (App.cfg) return Promise.resolve();
    return h.getDirectoryHandle('configuracion').then(function (d) { return d.getFileHandle('cliente.json'); })
      .then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); })
      .then(function (t) { try { App.cfg = JSON.parse(t); guardarLocal(App.cfg); } catch (e) { } }).catch(function () { });
  }
  // Ficheros .json de una subcarpeta (iniciativas, contexto). Si no existe, lista vacía.
  function leerJsonsCarpeta(h, sub) {
    return h.getDirectoryHandle(sub).then(function (dir) {
      var out = [], it = dir.values();
      function sig() {
        return it.next().then(function (r) {
          if (r.done) return out;
          var e = r.value;
          if (e.kind === 'file' && /\.json$/i.test(e.name)) return e.getFile().then(function (f) { return f.text(); }).then(function (t) { try { out.push({ nombre: e.name, datos: JSON.parse(t) }); } catch (x) { aviso('No se pudo leer ' + sub + '/' + e.name + ': no es JSON válido.'); } }).then(sig);
          return sig();
        });
      }
      return sig();
    }).catch(function () { return []; });
  }
  function leerExtrasCarpeta(h) {
    return Promise.all([leerJsonsCarpeta(h, 'iniciativas'), leerJsonsCarpeta(h, 'contexto')]).then(function (r) {
      App.iniciativasCarpeta = r[0].map(function (x) { return x.datos; }).filter(iniciativaValida);
      var docs = [];
      r[1].forEach(function (x) { if (x.datos && x.datos.documentos) docs = docs.concat(x.datos.documentos); });
      App.contexto = docs.length ? { documentos: docs } : null;
      App.diag = null;
      return App.iniciativasCarpeta.length;
    });
  }
  function escribirEnCarpeta(sub, nombre, texto) {
    var h = App.carpeta;
    if (!h || !h.queryPermission) return Promise.resolve(false);
    return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') return false;
      return h.getDirectoryHandle(sub, { create: true }).then(function (d) { return d.getFileHandle(nombre, { create: true }); })
        .then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(texto).then(function () { return w.close(); }); }).then(function () { return true; });
    }).catch(function () { return false; });
  }
  function guardarFoto() {
    if (!App.tareas || !App.carpeta) return;
    var hoy = new Date().toISOString().slice(0, 10);
    var abiertas = App.tareas.filter(function (t) { return !t.fechas.terminada; }).map(function (t) { var a = t.agrupadores || {}; return { clave: t.clave_origen, estado: t.estado_origen, sprints: t.sprints, equipo: a.equipo || a.componentes || a.proyecto || '' }; });
    escribirEnCarpeta('historico', 'foto-' + hoy + '.json', JSON.stringify({ fecha: new Date().toISOString(), abiertas: abiertas }));
  }

  function procesar(fs, origen) {
    if (App.demo && origen !== 'ejemplo') salirDemo();
    if (origen !== 'datosjs') App.presentacion = false; // al abrir con datos.js y sin configuración, primero la presentación
    var r = Motor.ingerir(fs);
    App.tareas = r.tareas; App.informe = r.informe; App.lectura = r.lectura; App.origen = origen; App.diag = null;
    if (!r.tareas.length) {
      App.det = null; App.modelo = null; App.onboarding = true; App.paso = 1; render();
      aviso('No se encontraron tareas en los ficheros. ' + ((r.informe.avisos[0] || {}).texto || ''));
      return;
    }
    App.det = Motor.detectar(r.tareas, r.informe);
    if (App.cfg && configValida(App.cfg)) {
      recalcular(); App.onboarding = false;
      if (!App.equipo || !equipoPorNombre(App.equipo)) App.equipo = App.modelo.equipos.length ? App.modelo.equipos[0].nombre : null;
      if (!vistaPermitida(App.vista)) App.vista = 'equipo';
    } else {
      App.borrador = borradorInicial(App.cfg); App.onboarding = true; App.paso = 1; App.pre = null;
    }
    render();
  }
  function configGuardada() { return !!leerLocal() || !!window.EASY_PERFORMANCE_CONFIG; }
  function configValida(c) {
    if (!c || !c.medidas || !c.campoEquipo) return false;
    var op = opcion(c.campoEquipo);
    return !!op && (op.id === 'todos' || op.valores.length > 0);
  }
  function cfgMotor(c) { return { campoEquipo: c.campoEquipo, equipos: c.equipos, mapeoEstados: c.mapeoEstados, etapas: c.mapeoEstados ? undefined : c.etapas, limites: c.limites, fte: c.fte || {} }; }
  function recalcular() {
    App.diag = null;
    App.modelo = Motor.calcular(App.tareas, App.det, cfgMotor(App.cfg));
    // El área se calcula en segundo plano para que su pestaña se abra al momento
    var m = App.modelo;
    setTimeout(function () { if (App.modelo === m && !App.presentacion && vistasDisponibles().some(function (v) { return v[0] === 'todos'; })) modeloArea(); }, 400);
  }
  function opcion(id) { return App.det ? App.det.opcionesEquipo.filter(function (o) { return o.id === id; })[0] : null; }
  function equipoPorNombre(n) { return App.modelo ? App.modelo.equipos.filter(function (e) { return e.nombre === n; })[0] : null; }

  // ---------- borrador del onboarding ----------
  function equiposPorDefecto(campo) {
    var op = opcion(campo); if (!op) return [];
    if (op.id === 'todos') return [];
    var total = op.valores.reduce(function (s, v) { return s + v.n; }, 0);
    return op.valores.filter(function (v) { return v.n / total >= 0.02; }).map(function (v) { return v.valor; });
  }
  function borradorInicial(base) {
    var b = base ? JSON.parse(JSON.stringify(base)) : {};
    if (!b.campoEquipo || !opcion(b.campoEquipo)) b.campoEquipo = App.det.equipoRecomendado;
    if (!b.equipos || !b.equipos.length) b.equipos = equiposPorDefecto(b.campoEquipo);
    // Mapeo de estados: la propuesta del núcleo; una configuración de la v0 trae etapas y se convierte
    var mapeo = {};
    App.det.estados.forEach(function (e) { mapeo[e.nombre] = e.estado; });
    if (!b.mapeoEstados && b.etapas) Object.assign(mapeo, Nucleo.etapasV0AMapeo(b.etapas, App.det.mapeoEstados));
    b.mapeoEstados = Object.assign(mapeo, b.mapeoEstados || {});
    delete b.etapas;
    b.equiposInfo = b.equiposInfo || {}; b.fte = b.fte || {}; b.fteOrigen = b.fteOrigen || {};
    b.perfiles = b.perfiles || ['responsable', 'direccion'];
    b.graficos = b.graficos || { ciclo: 'puntos', evolucion: 'banda', pendiente: 'entradas' };
    b.limites = b.limites || {}; b.textos = b.textos || {}; b.noAplica = b.noAplica || {};
    return b;
  }
  function calcularPre() { App.pre = Motor.calcular(App.tareas, App.det, cfgMotor(App.borrador)); }
  function señalesPorObjetivo() {
    var out = {};
    C.objetivos.forEach(function (o) { out[o.id] = { puntos: 0, ejemplos: [] }; });
    (App.pre ? App.pre.equipos : []).forEach(function (eq) {
      eq.casos.forEach(function (c) {
        (C.casos[c.id].objetivos || []).forEach(function (oid) {
          if (!out[oid]) return;
          out[oid].puntos += c.gravedad === 'critico' ? 2 : 1;
          if (out[oid].ejemplos.length < 2) out[oid].ejemplos.push(C.casos[c.id].titulo.toLowerCase() + ' en ' + eq.nombre);
        });
      });
    });
    return out;
  }
  function objetivosRecomendados() {
    var s = señalesPorObjetivo();
    var ids = C.objetivos.filter(function (o) { return !o.fijo && s[o.id].puntos > 0; }).sort(function (a, b) { return s[b.id].puntos - s[a.id].puntos; }).map(function (o) { return o.id; });
    return ids.length ? ids.slice(0, 2) : ['tardamos', 'cumplir'];
  }
  function disponibleEnAlguno(id, modelo) {
    return (modelo || App.pre || App.modelo).equipos.some(function (e) { return e.medidas[id] && e.medidas[id].disponible; });
  }
  function medidasRecomendadas(objetivos) {
    var ids = [];
    objetivos.concat(['datos']).forEach(function (oid) {
      var o = C.objetivos.filter(function (x) { return x.id === oid; })[0];
      (o ? o.medidas : []).forEach(function (m) { if (ids.indexOf(m) < 0) ids.push(m); });
    });
    if (ids.indexOf('edad') < 0) ids.push('edad');
    return C.ordenMedidas.filter(function (m) { return ids.indexOf(m) >= 0 && disponibleEnAlguno(m); }).slice(0, 8);
  }

  // ---------- render ----------
  function render() {
    App.cola = []; App.pantActual = null;
    document.body.classList.toggle('en-presentacion', !!App.presentacion);
    var html;
    if (App.presentacion) html = presentacion();
    else if (App.onboarding || !App.modelo) html = asistente();
    else html = (App.demo ? bandaDemo() : '') + vistaPrincipal();
    // Las vistas repartidas en pantallas ocupan justo el alto de la ventana
    document.body.classList.toggle('en-pantallas', !!App.pantActual && !App.imprimiendo);
    document.getElementById('barra').innerHTML = barra();
    var app = document.getElementById('app');
    app.innerHTML = html;
    pintarGraficos();
    if (App.presentacion) prepararPrevia();
  }
  function grafico(fn) {
    var id = 'g' + App.cola.length;
    App.cola.push({ id: id, fn: fn });
    return '<div class="grafico" id="' + id + '"></div>';
  }
  function pintarGraficos() {
    App.cola.forEach(function (g) {
      var el = document.getElementById(g.id);
      if (!el) return;
      try { el.innerHTML = g.fn(Math.max(280, Math.round(el.clientWidth))); } catch (e) { el.innerHTML = '<p class="g-vacio">No se pudo dibujar este gráfico.</p>'; if (window.console) console.error(e); }
    });
  }

  function barra() {
    var info = 'Rendimiento de equipos desde Jira';
    var marcaHtml = '<div class="marca">' + IC.marca + '<span class="marca-txt"><b>Easy Performance</b><span class="firma">Capgemini Invent</span></span>';
    if (App.presentacion) {
      return '<div class="barra-in">' + marcaHtml + '<span class="info">' + esc(info) + '</span></div>' +
        '<div class="acciones"><button class="btn btn-sec btn-peq" data-accion="saltar-presentacion">' + (App.modelo && !App.onboarding ? 'Volver a la herramienta' : 'Ir a la herramienta') + '</button></div></div>';
    }
    if (App.modelo && !App.onboarding) {
      var nTareas = App.modelo.equipos.reduce(function (s, e) { return s + e.n; }, 0);
      info = 'Datos hasta el ' + Motor.fechaCorta(new Date(App.modelo.semanaFin.getTime() - 864e5)) + ' · ' + nTareas.toLocaleString('es-ES') + ' tareas · ' + App.modelo.equipos.length + ' equipo' + (App.modelo.equipos.length === 1 ? '' : 's');
    }
    var pest = '';
    if (App.modelo && !App.onboarding) {
      var vistas = vistasDisponibles();
      pest = '<nav class="pestanas" aria-label="Vistas">' + vistas.map(function (v) {
        return '<button class="pestana" data-accion="vista" data-v="' + v[0] + '" aria-current="' + (App.vista === v[0] || (App.vista === 'medida' && v[0] === 'equipo')) + '">' + esc(v[1]) + '</button>';
      }).join('') + '</nav>';
    }
    var presentar = '<button class="btn-barra btn-txt-largo" data-accion="ver-presentacion" title="Volver a la presentación">Presentación</button>';
    var acc = '<div class="acciones">' + presentar + '</div>';
    if (App.modelo && !App.onboarding) {
      acc = '<div class="acciones">' + presentar + '<button class="btn btn-sec btn-peq" data-accion="actualizar" title="' + esc(info) + '. Pulsa para volver a leer los datos.">Actualizar</button>' +
        '<button class="btn btn-sec btn-peq btn-txt-largo" data-accion="imprimir" title="Imprimir o guardar como PDF el informe completo">Imprimir</button></div>';
    }
    return '<div class="barra-in' + (pest ? ' con-pestanas' : '') + (pest && vistasDisponibles().length > 4 ? ' muchas' : '') + '">' + marcaHtml + '<span class="info">' + esc(info) + '</span></div>' + pest + acc + '</div>';
  }
  function vistasDisponibles() {
    var perf = (App.cfg && App.cfg.perfiles) || ['responsable'];
    var mapa = { responsable: ['equipo', 'Mi equipo'], direccion: ['todos', 'El área'], pmo: ['pmo', 'Compromisos y riesgos'], negocio: ['negocio', 'Plazos y reparto'] };
    var out = C.perfiles.filter(function (p) { return p.fijo || perf.indexOf(p.id) >= 0; }).map(function (p) { return mapa[p.id]; });
    if (perf.indexOf('direccion') >= 0) { out.push(['grupos', 'Comparar']); out.push(['iniciativas', 'Iniciativas']); }
    if (hayAgentReady()) out.push(['agentes', 'Agentes']);
    out.push(['chequeo', 'Fiabilidad de los datos']); out.push(['config', 'Ajustes']);
    return out;
  }
  function vistaPermitida(v) { return v === 'medida' || vistasDisponibles().some(function (x) { return x[0] === v; }); }

  // ---------- asistente ----------
  var PASOS = ['Datos', 'Equipos', 'Estados', 'Calidad', 'Objetivos', 'Medidas', 'Vistas', 'Listo'];
  function asistente() {
    var cuerpo = [null, paso1, paso2, pasoEstados, pasoCalidad, paso3, paso4, paso5, paso6][App.paso]();
    if (App.paso === 1 && !App.det && App.cfg && configGuardada()) return '<div class="asistente">' + cuerpo + '</div>';
    var pasos = '<ol class="pasos" aria-label="Pasos">' + PASOS.map(function (p, i) {
      var n = i + 1, cl = n < App.paso ? 'hecho' : (n === App.paso ? 'actual' : '');
      return '<li class="' + cl + '"' + (n === App.paso ? ' aria-current="step"' : '') + '><span class="n">' + (n < App.paso ? '✓' : n) + '</span><span class="t">' + p + '</span></li>';
    }).join('') + '</ol>';
    return '<div class="asistente">' + pasos + '<div class="asistente-cuerpo">' + cuerpo + '</div>' + pieAsistente() + '</div>';
  }
  function pieAsistente() {
    if (App.paso === 1 && !App.det) return '';
    var atras = App.paso > 1 ? '<button class="btn btn-sec" data-accion="anterior">Atrás</button>' : (App.cfg ? '<button class="btn btn-sec" data-accion="cancelar">Volver al tablero</button>' : '<span></span>');
    var dcha;
    if (App.paso === 1) dcha = '<button class="btn btn-sec" data-accion="aceptar-todo">Usar todo lo recomendado</button> <button class="btn" data-accion="siguiente">Seguir</button>';
    else if (App.paso < PASOS.length) dcha = '<button class="btn" data-accion="siguiente">Seguir</button>';
    else dcha = '<button class="btn" data-accion="terminar">Ver mi tablero</button>';
    return '<div class="pie-asistente">' + atras + '<div>' + dcha + '</div></div>';
  }

  // Tarjeta de opción del onboarding: casilla o botón de radio con su marca visual y, si hay, un icono
  function opcionHtml(o) {
    return '<label class="opcion' + (o.marcada ? ' marcada' : '') + (o.inactiva ? ' inactiva' : '') + '">' + o.input + '<span class="check" aria-hidden="true"></span>' +
      (o.icono ? ico(o.icono) : '') + o.cuerpo + '</label>';
  }
  function cabecera(antetitulo, titulo, texto, extra) {
    return '<div class="cabecera"><div>' + (antetitulo ? '<div class="antetitulo">' + esc(antetitulo) + '</div>' : '') + '<h1>' + esc(titulo) + '</h1>' + (texto ? '<p>' + esc(texto) + '</p>' : '') + '</div>' + (extra || '') + '</div>';
  }

  function paso1() {
    var carpetaOk = !!window.showDirectoryPicker;
    var zona = '<div class="zona" id="zona">' + ICO_GRANDE.subir + '<h2>Suelta aquí tu fichero de Jira</h2>' +
      '<p class="muted">Uno o varios CSV exportados desde la búsqueda de Jira con <b>Todos los campos</b>. Si ya tienes la carpeta de Easy Performance, elígela y leeremos lo que haya en <b>exports</b>.</p>' +
      '<div class="botones"><button class="btn" data-accion="cargar-ficheros">Elegir ficheros</button>' +
      (carpetaOk ? '<button class="btn btn-sec" data-accion="elegir-carpeta">Elegir carpeta</button>' : '') +
      (App.carpeta ? '<button class="btn btn-sec" data-accion="leer-carpeta">Leer la carpeta «' + esc(App.carpeta.name) + '»</button>' : '') + '</div>' +
      '<p class="small muted zona-pie">Tus datos no salen de tu ordenador: todo se calcula en este navegador. ¿Sin fichero a mano? <button class="btn-txt" data-accion="ejemplo">Prueba los pasos con datos de ejemplo</button></p></div>';
    if (!App.det && App.cfg && configGuardada()) {
      return cabecera('Tus datos', 'Carga los datos de esta semana', 'Tu configuración está guardada. Suelta el fichero nuevo de Jira y verás el tablero al momento.') + '<div class="rejilla-carga">' + zona +
        '<aside class="tarjeta como-exportar"><h3>Para esta semana</h3><ol><li>Exporta de Jira lo actualizado en las últimas semanas, con <b>Todos los campos</b>.</li><li>Si usas la carpeta, deja el fichero en <b>exports</b> y pulsa Actualizar.</li><li>¿Quieres cambiar objetivos o medidas? Está en Ajustes, una vez cargados los datos.</li></ol></aside></div>';
    }
    if (!App.det) {
      return cabecera('Paso 1 de 8 · Tus datos', 'Empecemos por tus datos', 'En ocho pasos tendrás el tablero de tus equipos y el documento de definiciones. En cada uno te proponemos una opción, y puedes aceptarla sin más.') +
        '<div class="rejilla-carga">' + zona +
        '<aside class="tarjeta como-exportar"><h3>Cómo sacar el fichero de Jira</h3><ol>' +
        '<li>Abre la búsqueda de Jira y filtra por los proyectos de tus equipos. Para empezar, un año de historia.</li>' +
        '<li>Exporta a CSV con <b>Todos los campos</b>. Así llegan el tiempo en cada estado y los sprints.</li>' +
        '<li>Si hay más de 10.000 tareas, parte la búsqueda por fechas. Juntamos los ficheros y quitamos repetidas.</li></ol></aside></div>';
    }
    var inf = App.informe, det = App.det;
    var disp = {};
    var pre = Motor.calcular(App.tareas, det, cfgMotor(App.borrador));
    Object.keys(C.medidas).forEach(function (id) {
      var eq = pre.equipos.filter(function (e) { return e.medidas[id] && e.medidas[id].disponible; })[0];
      disp[id] = eq ? true : (pre.equipos[0] && pre.equipos[0].medidas[id] ? pre.equipos[0].medidas[id].motivo : '');
    });
    var si = C.ordenMedidas.filter(function (id) { return disp[id] === true; }), no = C.ordenMedidas.filter(function (id) { return disp[id] !== true; });
    var op = opcion(App.borrador.campoEquipo);
    var avisos = inf.avisos.concat(det.avisos);
    var origen = { ficheros: 'ficheros elegidos', carpeta: 'carpeta', datosjs: 'carpeta (datos.js)', ejemplo: 'datos de ejemplo' }[App.origen] || '';
    return cabecera('Paso 1 de 8 · Tus datos', 'Esto es lo que traen tus datos', 'Lo que hemos encontrado (' + origen + ') y lo que se podrá medir con ello.', '<button class="btn btn-sec btn-peq" data-accion="cargar-otros">Cargar otros datos</button>') +
      '<div class="tarjeta datos-res">' +
      datoPeriodo(det.fechaMin, new Date(Math.min(det.fechaRef, det.fechaMax))) +
      dato(inf.tareas.toLocaleString('es-ES'), 'tareas (sin épicas ni subtareas)') +
      dato(inf.ficheros.length + (inf.duplicadas ? ' · ' + inf.duplicadas.toLocaleString('es-ES') + ' repetidas' : ''), inf.ficheros.length === 1 ? 'fichero' : 'ficheros (se queda la versión más reciente)') +
      dato(op && op.id !== 'todos' ? op.valores.length : 1, op && op.id !== 'todos' ? 'equipos, según ' + ({ equipo: 'el campo Equipo', componentes: 'el componente', proyecto: 'el proyecto', etiquetas: 'la etiqueta' }[op.id] || op.nombre.toLowerCase()) : 'equipo: todo junto') +
      '</div>' +
      (avisos.length ? '<div class="avisos">' + avisos.map(function (a) { return '<div class="aviso">' + IC.aviso + '<span>' + esc(a.texto) + '</span></div>'; }).join('') + '</div>' : '') +
      '<div class="rejilla-2"><div class="tarjeta"><h3>Se podrá medir <span class="cuenta-t">' + si.length + '</span></h3><ul class="lista-check" style="margin-top:12px">' +
      si.map(function (id) { return '<li class="ok">' + IC.bien + '<span><b>' + esc(C.medidas[id].nombre) + '</b><span class="muted"> · ' + esc(C.medidas[id].pregunta) + '</span></span></li>'; }).join('') + '</ul></div>' +
      '<div class="tarjeta"><h3>No se podrá medir con estos datos <span class="cuenta-t">' + no.length + '</span></h3><ul class="lista-check" style="margin-top:12px">' +
      (no.length ? no.map(function (id) { return '<li class="no">' + IC.no + '<span><b>' + esc(C.medidas[id].nombre) + '</b><span class="muted"> · ' + esc(disp[id] || '') + '</span></span></li>'; }).join('') : '<li>Todo lo del catálogo se puede medir.</li>') + '</ul></div></div>';
  }
  // Periodo de los datos: fechas numéricas, una encima de otra, para que nunca se partan
  function fechaNum(d) { var z = function (n) { return (n < 10 ? '0' : '') + n; }; return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function datoPeriodo(desde, hasta) {
    return '<div class="dato dato-periodo"><b><span>' + fechaNum(desde) + '</span><span>' + fechaNum(hasta) + '</span></b><span>periodo: primer y último día</span></div>';
  }
  function dato(v, t) { return '<div class="dato"><b>' + esc(v) + '</b><span>' + esc(t) + '</span></div>'; }

  function paso2() {
    var b = App.borrador, det = App.det;
    var ops = det.opcionesEquipo.filter(function (o) { return o.valida; });
    var html = cabecera('Paso 2 de 8 · Equipos', 'Tus equipos', 'Cada equipo se mide consigo mismo. Para eso necesitamos saber de qué equipo es cada tarea y, para comparar con las mismas reglas, cómo es cada equipo.');
    html += '<div class="tarjeta"><h2>¿Dónde pone en Jira de qué equipo es cada tarea?</h2><p class="muted small">Te proponemos el campo que mejor reparte las tareas. Debajo de cada opción ves los equipos que saldrían.</p><div class="opciones" style="margin-top:14px">' +
      ops.map(function (o) {
        var marcada = b.campoEquipo === o.id;
        return opcionHtml({ marcada: marcada, input: '<input type="radio" name="campo-equipo" value="' + o.id + '" data-cambio="campo-equipo"' + (marcada ? ' checked' : '') + '>',
          cuerpo: '<b>' + esc(o.nombre) + '</b><span class="q">' + (o.id === 'todos' ? 'Útil si solo hay un equipo o aún no lo tenéis en Jira.' : o.valores.length + ' equipos · lo tiene relleno el ' + Math.round(o.cobertura * 100) + '% de las tareas') + '</span>' +
            (o.id === det.equipoRecomendado ? '<span class="reco">Recomendado</span>' : '') +
            (o.id !== 'todos' ? '<span class="valores">' + o.valores.slice(0, 6).map(function (v) { return '<span>' + esc(v.valor) + '</span>'; }).join('') + (o.valores.length > 6 ? '<span>…</span>' : '') + '</span>' : '') });
      }).join('') + '</div>';
    var op = opcion(b.campoEquipo);
    if (op && op.id !== 'todos') {
      html += '<h3 style="margin-top:22px">¿Qué equipos quieres ver en el tablero?</h3><div class="opciones" style="margin-top:10px">' + op.valores.map(function (v) {
        var dentro = b.equipos.indexOf(v.valor) >= 0;
        return opcionHtml({ marcada: dentro, input: '<input type="checkbox" data-cambio="equipo-incluir" data-e="' + esc(v.valor) + '"' + (dentro ? ' checked' : '') + '>',
          cuerpo: '<b>' + esc(v.valor) + '</b><span class="q">' + v.n.toLocaleString('es-ES') + ' tareas</span>' });
      }).join('') + '</div>';
    }
    html += '</div>';
    if (op && op.id !== 'todos' && b.equipos.length) {
      var orden = op.valores.map(function (v) { return v.valor; });
      html += tablaEquiposInfo(b, b.equipos.slice().sort(function (x, y) { return orden.indexOf(x) - orden.indexOf(y); }));
    }
    return html;
  }


  // Tipo, proveedor, área y FTE de cada equipo, en el arranque
  var ORIGENES_FTE = [['contrato', 'Contrato'], ['declarado', 'Declarado'], ['estimado', 'Estimado']];
  function tablaEquiposInfo(c, nombres) {
    var info = c.equiposInfo || {}, fte = c.fte || {}, orig = c.fteOrigen || {}, op = opcion(c.campoEquipo);
    var tareas = function (e) { var v = op ? op.valores.filter(function (x) { return x.valor === e; })[0] : null; return v ? v.n.toLocaleString('es-ES') : ''; };
    return '<div class="tarjeta"><h2>¿Cómo es cada equipo?</h2><p class="muted small">Si es interno o de un proveedor, a qué área pertenece y cuántas personas a jornada completa (FTE) tiene. Sirve para comparar con las mismas reglas. Si aún no lo sabes, déjalo en blanco y complétalo después en Ajustes.</p>' +
      '<div class="tabla-wrap eq-tabla" style="margin-top:12px"><table><thead><tr><th>Equipo</th><th class="num">Tareas</th><th>Tipo</th><th>Proveedor</th><th>Área</th><th>FTE</th><th>De dónde sale el FTE</th></tr></thead><tbody>' +
      nombres.map(function (e) {
        var i = info[e] || {}, prov = i.tipo === 'proveedor', o = orig[e] || 'declarado';
        return '<tr><td><b class="medio">' + esc(e) + '</b></td><td class="num">' + tareas(e) + '</td>' +
          '<td><select data-cambio="eq-info" data-campo="tipo" data-e="' + esc(e) + '" aria-label="Tipo de ' + esc(e) + '"><option value="interno"' + (prov ? '' : ' selected') + '>Interno</option><option value="proveedor"' + (prov ? ' selected' : '') + '>Proveedor</option></select></td>' +
          '<td><input type="text" data-cambio="eq-info" data-campo="proveedor" data-e="' + esc(e) + '" value="' + esc(i.proveedor || '') + '" placeholder="Nombre"' + (prov ? '' : ' disabled') + ' aria-label="Proveedor de ' + esc(e) + '"></td>' +
          '<td><input type="text" data-cambio="eq-info" data-campo="area" data-e="' + esc(e) + '" value="' + esc(i.area || '') + '" placeholder="Área" aria-label="Área de ' + esc(e) + '"></td>' +
          '<td><input type="number" min="0" step="0.5" inputmode="decimal" data-cambio="fte" data-e="' + esc(e) + '" value="' + (fte[e] != null ? fte[e] : '') + '" aria-label="FTE de ' + esc(e) + '"></td>' +
          '<td><select data-cambio="fte-origen" data-e="' + esc(e) + '" aria-label="De dónde sale el FTE de ' + esc(e) + '">' + ORIGENES_FTE.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === o ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  // Paso 3: cada estado de origen con su estado común (los nueve de catalogo/estados.json)
  var ORDEN_COMUN = ['nuevo', 'pendiente', 'en_curso', 'bloqueado', 'en_revision', 'en_pruebas', 'en_espera', 'terminado', 'descartado'];
  var NOMBRE_ETAPA = { pendiente: 'pendiente', curso: 'en curso', espera: 'en espera', hecho: 'hecho' };
  function porRevisar(b) {
    return App.det.estados.filter(function (e) { return e.propuestaPor !== 'nombre' && !(b.estadosCambiados || {})[e.nombre]; });
  }
  function pasoEstados() {
    var b = App.borrador, det = App.det, E = C.estados.estados, revisar = porRevisar(b);
    var html = cabecera('Paso 3 de 8 · Estados', 'Qué significa cada estado', 'Cada estado de Jira se traduce a un estado común. Así todos los equipos se miden con las mismas reglas. Te proponemos uno para cada estado: revisa los marcados.',
      '<span class="contador"><b>' + det.estados.length + '</b> estados' + (revisar.length ? ' · <b>' + revisar.length + '</b> por revisar' : '') + '</span>');
    html += '<div class="rejilla-estados"><div class="tabla-wrap"><table class="tabla-estados"><thead><tr><th>Estado en Jira</th><th>Categoría en Jira</th><th class="num">Tareas ahora</th><th class="num">Tiempo medio</th><th>Estado común</th></tr></thead><tbody>' +
      det.estados.map(function (e) {
        var sel = b.mapeoEstados[e.nombre] || e.estado, rev = revisar.indexOf(e) >= 0;
        var porque = e.propuestaPor === 'categoria' ? 'No se reconoce por su nombre: se propone por su categoría en Jira.' : 'No se reconoce por su nombre ni por su categoría: se propone por defecto.';
        return '<tr' + (rev ? ' class="revisar"' : '') + '><td><b class="medio">' + esc(e.nombre) + '</b>' + (rev ? '<span class="marca-revisar" data-tip="' + esc(porque) + '">Revisar</span>' : '') + '</td>' +
          '<td>' + esc(e.categoria || '') + '</td><td class="num">' + e.actuales.toLocaleString('es-ES') + '</td><td class="num">' + (e.horasMedias != null ? F(e.horasMedias / 24, 'dias') : '') + '</td>' +
          '<td><select data-cambio="estado-comun" data-estado="' + esc(e.nombre) + '" aria-label="Estado común de ' + esc(e.nombre) + '">' +
          ORDEN_COMUN.map(function (k) { return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + esc(E[k].nombre) + '</option>'; }).join('') + '</select>' +
          '<span class="q-etapa">Cuenta como ' + NOMBRE_ETAPA[E[sel].etapa] + (sel === 'descartado' ? ', no es entrega' : '') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
    html += '<aside class="tarjeta leyenda-estados"><h3>Los estados comunes</h3><dl>' + ORDEN_COMUN.map(function (k) {
      return '<dt>' + esc(E[k].nombre) + ' <span class="muted small">· cuenta como ' + NOMBRE_ETAPA[E[k].etapa] + '</span></dt><dd>' + esc(E[k].descripcion) + '</dd>';
    }).join('') + '</dl></aside></div>';
    return html;
  }

  // Paso 4: calidad de los datos por equipo, con la configuración elegida
  function pasoCalidad() {
    if (!App.pre) calcularPre();
    var inf = App.informe, det = App.det, eqs = App.pre.equipos;
    var generales = inf.avisos.concat(det.avisos);
    var conAvisos = eqs.filter(function (e) { return e.calidad.avisos.length; }).length;
    var faltan = Object.keys(CAMPOS).filter(function (k) { return inf.campos[k] !== true; });
    var html = cabecera('Paso 4 de 8 · Calidad', '¿Nos podemos fiar de los datos?', 'Señales de que Jira no refleja bien lo que pasa. Revísalas con cada equipo antes de sacar conclusiones. Todo esto va al documento de definiciones.');
    html += '<div class="tarjeta datos-res">' + dato(eqs.length - conAvisos, eqs.length - conAvisos === 1 ? 'equipo sin avisos' : 'equipos sin avisos') + dato(conAvisos, conAvisos === 1 ? 'equipo con avisos' : 'equipos con avisos') +
      dato(generales.length, generales.length === 1 ? 'aviso del export' : 'avisos del export') + dato(faltan.length, faltan.length === 1 ? 'campo que falta' : 'campos que faltan') + '</div>';
    // Lo que se repite en todos los equipos se cuenta una sola vez
    var comunes = eqs.length > 1 ? eqs[0].calidad.avisos.filter(function (a) { return eqs.every(function (eq) { return eq.calidad.avisos.indexOf(a) >= 0; }); }) : [];
    var lista = function (a) { return '<ul class="cal-lista">' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; };
    if (comunes.length) html += '<div class="tarjeta"><h3>En todos los equipos<span class="cal-est cal-aviso">' + comunes.length + (comunes.length === 1 ? ' aviso' : ' avisos') + '</span></h3>' + lista(comunes) + '</div>';
    html += '<div class="rejilla-equipos">' + eqs.map(function (eq) {
      var a = eq.calidad.avisos.filter(function (x) { return comunes.indexOf(x) < 0; });
      return '<div class="tarjeta"><h3>' + esc(eq.nombre) + '<span class="cal-est ' + (a.length ? 'cal-aviso' : 'cal-bien') + '">' + (a.length ? a.length + (a.length === 1 ? ' aviso propio' : ' avisos propios') : (comunes.length ? 'Nada más' : 'Sin avisos')) + '</span></h3>' +
        (a.length ? lista(a) : '<p class="muted small" style="margin-top:8px">' + eq.n.toLocaleString('es-ES') + ' tareas.' + (comunes.length ? ' Solo lo que tienen todos.' : ' Sin señales de que se registre mal.') + '</p>') + '</div>';
    }).join('') + '</div>';
    if (generales.length) html += '<div class="avisos">' + generales.map(function (a) { return '<div class="aviso">' + IC.aviso + '<span>' + esc(a.texto) + '</span></div>'; }).join('') + '</div>';
    if (faltan.length) html += '<div class="tarjeta"><h3>Campos que faltan en el export</h3><ul class="lista-check" style="margin-top:10px">' + faltan.map(function (k) {
      return '<li class="no">' + IC.no + '<span>' + esc(CAMPOS[k]) + ' <span class="muted small">(' + (inf.campos[k] === 'vacio' ? 'columna vacía' : 'no está') + ')</span></span></li>';
    }).join('') + '</ul></div>';
    return html;
  }

  // Documento de definiciones: lo que firman el cliente y Capgemini (markdown y Word)
  function tarjetaDefiniciones(c, nivel) {
    return '<div class="tarjeta"><h' + nivel + '>Documento de definiciones</h' + nivel + '><p class="muted small">Recoge de dónde salen los datos, los equipos, qué significa cada estado, cómo se calcula cada medida y la calidad de los datos. Es lo que firman el cliente y Capgemini.</p>' +
      '<label class="campo-linea"><span>Nombre del cliente</span><input type="text" data-cambio="nombre-cliente" value="' + esc(c.nombre || '') + '" placeholder="Por ejemplo, Banco Ejemplo"></label>' +
      '<p class="botones-fila"><button class="btn btn-sec btn-peq" data-accion="definiciones" data-f="docx">Descargar en Word</button><button class="btn btn-sec btn-peq" data-accion="definiciones" data-f="md">Descargar en markdown</button></p></div>';
  }
  function slug(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function documentoDefiniciones() {
    var c = App.onboarding ? App.borrador : App.cfg;
    if (App.onboarding && !App.pre) calcularPre();
    var modelo = App.onboarding ? App.pre : App.modelo;
    return Nucleo.definiciones(App.lectura, clienteDe(c, modelo), { config: cfgMotor(c), det: App.det, modelo: modelo, generado: new Date() });
  }
  function generarDefiniciones(formato) {
    var doc;
    try { doc = documentoDefiniciones(); } catch (e) { if (window.console) console.error(e); aviso('No se pudo generar el documento.'); return; }
    var c = App.onboarding ? App.borrador : App.cfg;
    var nombre = 'definiciones-' + (slug(c.nombre) || 'cliente') + '-' + new Date().toISOString().slice(0, 10) + (formato === 'docx' ? '.docx' : '.md');
    var datos = formato === 'docx' ? Nucleo.aDocx(doc, new Date()) : Nucleo.aMarkdown(doc);
    var tipo = formato === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/markdown;charset=utf-8';
    escribirEnCarpeta('configuracion', nombre, datos).then(function (ok) { if (ok) aviso('Documento guardado en la carpeta configuracion.'); else descargar(nombre, datos, tipo); });
  }

  function paso3() {
    if (!App.pre) calcularPre();
    var b = App.borrador;
    if (!b.objetivos) b.objetivos = objetivosRecomendados();
    var señ = señalesPorObjetivo();
    var html = cabecera('Paso 5 de 8 · Objetivos', '¿Qué queréis conseguir?', 'Elige hasta tres objetivos. Cada uno trae sus medidas y sus casos. Marcamos los que ya muestran señales en tus datos.', '<span class="contador"><b>' + b.objetivos.length + '</b> de 3</span>');
    html += '<div class="opciones">' + C.objetivos.map(function (o) {
      var marcada = o.fijo || b.objetivos.indexOf(o.id) >= 0;
      var s = señ[o.id];
      return opcionHtml({ marcada: marcada, inactiva: o.fijo, icono: ICO[o.id], input: '<input type="checkbox" data-cambio="objetivo" data-o="' + o.id + '"' + (marcada ? ' checked' : '') + (o.fijo ? ' disabled' : '') + '>',
        cuerpo: '<b>' + esc(o.titulo) + '</b><span class="q">' + esc(o.frase) + '</span>' +
          (o.fijo ? '<span class="reco">Siempre incluido</span>' : (s.puntos ? '<span class="reco senal">Hay señales: ' + esc(s.ejemplos.join('; ')) + '</span>' : '')) });
    }).join('');
    return html + '</div>';
  }

  function paso4() {
    var b = App.borrador;
    var clave = b.objetivos.slice().sort().join(',');
    if (!b.medidas || b._objetivosMedidas !== clave) { b.medidas = medidasRecomendadas(b.objetivos); b._objetivosMedidas = clave; }
    var reco = medidasRecomendadas(b.objetivos);
    var html = cabecera('Paso 6 de 8 · Medidas', '¿Qué queréis medir?', 'Ya están marcadas las medidas que recomendamos para tus objetivos. Las seis primeras van al resumen del equipo.', '<span class="contador"><b>' + b.medidas.length + '</b> marcadas</span>');
    function bloque(titulo, ids) {
      if (!ids.length) return '';
      return '<p class="grupo-titulo">' + titulo + '</p><div class="opciones">' + ids.map(function (id) {
        var def = C.medidas[id], disp = disponibleEnAlguno(id), marcada = disp && b.medidas.indexOf(id) >= 0, pos = b.medidas.indexOf(id);
        var motivo = '';
        if (!disp) { var m = App.pre.equipos[0] && App.pre.equipos[0].medidas[id]; motivo = m ? m.motivo : ''; }
        return opcionHtml({ marcada: marcada, inactiva: !disp, input: '<input type="checkbox" data-cambio="medida-sel" data-m="' + id + '"' + (marcada ? ' checked' : '') + (disp ? '' : ' disabled') + '>',
          cuerpo: '<b>' + esc(def.nombre) + '</b><span class="q">' + esc(def.pregunta) + '</span>' +
            '<span class="q nota">' + esc(disp ? def.como : motivo) + '</span>' + (marcada && pos < 6 ? '<span class="reco">En el resumen</span>' : '') });
      }).join('') + '</div>';
    }
    var otras = C.ordenMedidas.filter(function (id) { return reco.indexOf(id) < 0 && disponibleEnAlguno(id); });
    var nd = C.ordenMedidas.filter(function (id) { return !disponibleEnAlguno(id); });
    return html + bloque('Recomendadas para tus objetivos', reco) + bloque('Otras medidas', otras) + bloque('No disponibles con tus datos', nd);
  }

  function paso5() {
    var b = App.borrador;
    var html = cabecera('Paso 7 de 8 · Vistas', '¿Cómo lo queréis ver?', 'Cada perfil tiene su vista. El responsable de equipo siempre la tiene: es quien más la usa.');
    html += '<div class="opciones">' + C.perfiles.map(function (p) {
      var marcada = p.fijo || b.perfiles.indexOf(p.id) >= 0;
      return opcionHtml({ marcada: marcada, inactiva: p.fijo, icono: ICO[p.id], input: '<input type="checkbox" data-cambio="perfil" data-p="' + p.id + '"' + (marcada ? ' checked' : '') + (p.fijo ? ' disabled' : '') + '>',
        cuerpo: '<b>' + esc(p.nombre) + '</b><span class="q"><span class="medio">Vista: ' + esc(p.vista) + '.</span> ' + esc(p.descripcion) + '</span>' });
    }).join('') + '</div>';
    var eq = App.pre.equipos[0];
    Object.keys(C.graficos).forEach(function (k) {
      var g = C.graficos[k];
      html += '<div class="tarjeta"><h2>' + esc(g.pregunta) + '</h2><div class="opciones" style="margin:14px 0">' + g.opciones.map(function (o, i) {
        var marcada = b.graficos[k] === o.id;
        return opcionHtml({ marcada: marcada, input: '<input type="radio" name="g-' + k + '" data-cambio="grafico" data-g="' + k + '" value="' + o.id + '"' + (marcada ? ' checked' : '') + '>',
          cuerpo: '<b>' + esc(o.nombre) + '</b><span class="q">' + esc(o.ayuda) + '</span>' + (i === 0 ? '<span class="reco">Recomendado</span>' : '') });
      }).join('') + '</div>' + (eq ? '<p class="small muted">Vista previa con los datos de ' + esc(eq.nombre) + ':</p>' + graficoPorClave(k, eq, b.graficos) : '') + '</div>';
    });
    return html;
  }

  function paso6() {
    var b = App.borrador;
    calcularPre();
    var eqs = App.pre.equipos;
    var objs = C.objetivos.filter(function (o) { return o.fijo || b.objetivos.indexOf(o.id) >= 0; });
    var casosObj = {};
    objs.forEach(function (o) { o.casos.forEach(function (c) { casosObj[c] = 1; }); });
    var html = cabecera('Paso 8 de 8 · Listo', 'Tu tablero está listo', 'Esto es lo que verás y lo primero que hemos detectado. Puedes cambiar cualquier cosa después en Ajustes.');
    html += '<div class="tarjeta datos-res">' + dato(eqs.length, eqs.length === 1 ? 'equipo' : 'equipos') + dato(b.medidas.length, 'medidas') +
      dato(C.perfiles.filter(function (p) { return p.fijo || b.perfiles.indexOf(p.id) >= 0; }).length, 'vistas') + dato(objs.length, 'objetivos') + '</div>';
    html += '<div class="tarjeta"><h2>Primer diagnóstico</h2><div class="diagnostico">' +
      eqs.map(function (eq) {
        var cs = eq.casos.filter(function (c) { return casosObj[c.id]; });
        var crit = cs.filter(function (c) { return c.gravedad === 'critico'; }).length, at = cs.length - crit;
        var fuera = eq.casos.length - cs.length;
        var t = titular(eq, eq.casos.filter(function (c) { return casosObj[c.id]; }));
        return '<div class="diag-fila"><div class="diag-eq"><b>' + esc(eq.nombre) + '</b><span class="cuentas">' + cuentaEstado(cs) + '</span></div>' +
          '<p class="titular">' + t + (fuera ? ' <span class="small muted">Y ' + fuera + ' caso' + (fuera > 1 ? 's' : '') + ' fuera de tus objetivos.</span>' : '') + '</p></div>';
      }).join('') + '</div></div>';
    html += tarjetaDefiniciones(b, 2);
    html += '<div class="tarjeta"><h2>Guarda la configuración</h2><p class="muted">Se guarda en este navegador' + (App.carpeta ? ' y en la carpeta configuracion' : '') + '. Para usarla en otro ordenador, descárgala y ponla en la carpeta configuracion de Easy Performance.</p><button class="btn btn-sec btn-peq" data-accion="descargar-config">Descargar cliente.json</button></div>';
    return html;
  }

  // ---------- vistas principales ----------
  function vistaPrincipal() {
    var cab = App.editando ? '<div class="banda-edicion no-imprimir"><span>Modo edición: haz clic en un título o una explicación para cambiarlo. Se guarda al salir del texto.</span><button class="btn btn-peq" data-accion="editar-textos">Terminar</button></div>' : '';
    var v = App.vista;
    if (v === 'equipo') return cab + vistaEquipo();
    if (v === 'todos') return cab + vistaTodos();
    if (v === 'pmo') return cab + vistaPmo();
    if (v === 'negocio') return cab + vistaNegocio();
    if (v === 'grupos') return cab + vistaGrupos();
    if (v === 'iniciativas') return cab + vistaIniciativas();
    if (v === 'agentes') return cab + vistaAgentes();
    if (v === 'chequeo') return cab + vistaChequeo();
    if (v === 'config') return cab + vistaConfig();
    if (v === 'medida') return cab + vistaMedida();
    return cab + vistaEquipo();
  }
  function selectorEquipos() {
    if (App.modelo.equipos.length < 2) return '';
    var obj = casosDeObjetivos();
    return '<div class="equipos-sel" role="group" aria-label="Equipo">' + App.modelo.equipos.map(function (e) {
      var cs = e.casos.filter(function (c) { return obj[c.id] && casoVisible(e.nombre, c.id); });
      var crit = cs.some(function (c) { return c.gravedad === 'critico'; });
      var punto = cs.length ? '<span class="punto' + (crit ? '' : ' atencion') + '" title="' + (crit ? 'Tiene casos críticos' : 'Tiene casos de atención') + '"></span>' : '';
      return '<button class="chip" data-accion="equipo" data-e="' + esc(e.nombre) + '" aria-pressed="' + (App.equipo === e.nombre) + '">' + punto + esc(e.nombre) + '</button>';
    }).join('') + '</div>';
  }
  function equipoActual() { return equipoPorNombre(App.equipo) || App.modelo.equipos[0]; }
  // Durante el onboarding manda el borrador; después, la configuración guardada
  function cfgActiva() { return (App.onboarding && App.borrador) ? App.borrador : (App.cfg || {}); }
  function medidasCfg() { return (cfgActiva().medidas || []).filter(function (id) { return C.medidas[id]; }); }
  function objetivosCfg() { return C.objetivos.filter(function (o) { return o.fijo || (cfgActiva().objetivos || []).indexOf(o.id) >= 0; }); }
  function casoVisible(eq, id) { return !(App.cfg && App.cfg.noAplica && App.cfg.noAplica[eq + '|' + id]); }
  function casosDeObjetivos() { var m = {}; objetivosCfg().forEach(function (o) { o.casos.forEach(function (c) { m[c] = 1; }); }); return m; }
  function casosAbiertos(eq) { var obj = casosDeObjetivos(); return eq.casos.filter(function (c) { return obj[c.id] && casoVisible(eq.nombre, c.id); }); }
  function seccionCab(n, clave, texto) {
    return '<div class="seccion-cab"><span class="n">' + n + '</span><div>' + editable('h2', clave) + (texto ? '<p>' + texto + '</p>' : '') + '</div></div>';
  }

  // Titular del informe: una frase con lo más importante del equipo, con la cifra clave destacada
  function titular(eq, casos) {
    casos = casos || casosAbiertos(eq);
    var n = esc(eq.nombre), f = function (v, fm) { return esc(F(v, fm)); }, em = function (t) { return '<em>' + t + '</em>'; };
    var c = casos[0];
    if (!c) {
      var fuera = medidasCfg().filter(function (id) { var m = eq.medidas[id]; return m && m.disponible && (m.estado === 'critico' || m.estado === 'atencion'); });
      if (fuera.length) {
        var noms = fuera.slice(0, 2).map(function (id) { return esc(C.medidas[id].nombre.toLowerCase()); });
        return n + ' no tiene casos abiertos, pero ' + (fuera.length === 1 ? 'hay una medida fuera de lo habitual: ' : 'hay ' + fuera.length + ' medidas fuera de lo habitual, como ') + em(noms.join(' y ')) + '.';
      }
      return n + ' va bien: ' + em('todo está dentro de su rango habitual') + '.';
    }
    var d = c.datos || {};
    switch (c.id) {
      case 'atascado': return n + ' tiene ' + em(d.n + (d.n === 1 ? ' tarea bloqueada' : ' tareas bloqueadas')) + ': la más antigua lleva ' + f(d.maxEdad, 'dias') + ' en curso.';
      case 'demasiado_a_la_vez': return n + ' hace demasiado a la vez: ' + em(f(d.wip, 'num') + ' tareas en curso') + ' frente a ' + f(d.wipRef, 'num') + ' habituales.';
      case 'sprint_no_cumple': return n + ' arrastra ' + em('el ' + f(d.media, 'pct') + ' de cada sprint') + ' al siguiente.';
      case 'pendiente_crece': return 'El pendiente de ' + n + ' crece: ' + em('de ' + d.desde + ' a ' + d.hasta + ' tareas') + ' en 8 semanas.';
      case 'mucha_espera': return 'En ' + n + ', ' + em('el ' + f(d.parte, 'pct') + ' del tiempo es espera') + (d.estado ? ', sobre todo en «' + esc(d.estado) + '».' : '.');
      case 'retrabajo': return 'En ' + n + ', ' + em('el ' + f(d.parte, 'pct') + ' de lo terminado vuelve atrás') + (d.habitual != null ? ' (lo habitual, ' + f(d.habitual, 'pct') + ').' : '.');
      case 'errores_capacidad': return 'En ' + n + ', ' + em('el ' + f(d.parte, 'pct') + ' de lo terminado son errores') + (d.habitual != null ? ' (lo habitual, ' + f(d.habitual, 'pct') + ').' : '.');
      case 'todo_al_final': return n + ' cierra ' + em('el ' + f(d.parte, 'pct') + ' de las tareas') + ' en los dos últimos días del sprint.';
      case 'entregas_irregulares': return 'Las entregas de ' + n + ' van ' + em('de ' + d.min + ' a ' + d.max + ' tareas') + ' por semana.';
      case 'estimaciones_no_predicen': return 'En ' + n + ', los puntos ' + em('no predicen cuánto tarda') + ' una tarea.';
      case 'todo_urgente': return 'En ' + n + ', ' + em('el ' + f(d.parte, 'pct') + ' de lo que entra es urgente') + '.';
      case 'urgente_no_rapido': return 'En ' + n + ', lo urgente ' + em('tarda ' + f(d.urgente, 'dias')) + ', igual o más que el resto (' + f(d.resto, 'dias') + ').';
      case 'datos_poco_fiables': return 'Los datos de ' + n + ' ' + em('no reflejan bien lo que pasa') + ': revisa Jira antes de sacar conclusiones.';
    }
    return n + ': ' + em(esc(C.casos[c.id].titulo.toLowerCase())) + '.';
  }
  // Las tres cifras de la portada: primero las que peor están
  function cifrasPortada(eq) {
    var orden = { critico: 0, atencion: 1, bien: 2 };
    var ids = medidasCfg().filter(function (id) { var m = eq.medidas[id]; return m && m.disponible && m.valor != null; });
    ids = ids.map(function (id, i) { return { id: id, i: i, o: orden[eq.medidas[id].estado] != null ? orden[eq.medidas[id].estado] : 3 }; })
      .sort(function (a, b) { return a.o - b.o || a.i - b.i; }).slice(0, 3).map(function (x) { return x.id; });
    return ids;
  }
  function portada(eq) {
    var casos = casosAbiertos(eq), c = casos[0];
    var crit = casos.filter(function (x) { return x.gravedad === 'critico'; }).length;
    var accion = c ? '<div class="accion"><span class="etq">Esta semana</span><span>' + esc(C.casos[c.id].plan[0].paso) + '.</span></div>'
      : '<div class="accion bien-todo"><span class="etq">Esta semana</span><span>Mantener el ritmo. Revisad el tablero el lunes que viene.</span></div>';
    var cifras = cifrasPortada(eq).map(function (id) {
      var m = eq.medidas[id], def = C.medidas[id], comp = comparar(id, m);
      var fl = comp ? (comp.sentido === 'sube' ? '↑ ' : (comp.sentido === 'baja' ? '↓ ' : '')) : '';
      return '<button class="cifra" data-accion="medida" data-m="' + id + '"><span class="etq">' + estado(m.estado, m.estadoTexto) + esc(def.nombre) + '</span>' +
        '<span class="v">' + cifraHtml(id, m.valor) + '</span><span class="u">' + esc(UNIDAD[id] ? UNIDAD[id][1] : def.unidad) + '</span>' +
        (comp ? '<span class="delta ' + comp.clase + '">' + fl + 'Lo habitual: ' + esc(comp.habitual) + '</span>' : '') + '</button>';
    }).join('');
    return '<section class="portada"><div class="antetitulo">' + editable('span', 'equipo.titulo') + ' · ' + esc(semanaTexto(App.modelo.semanaFin)) + '</div>' +
      '<h1>' + titular(eq) + '</h1>' + accion +
      (cifras ? '<div class="cifras">' + cifras + '</div>' : '') +
      '<div class="portada-pie">' + editable('span', 'equipo.intro') + '<span class="casos-n">' + (casos.length ? '<b>' + casos.length + '</b> caso' + (casos.length > 1 ? 's' : '') + ' abierto' + (casos.length > 1 ? 's' : '') + (crit ? ' · <b>' + crit + '</b> crítico' + (crit > 1 ? 's' : '') : '') : 'Sin casos abiertos') + '</span></div></section>';
  }

  function tarjetaMedida(eq, id) {
    var def = C.medidas[id], m = eq.medidas[id];
    if (!m) return '';
    if (!m.disponible) return '<div class="tarjeta kpi kpi-nd"><span class="kpi-nombre">' + esc(def.nombre) + '</span><p class="small muted" style="margin-top:8px">' + esc(m.motivo) + '</p></div>';
    var marca = m.estado === 'critico' || m.estado === 'atencion' ? ' ' + m.estado : '';
    return '<button class="tarjeta kpi' + marca + '" data-accion="medida" data-m="' + id + '" title="' + esc(m.estadoTexto || '') + '"><span class="kpi-cab"><span class="kpi-nombre">' + esc(def.nombre) + '</span>' + (marca ? estado(m.estado, m.estadoTexto) : '') + '</span>' +
      '<span class="kpi-valor">' + cifraHtml(id, m.valor) + '</span><span class="kpi-unidad">' + esc(UNIDAD[id] ? UNIDAD[id][1] : def.unidad) + '</span>' +
      '<span class="kpi-pie">' + (deltaHtml(id, m) || '<span></span>') + (m.serie ? G.chispa(m.serie) : '') + '</span></button>';
  }

  // ---------- pantallas: cada vista se reparte en pantallas que caben sin scroll ----------
  // lista: [[id, nombre, función que devuelve el html]]. Al imprimir salen todas seguidas.
  function pantallas(clave, lista, cabeza) {
    lista = lista.filter(Boolean);
    cabeza = cabeza || '';
    if (!lista.length) return cabeza;
    if (App.imprimiendo) return cabeza + lista.map(function (p, k) { return '<section class="seccion seccion-imp"><div class="seccion-cab"><span class="n">0' + (k + 1) + '</span><div><h2>' + esc(p[1]) + '</h2></div></div>' + p[2]() + '</section>'; }).join('');
    var i = Math.max(0, Math.min(App.pant[clave] || 0, lista.length - 1));
    App.pant[clave] = i; App.pantActual = { clave: clave, n: lista.length };
    var nav = '<nav class="subnav" aria-label="Pantallas">' + lista.map(function (p, k) {
      return '<button class="subnav-b" data-accion="pantalla" data-c="' + clave + '" data-i="' + k + '" aria-current="' + (k === i) + '"><span class="n">0' + (k + 1) + '</span><span class="t">' + esc(p[1]) + '</span></button>';
    }).join('') + '<span class="flechas"><button class="flecha" data-accion="pantalla-mover" data-d="-1" aria-label="Pantalla anterior"' + (i === 0 ? ' disabled' : '') + '>' + FLECHA.izq + '</button>' +
      '<button class="flecha" data-accion="pantalla-mover" data-d="1" aria-label="Pantalla siguiente"' + (i === lista.length - 1 ? ' disabled' : '') + '>' + FLECHA.dcha + '</button></span></nav>';
    return '<div class="vista-pantallas"><div class="vista-cab">' + cabeza + nav + '</div><div class="pantalla" data-pantalla="' + lista[i][0] + '">' + lista[i][2]() + '</div></div>';
  }
  var FLECHA = {
    izq: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dcha: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function moverPantalla(d) {
    var pa = App.pantActual; if (!pa) return false;
    var i = Math.max(0, Math.min((App.pant[pa.clave] || 0) + d, pa.n - 1));
    if (i === (App.pant[pa.clave] || 0)) return false;
    App.pant[pa.clave] = i; render(); return true;
  }
  // Cabecera de una pantalla: título editable y una línea de lectura
  function cabPantalla(clave, texto) { return '<div class="pantalla-cab">' + editable('h2', clave) + (texto ? '<p>' + texto + '</p>' : '') + '</div>'; }

  function vistaEquipo() {
    var eq = equipoActual();
    if (!eq) return '<p>No hay equipos con datos.</p>';
    var meds = medidasCfg(), resumen = meds.slice(0, 6);
    var graf = meds.filter(function (id) { return id !== 'edad' && eq.medidas[id] && eq.medidas[id].disponible; });
    var casos = casosAbiertos(eq);
    var cabeza = selectorEquipos();
    return pantallas('equipo', [
      ['resumen', 'Resumen', function () { return portada(eq) + resumenCasos(eq, casos); }],
      ['hacer', 'Qué hacer' + (casos.length ? ' (' + casos.length + ')' : ''), function () { return cabPantalla('equipo.casos', casos.length ? 'Lo que hemos detectado, ordenado por gravedad. Elige un caso para ver su plan.' : '') + pantallaCasos(eq); }],
      eq.medidas.edad && eq.medidas.edad.disponible ? ['atascado', 'Bloqueado', function () { return cabPantalla('equipo.atascado', textoAtascado(eq)) + edades(eq); }] : null,
      ['medidas', 'Medidas', function () { return cabPantalla('equipo.medidas', 'Valor actual frente a lo habitual del propio equipo. Pulsa una medida para ver el detalle y ajustar sus límites.') + '<div class="rejilla-kpi' + (resumen.length === 4 ? ' c4' : '') + '">' + resumen.map(function (id) { return tarjetaMedida(eq, id); }).join('') + '</div>'; }],
      graf.length ? ['evolucion', 'Evolución', function () { return cabPantalla('equipo.evolucion', 'Últimas 26 semanas. En azul, las semanas que cuentan para el valor actual.') + pantallaEvolucion(eq, graf); }] : null
    ], cabeza);
  }

  // Bajo el resumen: los casos abiertos, cada uno lleva a su plan
  function resumenCasos(eq, casos) {
    if (!casos.length) return '';
    var max = 3, extra = casos.length - max;
    return '<div class="resumen-casos"><span class="rc-k">Lo que pide atención</span><div class="rc-lista">' + casos.slice(0, max).map(function (c) {
      return '<button class="rc-item ' + c.gravedad + '" data-accion="ir-caso" data-id="' + c.id + '"><span class="ci-k">' + ETQ[c.gravedad] + '</span><b>' + esc(C.casos[c.id].titulo) + '</b><span class="rc-ver">Ver el plan ' + FLECHA.dcha + '</span></button>';
    }).join('') + '</div>' + (extra > 0 ? '<span class="small muted">Y ' + extra + ' más en «Qué hacer».</span>' : '') + '</div>';
  }
  // Qué hacer: lista de casos a la izquierda y el caso elegido, con su plan, a la derecha
  function pantallaCasos(eq) {
    if (App.imprimiendo) return bloqueCasos(eq);
    var obj = casosDeObjetivos();
    var visibles = eq.casos.filter(function (c) { return obj[c.id] && casoVisible(eq.nombre, c.id); });
    var fuera = eq.casos.filter(function (c) { return !obj[c.id] && casoVisible(eq.nombre, c.id); });
    var ocultos = eq.casos.filter(function (c) { return !casoVisible(eq.nombre, c.id); });
    var todos = visibles.concat(fuera, App.verNoAplica ? ocultos : []);
    var vacio = '<div class="tarjeta vacio-bien"><span class="icono">' + IC.bien.replace('<svg', '<svg style="width:20px;height:20px;color:var(--bien)"') + '</span><div><b>No hay casos abiertos para tus objetivos.</b><p class="small muted" style="margin:2px 0 0">El equipo está dentro de su rango habitual en lo que habéis elegido mejorar.</p></div></div>';
    if (!todos.length) return vacio + (ocultos.length ? '<p class="small muted" style="margin-top:12px">' + ocultos.length + ' caso' + (ocultos.length > 1 ? 's marcados' : ' marcado') + ' como "no aplica". <button class="btn-txt" data-accion="ver-no-aplica">Ver</button></p>' : '');
    var sel = todos.filter(function (c) { return c.id === App.casoSel[eq.nombre]; })[0] || todos[0];
    var hechos = (App.cfg && App.cfg.planHecho) || {};
    var item = function (c, oculto) {
      var def = C.casos[c.id], base = eq.nombre + '|' + c.id + '|';
      var nh = def.plan.filter(function (p, i) { return hechos[base + i]; }).length;
      return '<button class="caso-item ' + c.gravedad + (oculto ? ' oculto' : '') + '" data-accion="caso" data-id="' + c.id + '" aria-current="' + (c === sel) + '">' +
        '<span class="ci-k">' + ETQ[c.gravedad] + ' · ' + esc(objetivoDeCaso(c.id)) + '</span><b>' + esc(def.titulo) + '</b><span class="ci-p">' + (nh ? nh + ' de ' + def.plan.length + ' pasos hechos' : 'Plan de ' + def.plan.length + ' pasos') + '</span></button>';
    };
    var lista = (visibles.length ? '<div class="ci-grupo">Para tus objetivos</div>' + visibles.map(function (c) { return item(c); }).join('') : '<p class="small muted">No hay casos para tus objetivos.</p>') +
      (fuera.length ? '<div class="ci-grupo">Fuera de tus objetivos</div>' + fuera.map(function (c) { return item(c); }).join('') : '') +
      (App.verNoAplica && ocultos.length ? '<div class="ci-grupo">Marcados como "no aplica"</div>' + ocultos.map(function (c) { return item(c, true); }).join('') : '') +
      (ocultos.length ? '<button class="btn-txt ci-ver" data-accion="ver-no-aplica">' + (App.verNoAplica ? 'Ocultar los marcados como "no aplica"' : 'Ver ' + ocultos.length + ' marcado' + (ocultos.length > 1 ? 's' : '') + ' como "no aplica"') + '</button>' : '');
    return '<div class="maestro-detalle"><div class="md-lista">' + lista + '</div><div class="md-detalle">' + tarjetaCaso(eq, sel, ocultos.indexOf(sel) >= 0) + '</div></div>';
  }
  // Evolución: lista de medidas a la izquierda y el gráfico elegido, grande, a la derecha
  function pantallaEvolucion(eq, graf, clave) {
    clave = clave || eq.nombre;
    if (App.imprimiendo) return '<div class="rejilla-2">' + graf.map(function (id) { return tarjetaGrafico(eq, id); }).join('') + '</div>';
    var sel = graf.indexOf(App.grafSel[clave]) >= 0 ? App.grafSel[clave] : graf[0];
    var lista = graf.map(function (id) {
      var m = eq.medidas[id], def = C.medidas[id];
      return '<button class="caso-item graf-item' + (m.estado === 'critico' || m.estado === 'atencion' ? ' ' + m.estado : '') + '" data-accion="graf" data-k="' + esc(clave) + '" data-m="' + id + '" aria-current="' + (id === sel) + '">' +
        '<span class="ci-k">' + (m.estado && m.estado !== 'neutro' ? ETQ[m.estado] || '' : 'Seguimiento') + '</span><b>' + esc(def.nombre) + '</b><span class="ci-p">' + esc(F(m.valor, def.formato)) + ' · ' + esc(def.pregunta) + '</span></button>';
    }).join('');
    return '<div class="maestro-detalle"><div class="md-lista">' + lista + '</div><div class="md-detalle">' + tarjetaGrafico(eq, sel) + '</div></div>';
  }
  function textoAtascado(eq) {
    var tot = eq.enCurso.length, fuera = eq.atascadas.length;
    if (!tot) return 'No hay tareas en curso.';
    if (eq.umbralEdad == null) return tot + ' tareas en curso.';
    return '<b>' + fuera + ' de ' + tot + '</b> tareas en curso superan lo habitual del equipo: <b>' + esc(F(eq.umbralEdad, 'dias')) + '</b>, el plazo en el que termina 8 de cada 10 tareas.';
  }
  // Barras de edad: cada tarea en curso frente a lo habitual del equipo (la raya vertical)
  function edades(eq) {
    var items = eq.enCurso.slice().sort(function (a, b) { return b.edad - a.edad; });
    if (!items.length) return '<div class="tarjeta"><p style="margin:0">No hay tareas en curso.</p></div>';
    var nMax = App.imprimiendo ? 8 : (window.innerHeight < 800 ? 5 : (window.innerHeight < 900 ? 6 : 7)), u = eq.umbralEdad, max = Math.max(items[0].edad, u || 0) * 1.08, top = items.slice(0, nMax);
    var filas = top.map(function (d) {
      var fuera = u != null && d.edad > u;
      return '<div class="edad-fila"><div class="t"><b title="' + esc(d.resumen) + '">' + esc(d.resumen) + '</b><span>' + esc(d.clave) + ' · ' + esc(d.estado) + '</span></div>' +
        '<div class="edad-pista" role="img" aria-label="' + esc(d.clave + ': ' + F(d.edad, 'dias')) + '"><span class="barra-edad' + (fuera ? ' fuera' : '') + '" style="width:' + (d.edad / max * 100).toFixed(1) + '%"></span>' +
        (u != null ? '<span class="marca-habitual" style="left:' + (u / max * 100).toFixed(1) + '%"></span>' : '') + '</div>' +
        '<div class="d' + (fuera ? ' fuera' : '') + '">' + esc(F(d.edad, 'dias')) + '</div></div>';
    }).join('');
    var resto = items.length - top.length, restoFuera = items.slice(nMax).filter(function (d) { return u != null && d.edad > u; }).length;
    return '<div class="tarjeta"><div class="edades">' + filas + '</div>' +
      (resto > 0 ? '<p class="small muted" style="margin:10px 0 0">Y ' + resto + ' tarea' + (resto > 1 ? 's' : '') + ' más en curso' + (restoFuera ? ', ' + restoFuera + ' por encima de lo habitual.' : ', todas dentro de lo habitual.') + '</p>' : '') +
      '<div class="edad-leyenda"><span><i class="lg lg-aviso-b"></i>Por encima de lo habitual</span><span><i class="lg lg-hist"></i>Dentro de lo habitual</span>' + (u != null ? '<span><i class="lg lg-marca"></i>Lo habitual: ' + esc(F(u, 'dias')) + '</span>' : '') + '</div></div>';
  }

  function bloqueCasos(eq) {
    var obj = casosDeObjetivos();
    var visibles = eq.casos.filter(function (c) { return obj[c.id] && casoVisible(eq.nombre, c.id); });
    var fuera = eq.casos.filter(function (c) { return !obj[c.id] && casoVisible(eq.nombre, c.id); });
    var ocultos = eq.casos.filter(function (c) { return !casoVisible(eq.nombre, c.id); });
    var html = '';
    if (!visibles.length) html += '<div class="tarjeta vacio-bien"><span class="icono">' + IC.bien.replace('<svg', '<svg style="width:20px;height:20px;color:var(--bien)"') + '</span><div><b>No hay casos abiertos para tus objetivos.</b><p class="small muted" style="margin:2px 0 0">El equipo está dentro de su rango habitual en lo que habéis elegido mejorar.</p></div></div>';
    else html += '<div class="lista-casos">' + visibles.map(function (c) { return tarjetaCaso(eq, c); }).join('') + '</div>';
    if (fuera.length) html += '<details class="tarjeta otros-casos"><summary>También vemos ' + fuera.length + ' caso' + (fuera.length > 1 ? 's' : '') + ' fuera de tus objetivos</summary><div class="lista-casos" style="margin-top:14px">' + fuera.map(function (c) { return tarjetaCaso(eq, c); }).join('') + '</div></details>';
    if (ocultos.length) html += '<p class="small muted" style="margin-top:12px">' + ocultos.length + ' caso' + (ocultos.length > 1 ? 's marcados' : ' marcado') + ' como "no aplica". <button class="btn-txt" data-accion="ver-no-aplica">' + (App.verNoAplica ? 'Ocultar' : 'Ver') + '</button></p>' +
      (App.verNoAplica ? '<div class="lista-casos">' + ocultos.map(function (c) { return tarjetaCaso(eq, c, true); }).join('') + '</div>' : '');
    return html;
  }
  function objetivoDeCaso(id) {
    var mios = objetivosCfg().map(function (o) { return o.id; }), ids = C.casos[id].objetivos || [];
    var oid = ids.filter(function (x) { return mios.indexOf(x) >= 0; })[0] || ids[0];
    var o = C.objetivos.filter(function (x) { return x.id === oid; })[0];
    return o ? o.titulo : '';
  }
  function tarjetaCaso(eq, c, oculto) {
    var def = C.casos[c.id], hechos = (App.cfg && App.cfg.planHecho) || {};
    var base = eq.nombre + '|' + c.id + '|', nHechos = def.plan.filter(function (p, i) { return hechos[base + i]; }).length;
    var plan = '<div class="plan-cab"><b>Plan de acción</b><span>' + nHechos + ' de ' + def.plan.length + ' pasos hechos</span></div><ol class="plan-lista">' + def.plan.map(function (p, i) {
      var k = base + i, h = !!hechos[k];
      return '<li class="' + (h ? 'hecho' : '') + '"><label><input type="checkbox" data-cambio="plan-paso" data-k="' + esc(k) + '"' + (h ? ' checked' : '') + '><span><span class="paso">' + esc(p.paso) + '</span>' +
        '<span class="meta"><span>' + esc(p.quien) + '</span><span>Esfuerzo: ' + esc(p.esfuerzo.charAt(0).toLowerCase() + p.esfuerzo.slice(1)) + '</span></span></span></label></li>';
    }).join('') + '</ol>';
    return '<article class="tarjeta caso ' + c.gravedad + '"><div class="caso-cab"><div><span class="caso-k">' + ETQ[c.gravedad] + ' · ' + esc(objetivoDeCaso(c.id)) + '</span><h3>' + esc(def.titulo) + '</h3></div><span class="conf">Confianza ' + c.confianza + '</span></div>' +
      '<p class="evidencia">' + resaltar(c.evidencia) + '</p>' + plan +
      '<details><summary>Por qué puede pasar y cómo comprobarlo</summary><div class="caso-mas">' +
      '<div><h4>Por qué puede pasar</h4><ul>' + def.causas.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
      '<div><h4>Preguntas para el equipo</h4><ul>' + def.preguntas.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
      '<div><h4>Cómo sabremos que funciona</h4><p>' + esc(def.comprobar) + '</p><p class="small muted">Señal que lo activa: ' + esc(def.senal) + '</p><p class="small muted">Respaldo: ' + esc(def.respaldo) + '</p></div>' +
      '</div><button class="btn-txt no-imprimir" data-accion="no-aplica" data-k="' + esc(eq.nombre + '|' + c.id) + '">' + (oculto ? 'Volver a mostrar este caso' : 'No aplica a este equipo') + '</button>' +
      '</details></article>';
  }

  function ultimas(arr, n) { return arr.slice(Math.max(0, arr.length - n)); }
  function graficoPorClave(clave, eq, graf) {
    graf = graf || App.cfg.graficos;
    var fechas = App.pre && App.onboarding ? App.pre.semanas : App.modelo.semanas;
    if (clave === 'ciclo') return grafico(function (w) { return graf.ciclo === 'tramos' ? G.tramos({ ancho: w, items: eq.ciclos }) : G.puntos({ ancho: w, items: eq.ciclos }); });
    if (clave === 'pendiente') return grafico(function (w) {
      return graf.pendiente === 'tamano' ? G.linea({ ancho: w, serie: ultimas(eq.series.pendiente, 26), fechas: ultimas(fechas, 26), banda: eq.medidas.pendiente.ref, formato: 'num', destacar: 4 })
        : G.dosLineas({ ancho: w, a: ultimas(eq.series.entradas, 26), b: ultimas(eq.series.salidas, 26), fechas: ultimas(fechas, 26), nombreA: 'Entradas', nombreB: 'Salidas' });
    });
    // evolucion: ejemplo con entregas
    return grafico(function (w) { return serieGrafico(eq, 'entregas', w, graf, fechas); });
  }
  function serieGrafico(eq, id, w, graf, fechas) {
    var m = eq.medidas[id], def = C.medidas[id];
    var serie = id === 'entregas' && graf.evolucion === 'columnas' ? eq.series.entregas : m.serie;
    if (graf.evolucion === 'columnas') return G.columnas({ ancho: w, serie: ultimas(serie, 26), fechas: ultimas(fechas, 26), formato: def.formato, destacar: m.ventana || 4 });
    return G.linea({ ancho: w, serie: ultimas(serie, 26), fechas: ultimas(fechas, 26), banda: m.ref, formato: def.formato, destacar: m.ventana || 4 });
  }
  // Título de cada gráfico: una afirmación con el dato, no una etiqueta
  function frase(eq, id) {
    var def = C.medidas[id], m = eq.medidas[id], nom = esc(def.nombre), v = '<b>' + esc(F(m.valor, def.formato)) + '</b>';
    if (id === 'reparto') return 'Las historias son ' + v + ' de lo terminado';
    if (id === 'pendiente') {
      var e = ultimas(eq.series.entradas, 4).reduce(function (s, x) { return s + x; }, 0), sl = ultimas(eq.series.salidas, 4).reduce(function (s, x) { return s + x; }, 0);
      return e > sl ? 'Entra más de lo que sale: <b>' + e + '</b> frente a <b>' + sl + '</b> en 4 semanas' : (e < sl ? 'Sale más de lo que entra: <b>' + sl + '</b> frente a <b>' + e + '</b> en 4 semanas' : 'Entra lo mismo que sale en las últimas 4 semanas');
    }
    var c = comparar(id, m);
    if (!c || c.sentido === 'igual') return nom + ': ' + v + ', dentro de lo habitual';
    return nom + ': ' + v + ', ' + (c.sentido === 'sube' ? 'por encima' : 'por debajo') + ' de lo habitual (' + esc(c.habitual) + ')';
  }
  function tarjetaGrafico(eq, id) {
    var def = C.medidas[id], graf = App.cfg.graficos, cuerpo, lectura;
    if (id === 'edad') { cuerpo = grafico(function (w) { return G.edad({ ancho: w, items: eq.enCurso, umbral: eq.umbralEdad }); }); lectura = 'Cada punto es una tarea en curso. Los amarillos ya llevan más de lo habitual en este equipo.'; }
    else if (id === 'ciclo') { cuerpo = graficoPorClave('ciclo', eq); lectura = graf.ciclo === 'tramos' ? 'Cuántas tareas de las últimas 16 semanas terminaron en cada tramo de días.' : 'Cada punto es una tarea terminada en las últimas 16 semanas. Las líneas marcan la mitad y el plazo de 8 de cada 10.'; }
    else if (id === 'pendiente') { cuerpo = graficoPorClave('pendiente', eq); lectura = graf.pendiente === 'tamano' ? 'Tareas sin empezar al final de cada semana.' : 'Si la línea de entradas va por encima de la de salidas, el pendiente crece.'; }
    else if (id === 'reparto') { cuerpo = grafico(function (w) { return G.apilado({ ancho: w, serie: ultimas(eq.series.reparto, 26), fechas: ultimas(App.modelo.semanas, 26) }); }); lectura = 'Cada columna es el reparto de lo terminado en las 8 semanas anteriores.'; }
    else { cuerpo = grafico(function (w) { return serieGrafico(eq, id, w, graf, App.modelo.semanas); }); lectura = graf.evolucion === 'banda' ? 'La franja es lo habitual para este equipo. En azul, las semanas que cuentan para el valor actual.' : 'Un valor por semana. En azul, las semanas que cuentan para el valor actual.'; }
    var marca = eq.medidas[id] && (eq.medidas[id].estado === 'critico' || eq.medidas[id].estado === 'atencion') ? estado(eq.medidas[id].estado, eq.medidas[id].estadoTexto) : '';
    return '<div class="tarjeta graf-tarjeta"><div class="graf-k"><span>' + esc(def.nombre) + '</span>' + marca + '</div><h3>' + (id === 'edad' ? esc(def.pregunta) : frase(eq, id)) + '</h3><div class="sub">' + esc(def.pregunta) + ' · ' + esc(unidadLarga(id)) + '</div>' + cuerpo + '<p class="lectura">' + esc(lectura) + '</p></div>';
  }

  function vistaMedida() {
    var eq = equipoActual(), id = App.medida, def = C.medidas[id], m = eq.medidas[id];
    var html = '<p class="volver"><button class="btn-txt" data-accion="vista" data-v="equipo">← Volver a ' + esc(eq.nombre) + '</button></p>';
    html += cabecera(eq.nombre + ' · Detalle de la medida', def.nombre, def.pregunta, selectorEquipos());
    if (!m.disponible) return html + '<div class="tarjeta"><p>' + esc(m.motivo) + '</p></div>';
    html += '<div class="rejilla-2"><div class="tarjeta medida-hero"><div class="kpi-cab"><span class="kpi-nombre">Valor actual</span>' + estado(m.estado, m.estadoTexto) + '</div><div class="kpi-valor grande">' + cifraHtml(id, m.valor) + '</div><div class="kpi-unidad">' + esc(UNIDAD[id] ? UNIDAD[id][1] : def.unidad) + '</div>' +
      (deltaHtml(id, m) ? '<div style="margin-top:12px">' + deltaHtml(id, m) + '</div>' : '') +
      '<p class="estado-txt">' + esc(m.estadoTexto || '') + '</p>' +
      '<h4>Cómo se calcula</h4><p class="muted">' + esc(def.como) + '</p></div>';
    // límites del equipo
    var lim = (App.cfg.limites[eq.nombre] || {})[id] || {};
    var pct = def.formato === 'pct', u = pct ? '%' : (def.formato === 'dias' ? 'días' : (def.formato === 'horas' ? 'horas' : ''));
    var val = function (v) { return v == null ? '' : (pct ? Math.round(v * 100) : v); };
    html += def.dir ? '<div class="tarjeta"><h3>Límites de este equipo</h3><p class="small muted">Si los dejas vacíos, el estado se calcula frente a su rango habitual' + (def.limites ? ' y los límites recomendados (' + F(def.limites.atencion, def.formato) + ' y ' + F(def.limites.critico, def.formato) + ')' : '') + '.</p>' +
      '<div class="limites"><label><span class="est est-atencion">Atención</span> ' + (def.dir === 'menos' ? 'desde' : 'por debajo de') + ' <input type="number" step="any" data-cambio="limite" data-m="' + id + '" data-tipo="atencion" value="' + val(lim.atencion) + '"> ' + u + '</label>' +
      '<label><span class="est est-critico">Crítico</span> ' + (def.dir === 'menos' ? 'desde' : 'por debajo de') + ' <input type="number" step="any" data-cambio="limite" data-m="' + id + '" data-tipo="critico" value="' + val(lim.critico) + '"> ' + u + '</label>' +
      '<button class="btn-txt" data-accion="limite-auto" data-m="' + id + '">Usar lo automático</button></div></div>' : '';
    html += '</div>';
    html += '<section class="seccion"><div class="rejilla-2" style="grid-template-columns:1fr">' + tarjetaGrafico(eq, id) + '</div></section>';
    var rel = eq.casos.filter(function (c) { return C.casos[c.id].medida === id; });
    if (rel.length) html += '<section class="seccion"><div class="seccion-cab"><span class="n">' + rel.length + '</span><div><h2>Casos relacionados</h2></div></div><div class="lista-casos">' + rel.map(function (c) { return tarjetaCaso(eq, c); }).join('') + '</div></section>';
    return html;
  }

  // ---------- el área: los equipos incluidos, juntos, frente a su propia historia ----------
  function modeloArea() {
    if (App._areaPara === App.modelo && App._area) return App._area;
    var cm = cfgMotor(App.cfg); cm.unirComo = 'El área'; cm.limites = {};
    // FTE del área: la suma de los equipos, solo si todos lo tienen
    var fteEq = App.modelo.equipos.map(function (e) { return +((App.cfg.fte || {})[e.nombre]) || 0; });
    cm.fte = { 'El área': fteEq.every(function (x) { return x > 0; }) ? fteEq.reduce(function (a, b) { return a + b; }, 0) : 0 };
    var a = null;
    try { a = Motor.calcular(App.tareas, App.det, cm).equipos[0] || null; } catch (e) { if (window.console) console.error(e); }
    if (a && a.medidas.edad) {
      // Lo atascado no se mide contra un plazo único: se suma lo de cada equipo, cada uno contra su plazo habitual
      var n = 0, peor = 'bien', o = { bien: 0, atencion: 1, critico: 2 }, hay = false;
      App.modelo.equipos.forEach(function (e) { var m = e.medidas.edad; if (m && m.disponible && m.valor != null) { hay = true; n += m.valor; if ((o[m.estado] || 0) > o[peor]) peor = m.estado; } });
      a.medidas.edad = hay ? { disponible: true, valor: n, estado: peor, estadoTexto: 'Suma de las tareas bloqueadas de cada equipo, cada una frente al plazo habitual de su equipo.', ref: null, serie: null } : a.medidas.edad;
    }
    App._area = a; App._areaPara = App.modelo;
    return a;
  }
  function estadoEquipo(eq) {
    var cs = casosAbiertos(eq);
    return cs.some(function (c) { return c.gravedad === 'critico'; }) ? 'critico' : (cs.length ? 'atencion' : 'bien');
  }
  // Casos agrupados por tipo: los que aparecen en dos o más equipos son patrones del área
  function patronesArea() {
    var mapa = {}, obj = casosDeObjetivos();
    App.modelo.equipos.forEach(function (eq) {
      eq.casos.filter(function (c) { return casoVisible(eq.nombre, c.id); }).forEach(function (c) { (mapa[c.id] = mapa[c.id] || []).push({ eq: eq.nombre, g: c.gravedad }); });
    });
    var lista = Object.keys(mapa).map(function (id) {
      return { id: id, eqs: mapa[id], crit: mapa[id].filter(function (x) { return x.g === 'critico'; }).length, objetivo: !!obj[id] };
    }).sort(function (a, b) { return b.eqs.length - a.eqs.length || b.crit - a.crit || (b.objetivo - a.objetivo); });
    // Si los datos fallan en varios equipos, va primero: el resto de conclusiones depende de ello
    var df = lista.filter(function (x) { return x.id === 'datos_poco_fiables' && x.eqs.length >= 2; })[0];
    if (df) { lista.splice(lista.indexOf(df), 1); lista.unshift(df); }
    return { repetidos: lista.filter(function (x) { return x.eqs.length >= 2; }), solos: lista.filter(function (x) { return x.eqs.length < 2; }) };
  }
  function listaNombres(ns) { return ns.length < 2 ? (ns[0] || '') : ns.slice(0, -1).join(', ') + ' y ' + ns[ns.length - 1]; }
  function sinCuando(t) { t = String(t || '').replace(/^Cuando se repite, /, ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  // ---------- vista de comité: cinco indicadores, recomendaciones, equipos y evolución ----------
  function nombreK(id) { return T('kpi.' + id); }
  function cifraK(id, v) {
    var def = defMedida(id);
    if (v == null) return 's/d';
    if (def.formato === 'dias') return esc(corto(v, 'num')) + '<small>' + (Math.abs(v - 1) < 0.05 ? 'día' : 'días') + '</small>';
    return esc(corto(v, def.formato));
  }
  function flechaK(id, m) {
    var c = comparar(id, m);
    if (!c) return '';
    return '<span class="delta ' + c.clase + '">' + (c.sentido === 'sube' ? '↑ ' : (c.sentido === 'baja' ? '↓ ' : '')) + 'Lo habitual: ' + esc(c.habitual) + '</span>';
  }
  function titularArea(eqs) {
    var M = eqs.length, nAt = eqs.filter(function (e) { return estadoEquipo(e) !== 'bien'; }).length;
    return nAt === 0 ? 'El área va bien: <em>' + (M === 1 ? 'su equipo está' : 'los ' + M + ' equipos están') + '</em> dentro de lo habitual.'
      : '<em>' + nAt + ' de ' + M + ' equipos</em> ' + (nAt === 1 ? 'necesita' : 'necesitan') + ' atención esta semana.';
  }
  function tileK(k, m, accion) {
    var nom = '<span class="kt-nombre">' + esc(nombreK(k.id)) + '</span>';
    if (!m || !m.disponible) {
      var falta = m && m.falta === 'fte';
      return '<div class="kpi-tile kt-nd">' + nom + '<span class="kt-v">s/d</span><span class="kt-u">' + esc((m && m.motivo) || 'Sin datos suficientes.') + '</span>' +
        (falta ? '<button class="btn btn-peq btn-sec" data-accion="vista" data-v="config">Indicar personas</button>' : '') + '</div>';
    }
    var est = m.estado && m.estado !== 'neutro' && m.estado !== 'sin' ? m.estado : 'neutro';
    var serie = (m.serie || []).filter(function (x) { return x != null; });
    return '<button class="kpi-tile kt-' + est + '" data-accion="' + accion + '" data-m="' + k.id + '" title="' + esc(m.estadoTexto || '') + '">' +
      '<span class="kt-cab">' + nom + (est !== 'neutro' ? '<span class="est est-' + est + '">' + ETQ[est] + '</span>' : '') + '</span>' +
      '<span class="kt-v">' + cifraK(k.id, m.valor) + '</span><span class="kt-u">' + esc(k.unidad) + '</span>' +
      '<span class="kt-pie">' + (flechaK(k.id, m) || '<span></span>') + '</span>' +
      (serie.length >= 3 ? '<span class="kt-chispa">' + G.chispa(serie) + '</span>' : '') + '</button>';
  }
  function pantallaSalud(area) {
    var eqs = App.modelo.equipos;
    var chips = eqs.map(function (e) { var est = estadoEquipo(e); return '<button class="salud-eq" data-accion="ir-equipo" data-e="' + esc(e.nombre) + '" title="' + esc(ETQ[est]) + '"><span class="mz-p mz-' + est + '"></span>' + esc(e.nombre) + '</button>'; }).join('');
    return '<div class="salud-cab"><h2 class="salud-h">' + titularArea(eqs) + '</h2><div class="salud-eqs">' + chips + '</div></div>' +
      '<div class="kpi-tiles">' + C.kpis.map(function (k) { return tileK(k, area.kpis[k.id], 'area-kpi'); }).join('') + '</div>' +
      '<p class="salud-nota">Cada cifra compara el área consigo misma: lo habitual son sus 12 semanas anteriores. Pulsa una cifra para ver su evolución.</p>';
  }
  // Recomendaciones del área: primero lo que se repite entre equipos, después lo crítico de cada equipo. Como mucho cuatro.
  function recomendacionesArea(pat) {
    var recs = pat.repetidos.slice(), vistos = {};
    recs.forEach(function (r) { vistos[r.id] = 1; });
    pat.solos.filter(function (r) { return r.eqs[0].g === 'critico'; }).forEach(function (r) { if (!vistos[r.id]) { recs.push(r); vistos[r.id] = 1; } });
    pat.solos.filter(function (r) { return r.eqs[0].g !== 'critico'; }).forEach(function (r) { if (!vistos[r.id]) { recs.push(r); vistos[r.id] = 1; } });
    return recs.slice(0, 4);
  }
  function pantallaRecomendaciones(pat) {
    var recs = recomendacionesArea(pat), M = App.modelo.equipos.length;
    if (!recs.length) return '<div class="tarjeta vacio-bien"><span class="icono">' + IC.bien.replace('<svg', '<svg style="width:20px;height:20px;color:var(--bien)"') + '</span><div><b>No hay recomendaciones esta semana.</b><p class="small muted" style="margin:2px 0 0">Todos los equipos están dentro de su rango habitual.</p></div></div>';
    var porEq = {}; App.modelo.equipos.forEach(function (e) { porEq[e.nombre] = e; });
    return '<ol class="recs">' + recs.map(function (r, i) {
      var def = C.casos[r.id], grave = r.crit ? 'critico' : 'atencion', nombres = r.eqs.map(function (x) { return x.eq; });
      var alcance = r.eqs.length >= 2 ? 'Se repite en ' + r.eqs.length + ' de ' + M + ' equipos: ' + listaNombres(nombres) : nombres[0] + ': ' + def.titulo;
      var accion = r.eqs.length >= 2 ? (def.accionArea || def.titulo) : ((def.plan && def.plan[0]) ? def.plan[0].paso : def.titulo);
      var porque = r.eqs.length >= 2 ? sinCuando(def.comun) : (function () { var c = porEq[nombres[0]].casos.filter(function (x) { return x.id === r.id; })[0]; return c ? c.evidencia : def.senal; })();
      var base = r.eqs.map(function (x) { var c = porEq[x.eq].casos.filter(function (y) { return y.id === r.id; })[0]; return '<li><b>' + esc(x.eq) + ':</b> ' + resaltar(c ? c.evidencia : '') + '</li>'; }).join('');
      return '<li class="rec ' + grave + '"><span class="rec-n">' + (i + 1) + '</span><div class="rec-cuerpo"><div class="rec-cab"><span class="est est-' + grave + '">' + ETQ[grave] + '</span><span class="rec-alc">' + esc(alcance) + '</span></div>' +
        '<h3>' + esc(accion) + '</h3><p class="rec-porque">' + (r.eqs.length >= 2 ? esc(porque) : resaltar(porque)) + '</p>' +
        '<details><summary>En qué se basa</summary><div class="rec-base"><p><b>' + esc(def.titulo) + '.</b> ' + esc(def.senal) + '</p><ul>' + base + '</ul><p class="small muted">Respaldo: ' + esc(def.respaldo) + '</p>' +
        '<div class="patron-eqs">' + r.eqs.map(function (x) { return '<button class="chip-eq ' + x.g + '" data-accion="ir-caso-eq" data-e="' + esc(x.eq) + '" data-id="' + r.id + '"><span class="punto"></span>Plan en ' + esc(x.eq) + '</button>'; }).join('') + '</div></div></details></div></li>';
    }).join('') + '</ol>';
  }
  function pantallaEquiposK(area) {
    var eqs = App.modelo.equipos;
    var celda = function (k, m, eqNombre) {
      if (!m || !m.disponible || m.valor == null) return '<td class="mz-nd" title="' + esc((m && m.motivo) || 'Sin datos') + '"><span class="muted small">' + (m && m.falta === 'fte' ? 'Falta FTE' : 'Sin datos') + '</span></td>';
      var c = comparar(k.id, m), fl = c && c.sentido !== 'igual' ? '<span class="mz-fl ' + c.clase + '">' + (c.sentido === 'sube' ? '↑' : '↓') + '</span>' : '';
      var tip = (m.estadoTexto || '') + (c ? ' Lo habitual: ' + c.habitual + '.' : '');
      var dentro = '<span class="mz-p mz-' + (m.estado || 'neutro') + '"></span><span class="mz-v">' + esc(F(m.valor, defMedida(k.id).formato)) + '</span>' + fl;
      return eqNombre ? '<td><button class="mz-b" data-accion="ir-equipo" data-e="' + esc(eqNombre) + '" title="' + esc(tip) + '">' + dentro + '</button></td>' : '<td><span class="mz-b" title="' + esc(tip) + '">' + dentro + '</span></td>';
    };
    var cab = '<tr><th scope="col">Equipo</th>' + C.kpis.map(function (k) { return '<th scope="col"><span class="mz-h">' + esc(nombreK(k.id)) + '</span><span class="mz-sub">' + esc(k.unidad) + '</span></th>'; }).join('') + '</tr>';
    var filas = eqs.map(function (e) {
      var est = estadoEquipo(e);
      return '<tr><th scope="row"><button class="btn-txt" data-accion="ir-equipo" data-e="' + esc(e.nombre) + '"><span class="mz-p mz-' + est + '"></span> ' + esc(e.nombre) + '</button></th>' + C.kpis.map(function (k) { return celda(k, e.kpis[k.id], e.nombre); }).join('') + '</tr>';
    }).join('');
    var filaArea = area ? '<tr class="fila-area"><th scope="row">El área</th>' + C.kpis.map(function (k) { return celda(k, area.kpis[k.id], null); }).join('') + '</tr>' : '';
    return '<div class="pantalla-cab"><h2>Cómo va cada equipo</h2><p>Los mismos cinco indicadores, cada equipo frente a su propia historia. Orden alfabético: no es un ranking. Pulsa un equipo para ver su informe.</p></div>' +
      '<div class="tabla-wrap matriz matriz-k"><table><thead>' + cab + '</thead><tbody>' + filas + filaArea + '</tbody></table></div>' +
      '<div class="leyenda mz-leyenda"><span><i class="mz-p mz-bien"></i>Bien</span><span><i class="mz-p mz-atencion"></i>Atención</span><span><i class="mz-p mz-critico"></i>Crítico</span><span><b class="mz-fl peor">↑</b> peor que lo habitual</span><span><b class="mz-fl mejor">↓</b> mejor que lo habitual</span></div>';
  }
  function pantallaEvolucionK(area) {
    var ks = C.kpis.filter(function (k) { var m = area.kpis[k.id]; return m && m.disponible && m.serie; });
    if (!ks.length) return '<p class="muted">Aún no hay semanas suficientes para dibujar la evolución.</p>';
    var tarjeta = function (k) {
      var m = area.kpis[k.id], c = comparar(k.id, m), est = m.estado && m.estado !== 'neutro' && m.estado !== 'sin' ? estado(m.estado, m.estadoTexto) : '';
      var titulo = esc(nombreK(k.id)) + ': <b>' + esc(F(m.valor, k.formato)) + '</b>' + (c && c.sentido !== 'igual' ? ', ' + (c.clase === 'peor' ? 'peor' : 'mejor') + ' que lo habitual (' + esc(c.habitual) + ')' : ', dentro de lo habitual');
      return '<div class="tarjeta graf-tarjeta"><div class="graf-k"><span>' + esc(nombreK(k.id)) + '</span>' + est + '</div><h3>' + titulo + '</h3><div class="sub">' + esc(k.unidad) + ' · todo el área</div>' +
        grafico(function (w) { return G.linea({ ancho: w, serie: ultimas(m.serie, 26), fechas: ultimas(App.modelo.semanas, 26), banda: m.ref, formato: k.formato, destacar: m.ventana || 4 }); }) +
        '<p class="lectura">La franja es lo habitual para el área. En azul, las semanas que cuentan para el valor actual.</p></div>';
    };
    if (App.imprimiendo) return '<div class="rejilla-2">' + ks.map(tarjeta).join('') + '</div>';
    var sel = ks.filter(function (k) { return k.id === App.grafSel.__areaK; })[0] || ks[0];
    var lista = ks.map(function (k) {
      var m = area.kpis[k.id], e = m.estado === 'critico' || m.estado === 'atencion' ? ' ' + m.estado : '';
      return '<button class="caso-item graf-item' + e + '" data-accion="area-kpi" data-m="' + k.id + '" aria-current="' + (k === sel) + '"><span class="ci-k">' + (ETQ[m.estado] || 'Seguimiento') + '</span><b>' + esc(nombreK(k.id)) + '</b><span class="ci-p">' + esc(F(m.valor, k.formato)) + ' · ' + esc(k.unidad) + '</span></button>';
    }).join('');
    return '<div class="maestro-detalle"><div class="md-lista">' + lista + '</div><div class="md-detalle">' + tarjeta(sel) + '</div></div>';
  }

  function vistaTodos() {
    var cabeza = '<div class="cabecera cabecera-vista"><div><div class="antetitulo">Dirección · ' + esc(semanaTexto(App.modelo.semanaFin)) + '</div>' + editable('h1', 'todos.titulo') + editable('p', 'todos.intro') + '</div></div>';
    var area = modeloArea(), pat = patronesArea(), nRec = recomendacionesArea(pat).length;
    return pantallas('todos', [
      area ? ['salud', 'Salud del área', function () { return pantallaSalud(area); }] : null,
      ['recs', 'Recomendaciones' + (nRec ? ' (' + nRec + ')' : ''), function () { return '<div class="pantalla-cab"><h2>Qué recomendamos</h2><p>Primero lo que se repite entre equipos, porque se arregla una vez para todos. Después, lo más grave de cada equipo.</p></div>' + pantallaRecomendaciones(pat); }],
      ['equipos', 'Equipos', function () { return pantallaEquiposK(area); }],
      area ? ['evolucion', 'Evolución', function () { return '<div class="pantalla-cab"><h2>Cómo ha evolucionado el área</h2><p>Últimas 26 semanas, con todas las tareas de los equipos.</p></div>' + pantallaEvolucionK(area); }] : null
    ], cabeza);
  }
  // Índice de una pantalla de "El área" por su id, para saltar a ella
  function irPantallaTodos(idPant) {
    var orden = [modeloArea() ? 'salud' : null, 'recs', 'equipos', modeloArea() ? 'evolucion' : null].filter(Boolean);
    App.vista = 'todos'; App.pant.todos = Math.max(0, orden.indexOf(idPant));
  }

  function vistaPmo() {
    var cabeza = '<div class="cabecera cabecera-vista"><div><div class="antetitulo">PMO · ' + esc(semanaTexto(App.modelo.semanaFin)) + '</div>' + editable('h1', 'pmo.titulo') + editable('p', 'pmo.intro') + '</div></div>';
    var cols = ['regularidad', 'arrastradas', 'ciclo', 'pendiente'];
    var html = '<div class="tabla-wrap"><table><thead><tr><th>Equipo</th>' + cols.map(function (id) { return '<th>' + esc(C.medidas[id].nombre) + '</th>'; }).join('') + '<th>Salud del dato</th><th>Casos abiertos</th></tr></thead><tbody>' +
      App.modelo.equipos.map(function (eq) {
        var cs = eq.casos.filter(function (c) { return casoVisible(eq.nombre, c.id); });
        var crit = cs.filter(function (c) { return c.gravedad === 'critico'; }).length;
        var sd = eq.calidad.avisos.length, sdE = sd === 0 ? 'bien' : (sd === 1 ? 'atencion' : 'critico');
        return '<tr><td><button class="btn-txt enlace-eq" data-accion="ir-equipo" data-e="' + esc(eq.nombre) + '">' + esc(eq.nombre) + '</button></td>' + cols.map(function (id) {
          var m = eq.medidas[id];
          if (!m || !m.disponible) return '<td class="muted small">No disponible</td>';
          return '<td><span class="valor-t">' + esc(F(m.valor, C.medidas[id].formato)) + '</span> ' + estado(m.estado, m.estadoTexto) + '</td>';
        }).join('') + '<td>' + estado(sdE, eq.calidad.avisos.join(' ')) + (sd ? ' <span class="small muted">' + sd + ' aviso' + (sd > 1 ? 's' : '') + '</span>' : '') + '</td>' +
          '<td><span class="cuentas">' + cuentaEstado(cs) + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
    var tabla = html;
    var casos = function () {
      return '<div class="rejilla-equipos">' + App.modelo.equipos.map(function (eq) {
        var cs = eq.casos.filter(function (c) { return casoVisible(eq.nombre, c.id); });
        return '<div class="tarjeta"><div class="caso-cab"><h3>' + esc(eq.nombre) + '</h3><span class="cuentas small">' + cuentaEstado(cs) + '</span></div>' +
          (cs.length ? '<ul class="casos-cortos">' + cs.map(function (c) { return '<li class="' + c.gravedad + '"><b>' + esc(C.casos[c.id].titulo) + '</b> <span class="muted small">· ' + esc(objetivoDeCaso(c.id)) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted" style="margin-top:8px">Sin casos abiertos.</p>') +
          '<button class="btn-txt" data-accion="ir-equipo" data-e="' + esc(eq.nombre) + '">Ver el plan en el informe del equipo →</button></div>';
      }).join('') + '</div>';
    };
    return pantallas('pmo', [['tabla', 'Cómo va cada equipo', function () { return tabla; }], ['casos', 'Casos abiertos', casos]], cabeza);
  }

  function vistaNegocio() {
    var cabeza = '<div class="cabecera cabecera-vista"><div><div class="antetitulo">Producto y negocio · últimas 12 semanas</div>' + editable('h1', 'negocio.titulo') + editable('p', 'negocio.intro') + '</div></div>';
    var tarjeta = function (eq) {
      var n = eq.negocio, rep = ultimas(eq.series.reparto.filter(Boolean), 1)[0];
      var dias = function (v) { return cifraHtml('ciclo', v); };
      var plazos = n.n >= 5 ? '<h4>Desde que se empieza</h4><div class="cifras-claras"><div><b>' + dias(n.ciclo50) + '</b><span>termina la mitad de las tareas</span></div><div><b>' + dias(n.ciclo85) + '</b><span>terminan 8 de cada 10</span></div></div>' +
        '<h4>Desde que se pide</h4><div class="cifras-claras"><div><b>' + dias(n.total50) + '</b><span>la mitad de las peticiones</span></div><div><b>' + dias(n.total85) + '</b><span>8 de cada 10 peticiones</span></div></div>' : '<p class="muted">Pocas tareas terminadas en las últimas 12 semanas.</p>';
      var urg = n.urgente.n >= 5 && n.resto.n >= 5 ? '<p class="nota-urg">Lo urgente tarda <b>' + esc(F(n.urgente.mediana, 'dias')) + '</b> de mediana desde que se pide, frente a <b>' + esc(F(n.resto.mediana, 'dias')) + '</b> del resto.</p>' : '';
      var reparto = rep ? '<h4>En qué se va el esfuerzo (últimas 8 semanas)</h4><div class="apilada" role="img" aria-label="Reparto por tipo">' + G.TIPOS.map(function (t) {
        var v = rep[t[0]] || 0; return v > 0 ? '<span style="width:' + (v * 100) + '%;background:var(--' + t[2] + ')" title="' + esc(t[1] + ': ' + Math.round(v * 100) + '%') + '"></span>' : '';
      }).join('') + '</div><div class="leyenda">' + G.TIPOS.map(function (t) { return '<span><i class="lg lg-' + t[2] + '"></i>' + esc(t[1]) + ' <b>' + Math.round((rep[t[0]] || 0) * 100) + '%</b></span>'; }).join('') + '</div>' : '';
      var epicas = n.epicas.length ? '<h4>Por épica (últimas 12 semanas)</h4><div class="barras-html">' + n.epicas.map(function (e) {
        return '<div class="barra-fila"><span>' + esc(e.nombre) + '</span><span class="pista"><span class="relleno" style="width:' + Math.round(e.parte * 100) + '%"></span></span><b>' + Math.round(e.parte * 100) + '%</b></div>';
      }).join('') + '</div>' : '';
      return '<div class="tarjeta negocio negocio-ancho"><div class="neg-col">' + plazos + urg + '</div><div class="neg-col">' + reparto + epicas + '</div></div>';
    };
    return pantallas('negocio', App.modelo.equipos.map(function (eq) { return [eq.nombre, eq.nombre, function () { return tarjeta(eq); }]; }), cabeza);
  }

  var CAMPOS = { clave: 'Clave', tipo: 'Tipo de tarea', estado: 'Estado', creada: 'Fecha de creación', resuelta: 'Fecha de resolución', resolucion: 'Resolución',
    prioridad: 'Prioridad', tis: 'Tiempo en estado', cambioCategoria: 'Cambio de categoría de estado', sprint: 'Sprint', puntos: 'Puntos de historia',
    equipo: 'Equipo', componentes: 'Componentes', primera: 'Fecha de primera respuesta', padre: 'Épica o elemento principal', descripcion: 'Descripción (para agentes)' };
  function vistaChequeo() {
    var inf = App.informe, det = App.det;
    var nS = 0, cabS = function (t, p) { nS++; return '<div class="seccion-cab"><span class="n">0' + nS + '</span><div><h2>' + t + '</h2>' + (p ? '<p>' + p + '</p>' : '') + '</div></div>'; };
    var cabeza = '<div class="cabecera cabecera-vista"><div><div class="antetitulo">Datos · origen y calidad</div>' + editable('h1', 'chequeo.titulo') + '<p>De dónde salen los datos y si se puede confiar en ellos. Medidas calculadas hasta el ' + esc(Motor.fechaCorta(new Date(App.modelo.semanaFin.getTime() - 864e5))) + '.</p></div><button class="btn btn-sec btn-peq" data-accion="cargar-otros">Cargar otros datos</button></div>';
    var pant = [];
    var html = '<div class="rejilla-2"><div class="tarjeta"><h3>Ficheros</h3><div class="tabla-wrap" style="margin-top:10px"><table><thead><tr><th>Fichero</th><th class="num">Filas</th><th class="num">Columnas con datos</th></tr></thead><tbody>' +
      inf.ficheros.map(function (f) { return '<tr><td>' + esc(f.nombre) + '</td><td class="num">' + f.filas.toLocaleString('es-ES') + '</td><td class="num">' + f.columnasConDatos + ' de ' + f.columnas + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="small muted" style="margin-top:8px">' + inf.tareas.toLocaleString('es-ES') + ' tareas. Se han quitado ' + inf.duplicadas.toLocaleString('es-ES') + ' filas repetidas, ' + inf.epicas + ' épicas y ' + inf.subtareas + ' subtareas.</p></div>';
    html += '<div class="tarjeta"><h3>Campos</h3><ul class="lista-check" style="margin-top:10px">' + Object.keys(CAMPOS).map(function (k) {
      var v = inf.campos[k];
      return '<li class="' + (v === true ? 'ok' : 'no') + '">' + (v === true ? IC.bien : IC.no) + '<span>' + esc(CAMPOS[k]) + (v === 'vacio' ? ' <span class="muted small">(columna vacía)</span>' : (v ? '' : ' <span class="muted small">(no está)</span>')) + '</span></li>';
    }).join('') + '</ul></div></div>';
    pant.push(['ficheros', 'Ficheros y campos', (function (h) { return function () { return h; }; })(html)]);
    var avisos = inf.avisos.concat(det.avisos);
    var op = opcion(App.cfg.campoEquipo);
    var nuevos = op && op.id !== 'todos' ? op.valores.filter(function (v) { return App.cfg.equipos.indexOf(v.valor) < 0; }) : [];
    if (nuevos.length) avisos.push({ texto: 'Hay valores de equipo en los datos que no están en tu configuración: ' + nuevos.map(function (v) { return v.valor; }).slice(0, 6).join(', ') + '. Añádelos en Ajustes si son equipos.' });
    var cab2 = function (t, p) { return '<div class="pantalla-cab"><h2>' + t + '</h2>' + (p ? '<p>' + p + '</p>' : '') + '</div>'; };
    pant.push(['calidad', 'Calidad por equipo', function () {
      return cab2('Calidad del dato por equipo', 'Señales de que Jira no refleja bien lo que pasa: saltos de estado, cierres en bloque, sprints y puntos.') + '<div class="rejilla-equipos">' + App.modelo.equipos.map(function (eq) {
        return '<div class="tarjeta"><h3>' + esc(eq.nombre) + '</h3>' + (eq.calidad.avisos.length ? '<ul style="margin:8px 0 0;padding-left:18px">' + eq.calidad.avisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '<p class="muted" style="margin-top:8px">Sin avisos.</p>') + '</div>';
      }).join('') + '</div>';
    }]);
    if (avisos.length) pant.push(['avisos', 'Avisos (' + avisos.length + ')', function () { return cab2('Avisos', 'Lo que conviene revisar antes de sacar conclusiones.') + '<div class="avisos">' + avisos.map(function (a) { return '<div class="aviso">' + IC.aviso + '<span>' + esc(a.texto) + '</span></div>'; }).join('') + '</div>'; }]);
    pant.push(['falta', 'Lo que falta', function () { return cab2('Lo que necesita más datos') + '<div class="tarjeta"><ul style="margin:0;padding-left:18px"><li><b>Fiabilidad del sprint</b> y <b>trabajo no planificado</b>: hace falta saber qué había al empezar cada sprint. Se consigue con la conexión a la API de Jira o guardando fotos semanales en la carpeta historico' + (App.carpeta ? ' (ya se guardan al leer la carpeta)' : '') + '.</li><li><b>Medidas de despliegue (DORA)</b>: necesitan datos de despliegues e incidencias, que no están en Jira.</li></ul></div>'; }]);
    return pantallas('chequeo', pant, cabeza);
  }

  function vistaConfig() {
    var c = App.cfg;
    var html = cabecera('Ajustes', 'Ajustes', 'Todo lo que elegiste en la puesta en marcha se puede cambiar aquí.') + '<div class="rejilla-ajustes">';
    html += '<div class="tarjeta"><h3>Objetivos, medidas y vistas</h3><p class="muted small">Objetivos: ' + esc(objetivosCfg().map(function (o) { return o.titulo; }).join(', ')) + '.</p><p class="muted small">Medidas: ' + esc(medidasCfg().map(function (id) { return C.medidas[id].nombre; }).join(', ')) + '.</p><p class="botones-fila"><button class="btn btn-sec btn-peq" data-accion="rehacer">Repetir la puesta en marcha</button><button class="btn-txt" data-accion="rehacer" data-paso="3">Revisar los estados</button></p></div>';
    html += tarjetaDefiniciones(c, 3);
    var fte = c.fte || {};
    html += '<div class="tarjeta"><h3>Personas por equipo (FTE)</h3><p class="muted small">Para el indicador Throughput / FTE: cuánto termina al mes una persona equivalente. Jira no lo trae: indica cuántas personas a jornada completa tiene cada equipo.</p><div class="fte-filas">' +
      App.modelo.equipos.map(function (e) {
        var o = (c.fteOrigen || {})[e.nombre] || 'declarado';
        return '<label class="fte-fila"><span>' + esc(e.nombre) + '</span><input type="number" min="0" step="0.5" inputmode="decimal" data-cambio="fte" data-e="' + esc(e.nombre) + '" value="' + (fte[e.nombre] != null ? fte[e.nombre] : '') + '" aria-label="Personas de ' + esc(e.nombre) + '">' +
          '<select data-cambio="fte-origen" data-e="' + esc(e.nombre) + '" aria-label="De dónde sale el FTE de ' + esc(e.nombre) + '">' + [['contrato', 'Contrato'], ['declarado', 'Declarado'], ['estimado', 'Estimado']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === o ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>';
      }).join('') + '</div></div>';
    var info = c.equiposInfo || {};
    html += '<div class="tarjeta ancho-2"><h3>Equipos internos y de proveedores</h3><p class="muted small">Para la pestaña Comparar: qué equipos son de un proveedor y a qué área pertenece cada uno. Se comparan siempre con las mismas reglas y sin rankings.</p><div class="eq-info">' +
      App.modelo.equipos.map(function (e) {
        var i = info[e.nombre] || {}, prov = i.tipo === 'proveedor';
        return '<div class="eq-info-fila"><span class="eq-info-n">' + esc(e.nombre) + '</span><select data-cambio="eq-info" data-campo="tipo" data-e="' + esc(e.nombre) + '" aria-label="Tipo de ' + esc(e.nombre) + '"><option value="interno"' + (prov ? '' : ' selected') + '>Interno</option><option value="proveedor"' + (prov ? ' selected' : '') + '>Proveedor</option></select>' +
          '<input data-cambio="eq-info" data-campo="proveedor" data-e="' + esc(e.nombre) + '" value="' + esc(i.proveedor || '') + '" placeholder="Nombre del proveedor"' + (prov ? '' : ' disabled') + ' aria-label="Proveedor de ' + esc(e.nombre) + '">' +
          '<input data-cambio="eq-info" data-campo="area" data-e="' + esc(e.nombre) + '" value="' + esc(i.area || '') + '" placeholder="Área" aria-label="Área de ' + esc(e.nombre) + '"></div>';
      }).join('') + '</div></div>';
    var nIni = iniciativasActuales().length, nCtx = App.contexto ? App.contexto.documentos.length : 0;
    html += '<div class="tarjeta"><h3>Paquete de diagnóstico</h3><p class="muted small">Lo que se pasa a la IA del consultor: solo cifras agregadas. Nunca lleva títulos, descripciones, claves de ticket ni personas; la página lo comprueba antes de exportarlo. Incluye ' + nIni + ' iniciativa' + (nIni === 1 ? '' : 's') + ' y ' + nCtx + ' documento' + (nCtx === 1 ? '' : 's') + ' de contexto.</p>' +
      '<label class="check-linea"><input type="checkbox" data-cambio="paquete-alias"' + (c.paqueteAlias ? ' checked' : '') + '> Cambiar el nombre de los equipos por Equipo A, Equipo B…</label>' +
      '<p style="margin-top:8px"><button class="btn btn-sec btn-peq" data-accion="exportar-paquete">Exportar paquete</button></p></div>';
    html += '<div class="tarjeta"><h3>Textos de las páginas</h3><p class="muted small">Los títulos y explicaciones de cada vista se pueden cambiar haciendo clic sobre ellos.</p><button class="btn btn-sec btn-peq" data-accion="editar-textos">' + (App.editando ? 'Terminar de editar' : 'Editar textos') + '</button> <button class="btn-txt" data-accion="textos-originales">Volver a los textos originales</button> <button class="btn-txt" data-accion="ver-presentacion">Ver la presentación</button></div>';
    html += '<div class="tarjeta"><h3>Límites por equipo</h3><p class="muted small">Cada medida se puede ajustar por equipo desde su detalle (haz clic en la tarjeta de la medida). Límites personalizados ahora: ' + Object.keys(c.limites || {}).reduce(function (s, k) { return s + Object.keys(c.limites[k]).length; }, 0) + '.</p><button class="btn-txt" data-accion="limites-borrar">Quitar todos los límites personalizados</button></div>';
    html += '<div class="tarjeta"><h3>Fichero de configuración</h3><p class="muted small">Guárdalo en la carpeta configuracion para usarlo en otro ordenador o con el script de actualización.</p><p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sec btn-peq" data-accion="descargar-config">Descargar cliente.json</button><button class="btn btn-sec btn-peq" data-accion="cargar-config">Cargar cliente.json</button><button class="btn-txt" data-accion="borrar-config">Empezar de cero</button></p></div>';
    html += '<div class="tarjeta"><h3>Datos</h3><p class="muted small">Origen actual: ' + esc({ ficheros: 'ficheros elegidos a mano', carpeta: 'carpeta «' + (App.carpeta ? App.carpeta.name : '') + '»', datosjs: 'carpeta exports (datos.js del script)', ejemplo: 'datos de ejemplo' }[App.origen] || '') + '.</p><p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sec btn-peq" data-accion="cargar-ficheros">Cargar ficheros</button>' + (window.showDirectoryPicker ? '<button class="btn btn-sec btn-peq" data-accion="elegir-carpeta">Elegir carpeta</button>' : '') + '</p></div>';
    return html + '</div>';
  }


  // ---------- v1: diagnóstico completo (comparaciones, iniciativas, agentes y paquete) ----------
  function hayAgentReady() { return !!App.modelo && App.modelo.equipos.some(function (e) { return e.medidas.agent_readiness && e.medidas.agent_readiness.disponible; }); }
  function iniciativaValida(i) { return !!(i && i.id && i.nombre && i.fecha_inicio && i.equipos && i.equipos.length && i.medidas_objetivo && i.medidas_objetivo.length); }
  function iniciativasActuales() {
    var porId = {};
    (App.iniciativasCarpeta || []).forEach(function (i) { porId[i.id] = i; });
    ((App.cfg && App.cfg.iniciativas) || []).forEach(function (i) { porId[i.id] = i; });
    return Object.keys(porId).map(function (k) { return porId[k]; }).filter(iniciativaValida)
      .sort(function (a, b) { return a.fecha_inicio < b.fecha_inicio ? 1 : -1; });
  }
  function mesTexto(d) { return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1); }
  // Equipos del cliente con su tipo (interno o proveedor), área y FTE, tal como están en Ajustes
  function clienteActual() { return clienteDe(App.cfg, App.modelo); }
  function clienteDe(c, modelo) {
    c = c || {};
    var info = c.equiposInfo || {}, fte = c.fte || {}, orig = c.fteOrigen || {}, periodo = mesTexto(modelo.semanaFin);
    var lista = modelo.equipos.map(function (e) {
      var i = info[e.nombre] || {}, prov = i.tipo === 'proveedor';
      return { id: e.nombre, nombre: e.nombre, tipo: prov ? 'proveedor' : 'interno', proveedor: prov ? (i.proveedor || 'Proveedor sin nombre') : null, area: i.area || null,
        usa_sprints: true, fte: fte[e.nombre] ? [{ periodo: periodo, valor: fte[e.nombre], origen: orig[e.nombre] || 'declarado' }] : [], limites: (c.limites || {})[e.nombre] || {} };
    });
    return { version: 2, nombre: c.nombre || '', sector: c.sector || '', plataforma: 'jira', mapeoEstados: c.mapeoEstados || {}, equipos: { campo: c.campoEquipo || 'equipo', lista: lista }, objetivos: c.objetivos || [], medidas: c.medidas || [] };
  }
  function aliasActual() {
    if (!App.cfg || !App.cfg.paqueteAlias) return null;
    var a = {}, letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    App.modelo.equipos.forEach(function (e, i) { a[e.nombre] = 'Equipo ' + (letras[i] || (i + 1)); });
    return a;
  }
  function diagnostico() {
    if (App.diag && App.diag.modelo === App.modelo) return App.diag.r;
    var r = null;
    try {
      r = Nucleo.diagnosticar(App.lectura, clienteActual(), iniciativasActuales(), App.contexto, { config: cfgMotor(App.cfg), generado: new Date(), alias: aliasActual() || undefined });
    } catch (e) { if (window.console) console.error(e); }
    App.diag = { modelo: App.modelo, r: r };
    return r;
  }
  function cabVista(antetitulo, claveT, claveP) {
    return '<div class="cabecera cabecera-vista"><div><div class="antetitulo">' + esc(antetitulo) + '</div>' + editable('h1', claveT) + (claveP ? editable('p', claveP) : '') + '</div></div>';
  }
  function sinDiagnostico() { return '<div class="tarjeta"><p>No se pudo calcular esta vista con los datos actuales.</p></div>'; }

  // ---------- Comparar: internos frente a proveedores, entre proveedores y equipos de un área ----------
  var MEDIDAS_GRUPO = [
    ['plazo_p80', 'Plazo', 'Días para terminar 8 de cada 10 tareas.', 'dias'],
    ['retrabajo', 'Retrabajo', 'Parte de lo terminado que volvió atrás.', 'pct'],
    ['reabiertas', 'Reaperturas', 'Parte de lo terminado que se reabrió.', 'pct'],
    ['bloqueo', 'Tiempo bloqueado', 'Parte del tiempo de ciclo en estados de bloqueo.', 'pct'],
    ['arrastradas', 'Pasa de sprint', 'Parte de lo terminado que pasó por más de un sprint.', 'pct']
  ];
  var TAMANOS = [['pequena', 'Pequeñas (1 a 2 puntos)'], ['media', 'Medianas (3 a 5)'], ['grande', 'Grandes (8 o más)'], ['sin_estimar', 'Sin estimar']];
  function nombreComparacion(c) { return c.dimension === 'tipo' ? 'Internos y proveedores' : (c.dimension === 'proveedor' ? 'Entre proveedores' : 'Área ' + c.ambito); }
  function celdaGrupo(x, formato, peor) {
    if (!x || x.valor == null) return '<td class="mz-nd"><span class="muted small">' + esc(T('comparacion.pocosDatos')) + (x ? ' (' + x.n + ')' : '') + '</span></td>';
    return '<td' + (peor ? ' class="cg-peor"' : '') + '><span class="mz-b" title="' + x.n + ' tareas terminadas"><span class="mz-v">' + esc(F(x.valor, formato)) + '</span>' + (peor ? '<span class="est est-critico">Peor</span>' : '') + '</span></td>';
  }
  function pantallaComparacion(c, d) {
    var gs = c.grupos, rng = Motor.fechaCorta(c.desde) + ' al ' + Motor.fechaCorta(new Date(c.hasta.getTime() - 864e5));
    var peor = {}; c.diferencias.forEach(function (x) { peor[x.medida + '|' + x.peor] = x; });
    var cab = '<tr><th scope="col">Medida</th>' + gs.map(function (g) { return '<th scope="col"><span class="mz-h">' + esc(g.nombre) + '</span>' + (g.equipos.length === 1 && g.equipos[0] === g.nombre ? '' : '<span class="mz-sub">' + esc(g.equipos.join(', ')) + '</span>') + '</th>'; }).join('') + '</tr>';
    var filas = MEDIDAS_GRUPO.filter(function (m) { return c.medidas[m[0]] && c.medidas[m[0]].disponible; }).map(function (m) {
      var seg = c.medidas[m[0]].segmentos[0];
      return '<tr><th scope="row" title="' + esc(m[2]) + '"><span class="mz-h">' + esc(m[1]) + '</span></th>' + gs.map(function (g) { return celdaGrupo(seg.porGrupo[g.id], m[3], !!peor[m[0] + '|' + g.id]); }).join('') + '</tr>';
    }).join('');
    var pg = c.porGrupo;
    filas += '<tr><th scope="row" title="Días que lleva esperando lo pendiente sin empezar (mediana)."><span class="mz-h">Antigüedad del pendiente</span></th>' + gs.map(function (g) { var v = pg[g.id].antiguedadPendiente; return '<td>' + (v == null ? '<span class="muted small">Sin datos</span>' : '<span class="mz-v">' + esc(F(v, 'dias')) + '</span>') + '</td>'; }).join('') + '</tr>';
    filas += '<tr><th scope="row" title="Tareas terminadas al mes por persona equivalente. El FTE sale del contrato, de una declaración o de una estimación."><span class="mz-h">Throughput / FTE</span></th>' + gs.map(function (g) { var x = pg[g.id]; return '<td>' + (x.throughputFte == null ? '<span class="muted small">Falta FTE</span>' : '<span class="mz-v">' + esc(F(x.throughputFte, 'num')) + '</span> <span class="small muted">FTE ' + esc(x.fte.origen.join(' y ')) + '</span>') + '</td>'; }).join('') + '</tr>';
    filas += '<tr><th scope="row" title="Parte de los tickets nuevos que cumple al menos 4 de los 5 criterios."><span class="mz-h">Listo para agentes</span></th>' + gs.map(function (g) { var a = pg[g.id].agentReady; return '<td>' + (a.listos == null || a.tickets < Nucleo.MUESTRA_MINIMA ? '<span class="muted small">' + esc(T('comparacion.pocosDatos')) + '</span>' : '<span class="mz-v">' + esc(F(a.listos, 'pct')) + '</span>') + '</td>'; }).join('') + '</tr>';
    var reparto = '<div class="cg-reparto" title="La comparación se hace dentro de cada tamaño y tipo de tarea, así un reparto distinto no cambia la conclusión."><h3>Reparto del trabajo terminado, por tamaño</h3>' + gs.map(function (g) {
      var r = c.reparto[g.id].porTamano;
      return '<div class="cg-rep-fila"><span class="cg-rep-n">' + esc(g.nombre) + '</span><span class="cg-barra">' + TAMANOS.map(function (t, k) { var v = r[t[0]] || 0; return v ? '<i class="cg-t' + k + '" style="width:' + (v * 100).toFixed(1) + '%" title="' + esc(t[1]) + ': ' + Math.round(v * 100) + '%"></i>' : ''; }).join('') + '</span><span class="cg-rep-t small muted">' + pg[g.id].terminadas + ' tareas</span></div>';
    }).join('') + '<div class="leyenda">' + TAMANOS.map(function (t, k) { return '<span><i class="cg-t' + k + ' cg-dot"></i>' + esc(t[1]) + '</span>'; }).join('') + '</div></div>';
    var casos = d.casosGrupo.filter(function (x) { return x.dimension === c.dimension && x.ambito === c.ambito; });
    var listaCasos = casos.length ? '<div class="cg-casos">' + casos.map(function (x) {
      return '<div class="cg-caso ' + x.gravedad + '" title="Primer paso: ' + esc(C.casos[x.id].plan[0].paso) + '."><span class="est est-' + x.gravedad + '">' + ETQ[x.gravedad] + '</span><div><b>' + esc(C.casos[x.id].titulo) + '</b><p class="small">' + resaltar(x.evidencia.replace(/ Comparación: [^.]*\.$/, '')) + '</p></div></div>';
    }).join('') + '</div>' : '<p class="small muted">No hay diferencias claras entre estos grupos dentro del mismo tipo y tamaño de tarea.</p>';
    return '<div class="pantalla-cab"><h2>' + esc(nombreComparacion(c)) + '</h2><p>Lo terminado del ' + esc(rng) + '. «Peor»: peor dentro del mismo tipo y tamaño de tarea, con una diferencia clara.</p></div>' +
      '<div class="cg-rejilla"><div class="cg-izq"><div class="tabla-wrap matriz cg-tabla"><table><thead>' + cab + '</thead><tbody>' + filas + '</tbody></table></div>' + reparto + '</div>' +
      '<div class="cg-lado">' + listaCasos + '<p class="cg-aviso small muted">' + esc(T('comparacion.aviso')) + '</p></div></div>';
  }
  function vistaGrupos() {
    var cabeza = cabVista('Dirección · comparar con las mismas reglas', 'grupos.titulo', null);
    var d = diagnostico();
    if (!d) return cabeza + sinDiagnostico();
    if (!d.comparaciones.length) {
      return cabeza + '<div class="tarjeta vacio-bien"><div><b>Aún no hay grupos que comparar.</b><p class="small muted" style="margin:4px 0 10px">Marca en Ajustes qué equipos son de un proveedor y a qué área pertenece cada uno. Con dos grupos o más aparece la comparación.</p><button class="btn btn-peq" data-accion="vista" data-v="config">Ir a Ajustes</button></div></div>';
    }
    return pantallas('grupos', d.comparaciones.map(function (c, i) { return ['c' + i, nombreComparacion(c), function () { return pantallaComparacion(c, d); }]; }), cabeza);
  }

  // ---------- Iniciativas: antes y después, con los equipos que no participan como referencia ----------
  var NOMBRE_MEDIDA_INI = { ciclo: 'Tiempo de ciclo', total: 'Tiempo total', entregas: 'Entregas por semana', espera: 'Tiempo en espera', retrabajo: 'Retrabajo', errores: 'Proporción de errores', reabiertas: 'Reaperturas', bloqueo: 'Tiempo bloqueado', agent_readiness: 'Listo para agentes' };
  function veredicto(r) {
    if (!r.disponible) return ['sin', 'Aún sin datos'];
    if (r.enDireccionEsperada && r.confianza !== 'baja') return ['bien', 'Va en la dirección esperada'];
    if (r.enDireccionEsperada) return ['atencion', 'Apunta bien, pero aún no es claro'];
    return ['critico', 'Sin efecto claro'];
  }
  function tarjetaIniciativa(x) {
    var i = x.iniciativa, ev = x.evaluacion, propia = ((App.cfg && App.cfg.iniciativas) || []).some(function (y) { return y.id === i.id; });
    var res = ev.resultados.map(function (r) {
      var fmt = (Nucleo.MEDIDAS_INICIATIVA[r.medida] || {}).formato || 'num', v = veredicto(r);
      var cifras = r.disponible ? '<p class="ini-cifras"><b>' + esc(F(r.antes, fmt)) + ' → ' + esc(F(r.despues, fmt)) + '</b> en ' + esc(i.equipos.join(', ')) +
        (r.control ? '<span class="muted"> · resto de equipos: ' + esc(F(r.control.antes, fmt)) + ' → ' + esc(F(r.control.despues, fmt)) + '</span>' : '') + '</p>' +
        '<p class="small muted">Efecto estimado: ' + esc((r.efecto > 0 ? '+' : '') + F(r.efecto, fmt)) + ' · confianza ' + esc(r.confianza) + ' · ' + r.muestra.antes + ' y ' + r.muestra.despues + ' tareas</p>' : '<p class="small muted">' + esc(r.motivo || '') + '</p>';
      return '<div class="ini-res"><div class="ini-res-cab"><span>' + esc(NOMBRE_MEDIDA_INI[r.medida] || r.medida) + ' · ' + (r.direccion === 'bajar' ? 'debe bajar' : 'debe subir') + '</span><span class="est est-' + v[0] + '">' + esc(v[1]) + '</span></div>' + cifras + '</div>';
    }).join('');
    return '<div class="tarjeta ini"><div class="ini-cab"><h3>' + esc(i.nombre) + '</h3>' + (propia ? '<button class="btn-txt small" data-accion="ini-quitar" data-id="' + esc(i.id) + '">Quitar</button>' : '') + '</div>' +
      '<p class="small muted">Desde el ' + esc(Motor.fechaCorta(new Date(i.fecha_inicio + 'T00:00:00'))) + (i.efecto_esperado ? ' · Se espera: ' + esc(i.efecto_esperado) : '') + '</p>' + res + '</div>';
  }
  function formularioIniciativa() {
    var eqs = App.modelo.equipos.map(function (e) { return '<label class="ini-eq"><input type="checkbox" name="ini-eq" value="' + esc(e.nombre) + '"> ' + esc(e.nombre) + '</label>'; }).join('');
    var meds = Object.keys(Nucleo.MEDIDAS_INICIATIVA).filter(function (k) { return k !== 'agent_readiness' || hayAgentReady(); }).map(function (k) { return '<option value="' + k + '">' + esc(NOMBRE_MEDIDA_INI[k] || k) + '</option>'; }).join('');
    var casos = Object.keys(C.casos).map(function (k) { return '<option value="' + k + '">' + esc(C.casos[k].titulo) + '</option>'; }).join('');
    return '<div class="pantalla-cab"><h2>Registrar una iniciativa</h2><p>Con fecha de inicio y la medida que debe moverse. La herramienta compara las semanas de antes y de después, con dos semanas de margen, frente a los equipos que no participan.</p></div>' +
      '<form class="tarjeta ini-form" id="form-iniciativa"><label>Nombre<input name="nombre" required maxlength="90" placeholder="Por ejemplo: límite de trabajo en curso"></label>' +
      '<fieldset><legend>Equipos que participan</legend><div class="ini-eqs">' + eqs + '</div></fieldset>' +
      '<div class="ini-fila"><label>Empieza el<input type="date" name="inicio" required></label><label>Medida<select name="medida">' + meds + '</select></label><label>Debe<select name="direccion"><option value="bajar">bajar</option><option value="subir">subir</option></select></label></div>' +
      '<div class="ini-fila"><label class="ancho">Qué se espera<input name="efecto" maxlength="160" placeholder="Por ejemplo: un 30% menos en dos meses"></label><label>Sale del caso<select name="origen"><option value="propia">Iniciativa propia</option>' + casos + '</select></label></div>' +
      '<p><button class="btn" data-accion="ini-guardar">Guardar iniciativa</button> <span class="small muted">' + (App.carpeta ? 'Se guarda también en la carpeta iniciativas.' : (App.demo ? 'En la demo no se guarda.' : 'Se guarda en este navegador y en cliente.json.')) + '</span></p></form>';
  }
  function vistaIniciativas() {
    var cabeza = cabVista('Dirección · iniciativas de mejora', 'iniciativas.titulo', 'iniciativas.intro');
    var d = diagnostico();
    if (!d) return cabeza + sinDiagnostico();
    var lista = d.iniciativas;
    return pantallas('iniciativas', [
      ['lista', 'Iniciativas' + (lista.length ? ' (' + lista.length + ')' : ''), function () {
        if (!lista.length) return '<div class="tarjeta vacio-bien"><div><b>Aún no hay iniciativas registradas.</b><p class="small muted" style="margin:4px 0 10px">Registra la primera con su fecha de inicio y la medida que debe moverse.</p><button class="btn btn-peq" data-accion="pantalla" data-c="iniciativas" data-i="1">Registrar una iniciativa</button></div></div>';
        return '<div class="pantalla-cab"><h2>Qué está funcionando</h2><p>' + esc(T('iniciativa.aviso')) + '</p></div><div class="rejilla-2 ini-lista">' + lista.map(tarjetaIniciativa).join('') + '</div>';
      }],
      ['nueva', 'Registrar', formularioIniciativa]
    ], cabeza);
  }
  function guardarIniciativa() {
    var f = document.getElementById('form-iniciativa'); if (!f) return;
    var eqs = [].filter.call(f.querySelectorAll('input[name="ini-eq"]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
    var nombre = f.nombre.value.trim(), inicio = f.inicio.value;
    if (!nombre || !inicio || !eqs.length) { aviso('Pon nombre, fecha de inicio y al menos un equipo.'); return; }
    var id = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) + '-' + inicio;
    var ini = { id: id, nombre: nombre, descripcion: '', fecha_inicio: inicio, fecha_fin: null, equipos: eqs, medidas_objetivo: [{ medida: f.medida.value, direccion: f.direccion.value }],
      efecto_esperado: f.efecto.value.trim(), estado: 'en_curso', origen: f.origen.value, evaluacion: null, notas: '' };
    App.cfg.iniciativas = (App.cfg.iniciativas || []).filter(function (x) { return x.id !== id; }).concat([ini]);
    guardarCfg();
    if (!App.demo) escribirEnCarpeta('iniciativas', id + '.json', JSON.stringify(ini, null, 2));
    App.diag = null; App.pant.iniciativas = 0; render(); aviso('Iniciativa guardada.');
  }

  // ---------- Agentes: cuánto del trabajo nuevo podría hacer un agente sin preguntar ----------
  function vistaAgentes() {
    var cabeza = cabVista('Backlog · listo para agentes de IA', 'agentes.titulo', 'agentes.intro');
    var d = diagnostico();
    if (!d) return cabeza + sinDiagnostico();
    var ar = d.paquete.agent_readiness, nombres = Object.keys(ar.equipos).filter(function (n) { return ar.equipos[n].tickets > 0; }).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    var crit = Nucleo.CRITERIOS_AR, rub = Nucleo.RUBRICA;
    var casosEq = d.casosAgentReady, casosG = d.casosGrupo.filter(function (x) { return x.id === 'grupo_agent_ready'; });
    var pEquipos = function () {
      var filas = nombres.map(function (n) {
        var a = ar.equipos[n], v = a.listos || 0, est = v < 0.25 ? 'critico' : (v < 0.5 ? 'atencion' : 'bien');
        return '<div class="ag-fila"><span class="ag-n"><span class="mz-p mz-' + est + '"></span>' + esc(n) + '</span><span class="ag-pista"><i class="ag-' + est + '" style="width:' + Math.round(v * 100) + '%"></i></span><span class="ag-v"><b>' + Math.round(v * 100) + '%</b> listos</span><span class="ag-i small muted">índice ' + esc(F(a.indiceMedio, 'dec')) + ' de 5 · ' + a.tickets + ' tickets</span></div>';
      }).join('');
      var caja = function (grav, titulo, texto) { return '<div class="cg-caso ' + grav + '"><span class="est est-' + grav + '">' + ETQ[grav] + '</span><div><b>' + esc(titulo) + '</b><p class="small">' + resaltar(texto) + '</p></div></div>'; };
      var avisos = casosG.filter(function (x) { return x.dimension !== 'area'; }).map(function (x) { return caja(x.gravedad, C.casos[x.id].titulo, x.evidencia.replace(/ Comparación: [^.]*\.$/, '')); }).join('');
      if (casosEq.length) {
        var grav = casosEq.some(function (x) { return x.gravedad === 'critico'; }) ? 'critico' : 'atencion';
        avisos += caja(grav, C.casos.backlog_no_listo.titulo, 'Menos de la mitad listo en ' + listaNombres(casosEq.map(function (x) { return x.equipo + ' (' + Math.round(x.datos.listos * 100) + '%)'; })) + '. Primer paso: ' + C.casos.backlog_no_listo.plan[0].paso.toLowerCase() + '.');
      }
      return '<div class="pantalla-cab"><h2>Tickets listos para un agente</h2><p>' + esc(rub.definicion) + ' Listo: cumple ' + rub.listoDesde + ' de los 5 criterios. Tickets de las últimas 12 semanas.</p></div>' +
        '<div class="cg-rejilla"><div class="tarjeta ag-lista">' + filas + '</div><div class="cg-lado">' + (avisos ? '<div class="cg-casos">' + avisos + '</div>' : '') + '<p class="small muted">' + esc(T('agentes.aviso')) + '</p></div></div>';
    };
    var pCriterios = function () {
      var cab = '<tr><th scope="col">Criterio</th>' + nombres.map(function (n) { return '<th scope="col"><span class="mz-h">' + esc(n) + '</span></th>'; }).join('') + '</tr>';
      var filas = crit.map(function (k) {
        return '<tr><th scope="row"><span class="mz-h">' + esc(rub.criterios[k].nombre) + '</span><span class="mz-sub">' + esc(rub.criterios[k].como) + '</span></th>' + nombres.map(function (n) {
          var v = ar.equipos[n].porCriterio[k]; if (v == null) return '<td class="mz-nd">s/d</td>';
          var est = v < 0.5 ? 'critico' : (v < 0.75 ? 'atencion' : 'bien');
          return '<td><span class="mz-b"><span class="mz-p mz-' + est + '"></span><span class="mz-v">' + Math.round(v * 100) + '%</span></span></td>';
        }).join('') + '</tr>';
      }).join('');
      return '<div class="pantalla-cab"><h2>Qué criterio falla más</h2><p>Parte de los tickets de cada equipo que cumple cada criterio. El que más falla es el primer paso para preparar el backlog.</p></div><div class="tabla-wrap matriz ag-tabla"><table><thead>' + cab + '</thead><tbody>' + filas + '</tbody></table></div>';
    };
    return pantallas('agentes', [['equipos', 'Por equipo', pEquipos], ['criterios', 'Qué falla más', pCriterios]], cabeza);
  }

  // ---------- paquete de diagnóstico ----------
  function exportarPaquete() {
    ocupado(true);
    setTimeout(function () {
      App.diag = null;
      var d = diagnostico(); ocupado(false);
      if (!d) { aviso('No se pudo calcular el diagnóstico.'); return; }
      var nombres = App.cfg && App.cfg.paqueteAlias ? App.modelo.equipos.map(function (e) { return e.nombre; }) : [];
      var problemas = Nucleo.comprobarPaquete(d.paquete, { nombresProhibidos: nombres });
      if (problemas.length) { aviso('No se exporta: ' + problemas[0]); if (window.console) console.warn(problemas); return; }
      var nombre = 'paquete-diagnostico-' + new Date().toISOString().slice(0, 10) + '.json', texto = JSON.stringify(d.paquete, null, 1);
      escribirEnCarpeta('diagnostico', nombre, texto).then(function (ok) { if (ok) aviso('Paquete guardado en la carpeta diagnostico.'); else descargar(nombre, texto); });
    }, 10);
  }

  // ---------- presentación: seis pantallas antes de la herramienta ----------
  var ICO_GRANDE = {
    subir: '<span class="ico-grande" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/></svg></span>'
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
  var DIAPOS = [['portada', 'Portada'], ['hoy', 'Cómo se hace hoy'], ['mercado', 'Qué hay en el mercado'], ['cambia', 'Qué cambia'], ['como', 'Cómo funciona'], ['siguiente', 'Lo nuevo']];
  function presentacion() {
    var i = Math.max(0, Math.min(App.diap, DIAPOS.length - 1)); App.diap = i;
    var cuerpo = { portada: diapoPortada, hoy: diapoHoy, mercado: diapoMercado, cambia: diapoCambia, como: diapoComo, siguiente: diapoSiguiente }[DIAPOS[i][0]]();
    var nav = '<nav class="pres-nav" aria-label="Presentación"><button class="btn-txt pres-flecha" data-accion="diap-mover" data-d="-1"' + (i === 0 ? ' disabled' : '') + '>' + FLECHA.izq + '<span>Anterior</span></button>' +
      '<ol class="pres-puntos">' + DIAPOS.map(function (d, k) { return '<li><button data-accion="diap" data-i="' + k + '" aria-current="' + (k === i) + '"><span class="pp-n">0' + (k + 1) + '</span><span class="pp-t">' + esc(d[1]) + '</span></button></li>'; }).join('') + '</ol>' +
      (i < DIAPOS.length - 1 ? '<button class="btn-txt pres-flecha" data-accion="diap-mover" data-d="1"><span>Siguiente</span>' + FLECHA.dcha + '</button>' : '<button class="btn btn-peq" data-accion="ver-demo">Ver la demo</button>') + '</nav>';
    return '<div class="presentacion"><section class="diapo diapo-' + DIAPOS[i][0] + '" aria-label="' + esc(DIAPOS[i][1]) + '"><div class="diapo-in">' + cuerpo + '</div></section>' + nav + '</div>';
  }
  function cabDiapo(n, antetitulo, clave) { return '<div class="antetitulo">' + n + ' · ' + esc(antetitulo) + '</div>' + editable('h1', clave, 'diapo-h'); }
  function botonesEntrada() {
    return '<div class="pres-botones"><button class="btn btn-grande" data-accion="ver-demo">Ver la demo</button><button class="btn btn-sec btn-grande" data-accion="empezar">Empezar con mis datos</button></div>';
  }

  function diapoPortada() {
    return '<div class="portada-pres"><div class="pp-texto"><div class="antetitulo">Capgemini Invent · Servicio de medición de equipos de desarrollo</div>' +
      '<h1 class="pres-claim">' + esc(T('pres.claim')).replace(esc(T('pres.claim.destacado')), '<em>' + esc(T('pres.claim.destacado')) + '</em>') + '</h1>' +
      editable('p', 'pres.apoyo', 'pres-apoyo') + editable('p', 'pres.comprador', 'pres-apoyo pres-comprador') + botonesEntrada() +
      '<ul class="pres-promesas"><li>' + icp('equipo') + '<span><b>Mide equipos, nunca personas.</b> No se lee quién hace cada tarea.</span></li>' +
      '<li>' + icp('espejo') + '<span><b>Cada equipo, contra sí mismo.</b> Sin rankings entre equipos que hacen cosas distintas.</span></li>' +
      '<li>' + icp('candado') + '<span><b>Tus datos no salen de tu ordenador.</b> Un fichero que se abre en el navegador.</span></li></ul></div>' +
      '<div class="pp-visual"><div class="previa" id="previa" data-accion="ver-demo" role="button" tabindex="0" aria-label="Ver la demo con datos de ejemplo"><div class="previa-in" id="previa-in"></div></div>' +
      '<p class="previa-pie">Así se ve el informe de un equipo, con datos de ejemplo. Pulsa para abrir la demo.</p></div></div>';
  }
  // La vista previa de la portada es el informe real de un equipo de la demo, calculado al vuelo
  function prepararPrevia() {
    var caja = document.getElementById('previa-in'); if (!caja) return;
    var pintar = function () {
      if (App._previaHtml == null) {
        var est = estadoDemo();
        App._previaHtml = est ? conDemo(est, function () { return portada(equipoDestacado()); }) : '';
      }
      if (!App._previaHtml) { var p = document.getElementById('previa'); if (p) p.parentNode.hidden = true; return; }
      caja.innerHTML = App._previaHtml;
      ajustarPrevia();
    };
    if (App._previaHtml != null) pintar(); else setTimeout(pintar, 30);
  }
  function ajustarPrevia() {
    var caja = document.getElementById('previa-in'), marco = document.getElementById('previa');
    if (!caja || !marco) return;
    var esc_ = marco.clientWidth / caja.offsetWidth;
    caja.style.transform = 'scale(' + esc_ + ')';
    marco.style.height = Math.ceil(caja.offsetHeight * esc_) + 'px';
  }

  function diapoHoy() {
    var paso = function (herr, txt, tag, manual) {
      return '<li class="cadena-paso' + (manual ? ' manual' : '') + '"><span class="cp-herr">' + esc(herr) + '</span><b>' + esc(txt) + '</b><span class="cp-tag">' + esc(tag) + '</span></li>';
    };
    return cabDiapo('02', 'Cómo se hace hoy', 'pres.hoy') + editable('p', 'pres.hoy.intro', 'diapo-intro') +
      '<ol class="cadena">' + paso('Jira', 'Exportar las tareas', 'Cada semana', false) + paso('Excel', 'Limpiar, cruzar y aplicar reglas', 'A mano', true) +
      paso('Power BI', 'Refrescar el modelo', 'Permisos y conexiones', false) + paso('Excel', 'Sacar las cifras otra vez', 'A mano', true) + paso('Informe', 'Contar qué ha pasado', 'A mano', true) + '</ol>' +
      '<div class="consecuencias">' +
      '<div class="consecuencia">' + icp('reloj') + '<h3>Se va el tiempo en montar, no en decidir</h3><p>Cada semana alguien copia, pega y cuadra cifras antes de poder hablar de lo importante.</p></div>' +
      '<div class="consecuencia">' + icp('pregunta') + '<h3>Las cifras no dicen qué hacer</h3><p>El tablero enseña cómo va todo, pero no qué está mal, por qué ni qué hacer con ello.</p></div>' +
      '<div class="consecuencia">' + icp('escudo') + '<h3>Nadie se fía del todo</h3><p>Cada paso a mano es un sitio donde una cifra puede cambiar. Si no cuadra, se discute el dato y no el problema.</p></div></div>';
  }

  function diapoMercado() {
    var op = function (nombre, resuelve, falta) {
      return '<article class="opcion-mercado"><h3>' + esc(nombre) + '</h3><div class="om-fila om-si"><span class="om-k">Resuelve</span><p>' + esc(resuelve) + '</p></div><div class="om-fila om-no"><span class="om-k">Deja pendiente</span><p>' + esc(falta) + '</p></div></article>';
    };
    return cabDiapo('03', 'Qué hay en el mercado', 'pres.mercado') + editable('p', 'pres.mercado.intro', 'diapo-intro') +
      '<div class="mercado">' +
      op('Informes de Jira', 'Sprint, velocidad y flujo de cada tablero, sin coste añadido.', 'La visión de todos los equipos, qué hacer y si los datos son fiables.') +
      op('Analítica de Atlassian', 'Cruzar varios proyectos y montar paneles propios.', 'Va en el plan Enterprise de Jira Cloud. Cada consulta se construye y la lectura queda en tu mano.') +
      op('Plataformas de métricas de ingeniería', 'Métricas de entrega completas, uniendo Jira con el código.', 'Semanas de integración, licencias por desarrollador y vistas por persona que hay que gobernar.') +
      op('Power BI a medida', 'Un tablero hecho a la carta para el cliente.', 'Consultor, permisos y conexiones. Cada cambio vuelve al equipo de BI y la interpretación queda en el cliente.') +
      op('Consultoría de medición', 'Un marco y una conversación sobre cómo trabajar mejor.', 'Cuando termina, no queda una herramienta que el equipo use cada semana.') +
      '</div><div class="hueco"><span class="hueco-k">El hueco que cubre Easy Performance</span><ul>' +
      '<li>' + icp('check') + 'Las mismas definiciones para todos los equipos, internos y proveedores</li><li>' + icp('check') + 'Por equipo, nunca por persona</li>' +
      '<li>' + icp('check') + 'Dice qué hacer, con un plan para cada caso y un consultor que lo sigue</li><li>' + icp('check') + 'Avisa cuando los datos no son fiables</li></ul></div>' +
      '<p class="nota-fuentes">Categorías de mercado, no productos concretos. Fuentes: documentación de Atlassian y de fabricantes de métricas de ingeniería, octubre de 2026.</p>';
  }

  function diapoCambia() {
    var chip = function (t, cl) { return '<li class="chip-flujo' + (cl ? ' ' + cl : '') + '">' + esc(t) + '</li>'; };
    var fila = function (fase, antes, ahora) { return '<tr><th scope="row">' + esc(fase) + '</th><td>' + esc(antes) + '</td><td>' + esc(ahora) + '</td></tr>'; };
    return cabDiapo('04', 'Qué cambia', 'pres.cambia') +
      '<div class="flujos"><div class="flujo"><span class="flujo-k">Cada semana, hoy</span><ol>' + chip('Exportar') + chip('Limpiar en Excel', 'manual') + chip('Refrescar Power BI') + chip('Sacar cifras a Excel', 'manual') + chip('Redactar el informe', 'manual') + '</ol></div>' +
      '<div class="flujo flujo-nuevo"><span class="flujo-k">Cada semana, con Easy Performance</span><ol>' + chip('Exportar') + chip('Dejar el fichero en la carpeta') + chip('Pulsar Actualizar', 'clave') + '</ol><span class="flujo-res">Tablero, avisos y plan, al momento</span></div></div>' +
      '<div class="tabla-wrap tabla-cambia"><table><thead><tr><th>Fase</th><th>Proyecto típico de BI</th><th>Easy Performance</th></tr></thead><tbody>' +
      fila('Decidir qué medir', 'Entrevistas del consultor con cada perfil', '7 objetivos y 16 medidas ya pensados; eliges en la puesta en marcha') +
      fila('Conectar los datos', 'Permisos en el tenant, pasarela y conexión a Jira', 'El fichero que ya exportas, o una carpeta') +
      fila('Construir el tablero', 'Diseño a medida, pantalla a pantalla', 'Una vista por perfil, lista al terminar la puesta en marcha') +
      fila('Interpretar', 'Queda en manos de quien lo mira', '14 casos frecuentes con causas probables y un plan de acción') +
      fila('Fiarse de los datos', 'Se descubre cuando una cifra no cuadra', 'Se comprueba al cargar, equipo por equipo') +
      fila('Ver el área entera', 'Otro informe que se monta aparte para dirección', 'El área en conjunto y lo que se repite entre equipos') +
      fila('Mantener', 'Peticiones al equipo de BI', 'Límites y textos los ajustas tú') +
      '</tbody></table></div>';
  }

  function diapoComo() {
    var p = function (n, ic, t, d) { return '<li class="paso-como"><span class="pc-n">' + n + '</span>' + icp(ic) + '<h3>' + esc(t) + '</h3><p>' + esc(d) + '</p></li>'; };
    return cabDiapo('05', 'Cómo funciona', 'pres.como') +
      '<ol class="pasos-como">' +
      p('1', 'fichero', 'Exporta de Jira, como hoy', 'Un CSV con todos los campos, o la carpeta donde ya dejáis los ficheros. Nada que instalar.') +
      p('2', 'diana', 'Elige qué quieres mejorar', 'Objetivos escritos como los diría tu equipo. Te proponemos los que ya se ven en tus datos.') +
      p('3', 'plan', 'Recibe el tablero y un plan', 'Lo que necesita atención, por qué y qué hacer, con las tareas de Jira detrás de cada cifra.') + '</ol>' +
      '<div class="semana"><b>Después, cada semana:</b> exporta de Jira como siempre, deja el fichero en la carpeta y pulsa Actualizar.</div>' +
      '<div class="servicio">' + icp('equipo') + '<div><b>Es un servicio con herramienta, no una licencia.</b><p>Un consultor de Capgemini acuerda las definiciones con tus equipos, hace el primer diagnóstico y sigue contigo las iniciativas de mejora, mes a mes.</p></div></div>' +
      botonesEntrada();
  }

  function diapoSiguiente() {
    var c = function (ic, t, d) { return '<div class="consecuencia">' + icp(ic) + '<h3>' + esc(t) + '</h3><p>' + esc(d) + '</p></div>'; };
    return cabDiapo('06', 'Lo nuevo', 'pres.siguiente') + editable('p', 'pres.siguiente.intro', 'diapo-intro') +
      '<div class="consecuencias">' +
      c('espejo', 'Internos frente a proveedores', 'Las mismas medidas para equipos propios y de proveedores, comparadas solo en lo comparable: plazo, cumplimiento del compromiso, calidad. Nunca en volumen bruto ni por persona.') +
      c('diana', 'Iniciativas con su efecto', 'Cada acción de mejora se registra con fecha y medida objetivo. La herramienta enseña el antes y el después, y si merece seguir.') +
      c('plan', 'Backlog listo para agentes de IA', 'Un índice por equipo de cuántas tareas podría completar un agente sin preguntar: descripción, criterios de aceptación, alcance acotado, referencias.') +
      '</div>' + botonesEntrada();
  }

  // ---------- demo con datos de ejemplo ----------
  // Se calcula una vez con la configuración recomendada y no se guarda: no pisa la configuración real.
  function estadoDemo() {
    if (App._demoEstado !== undefined) return App._demoEstado;
    var t = (document.getElementById('demo-csv') || {}).textContent || '';
    if (!t.trim()) return (App._demoEstado = null);
    var bk = { tareas: App.tareas, informe: App.informe, lectura: App.lectura, det: App.det, borrador: App.borrador, pre: App.pre };
    try {
      var r = Motor.ingerir([{ nombre: 'datos-de-ejemplo.csv', texto: t }]);
      App.tareas = r.tareas; App.informe = r.informe; App.lectura = r.lectura; App.det = Motor.detectar(r.tareas, r.informe);
      App.borrador = borradorInicial(null); calcularPre();
      // En la demo, los tres objetivos con más señales, para que cada equipo enseñe su problema
      // Se toma el objetivo del caso más grave de cada equipo; si sobra hueco, los de más señales
      var fijo = {}; C.objetivos.forEach(function (o) { if (o.fijo) fijo[o.id] = 1; });
      var objs = [], orden = { critico: 0, atencion: 1 };
      App.pre.equipos.forEach(function (eq) {
        var c = eq.casos.slice().sort(function (x, y) { return orden[x.gravedad] - orden[y.gravedad]; })
          .filter(function (x) { return (C.casos[x.id].objetivos || []).some(function (o) { return !fijo[o]; }); })[0];
        var o = c && C.casos[c.id].objetivos.filter(function (x) { return !fijo[x]; })[0];
        if (o && objs.indexOf(o) < 0 && objs.length < 3) objs.push(o);
      });
      var sen = señalesPorObjetivo();
      C.objetivos.filter(function (o) { return !o.fijo && sen[o.id].puntos > 0; }).sort(function (a, b) { return sen[b.id].puntos - sen[a.id].puntos; })
        .forEach(function (o) { if (objs.length < 3 && objs.indexOf(o.id) < 0) objs.push(o.id); });
      App.borrador.objetivos = objs.length ? objs : objetivosRecomendados();
      App.borrador.medidas = medidasRecomendadas(App.borrador.objetivos);
      var cfg = Object.assign({ version: 1, demo: true }, App.borrador);
      // Cliente de ejemplo: equipos internos y de proveedores, FTE con su origen, iniciativas y contexto
      var dc = {}; try { dc = JSON.parse((document.getElementById('demo-cliente') || {}).textContent || '{}'); } catch (x) { dc = {}; }
      cfg.fte = {}; cfg.fteOrigen = {}; (cfg.equipos || []).forEach(function (e) { if (dc.fte && dc.fte[e]) { cfg.fte[e] = dc.fte[e]; cfg.fteOrigen[e] = (dc.fteOrigen || {})[e] || 'declarado'; } });
      cfg.equiposInfo = dc.equiposInfo || {}; cfg.sector = dc.sector || ''; cfg.iniciativas = dc.iniciativas || [];
      delete cfg._objetivosMedidas;
      ['limites', 'textos', 'noAplica', 'planHecho'].forEach(function (k) { cfg[k] = cfg[k] || {}; });
      App._demoEstado = { tareas: App.tareas, informe: App.informe, lectura: App.lectura, det: App.det, cfg: cfg, contexto: dc.contexto || null, modelo: Motor.calcular(App.tareas, App.det, cfgMotor(cfg)) };
    } catch (e) { if (window.console) console.error(e); App._demoEstado = null; }
    Object.keys(bk).forEach(function (k) { App[k] = bk[k]; });
    return App._demoEstado;
  }
  // Ejecuta fn como si la demo estuviera cargada y deja todo como estaba
  function conDemo(est, fn) {
    var bk = { cfg: App.cfg, modelo: App.modelo, onboarding: App.onboarding, borrador: App.borrador, editando: App.editando };
    App.cfg = est.cfg; App.modelo = est.modelo; App.onboarding = false; App.editando = false;
    try { return fn(); } finally { Object.keys(bk).forEach(function (k) { App[k] = bk[k]; }); }
  }
  // El equipo con el que se abre la demo: el primero, en el orden de siempre, con un caso crítico
  function equipoDestacado() {
    var obj = casosDeObjetivos();
    return App.modelo.equipos.filter(function (e) { return e.casos.some(function (c) { return obj[c.id] && c.gravedad === 'critico'; }); })[0] || App.modelo.equipos[0];
  }
  function verDemo() {
    var est = estadoDemo();
    if (!est) { aviso('Esta copia no incluye datos de ejemplo.'); return; }
    if (!App.demo) {
      App.cfgReal = App.cfg;
      App.estadoReal = { tareas: App.tareas, informe: App.informe, lectura: App.lectura, det: App.det, modelo: App.modelo, origen: App.origen, borrador: App.borrador, onboarding: App.onboarding, paso: App.paso, vista: App.vista, equipo: App.equipo, pre: App.pre, contexto: App.contexto, iniciativasCarpeta: App.iniciativasCarpeta };
    }
    App.demo = true; App.presentacion = false; App.onboarding = false; App.editando = false;
    App.tareas = est.tareas; App.informe = est.informe; App.lectura = est.lectura; App.det = est.det; App.origen = 'ejemplo'; App.contexto = est.contexto; App.iniciativasCarpeta = []; App.diag = null;
    App.cfg = JSON.parse(JSON.stringify(est.cfg)); recalcular();
    App.vista = 'equipo'; App.equipo = equipoDestacado().nombre; App.pant = {}; App.casoSel = {}; App.grafSel = {};
    render(); window.scrollTo(0, 0);
  }
  function salirDemo() {
    App.demo = false; App.cfg = App.cfgReal || leerLocal() || null; App.cfgReal = null; App.pant = {}; App.casoSel = {}; App.grafSel = {};
    var r = App.estadoReal || {}; App.estadoReal = null;
    ['tareas', 'informe', 'lectura', 'det', 'modelo', 'origen', 'borrador', 'pre', 'vista', 'equipo', 'contexto'].forEach(function (k) { App[k] = r[k] != null ? r[k] : null; });
    App.iniciativasCarpeta = r.iniciativasCarpeta || []; App.diag = null;
    App.onboarding = r.onboarding != null ? r.onboarding : true; App.paso = r.paso || 1;
    if (!App.vista) App.vista = 'equipo';
    if (App.modelo && App.cfg) recalcular();
  }
  function empezar() {
    if (App.demo) salirDemo();
    App.presentacion = false;
    if (App.modelo && App.cfg && !App.onboarding) { render(); return; }
    if (App.det && App.tareas) { if (!App.borrador) App.borrador = borradorInicial(App.cfg); App.onboarding = true; }
    else { App.onboarding = true; App.paso = 1; App.det = null; }
    render(); window.scrollTo(0, 0);
  }
  function bandaDemo() {
    return '<div class="banda-demo no-imprimir"><span><b>Demo con datos de ejemplo:</b> un banco ficticio, dos equipos internos y dos de proveedores, un año de historia.</span>' +
      '<span class="bd-acc"><button class="btn-txt" data-accion="ver-presentacion">Volver a la presentación</button><button class="btn btn-peq" data-accion="empezar">Empezar con mis datos</button></span></div>';
  }

  // ---------- acciones ----------
  function guardarCfg() {
    if (App.demo) return; // la demo vive solo en memoria
    guardarLocal(App.cfg);
    escribirEnCarpeta('configuracion', 'cliente.json', JSON.stringify(App.cfg, null, 2));
  }
  function descargar(nombre, texto, tipo) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: tipo || 'application/json' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function terminar() {
    var b = App.borrador;
    delete b._objetivosMedidas; delete b.estadosCambiados;
    App.cfg = Object.assign({ version: 1, creada: new Date().toISOString() }, b, { actualizada: new Date().toISOString() });
    guardarCfg(); recalcular();
    App.onboarding = false; App.vista = 'equipo';
    App.equipo = App.modelo.equipos.length ? App.modelo.equipos[0].nombre : null;
    render(); window.scrollTo(0, 0);
    aviso('Configuración guardada.');
  }
  function siguiente() {
    if (App.paso === 1 && !App.det) return;
    if (App.paso === 2 && opcion(App.borrador.campoEquipo).id !== 'todos' && !App.borrador.equipos.length) { aviso('Elige al menos un equipo.'); return; }
    if (App.paso === 2 || App.paso === 3) calcularPre();
    if (App.paso === 5 && !App.borrador.objetivos.length) { aviso('Elige al menos un objetivo.'); return; }
    if (App.paso === 6 && !App.borrador.medidas.length) { aviso('Elige al menos una medida.'); return; }
    App.paso = Math.min(PASOS.length, App.paso + 1); render(); window.scrollTo(0, 0);
  }
  var ACC = {
    'cargar-ficheros': function () { document.getElementById('entrada-ficheros').click(); },
    'cargar-otros': function () { App.onboarding = true; App.paso = 1; App.det = null; App.tareas = null; App.modelo = null; render(); },
    'elegir-carpeta': elegirCarpeta,
    'leer-carpeta': function () { if (App.carpeta) leerCarpeta(App.carpeta); },
    'ejemplo': function () { if (App.demo) salirDemo(); cargarEjemplo(); },
    'ver-demo': verDemo,
    'empezar': empezar,
    'saltar-presentacion': empezar,
    'ver-presentacion': function () { App.presentacion = true; App.diap = 0; App.editando = false; render(); window.scrollTo(0, 0); },
    'diap': function (el) { App.diap = +el.getAttribute('data-i'); render(); },
    'diap-mover': function (el) { App.diap = Math.max(0, Math.min(DIAPOS.length - 1, App.diap + (+el.getAttribute('data-d')))); render(); },
    'pantalla': function (el) { App.pant[el.getAttribute('data-c')] = +el.getAttribute('data-i'); render(); },
    'pantalla-mover': function (el) { moverPantalla(+el.getAttribute('data-d')); },
    'ir-caso': function (el) { App.casoSel[equipoActual().nombre] = el.getAttribute('data-id'); App.pant.equipo = 1; render(); },
    'caso': function (el) { App.casoSel[equipoActual().nombre] = el.getAttribute('data-id'); render(); },
    'graf': function (el) { App.grafSel[el.getAttribute('data-k') || equipoActual().nombre] = el.getAttribute('data-m'); render(); },
    'area-kpi': function (el) { App.grafSel.__areaK = el.getAttribute('data-m'); irPantallaTodos('evolucion'); render(); },
    'medida-eq': function (el) { App.equipo = el.getAttribute('data-e'); App.medida = el.getAttribute('data-m'); App.vista = 'medida'; render(); window.scrollTo(0, 0); },
    'ir-caso-eq': function (el) { var e = el.getAttribute('data-e'); App.equipo = e; App.casoSel[e] = el.getAttribute('data-id'); App.vista = 'equipo'; App.pant.equipo = 1; render(); window.scrollTo(0, 0); },
    'siguiente': siguiente,
    'anterior': function () { App.paso = Math.max(1, App.paso - 1); render(); window.scrollTo(0, 0); },
    'aceptar-todo': function () {
      calcularPre();
      App.borrador.objetivos = App.borrador.objetivos || objetivosRecomendados();
      App.borrador.medidas = medidasRecomendadas(App.borrador.objetivos);
      App.borrador._objetivosMedidas = App.borrador.objetivos.slice().sort().join(',');
      App.paso = PASOS.length; render(); window.scrollTo(0, 0);
    },
    'terminar': terminar,
    'cancelar': function () { App.onboarding = false; recalcular(); render(); },
    'vista': function (el) { App.vista = el.getAttribute('data-v'); render(); window.scrollTo(0, 0); },
    'equipo': function (el) { App.equipo = el.getAttribute('data-e'); render(); },
    'ir-equipo': function (el) { App.equipo = el.getAttribute('data-e'); App.vista = 'equipo'; App.pant.equipo = 0; render(); window.scrollTo(0, 0); },
    'medida': function (el) { App.medida = el.getAttribute('data-m'); App.vista = 'medida'; render(); window.scrollTo(0, 0); },
    'actualizar': function () {
      if (App.carpeta) return leerCarpeta(App.carpeta);
      if (App.origen === 'datosjs') return location.reload();
      if (App.origen === 'ejemplo') return cargarEjemplo();
      document.getElementById('entrada-ficheros').click();
    },
    'imprimir': function () { window.print(); },
    'no-aplica': function (el) {
      var k = el.getAttribute('data-k');
      App.cfg.noAplica = App.cfg.noAplica || {};
      if (App.cfg.noAplica[k]) delete App.cfg.noAplica[k]; else App.cfg.noAplica[k] = true;
      guardarCfg(); render();
    },
    'ver-no-aplica': function () { App.verNoAplica = !App.verNoAplica; render(); },
    'rehacer': function (el) { App.borrador = borradorInicial(App.cfg); App.onboarding = true; App.paso = +el.getAttribute('data-paso') || 2; calcularPre(); render(); window.scrollTo(0, 0); },
    'definiciones': function (el) { generarDefiniciones(el.getAttribute('data-f')); },
    'descargar-config': function () { descargar('cliente.json', JSON.stringify(App.cfg || App.borrador, null, 2)); },
    'cargar-config': function () { document.getElementById('entrada-config').click(); },
    'borrar-config': function () {
      if (!confirm('Se borrará la configuración guardada en este navegador. ¿Seguir?')) return;
      borrarLocal(); App.cfg = null; App.borrador = borradorInicial(null); App.onboarding = true; App.paso = 1; render();
    },
    'editar-textos': function () { App.editando = !App.editando; render(); },
    'textos-originales': function () { App.cfg.textos = {}; guardarCfg(); render(); },
    'limite-auto': function (el) {
      var id = el.getAttribute('data-m'), eq = equipoActual().nombre;
      if (App.cfg.limites[eq]) delete App.cfg.limites[eq][id];
      guardarCfg(); recalcular(); render();
    },
    'limites-borrar': function () { App.cfg.limites = {}; guardarCfg(); recalcular(); render(); aviso('Límites personalizados quitados.'); },
    'ini-guardar': guardarIniciativa,
    'ini-quitar': function (el) {
      var id = el.getAttribute('data-id');
      App.cfg.iniciativas = (App.cfg.iniciativas || []).filter(function (x) { return x.id !== id; });
      guardarCfg(); App.diag = null; render(); aviso('Iniciativa quitada de la configuración.');
    },
    'exportar-paquete': exportarPaquete
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-accion]');
    if (!el) return;
    var f = ACC[el.getAttribute('data-accion')];
    if (f) { e.preventDefault(); f(el); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, tipo = el.getAttribute('data-cambio');
    if (el.id === 'entrada-ficheros') { cargarFicheros(el.files); el.value = ''; return; }
    if (el.id === 'entrada-config') {
      var f = el.files[0]; el.value = '';
      if (!f) return;
      f.text().then(function (t) {
        try { var c = JSON.parse(t); if (!c.medidas) throw new Error(); App.cfg = c; guardarLocal(c); if (App.tareas) { procesar(App.ficheros || [], App.origen); } aviso('Configuración cargada.'); }
        catch (x) { aviso('El fichero no es una configuración de Easy Performance.'); }
      });
      return;
    }
    if (!tipo) return;
    if (tipo === 'fte' || tipo === 'fte-origen' || tipo === 'eq-info') {
      // En el arranque se escribe en el borrador; con el tablero ya montado, en la configuración guardada
      var enArranque = App.onboarding, dest = enArranque ? App.borrador : App.cfg, en = el.getAttribute('data-e');
      if (tipo === 'fte') {
        var vf = String(el.value).replace(',', '.'), nf = vf === '' ? null : parseFloat(vf);
        dest.fte = dest.fte || {};
        if (nf == null || isNaN(nf) || nf <= 0) delete dest.fte[en]; else dest.fte[en] = nf;
      } else if (tipo === 'fte-origen') {
        dest.fteOrigen = dest.fteOrigen || {}; dest.fteOrigen[en] = el.value;
      } else {
        dest.equiposInfo = dest.equiposInfo || {};
        var inf = dest.equiposInfo[en] = dest.equiposInfo[en] || {};
        inf[el.getAttribute('data-campo')] = el.value.trim() || null;
      }
      var repintar = tipo === 'eq-info' && el.getAttribute('data-campo') === 'tipo';
      if (enArranque) App.pre = null;
      else { guardarCfg(); App.diag = null; if (tipo === 'fte') { recalcular(); repintar = true; } }
      if (repintar) { var y2 = window.scrollY; render(); window.scrollTo(0, y2); }
      return;
    }
    if (tipo === 'nombre-cliente') {
      var dn = App.onboarding ? App.borrador : App.cfg;
      dn.nombre = el.value.trim();
      if (!App.onboarding) guardarCfg();
      return;
    }
    if (tipo === 'paquete-alias') { App.cfg.paqueteAlias = el.checked; guardarCfg(); App.diag = null; return; }
    if (tipo === 'plan-paso') {
      // Se marca sin volver a pintar la página, para no cerrar lo que el usuario tenga abierto
      var kp = el.getAttribute('data-k');
      App.cfg.planHecho = App.cfg.planHecho || {};
      if (el.checked) App.cfg.planHecho[kp] = true; else delete App.cfg.planHecho[kp];
      guardarCfg();
      var li = el.closest('li'), ol = el.closest('ol');
      if (li) li.classList.toggle('hecho', el.checked);
      var cab = ol && ol.previousElementSibling && ol.previousElementSibling.querySelector('span');
      if (cab) cab.textContent = ol.querySelectorAll('input:checked').length + ' de ' + ol.querySelectorAll('input').length + ' pasos hechos';
      return;
    }
    var b = App.borrador;
    if (tipo === 'campo-equipo') { b.campoEquipo = el.value; b.equipos = equiposPorDefecto(el.value); App.pre = null; }
    else if (tipo === 'equipo-incluir') { var v = el.getAttribute('data-e'), i = b.equipos.indexOf(v); if (el.checked && i < 0) b.equipos.push(v); if (!el.checked && i >= 0) b.equipos.splice(i, 1); App.pre = null; }
    else if (tipo === 'estado-comun') { var ne = el.getAttribute('data-estado'); b.mapeoEstados[ne] = el.value; b.estadosCambiados = b.estadosCambiados || {}; b.estadosCambiados[ne] = true; App.pre = null; }
    else if (tipo === 'objetivo') {
      var o = el.getAttribute('data-o'), j = b.objetivos.indexOf(o);
      if (el.checked && j < 0) { if (b.objetivos.length >= 3) { el.checked = false; aviso('Elige como mucho tres objetivos: así el tablero se mantiene simple.'); return; } b.objetivos.push(o); }
      if (!el.checked && j >= 0) b.objetivos.splice(j, 1);
    }
    else if (tipo === 'medida-sel') { var m = el.getAttribute('data-m'), k = b.medidas.indexOf(m); if (el.checked && k < 0) b.medidas.push(m); if (!el.checked && k >= 0) b.medidas.splice(k, 1); b.medidas = C.ordenMedidas.filter(function (x) { return b.medidas.indexOf(x) >= 0; }); }
    else if (tipo === 'perfil') { var p = el.getAttribute('data-p'), q = b.perfiles.indexOf(p); if (el.checked && q < 0) b.perfiles.push(p); if (!el.checked && q >= 0) b.perfiles.splice(q, 1); }
    else if (tipo === 'grafico') { b.graficos[el.getAttribute('data-g')] = el.value; }
    else if (tipo === 'limite') {
      var id = el.getAttribute('data-m'), t = el.getAttribute('data-tipo'), eq = equipoActual().nombre, def = C.medidas[id];
      var val = el.value === '' ? null : parseFloat(String(el.value).replace(',', '.'));
      if (val != null && def.formato === 'pct') val = val / 100;
      App.cfg.limites[eq] = App.cfg.limites[eq] || {};
      App.cfg.limites[eq][id] = App.cfg.limites[eq][id] || {};
      App.cfg.limites[eq][id][t] = val;
      guardarCfg(); recalcular(); render(); return;
    }
    if (tipo !== 'limite') { var y = window.scrollY; render(); window.scrollTo(0, y); }
  });
  document.addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('editable') || !App.cfg) return;
    App.cfg.textos = App.cfg.textos || {};
    var txt = el.textContent.trim();
    if (txt && txt !== C.textos[el.getAttribute('data-t')]) App.cfg.textos[el.getAttribute('data-t')] = txt; else delete App.cfg.textos[el.getAttribute('data-t')];
    guardarCfg();
  });
  // arrastrar ficheros
  document.addEventListener('dragover', function (e) { e.preventDefault(); var z = document.getElementById('zona'); if (z) z.classList.add('encima'); });
  document.addEventListener('dragleave', function (e) { var z = document.getElementById('zona'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('encima'); });
  document.addEventListener('drop', function (e) { e.preventDefault(); var z = document.getElementById('zona'); if (z) z.classList.remove('encima'); if (e.dataTransfer && e.dataTransfer.files.length) cargarFicheros(e.dataTransfer.files); });
  // tooltips
  var tip = null;
  function mostrarTip(el, x, y) {
    tip = tip || document.getElementById('tip');
    tip.textContent = el.getAttribute('data-tip'); tip.hidden = false;
    var r = tip.getBoundingClientRect(), px = Math.min(x + 14, window.innerWidth - r.width - 8), py = y - r.height - 12;
    if (py < 8) py = y + 16;
    tip.style.left = Math.max(8, px) + 'px'; tip.style.top = py + 'px';
  }
  document.addEventListener('mousemove', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) mostrarTip(el, e.clientX, e.clientY); else if (tip) tip.hidden = true; });
  document.addEventListener('touchstart', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) { var t = e.touches[0]; mostrarTip(el, t.clientX, t.clientY); } else if (tip) tip.hidden = true; }, { passive: true });
  // Al imprimir se abren los desplegables para que el informe salga completo
  var cerrados = [];
  window.addEventListener('beforeprint', function () {
    if (App.modelo && !App.onboarding && !App.presentacion) { App.imprimiendo = true; render(); }
    cerrados = [].filter.call(document.querySelectorAll('details'), function (d) { return !d.open; }); cerrados.forEach(function (d) { d.open = true; });
  });
  window.addEventListener('afterprint', function () { cerrados = []; if (App.imprimiendo) { App.imprimiendo = false; render(); } });
  // Flechas del teclado: cambian de diapositiva o de pantalla
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var t = e.target, tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || t.isContentEditable) return;
    if ((e.key === 'Enter' || e.key === ' ') && t.id === 'previa') { e.preventDefault(); verDemo(); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var d = e.key === 'ArrowRight' ? 1 : -1;
    if (App.presentacion) { var n = Math.max(0, Math.min(DIAPOS.length - 1, App.diap + d)); if (n !== App.diap) { App.diap = n; render(); } e.preventDefault(); return; }
    if (moverPantalla(d)) e.preventDefault();
  });
  var anchoPrevio = window.innerWidth, tRes = null;
  window.addEventListener('resize', function () { clearTimeout(tRes); tRes = setTimeout(function () { ajustarPrevia(); if (Math.abs(window.innerWidth - anchoPrevio) > 40) { anchoPrevio = window.innerWidth; pintarGraficos(); } }, 150); });

  // ---------- arranque ----------
  function iniciar() {
    App.cfg = leerLocal() || window.EASY_PERFORMANCE_CONFIG || null;
    if (App.cfg) ['limites', 'textos', 'noAplica', 'planHecho'].forEach(function (k) { App.cfg[k] = App.cfg[k] || {}; });
    // Quien ya usa la herramienta entra directo; la primera vez se ve la presentación
    App.presentacion = !App.cfg;
    // Iniciativas y contexto que deja el script actualizar en exports/datos.js
    if (window.EASY_PERFORMANCE_INICIATIVAS) App.iniciativasCarpeta = [].concat(window.EASY_PERFORMANCE_INICIATIVAS).filter(iniciativaValida);
    if (window.EASY_PERFORMANCE_CONTEXTO && window.EASY_PERFORMANCE_CONTEXTO.documentos) App.contexto = window.EASY_PERFORMANCE_CONTEXTO;
    idbGet('carpeta').then(function (h) {
      App.carpeta = h;
      if (window.EASY_PERFORMANCE_EXPORTS && window.EASY_PERFORMANCE_EXPORTS.length) {
        var fs;
        try { fs = window.EASY_PERFORMANCE_EXPORTS.map(function (f) { return { nombre: f.nombre, texto: f.b64 != null ? desdeBase64(f.b64) : f.texto }; }); }
        catch (e) { aviso('No se pudo leer exports/datos.js. Vuelve a ejecutar actualizar.'); render(); return; }
        procesar(fs, 'datosjs');
      }
      else render();
    });
  }
  App.procesar = procesar; App.render = render; App.ACC = ACC; App.leerCarpeta = leerCarpeta; App.diagnostico = diagnostico;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
