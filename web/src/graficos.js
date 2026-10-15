/* Gráficos SVG propios de Easy Performance: sin librerías, funcionan sin conexión.
   Colores por rol (variables CSS); el texto nunca lleva el color de la serie. */
var G = (function () {
  'use strict';
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sem(d) { return d.getDate() + ' ' + MESES[d.getMonth()]; }
  function n1(v) { return (Math.round(v * 10) / 10).toLocaleString('es-ES'); }
  function fmt(v, f) { return (typeof Motor !== 'undefined') ? Motor.formatear(v, f) : n1(v); }
  // Techo "redondo" para el eje: deja poco hueco por encima del máximo
  function limpio(max) {
    if (max <= 0) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(max))), m = max / e;
    var pasos = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < pasos.length; i++) if (m <= pasos[i] + 1e-9) return pasos[i] * e;
    return 10 * e;
  }
  // Tres líneas de referencia (cero, mitad y techo): suficiente para leer, sin ruido
  function marcas(max) {
    var techo = limpio(max);
    return [0, techo / 2, techo];
  }
  function ejeTexto(v, formato) {
    if (formato === 'pct') return Math.round(v * 100) + '%';
    if (Math.abs(v) >= 1000) return n1(v / 1000) + ' mil';
    return (Math.round(v * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  }
  function lienzo(ancho, alto, cuerpo, etiqueta) {
    return '<svg class="g" viewBox="0 0 ' + ancho + ' ' + alto + '" width="100%" role="img" aria-label="' + esc(etiqueta || '') + '">' + cuerpo + '</svg>';
  }
  function rejilla(m, ancho, alto, ticks, escalaY, formato) {
    var s = '';
    ticks.forEach(function (t) {
      var y = escalaY(t);
      s += '<line x1="' + m.l + '" x2="' + (ancho - m.r) + '" y1="' + y + '" y2="' + y + '" class="g-rej"/>';
      s += '<text x="' + (m.l - 6) + '" y="' + (y + 4) + '" class="g-eje" text-anchor="end">' + ejeTexto(t, formato) + '</text>';
    });
    return s;
  }
  function ejeX(m, ancho, alto, fechas, x) {
    var s = '', n = fechas.length, cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((ancho - m.l - m.r) / 70))));
    for (var i = n - 1; i >= 0; i -= cada) s += '<text x="' + x(i) + '" y="' + (alto - 6) + '" class="g-eje" text-anchor="middle">' + sem(fechas[i]) + '</text>';
    return s;
  }

  // Línea semanal con banda del rango habitual del propio equipo
  function linea(o) {
    var ancho = o.ancho || 640, alto = o.alto || 210, m = { l: 44, r: 16, t: 12, b: 26 };
    var serie = o.serie, fechas = o.fechas, n = serie.length;
    var vals = serie.filter(function (v) { return v != null; });
    if (vals.length < 2) return vacio(ancho, 'Aún no hay semanas suficientes para dibujar la evolución.');
    var max = Math.max.apply(null, vals.concat(o.banda ? [o.banda.hi] : []));
    var ticks = marcas(max * 1.05, o.formato), top = ticks[ticks.length - 1];
    var x = function (i) { return m.l + (n === 1 ? 0 : i * (ancho - m.l - m.r) / (n - 1)); };
    var y = function (v) { return alto - m.b - (v / top) * (alto - m.t - m.b); };
    var s = rejilla(m, ancho, alto, ticks, y, o.formato);
    if (o.banda) {
      s += '<rect x="' + m.l + '" width="' + (ancho - m.l - m.r) + '" y="' + y(o.banda.hi) + '" height="' + Math.max(1, y(o.banda.lo) - y(o.banda.hi)) + '" class="g-banda"><title>Lo habitual del equipo</title></rect>';
      s += '<text x="' + (m.l + 6) + '" y="' + (y(o.banda.hi) - 5) + '" class="g-nota g-nota-banda">lo habitual</text>';
    }
    // Historia en gris y semanas que cuentan para el valor actual en azul
    var corte = o.destacar ? Math.max(0, n - o.destacar) : n;
    function trazo(desde, hasta) {
      var d = '', abierto = false;
      for (var i = desde; i <= hasta; i++) {
        var v = serie[i];
        if (v == null) { abierto = false; continue; }
        d += (abierto ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        abierto = true;
      }
      return d;
    }
    if (corte > 0) s += '<path d="' + trazo(0, Math.min(n - 1, o.destacar ? corte - 1 : corte)) + '" class="' + (o.destacar ? 'g-linea-hist' : 'g-linea') + '"/>';
    if (o.destacar) s += '<path d="' + trazo(Math.max(0, corte - 1), n - 1) + '" class="g-linea"/>';
    var ult = -1; for (var k = n - 1; k >= 0; k--) if (serie[k] != null) { ult = k; break; }
    if (ult >= 0) {
      s += '<circle cx="' + x(ult) + '" cy="' + y(serie[ult]) + '" r="4.5" class="g-punto"/>';
      s += '<text x="' + Math.min(x(ult) - 8, ancho - m.r - 2) + '" y="' + (y(serie[ult]) - 10) + '" class="g-valor" text-anchor="end">' + esc(fmt(serie[ult], o.formato)) + '</text>';
    }
    // zonas de lectura por semana
    var paso = (ancho - m.l - m.r) / Math.max(1, n - 1);
    serie.forEach(function (v, i) {
      var tip = 'Semana del ' + sem(fechas[i]) + ': ' + (v == null ? 'sin datos' : fmt(v, o.formato));
      s += '<rect x="' + (x(i) - paso / 2) + '" y="' + m.t + '" width="' + paso + '" height="' + (alto - m.t - m.b) + '" class="g-hit" data-tip="' + esc(tip) + '"/>';
    });
    s += ejeX(m, ancho, alto, fechas, x);
    return lienzo(ancho, alto, s, o.titulo);
  }

  // Columnas por semana
  function columnas(o) {
    var ancho = o.ancho || 640, alto = o.alto || 210, m = { l: 44, r: 16, t: 14, b: 26 };
    var serie = o.serie, fechas = o.fechas, n = serie.length;
    var vals = serie.filter(function (v) { return v != null; });
    if (!vals.length) return vacio(ancho, 'Sin datos para estas semanas.');
    var max = Math.max.apply(null, vals.concat(o.banda ? [o.banda.hi] : [])) || 1;
    var ticks = marcas(max * 1.05, o.formato), top = ticks[ticks.length - 1];
    var banda = (ancho - m.l - m.r) / n, w = Math.min(24, Math.max(3, banda - 2));
    var x = function (i) { return m.l + banda * i + banda / 2; };
    var y = function (v) { return alto - m.b - (v / top) * (alto - m.t - m.b); };
    var s = rejilla(m, ancho, alto, ticks, y, o.formato);
    if (o.banda) s += '<rect x="' + m.l + '" width="' + (ancho - m.l - m.r) + '" y="' + y(o.banda.hi) + '" height="' + Math.max(1, y(o.banda.lo) - y(o.banda.hi)) + '" class="g-banda"/>';
    serie.forEach(function (v, i) {
      var tip = 'Semana del ' + sem(fechas[i]) + ': ' + (v == null ? 'sin datos' : fmt(v, o.formato));
      if (v != null && v > 0) {
        var h = (alto - m.b) - y(v), x0 = x(i) - w / 2, y0 = y(v), r = Math.min(4, w / 2, h);
        s += '<path d="M' + x0 + ' ' + (alto - m.b) + 'V' + (y0 + r) + 'Q' + x0 + ' ' + y0 + ' ' + (x0 + r) + ' ' + y0 + 'H' + (x0 + w - r) + 'Q' + (x0 + w) + ' ' + y0 + ' ' + (x0 + w) + ' ' + (y0 + r) + 'V' + (alto - m.b) + 'Z" class="g-col' + (i >= n - (o.destacar || 0) ? ' g-col-act' : '') + '"/>';
      }
      s += '<rect x="' + (x(i) - banda / 2) + '" y="' + m.t + '" width="' + banda + '" height="' + (alto - m.t - m.b) + '" class="g-hit" data-tip="' + esc(tip) + '"/>';
    });
    s += '<line x1="' + m.l + '" x2="' + (ancho - m.r) + '" y1="' + (alto - m.b) + '" y2="' + (alto - m.b) + '" class="g-base"/>';
    s += ejeX(m, ancho, alto, fechas, x);
    return lienzo(ancho, alto, s, o.titulo);
  }

  // Un punto por tarea terminada, con la mediana y el "8 de cada 10"
  function puntos(o) {
    var ancho = o.ancho || 640, alto = o.alto || 230, m = { l: 44, r: 92, t: 12, b: 26 };
    var items = o.items;
    if (items.length < 3) return vacio(ancho, 'Pocas tareas terminadas para dibujar este gráfico.');
    var t0 = Math.min.apply(null, items.map(function (d) { return d.fecha.getTime(); })), t1 = Math.max.apply(null, items.map(function (d) { return d.fecha.getTime(); }));
    var vals = items.map(function (d) { return d.dias; }), p50 = Motor.cuantil(vals, 0.5), p85 = Motor.cuantil(vals, 0.85);
    var max = Math.min(Math.max.apply(null, vals), p85 * 3);
    var ticks = marcas(max * 1.05, 'num'), top = ticks[ticks.length - 1];
    var x = function (t) { return m.l + (t1 === t0 ? 0 : (t - t0) / (t1 - t0) * (ancho - m.l - m.r)); };
    var y = function (v) { return alto - m.b - (Math.min(v, top) / top) * (alto - m.t - m.b); };
    var s = rejilla(m, ancho, alto, ticks, y, 'num');
    items.forEach(function (d) {
      var tip = d.clave + ' · ' + d.resumen + ' · ' + fmt(d.dias, 'dias') + (d.dias > top ? ' (fuera de escala)' : '');
      s += '<circle cx="' + x(d.fecha.getTime()).toFixed(1) + '" cy="' + y(d.dias).toFixed(1) + '" r="4" class="g-dot"/>';
      s += '<circle cx="' + x(d.fecha.getTime()).toFixed(1) + '" cy="' + y(d.dias).toFixed(1) + '" r="9" class="g-hit" data-tip="' + esc(tip) + '"/>';
    });
    [[p50, 'la mitad, ' + fmt(p50, 'dias')], [p85, '8 de 10, ' + fmt(p85, 'dias')]].forEach(function (r) {
      s += '<line x1="' + m.l + '" x2="' + (ancho - m.r) + '" y1="' + y(r[0]) + '" y2="' + y(r[0]) + '" class="g-ref"/>';
      s += '<text x="' + (ancho - m.r + 6) + '" y="' + (y(r[0]) + 4) + '" class="g-nota">' + esc(r[1]) + '</text>';
    });
    var fechas = [new Date(t0), new Date((t0 + t1) / 2), new Date(t1)];
    fechas.forEach(function (f) { s += '<text x="' + x(f.getTime()) + '" y="' + (alto - 6) + '" class="g-eje" text-anchor="middle">' + sem(f) + '</text>'; });
    return lienzo(ancho, alto, s, o.titulo);
  }

  // Cuántas tareas terminan en 1, 2, 3... días
  function tramos(o) {
    var vals = o.items.map(function (d) { return d.dias; });
    if (vals.length < 3) return vacio(o.ancho || 640, 'Pocas tareas terminadas para dibujar este gráfico.');
    var lim = [1, 2, 3, 5, 8, 13, 21], etiquetas = ['1 día o menos', '2', '3', '4 a 5', '6 a 8', '9 a 13', '14 a 21', 'más de 21'];
    var cuenta = new Array(lim.length + 1).fill(0);
    vals.forEach(function (v) { var i = 0; while (i < lim.length && v > lim[i]) i++; cuenta[i]++; });
    var ancho = o.ancho || 640, alto = o.alto || 220, m = { l: 44, r: 16, t: 14, b: 40 }, n = cuenta.length;
    var ticks = marcas(Math.max.apply(null, cuenta) * 1.05, 'num'), top = ticks[ticks.length - 1];
    var banda = (ancho - m.l - m.r) / n, w = Math.min(24, banda - 4);
    var x = function (i) { return m.l + banda * i + banda / 2; };
    var y = function (v) { return alto - m.b - (v / top) * (alto - m.t - m.b); };
    var s = rejilla(m, ancho, alto, ticks, y, 'num');
    cuenta.forEach(function (v, i) {
      if (v > 0) {
        var x0 = x(i) - w / 2, y0 = y(v), r = Math.min(4, (alto - m.b) - y0);
        s += '<path d="M' + x0 + ' ' + (alto - m.b) + 'V' + (y0 + r) + 'Q' + x0 + ' ' + y0 + ' ' + (x0 + r) + ' ' + y0 + 'H' + (x0 + w - r) + 'Q' + (x0 + w) + ' ' + y0 + ' ' + (x0 + w) + ' ' + (y0 + r) + 'V' + (alto - m.b) + 'Z" class="g-col"/>';
        s += '<text x="' + x(i) + '" y="' + (y0 - 4) + '" class="g-eje" text-anchor="middle">' + v + '</text>';
      }
      s += '<rect x="' + (x(i) - banda / 2) + '" y="' + m.t + '" width="' + banda + '" height="' + (alto - m.t - m.b) + '" class="g-hit" data-tip="' + esc(etiquetas[i] + (i === 0 ? '' : ' días') + ': ' + v + ' tareas') + '"/>';
      s += '<text x="' + x(i) + '" y="' + (alto - m.b + 16) + '" class="g-eje" text-anchor="middle">' + esc(etiquetas[i].replace(' o menos', '')) + '</text>';
    });
    s += '<text x="' + (ancho / 2) + '" y="' + (alto - 4) + '" class="g-eje" text-anchor="middle">días desde que se empieza</text>';
    return lienzo(ancho, alto, s, o.titulo);
  }

  // Reparto por tipo: columnas apiladas al 100%
  var TIPOS = [['historia', 'Historias', 's1'], ['error', 'Errores', 's2'], ['tarea', 'Tareas', 's3'], ['otro', 'Otros', 's4']];
  function apilado(o) {
    var ancho = o.ancho || 640, alto = o.alto || 220, m = { l: 44, r: 16, t: 12, b: 26 };
    var serie = o.serie, fechas = o.fechas, n = serie.length;
    if (!serie.some(Boolean)) return vacio(ancho, 'Sin datos de tipo de tarea.');
    var banda = (ancho - m.l - m.r) / n, w = Math.min(24, Math.max(3, banda - 2));
    var x = function (i) { return m.l + banda * i + banda / 2; };
    var y = function (v) { return alto - m.b - v * (alto - m.t - m.b); };
    var s = rejilla(m, ancho, alto, [0, 0.5, 1], y, 'pct');
    serie.forEach(function (r, i) {
      if (!r) return;
      var acum = 0, tip = 'Semana del ' + sem(fechas[i]) + ' (últimas 8 semanas): ';
      TIPOS.forEach(function (t) {
        var v = r[t[0]] || 0; if (v <= 0) return;
        var y1 = y(acum), y0 = y(acum + v);
        s += '<rect x="' + (x(i) - w / 2) + '" y="' + (y0 + 1) + '" width="' + w + '" height="' + Math.max(0, y1 - y0 - 2) + '" class="g-' + t[2] + '"/>';
        acum += v;
      });
      tip += TIPOS.map(function (t) { return t[1].toLowerCase() + ' ' + Math.round((r[t[0]] || 0) * 100) + '%'; }).join(', ');
      s += '<rect x="' + (x(i) - banda / 2) + '" y="' + m.t + '" width="' + banda + '" height="' + (alto - m.t - m.b) + '" class="g-hit" data-tip="' + esc(tip) + '"/>';
    });
    s += ejeX(m, ancho, alto, fechas, x);
    return lienzo(ancho, alto, s, o.titulo) + leyenda(TIPOS.map(function (t) { return [t[1], t[2]]; }));
  }

  // Dos líneas: entradas y salidas
  function dosLineas(o) {
    var ancho = o.ancho || 640, alto = o.alto || 210, m = { l: 44, r: 70, t: 12, b: 26 };
    var a = o.a, b = o.b, fechas = o.fechas, n = a.length;
    var max = Math.max.apply(null, a.concat(b)) || 1;
    var ticks = marcas(max * 1.05, 'num'), top = ticks[ticks.length - 1];
    var x = function (i) { return m.l + (n === 1 ? 0 : i * (ancho - m.l - m.r) / (n - 1)); };
    var y = function (v) { return alto - m.b - (v / top) * (alto - m.t - m.b); };
    var s = rejilla(m, ancho, alto, ticks, y, 'num');
    [[a, 's1', o.nombreA], [b, 's2', o.nombreB]].forEach(function (p) {
      var d = p[0].map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      s += '<path d="' + d + '" class="g-linea g-l-' + p[1] + '"/>';
      s += '<circle cx="' + x(n - 1) + '" cy="' + y(p[0][n - 1]) + '" r="4.5" class="g-punto g-p-' + p[1] + '"/>';
    });
    var ya = y(a[n - 1]), yb = y(b[n - 1]);
    if (Math.abs(ya - yb) < 14) { if (ya <= yb) { ya -= 7; yb += 7; } else { ya += 7; yb -= 7; } }
    s += '<text x="' + (ancho - m.r + 8) + '" y="' + (ya + 4) + '" class="g-nota">' + esc(o.nombreA) + '</text>';
    s += '<text x="' + (ancho - m.r + 8) + '" y="' + (yb + 4) + '" class="g-nota">' + esc(o.nombreB) + '</text>';
    var paso = (ancho - m.l - m.r) / Math.max(1, n - 1);
    a.forEach(function (v, i) {
      s += '<rect x="' + (x(i) - paso / 2) + '" y="' + m.t + '" width="' + paso + '" height="' + (alto - m.t - m.b) + '" class="g-hit" data-tip="' + esc('Semana del ' + sem(fechas[i]) + ': ' + o.nombreA.toLowerCase() + ' ' + v + ', ' + o.nombreB.toLowerCase() + ' ' + b[i]) + '"/>';
    });
    s += ejeX(m, ancho, alto, fechas, x);
    return lienzo(ancho, alto, s, o.titulo) + leyenda([[o.nombreA, 's1'], [o.nombreB, 's2']]);
  }

  // Edad de cada tarea en curso, por estado, frente a lo habitual del equipo
  function edad(o) {
    var items = o.items, umbral = o.umbral;
    if (!items.length) return vacio(o.ancho || 640, 'No hay tareas en curso.');
    var estados = [];
    items.forEach(function (d) { if (estados.indexOf(d.estado) < 0) estados.push(d.estado); });
    estados.sort(function (a, b) { var o2 = { curso: 0, espera: 1 }; var ea = items.filter(function (d) { return d.estado === a; })[0].etapa, eb = items.filter(function (d) { return d.estado === b; })[0].etapa; return o2[ea] - o2[eb]; });
    var ancho = o.ancho || 640, alto = o.alto || 230, m = { l: 44, r: 100, t: 12, b: 30 };
    var max = Math.max.apply(null, items.map(function (d) { return d.edad; }).concat([umbral || 0]));
    var ticks = marcas(max * 1.05, 'num'), top = ticks[ticks.length - 1];
    var banda = (ancho - m.l - m.r) / estados.length;
    var y = function (v) { return alto - m.b - (v / top) * (alto - m.t - m.b); };
    var s = rejilla(m, ancho, alto, ticks, y, 'num');
    estados.forEach(function (e, i) {
      var cx = m.l + banda * i + banda / 2;
      var grupo = items.filter(function (d) { return d.estado === e; });
      grupo.forEach(function (d, k) {
        var desv = ((k % 5) - 2) * Math.min(9, banda / 8);
        var fuera = umbral != null && d.edad > umbral;
        s += '<circle cx="' + (cx + desv) + '" cy="' + y(d.edad) + '" r="4.5" class="' + (fuera ? 'g-dot-aviso' : 'g-dot') + '"/>';
        s += '<circle cx="' + (cx + desv) + '" cy="' + y(d.edad) + '" r="9" class="g-hit" data-tip="' + esc(d.clave + ' · ' + d.resumen + ' · ' + e + ' · lleva ' + fmt(d.edad, 'dias')) + '"/>';
      });
      s += '<text x="' + cx + '" y="' + (alto - 10) + '" class="g-eje" text-anchor="middle">' + esc(e.length > 16 ? e.slice(0, 15) + '…' : e) + '</text>';
    });
    if (umbral != null) {
      s += '<line x1="' + m.l + '" x2="' + (ancho - m.r) + '" y1="' + y(umbral) + '" y2="' + y(umbral) + '" class="g-ref"/>';
      s += '<text x="' + (ancho - m.r + 6) + '" y="' + (y(umbral) - 2) + '" class="g-nota">lo habitual:</text>';
      s += '<text x="' + (ancho - m.r + 6) + '" y="' + (y(umbral) + 12) + '" class="g-nota">' + esc(fmt(umbral, 'dias')) + '</text>';
    }
    return lienzo(ancho, alto, s, o.titulo) + leyenda([['Dentro de lo habitual', 'dot'], ['Por encima de lo habitual', 'aviso']]);
  }

  // Barras horizontales de cambio frente a la propia referencia (orden fijo, no es ranking)
  function cambios(o) {
    var filas = o.filas, ancho = o.ancho || 640, fila = 34, m = { l: 140, r: 90, t: 8, b: 8 };
    var alto = m.t + m.b + filas.length * fila;
    var max = Math.max(0.25, Math.max.apply(null, filas.map(function (f) { return f.cambio == null ? 0 : Math.abs(f.cambio); })));
    var cx = m.l + (ancho - m.l - m.r) / 2, esc2 = (ancho - m.l - m.r) / 2 / max;
    var s = '<line x1="' + cx + '" x2="' + cx + '" y1="' + m.t + '" y2="' + (alto - m.b) + '" class="g-base"/>';
    filas.forEach(function (f, i) {
      var yc = m.t + i * fila + fila / 2;
      s += '<text x="' + (m.l - 10) + '" y="' + (yc + 4) + '" class="g-etq" text-anchor="end">' + esc(f.nombre) + '</text>';
      if (f.cambio == null) { s += '<text x="' + cx + '" y="' + (yc + 4) + '" class="g-eje" text-anchor="middle">sin datos</text>'; return; }
      var w = Math.max(2, Math.abs(f.cambio) * esc2), x0 = f.cambio >= 0 ? cx : cx - w;
      s += '<rect x="' + x0 + '" y="' + (yc - 9) + '" width="' + w + '" height="18" rx="4" class="g-est-' + f.estado + '"/>';
      var txt = (f.cambio > 0 ? '+' : '') + Math.round(f.cambio * 100) + '%';
      s += '<text x="' + (f.cambio >= 0 ? cx + w + 6 : cx - w - 6) + '" y="' + (yc + 4) + '" class="g-valor" text-anchor="' + (f.cambio >= 0 ? 'start' : 'end') + '">' + txt + '</text>';
      s += '<rect x="' + m.l + '" y="' + (yc - fila / 2) + '" width="' + (ancho - m.l - m.r) + '" height="' + fila + '" class="g-hit" data-tip="' + esc(f.tip) + '"/>';
    });
    return lienzo(ancho, alto, s, o.titulo);
  }

  // Línea mínima para las tarjetas
  function chispa(serie) {
    var v = serie.slice(-12).filter(function (x) { return x != null; });
    if (v.length < 3) return '';
    var ancho = 120, alto = 32, min = Math.min.apply(null, v), max = Math.max.apply(null, v), r = (max - min) || 1;
    var x = function (i) { return 2 + i * (ancho - 8) / (v.length - 1); }, y = function (z) { return alto - 4 - (z - min) / r * (alto - 8); };
    var d = v.map(function (z, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(z).toFixed(1); }).join(' ');
    return '<svg class="chispa" viewBox="0 0 ' + ancho + ' ' + alto + '" aria-hidden="true"><path d="' + d + '" class="g-chispa"/><circle cx="' + x(v.length - 1) + '" cy="' + y(v[v.length - 1]) + '" r="3" class="g-punto"/></svg>';
  }

  function leyenda(items) {
    return '<div class="leyenda">' + items.map(function (it) { return '<span><i class="lg lg-' + it[1] + '"></i>' + esc(it[0]) + '</span>'; }).join('') + '</div>';
  }
  function vacio(ancho, texto) { return '<p class="g-vacio">' + esc(texto) + '</p>'; }

  return { linea: linea, columnas: columnas, puntos: puntos, tramos: tramos, apilado: apilado, dosLineas: dosLineas, edad: edad, cambios: cambios, chispa: chispa, esc: esc, sem: sem, TIPOS: TIPOS };
})();
