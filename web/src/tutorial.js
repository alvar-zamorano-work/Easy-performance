// Easy Performance: tutorial guiado sobre la propia interfaz.
// Recorre una lista de pasos; cada paso señala un elemento real de la página (por selector) y lo explica.
// Se usa con window.Tutorial.iniciar(pasos, opciones) y devuelve una promesa que se resuelve al cerrar.
// Cada paso: { sel, titulo, texto, antes? }. "antes" es una función que deja la página en el estado
// que necesita el paso (cambiar de pestaña, elegir un equipo) antes de buscar el elemento.
// Avanza con Siguiente o la flecha derecha; Anterior o la flecha izquierda vuelven; Esc cierra.
(function () {
  'use strict';
  var activo = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function reducido() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function iniciar(pasos, opciones) {
    opciones = opciones || {};
    if (activo) activo.cerrar('reiniciado');
    return new Promise(function (resolver) {
      var k = 0, raiz = document.createElement('div');
      raiz.className = 'tut';
      raiz.setAttribute('role', 'dialog');
      raiz.setAttribute('aria-modal', 'true');
      raiz.setAttribute('aria-label', 'Tutorial');
      raiz.innerHTML = '<div class="tut-foco" aria-hidden="true"></div><div class="tut-tarjeta"></div>';
      document.body.appendChild(raiz);
      document.body.classList.add('con-tutorial');
      var foco = raiz.querySelector('.tut-foco'), tarjeta = raiz.querySelector('.tut-tarjeta');
      var cerrado = false;

      function cerrar(motivo) {
        if (cerrado) return;
        cerrado = true; activo = null;
        document.removeEventListener('keydown', teclas, true);
        window.removeEventListener('resize', colocar);
        window.removeEventListener('scroll', colocar, true);
        raiz.classList.add('cerrando');
        document.body.classList.remove('con-tutorial');
        setTimeout(function () { raiz.remove(); if (opciones.alCerrar) opciones.alCerrar(motivo); resolver(motivo); }, reducido() ? 0 : 180);
      }
      function elemento() {
        var p = pasos[k];
        if (!p.sel) return null;
        return document.querySelector(p.sel);
      }
      function colocar() {
        if (cerrado) return;
        var el = elemento(), p = pasos[k];
        if (el) {
          var r = el.getBoundingClientRect(), m = 8;
          foco.hidden = false;
          foco.style.top = (r.top - m) + 'px'; foco.style.left = (r.left - m) + 'px';
          foco.style.width = (r.width + 2 * m) + 'px'; foco.style.height = (r.height + 2 * m) + 'px';
          // La tarjeta va debajo del elemento si cabe; si no, encima; si tampoco, al lado o centrada
          var th = tarjeta.offsetHeight || 220, tw = tarjeta.offsetWidth || 380;
          var abajo = r.bottom + m + 12, arriba = r.top - m - 12 - th;
          var top, left = Math.max(12, Math.min(window.innerWidth - tw - 12, r.left));
          if (abajo + th <= window.innerHeight - 12) top = abajo;
          else if (arriba >= 12) top = arriba;
          else if (r.right + m + 12 + tw <= window.innerWidth) { top = Math.max(12, Math.min(window.innerHeight - th - 12, r.top)); left = r.right + m + 12; }
          else { top = Math.max(12, window.innerHeight - th - 12); }
          tarjeta.style.top = top + 'px'; tarjeta.style.left = left + 'px';
          tarjeta.classList.remove('tut-centro');
        } else {
          foco.hidden = true;
          tarjeta.classList.add('tut-centro');
          tarjeta.style.top = ''; tarjeta.style.left = '';
        }
        tarjeta.classList.toggle('tut-sin-foco', !el);
      }
      function pintar() {
        if (cerrado) return;
        var p = pasos[k];
        try { if (p.antes) p.antes(); } catch (e) { if (window.console) console.error(e); }
        // Tras cambiar la página hay que esperar a que esté pintada para buscar el elemento
        setTimeout(function () {
          if (cerrado) return;
          var el = elemento();
          if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducido() ? 'auto' : 'smooth' });
          tarjeta.innerHTML = '<p class="tut-cuenta">Paso ' + (k + 1) + ' de ' + pasos.length + '</p><h3>' + esc(p.titulo) + '</h3><p class="tut-texto">' + p.texto + '</p>' +
            '<div class="tut-acc"><button type="button" class="btn-txt" data-tut="salir">Salir</button><span class="hueco"></span>' +
            '<button type="button" class="btn btn-sec" data-tut="anterior"' + (k ? '' : ' disabled') + '>Anterior</button>' +
            '<button type="button" class="btn" data-tut="siguiente">' + (k === pasos.length - 1 ? (p.ultimo || 'Terminar') : 'Siguiente') + '</button></div>';
          setTimeout(colocar, reducido() ? 0 : 260);
          colocar();
          var b = tarjeta.querySelector('[data-tut="siguiente"]'); if (b) b.focus({ preventScroll: true });
        }, 30);
      }
      function ir(d) {
        var n = k + d;
        if (n < 0) return;
        if (n >= pasos.length) { cerrar('fin'); return; }
        k = n; pintar();
      }
      function teclas(e) {
        if (e.key === 'Escape') { e.preventDefault(); cerrar('salido'); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); ir(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(-1); }
      }
      raiz.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tut]');
        if (!b) return;
        var a = b.getAttribute('data-tut');
        if (a === 'salir') cerrar('salido'); else if (a === 'anterior') ir(-1); else if (a === 'siguiente') ir(1);
      });
      document.addEventListener('keydown', teclas, true);
      window.addEventListener('resize', colocar);
      window.addEventListener('scroll', colocar, true);
      activo = { cerrar: cerrar, paso: function () { return k; } };
      requestAnimationFrame(function () { raiz.classList.add('abierto'); });
      pintar();
    });
  }

  window.Tutorial = { iniciar: iniciar, activo: function () { return !!activo; }, cerrar: function () { if (activo) activo.cerrar('salido'); } };
})();
