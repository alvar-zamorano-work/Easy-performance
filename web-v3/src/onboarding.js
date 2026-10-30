/* easyperformance v3: primera vez. Bienvenida, datos (CSV y cómo conseguirlo), revisión de lo leído, mapeo de estados,
   Context (tres preguntas que deciden los KPI), data check y para quién es la vista. La demo entra directamente. */
(function () {
  const EP = window.EP, K = EP.kit;
  const { S, t, tn, esc, nombreEquipo, fecha, lista } = EP;
  const P = EP.P, N = EP.N;

  const PASOS = ['welcome', 'data', 'revision', 'mapeo', 'context', 'datacheck', 'rol'];
  function cabeza(paso) {
    const i = PASOS.indexOf(paso);
    return `<div class="ob-brand"><span>easyperformance</span><div class="ob-steps">${PASOS.map((p, k) => `<span class="${k === i ? 'on' : k < i ? 'done' : ''}">${k + 1}. ${esc(t('ob.paso.' + p))}</span>`).join('')}</div>
      <div class="seg ob-lang">${['es', 'en'].map((l) => `<button data-action="set-lang" data-lang="${l}" class="${window.I18N.lang === l ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div></div>`;
  }
  const pie = (atras, siguiente, extra) => `<div class="ob-foot">${atras ? `<button class="btn" data-action="ob-go" data-step="${atras}">${esc(t('comun.atras'))}</button>` : '<span></span>'}<div class="row">${extra || ''}${siguiente || ''}</div></div>`;
  const continuar = (paso, texto) => `<button class="btn primary" data-action="ob-go" data-step="${paso}">${esc(texto || t('comun.continuar'))}</button>`;

  /** Las tres preguntas del Context. En la app se aplican al momento; en la primera vez también. */
  function formularioContexto(enApp) {
    const c = P.contexto(S.cfg, S.det);
    const obj = ['speed', 'quality', 'predictability', 'cost', 'ai'];
    const kpis = S.vm ? S.vm.kpis : P.columnas(S.cfg, S.det);
    return `<div class="ficha"><div class="f-body">
      <div class="q"><b>1. ${esc(t('context.q1'))}</b><div class="small muted">${esc(t('context.q1Ayuda'))}</div>
        <div class="choice">${obj.map((o) => `<label class="opt ${c.objetivos.indexOf(o) >= 0 ? 'on' : ''}"><input type="checkbox" data-change="ctx-obj" value="${o}" ${c.objetivos.indexOf(o) >= 0 ? 'checked' : ''}><b>${esc(t('context.obj.' + o))}</b><div class="small">${esc(t('context.obj.' + o + '.d'))}</div></label>`).join('')}</div></div>
      <div class="q"><b>2. ${esc(t('context.q2'))}</b><div class="small muted">${esc(t('context.q2Ayuda'))}</div>
        <div class="row">${P.TRABAJO.map((x) => `<label class="check"><input type="radio" name="ctx-trabajo" data-change="ctx-trabajo" value="${x}" ${c.trabajo === x ? 'checked' : ''}> ${esc(t('context.trabajo.' + x))}</label>`).join('')}</div></div>
      <div class="q"><b>3. ${esc(t('context.q3'))}</b><div class="small muted">${esc(t('context.q3Ayuda'))}</div>
        <div class="row">${[true, false].map((x) => `<label class="check"><input type="radio" name="ctx-prov" data-change="ctx-prov" value="${x ? 'si' : 'no'}" ${!!c.proveedores === x ? 'checked' : ''}> ${esc(t(x ? 'comun.si' : 'comun.no'))}</label>`).join('')}</div>
        ${c.proveedores && !P.hayProveedores(S.cfg) ? `<div class="small t-warn">${esc(t('context.marcarProveedores'))} ${enApp ? `<button class="link" data-action="fuentes-equipos">${esc(t('context.irEquipos'))}</button>` : ''}</div>` : ''}</div>
      <div class="notice info small"><b>${esc(t('context.kpis'))}</b> ${esc(lista(kpis.map(EP.nombreMedida)))}${c.objetivos.indexOf('cost') >= 0 && !P.hayCoste(S.cfg) ? `<div>${esc(t('context.sinCoste'))}</div>` : ''}</div>
    </div></div>`;
  }
  const guardarContexto = (fn) => {
    const c = Object.assign({}, P.contexto(S.cfg, S.det)); c.objetivos = c.objetivos.slice(); fn(c); c.hecho = true;
    if (c.objetivos.indexOf('cost') >= 0) c.coste = true; else c.coste = false;
    S.cfg.contexto = c; EP.guardarCfg(); EP.enSegundoPlano(() => { EP.recalcular(); EP.render(); });
  };
  EP.cambio('ctx-obj', (el) => guardarContexto((c) => {
    const i = c.objetivos.indexOf(el.value);
    if (el.checked && i < 0) c.objetivos.push(el.value);
    if (!el.checked && i >= 0) { if (c.objetivos.length === 1) { el.checked = true; EP.toast(t('context.alMenosUno'), 'bad'); return; } c.objetivos.splice(i, 1); }
  }));
  EP.cambio('ctx-trabajo', (el) => guardarContexto((c) => { c.trabajo = el.value; }));
  EP.cambio('ctx-prov', (el) => guardarContexto((c) => { c.proveedores = el.value === 'si'; }));

  function bienvenida() {
    return `<div class="ob">${cabeza('welcome')}<h1>${esc(t('ob.welcome.titulo'))}</h1><p class="lead">${esc(t('ob.welcome.lead'))}</p>
      <div class="row"><button class="btn primary" data-action="ob-go" data-step="${S.vm && !S.demo ? 'revision' : 'data'}">${esc(S.vm && !S.demo ? t('ob.data.seguir', { n: S.vm.informe.tareas }) : t('ob.empezar'))}</button><button class="btn" data-action="demo">${esc(t('ob.demo'))}</button></div>
      <div class="what">${[1, 2, 3, 4, 5].map((i) => `<div><b>${i}. ${esc(t('ob.what' + i + '.t'))}</b>${esc(t('ob.what' + i + '.d'))}</div>`).join('')}</div>
      <p class="small muted" style="margin-top:22px">${esc(t('ob.privacidad'))}</p></div>`;
  }
  function datos() {
    const excel = '';
    return `<div class="ob">${cabeza('data')}<h1>${esc(t('ob.data.titulo'))}</h1><p class="lead">${esc(t('ob.data.lead'))}</p>${excel}
      <div class="drop" data-action="import" role="button" tabindex="0">${esc(t('ob.data.soltar'))}</div>
      <div class="panel">${EP.vistas.ayudaCsv()}</div>
      ${pie('welcome', S.vm && !S.demo ? continuar('revision', t('ob.data.seguir', { n: S.vm.informe.tareas })) : '', `<span class="small muted">${esc(t('ob.data.sinExports'))}</span><button class="btn" data-action="demo">${esc(t('ob.demo'))}</button>`)}</div>`;
  }
  function revision() {
    const inf = S.vm.informe, det = S.vm.det;
    const campo = det.opcionesEquipo.filter((o) => o.id === S.vm.campoEquipo)[0];
    const resumen = `<div class="tiles">${K.stat(t('fuentes.tile.tareas'), String(inf.tareas), esc(t('fuentes.tile.tareasPie', { f: inf.filasLeidas })), '')}${K.stat(t('ob.rev.equipos'), String(S.vm.equipos.length), esc(campo && campo.id !== 'todos' ? t('ob.rev.campo', { c: t('campo.' + campo.id) }) : t('ob.rev.sinCampo')), '')}${K.stat(t('ob.rev.semanas'), String(S.vm.semanas.N), esc(t('ob.rev.hasta', { f: fecha(S.vm.fechaDatos) })), '')}${K.stat(t('ob.rev.estados'), String(det.estados.length), esc(tn('mapeo.porRevisar', det.estados.filter((e) => e.propuestaPor !== 'nombre').length)), '')}</div>`;
    return `<div class="ob wide">${cabeza('revision')}<h1>${esc(t('ob.rev.titulo'))}</h1><p class="lead">${esc(t('ob.rev.lead'))}</p><div class="panel">${resumen}
      ${EP.vistas.fuentesEquipos()}
      ${pie('data', continuar('mapeo'), `<button class="btn" data-action="import">${esc(t('fuentes.anadir'))}</button>`)}</div></div>`;
  }
  function mapeo() {
    return `<div class="ob wide">${cabeza('mapeo')}<h1>${esc(t('ob.mapeo.titulo'))}</h1><p class="lead">${esc(t('ob.mapeo.lead'))}</p><div class="panel">${EP.vistas.fuentesMapeo()}
      ${pie('revision', `<button class="btn primary" data-action="ob-mapeo-ok">${esc(t('ob.mapeo.confirmar'))}</button>`)}</div></div>`;
  }
  function contexto() {
    return `<div class="ob wide">${cabeza('context')}<h1>${esc(t('ob.context.titulo'))}</h1><p class="lead">${esc(t('ob.context.lead'))}</p><div class="panel">${formularioContexto(false)}
      ${pie('mapeo', `<button class="btn primary" data-action="ob-context-ok">${esc(t('comun.continuar'))}</button>`)}</div></div>`;
  }
  function datacheck() {
    const dc = S.vm.dataCheck, f = S.vm.fiabilidad, ver = { ready: 'good', limits: 'warn', not_ready: 'bad' }[dc.veredicto];
    const lim = dc.kpis.map((id) => { const l = dc.limites.filter((x) => x.kpi === id)[0]; return `<div class="fila-dot"><span class="s-dot tone-${!l ? 'good' : l.parcial ? 'warn' : 'bad'}"></span><span class="small"><b>${esc(EP.nombreMedida(id))}</b>${l ? ' · ' + esc(l.parcial ? t('dc.soloPara', { equipos: lista(l.equipos) }) : (l.motivo || t('medida.noDisponible'))) : ''}</span></div>`; }).join('')
      + dc.limites.filter((l) => !l.kpi).map((l) => `<div class="fila-dot"><span class="s-dot tone-warn"></span><span class="small">${esc(t(l.clave))}</span></div>`).join('');
    const revisar = f.comprobaciones.filter((c) => c.estado === 'revisar');
    const siguiente = dc.veredicto === 'not_ready' ? `<button class="btn" data-action="ob-go" data-step="rol">${esc(t('ob.dc.igualmente'))}</button>` : continuar('rol');
    return `<div class="ob wide">${cabeza('datacheck')}<h1>${esc(t('ob.dc.titulo'))}</h1><p class="lead">${esc(t('ob.dc.lead'))}</p><div class="panel">
      ${K.statusBar(ver, esc(t('dc.veredicto.' + dc.veredicto) + '. ' + t('ob.dc.texto.' + dc.veredicto)), [esc(t('fiab.bienDe', { bien: f.bien, n: f.comprobaciones.length })), esc(t('calidad.tile.nivel') + ' ' + t('fiab.nivel.' + f.nivel).toLowerCase())])}
      ${dc.bloqueos.length ? `<div class="notice bad small"><ul>${dc.bloqueos.map((b) => `<li>${esc(t(b.clave, b.p))}</li>`).join('')}</ul></div>` : ''}
      <div class="fichas cols-2">${K.ficha(`<div class="f-title">${esc(t('ob.dc.kpis'))}</div>`, `<div class="filas">${lim}</div>`)}${K.ficha(`<div class="f-title">${esc(t('calidad.queFalla'))}</div>`, revisar.length ? revisar.map((c) => `<div class="fila-dot"><span class="s-dot tone-warn"></span><span class="small"><b>${esc(c.nombre)}</b> · ${esc(c.valor)}<div class="muted">${esc(c.arreglo)}</div></span></div>`).join('') : `<p class="muted small">${esc(t('calidad.nadaQueRevisar'))}</p>`)}</div>
      ${pie('context', siguiente)}</div></div>`;
  }
  function rol() {
    const eqs = S.vm.equipos;
    const elegirEquipo = S.role === 'equipo' ? `<div class="ficha" style="margin-top:14px"><b>${esc(t('ob.rol.cualEquipo'))}</b><div class="small muted" style="margin-bottom:8px">${esc(t('ob.rol.cualEquipoAyuda'))}</div>
      <div class="row">${eqs.map((e) => `<button class="btn ${S.team === e.nombre ? 'primary' : ''}" data-action="ob-team" data-team="${esc(e.nombre)}">${esc(nombreEquipo(e.nombre))}</button>`).join('')}</div></div>` : '';
    return `<div class="ob">${cabeza('rol')}<h1>${esc(t('ob.rol.titulo'))}</h1><p class="lead">${esc(t('ob.rol.lead'))}</p>
      <div class="choice">${['direccion', 'pmo', 'equipo'].map((r) => `<div class="opt ${S.role === r ? 'on' : ''}" data-action="ob-role" data-role="${r}" role="button" tabindex="0"><b>${esc(t('rol.' + r))}</b><div>${esc(t('ob.rol.' + r))}</div></div>`).join('')}</div>
      ${elegirEquipo}${pie('datacheck', `<button class="btn primary" data-action="ob-finish">${esc(t('ob.entrar'))}</button>`)}</div>`;
  }

  function onboarding() {
    let paso = S.ob.step;
    if (PASOS.indexOf(paso) < 0) paso = 'welcome';
    if (PASOS.indexOf(paso) > 1 && !S.vm) paso = 'data';
    S.ob.step = paso;
    return { welcome: bienvenida, data: datos, revision, mapeo, context: contexto, datacheck, rol }[paso]();
  }
  function trasOnboarding() { /* el arrastre de ficheros lo recoge app.js en cualquier .drop */ }

  EP.accion('ob-go', (el) => { S.ob.step = el.dataset.step; S.drill = null; EP.render(); window.scrollTo(0, 0); });
  EP.accion('ob-mapeo-ok', () => { S.cfg.mapeoEstados = Object.assign({}, S.vm.mapeo); EP.guardarCfg(); S.ob.step = 'context'; EP.enSegundoPlano(() => { EP.recalcular(); EP.render(); window.scrollTo(0, 0); }); });
  EP.accion('ob-context-ok', () => {
    if (!S.cfg.contexto || !S.cfg.contexto.hecho) { S.cfg.contexto = Object.assign({}, P.contexto(S.cfg, S.det), { hecho: true }); EP.guardarCfg(); }
    S.ob.step = 'datacheck'; EP.enSegundoPlano(() => { EP.recalcular(); EP.render(); window.scrollTo(0, 0); });
  });
  EP.accion('ob-role', (el) => { S.role = el.dataset.role; EP.render(); });
  EP.accion('ob-team', (el) => { S.team = el.dataset.team; EP.render(); });
  EP.accion('ob-finish', () => { S.onboarded = true; S.view = EP.INICIO_ROL[S.role]; S.drill = null; EP.guardarPrefs(); EP.guardarCfg(); if (EP.cortes) EP.cortes.capturar(S.demo); EP.render(); window.scrollTo(0, 0); });

  // ---------- elegir columnas a mano ----------
  /** Solo aparece si un fichero no trae una columna que hace falta: se elige de entre sus títulos y se guarda. */
  function columnas() {
    const cp = S.colPend, titulos = [];
    cp.pendientes.forEach((p) => p.cabecera.forEach((h) => { if (titulos.indexOf(h) < 0) titulos.push(h); }));
    const auto = N.mapearColumnas(cp.pendientes[0].cabecera);
    const elegida = (campo) => { const g = S.cfg.columnas && S.cfg.columnas[campo]; if (g && titulos.indexOf(g) >= 0) return g; const i = auto[campo]; const j = Array.isArray(i) ? i[0] : i; return j != null ? cp.pendientes[0].cabecera[j] : ''; };
    const campos = N.OBLIGATORIOS.concat(['resumen'], N.RECOMENDADOS);
    const fila = (campo) => { const ob = N.OBLIGATORIOS.indexOf(campo) >= 0, v = elegida(campo);
      return `<div class="field col-campo"><label>${esc(t('columnas.campo.' + campo))}${ob ? ` <span class="t-bad">${esc(t('columnas.obligatoria'))}</span>` : ''}</label><select name="${esc(campo)}"><option value="">${esc(t('columnas.noEsta'))}</option>${titulos.map((h) => `<option value="${esc(h)}" ${h === v ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select><div class="tiny muted">${esc(t('columnas.ayuda.' + campo))}</div></div>`; };
    return `<div class="ob wide">${cabeza('data')}<h1>${esc(t('columnas.titulo'))}</h1><p class="lead">${esc(t('columnas.lead', { f: cp.pendientes.map((p) => p.fichero).join(', ') }))}</p>
      <div class="panel"><form id="form-col" class="grid cols-2" onsubmit="return false">${campos.map(fila).join('')}</form>
      <p class="tiny muted" style="margin-top:10px">${esc(t('columnas.nota'))}</p>
      ${pie('', `<button class="btn primary" data-action="col-aplicar">${esc(t('columnas.aplicar'))}</button>`, `<button class="btn" data-action="col-cancelar">${esc(t('comun.cancelar'))}</button>`)}</div></div>`;
  }
  EP.accion('col-abrir', () => { if (S.colPend) { S.colPend.abierto = true; EP.render(); window.scrollTo(0, 0); } });
  EP.accion('col-cancelar', () => { if (S.colPend && S.vm) S.colPend.abierto = false; else S.colPend = null; EP.render(); });
  EP.accion('col-aplicar', () => {
    const form = document.getElementById('form-col'), sel = {};
    [].forEach.call(form.querySelectorAll('select'), (s) => { sel[s.name] = s.value; });
    const faltan = N.OBLIGATORIOS.filter((c) => !sel[c]);
    if (faltan.length) { EP.toast(t('columnas.faltan', { c: faltan.map((c) => t('columnas.campo.' + c)).join(', ') }), 'bad'); return; }
    // Se guarda lo elegido: con el mismo cliente no hay que volver a hacerlo
    Object.keys(sel).forEach((k) => { if (!sel[k]) delete sel[k]; });
    S.cfg.columnas = Object.assign({}, S.cfg.columnas || {}, sel); EP.guardarCfg();
    const fs = S.colPend.ficheros;
    EP.enSegundoPlano(() => { if (EP.procesar(fs)) EP.trasCargar(fs); else EP.render(); }, t('carga.leyendo'));
  });

  Object.assign(EP.vistas, { onboarding, trasOnboarding, formularioContexto, columnas });
})();
