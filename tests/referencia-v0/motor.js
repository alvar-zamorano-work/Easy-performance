/* Motor de Easy Performance: lee exports de Jira, detecta equipos y estados, calcula medidas y casos.
   No toca la página: se puede probar con Node. Nunca lee ni usa datos de personas. */
var Motor = (function () {
  'use strict';
  var DIA = 864e5;
  var CAT = (typeof CATALOGO !== 'undefined') ? CATALOGO : (typeof require !== 'undefined' ? require('./catalogo.js') : null);

  // ---------- utilidades ----------
  function sinAcentos(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function norm(h) { return sinAcentos(h == null ? '' : h).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function interior(h) {
    var n = norm(h);
    var m = n.match(/^(custom field|campo personalizado)\s*\((.*)\)$/);
    return m ? m[2].trim() : n;
  }
  function ordenar(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  function cuantil(arr, q) {
    var a = arr.filter(function (v) { return v != null && !isNaN(v); });
    if (!a.length) return null;
    a = ordenar(a);
    var p = (a.length - 1) * q, i = Math.floor(p), f = p - i;
    return i + 1 < a.length ? a[i] + (a[i + 1] - a[i]) * f : a[i];
  }
  function media(a) { a = a.filter(function (v) { return v != null && !isNaN(v); }); if (!a.length) return null; var s = 0; a.forEach(function (v) { s += v; }); return s / a.length; }
  function desv(a) { var m = media(a); if (m == null || a.length < 2) return null; var s = 0; a.forEach(function (v) { s += (v - m) * (v - m); }); return Math.sqrt(s / (a.length - 1)); }
  function rangos(a) {
    var idx = a.map(function (v, i) { return [v, i]; }).sort(function (x, y) { return x[0] - y[0]; });
    var r = new Array(a.length), i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      var rango = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) r[idx[k][1]] = rango;
      i = j + 1;
    }
    return r;
  }
  function spearman(xs, ys) {
    if (xs.length < 3) return null;
    var rx = rangos(xs), ry = rangos(ys), mx = media(rx), my = media(ry), sxy = 0, sx = 0, sy = 0;
    for (var i = 0; i < rx.length; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sx += (rx[i] - mx) * (rx[i] - mx); sy += (ry[i] - my) * (ry[i] - my); }
    return (sx && sy) ? sxy / Math.sqrt(sx * sy) : null;
  }
  function inicioSemana(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function sumarDias(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function diaLaborableAnterior(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (n > 0) { x.setDate(x.getDate() - 1); if (x.getDay() !== 0 && x.getDay() !== 6) n--; }
    return x;
  }

  // ---------- CSV ----------
  function detectarSeparador(t) {
    var cuentas = { ',': 0, ';': 0, '\t': 0 }, dentro = false;
    for (var i = 0; i < t.length && i < 20000; i++) {
      var c = t[i];
      if (c === '"') dentro = !dentro;
      else if (!dentro && (c === '\n' || c === '\r')) break;
      else if (!dentro && cuentas.hasOwnProperty(c)) cuentas[c]++;
    }
    var mejor = ',';
    Object.keys(cuentas).forEach(function (k) { if (cuentas[k] > cuentas[mejor]) mejor = k; });
    return mejor;
  }
  function leerCSV(t) {
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    var sep = detectarSeparador(t), sc = sep.charCodeAt(0);
    var filas = [], fila = [], campo = '', i = 0, n = t.length;
    while (i < n) {
      var c = t.charCodeAt(i);
      if (c === 34) { // comillas
        i++;
        while (i < n) {
          var j = t.indexOf('"', i);
          if (j === -1) { campo += t.slice(i); i = n; break; }
          campo += t.slice(i, j);
          if (t.charCodeAt(j + 1) === 34) { campo += '"'; i = j + 2; } else { i = j + 1; break; }
        }
        continue;
      }
      if (c === sc) { fila.push(campo); campo = ''; i++; continue; }
      if (c === 10 || c === 13) {
        fila.push(campo); campo = ''; filas.push(fila); fila = [];
        if (c === 13 && t.charCodeAt(i + 1) === 10) i++;
        i++; continue;
      }
      var k = i;
      while (k < n) { var d = t.charCodeAt(k); if (d === sc || d === 10 || d === 13 || d === 34) break; k++; }
      campo += t.slice(i, k); i = k;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(function (f) { return !(f.length === 1 && f[0] === ''); });
  }

  // ---------- columnas ----------
  var ALIAS = {
    clave: ['issue key', 'work item key', 'key', 'clave', 'clave de incidencia', 'clave de la incidencia', 'clave del elemento de trabajo', 'clave de elemento de trabajo'],
    resumen: ['summary', 'resumen'],
    tipo: ['issue type', 'work type', 'work item type', 'tipo de incidencia', 'tipo de trabajo', 'tipo de elemento de trabajo', 'tipo de la incidencia'],
    estado: ['status', 'estado'],
    categoria: ['status category', 'categoria de estado', 'categoria del estado'],
    cambioCategoria: ['status category changed', 'cambio de categoria de estado', 'categoria de estado cambiada', 'fecha de cambio de categoria de estado'],
    creada: ['created', 'creada', 'creado', 'fecha de creacion'],
    actualizada: ['updated', 'actualizada', 'actualizado', 'fecha de actualizacion'],
    resuelta: ['resolved', 'resuelta', 'resuelto', 'fecha de resolucion'],
    resolucion: ['resolution', 'resolucion'],
    prioridad: ['priority', 'prioridad'],
    componentes: ['components', 'component/s', 'componentes', 'componente/s', 'componente'],
    etiquetas: ['labels', 'etiquetas'],
    sprint: ['sprint', 'sprints'],
    puntos: ['story points', 'story point estimate', 'puntos de historia', 'estimacion de puntos de historia', 'story points estimate', 'estimacion de story points'],
    equipo: ['team', 'equipo', 'team name', 'nombre del equipo'],
    tis: ['[chart] time in status', 'time in status', 'tiempo en estado', '[chart] tiempo en estado'],
    primera: ['[chart] date of first response', 'date of first response', 'fecha de primera respuesta', '[chart] fecha de primera respuesta'],
    padre: ['parent summary', 'resumen del principal', 'resumen principal', 'resumen del elemento principal'],
    proyecto: ['project name', 'nombre del proyecto', 'proyecto']
  };
  var MULTIPLES = { componentes: 1, etiquetas: 1, sprint: 1 };

  function mapearColumnas(cab) {
    var mapa = {};
    var nombres = cab.map(function (h) { return { n: norm(h), i: interior(h) }; });
    Object.keys(ALIAS).forEach(function (campo) {
      var lista = ALIAS[campo], encontrados = [];
      for (var a = 0; a < lista.length && !encontrados.length; a++) {
        nombres.forEach(function (x, idx) { if (x.n === lista[a] || x.i === lista[a]) encontrados.push(idx); });
      }
      if (encontrados.length) mapa[campo] = MULTIPLES[campo] ? encontrados : encontrados[0];
    });
    return mapa;
  }

  // ---------- fechas ----------
  var MESES = { jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dec: 11, dic: 11 };
  function leerFecha(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{1,2})[\/\-\s]([A-Za-zÀ-ÿ\.]{3,6})[\/\-\s](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP])?\.?\s?[mM]?\.?)?/);
    if (m) {
      var clave = norm(m[2]).replace(/\./g, '').slice(0, 3);
      if (MESES.hasOwnProperty(clave)) {
        var y = +m[3]; if (y < 100) y += 2000;
        var h = +(m[4] || 0), ap = m[6] ? m[6].toLowerCase() : null;
        if (ap === 'p' && h < 12) h += 12;
        if (ap === 'a' && h === 12) h = 0;
        return new Date(y, MESES[clave], +m[1], h, +(m[5] || 0));
      }
    }
    m = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
    if (m) { var yy = +m[3]; if (yy < 100) yy += 2000; return new Date(yy, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)); }
    var t = Date.parse(s);
    return isNaN(t) ? null : new Date(t);
  }

  // ---------- clasificaciones ----------
  function tipoDe(t) {
    var n = norm(t);
    if (/epic|epica/.test(n)) return 'epica';
    if (/sub/.test(n)) return 'subtarea';
    if (/bug|error|defect|defecto|fallo|incidente/.test(n)) return 'error';
    if (/story|historia/.test(n)) return 'historia';
    if (/task|tarea/.test(n)) return 'tarea';
    return 'otro';
  }
  function esUrgente(p) { return /highest|critic|blocker|bloque|maxim|urgent|muy alta|^p0\b|^p1\b/.test(norm(p)); }
  function esDescartada(r) { return /won.?t|duplicat|duplicad|cannot|can.?t reproduce|no se (hara|puede)|declin|rechaz|obsolet|descart|invalid/.test(norm(r)); }
  var CLAVES_ETAPA = [
    ['hecho', /\b(done|hecho|hecha|finaliz|cerrad|closed|resolved|resuelt|complet|terminad|released|desplegad|entregad)/],
    ['espera', /(review|revis|\bqa\b|test|prueba|valid|block|bloque|wait|esper|hold|pausa|imped|ready for|listo para|por desplegar|to deploy|aprobac|approval)/],
    ['curso', /(progress|curso|progreso|doing|desarroll|develop|haciendo|implement|working|trabaj|in dev|coding)/],
    ['pendiente', /(to do|todo|por hacer|backlog|open|abiert|nuev|\bnew\b|pendiente|ready|selected|seleccionad|refin|analis|analys)/]
  ];
  function etapaPropuesta(nombre, categoria) {
    var n = norm(nombre);
    for (var i = 0; i < CLAVES_ETAPA.length; i++) if (CLAVES_ETAPA[i][1].test(n)) return CLAVES_ETAPA[i][0];
    var c = norm(categoria);
    if (/done|hecho|finaliz|complet/.test(c)) return 'hecho';
    if (/progress|curso|progreso/.test(c)) return 'curso';
    return 'pendiente';
  }
  function esBloqueo(nombre) { return /block|bloque|imped|hold|pausa/.test(norm(nombre)); }

  // ---------- ingesta ----------
  function ingerir(ficheros) {
    var informe = { ficheros: [], avisos: [], filasLeidas: 0, duplicadas: 0, epicas: 0, subtareas: 0, sinClave: 0, campos: {} };
    var porClave = new Map();
    ficheros.forEach(function (f) {
      var filas;
      try { filas = leerCSV(f.texto || ''); } catch (e) { informe.avisos.push({ tipo: 'error', texto: 'No se pudo leer ' + f.nombre + '.' }); return; }
      if (filas.length === 1) { informe.avisos.push({ tipo: 'aviso', texto: f.nombre + ' solo tiene la fila de títulos: no trae tareas.' }); return; }
      if (filas.length < 1) { informe.avisos.push({ tipo: 'error', texto: f.nombre + ' está vacío o no es un CSV.' }); return; }
      var cab = filas[0], mapa = mapearColumnas(cab), n = filas.length - 1;
      var conDatos = cab.map(function () { return false; });
      for (var r = 1; r < filas.length; r++) for (var c = 0; c < cab.length; c++) if (!conDatos[c] && filas[r][c]) conDatos[c] = true;
      informe.ficheros.push({ nombre: f.nombre, filas: n, columnas: cab.length, columnasConDatos: conDatos.filter(Boolean).length });
      if (n === 10000 || n === 1000) informe.avisos.push({ tipo: 'aviso', texto: f.nombre + ' tiene justo ' + n.toLocaleString('es-ES') + ' filas: puede estar cortado por el límite de exportación de Jira. Exporta por tramos de fechas.' });
      if (mapa.clave == null) { informe.avisos.push({ tipo: 'error', texto: f.nombre + ' no tiene columna de clave (Issue key). No parece un export de Jira.' }); return; }
      Object.keys(mapa).forEach(function (k) {
        var idx = [].concat(mapa[k]);
        if (idx.some(function (i) { return conDatos[i]; })) informe.campos[k] = true;
        else if (!informe.campos[k]) informe.campos[k] = 'vacio';
      });
      informe.filasLeidas += n;
      var val = function (fila, campo) { var i = mapa[campo]; return i == null ? '' : (fila[i] || '').trim(); };
      var vals = function (fila, campo) {
        var idx = mapa[campo]; if (idx == null) return [];
        var out = [];
        idx.forEach(function (i) { var v = (fila[i] || '').trim(); if (v && out.indexOf(v) < 0) out.push(v); });
        return out;
      };
      for (var k = 1; k < filas.length; k++) {
        var fila = filas[k];
        var clave = val(fila, 'clave');
        if (!clave) { informe.sinClave++; continue; }
        var t = {
          clave: clave,
          resumen: val(fila, 'resumen'),
          tipoTxt: val(fila, 'tipo'),
          estado: val(fila, 'estado'),
          categoria: val(fila, 'categoria'),
          creada: leerFecha(val(fila, 'creada')),
          actualizada: leerFecha(val(fila, 'actualizada')),
          resuelta: leerFecha(val(fila, 'resuelta')),
          resolucion: val(fila, 'resolucion'),
          prioridad: val(fila, 'prioridad'),
          componentes: vals(fila, 'componentes'),
          etiquetas: vals(fila, 'etiquetas'),
          sprints: vals(fila, 'sprint'),
          puntos: null,
          equipoCampo: val(fila, 'equipo'),
          proyecto: val(fila, 'proyecto'),
          padre: val(fila, 'padre'),
          tis: [],
          primera: leerFecha(val(fila, 'primera')),
          cambioCategoria: leerFecha(val(fila, 'cambioCategoria'))
        };
        var p = val(fila, 'puntos').replace(',', '.');
        if (p !== '' && !isNaN(+p)) t.puntos = +p;
        var tis = val(fila, 'tis');
        if (tis) tis.split('_*|*_').forEach(function (parte) {
          var x = parte.split('_*:*_');
          if (x.length === 3 && !isNaN(+x[1]) && !isNaN(+x[2])) t.tis.push({ id: x[0], n: +x[1], v: +x[2] });
        });
        t.tipo = tipoDe(t.tipoTxt);
        t.urgente = esUrgente(t.prioridad);
        t.descartada = !!(t.resuelta && t.resolucion && esDescartada(t.resolucion));
        var previa = porClave.get(clave);
        if (previa) {
          informe.duplicadas++;
          if ((t.actualizada ? t.actualizada.getTime() : 0) >= (previa.actualizada ? previa.actualizada.getTime() : 0)) porClave.set(clave, t);
        } else porClave.set(clave, t);
      }
    });
    var tareas = [];
    porClave.forEach(function (t) {
      if (t.tipo === 'epica') { informe.epicas++; return; }
      if (t.tipo === 'subtarea') { informe.subtareas++; return; }
      if (!t.creada) return;
      tareas.push(t);
    });
    informe.tareas = tareas.length;
    return { tareas: tareas, informe: informe };
  }

  // ---------- detección ----------
  var OPCIONES_EQUIPO = [
    { id: 'equipo', nombre: 'Campo Equipo', valor: function (t) { return t.equipoCampo; } },
    { id: 'componentes', nombre: 'Componente', valor: function (t) { return t.componentes[0] || ''; } },
    { id: 'proyecto', nombre: 'Proyecto', valor: function (t) { return t.proyecto; } },
    { id: 'etiquetas', nombre: 'Etiqueta', valor: function (t) { return t.etiquetas[0] || ''; } },
    { id: 'todos', nombre: 'En ninguno: todo es un solo equipo', valor: function () { return 'Todo el trabajo'; } }
  ];
  function valorEquipo(campo) {
    var o = OPCIONES_EQUIPO.filter(function (x) { return x.id === campo; })[0] || OPCIONES_EQUIPO[OPCIONES_EQUIPO.length - 1];
    return o.valor;
  }

  function detectar(tareas, informe) {
    var det = { avisos: [] };
    // fecha de referencia: lo más reciente del export
    // fecha de referencia: la última actividad real (creación, cierre o cambio de estado).
    // "Actualizada" no sirve: cambia con ediciones masivas que no son trabajo.
    var ref = 0, min = Infinity, actividad = [];
    tareas.forEach(function (t) {
      [t.resuelta, t.creada, t.cambioCategoria].forEach(function (d) { if (d) { actividad.push(d.getTime()); if (d.getTime() > ref) ref = d.getTime(); } });
      if (t.creada && t.creada.getTime() < min) min = t.creada.getTime();
    });
    det.fechaMin = new Date(isFinite(min) ? min : Date.now());
    det.fechaMax = new Date(ref || Date.now());
    det.fechaRef = det.fechaMax;
    // si la actividad casi se detiene al final del export, las medidas llegan hasta la última semana con actividad
    if (actividad.length) {
      var s0 = inicioSemana(det.fechaMin).getTime(), porSemana = {};
      actividad.forEach(function (x) { var k = Math.floor((x - s0) / (7 * DIA)); porSemana[k] = (porSemana[k] || 0) + 1; });
      var ks = Object.keys(porSemana).map(Number).sort(function (a, b) { return a - b; });
      var med = cuantil(ks.map(function (k) { return porSemana[k]; }), 0.5);
      var ultimaActiva = ks.filter(function (k) { return porSemana[k] >= 0.25 * med; }).pop();
      var ultima = ks[ks.length - 1];
      if (ultimaActiva != null && ultima - ultimaActiva >= 2) {
        det.fechaRef = new Date(s0 + (ultimaActiva + 1) * 7 * DIA + 9 * 36e5);
        det.avisos.push({ tipo: 'aviso', texto: 'Las últimas semanas del export casi no tienen actividad. Las medidas llegan hasta la semana del ' + fechaCorta(new Date(s0 + ultimaActiva * 7 * DIA)) + '.' });
      }
    }

    // unidad del campo Tiempo en estado (milisegundos o segundos), calibrada con las fechas
    var ratios = [];
    tareas.forEach(function (t) {
      if (!t.resuelta || !t.tis.length) return;
      var lead = t.resuelta - t.creada;
      if (lead < 3600e3) return;
      var s = 0; t.tis.forEach(function (x) { s += x.v; });
      if (s > 0) ratios.push(s / lead);
    });
    var r = cuantil(ratios, 0.5), factor = 1;
    if (r != null) {
      var mejor = Infinity;
      [1, 1000, 60000].forEach(function (f) { var e = Math.abs(Math.log(r * f)); if (e < mejor) { mejor = e; factor = f; } });
    }
    det.factorTis = factor;
    det.hayTis = tareas.some(function (t) { return t.tis.length; });

    // nombres de estado por id: el estado actual suele aparecer con tiempo cero
    var votos = {};
    tareas.forEach(function (t) {
      var ceros = t.tis.filter(function (x) { return x.v === 0 && x.n >= 1; });
      if (ceros.length === 1 && t.estado) {
        var id = ceros[0].id; votos[id] = votos[id] || {};
        votos[id][t.estado] = (votos[id][t.estado] || 0) + 1;
      }
    });
    det.nombrePorId = {};
    Object.keys(votos).forEach(function (id) {
      var mejor = null, max = 0;
      Object.keys(votos[id]).forEach(function (nom) { if (votos[id][nom] > max) { max = votos[id][nom]; mejor = nom; } });
      det.nombrePorId[id] = mejor;
    });

    // ids sin nombre: primero los estados de sistema de Jira, después por descarte
    var CONOCIDOS = { '1': 'Open', '3': 'In Progress', '4': 'Reopened', '5': 'Resolved', '6': 'Closed' };
    var ids = {}, actuales = {};
    tareas.forEach(function (t) { t.tis.forEach(function (x) { ids[x.id] = 1; }); if (t.estado) actuales[t.estado] = t.categoria || ''; });
    var usados = function () { var u = {}; Object.keys(det.nombrePorId).forEach(function (k) { u[det.nombrePorId[k]] = 1; }); return u; };
    Object.keys(ids).forEach(function (id) {
      if (det.nombrePorId[id] || !CONOCIDOS[id]) return;
      var conocido = CONOCIDOS[id], u = usados();
      var igual = Object.keys(actuales).filter(function (n) { return norm(n) === norm(conocido) && !u[n]; })[0];
      var misma = Object.keys(actuales).filter(function (n) { return !u[n] && etapaPropuesta(n, actuales[n]) === etapaPropuesta(conocido, ''); });
      det.nombrePorId[id] = igual || (misma.length === 1 ? misma[0] : conocido);
    });
    var sinId = Object.keys(ids).filter(function (id) { return !det.nombrePorId[id]; });
    var u2 = usados(), libres = Object.keys(actuales).filter(function (n) { return !u2[n]; });
    if (sinId.length === 1 && libres.length === 1) det.nombrePorId[sinId[0]] = libres[0];

    // lista de estados con su etapa propuesta
    var estados = {};
    function estadoInfo(nombre) {
      if (!estados[nombre]) estados[nombre] = { nombre: nombre, actuales: 0, categorias: {}, horas: [], visitas: 0 };
      return estados[nombre];
    }
    tareas.forEach(function (t) {
      if (t.estado) { var e = estadoInfo(t.estado); e.actuales++; if (t.categoria) e.categorias[t.categoria] = (e.categorias[t.categoria] || 0) + 1; }
      t.tis.forEach(function (x) {
        var e = estadoInfo(det.nombrePorId[x.id] || ('Estado ' + x.id));
        e.visitas++;
        if (x.v > 0) e.horas.push(x.v * factor / 36e5);
      });
    });
    det.estados = Object.keys(estados).map(function (k) {
      var e = estados[k], cat = '', max = 0;
      Object.keys(e.categorias).forEach(function (c) { if (e.categorias[c] > max) { max = e.categorias[c]; cat = c; } });
      return { nombre: e.nombre, actuales: e.actuales, visitas: e.visitas, categoria: cat,
        horasMedias: media(e.horas), etapa: etapaPropuesta(e.nombre, cat), bloqueo: esBloqueo(e.nombre) };
    }).sort(function (a, b) {
      var o = { pendiente: 0, curso: 1, espera: 2, hecho: 3 };
      return o[a.etapa] - o[b.etapa] || b.visitas - a.visitas;
    });
    var sinNombre = det.estados.filter(function (e) { return /^Estado \d+$/.test(e.nombre); });
    if (sinNombre.length) det.avisos.push({ tipo: 'aviso', texto: sinNombre.length + ' estado(s) del campo Tiempo en estado no tienen nombre en el export. Revisa a qué etapa pertenecen.' });

    // candidatos para reconocer equipos
    det.opcionesEquipo = OPCIONES_EQUIPO.map(function (o) {
      var cuenta = {}, conValor = 0;
      tareas.forEach(function (t) { var v = o.valor(t); if (v) { conValor++; cuenta[v] = (cuenta[v] || 0) + 1; } });
      var valores = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; });
      var cobertura = tareas.length ? conValor / tareas.length : 0;
      var valida = o.id === 'todos' || (valores.length >= 2 && valores.length <= 25 && cobertura >= 0.6);
      var puntuacion = o.id === 'todos' ? 0.1 : (valida ? cobertura + ({ equipo: 0.3, componentes: 0.1, proyecto: 0.05, etiquetas: 0 }[o.id]) - (valores.length > 12 ? 0.3 : 0) : -1);
      return { id: o.id, nombre: o.nombre, valores: valores.map(function (v) { return { valor: v, n: cuenta[v] }; }), cobertura: cobertura, valida: valida, puntuacion: puntuacion };
    });
    var mejorOpcion = det.opcionesEquipo.slice().sort(function (a, b) { return b.puntuacion - a.puntuacion; })[0];
    det.equipoRecomendado = mejorOpcion.id;

    // sprints: ¿parecen sprints de verdad?
    var nombresSprint = {};
    tareas.forEach(function (t) { t.sprints.forEach(function (s) { nombresSprint[s] = 1; }); });
    var lista = Object.keys(nombresSprint);
    var conFecha = lista.filter(function (s) { return /^\d{4}-\d{2}-\d{2}T?\d{0,2}/.test(s); }).length;
    det.haySprints = lista.length > 0;
    det.sprintsComoFecha = lista.length > 0 && conFecha / lista.length > 0.5;
    if (det.sprintsComoFecha) det.avisos.push({ tipo: 'aviso', texto: 'Los nombres de sprint parecen fechas y horas (' + lista.length.toLocaleString('es-ES') + ' distintos). No se usan como sprints: las medidas van por semanas.' });
    return det;
  }

  // ---------- cálculo ----------
  // semanas que abarca el valor actual de cada medida ('P' = ventana larga de proporciones)
  var VENTANA = { errores: 'P', retrabajo: 'P', arrastradas: 'P', reparto: 'P', regularidad: 8, estimacion: 12 };
  var DELTA_MIN = { ciclo: 1, total: 2, espera: 0.05, errores: 0.05, retrabajo: 0.05, arrastradas: 0.05, regularidad: 0.1,
    entregas: 1, velocidad: 3, pendiente: 3, wip: 1, primera: 4, estimacion: 0.1, edad: 1, throughput: 0.5, valor: 0.05, carga: 3 };

  function calcular(tareas, det, cfg) {
    cfg = cfg || {};
    var K = cfg.semanasActuales || 4, KP = cfg.semanasProporciones || 8, R = cfg.semanasReferencia || 12;
    var etapas = cfg.etapas || {};
    var etapaDe = {}, bloqueoDe = {};
    det.estados.forEach(function (e) { etapaDe[e.nombre] = etapas[e.nombre] || e.etapa; bloqueoDe[e.nombre] = e.bloqueo; });
    var f = det.factorTis || 1;
    var valor = valorEquipo(cfg.campoEquipo || det.equipoRecomendado);
    var incluidos = cfg.equipos && cfg.equipos.length ? cfg.equipos : null;

    var fechaRef = det.fechaRef;
    var semanaFin = inicioSemana(fechaRef);
    var dia = fechaRef.getDay();
    if (dia === 0 || dia === 6 || (dia === 5 && fechaRef.getHours() >= 12)) semanaFin = sumarDias(semanaFin, 7);
    var primera = inicioSemana(det.fechaMin);
    var N = Math.max(1, Math.round((semanaFin - primera) / (7 * DIA)));
    if (N > 104) { primera = sumarDias(semanaFin, -7 * 104); N = 104; }
    var semanas = [];
    for (var w = 0; w < N; w++) semanas.push(sumarDias(primera, 7 * w));
    var finDe = function (w) { return w + 1 < N ? semanas[w + 1] : semanaFin; };
    var semanaDe = function (d) { if (!d || d < primera || d >= semanaFin) return -1; return Math.min(N - 1, Math.floor((d - primera) / (7 * DIA))); };

    // derivados por tarea
    var porEquipo = {};
    tareas.forEach(function (t) {
      var eq = valor(t) || 'Sin equipo';
      if (incluidos && incluidos.indexOf(eq) < 0) return;
      if (cfg.unirComo) eq = cfg.unirComo; // visión del área: los equipos incluidos, juntos como uno solo
      var d = { t: t, equipo: eq };
      d.etapa = etapaDe[t.estado] || etapaPropuesta(t.estado, t.categoria);
      var curso = 0, espera = 0, entradasCurso = 0, extra = 0, bloqueos = 0, porEstado = {};
      t.tis.forEach(function (x) {
        var nom = det.nombrePorId[x.id] || ('Estado ' + x.id);
        var et = etapaDe[nom] || 'pendiente';
        var ms = x.v * f;
        if (et === 'curso') { curso += ms; entradasCurso += x.n; }
        if (et === 'espera') { espera += ms; entradasCurso += x.n; porEstado[nom] = (porEstado[nom] || 0) + ms; }
        if (et === 'curso' || et === 'espera') {
          if (bloqueoDe[nom]) bloqueos += x.n; else extra += Math.max(0, x.n - 1);
        }
      });
      d.cursoMs = curso; d.esperaMs = espera; d.porEstado = porEstado;
      d.entregada = !!(t.resuelta && !t.descartada && (d.etapa === 'hecho' || !t.estado));
      d.descartada = !!(t.resuelta && t.descartada);
      d.conTis = t.tis.length > 0;
      if (d.entregada && d.conTis && entradasCurso === 0) d.salto = true;
      if (d.entregada && (curso + espera) > 0) {
        d.ciclo = (curso + espera) / DIA;
        d.inicio = new Date(t.resuelta.getTime() - curso - espera);
      } else if (!t.resuelta && (d.etapa === 'curso' || d.etapa === 'espera')) {
        d.inicio = t.cambioCategoria || (t.actualizada ? new Date(t.actualizada.getTime() - curso - espera) : null);
      }
      if (d.entregada) d.total = (t.resuelta - t.creada) / DIA;
      d.retrabajo = d.entregada && d.conTis && (extra - bloqueos) > 0;
      d.primeraH = (t.primera && t.primera >= t.creada) ? (t.primera - t.creada) / 36e5 : null;
      (porEquipo[eq] = porEquipo[eq] || []).push(d);
    });

    var nombresEquipo = Object.keys(porEquipo).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    var cierresBloque = cierresEnBloque(tareas);
    var equipos = nombresEquipo.map(function (nombre) {
      return calcularEquipo(nombre, porEquipo[nombre], { semanas: semanas, N: N, finDe: finDe, semanaDe: semanaDe, semanaFin: semanaFin,
        fechaRef: fechaRef, K: K, KP: KP, R: R, det: det, cfg: cfg, cierresBloque: cierresBloque });
    });
    return { fechaRef: fechaRef, semanas: semanas, semanaFin: semanaFin, equipos: equipos, cierresBloque: cierresBloque };
  }

  function cierresEnBloque(tareas) {
    var porMinuto = {};
    tareas.forEach(function (t) {
      if (!t.resuelta) return;
      var k = Math.floor(t.resuelta.getTime() / 60000);
      porMinuto[k] = (porMinuto[k] || 0) + 1;
    });
    var out = [];
    Object.keys(porMinuto).forEach(function (k) { if (porMinuto[k] >= 10) out.push({ fecha: new Date(+k * 60000), n: porMinuto[k] }); });
    return out;
  }

  function calcularEquipo(nombre, items, c) {
    var N = c.N, K = c.K, R = c.R, det = c.det, cfg = c.cfg;
    var s = {};
    ['entregas', 'entradas', 'salidas', 'pendiente', 'wip', 'velocidad'].forEach(function (k) { s[k] = new Array(N).fill(0); });
    s.pendienteEdad = new Array(N).fill(null); // antigüedad típica (mediana, días) de lo que espera sin empezar
    var entregadas = items.filter(function (d) { return d.entregada; });
    // conteos semanales
    items.forEach(function (d) {
      var t = d.t;
      var wc = c.semanaDe(t.creada); if (wc >= 0) s.entradas[wc]++;
      if (t.resuelta) {
        var wr = c.semanaDe(t.resuelta);
        if (wr >= 0) {
          if (d.entregada) { s.entregas[wr]++; if (t.puntos) s.velocidad[wr] += t.puntos; }
          if (d.entregada || d.descartada) s.salidas[wr]++;
        }
      }
    });
    for (var w = 0; w < N; w++) {
      var fin = c.finDe(w);
      var pend = 0, wip = 0, edades = [];
      for (var i = 0; i < items.length; i++) {
        var d = items[i], t = d.t;
        if (t.creada >= fin) continue;
        var abierta = !t.resuelta || t.resuelta >= fin;
        if (!abierta) continue;
        if (d.inicio && d.inicio < fin) { if (!d.descartada) wip++; } else { pend++; edades.push((fin - t.creada) / DIA); }
      }
      s.pendiente[w] = pend; s.wip[w] = wip;
      if (edades.length >= 3) s.pendienteEdad[w] = cuantil(edades, 0.5);
    }
    // ventanas móviles
    var ventana = function (w, k) {
      var desde = c.semanas[Math.max(0, w - k + 1)], hasta = c.finDe(w);
      return entregadas.filter(function (d) { return d.t.resuelta >= desde && d.t.resuelta < hasta; });
    };
    var KP = c.KP;
    ['entregasMedia', 'ciclo85', 'ciclo50', 'total85', 'espera', 'errores', 'retrabajo', 'arrastradas', 'regularidad', 'estimacion', 'primera85', 'velocidadMedia'].forEach(function (k) { s[k] = new Array(N).fill(null); });
    s.reparto = new Array(N).fill(null);
    var sprintsInfo = analizarSprints(items, c);
    for (w = 0; w < N; w++) {
      if (w >= K - 1) {
        s.entregasMedia[w] = media(s.entregas.slice(w - K + 1, w + 1));
        s.velocidadMedia[w] = media(s.velocidad.slice(w - K + 1, w + 1));
      }
      var v = ventana(w, K);
      var conCiclo = v.filter(function (d) { return d.ciclo != null; });
      if (conCiclo.length >= 5) {
        var cs = conCiclo.map(function (d) { return d.ciclo; });
        s.ciclo85[w] = cuantil(cs, 0.85); s.ciclo50[w] = cuantil(cs, 0.5);
        var se = 0, st = 0; conCiclo.forEach(function (d) { se += d.esperaMs; st += d.cursoMs + d.esperaMs; });
        s.espera[w] = st ? se / st : null;
      }
      if (v.length >= 5) s.total85[w] = cuantil(v.map(function (d) { return d.total; }), 0.85);
      var vp = ventana(w, KP);
      if (w >= KP - 1 && vp.length >= 8) {
        s.errores[w] = vp.filter(function (d) { return d.t.tipo === 'error'; }).length / vp.length;
        var conT = vp.filter(function (d) { return d.conTis; });
        if (conT.length >= 8) s.retrabajo[w] = conT.filter(function (d) { return d.retrabajo; }).length / conT.length;
        if (sprintsInfo.fiables) s.arrastradas[w] = vp.filter(function (d) { return d.t.sprints.length > 1; }).length / vp.length;
        var rep = { historia: 0, error: 0, tarea: 0, otro: 0 };
        vp.forEach(function (d) { rep[d.t.tipo] = (rep[d.t.tipo] || 0) + 1; });
        Object.keys(rep).forEach(function (k) { rep[k] = rep[k] / vp.length; });
        s.reparto[w] = rep;
      }
      if (w >= 7) {
        var sem = s.entregas.slice(w - 7, w + 1), m = media(sem);
        s.regularidad[w] = m >= 1 ? desv(sem) / m : null;
      }
      var v12 = ventana(w, 12).filter(function (d) { return d.t.puntos != null && d.ciclo != null && d.ciclo > 0; });
      if (v12.length >= 20) s.estimacion[w] = spearman(v12.map(function (d) { return d.t.puntos; }), v12.map(function (d) { return d.ciclo; }));
      var desde = c.semanas[Math.max(0, w - K + 1)], hasta = c.finDe(w);
      var pr = items.filter(function (d) { return d.primeraH != null && d.t.creada >= desde && d.t.creada < hasta; }).map(function (d) { return d.primeraH; });
      if (pr.length >= 5) s.primera85[w] = cuantil(pr, 0.85);
    }

    // trabajo atascado hoy
    // "lo habitual" sale del periodo de referencia (antes de las últimas semanas), no de las semanas que se están evaluando
    var Lr = N - 1, refDesde = c.semanas[Math.max(0, Lr - K - R + 1)], refHasta = c.semanas[Math.max(0, Lr - K + 1)];
    var deRef = entregadas.filter(function (d) { return d.ciclo != null && d.t.resuelta >= refDesde && d.t.resuelta < refHasta; });
    if (deRef.length < 5) deRef = entregadas.filter(function (d) { return d.ciclo != null && d.t.resuelta >= sumarDias(c.semanaFin, -7 * 16); });
    var umbralEdad = deRef.length >= 5 ? cuantil(deRef.map(function (d) { return d.ciclo; }), 0.85) : null;
    var enCurso = items.filter(function (d) { return !d.t.resuelta && d.inicio && (d.etapa === 'curso' || d.etapa === 'espera'); })
      .map(function (d) { return { clave: d.t.clave, resumen: d.t.resumen, estado: d.t.estado, etapa: d.etapa, edad: (c.fechaRef - d.inicio) / DIA }; })
      .sort(function (a, b) { return b.edad - a.edad; });
    var atascadas = umbralEdad == null ? [] : enCurso.filter(function (x) { return x.edad > umbralEdad; });

    // medidas: valor actual, referencia propia, estado y tendencia
    var L = N - 1;
    var series = {
      entregas: s.entregasMedia, regularidad: s.regularidad, ciclo: s.ciclo85, total: s.total85, espera: s.espera,
      wip: s.wip, arrastradas: s.arrastradas, errores: s.errores, retrabajo: s.retrabajo, pendiente: s.pendiente,
      estimacion: s.estimacion, velocidad: s.velocidadMedia, primera: s.primera85,
      reparto: s.reparto.map(function (r) { return r ? r.historia : null; })
    };
    var disponibles = disponibilidad(items, det, sprintsInfo);
    var medidas = {};
    Object.keys(CAT.medidas).forEach(function (id) {
      var def = CAT.medidas[id];
      var m = { id: id, disponible: disponibles[id] === true, motivo: disponibles[id] === true ? null : disponibles[id] };
      if (!m.disponible) { medidas[id] = m; return; }
      if (id === 'edad') {
        m.valor = umbralEdad == null ? null : atascadas.length;
        m.serie = null;
      } else {
        m.serie = series[id];
        m.valor = m.serie ? m.serie[L] : null;
        var win = VENTANA[id] === 'P' ? c.KP : (VENTANA[id] || K);
        m.ventana = win;
        var refVals = (m.serie || []).slice(Math.max(0, L - win - R + 1), Math.max(0, L - win + 1)).filter(function (x) { return x != null; });
        if (refVals.length >= 6) m.ref = { lo: cuantil(refVals, 0.15), hi: cuantil(refVals, 0.85), med: cuantil(refVals, 0.5), n: refVals.length };
        var previo = m.serie && L - win >= 0 ? m.serie[L - win] : null;
        m.tendencia = tendencia(m.valor, previo, def.dir);
      }
      var lim = (cfg.limites && cfg.limites[nombre] && cfg.limites[nombre][id]) || null;
      var est = estadoMedida(id, m.valor, m.ref, lim, def);
      m.estado = est.estado; m.estadoTexto = est.texto;
      medidas[id] = m;
    });

    var info = {
      nombre: nombre, n: items.length, entregadas: entregadas.length, series: s, medidas: medidas, atascadas: atascadas, enCurso: enCurso,
      umbralEdad: umbralEdad, sprints: sprintsInfo,
      semanasConDatos: s.entregas.filter(function (x, i) { return x > 0 || s.entradas[i] > 0; }).length
    };
    info.kpis = kpisComite(info, c, nombre);
    info.negocio = negocio(items, c);
    info.calidad = calidadEquipo(items, c, sprintsInfo, det);
    info.ciclos = entregadas.filter(function (d) { return d.ciclo != null && d.t.resuelta >= sumarDias(c.semanaFin, -7 * 16); })
      .map(function (d) { return { clave: d.t.clave, resumen: d.t.resumen, dias: d.ciclo, fecha: d.t.resuelta, puntos: d.t.puntos }; });
    info.casos = evaluarCasos(info, items, c);
    return info;
  }

  function disponibilidad(items, det, sp) {
    var hayTis = items.some(function (d) { return d.conTis; });
    var hayInicio = items.some(function (d) { return d.inicio; });
    var conPuntos = items.filter(function (d) { return d.t.puntos != null; }).length;
    var hayErrores = items.some(function (d) { return d.t.tipo === 'error'; }) || items.some(function (d) { return d.t.tipoTxt; });
    var hayPrimera = items.some(function (d) { return d.primeraH != null; });
    var out = {};
    Object.keys(CAT.medidas).forEach(function (id) {
      var req = CAT.medidas[id].requiere;
      if (!req) out[id] = true;
      else if (req === 'tis') out[id] = hayTis ? true : 'El export no trae el campo Tiempo en estado. Exporta con Todos los campos.';
      else if (req === 'inicio') out[id] = hayInicio ? true : 'No se puede saber cuándo empezó cada tarea con este export.';
      else if (req === 'puntos') out[id] = conPuntos >= 20 ? true : 'Hay muy pocas tareas con puntos de historia.';
      else if (req === 'errores') out[id] = hayErrores ? true : 'El export no trae el tipo de tarea.';
      else if (req === 'primera') out[id] = hayPrimera ? true : 'El export no trae la fecha de primera respuesta.';
      else if (req === 'sprints') out[id] = sp.fiables ? true : sp.motivo;
      else if (req === 'api') out[id] = 'Necesita saber qué había al empezar cada sprint: con la API de Jira o con fotos semanales.';
      else out[id] = true;
    });
    return out;
  }

  function tendencia(actual, previo, dir) {
    if (actual == null || previo == null) return null;
    var base = Math.abs(previo) < 1e-9 ? 1 : Math.abs(previo);
    var cambio = (actual - previo) / base;
    if (Math.abs(cambio) < 0.1) return { sentido: 'estable', cambio: cambio };
    var sube = cambio > 0;
    if (!dir) return { sentido: sube ? 'sube' : 'baja', cambio: cambio };
    var mejora = dir === 'menos' ? !sube : sube;
    return { sentido: mejora ? 'mejora' : 'empeora', cambio: cambio, sube: sube };
  }

  // ---------- indicadores de comité: cinco cifras por equipo y por área, cada una frente a su propia historia ----------
  function kpisComite(info, c, nombre) {
    var N = c.N, L = N - 1, K = c.K, R = c.R, s = info.series, M = info.medidas, out = {};
    var fteMapa = c.cfg.fte || {}, fte = fteMapa[nombre] != null && fteMapa[nombre] > 0 ? +fteMapa[nombre] : null;
    function desdeSerie(id, serie, win, def) {
      var m = { id: id, disponible: true, serie: serie, valor: serie[L], ventana: win };
      var refVals = serie.slice(Math.max(0, L - win - R + 1), Math.max(0, L - win + 1)).filter(function (x) { return x != null; });
      if (refVals.length >= 6) m.ref = { lo: cuantil(refVals, 0.15), hi: cuantil(refVals, 0.85), med: cuantil(refVals, 0.5), n: refVals.length };
      var est = estadoMedida(id, m.valor, m.ref, null, def);
      m.estado = est.estado; m.estadoTexto = est.texto;
      return m;
    }
    function copia(id, base) {
      var b = M[base];
      if (!b || !b.disponible) return { id: id, disponible: false, motivo: b ? b.motivo : 'No disponible con estos datos.' };
      return { id: id, disponible: true, serie: b.serie, valor: b.valor, ref: b.ref, ventana: b.ventana, estado: b.estado, estadoTexto: b.estadoTexto };
    }
    // Throughput por FTE: tareas terminadas al mes (media de 4 semanas) entre las personas equivalentes del equipo
    if (fte) out.throughput = desdeSerie('throughput', s.entregasMedia.map(function (x) { return x == null ? null : x * 52 / 12 / fte; }), K, { dir: 'mas', formato: 'num' });
    else out.throughput = { id: 'throughput', disponible: false, falta: 'fte', motivo: 'Indica cuántas personas (FTE) tiene el equipo en Ajustes.' };
    out.entrega = copia('entrega', 'ciclo');
    // Valor entregado: parte de lo terminado que es funcionalidad nueva (historias), frente a su propia historia
    var rep = s.reparto.map(function (r) { return r ? r.historia : null; });
    out.valor = M.reparto && M.reparto.disponible ? desdeSerie('valor', rep, c.KP, { dir: 'mas', formato: 'pct' }) : copia('valor', 'reparto');
    out.calidad = copia('calidad', 'retrabajo');
    out.carga = s.pendienteEdad.some(function (x) { return x != null; }) ? desdeSerie('carga', s.pendienteEdad, 1, { dir: 'menos', formato: 'dias' }) : { id: 'carga', disponible: false, motivo: 'No hay trabajo pendiente suficiente para medirlo.' };
    return out;
  }

  function estadoMedida(id, v, ref, limEquipo, def) {
    if (v == null) return { estado: 'sin', texto: 'Sin datos suficientes en las últimas semanas.' };
    if (!def.dir) return { estado: 'neutro', texto: '' };
    var orden = { bien: 0, atencion: 1, critico: 2 };
    var fmt = function (x) { return formatear(x, def.formato); };
    function absoluto(lim) {
      if (!lim || (lim.atencion == null && lim.critico == null)) return null;
      if (def.dir === 'menos') {
        if (lim.critico != null && v >= lim.critico) return { estado: 'critico', texto: 'Llega al límite crítico de ' + fmt(lim.critico) + '.' };
        if (lim.atencion != null && v >= lim.atencion) return { estado: 'atencion', texto: 'Llega al límite de atención de ' + fmt(lim.atencion) + '.' };
      } else {
        if (lim.critico != null && v <= lim.critico) return { estado: 'critico', texto: 'Está por debajo del límite crítico de ' + fmt(lim.critico) + '.' };
        if (lim.atencion != null && v <= lim.atencion) return { estado: 'atencion', texto: 'Está por debajo del límite de atención de ' + fmt(lim.atencion) + '.' };
      }
      return { estado: 'bien', texto: 'Dentro de los límites del equipo.' };
    }
    if (limEquipo) return absoluto(limEquipo) || { estado: 'bien', texto: '' };
    var rel = null;
    if (ref) {
      var rango = 'su rango habitual (' + fmt(ref.lo) + ' a ' + fmt(ref.hi) + ')';
      var borde = def.dir === 'menos' ? ref.hi : ref.lo;
      var tol = Math.max(Math.abs(borde) * 0.25, DELTA_MIN[id] || 0);
      var margen = Math.max(Math.abs(borde) * 0.1, (DELTA_MIN[id] || 0) / 2);
      if (def.dir === 'menos') {
        if (v <= ref.hi + margen) rel = { estado: 'bien', texto: 'Dentro de ' + rango + ' o mejor.' };
        else if (v <= ref.hi + margen + tol) rel = { estado: 'atencion', texto: 'Peor que ' + rango + '.' };
        else rel = { estado: 'critico', texto: 'Bastante peor que ' + rango + '.' };
      } else {
        if (v >= ref.lo - margen) rel = { estado: 'bien', texto: 'Dentro de ' + rango + ' o mejor.' };
        else if (v >= ref.lo - margen - tol) rel = { estado: 'atencion', texto: 'Peor que ' + rango + '.' };
        else rel = { estado: 'critico', texto: 'Bastante peor que ' + rango + '.' };
      }
    }
    var abs = absoluto(def.limites);
    var cands = [rel, abs].filter(Boolean);
    if (!cands.length) return { estado: 'sin', texto: 'Aún no hay semanas suficientes para saber qué es lo habitual en este equipo.' };
    cands.sort(function (a, b) { return orden[b.estado] - orden[a.estado]; });
    return cands[0];
  }

  function formatear(x, formato) {
    if (x == null || isNaN(x)) return 'sin datos';
    var n1 = function (v) { return (Math.round(v * 10) / 10).toLocaleString('es-ES'); };
    if (formato === 'pct') return Math.round(x * 100) + '%';
    if (formato === 'dias') return n1(x) + (Math.abs(x - 1) < 0.05 ? ' día' : ' días');
    if (formato === 'horas') return n1(x) + ' h';
    if (formato === 'dec') return (Math.round(x * 100) / 100).toLocaleString('es-ES');
    return n1(x);
  }

  // ---------- sprints ----------
  function analizarSprints(items, c) {
    var out = { fiables: false, motivo: 'El export no trae sprints.', ultimos: [] };
    if (!c.det.haySprints) return out;
    if (c.det.sprintsComoFecha) { out.motivo = 'Los nombres de sprint parecen fechas, no sprints de verdad.'; return out; }
    var porSprint = {};
    items.forEach(function (d) {
      d.t.sprints.forEach(function (sp, i) {
        var x = porSprint[sp] = porSprint[sp] || { nombre: sp, tareas: [], cierres: [] };
        x.tareas.push({ d: d, ultimo: i === d.t.sprints.length - 1 });
        if (i === d.t.sprints.length - 1 && d.entregada) x.cierres.push(d.t.resuelta);
      });
    });
    var lista = Object.keys(porSprint).map(function (k) { return porSprint[k]; }).filter(function (x) { return x.cierres.length >= 3; });
    var recientes = items.filter(function (d) { return d.entregada && d.t.resuelta >= sumarDias(c.semanaFin, -84); });
    var conSprint = recientes.filter(function (d) { return d.t.sprints.length; }).length;
    if (!recientes.length || conSprint / recientes.length < 0.5) { out.motivo = 'Menos de la mitad del trabajo reciente está en sprints.'; return out; }
    var semanasSpan = Math.max(1, (c.fechaRef - c.det.fechaMin) / (7 * DIA));
    if (lista.length > semanasSpan + 2) { out.motivo = 'Hay más sprints que semanas: no parecen sprints de verdad.'; return out; }
    out.fiables = true; out.motivo = null;
    lista.forEach(function (x) {
      var cierres = x.cierres.map(function (d) { return d.getTime(); });
      x.fin = new Date(Math.max.apply(null, cierres));
      x.medio = cuantil(cierres, 0.5);
    });
    lista.sort(function (a, b) { return a.medio - b.medio; });
    var completados = lista.filter(function (x) { return x.fin < sumarDias(c.semanaFin, -1); });
    out.ultimos = completados.slice(-3).map(function (x) {
      var arrastradas = x.tareas.filter(function (y) { return !y.ultimo; }).length;
      var desde = diaLaborableAnterior(x.fin, 1);
      var finales = x.cierres.filter(function (d) { return d >= desde; }).length;
      return { nombre: x.nombre, tareas: x.tareas.length, arrastre: x.tareas.length ? arrastradas / x.tareas.length : null,
        alFinal: x.cierres.length ? finales / x.cierres.length : null, cerradas: x.cierres.length, fin: x.fin };
    });
    return out;
  }

  // ---------- vista de negocio ----------
  function negocio(items, c) {
    var desde = sumarDias(c.semanaFin, -84);
    var v = items.filter(function (d) { return d.entregada && d.t.resuelta >= desde && d.t.resuelta < c.semanaFin; });
    var ciclos = v.filter(function (d) { return d.ciclo != null; }).map(function (d) { return d.ciclo; });
    var totales = v.map(function (d) { return d.total; });
    var porEpica = {};
    v.forEach(function (d) { var k = d.t.padre || 'Sin épica'; porEpica[k] = (porEpica[k] || 0) + 1; });
    var epicas = Object.keys(porEpica).map(function (k) { return { nombre: k, n: porEpica[k], parte: porEpica[k] / v.length }; })
      .sort(function (a, b) { return b.n - a.n; });
    if (epicas.length > 6) {
      var resto = epicas.slice(5).reduce(function (s, e) { return s + e.n; }, 0);
      epicas = epicas.slice(0, 5).concat([{ nombre: 'Otras', n: resto, parte: resto / v.length }]);
    }
    var urg = v.filter(function (d) { return d.t.urgente; }).map(function (d) { return d.total; });
    var resto2 = v.filter(function (d) { return !d.t.urgente; }).map(function (d) { return d.total; });
    return { n: v.length, ciclo50: cuantil(ciclos, 0.5), ciclo85: cuantil(ciclos, 0.85), total50: cuantil(totales, 0.5), total85: cuantil(totales, 0.85),
      epicas: epicas, urgente: { n: urg.length, mediana: cuantil(urg, 0.5) }, resto: { n: resto2.length, mediana: cuantil(resto2, 0.5) } };
  }

  // ---------- calidad del dato ----------
  function calidadEquipo(items, c, sp, det) {
    var desde = sumarDias(c.semanaFin, -112);
    var ent = items.filter(function (d) { return d.entregada && d.t.resuelta >= desde; });
    var saltos = ent.filter(function (d) { return d.salto; }).length;
    var historias = items.filter(function (d) { return d.t.tipo === 'historia'; });
    var sinPuntos = historias.filter(function (d) { return d.t.puntos == null; }).length;
    var bloque = c.cierresBloque.filter(function (b) {
      return items.some(function (d) { return d.t.resuelta && Math.floor(d.t.resuelta.getTime() / 60000) === Math.floor(b.fecha.getTime() / 60000); });
    });
    var avisos = [];
    if (ent.length && saltos / ent.length > 0.05) avisos.push(Math.round(saltos / ent.length * 100) + '% de lo terminado pasó de pendiente a hecho sin estar en curso (' + saltos + ' tareas).');
    if (bloque.length) avisos.push(bloque.length === 1 ? 'Hay un cierre en bloque: ' + bloque[0].n + ' tareas cerradas en el mismo minuto (' + fechaCorta(bloque[0].fecha) + ').' : 'Hay ' + bloque.length + ' cierres en bloque (10 o más tareas cerradas en el mismo minuto).');
    var totales = ent.map(function (d) { return d.total; });
    if (ent.length >= 30 && cuantil(totales, 0.85) < 1) avisos.push('8 de cada 10 tareas se cierran en menos de un día desde que se crean: parece que se registran en Jira después de hacer el trabajo.');
    if (historias.length >= 10 && sinPuntos / historias.length > 0.3) avisos.push(Math.round(sinPuntos / historias.length * 100) + '% de las historias no tienen puntos.');
    if (det.haySprints && !sp.fiables && sp.motivo) avisos.push(sp.motivo);
    if (det.hayTis && items.length && items.filter(function (d) { return d.t.resuelta && !d.conTis; }).length / items.length > 0.2) avisos.push('Muchas tareas cerradas no traen Tiempo en estado.');
    return { saltos: saltos, saltosParte: ent.length ? saltos / ent.length : 0, sinPuntos: sinPuntos, historias: historias.length, cierresBloque: bloque, avisos: avisos };
  }
  function fechaCorta(d) {
    var m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ---------- casos ----------
  function evaluarCasos(eq, items, c) {
    var M = eq.medidas, s = eq.series, L = c.N - 1, out = [];
    var conf = eq.semanasConDatos >= 12 ? 'alta' : (eq.semanasConDatos >= 6 ? 'media' : 'baja');
    var f = formatear;
    function add(id, grave, evidencia, datos) { out.push({ id: id, gravedad: grave ? 'critico' : 'atencion', confianza: conf, evidencia: evidencia, datos: datos || {} }); }

    // 1 trabajo atascado
    if (eq.umbralEdad != null && eq.atascadas.length) {
      var n = eq.atascadas.length, maxR = eq.atascadas[0].edad / eq.umbralEdad;
      if (n >= 2 || maxR >= 2) add('atascado', n >= 4 || maxR >= 2.5,
        n + (n === 1 ? ' tarea en curso supera' : ' tareas en curso superan') + ' los ' + f(eq.umbralEdad, 'dias') + ' en los que el equipo termina 8 de cada 10 tareas. La más antigua, ' + eq.atascadas[0].clave + ', lleva ' + f(eq.atascadas[0].edad, 'dias') + '.',
        { n: n, umbral: eq.umbralEdad, maxEdad: eq.atascadas[0].edad, clave: eq.atascadas[0].clave });
    }
    // 2 demasiado a la vez
    var wipAct = media(s.wip.slice(Math.max(0, L - 3), L + 1)), wipRef = M.wip && M.wip.ref;
    var cicloRef = M.ciclo && M.ciclo.ref, entRef = M.entregas && M.entregas.ref;
    if (wipRef && cicloRef && entRef && M.ciclo.valor != null && wipAct > wipRef.hi * 1.2 && M.ciclo.valor > cicloRef.med * 1.2 && M.entregas.valor <= entRef.med * 1.25)
      add('demasiado_a_la_vez', wipAct > wipRef.hi * 1.6,
        'El trabajo en curso está en ' + f(wipAct, 'num') + ' tareas (lo habitual era ' + f(wipRef.med, 'num') + ') y el tiempo de ciclo ha pasado de ' + f(cicloRef.med, 'dias') + ' a ' + f(M.ciclo.valor, 'dias') + ', con las mismas entregas.',
        { wip: wipAct, wipRef: wipRef.med, cicloAntes: cicloRef.med, cicloAhora: M.ciclo.valor });
    // 3 sprint no se cumple
    var ult = eq.sprints.ultimos;
    var am = ult.length >= 3 ? media(ult.map(function (x) { return x.arrastre; })) : null;
    if (eq.sprints.fiables && am != null && am > 0.3 && ult.every(function (x) { return x.arrastre > 0.2; })) {
      add('sprint_no_cumple', am > 0.45, 'En los tres últimos sprints se arrastró de media el ' + f(am, 'pct') + ' del trabajo (' + ult.map(function (x) { return x.nombre + ': ' + f(x.arrastre, 'pct'); }).join('; ') + ').', { media: am });
    }
    // 4 pendiente crece
    if (L >= 8) {
      var semMas = 0;
      for (var w = L - 5; w <= L; w++) if (s.entradas[w] > s.salidas[w]) semMas++;
      var p0 = s.pendiente[L - 8], p1 = s.pendiente[L];
      if (semMas >= 4 && p1 - p0 >= 8 && p1 > p0 * 1.15)
        add('pendiente_crece', p1 > p0 * 1.4, 'En ' + semMas + ' de las últimas 6 semanas entró más de lo que salió. El pendiente ha pasado de ' + p0 + ' a ' + p1 + ' tareas en 8 semanas.', { desde: p0, hasta: p1, semanas: semMas });
    }
    // 5 mucha espera
    if (M.espera && M.espera.valor != null && M.espera.valor > 0.5) {
      var desde = c.semanas[Math.max(0, L - c.K + 1)];
      var acum = {};
      items.forEach(function (d) { if (d.entregada && d.t.resuelta >= desde && d.ciclo != null) Object.keys(d.porEstado).forEach(function (k) { acum[k] = (acum[k] || 0) + d.porEstado[k]; }); });
      var top = Object.keys(acum).sort(function (a, b) { return acum[b] - acum[a]; })[0];
      add('mucha_espera', M.espera.valor > 0.65, 'El ' + f(M.espera.valor, 'pct') + ' del tiempo de ciclo es espera.' + (top ? ' Donde más se para el trabajo es en "' + top + '".' : ''), { parte: M.espera.valor, estado: top });
    }
    // 6 retrabajo
    var rt = M.retrabajo;
    if (rt && rt.valor != null && (rt.valor >= 0.2 || (rt.ref && rt.valor > rt.ref.hi && rt.valor >= 0.12)))
      add('retrabajo', rt.valor >= 0.3, 'El ' + f(rt.valor, 'pct') + ' de lo terminado en las últimas 8 semanas volvió atrás al menos una vez' + (rt.ref ? ' (lo habitual era ' + f(rt.ref.med, 'pct') + ').' : '.'), { parte: rt.valor, habitual: rt.ref ? rt.ref.med : null });
    // 7 errores
    var er = M.errores;
    if (er && er.valor != null && er.valor >= 0.3 && (!er.ref || er.valor > er.ref.med))
      add('errores_capacidad', er.valor >= 0.4, 'El ' + f(er.valor, 'pct') + ' de lo terminado en las últimas 8 semanas son errores' + (er.ref ? ' (lo habitual era ' + f(er.ref.med, 'pct') + ').' : '.'), { parte: er.valor, habitual: er.ref ? er.ref.med : null });
    // 8 todo al final
    if (eq.sprints.fiables && ult.length >= 3) {
      var fm = media(ult.map(function (x) { return x.alFinal; }));
      if (fm > 0.5) add('todo_al_final', fm > 0.65, 'En los tres últimos sprints, el ' + f(fm, 'pct') + ' de las tareas se cerró en los dos últimos días.', { parte: fm });
    }
    // 9 entregas irregulares
    var rg = M.regularidad;
    if (rg && rg.valor != null && rg.valor > 0.6 && M.entregas.valor >= 2) {
      var emin = Math.min.apply(null, s.entregas.slice(L - 7, L + 1)), emax = Math.max.apply(null, s.entregas.slice(L - 7, L + 1));
      add('entregas_irregulares', rg.valor > 0.9, 'En las últimas 8 semanas las entregas han ido de ' + emin + ' a ' + emax + ' tareas por semana.', { min: emin, max: emax });
    }
    // 10 estimaciones
    var es = M.estimacion;
    if (es && es.disponible && es.valor != null && es.valor < 0.2) {
      var grupos = {};
      eq.ciclos.forEach(function (x) { if (x.puntos != null) (grupos[x.puntos] = grupos[x.puntos] || []).push(x.dias); });
      var ks = Object.keys(grupos).filter(function (k) { return grupos[k].length >= 5; }).map(Number).sort(function (a, b) { return a - b; });
      var txt = 'La relación entre puntos y duración es de ' + f(es.valor, 'dec') + ' sobre 1.';
      var pts = function (k) { return k + (k === 1 ? ' punto' : ' puntos'); };
      if (ks.length >= 2) txt += ' Las tareas de ' + pts(ks[0]) + ' tardan ' + f(cuantil(grupos[ks[0]], 0.5), 'dias') + ' de mediana; las de ' + pts(ks[ks.length - 1]) + ', ' + f(cuantil(grupos[ks[ks.length - 1]], 0.5), 'dias') + '.';
      add('estimaciones_no_predicen', false, txt, { rho: es.valor });
    }
    // 11 todo urgente
    var desde12 = c.semanas[Math.max(0, L - 11)];
    var creadas12 = items.filter(function (d) { return d.t.creada >= desde12 && d.t.creada < c.semanaFin; });
    if (creadas12.length >= 20) {
      var u = creadas12.filter(function (d) { return d.t.urgente; }).length / creadas12.length;
      if (u > 0.25) add('todo_urgente', u > 0.4, 'El ' + f(u, 'pct') + ' de lo que entró en las últimas 12 semanas tiene la prioridad máxima.', { parte: u });
    }
    // 12 urgente no va más rápido
    var ng = eq.negocio;
    if (ng.urgente.n >= 8 && ng.resto.n >= 8 && ng.urgente.mediana >= ng.resto.mediana * 0.9)
      add('urgente_no_rapido', ng.urgente.mediana >= ng.resto.mediana * 1.1, 'Lo urgente tarda ' + f(ng.urgente.mediana, 'dias') + ' de mediana desde que se pide; el resto, ' + f(ng.resto.mediana, 'dias') + '.', { urgente: ng.urgente.mediana, resto: ng.resto.mediana });
    // 13 datos poco fiables
    if (eq.calidad.avisos.length) add('datos_poco_fiables', eq.calidad.avisos.length >= 2, eq.calidad.avisos.join(' '), { avisos: eq.calidad.avisos.length });

    var ordenG = { critico: 0, atencion: 1 };
    out.sort(function (a, b) { return ordenG[a.gravedad] - ordenG[b.gravedad]; });
    return out;
  }

  return {
    leerCSV: leerCSV, mapearColumnas: mapearColumnas, leerFecha: leerFecha, ingerir: ingerir, detectar: detectar, calcular: calcular,
    formatear: formatear, fechaCorta: fechaCorta, etapaPropuesta: etapaPropuesta, cuantil: cuantil, media: media, inicioSemana: inicioSemana,
    OPCIONES_EQUIPO: OPCIONES_EQUIPO
  };
})();
if (typeof module !== 'undefined') module.exports = Motor;
