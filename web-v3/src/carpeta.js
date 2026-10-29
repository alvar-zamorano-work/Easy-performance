/* easyperformance v3: carpeta compartida (Chrome y Edge). La misma estructura que la v2: exports, configuracion,
   iniciativas, contexto, historico y diagnostico. Se lee al elegirla y se escribe cuando cambia la configuración. */
(function () {
  const EP = window.EP;
  const { S, t, tn } = EP;

  function permiso(h, modo) {
    if (!h || !h.queryPermission) return Promise.resolve(!!h);
    return h.queryPermission({ mode: modo }).then((p) => (p === 'granted' ? true : h.requestPermission({ mode: modo }).then((p2) => p2 === 'granted')));
  }
  async function ficherosDe(dir, patron, lector) {
    const out = [];
    if (!dir) return out;
    for await (const e of dir.values()) if (e.kind === 'file' && patron.test(e.name)) out.push({ nombre: e.name, texto: await lector(await e.getFile()) });
    return out;
  }
  const sub = (h, nombre) => h.getDirectoryHandle(nombre).catch(() => null);
  const descodificar = (buf) => { const b = new Uint8Array(buf); try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('windows-1252').decode(b); } };

  async function leer(h) {
    h = h || S.carpeta; if (!h) return;
    EP.salirDemo(false);
    EP.ocupado(true, t('carpeta.leyendo'));
    try {
      const ok = await permiso(h, 'readwrite').catch(() => permiso(h, 'read'));
      if (!ok) throw new Error('permiso');
      const fs = await ficherosDe(await sub(h, 'exports') || h, /\.csv$/i, (f) => f.arrayBuffer().then(descodificar));
      if (!fs.length) { EP.toast(t('carpeta.sinCsv'), 'bad'); return; }
      const json = async (n) => ficherosDe(await sub(h, n), /\.json$/i, (f) => f.text());
      const [conf, inis, ctx] = await Promise.all([json('configuracion'), json('iniciativas'), json('contexto')]);
      const parse = (x, donde) => { try { return JSON.parse(x); } catch (e) { EP.toast(t('carpeta.jsonMal', { f: donde }), 'bad'); return null; } };
      const cli = conf.filter((f) => f.nombre === 'cliente.json')[0];
      if (cli && !S.cfg.actualizada) { const c = parse(cli.texto, 'configuracion/cliente.json'); if (c && typeof c === 'object') S.cfg = c; }
      S.extraIni = inis.map((f) => parse(f.texto, 'iniciativas/' + f.nombre)).filter(Boolean);
      let docs = []; ctx.forEach((f) => { const d = parse(f.texto, 'contexto/' + f.nombre); if (d && d.documentos) docs = docs.concat(d.documentos); });
      S.contextoDocs = docs.length ? { documentos: docs } : S.contextoDocs;
      await new Promise((res) => setTimeout(res, 20));
      if (EP.procesar(fs)) {
        EP.idbSet('ficheros', fs);
        if (EP.cortes) EP.cortes.capturar(false, true);
        if (S.onboarded) { S.view = 'fuentes'; S.fuentesTab = 'ficheros'; } else S.ob.step = 'revision';
        EP.toast(tn('carpeta.leidos', fs.length));
      }
    } catch (e) {
      EP.toast(t('carpeta.sinPermiso'), 'bad');
    } finally { EP.ocupado(false); EP.render(); }
  }
  function elegir() {
    if (!window.showDirectoryPicker) { EP.toast(t('ajustes.carpetaNoNavegador'), 'bad'); return; }
    window.showDirectoryPicker({ id: 'easyperformance', mode: 'readwrite' })
      .then((h) => { S.carpeta = h; EP.idbSet('carpeta', h); return leer(h); })
      .catch((e) => { if (e && e.name !== 'AbortError') EP.toast(t('carpeta.noAbre'), 'bad'); });
  }
  /** Escribe un fichero en una subcarpeta. Solo si hay carpeta, hay permiso ya concedido y no es la demo. */
  async function escribir(subc, nombre, datos) {
    const h = S.carpeta;
    if (!h || !h.queryPermission || S.demo) return false;
    try {
      if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
      const d = await h.getDirectoryHandle(subc, { create: true });
      const w = await (await d.getFileHandle(nombre, { create: true })).createWritable();
      await w.write(datos); await w.close(); return true;
    } catch (e) { return false; }
  }
  const recordar = () => EP.idbGet('carpeta').then((h) => { if (h) S.carpeta = h; }).catch(() => { });

  EP.accion('carpeta-elegir', elegir);
  EP.accion('carpeta-leer', () => leer());
  EP.carpeta = { elegir, leer, escribir, recordar };
})();
