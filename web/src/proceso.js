// Easy Performance: animated process (the loading method). Each step is shown on its own; the presenter sets the pace
// with Next (or the right arrow). Used as window.Proceso.reproducir({ kicker, titulo, fuente, pasos, final }) and
// returns a promise that resolves when closed ('fin', 'saltado' or 'sin-animacion').
// Each step: { nombre, titulo, texto, visual (HTML), resultado (HTML), etiqueta? }.
// Inside a step, <b data-cuenta="1232" data-formato="num|eur|dec">0</b> counts up to the figure and elements with
// class="pe" enter staggered (style="--d:3" is their order). With "reduce motion" on, the process is skipped.
(function () {
  'use strict';
  var activo = null;

  function reducido() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function miles(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function formatear(v, f) {
    if (f === 'eur') return '€' + miles(v);
    if (f === 'pct') return Math.round(v * 100) + '%';
    if (f === 'dec') return (Math.round(v * 10) / 10).toLocaleString('en-GB');
    return miles(v);
  }
  function contar(raiz) {
    [].forEach.call(raiz.querySelectorAll('[data-cuenta]'), function (el) {
      var fin = +el.getAttribute('data-cuenta'), f = el.getAttribute('data-formato') || 'num', t0 = null, dur = 750;
      if (isNaN(fin)) return;
      if (reducido()) { el.textContent = formatear(fin, f); return; }
      var pe = el.closest('.pe'), d = pe ? parseFloat(getComputedStyle(pe).getPropertyValue('--d')) || 0 : 0, retraso = d * 90 + 150;
      el.textContent = formatear(0, f);
      function paso(t) {
        if (!el.isConnected) return;
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = formatear(fin * e, f);
        if (k < 1) requestAnimationFrame(paso);
      }
      setTimeout(function () { requestAnimationFrame(paso); }, retraso);
      setTimeout(function () { if (el.isConnected) el.textContent = formatear(fin, f); }, retraso + dur + 80);
    });
  }
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function reproducir(cfg) {
    if (activo) activo.cerrar('reemplazado');
    if (!cfg.siempre && (reducido() || window.EASY_PERFORMANCE_SIN_ANIMACION)) return Promise.resolve('sin-animacion');
    return new Promise(function (resolver) {
      var pasos = cfg.pasos, n = pasos.length, i = -1, cerrado = false, enFinal = false;
      var previoFoco = document.activeElement, previoOverflow = document.body.style.overflow;
      var raiz = document.createElement('div');
      raiz.className = 'proc';
      raiz.setAttribute('role', 'dialog');
      raiz.setAttribute('aria-modal', 'true');
      raiz.setAttribute('aria-labelledby', 'proc-titulo');
      raiz.innerHTML =
        '<div class="proc-in">' +
        '<header class="proc-cab"><div><p class="proc-kicker">' + (cfg.kicker || 'The method') + '</p><h2 id="proc-titulo">' + cfg.titulo + '</h2></div>' +
        (cfg.fuente ? '<span class="proc-fuente">' + cfg.fuente + '</span>' : '') + '</header>' +
        '<div class="proc-ruta" style="--n:' + n + '"><div class="proc-via"><span class="proc-avance"></span><span class="proc-viaje"></span></div><ol>' +
        pasos.map(function (p, k) {
          return '<li class="proc-est" data-k="' + k + '"><button type="button" class="proc-punto" data-proc="ir" data-k="' + k + '" aria-label="Step ' + (k + 1) + ': ' + p.nombre + '"><span class="proc-num">' + (k + 1) + '</span><span class="proc-ok">' + CHECK + '</span></button><span class="proc-nombre">' + p.nombre + '</span></li>';
        }).join('') + '</ol></div>' +
        '<section class="proc-escena" aria-live="polite"></section>' +
        '<footer class="proc-pie"><span class="proc-cuenta">' + (cfg.pie || '') + '</span><span class="proc-acc"></span></footer>' +
        '</div>';
      document.body.appendChild(raiz);
      document.body.style.overflow = 'hidden';
      var escena = raiz.querySelector('.proc-escena'), via = raiz.querySelector('.proc-via'), avance = raiz.querySelector('.proc-avance'),
        viaje = raiz.querySelector('.proc-viaje'), acc = raiz.querySelector('.proc-acc');
      var ests = [].slice.call(raiz.querySelectorAll('.proc-est'));
      requestAnimationFrame(function () { raiz.classList.add('abierto'); });

      function viajar(desde, hasta) {
        var ancho = via.getBoundingClientRect().width, tramo = n > 1 ? ancho / (n - 1) : 0;
        viaje.style.transition = 'none';
        viaje.style.opacity = '1';
        viaje.style.transform = 'translateX(' + Math.max(0, desde) * tramo + 'px)';
        void viaje.offsetWidth;
        viaje.style.transition = 'transform 650ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease-out 520ms';
        viaje.style.transform = 'translateX(' + hasta * tramo + 'px)';
        viaje.style.opacity = '0';
      }
      function pintarEstaciones(actual, todo) {
        ests.forEach(function (e, k) {
          e.classList.toggle('hecho', todo || k < actual);
          e.classList.toggle('activo', !todo && k === actual);
        });
        var f = todo ? 1 : (n > 1 ? actual / (n - 1) : 1);
        avance.style.transform = 'scaleX(' + f + ')';
      }
      var BOTONES = '<button type="button" class="proc-saltar" data-proc="saltar">Skip</button>' +
        '<button type="button" class="btn btn-proc-sec" data-proc="anterior">Back</button><button type="button" class="btn btn-claro" data-proc="siguiente">Next</button>';
      function botonesPaso(k) {
        if (!acc.querySelector('[data-proc="siguiente"]')) acc.innerHTML = BOTONES;
        acc.querySelector('[data-proc="anterior"]').disabled = k === 0;
        acc.querySelector('[data-proc="siguiente"]').textContent = k === n - 1 ? (cfg.ultimo || 'See the result') : 'Next';
      }
      function mostrar(k, previo) {
        var p = pasos[k];
        enFinal = false;
        if (previo != null && previo >= 0 && previo !== k) viajar(Math.min(previo, n - 1), k);
        pintarEstaciones(k, false);
        escena.innerHTML = '<div class="proc-texto pe" style="--d:0"><p class="proc-paso">Step ' + (k + 1) + ' of ' + n +
          (p.etiqueta ? ' <span class="proc-etiqueta">' + p.etiqueta + '</span>' : '') + '</p><h3>' + p.titulo + '</h3><p>' + p.texto + '</p>' +
          (p.resultado ? '<p class="proc-res pe" style="--d:4">' + p.resultado + '</p>' : '') + '</div>' +
          '<div class="proc-visual pe" style="--d:1">' + (p.visual || '') + '</div>';
        escena.classList.remove('entra'); void escena.offsetWidth; escena.classList.add('entra');
        contar(escena);
        botonesPaso(k);
      }
      function final() {
        enFinal = true;
        pintarEstaciones(n - 1, true);
        var f = cfg.final || {};
        escena.innerHTML = '<div class="proc-texto pe" style="--d:0"><p class="proc-paso">Done</p><h3>' + (f.titulo || 'Done') + '</h3><p>' + (f.texto || '') + '</p></div>' +
          '<div class="proc-visual pe" style="--d:1">' + (f.visual || '') + '</div>';
        escena.classList.remove('entra'); void escena.offsetWidth; escena.classList.add('entra');
        contar(escena);
        acc.innerHTML = '<button type="button" class="proc-saltar" data-proc="repetir">Replay</button><button type="button" class="btn btn-proc-sec" data-proc="anterior">Back</button><button type="button" class="btn btn-claro" data-proc="fin">' + (f.boton || 'Continue') + '</button>';
        var b = acc.querySelector('[data-proc="fin"]'); if (b) b.focus();
      }
      function ir(k) {
        if (cerrado) return;
        var previo = enFinal ? n - 1 : i;
        i = Math.max(0, Math.min(k, n));
        if (i < n) mostrar(i, previo); else final();
      }
      function siguiente() { if (!enFinal) ir(i + 1); }
      function anterior() { if (enFinal) ir(n - 1); else if (i > 0) ir(i - 1); }
      function cerrar(motivo) {
        if (cerrado) return;
        cerrado = true;
        document.removeEventListener('keydown', teclas, true);
        raiz.classList.remove('abierto');
        raiz.classList.add('cerrando');
        document.body.style.overflow = previoOverflow;
        setTimeout(function () { raiz.remove(); }, 220);
        if (activo === control) activo = null;
        if (previoFoco && previoFoco.isConnected && previoFoco.focus) { try { previoFoco.focus(); } catch (e) { } }
        resolver(motivo);
      }
      function teclas(e) {
        if (e.key === 'Escape') { e.preventDefault(); cerrar('saltado'); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
      }
      raiz.addEventListener('click', function (e) {
        var b = e.target.closest('[data-proc]');
        if (!b) return;
        var a = b.getAttribute('data-proc');
        if (a === 'saltar') cerrar('saltado');
        else if (a === 'fin') cerrar('fin');
        else if (a === 'siguiente') siguiente();
        else if (a === 'anterior') anterior();
        else if (a === 'ir') ir(+b.getAttribute('data-k'));
        else if (a === 'repetir') { acc.innerHTML = ''; i = -1; enFinal = false; ir(0); }
        if (!cerrado && a !== 'saltar' && a !== 'fin') { var pr = acc.querySelector('[data-proc="siguiente"], [data-proc="fin"]'); if (pr) pr.focus(); }
      });
      document.addEventListener('keydown', teclas, true);
      var control = { cerrar: cerrar };
      activo = control;
      ir(0);
      var s = acc.querySelector('[data-proc="siguiente"]'); if (s) s.focus();
    });
  }

  window.Proceso = { reproducir: reproducir, reducido: reducido, miles: miles, activo: function () { return !!activo; }, cerrar: function () { if (activo) activo.cerrar('saltado'); } };
})();
