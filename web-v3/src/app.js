/* easyperformance v3: estado, persistencia, carga de datos, recálculo, navegación y acciones.
   Las pantallas (kit.js, vistas-*.js, onboarding.js, cortes.js, asistente.js) leen S.vm y publican sus funciones en EP.vistas. */
(function () {
  const N = window.Nucleo, P = window.Puente, I = window.I18N;
  const t = I.t, tn = I.tn;

  // Espacio de datos: abierto como fichero (file://), cada carpeta tiene los suyos. Sin esto, todas las copias del HTML del
  // ordenador comparten configuración, iniciativas, ficheros y cortes, y dos clientes se mezclan. En una web, el sitio ya separa.
  const ESPACIO = (() => {
    try {
      if (location.protocol !== 'file:') return '';
      const carpeta = decodeURIComponent(location.pathname).replace(/[^/\\]*$/, '');
      let h = 0; for (let i = 0; i < carpeta.length; i++) h = (h * 31 + carpeta.charCodeAt(i)) | 0;
      return 'c' + (h >>> 0).toString(36);
    } catch (e) { return ''; }
  })();
  const conEspacio = (k) => (ESPACIO ? k + '@' + ESPACIO : k);
  const CLAVE_CFG_V2 = 'easyperformance.config.v2';       // la de la v2 (y la de antes de los espacios): se lee una vez y se pasa al espacio
  const CLAVE_PREFS_V3 = 'easyperformance.v3.prefs';
  const CLAVE_RECLAMADO = 'easyperformance.v3.reclamado'; // qué espacio se quedó con los datos de antes (solo uno)
  const CLAVE_CFG = conEspacio(CLAVE_CFG_V2);
  const CLAVE_PREFS = conEspacio(CLAVE_PREFS_V3);
  const CLAVE_IA = 'easyperformance.v3.ia';               // solo en sessionStorage
  const BASE_IDB = 'easyperformance-v3', NOMBRE_IDB = conEspacio(BASE_IDB);
  const PESTANA = Math.random().toString(36).slice(2);    // para no reaccionar a los avisos que manda esta misma pestaña

  const S = {
    lectura: null, det: null, ficheros: null, cfg: {}, r: null, vm: null, contextoDocs: null, extraIni: [],
    demo: false, real: null, onboarded: false, ob: { step: 'data' },
    role: 'direccion', team: null, teamCompare: false, view: 'resumen', drill: null,
    prefs: { byRole: {} }, dismissed: {}, recFilter: 'todos', recLevel: null, fuentesTab: 'ficheros', iniForm: null,
    ia: { modelo: N.IA.MODELO_POR_DEFECTO, clave: '' }, iaRecs: null, iaRecsDe: null, iaDescartadas: 0, iaImpacto: null, iaEstado: {}, iaError: {},
    narrativas: {}, presenting: false, slide: 0, error: null, carpeta: null, cargadoEn: null,
    // Versión de la configuración que se leyó o se escribió por última vez, e iniciativas quitadas en esta pestaña
    cfgVersion: null, iniQuitadas: [],
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
  /**
   * Guarda la configuración. Si otra pestaña la ha guardado desde que esta la leyó, no se pisa: sus iniciativas nuevas se
   * conservan (salvo las que esta pestaña ha quitado). Lo demás es lo que acaba de cambiar aquí.
   */
  function guardarCfg() {
    if (S.demo) return;
    const guardada = leerLocal(CLAVE_CFG);
    if (guardada && guardada.actualizada && guardada.actualizada !== S.cfgVersion) {
      const mias = Array.isArray(S.cfg.iniciativas) ? S.cfg.iniciativas : [], ids = mias.map((i) => i.id);
      const deOtra = (Array.isArray(guardada.iniciativas) ? guardada.iniciativas : []).filter((i) => ids.indexOf(i.id) < 0 && S.iniQuitadas.indexOf(i.id) < 0);
      if (deOtra.length) S.cfg.iniciativas = mias.concat(deOtra);
    }
    S.cfg.actualizada = new Date().toISOString();
    S.cfgVersion = S.cfg.actualizada;
    guardarLocal(CLAVE_CFG, S.cfg);
    if (EP.carpeta) EP.carpeta.escribir('configuracion', 'cliente.json', JSON.stringify(S.cfg, null, 2));
  }
  /** Preferencias de quien usa la página. En la demo no se guarda nada: lo que se toca ahí no pasa a los datos reales. */
  function guardarPrefs() {
    // En la demo solo se guardan el idioma y el modelo de IA, que no dependen de los datos
    if (S.demo) { const p = leerLocal(CLAVE_PREFS); if (p) guardarLocal(CLAVE_PREFS, Object.assign(p, { lang: I.lang, modelo: S.ia.modelo })); return; }
    guardarLocal(CLAVE_PREFS, { lang: I.lang, role: S.role, team: S.team, onboarded: S.onboarded, prefs: S.prefs, dismissed: S.dismissed, modelo: S.ia.modelo });
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
    S.cfgVersion = S.cfg.actualizada || null;
  }
  function guardarClave(clave) { S.ia.clave = clave || ''; try { if (S.ia.clave) sessionStorage.setItem(CLAVE_IA, S.ia.clave); else sessionStorage.removeItem(CLAVE_IA); } catch (e) { } }
  // Los ficheros cargados se guardan en este navegador (IndexedDB) para no tener que volver a cargarlos. Nunca salen de él.
  function idb(nombre) { return new Promise((res, rej) => { try { const q = indexedDB.open(nombre || NOMBRE_IDB, 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } }); }
  /** Lee, cambia y guarda una clave en una sola transacción: dos pestañas a la vez no se pisan. */
  async function idbActualizar(k, fn) {
    try {
      const db = await idb();
      let nuevo;
      await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv'), q = st.get(k);
        q.onsuccess = () => { nuevo = fn(q.result); st.put(nuevo, k); };
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      avisarPestanas('idb', k);
      return nuevo;
    } catch (e) { return null; }
  }
  async function idbSet(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); avisarPestanas('idb', k); } catch (e) { } }

  // ---------- varias pestañas ----------
  // Lo que guarda una pestaña lo ven las demás: la configuración por el evento "storage" y los ficheros y cortes por un canal.
  // Así una pestaña que se dejó abierta no pisa con su copia vieja lo que se ha hecho en otra.
  const canal = (() => { try { return new BroadcastChannel(NOMBRE_IDB); } catch (e) { return null; } })();
  function avisarPestanas(tipo, clave) { try { if (canal) canal.postMessage({ tipo, clave, de: PESTANA }); } catch (e) { } }
  function cfgDeOtraPestana() {
    const nueva = leerLocal(CLAVE_CFG) || {};
    if (S.demo) { if (S.real) S.real.cfg = nueva; return; }
    const lecturaDe = (c) => JSON.stringify([c.columnas || null, c.columnaEstimacion == null ? null : c.columnaEstimacion, c.columnaReparto || null]);
    const releer = lecturaDe(S.cfg) !== lecturaDe(nueva);
    S.cfg = nueva; S.cfgVersion = nueva.actualizada || null;
    // Si cambian las columnas elegidas, se vuelven a leer los ficheros; si no, basta con recalcular
    if (S.lectura) enSegundoPlano(() => { deOtraPestana = true; try { if (releer && S.ficheros) procesar(S.ficheros); else recalcular(); } finally { deOtraPestana = false; } render(); toast(t('pestanas.cambios')); });
  }
  window.addEventListener('storage', (e) => {
    // "Borrar todo" en otra pestaña: esta vuelve a empezar, para no volver a escribir lo que se ha borrado
    if ((e.key === CLAVE_CFG || e.key === CLAVE_PREFS) && e.newValue === null) { try { location.reload(); } catch (x) { } return; }
    if (e.key === CLAVE_CFG) cfgDeOtraPestana();
    if (e.key === CLAVE_PREFS) {
      const p = leerLocal(CLAVE_PREFS) || {}, destino = S.demo ? S.real : S;
      if (!destino) return;
      if (p.prefs && typeof p.prefs === 'object') destino.prefs = Object.assign({ byRole: {} }, p.prefs);
      if (p.dismissed) destino.dismissed = p.dismissed;
      if (!S.demo && S.vm) render();
    }
  });
  if (canal) canal.onmessage = (e) => {
    const m = e.data || {};
    if (m.de === PESTANA || m.tipo !== 'idb') return;
    if (m.clave === 'cortes' && EP.cortes) EP.cortes.releer().then(() => { if (S.vm) render(); });
    // Otra pestaña ha cargado datos nuevos: esta pasa a usarlos (si no está en la demo)
    if (m.clave === 'ficheros' && !S.demo && S.onboarded && S.vm) idbGet('ficheros').then((fs) => { if (fs && fs.length) enSegundoPlano(() => { Object.assign(S, { cargaPend: null, cargaBloqueada: null, pendienteGuardar: false }); if (procesar(fs)) { render(); toast(t('pestanas.datos')); } }); });
  };

  /**
   * Datos de antes de los espacios (una sola clave para todas las copias): se los queda el primer espacio que se abre
   * y no tiene nada propio. Los demás empiezan vacíos y pueden cargar una copia de la configuración.
   */
  async function migrarAEspacio() {
    if (!ESPACIO) return;
    // Una carpeta con su propio datos.js (carpeta compartida) es de un cliente concreto: no recoge datos de otro
    if (window.EASY_PERFORMANCE_EXPORTS || window.EASY_PERFORMANCE_CONFIG) return;
    let reclamado = null; try { reclamado = localStorage.getItem(CLAVE_RECLAMADO); } catch (e) { }
    if (reclamado && reclamado !== ESPACIO) return;
    const propio = leerLocal(CLAVE_CFG) || leerLocal(CLAVE_PREFS) || (await idbGet('ficheros'));
    if (!reclamado && propio) { try { localStorage.setItem(CLAVE_RECLAMADO, ESPACIO); } catch (e) { } return; }
    if (reclamado === ESPACIO) return;
    const cfg = leerLocal(CLAVE_CFG_V2), prefs = leerLocal(CLAVE_PREFS_V3);
    const [ficheros, cortes] = await Promise.all(['ficheros', 'cortes'].map((k) => idbGet(k, BASE_IDB)));
    if (!cfg && !prefs && !ficheros) return;
    if (cfg) guardarLocal(CLAVE_CFG, cfg);
    if (prefs) guardarLocal(CLAVE_PREFS, prefs);
    if (ficheros) await idbSet('ficheros', ficheros);
    if (cortes) await idbSet('cortes', cortes);
    // La carpeta compartida no se pasa: se vuelve a elegir, así nunca se escribe en la carpeta de otro cliente.
    // La copia de antes (ficheros de Jira incluidos) se borra; la configuración de la v2 se queda para la v2.
    try { localStorage.setItem(CLAVE_RECLAMADO, ESPACIO); localStorage.removeItem(CLAVE_PREFS_V3); indexedDB.deleteDatabase(BASE_IDB); } catch (e) { }
  }
  async function idbGet(k, nombre) { try { const db = await idb(nombre); return await new Promise((res, rej) => { const tx = db.transaction('kv', 'readonly'); const q = tx.objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }

  // ---------- cálculo ----------
  function recalcular() {
    S.r = P.diagnosticar(S.lectura, S.det, S.cfg, S.extraIni, S.contextoDocs);
    S.vm = P.construirVM(S.r, { lectura: S.lectura, det: S.det, cfg: S.cfg, descartadas: S.dismissed });
    if (!S.team || !S.vm.equipos.some((e) => e.nombre === S.team)) S.team = S.vm.equipos[0] ? S.vm.equipos[0].nombre : null;
    if (S.iaRecsDe && S.iaRecsDe !== S.lectura) { S.iaRecs = null; S.iaImpacto = null; S.iaRecsDe = null; }
    S.narrativas = {};
    guardarSiYaVale();
  }
  function descodificar(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  /** Lee los ficheros, detecta y calcula. Devuelve false si no hay tareas. */
  function procesar(ficheros) {
    // Columnas elegidas a mano y columna de estimación; el historial de estados, si la fuente lo da, se convierte en tiempos
    const lectura = N.completarDesdeHistorial(N.leerJira(ficheros, { columnas: S.demo ? undefined : S.cfg.columnas, columnaEstimacion: S.cfg.columnaEstimacion, columnaReparto: S.cfg.columnaReparto }));
    const pendientes = lectura.informe.columnasPendientes || [];
    if (!lectura.tareas.length) {
      // Falta una columna que hace falta: no se descarta el fichero, se pide elegirla a mano
      if (pendientes.length) { S.colPend = { ficheros, pendientes, abierto: true }; render(); return false; }
      toast(t('carga.sinTareas') + ' ' + ((lectura.informe.avisos[0] || {}).texto || ''), 'bad'); return false;
    }
    // Algún fichero no se ha podido leer: se avisa y se deja elegir sus columnas desde Fuentes
    S.colPend = pendientes.length ? { ficheros, pendientes, abierto: false } : null;
    if (pendientes.length) toast(tn('carga.pendientes', pendientes.length), 'bad');
    S.lectura = lectura; S.det = N.detectar(lectura); S.ficheros = ficheros; S.cargadoEn = new Date();
    if (P.migrarMapeo(S.cfg, S.det)) guardarCfg();
    if (P.migrarNombres(S.cfg, S.det)) guardarCfg();
    S.iaRecs = null; S.iaImpacto = null; S.iaRecsDe = null; S.recFilter = 'todos'; S.recLevel = null;
    recalcular();
    return true;
  }
  /** Un fichero a texto CSV: los CSV se leen tal cual; los Excel (.xlsx, .xls) y el Excel de Jira (HTML) se convierten. */
  async function leerFichero(f) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const formato = N.detectarFormato(bytes);
    if (formato === 'csv') return { nombre: f.name, texto: descodificar(bytes), formato };
    const h = await N.leerHoja(bytes);
    return { nombre: f.name, texto: N.aCsv(h.filas), formato, hoja: h.hoja, hojas: h.hojas };
  }
  /** Lo que pasa después de leer bien unos ficheros: se guardan en el navegador, corte y a la página que toca. */
  function trasCargar(fs) {
    idbSet('ficheros', fs);
    // Cargados a mano: si la carpeta compartida no cambia, al volver se usan estos y no los de la carpeta
    idbSet('origenFicheros', { manual: true, firmaCarpeta: firmaCarpeta() });
    // El corte se guarda con la configuración ya confirmada: al terminar la primera vez, o ahora si ya estaba hecha
    if (EP.cortes && S.onboarded) EP.cortes.capturar();
    if (S.onboarded) { S.view = 'fuentes'; S.fuentesTab = 'ficheros'; toast(tn('carga.hecho', fs.length)); }
    else S.ob.step = 'revision';
    render(); window.scrollTo(0, 0);
  }
  function cargarFicheros(files) {
    const todos = [].slice.call(files);
    if (!todos.length) return;
    salirDemo(false);
    ocupado(true, t('carga.leyendo'));
    // Cada fichero por su lado: si uno no se puede leer, se dice cuál y los demás siguen
    Promise.all(todos.map((f) => leerFichero(f).catch((e) => ({ nombre: f.name, error: e && e.message }))))
      .then((leidos) => setTimeout(() => {
        try {
          const malos = leidos.filter((x) => x.error), fs = leidos.filter((x) => !x.error);
          if (malos.length) toast(t('carga.noSeLee', { f: malos.map((x) => x.nombre).join(', ') }), 'bad');
          const variasHojas = fs.filter((x) => x.hojas > 1);
          if (variasHojas.length) S.avisosCarga = variasHojas.map((x) => t('carga.primeraHoja', { f: x.nombre, h: x.hoja, n: x.hojas }));
          else S.avisosCarga = [];
          if (!fs.length) return;
          // Ya había datos: se pregunta si el export nuevo sustituye a lo cargado o se suma
          if (S.onboarded && S.ficheros && S.ficheros.length && !S.demo) { S.cargaPend = { fs }; render(); window.scrollTo(0, 0); return; }
          aplicarCarga(fs);
        } catch (e) { S.error = { message: e.message, stack: e.stack }; render(); } finally { ocupado(false); }
      }, 20))
      .catch(() => { ocupado(false); toast(t('carga.error'), 'bad'); });
  }

  const hayBloqueoDuro = () => !!(S.vm && S.vm.dataCheck && S.vm.dataCheck.bloqueos.some((b) => b.duro));
  /**
   * Aplica unos ficheros. Si con ellos no se puede medir y antes sí se podía, no se guardan: los buenos siguen en el
   * navegador y se ofrece volver a ellos. Si después se arregla (por ejemplo, el mapeo de estados), se guardan entonces.
   */
  function aplicarCarga(fs) {
    // Los buenos son los de antes de esta carga; si ya había una carga sin guardar, los buenos siguen siendo los de entonces
    const antes = !S.onboarded || S.demo ? null : S.cargaBloqueada ? S.cargaBloqueada.antes : S.ficheros && S.ficheros.length && S.vm && !hayBloqueoDuro() ? S.ficheros : null;
    if (!procesar(fs)) return;
    if (antes && hayBloqueoDuro()) { S.cargaBloqueada = { antes }; S.pendienteGuardar = true; S.view = 'resumen'; render(); window.scrollTo(0, 0); return; }
    S.cargaBloqueada = null; S.pendienteGuardar = false;
    trasCargar(fs);
  }
  /** Ficheros que se cargaron sin guardar (no se podían medir): se guardan en cuanto se pueden medir. */
  let deOtraPestana = false;
  function guardarSiYaVale() {
    // Nunca en la demo ni por un cambio que llega de otra pestaña: solo lo que se arregla aquí
    if (S.demo || deOtraPestana || !S.pendienteGuardar || hayBloqueoDuro() || !S.ficheros) return;
    S.pendienteGuardar = false; S.cargaBloqueada = null;
    idbSet('ficheros', S.ficheros); idbSet('origenFicheros', { manual: true, firmaCarpeta: firmaCarpeta() });
    if (EP.cortes && S.onboarded) EP.cortes.capturar();
  }
  /** Aviso arriba de la página: la pregunta de sustituir o sumar, o el export que no se ha guardado. */
  function avisoCarga() {
    if (S.cargaPend) {
      const nuevos = S.cargaPend.fs.map((f) => f.nombre).join(', '), ya = (S.ficheros || []).map((f) => f.nombre).join(', ');
      return `<div class="ficha" data-tipo="carga"><div class="f-head"><div class="f-title">${esc(t('carga.pregunta'))}</div></div><div class="f-body">
        <p class="small">${esc(t('carga.preguntaTexto', { nuevos, ya }))}</p>
        <div class="row"><button class="btn primary" data-action="carga-sustituir">${esc(t('carga.sustituir'))}</button><button class="btn" data-action="carga-sumar">${esc(t('carga.sumar'))}</button><button class="link" data-action="carga-cancelar">${esc(t('comun.cancelar'))}</button></div>
        <p class="tiny muted">${esc(t('carga.preguntaNota'))}</p></div></div>`;
    }
    if (S.cargaBloqueada && hayBloqueoDuro()) return `<div class="notice warn small">${esc(t('carga.noGuardado'))} <button class="btn sm" data-action="carga-volver">${esc(t('carga.volver'))}</button></div>`;
    return '';
  }

  // ---------- datos de ejemplo ----------
  function verDemo() {
    const csv = (byId('demo-csv') || {}).textContent || '';
    if (!csv.trim()) { toast(t('demo.noHay'), 'bad'); return false; }
    let dc = {}; try { dc = JSON.parse(byId('demo-cliente').textContent || '{}'); } catch (e) { dc = {}; }
    if (!S.demo) S.real = { team: S.team, lectura: S.lectura, det: S.det, ficheros: S.ficheros, cfg: S.cfg, r: S.r, vm: S.vm, contextoDocs: S.contextoDocs, extraIni: S.extraIni, onboarded: S.onboarded, view: S.view,
      role: S.role, prefs: JSON.parse(JSON.stringify(S.prefs || { byRole: {} })), dismissed: Object.assign({}, S.dismissed),
      cargaBloqueada: S.cargaBloqueada, pendienteGuardar: S.pendienteGuardar };
    Object.assign(S, { cargaPend: null, cargaBloqueada: null, pendienteGuardar: false });
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
    // Nada de la demo se queda: equipo elegido, filtros, textos de IA y panel abierto
    Object.assign(S, { team: r.team || null, recFilter: 'todos', recLevel: null, narrativas: {}, iaRecs: null, iaRecsDe: null, iaImpacto: null, drill: null, iniForm: null });
    // Rol, indicadores destacados y descartes vuelven a los de antes de la demo
    if (r.role) S.role = r.role;
    if (r.prefs) S.prefs = r.prefs;
    if (r.dismissed) S.dismissed = r.dismissed;
    S.cargaBloqueada = r.cargaBloqueada || null; S.pendienteGuardar = !!r.pendienteGuardar;
    if (S.vm && (!S.team || !S.vm.equipos.some((e) => e.nombre === S.team))) S.team = S.vm.equipos[0] ? S.vm.equipos[0].nombre : null;
    if (!S.vm) S.ob.step = 'data';
    if (pintar !== false) render();
  }

  // ---------- navegación y render ----------
  // El mismo menú para todos los roles: el rol solo decide la página de inicio y, en Equipo, qué equipo se ve.
  // "Qué hacer" junta recomendaciones e iniciativas; "Datos", la calidad del dato y las fuentes. Cortes va en Labs.
  // La página de línea base sale: la vista de toda el área está en el Resumen y los gráficos, en la ficha de cada equipo.
  const PAGINAS = ['resumen', 'equipos', 'recomendaciones', 'iniciativas', 'epicas', 'calidad', 'fuentes', 'ajustes', 'cortes'];
  const POR_ROL = { direccion: PAGINAS, pmo: PAGINAS, equipo: PAGINAS };
  const INICIO_ROL = { direccion: 'resumen', pmo: 'resumen', equipo: 'equipos' };
  /** Grupo del menú de cada página (la entrada que se marca). */
  const GRUPO = { iniciativas: 'recomendaciones', fuentes: 'calidad' };
  /** Recorrido de la primera visita: tres pasos, cada uno en su página, con "Siguiente" y "Saltar".
   *  Se da por visto al empezar: si se recarga a medias no vuelve solo, se puede ver otra vez desde Ajustes. */
  const PASOS = [null, 'resumen', 'equipos', 'recomendaciones'];
  function empezarRecorrido() { S.recorrido = 1; S.prefs.recorridoHecho = true; guardarPrefs(); }
  function recorrido() {
    const n = S.recorrido; if (!n || S.view !== PASOS[n]) return '';
    // Sin cifras que enseñar (export que no se puede medir), el recorrido no tiene nada que explicar
    if (EP.vistas.bloqueoDuro && EP.vistas.bloqueoDuro()) return '';
    const ultimo = n === 3;
    return `<div class="ficha recorrido" role="region" aria-label="${esc(t('recorrido.titulo'))}"><div class="f-body">
      <div class="tiny muted">${esc(t('recorrido.paso', { n }))}</div><b>${esc(t('recorrido.t' + n))}</b><p class="small">${esc(t('recorrido.d' + n))}</p>
      <div class="row"><button class="btn sm primary" data-action="recorrido-sig">${esc(t(ultimo ? 'recorrido.terminar' : 'recorrido.siguiente'))}</button>${ultimo ? '' : `<button class="link small" data-action="recorrido-fin">${esc(t('recorrido.saltar'))}</button>`}</div></div></div>`;
  }
  function terminarRecorrido() { S.recorrido = 0; S.prefs.recorridoHecho = true; guardarPrefs(); }
  /** Pestañas de las entradas que juntan dos páginas: Qué hacer (recomendaciones e iniciativas) y Datos (calidad y fuentes). */
  const SUBPESTANAS = { recomendaciones: ['recomendaciones', 'iniciativas'], iniciativas: ['recomendaciones', 'iniciativas'], calidad: ['calidad', 'fuentes'], fuentes: ['calidad', 'fuentes'] };
  // Son enlaces entre páginas, no pestañas de un mismo panel: se marcan con aria-current
  function subPestanas() {
    const g = SUBPESTANAS[S.view]; if (!g) return '';
    return `<nav class="tabs sub-tabs" aria-label="${esc(t('nav.' + GRUPO_DE(S.view)))}">${g.map((v) => `<button class="tab ${S.view === v ? 'on' : ''}" ${S.view === v ? 'aria-current="page"' : ''} data-action="go" data-view="${v}" data-sub="1">${esc(t('pestana.' + v))}</button>`).join('')}</nav>`;
  }
  const GRUPO_DE = (v) => GRUPO[v] || v;
  /** Entradas del menú que se ven: Épicas solo si el export trae épicas; Cortes solo con Labs. */
  function enMenu(v) {
    if (v === 'epicas') return !!(S.vm && S.vm.epicas && S.vm.epicas.epicas && S.vm.epicas.epicas.length);
    if (v === 'cortes') return !!(S.prefs && S.prefs.labs);
    return true;
  }
  /** Equipos que ve el rol: el rol Equipo solo ve el suyo. */
  const visibles = () => (!S.vm ? [] : S.role === 'equipo' && S.team ? S.vm.equipos.filter((e) => e.nombre === S.team) : S.vm.equipos);
  function go(view) {
    // Ir a otra página que no es el paso del recorrido lo termina: si no, la tarjeta volvería más tarde fuera de contexto
    if (S.recorrido && view !== PASOS[S.recorrido]) terminarRecorrido();
    S.view = view; if (view !== 'equipos') S.teamCompare = false; S.drill = null; render(); window.scrollTo(0, 0);
  }
  function openTeam(team) { S.team = team; S.teamCompare = false; S.view = 'equipos'; S.drill = null; guardarPrefs(); render(); window.scrollTo(0, 0); }
  function openDrill(spec) { S.drill = spec; render(); }

  function pintarTextosFijos() {
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.getAttribute('data-t')); });
    document.querySelectorAll('#nav button').forEach((b) => { b.dataset.label = t('nav.' + b.dataset.view); });
    const labs = document.querySelector('#nav .sb-labs'); if (labs) labs.classList.toggle('hidden', !(S.prefs && S.prefs.labs));
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
      // Con un bloqueo duro no hay cifras que enseñar: ni presentación ni panel lateral con cifras
      if (S.vm && V.bloqueoDuro && V.bloqueoDuro()) { S.presenting = false; if (S.drill && S.drill.kind !== 'como') S.drill = null; }
      const enApp = S.onboarded && S.vm;
      ob.classList.toggle('hidden', !!enApp); app.classList.toggle('hidden', !enApp); pr.classList.toggle('hidden', !S.presenting);
      if (!S.vm || S.presenting) S.drill = null;
      // Al presentar se cierra cualquier panel lateral (Compartir, ayuda...): si no, tapa media diapositiva
      if (S.presenting) { pr.innerHTML = V.presentacion(); V.cajon(); V.asistente(); return; }
      // Elegir columnas a mano: va por delante de todo, en la pantalla de la primera vez
      if (S.colPend && S.colPend.abierto) { ob.classList.remove('hidden'); app.classList.add('hidden'); S.drill = null; ob.innerHTML = V.columnas(); V.cajon(); V.asistente(); return; }
      if (!enApp) { ob.innerHTML = V.onboarding(); V.trasOnboarding(); V.cajon(); V.asistente(); return; }
      const permitidas = POR_ROL[S.role] || PAGINAS;
      // Una página que no está en el menú (Cortes sin Labs, Épicas sin épicas) lleva a la de inicio del rol
      if (permitidas.indexOf(S.view) < 0 || !enMenu(S.view)) S.view = INICIO_ROL[S.role];
      const vt = visibles().map((e) => e.nombre);
      const cuentas = {
        recomendaciones: S.vm.recs.filter((r) => !S.dismissed[r.clave] && r.equipos.some((e) => vt.indexOf(e) >= 0)).length,
        calidad: S.vm.fiabilidad.revisar,
      };
      document.querySelectorAll('#nav button').forEach((b) => {
        const v = b.dataset.view, c = cuentas[v];
        b.classList.toggle('hidden', permitidas.indexOf(v) < 0 || !enMenu(v)); const activa = v === GRUPO_DE(S.view); b.classList.toggle('active', activa); if (activa) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        const etiqueta = v === 'equipos' && S.role === 'equipo' ? t('nav.miEquipo') : t('nav.' + v);
        b.innerHTML = esc(etiqueta) + (c ? `<span class="count">${c}</span>` : '');
      });
      const banda = byId('demo-band');
      banda.classList.toggle('hidden', !S.demo);
      if (S.demo) banda.innerHTML = `<span>${esc(t('demo.banda'))}</span><button class="link" data-action="demo-exit">${esc(t('demo.salir'))}</button>`;
      const cab = V.cabecera(S.view);
      byId('page-title').textContent = cab.titulo; byId('page-sub').textContent = cab.sub; byId('page-actions').innerHTML = cab.acciones || '';
      // Sin entregas medibles, las páginas de análisis no enseñan cifras: solo por qué y cómo arreglarlo
      const bloqueo = V.bloqueoDuro ? V.bloqueoDuro() : '';
      // Un export que no se puede medir no tapa lo que no depende de sus cifras: iniciativas, cortes y configuración
      byId('page').innerHTML = avisoCarga() + recorrido() + subPestanas() + (bloqueo && ['fuentes', 'ajustes', 'calidad', 'iniciativas', 'cortes'].indexOf(S.view) < 0 ? bloqueo : bloqueo + (V[S.view] || V.resumen)());
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
  accion('go', (el) => {
    go(el.dataset.view);
    // Al cambiar de pestaña se repinta la página: el foco vuelve a la pestaña elegida, no al principio del documento
    if (el.dataset.sub) { const b = document.querySelector('.sub-tabs [aria-current="page"]'); if (b) b.focus(); }
  });
  accion('open-team', (el) => openTeam(el.dataset.team));
  accion('team-tab', (el) => { if (el.dataset.team === '__comparar') { S.teamCompare = true; } else { S.team = el.dataset.team; S.teamCompare = false; guardarPrefs(); } S.drill = null; render(); });
  accion('set-role', (el) => { if (S.recorrido) terminarRecorrido(); S.role = el.dataset.role; S.recFilter = 'todos'; if (S.role === 'equipo') S.teamCompare = false; if (S.vm) S.view = INICIO_ROL[S.role]; guardarPrefs(); render(); toast(t('rol.cambiado.' + S.role)); });
  accion('set-lang', (el) => { I.fijar(el.dataset.lang); guardarPrefs(); if (S.vm) enSegundoPlano(() => { recalcular(); render(); }); else render(); });
  accion('toast-close', () => document.querySelector('.toast').classList.add('hidden'));
  accion('retry', () => { S.error = null; try { if (S.lectura) recalcular(); } catch (e) { S.error = { message: e.message, stack: e.stack }; } render(); });
  accion('import', () => byId('file-input').click());
  accion('recorrido-sig', () => { if (S.recorrido >= 3) { terminarRecorrido(); render(); return; } S.recorrido++; go(PASOS[S.recorrido]); });
  accion('recorrido-fin', () => { terminarRecorrido(); render(); });
  accion('ver-que-hacer', () => { S.recFilter = 'todos'; S.recLevel = null; go('recomendaciones'); });
  accion('recorrido-ver', () => { S.view = 'resumen'; empezarRecorrido(); render(); window.scrollTo(0, 0); });
  // Otro export con datos ya cargados: sustituir, sumar o cancelar; y volver a los datos buenos
  accion('carga-sustituir', () => { const p = S.cargaPend; S.cargaPend = null; if (p) enSegundoPlano(() => aplicarCarga(p.fs), t('carga.leyendo')); });
  accion('carga-sumar', () => {
    const p = S.cargaPend; S.cargaPend = null; if (!p) return;
    // Jira descarga todos los exports con el mismo nombre: uno repetido se suma con otro nombre (las tareas repetidas se leen una vez)
    const ya = (S.ficheros || []).map((f) => f.nombre);
    const libre = (n) => { if (ya.indexOf(n) < 0) return n; const m = /^(.*?)(\.[^.]*)?$/.exec(n); let i = 2; while (ya.indexOf(m[1] + ' (' + i + ')' + (m[2] || '')) >= 0) i++; return m[1] + ' (' + i + ')' + (m[2] || ''); };
    const nuevos = p.fs.map((f) => { const nombre = libre(f.nombre); ya.push(nombre); return nombre === f.nombre ? f : Object.assign({}, f, { nombre }); });
    enSegundoPlano(() => aplicarCarga((S.ficheros || []).concat(nuevos)), t('carga.leyendo'));
  });
  accion('carga-cancelar', () => { S.cargaPend = null; render(); });
  accion('carga-volver', () => { const b = S.cargaBloqueada; S.cargaBloqueada = null; S.pendienteGuardar = false; if (b) enSegundoPlano(() => { if (procesar(b.antes)) { render(); toast(t('carga.vuelto')); } }); });
  accion('demo', () => { enSegundoPlano(() => { if (verDemo()) { S.onboarded = true; S.role = S.role || 'direccion'; S.view = INICIO_ROL[S.role]; if (EP.cortes) EP.cortes.capturar(true); } render(); window.scrollTo(0, 0); }, t('carga.leyendo')); });
  accion('demo-exit', () => salirDemo(true));
  accion('drill', (el) => openDrill({ kind: el.dataset.kind, team: el.dataset.team || null, medida: el.dataset.medida || null, id: el.dataset.id || null }));
  accion('drill-close', () => { S.drill = null; render(); });
  accion('present', () => { if (EP.vistas.bloqueoDuro && EP.vistas.bloqueoDuro()) return; S.presenting = true; S.slide = 0; render(); });
  accion('present-close', () => { S.presenting = false; render(); });
  accion('slide', (el) => { S.slide = Math.max(0, S.slide + parseInt(el.dataset.dir, 10)); render(); });
  accion('print', () => window.print());
  accion('clear-all', () => {
    if (!window.confirm(t('ajustes.borrarConfirma'))) return;
    try { localStorage.removeItem(CLAVE_CFG); localStorage.removeItem(CLAVE_PREFS); sessionStorage.removeItem(CLAVE_IA); sessionStorage.removeItem('easyperformance.v3.chat'); } catch (e) { }
    // Si este espacio recogió los datos de antes, también se borra lo que quedara de ellos
    try { if (ESPACIO && localStorage.getItem(CLAVE_RECLAMADO) === ESPACIO) { localStorage.removeItem(CLAVE_CFG_V2); localStorage.removeItem(CLAVE_PREFS_V3); indexedDB.deleteDatabase(BASE_IDB); } } catch (e) { }
    idbSet('ficheros', null); idbSet('carpeta', null); idbSet('origenFicheros', null); if (EP.cortes) EP.cortes.borrarTodo();
    if (S.chat) S.chat = { open: false, msgs: [], busy: false, draft: '' };
    Object.assign(S, { lectura: null, det: null, ficheros: null, cfg: {}, r: null, vm: null, demo: false, real: null, onboarded: false, ob: { step: 'data' }, error: null, dismissed: {}, iaRecs: null, iaImpacto: null, narrativas: {},
      extraIni: [], contextoDocs: null, carpeta: null, team: null, recFilter: 'todos', recLevel: null, iniForm: null, drill: null,
      // También lo que estaba en memoria: rol, indicadores destacados, la versión leída y las iniciativas quitadas
      role: 'direccion', prefs: { byRole: {} }, cfgVersion: null, iniQuitadas: [], colPend: null, view: 'resumen', cargaPend: null, cargaBloqueada: null, pendienteGuardar: false });
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

  /** Firma de los exports de la carpeta compartida (datos.js): nombres y tamaños. Cambia cuando se deja un export nuevo. */
  function firmaCarpeta() {
    const ex = window.EASY_PERFORMANCE_EXPORTS;
    const lista = Array.isArray(ex) ? ex : ex && Array.isArray(ex.ficheros) ? ex.ficheros : null;
    if (!lista || !lista.length) return null;
    const huella = (s) => { s = String(s || ''); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return s.length + '.' + (h >>> 0).toString(36); };
    return lista.map((f) => f.nombre + ':' + huella(f.b64 != null ? f.b64 : f.texto)).join('|');
  }
  async function arrancar() {
    cargarPrefs();
    // Quien ya trabajaba con una carpeta compartida la sigue teniendo: la carpeta ahora está en Labs y Labs se enciende
    if (S.carpeta && S.prefs.labs === undefined) S.prefs.labs = true;
    // Si hay exports de la carpeta (actualizar.ps1), se cargan primero; si no, los últimos ficheros guardados en el navegador
    // exports/datos.js (actualizar.ps1, el mismo de la v2): ficheros en base64, configuración, iniciativas y contexto
    const ex = window.EASY_PERFORMANCE_EXPORTS;
    const lista = Array.isArray(ex) ? ex : ex && Array.isArray(ex.ficheros) ? ex.ficheros : null;
    let fs = null, deCarpeta = false;
    // Si después de abrir la carpeta se cargaron ficheros a mano y la carpeta no ha cambiado, mandan los cargados a mano
    const origen = await idbGet('origenFicheros');
    const mandaManual = !!(lista && lista.length && origen && origen.manual && origen.firmaCarpeta === firmaCarpeta());
    if (lista && lista.length && !mandaManual) {
      // Cada export en base64: CSV o Excel, se distingue por sus primeros bytes
      try {
        fs = await Promise.all(lista.map(async (f) => {
          if (f.b64 == null) return { nombre: f.nombre, texto: f.texto, formato: 'csv' };
          const bin = atob(f.b64), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
          const formato = N.detectarFormato(b);
          if (formato === 'csv') return { nombre: f.nombre, texto: descodificar(b), formato };
          const h = await N.leerHoja(b); return { nombre: f.nombre, texto: N.aCsv(h.filas), formato, hoja: h.hoja, hojas: h.hojas };
        }));
        deCarpeta = true;
      } catch (e) { toast(t('carga.datosJsMal'), 'bad'); fs = null; }
    }
    // Configuración, iniciativas y contexto de la carpeta: valen aunque manden los ficheros cargados a mano
    if (lista && lista.length) {
      if (window.EASY_PERFORMANCE_CONFIG && !leerLocal(CLAVE_CFG)) S.cfg = window.EASY_PERFORMANCE_CONFIG;
      if (window.EASY_PERFORMANCE_INICIATIVAS) S.extraIni = [].concat(window.EASY_PERFORMANCE_INICIATIVAS).filter(Boolean);
      if (window.EASY_PERFORMANCE_CONTEXTO && window.EASY_PERFORMANCE_CONTEXTO.documentos) S.contextoDocs = window.EASY_PERFORMANCE_CONTEXTO;
    }
    if (!fs) fs = await idbGet('ficheros');
    if (mandaManual && fs && fs.length) setTimeout(() => toast(t('carga.usandoManual')), 600);
    if (fs && fs.length) { try { if (procesar(fs) && EP.cortes && S.onboarded) EP.cortes.capturar(false, !deCarpeta); } catch (e) { S.error = { message: e.message, stack: e.stack }; } }
    if (!S.vm) S.onboarded = false;
    // Datos cargados pero primera vez sin terminar: se sigue por la revisión
    if (S.vm && !S.onboarded) S.ob.step = 'revision';
    if (S.onboarded && S.vm) S.view = INICIO_ROL[S.role];
    render();
  }

  window.EP = {
    S, N, P, t, tn, esc, lista, fmt, fecha, valor, formatoDe, nombreMedida, nombreEquipo, cat, toast, ocupado, enSegundoPlano,
    guardarCfg, guardarPrefs, guardarClave, recalcular, procesar, trasCargar, aplicarCarga, cargarFicheros, verDemo, salirDemo, go, openTeam, openDrill, render,
    visibles, POR_ROL, INICIO_ROL, empezarRecorrido, accion, cambio, descargar, descargarCsv, idbGet, idbSet, idbActualizar, firmaCarpeta, arrancar, migrar: migrarAEspacio, vistas: {},
    CLAVES: { cfg: CLAVE_CFG, prefs: CLAVE_PREFS, idb: NOMBRE_IDB, espacio: ESPACIO }, leerLocal, guardarLocal, cargarPrefs,
  };
})();
