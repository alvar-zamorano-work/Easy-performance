/* easyperformance v3: primera vez en tres pantallas. Datos (bienvenida y carga), Revisión (el veredicto del data check y
   solo lo que necesita una decisión, con el resto a un clic) y Qué mirar (qué mejorar y para quién es la vista).
   La forma de trabajar y si hay proveedores se deducen del export y de los equipos marcados. La demo entra directamente. */
(function () {
  const EP = window.EP, K = EP.kit;
  const { S, t, tn, esc, nombreEquipo, fecha, lista } = EP;
  const P = EP.P, N = EP.N;
  const cat = () => window.CATALOGO;

  const PASOS = ['data', 'revision', 'enfoque'];
  /** Pasos de la versión de siete pantallas: un paso guardado de antes lleva al nuevo más cercano. */
  const ANTIGUOS = { welcome: 'data', mapeo: 'revision', datacheck: 'revision', context: 'enfoque', rol: 'enfoque' };
  const abierto = (que) => !!(S.ob.abierto && S.ob.abierto[que]);
  function cabeza(paso) {
    const i = PASOS.indexOf(paso);
    return `<div class="ob-brand"><span>easyperformance</span><div class="ob-steps">${PASOS.map((p, k) => `<span class="${k === i ? 'on' : k < i ? 'done' : ''}">${k + 1}. ${esc(t('ob.paso.' + p))}</span>`).join('')}</div>
      <div class="seg ob-lang">${['es', 'en'].map((l) => `<button data-action="set-lang" data-lang="${l}" class="${window.I18N.lang === l ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div></div>`;
  }
  const pie = (atras, siguiente, extra) => `<div class="ob-foot">${atras ? `<button class="btn" data-action="ob-go" data-step="${atras}">${esc(t('comun.atras'))}</button>` : '<span></span>'}<div class="row">${extra || ''}${siguiente || ''}</div></div>`;
  const continuar = (paso, texto) => `<button class="btn primary" data-action="ob-go" data-step="${paso}">${esc(texto || t('comun.continuar'))}</button>`;

  /** Las tres preguntas del Context, tal cual en Fuentes y mapeo. En el onboarding solo se pregunta qué mejorar. */
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

  // ---------- 1. Datos: la bienvenida y la carga en una pantalla ----------
  function datos() {
    const conDatos = S.vm && !S.demo;
    return `<div class="ob wide">${cabeza('data')}<h1>${esc(t('ob.welcome.titulo'))}</h1><p class="lead">${esc(t('ob.data.lead'))}</p>
      <div class="drop ob-drop" data-action="import" role="button" tabindex="0"><b>${esc(t('ob.data.soltarTitulo'))}</b><span>${esc(t('ob.data.soltarAyuda'))}</span><span class="btn primary">${esc(t('ob.data.elegir'))}</span></div>
      <div class="ob-under">${conDatos ? continuar('revision', t('ob.data.seguir', { n: S.vm.informe.tareas })) : ''}<button class="btn" data-action="demo">${esc(t('ob.demo'))}</button><button class="link ob-link" data-action="ob-abrir" data-que="ayuda" aria-expanded="${abierto('ayuda')}">${esc(t(abierto('ayuda') ? 'ob.data.ocultarAyuda' : 'ob.data.comoExportar'))}</button></div>
      ${abierto('ayuda') ? `<div class="panel" id="ob-ayuda">${EP.vistas.ayudaCsv()}</div>` : ''}
      <p class="small muted ob-priv">${esc(t('ob.privacidad'))}</p></div>`;
  }

  // ---------- 2. Revisión: si se puede analizar y lo que necesita una decisión ----------
  /** Qué hacer cuando no se puede medir: revisar los estados o cargar otro export. Sin "seguir de todos modos". */
  function accionesBloqueo(dc) {
    return [...new Set(dc.bloqueos.filter((b) => b.duro).map((b) => b.accion))].map((a) => a === 'estados'
      ? `<button class="btn primary" data-action="ob-ver" data-que="estados">${esc(t('dc.accion.estados'))}</button>`
      : `<button class="btn primary" data-action="import">${esc(t('dc.accion.datos'))}</button>`).join('');
  }
  /** El bloqueo se dice nada más cargar, antes de configurar nada. */
  function avisoBloqueo() {
    const dc = S.vm.dataCheck, duros = dc.bloqueos.filter((b) => b.duro);
    return duros.length ? `<div class="notice bad" data-tipo="bloqueo"><b>${esc(t('dc.bloqueo.titulo'))}</b><ul class="small">${duros.map((b) => `<li>${esc(t(b.clave, b.p))}</li>`).join('')}</ul></div>` : '';
  }
  /** Un estado que no se reconoce por su nombre: se elige su estado común aquí mismo o se da por bueno. */
  function filaDudoso(e) {
    const est = cat().estados.estados, n = S.vm.det.hayTiempos && e.visitas != null ? e.visitas : e.actuales;
    return `<div class="ob-att"><span class="s-dot tone-warn"></span><div class="grow"><b>${esc(e.nombre)}</b> <span class="small muted">${esc(tn(S.vm.det.hayTiempos && e.visitas != null ? 'ob.rev.pasan' : 'ob.rev.ahora', n))}</span><div class="small muted">${esc(t('ob.rev.estadoDudoso'))}</div></div>
      <select class="sm" data-change="map-estado" data-estado="${esc(e.nombre)}" aria-label="${esc(t('mapeo.col.comun') + ': ' + e.nombre)}">${Object.keys(est).map((c) => `<option value="${c}" ${S.vm.mapeo[e.nombre] === c ? 'selected' : ''}>${esc(est[c].nombre)}</option>`).join('')}</select>
      <button class="btn sm" data-action="map-uno" data-estado="${esc(e.nombre)}">${esc(t('mapeo.confirmarUno'))}</button></div>`;
  }
  const enlace = (que, texto) => `<button class="link" data-action="ob-abrir" data-que="${que}" aria-expanded="${abierto(que)}">${esc(abierto(que) ? t('ob.rev.ocultar') + ': ' + texto : texto)}</button>`;
  function revision() {
    const inf = S.vm.informe, det = S.vm.det, dc = S.vm.dataCheck, f = S.vm.fiabilidad;
    const campo = det.opcionesEquipo.filter((o) => o.id === S.vm.campoEquipo)[0];
    const duro = dc.bloqueos.some((b) => b.duro);
    const tono = { ready: 'good', limits: 'warn', not_ready: 'bad' }[dc.veredicto];
    const veredicto = `<div data-tipo="veredicto">${K.statusBar(tono, esc(t('dc.veredicto.' + dc.veredicto) + '. ' + t('ob.dc.texto.' + dc.veredicto)), [esc(t('fiab.bienDe', { bien: f.bien, n: f.comprobaciones.length })), esc(t('calidad.tile.nivel') + ' ' + t('fiab.nivel.' + f.nivel).toLowerCase())])}</div>`;
    const blandos = dc.bloqueos.filter((b) => !b.duro);
    const limites = dc.kpis.map((id) => { const l = dc.limites.filter((x) => x.kpi === id)[0]; return l ? `<li><b>${esc(EP.nombreMedida(id))}</b>: ${esc(l.parcial ? t('dc.soloPara', { equipos: lista(l.equipos) }) : (l.motivo || t('medida.noDisponible')))}</li>` : ''; }).join('')
      + dc.limites.filter((l) => !l.kpi).map((l) => `<li>${esc(t(l.clave))}</li>`).join('');
    const tiles = `<div class="tiles cols-3">${K.stat(t('fuentes.tile.tareas'), String(inf.tareas), esc(t('fuentes.tile.tareasPie', { f: inf.filasLeidas })), '')}${K.stat(t('ob.rev.equipos'), String(S.vm.equipos.length), esc(campo && campo.id !== 'todos' ? t('ob.rev.campo', { c: t('campo.' + campo.id) }) : t('ob.rev.sinCampo')) + ` <button class="link" data-action="ob-ver" data-que="equipos">${esc(t('ob.rev.cambiar'))}</button>`, '')}${K.stat(t('ob.rev.historia'), esc(t('ob.rev.semanasN', { n: S.vm.semanas.N })), esc(t('ob.rev.hasta', { f: fecha(S.vm.fechaDatos) })), '')}</div>`;
    const dudosos = P.porRevisar(S.cfg, det);
    const atencion = `<h3 class="ob-h3">${esc(t('ob.rev.atencion'))}${dudosos.length ? ` (${dudosos.length})` : ''}</h3>${dudosos.length ? dudosos.map(filaDudoso).join('') : `<p class="small muted">${esc(t('ob.rev.sinAtencion'))}</p>`}`;
    const mejorar = f.comprobaciones.filter((c) => c.estado === 'revisar' && c.id !== 'estados');
    const consejos = mejorar.length ? `<div class="ob-mejorar small"><b>${esc(t('ob.rev.mejorar'))}</b><ul>${mejorar.map((c) => `<li><b>${esc(c.nombre)}</b> (${esc(c.valor)}): ${esc(c.arreglo)}</li>`).join('')}</ul></div>` : '';
    const todas = `<div class="filas">${f.comprobaciones.map((c) => `<div class="fila-dot"><span class="s-dot tone-${c.estado === 'revisar' ? 'warn' : c.estado === 'sin' ? 'neutral' : 'good'}"></span><span class="small"><b>${esc(c.nombre)}</b> · ${esc(c.valor)}${c.estado === 'revisar' ? `<div class="muted">${esc(c.arreglo)}</div>` : ''}</span></div>`).join('')}</div>`;
    const enlaces = `<div class="ob-links small">${enlace('estados', tn('ob.rev.verEstados', det.estados.length))}${enlace('comprobaciones', tn('ob.rev.verComprobaciones', f.comprobaciones.length))}${enlace('equipos', t('ob.rev.verEquipos'))}</div>`;
    const detalle = (abierto('estados') ? `<div class="ob-sec" id="ob-estados">${EP.vistas.fuentesMapeo()}</div>` : '')
      + (abierto('comprobaciones') ? `<div class="ob-sec" id="ob-comprobaciones">${K.ficha(`<div class="f-title">${esc(t('ob.rev.comprobaciones'))}</div>`, todas)}</div>` : '')
      + (abierto('equipos') ? `<div class="ob-sec" id="ob-equipos">${EP.vistas.fuentesEquipos()}</div>` : '');
    const siguiente = duro ? accionesBloqueo(dc) : dc.veredicto === 'not_ready' ? `<button class="btn" data-action="ob-rev-ok">${esc(t('ob.dc.igualmente'))}</button>` : `<button class="btn primary" data-action="ob-rev-ok">${esc(t('comun.continuar'))}</button>`;
    return `<div class="ob wide">${cabeza('revision')}<h1>${esc(t('ob.rev.titulo'))}</h1><p class="lead">${esc(t('ob.rev.lead'))}</p><div class="panel">
      ${veredicto}${avisoBloqueo()}${blandos.length ? `<div class="notice warn small"><ul>${blandos.map((b) => `<li>${esc(t(b.clave, b.p))}</li>`).join('')}</ul></div>` : ''}${limites ? `<ul class="small ob-limites">${limites}</ul>` : ''}
      ${tiles}${atencion}${consejos}${enlaces}${detalle}
      ${pie('data', siguiente, `<button class="btn" data-action="import">${esc(t('fuentes.anadir'))}</button>`)}</div></div>`;
  }

  // ---------- 3. Qué mirar: qué mejorar y para quién es la vista ----------
  function enfoque() {
    const c = P.contexto(S.cfg, S.det);
    const obj = ['speed', 'quality', 'predictability', 'cost', 'ai'];
    const objetivos = `<div class="choice cols-5">${obj.map((o) => `<label class="opt ${c.objetivos.indexOf(o) >= 0 ? 'on' : ''}"><input type="checkbox" data-change="ctx-obj" value="${o}" ${c.objetivos.indexOf(o) >= 0 ? 'checked' : ''}><b>${esc(t('context.obj.' + o))}</b><div>${esc(t('context.obj.' + o + '.d'))}</div></label>`).join('')}</div>`;
    const sinCoste = c.objetivos.indexOf('cost') >= 0 && !P.hayCoste(S.cfg) ? `<div class="small ob-aviso">${esc(t('ob.enf.sinCoste'))} <button class="link" data-action="ob-coste">${esc(t('ob.enf.ponerCoste'))}</button></div>` : '';
    const deducido = S.det && c.trabajo === (S.det.haySprints ? 'sprints' : 'flujo');
    const trabajo = `<div class="ob-trabajo small"><span>${esc(t('ob.enf.trabajo'))}${deducido ? ' (' + esc(t('ob.enf.trabajoVisto')) + ')' : ''}:</span>${P.TRABAJO.map((x) => `<label class="check"><input type="radio" name="ctx-trabajo" data-change="ctx-trabajo" value="${x}" ${c.trabajo === x ? 'checked' : ''}> ${esc(t('context.trabajo.' + x))}</label>`).join('')}</div>`;
    const eqs = S.vm.equipos;
    const elegirEquipo = S.role === 'equipo' ? `<div class="ob-equipo"><b>${esc(t('ob.rol.cualEquipo'))}</b><div class="small muted">${esc(t('ob.rol.cualEquipoAyuda'))}</div>
      <div class="row">${eqs.map((e) => `<button class="btn ${S.team === e.nombre ? 'primary' : ''}" data-action="ob-team" data-team="${esc(e.nombre)}">${esc(nombreEquipo(e.nombre))}</button>`).join('')}</div></div>` : '';
    const roles = `<div class="choice">${['direccion', 'pmo', 'equipo'].map((r) => `<div class="opt ${S.role === r ? 'on' : ''}" data-action="ob-role" data-role="${r}" role="button" tabindex="0" aria-pressed="${S.role === r}"><b>${esc(t('rol.' + r))}</b><div>${esc(t('ob.rol.' + r))}</div></div>`).join('')}</div>`;
    return `<div class="ob wide">${cabeza('enfoque')}<h1>${esc(t('ob.enf.titulo'))}</h1><p class="lead">${esc(t('ob.enf.lead'))}</p>
      <h3 class="ob-h3">${esc(t('ob.enf.mejorar'))}</h3>${objetivos}${sinCoste}
      <p class="small muted ob-kpis">${esc(t('ob.enf.kpis', { k: lista(S.vm.kpis.map(EP.nombreMedida)) }))}</p>${trabajo}
      <h3 class="ob-h3">${esc(t('ob.enf.vista'))}</h3>${roles}${elegirEquipo}
      ${pie('revision', `<button class="btn primary" data-action="ob-finish">${esc(t('ob.enf.entrar'))}</button>`)}</div>`;
  }

  function onboarding() {
    let paso = ANTIGUOS[S.ob.step] || S.ob.step;
    if (PASOS.indexOf(paso) < 0) paso = 'data';
    if (PASOS.indexOf(paso) > 0 && !S.vm) paso = 'data';
    S.ob.step = paso;
    return { data: datos, revision, enfoque }[paso]();
  }
  function trasOnboarding() { /* el arrastre de ficheros lo recoge app.js en cualquier .drop */ }

  const abrir = (que, valor) => { S.ob.abierto = Object.assign({}, S.ob.abierto || {}); S.ob.abierto[que] = valor == null ? !S.ob.abierto[que] : valor; EP.render(); };
  const irA = (que) => { const x = document.getElementById('ob-' + que); if (x && x.scrollIntoView) x.scrollIntoView({ block: 'start' }); };
  EP.accion('ob-go', (el) => { S.ob.step = el.dataset.step; S.drill = null; EP.render(); window.scrollTo(0, 0); });
  EP.accion('ob-abrir', (el) => abrir(el.dataset.que));
  EP.accion('ob-ver', (el) => { abrir(el.dataset.que, true); irA(el.dataset.que); });
  EP.accion('ob-coste', () => { S.ob.step = 'revision'; abrir('equipos', true); irA('equipos'); });
  // Seguir desde la revisión confirma los estados reconocidos por su nombre; los dudosos siguen por revisar
  EP.accion('ob-rev-ok', () => { P.fijarConfirmados(S.cfg, P.confirmarReconocidos(S.cfg, S.det)); EP.guardarCfg(); S.ob.step = 'enfoque'; EP.enSegundoPlano(() => { EP.recalcular(); EP.render(); window.scrollTo(0, 0); }); });
  EP.accion('ob-role', (el) => { S.role = el.dataset.role; EP.render(); });
  EP.accion('ob-team', (el) => { S.team = el.dataset.team; EP.render(); });
  // Al entrar se guarda el Context: lo que no se ha preguntado sale del export (sprints) y de los equipos marcados (proveedores)
  EP.accion('ob-finish', () => {
    const c = Object.assign({}, P.contexto(S.cfg, S.det), { hecho: true });
    if (P.hayProveedores(S.cfg)) c.proveedores = true;
    c.coste = c.objetivos.indexOf('cost') >= 0;
    S.cfg.contexto = c; S.onboarded = true; S.view = EP.INICIO_ROL[S.role]; S.drill = null; EP.guardarPrefs(); EP.guardarCfg();
    EP.enSegundoPlano(() => { EP.recalcular(); if (EP.cortes) EP.cortes.capturar(S.demo); EP.render(); window.scrollTo(0, 0); });
  });

  // ---------- elegir columnas a mano ----------
  /** Solo aparece si un fichero no trae una columna que hace falta: se elige de entre sus títulos y se guarda. */
  function columnas() {
    const cp = S.colPend, titulos = [];
    cp.pendientes.forEach((p) => p.cabecera.forEach((h) => { if (titulos.indexOf(h) < 0) titulos.push(h); }));
    const auto = N.mapearColumnas(cp.pendientes[0].cabecera);
    const elegida = (campo) => { const g = S.cfg.columnas && S.cfg.columnas[campo]; if (g && titulos.indexOf(g) >= 0) return g; const i = auto[campo]; const j = Array.isArray(i) ? i[0] : i; return j != null ? cp.pendientes[0].cabecera[j] : ''; };
    const campos = N.OBLIGATORIOS.concat(['resumen'], N.RECOMENDADOS);
    const fila = (campo) => { const ob = N.OBLIGATORIOS.indexOf(campo) >= 0, v = elegida(campo);
      return `<div class="field col-campo"><label>${esc(t('columnas.campo.' + campo))}${ob ? ` <span class="t-bad">${esc(t('columnas.obligatoria'))}</span>` : ''}</label><select name="${esc(campo)}"><option value="">${esc(t('columnas.noEsta'))}</option>${titulos.map((h) => `<option value="${esc(h)}" ${h === v ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select><div class="tiny muted">${esc(t('columnas.ayuda.' + campo))}${campo === 'resuelta' ? ' ' + esc(t('columnas.ayuda.resueltaNecesaria')) : ''}</div></div>`; };
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
