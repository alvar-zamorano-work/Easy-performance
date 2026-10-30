/* easyperformance v3: asistente de chat. Responde sobre el paquete de diagnóstico ya calculado (nunca sobre los CSV).
   Cada cifra de la respuesta se comprueba contra el paquete; si alguna no cuadra, la respuesta no se enseña. */
(function () {
  const EP = window.EP;
  const { S, t, esc, nombreEquipo, cat } = EP;
  const IA = EP.N.IA;
  const CLAVE = 'easyperformance.v3.chat';
  S.chat = { open: false, msgs: [], busy: false, draft: '' };
  try { const g = JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); if (g && Array.isArray(g.msgs)) S.chat.msgs = g.msgs.slice(-40); } catch (e) { }
  const persistir = () => { try { sessionStorage.setItem(CLAVE, JSON.stringify({ msgs: S.chat.msgs.slice(-40) })); } catch (e) { } };

  /** Equipo del que se pregunta: la ficha abierta o el equipo del rol Equipo. */
  const equipoActual = () => (S.role === 'equipo' ? S.team : S.view === 'equipos' && !S.teamCompare ? S.team : null);
  const pantalla = () => { const e = equipoActual(); return e && S.view === 'equipos' ? t('asistente.ctxEquipo', { e: nombreEquipo(e) }) : t('nav.' + S.view); };

  // Enlaza nombres de equipo en una respuesta ya convertida a HTML
  function enlazar(html) {
    if (!S.vm) return html;
    // Una sola pasada con todos los nombres (los más largos primero), sobre el texto ya escapado y fuera de las etiquetas
    const porEscapado = {};
    S.vm.equipos.forEach((e) => { porEscapado[esc(e.nombre)] = e.nombre; });
    const claves = Object.keys(porEscapado).sort((a, b) => b.length - a.length);
    if (!claves.length) return html;
    const re = new RegExp('(^|[^\\wÀ-ÿ])(' + claves.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\wÀ-ÿ])', 'g');
    return String(html).split(/(<[^>]+>)/).map((p) => (!p || p.charAt(0) === '<' ? p
      : p.replace(re, (m0, antes, n) => `${antes}<button class="link" data-action="open-team" data-team="${esc(porEscapado[n])}">${n}</button>`))).join('');
  }

  function asistente() {
    const el = document.getElementById('assistant'), fab = document.getElementById('assistant-fab');
    const enApp = !!(S.onboarded && S.vm && !S.presenting && !S.error);
    if (fab) fab.classList.toggle('hidden', !enApp || S.chat.open);
    if (!el) return;
    if (!enApp || !S.chat.open) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const clave = !!S.ia.clave, libre = clave && !S.chat.busy;
    const sug = [1, 2, 3].map((i) => t('asistente.sug.' + S.role + '.' + i));
    const msgs = S.chat.msgs.map((m, i) => {
      if (m.rol === 'usuario') return `<div class="msg user"><p>${esc(m.texto)}</p></div>`;
      if (m.rechazada) return `<div class="msg assistant"><div class="notice warn small">${esc(t('asistente.rechazada'))}</div><button class="btn sm" data-chat="retry" data-i="${i}" ${libre ? '' : 'disabled'}>${esc(t('asistente.reintentar'))}</button></div>`;
      if (m.error) return `<div class="msg assistant"><div class="notice bad small">${esc(t('ia.error', { e: m.error }))}</div><button class="btn sm" data-chat="retry" data-i="${i}" ${libre ? '' : 'disabled'}>${esc(t('asistente.reintentar'))}</button></div>`;
      return `<div class="msg assistant">${enlazar(EP.vistas.md(m.texto))}${m.cifras ? `<div class="tiny muted">${esc(t('asistente.comprobadas', { n: m.cifras }))}</div>` : ''}</div>`;
    }).join('');
    const vacio = S.chat.msgs.length ? '' : `<div class="msg assistant"><p>${esc(t('asistente.hola'))}</p><p class="small muted">${esc(t('asistente.privacidad'))}</p></div>`;
    const sinClave = clave ? '' : `<div class="notice warn small">${esc(t('asistente.sinClave'))} <button class="link" data-action="go" data-view="ajustes">${esc(t('ia.ponerClave'))}</button></div>`;
    el.innerHTML = `<div class="assistant-panel" role="dialog" aria-label="${esc(t('asistente.titulo'))}">
      <div class="drawer-head"><div><h3>${esc(t('asistente.titulo'))}</h3><div class="tiny muted">${esc(t('asistente.contexto', { p: pantalla(), r: t('rol.' + S.role) }))}</div></div><div class="row">${S.chat.msgs.length ? `<button class="btn sm" data-chat="clear">${esc(t('comun.borrar'))}</button>` : ''}<button class="btn sm" data-chat="close">${esc(t('comun.cerrar'))}</button></div></div>
      <div class="chat-log" id="chat-log">${vacio}${msgs}${S.chat.busy ? `<div class="msg assistant"><span class="spinner"></span>${esc(t('asistente.pensando'))}</div>` : ''}</div>
      ${sinClave}
      <div class="chips">${sug.map((q) => `<button class="chip" data-chat="ask" data-q="${esc(q)}" ${libre ? '' : 'disabled'}>${esc(q)}</button>`).join('')}</div>
      <form class="chat-form" onsubmit="return false"><input type="text" id="chat-input" placeholder="${esc(clave ? t('asistente.placeholder') : t('asistente.sinClave'))}" value="${esc(S.chat.draft)}" autocomplete="off" ${libre ? '' : 'disabled'}><button class="btn primary" data-chat="send" ${libre ? '' : 'disabled'}>${esc(t('asistente.enviar'))}</button></form>
    </div>`;
    const log = document.getElementById('chat-log'); if (log) log.scrollTop = log.scrollHeight;
  }

  async function preguntar(texto, reintento) {
    const q = String(texto || '').trim(); if (!q) return;
    if (!S.ia.clave) { EP.toast(t('asistente.sinClave'), 'bad'); return; }
    if (!S.vm) return;
    if (!reintento) S.chat.msgs.push({ rol: 'usuario', texto: q });
    S.chat.draft = ''; S.chat.busy = true; persistir(); asistente();
    const equipo = equipoActual();
    const extra = EP.vistas.extraIa();
    const historial = S.chat.msgs.filter((m) => !m.error && !m.rechazada).slice(-7, -1).map((m) => ({ rol: m.rol, texto: m.texto }));
    try {
      const prov = IA.proveedorAnthropic({ clave: S.ia.clave, modelo: S.ia.modelo || IA.MODELO_POR_DEFECTO });
      const bruto = await prov(IA.peticionChat(S.vm.paquete, q, { idioma: window.I18N.lang, rol: S.role, pantalla: pantalla(), equipo, historial, extra }, cat()));
      const v = IA.validarChat(bruto, S.vm.paquete, { equipo, extra });
      if (v.ok) S.chat.msgs.push({ rol: 'asistente', texto: v.respuesta.respuesta, cifras: v.respuesta.cifras.length });
      else { S.chat.msgs.push({ rol: 'asistente', rechazada: true, pregunta: q, problemas: v.problemas.slice(0, 3) }); if (window.console) console.warn('easyperformance: answer rejected', v.problemas); }
    } catch (e) {
      S.chat.msgs.push({ rol: 'asistente', error: e.message, pregunta: q });
    }
    S.chat.busy = false; persistir(); asistente();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-chat]'); if (!el || el.disabled) return;
    const a = el.dataset.chat;
    if (a === 'open') { S.chat.open = true; asistente(); const i = document.getElementById('chat-input'); if (i && !i.disabled) i.focus(); }
    else if (a === 'close') { S.chat.open = false; asistente(); }
    else if (a === 'clear') { S.chat.msgs = []; persistir(); asistente(); }
    else if (a === 'ask') preguntar(el.dataset.q);
    else if (a === 'send') { const i = document.getElementById('chat-input'); preguntar(i ? i.value : ''); }
    else if (a === 'retry') { const m = S.chat.msgs[+el.dataset.i]; if (m && m.pregunta) { S.chat.msgs.splice(+el.dataset.i, 1); preguntar(m.pregunta, true); } }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'chat-input' && e.key === 'Enter') { e.preventDefault(); preguntar(e.target.value); }
    if (e.key === 'Escape' && S.chat.open && !S.presenting && !S.drill) { S.chat.open = false; asistente(); }
  });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'chat-input') S.chat.draft = e.target.value; });

  Object.assign(EP.vistas, { asistente, preguntar });
})();
