/* Analisador de curvas OTDR (.SOR, Telcordia SR-4731 v1.x/2.x) — leitor, análise automática e visualizador.
   Roda 100% no navegador. Expõe window.TBSOR = { parse, analyze, open }. */
(function () {
  "use strict";
  var SOL = 0.299792458; // km/µs

  /* ---------------- LIMITES DA ANÁLISE AUTOMÁTICA (ajuste aqui) ---------------- */
  var LIM = {
    emenda: { warn: 0.30, bad: 0.60 },        // dB — evento não refletivo (fusão)
    conector: { warn: 0.50, bad: 1.00 },      // dB — evento refletivo
    reflet: { warn: -35, bad: -26 },          // dB — refletância (mais perto de 0 = pior)
    ganho: -0.20,                             // dB — "ganho" aparente abaixo disso vira aviso
    atenuacao: function (wl) {                // dB/km por trecho de fibra
      return wl && wl < 1400 ? { warn: 0.40, bad: 0.50 } : { warn: 0.28, bad: 0.35 };
    },
    distPct: { warn: 2, bad: 5 }              // % de diferença p/ distância informada do trecho
  };

  /* ---------------- LEITOR ---------------- */
  function parse(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), p = 0;
    var out = { ok: false, erro: "", gen: {}, sup: {}, fxd: {}, events: [], summary: {}, blocks: {}, trace: null };
    function str() {
      var a = [];
      while (p < u8.length && u8[p] !== 0) a.push(u8[p++]);
      p++;
      try { return new TextDecoder("utf-8").decode(new Uint8Array(a)); } catch (e) { return String.fromCharCode.apply(null, a); }
    }
    function fx(n) { var s = ""; for (var i = 0; i < n; i++) s += String.fromCharCode(u8[p++]); return s; }
    function U16() { var v = dv.getUint16(p, true); p += 2; return v; }
    function I16() { var v = dv.getInt16(p, true); p += 2; return v; }
    function U32() { var v = dv.getUint32(p, true); p += 4; return v; }
    function I32() { var v = dv.getInt32(p, true); p += 4; return v; }
    try {
      if (u8.length < 40) throw new Error("Arquivo muito pequeno para ser um .SOR.");
      var head = str();
      var v2 = head === "Map";
      if (!v2) p = 0;
      out.version = (U16() * 0.01).toFixed(2); out.v2 = v2;
      var mapSize = U32(), nb = U16() - 1, pos = mapSize, b = {};
      for (var i = 0; i < nb; i++) {
        var nm = str(), ver = U16(), sz = U32();
        b[nm] = { pos: pos, size: sz, ver: (ver * 0.01).toFixed(2) };
        pos += sz;
      }
      out.blocks = b;
      function go(name) {
        var r = b[name];
        if (!r) return false;
        p = r.pos;
        if (v2) { var h = str(); if (h !== name) throw new Error("Bloco " + name + " inválido."); }
        return true;
      }
      /* GenParams */
      if (go("GenParams")) {
        var g = out.gen;
        g.idioma = fx(2); g.cabo = str(); g.fibra = str();
        if (v2) g.tipoFibra = U16();
        g.comprimentoOnda = U16();
        g.locA = str(); g.locB = str(); g.codigoCabo = str();
        g.condicao = fx(2); g.offsetUsuario = I32(); if (v2) g.offsetUsuarioDist = I32();
        g.operador = str(); g.comentarios = str();
      }
      /* SupParams */
      if (go("SupParams")) {
        var s = out.sup;
        s.fornecedor = str(); s.otdr = str(); s.otdrSerie = str(); s.modulo = str(); s.moduloSerie = str(); s.software = str(); s.outro = str();
      }
      /* FxdParams */
      if (!go("FxdParams")) throw new Error("Bloco FxdParams ausente.");
      var f = out.fxd;
      f.data = U32(); f.unidade = fx(2); f.comprimentoOnda = U16() * 0.1; f.acqOffset = I32(); if (v2) f.acqOffsetDist = I32();
      var npw = U16(), pw = [], ss = [], np = [], k;
      for (k = 0; k < npw; k++) pw.push(U16());
      for (k = 0; k < npw; k++) ss.push(U32());
      for (k = 0; k < npw; k++) np.push(U32());
      f.pulsos = pw; f.pulso = pw[0]; f.espacamento = ss[0]; f.pontos = np[0];
      f.ior = U32() * 1e-5; f.backscatter = U16() * -0.1; f.medias = U32(); if (v2) f.tempoMedia = U16() * 0.1;
      f.alcance = U32() * 2e-5; if (v2) f.acqRangeDist = I32(); f.frontPanel = I32();
      f.ruidoNivel = U16(); f.ruidoEscala = I16(); f.potenciaOffset = U16();
      f.limPerda = U16() * 0.001; f.limRefl = U16() * -0.001; f.limFim = U16() * 0.001;
      f.tipoTraco = v2 ? fx(2) : "";
      if (!(f.ior > 1 && f.ior < 2)) throw new Error("Índice de refração inválido (" + f.ior + ").");
      var wlc = [f.comprimentoOnda, out.gen.comprimentoOnda, f.comprimentoOnda * 10].filter(function (w) { return w >= 800 && w <= 1700; });
      f.comprimentoOnda = wlc.length ? wlc[0] : f.comprimentoOnda;
      var fk = 1e-4 * SOL / f.ior;              // km por unidade de tempo-de-viagem (100 ps)
      var dxKm = f.espacamento * 1e-8 * SOL / f.ior; // km por amostra
      f.dxM = dxKm * 1000;
      /* KeyEvents */
      if (go("KeyEvents")) {
        var nev = U16();
        for (k = 0; k < nev; k++) {
          var e = {};
          e.n = U16(); e.dist = U32() * fk; e.inclinacao = I16() * 0.001; e.perda = I16() * 0.001; e.refl = I32() * 0.001;
          e.tipo = fx(8);
          if (v2) { e.fimAnterior = U32() * fk; e.inicio = U32() * fk; e.fim = U32() * fk; e.inicioProx = U32() * fk; e.pico = U32() * fk; }
          else { e.fimAnterior = e.inicio = e.fim = e.inicioProx = e.pico = e.dist; }
          e.comentario = str();
          var m = /^(.)(.)/.exec(e.tipo) || [];
          e.natureza = m[1] === "1" ? "refl" : m[1] === "2" ? "multi" : "nrefl";
          e.manual = m[2] === "A";
          out.events.push(e);
        }
        var sm = out.summary;
        sm.perdaTotal = I32() * 0.001; sm.perdaIni = I32() * fk; sm.perdaFim = U32() * fk;
        sm.orl = U16() * 0.001; sm.orlIni = I32() * fk; sm.orlFim = U32() * fk;
        if (out.events.length) out.events[out.events.length - 1].fim_de_fibra = true;
      }
      /* DataPts */
      if (!go("DataPts")) throw new Error("Bloco DataPts ausente.");
      var N = U32(), ntr = I16(), N2 = U32(), sc = U16() / 1000;
      if (N < 2 || N > 5e6) throw new Error("Número de pontos inválido (" + N + ").");
      var raw = new Uint16Array(N);
      for (k = 0; k < N; k++) raw[k] = dv.getUint16(p + 2 * k, true);
      var fs = 0.001 * sc, ymax = 0, ymin = 65535;
      for (k = 0; k < N; k++) { if (raw[k] > ymax) ymax = raw[k]; if (raw[k] < ymin) ymin = raw[k]; }
      /* nível (dB) relativo ao início da fibra: raw maior = menos potência */
      var ref = median(raw, Math.min(N - 1, Math.max(1, Math.round(N * 0.01))), Math.min(N, Math.max(3, Math.round(N * 0.03))));
      var y = new Float32Array(N);
      for (k = 0; k < N; k++) y[k] = (ref - raw[k]) * fs;
      /* orientação: o início deve ser mais forte que o meio */
      var a1 = avg(y, 0.01, 0.10), a2 = avg(y, 0.40, 0.50);
      if (a2 > a1) for (k = 0; k < N; k++) y[k] = -y[k];
      out.trace = { n: N, dx: dxKm, y: y, tracos: ntr };
      out.ok = true;
    } catch (err) {
      out.erro = err && err.message ? err.message : String(err);
    }
    return out;
  }
  function median(a, i0, i1) { var t = Array.prototype.slice.call(a, i0, i1).sort(function (x, y) { return x - y; }); return t[t.length >> 1]; }
  function avg(y, f0, f1) { var n = y.length, i0 = Math.floor(n * f0), i1 = Math.max(i0 + 1, Math.floor(n * f1)), s = 0; for (var i = i0; i < i1; i++) s += y[i]; return s / (i1 - i0); }

  /* ---------------- ANÁLISE AUTOMÁTICA ---------------- */
  var SEV = { ok: 0, info: 1, warn: 2, bad: 3 };
  function lsSlope(tr, x0, x1) { // dB/km por mínimos quadrados entre x0 e x1 (km)
    var i0 = Math.max(0, Math.ceil(x0 / tr.dx)), i1 = Math.min(tr.n - 1, Math.floor(x1 / tr.dx));
    if (i1 - i0 < 5) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0, c = i1 - i0 + 1;
    for (var i = i0; i <= i1; i++) { var x = i * tr.dx; sx += x; sy += tr.y[i]; sxx += x * x; sxy += x * tr.y[i]; }
    var d = c * sxx - sx * sx;
    return d ? (c * sxy - sx * sy) / d : null;
  }
  function analyze(P, opt) {
    opt = opt || {};
    var R = { sev: "ok", findings: [], evSev: {}, secoes: [], metricas: {} };
    if (!P.ok) return R;
    var ev = P.events, tr = P.trace, wl = P.fxd.comprimentoOnda || P.gen.comprimentoOnda, ln = ev.length ? ev[ev.length - 1].dist : tr.n * tr.dx;
    var att = LIM.atenuacao(wl);
    function add(sev, titulo, det, idx) {
      R.findings.push({ sev: sev, titulo: titulo, det: det, ev: idx == null ? null : idx });
      if (SEV[sev] > SEV[R.sev] && sev !== "info") R.sev = sev;
      if (idx != null && (!R.evSev[idx] || SEV[sev] > SEV[R.evSev[idx]])) R.evSev[idx] = sev;
    }
    function f2(v) { return (v > 0 ? "+" : "") + v.toFixed(2); }
    /* eventos */
    ev.forEach(function (e, i) {
      var fim = !!e.fim_de_fibra, nm = "Evento " + e.n + " (" + e.dist.toFixed(3) + " km)";
      if (!fim) {
        var l = e.perda, lim = e.natureza === "nrefl" ? LIM.emenda : LIM.conector, nome = e.natureza === "nrefl" ? "emenda/dobra" : "conector/reflexão";
        if (l >= lim.bad) add("bad", "Perda alta em " + nome, nm + ": " + l.toFixed(2) + " dB (limite crítico " + lim.bad.toFixed(2) + " dB).", i);
        else if (l >= lim.warn) add("warn", "Perda acima do esperado em " + nome, nm + ": " + l.toFixed(2) + " dB (atenção a partir de " + lim.warn.toFixed(2) + " dB).", i);
        else if (l <= LIM.ganho) add("info", "Ganho aparente", nm + ": " + l.toFixed(2) + " dB. Efeito de diferença de retroespalhamento; use a média bidirecional (LR+RL).", i);
      }
      if (e.natureza !== "nrefl" && e.refl !== 0) {
        if (e.refl >= LIM.reflet.bad && !fim) add("bad", "Reflectância muito alta", nm + ": " + e.refl.toFixed(1) + " dB (pior que " + LIM.reflet.bad + " dB) — conector sujo/danificado ou mal acoplado.", i);
        else if (e.refl >= LIM.reflet.warn && !fim) add("warn", "Reflectância elevada", nm + ": " + e.refl.toFixed(1) + " dB (pior que " + LIM.reflet.warn + " dB).", i);
      }
    });
    /* seções de fibra entre eventos */
    var plen = (P.fxd.pulso || 100) * 1e-3 * SOL / P.fxd.ior / 2; // comprimento do pulso em km
    var margem = Math.max(0.01, tr.dx * 3, plen), minSec = Math.max(0.3, plen * 4);
    for (var i = 0; i < ev.length - 1; i++) {
      var x0 = (ev[i].fim > ev[i].dist ? ev[i].fim : ev[i].dist) + margem * (ev[i].natureza === "nrefl" ? 1 : 2), x1 = (ev[i + 1].inicio && ev[i + 1].inicio < ev[i + 1].dist ? ev[i + 1].inicio : ev[i + 1].dist) - margem;
      if (x1 - x0 < minSec) continue;
      var sl = lsSlope(tr, x0, x1);
      if (sl == null) continue;
      var a = -sl, s = { de: ev[i].n, ate: ev[i + 1].n, x0: x0, x1: x1, att: a, sev: "ok" };
      if (a >= att.bad) s.sev = "bad"; else if (a >= att.warn) s.sev = "warn";
      R.secoes.push(s);
      if (s.sev !== "ok") add(s.sev, "Atenuação alta na fibra", "Entre eventos " + ev[i].n + " e " + ev[i + 1].n + " (" + x0.toFixed(2) + "–" + x1.toFixed(2) + " km): " + a.toFixed(3) + " dB/km (limite " + (s.sev === "bad" ? att.bad : att.warn) + " dB/km).", s.sev === "bad" || s.sev === "warn" ? i + 1 : null);
    }
    /* globais */
    var first = ev.length ? Math.min(ev[0].fim > 0.05 ? ev[0].fim : 0.05, ln * 0.1) : 0.05;
    var gs = lsSlope(tr, first + margem, Math.max(first + 0.3, ln - 0.1));
    var perdaTot = P.summary.perdaTotal;
    var m = R.metricas;
    m.comprimento = ln; m.perdaTotal = perdaTot; m.attMedia = gs != null ? -gs : null; m.orl = P.summary.orl; m.nEventos = ev.length;
    m.pior = ev.filter(function (e) { return !e.fim_de_fibra; }).reduce(function (a, e) { return !a || e.perda > a.perda ? e : a; }, null);
    m.piorRefl = ev.filter(function (e) { return !e.fim_de_fibra && e.natureza !== "nrefl" && e.refl; }).reduce(function (a, e) { return !a || e.refl > a.refl ? e : a; }, null);
    /* faixa dinâmica: nível inicial - ruído após o fim da fibra */
    var iEnd = Math.min(tr.n - 1, Math.round((ln + 0.2) / tr.dx));
    if (tr.n - iEnd > 30) {
      var t = Array.prototype.slice.call(tr.y, iEnd + 10, tr.n).sort(function (x, y) { return x - y; });
      m.ruido = t[t.length >> 1]; m.dinamica = avg(tr.y, 0.005, 0.02) - m.ruido;
    }
    if (m.attMedia != null) {
      if (m.attMedia >= att.bad) add("bad", "Atenuação média alta", "Média do enlace: " + m.attMedia.toFixed(3) + " dB/km (crítico a partir de " + att.bad + ").", null);
      else if (m.attMedia >= att.warn) add("warn", "Atenuação média elevada", "Média do enlace: " + m.attMedia.toFixed(3) + " dB/km (atenção a partir de " + att.warn + ").", null);
    }
    if (opt.refKm) {
      var d = (ln - opt.refKm) / opt.refKm * 100, ad = Math.abs(d);
      m.dif_dist = d;
      if (ad >= LIM.distPct.bad) add("bad", "Distância diferente do trecho cadastrado", "OTDR: " + ln.toFixed(3) + " km · cadastro: " + opt.refKm + " km (" + f2(d) + "%). Pode ser outro trecho, rompimento ou fibra errada.", null);
      else if (ad >= LIM.distPct.warn) add("warn", "Distância ligeiramente diferente do cadastro", "OTDR: " + ln.toFixed(3) + " km · cadastro: " + opt.refKm + " km (" + f2(d) + "%).", null);
    }
    if (!ev.length) add("warn", "Sem tabela de eventos", "O arquivo não traz eventos — a análise usa só a curva.", null);
    if (ev.length && !ev.some(function (e) { return e.fim_de_fibra; })) add("warn", "Fim de fibra não identificado", "Nenhum evento marcado como fim de fibra.", null);
    if (m.dinamica != null && m.dinamica < 6) add("warn", "Pouca margem sobre o ruído", "Faixa dinâmica útil ~" + m.dinamica.toFixed(1) + " dB; aumente pulso/tempo de médias para ver o fim com clareza.", null);
    R.findings.sort(function (a, b) { return SEV[b.sev] - SEV[a.sev] || ((a.ev == null ? 1e9 : a.ev) - (b.ev == null ? 1e9 : b.ev)); });
    return R;
  }
  /* média bidirecional: A (ida) e B (volta) do mesmo enlace */
  function bidir(A, B) {
    var r = {}, LA = A.events.length ? A.events[A.events.length - 1].dist : 0, LB = B.events.length ? B.events[B.events.length - 1].dist : 0;
    if (!LA || !LB || Math.abs(LA - LB) > Math.max(0.2, 0.03 * LA)) return null;
    var tol = Math.max(0.05, 0.005 * LA);
    A.events.forEach(function (e, i) {
      if (e.fim_de_fibra) return;
      var best = null, bd = 1e9;
      B.events.forEach(function (f) {
        if (f.fim_de_fibra) return;
        var dd = Math.abs((LB - f.dist) - (e.dist - 0)) ; // posição espelhada
        if (dd < bd) { bd = dd; best = f; }
      });
      if (best && bd <= tol) r[i] = { media: (e.perda + best.perda) / 2, volta: best.perda };
    });
    return r;
  }
  /* comparação evento a evento entre duas curvas (atual x anterior) */
  function compare(A, B, opt) {
    var out = [], ea = A.events, eb = B.events, nt = !!(opt && opt.neutral);
    var LA = ea.length ? ea[ea.length - 1].dist : 0, LB = eb.length ? eb[eb.length - 1].dist : 0;
    var tol = Math.max(0.05, 0.005 * Math.max(LA, LB));
    function f2(v) { return (v > 0 ? "+" : "") + v.toFixed(2); }
    if (LA && LB) {
      var dd = LA - LB;
      out.push({ sev: Math.abs(dd) > Math.max(0.05, 0.005 * LB) ? "warn" : "ok", titulo: "Comprimento", det: (nt ? "Atual " : "Agora ") + LA.toFixed(3) + " km · " + (nt ? "comparada " : "anterior ") + LB.toFixed(3) + " km (" + f2(dd * 1000) + " m)." });
    }
    var ta = A.summary.perdaTotal, tb = B.summary.perdaTotal;
    if (ta != null && tb != null) {
      var d = ta - tb;
      out.push({ sev: d >= 1 ? "bad" : d >= 0.5 ? "warn" : d <= -0.5 ? "info" : "ok", titulo: "Perda total", det: (nt ? "Atual " : "Agora ") + ta.toFixed(2) + " dB · " + (nt ? "comparada " : "anterior ") + tb.toFixed(2) + " dB (" + f2(d) + " dB, " + (Math.abs(d) < 0.1 ? (nt ? "iguais" : "estável") : d > 0 ? (nt ? "atual maior" : "piorou") : (nt ? "atual menor" : "melhorou")) + ")." });
    }
    var used = {};
    ea.forEach(function (e) {
      if (e.fim_de_fibra) return;
      var best = null, bd = 1e9, bi = -1;
      eb.forEach(function (f, j) { if (f.fim_de_fibra) return; var dd2 = Math.abs(f.dist - e.dist); if (dd2 < bd) { bd = dd2; best = f; bi = j; } });
      if (best && bd <= tol) {
        used[bi] = 1;
        var dl = e.perda - best.perda;
        if (Math.abs(dl) >= 0.15) out.push({ sev: dl >= 0.5 ? "bad" : dl >= 0.15 ? "warn" : "info", titulo: "Evento " + e.n + " (" + e.dist.toFixed(3) + " km)", det: "Perda " + e.perda.toFixed(2) + " dB " + (nt ? "na atual vs " : "agora vs ") + best.perda.toFixed(2) + " dB " + (nt ? "na comparada" : "antes") + " (" + f2(dl) + " dB, " + (nt ? (dl > 0 ? "atual maior" : "atual menor") : dl > 0 ? "piorou" : "melhorou") + ").", ev: ea.indexOf(e) });
      } else out.push({ sev: "warn", titulo: (nt ? "Só na curva atual: evento " : "Evento novo ") + e.n + " (" + e.dist.toFixed(3) + " km)", det: (nt ? "Não aparece na curva comparada (" : "Não existia na curva anterior (") + e.perda.toFixed(2) + " dB).", ev: ea.indexOf(e) });
    });
    eb.forEach(function (f, j) { if (!f.fim_de_fibra && !used[j]) out.push({ sev: "info", titulo: (nt ? "Só na curva comparada (" : "Evento sumiu (") + f.dist.toFixed(3) + " km)", det: (nt ? "Evento com " : "Existia antes (") + f.perda.toFixed(2) + (nt ? " dB que não aparece na atual." : " dB) e não aparece agora.") }); });
    out.sort(function (a, b) { return SEV[b.sev] - SEV[a.sev]; });
    return out;
  }

  /* ---------------- VISUALIZADOR ---------------- */
  var CSS_ID = "tbsor-css";
  var CSS = ".sv{position:fixed;inset:0;z-index:300;background:var(--bg);color:var(--tx);overflow:auto;font-family:'Inter',-apple-system,system-ui,sans-serif}" +
    ".sv *{box-sizing:border-box}.sv-in{max-width:1180px;margin:0 auto;padding:14px 14px 40px}" +
    ".sv-h{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}" +
    ".sv-t{font-size:16px;font-weight:800}.sv-btn{background:var(--sf2);color:var(--tx);border:1px solid var(--bd);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}" +
    ".sv-btn:hover{background:var(--hv)}.sv-btn.on{background:#0ea5e9;color:#fff;border-color:#0ea5e9}" +
    ".sv-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}" +
    ".sv-card{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:12px;margin-bottom:12px}" +
    ".sv-lb{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#0ea5e9;font-weight:700;margin-bottom:8px}" +
    ".sv-ver{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.sv-vb{font-size:20px;font-weight:800;padding:6px 16px;border-radius:8px;border:2px solid}" +
    ".sv-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.sv-k>div{background:var(--sf2);border-radius:8px;padding:8px 10px}" +
    ".sv-k b{display:block;font-size:16px;font-variant-numeric:tabular-nums}.sv-k span{font-size:10px;color:var(--mt);font-weight:600}" +
    ".sv-f{border-left:4px solid;background:var(--sf2);border-radius:6px;padding:7px 10px;margin-bottom:6px;font-size:12px}.sv-f b{display:block;font-size:12px}.sv-f i{font-style:normal;color:var(--mt)}" +
    ".sv-cv{position:relative;width:100%;height:380px;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;overflow:hidden;touch-action:none}" +
    ".sv-cv canvas{width:100%;height:100%;display:block;cursor:crosshair}" +
    ".sv-ro{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-top:8px;font-variant-numeric:tabular-nums}.sv-ro span{background:var(--sf2);padding:3px 9px;border-radius:6px}" +
    ".sv-tb{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.sv-tb th{font-size:10px;text-transform:uppercase;color:var(--mt);text-align:left;padding:5px 6px;border-bottom:1px solid var(--bd);white-space:nowrap}" +
    ".sv-tb td{padding:6px;border-bottom:1px solid var(--bd);white-space:nowrap}.sv-tb tr.ev{cursor:pointer}.sv-tb tr.ev:hover{background:var(--hv)}.sv-tbw{overflow-x:auto}" +
    ".sv-chip{display:inline-block;padding:1px 8px;border-radius:5px;font-size:10px;font-weight:700;border:1px solid}" +
    ".sv-pg{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:4px 18px;font-size:12px}.sv-pg div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed var(--bd);padding:3px 0}.sv-pg span{color:var(--mt)}" +
    ".sv select{background:var(--sf2);color:var(--tx);border:1px solid var(--bd);border-radius:6px;padding:6px 8px;font-size:12px;max-width:100%}" +
    ".sv-note{font-size:11px;color:var(--mt);margin-top:6px}";
  var COR = { ok: "#16a34a", info: "#0ea5e9", warn: "#ca8a04", bad: "#dc2626" };
  var ROT = { ok: "SEM ANOMALIAS", warn: "ATENÇÃO", bad: "ANOMALIAS CRÍTICAS" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function dl(name, text, mime) {
    var a = document.createElement("a"), u = URL.createObjectURL(new Blob([text], { type: mime || "text/csv;charset=utf-8" }));
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
  }
  function tipoTxt(e) { return (e.natureza === "refl" ? "Reflexão" : e.natureza === "multi" ? "Reflexão saturada" : "Perda/emenda") + (e.fim_de_fibra ? " · FIM" : "") + (e.manual ? " · manual" : ""); }
  function fmtData(t) { var d = new Date(t * 1000); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function ticks(a, b, n) {
    var span = b - a, st = Math.pow(10, Math.floor(Math.log10(span / n))), m = span / n / st, step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * st, r = [];
    for (var v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) r.push(+v.toFixed(10));
    return { v: r, step: step };
  }

  function open(cfg) {
    if (!document.getElementById(CSS_ID)) { var s = document.createElement("style"); s.id = CSS_ID; s.textContent = CSS; document.head.appendChild(s); }
    var items = (cfg.items || []).map(function (it) { var P = parse(it.buf); return { name: it.name, P: P, A: P.ok ? analyze(P, { refKm: cfg.refKm }) : null }; });
    var root = document.createElement("div"); root.className = "sv"; document.body.appendChild(root);
    var prevOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    var S = { i: 0, view: null, ca: null, cb: null, next: "a", cmp: null, cmpP: null, cmpName: "", cmpRes: null, hover: null, selEv: null, showCmp: true, drag: null, cmpMsg: "" };

    function close() { document.body.style.overflow = prevOverflow; window.removeEventListener("keydown", onKey); root.remove(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    window.addEventListener("keydown", onKey);

    function cur() { return items[S.i]; }
    function fit(full) {
      var it = cur(); if (!it.P.ok) return;
      var tr = it.P.trace, L = tr.n * tr.dx, ev = it.P.events, ln = ev.length ? ev[ev.length - 1].dist : L;
      S.view = { x0: 0, x1: full || !(ln > 0) ? L : Math.min(L, Math.max(ln * 1.12, ln + 0.3)) }; S.selEv = null; S.ca = S.cb = null; S.next = "a";
    }
    function render() {
      var it = cur(), P = it.P, h = "";
      h += '<div class="sv-in"><div class="sv-h"><div class="sv-t">📈 Análise de curva OTDR' + (cfg.title ? ' <span style="font-weight:500;color:var(--mt);font-size:13px">· ' + esc(cfg.title) + "</span>" : "") + '</div><button class="sv-btn" id="sv-x">✕ Fechar</button></div>';
      if (items.length > 1) {
        h += '<div class="sv-tabs">' + items.map(function (x, k) { return '<button class="sv-btn' + (k === S.i ? " on" : "") + '" data-tab="' + k + '">' + esc(x.name) + "</button>"; }).join("") + "</div>";
      }
      if (!P.ok) {
        h += '<div class="sv-card"><div class="sv-f" style="border-color:#dc2626"><b>Não foi possível ler "' + esc(it.name) + '"</b><i>' + esc(P.erro) + "</i></div></div></div>";
        root.innerHTML = h; bind(); return;
      }
      var A = it.A, m = A.metricas, f = P.fxd, g = P.gen, su = P.sup;
      /* veredito */
      h += '<div class="sv-card"><div class="sv-lb">Análise automática</div><div class="sv-ver"><div class="sv-vb" style="color:' + COR[A.sev] + ";border-color:" + COR[A.sev] + ";background:" + COR[A.sev] + '18">' + ROT[A.sev] + '</div><div style="font-size:12px;color:var(--mt)">' + esc(it.name) + " · " + (f.comprimentoOnda || "") + " nm · pulso " + f.pulso + " ns · IOR " + f.ior.toFixed(4) + "</div></div>";
      h += '<div class="sv-k" style="margin-top:10px">' + [
        ["Comprimento (OTDR)", m.comprimento.toFixed(3) + " km"],
        ["Perda total", m.perdaTotal != null ? m.perdaTotal.toFixed(2) + " dB" : "—"],
        ["Atenuação média", m.attMedia != null ? m.attMedia.toFixed(3) + " dB/km" : "—"],
        ["ORL", m.orl ? m.orl.toFixed(1) + " dB" : "—"],
        ["Eventos", m.nEventos],
        ["Pior perda", m.pior ? m.pior.perda.toFixed(2) + " dB @ " + m.pior.dist.toFixed(2) + " km" : "—"],
        ["Pior reflectância", m.piorRefl ? m.piorRefl.refl.toFixed(1) + " dB @ " + m.piorRefl.dist.toFixed(2) + " km" : "—"],
        ["Faixa dinâmica", m.dinamica != null ? m.dinamica.toFixed(1) + " dB" : "—"]
      ].map(function (k) { return "<div><span>" + k[0] + "</span><b>" + k[1] + "</b></div>"; }).join("") + "</div>";
      h += '<div style="margin-top:10px">' + (A.findings.length ? A.findings.map(function (x) {
        return '<div class="sv-f" style="border-color:' + COR[x.sev] + '"' + (x.ev != null ? ' data-goev="' + x.ev + '" role="button" style="cursor:pointer"' : "") + "><b>" + (x.sev === "bad" ? "🔴 " : x.sev === "warn" ? "🟡 " : "🔵 ") + esc(x.titulo) + "</b><i>" + esc(x.det) + "</i></div>";
      }).join("") : '<div class="sv-f" style="border-color:' + COR.ok + '"><b>🟢 Nenhuma anomalia encontrada</b><i>Perdas de eventos, reflectâncias e atenuação da fibra dentro dos limites.</i></div>') + "</div>";
      h += '<div class="sv-note">Critérios automáticos: emenda ≥ ' + LIM.emenda.warn + " dB atenção / ≥ " + LIM.emenda.bad + " crítico · conector ≥ " + LIM.conector.warn + " / " + LIM.conector.bad + " dB · reflectância pior que " + LIM.reflet.warn + " / " + LIM.reflet.bad + " dB · fibra ≥ " + LIM.atenuacao(f.comprimentoOnda).warn + " / " + LIM.atenuacao(f.comprimentoOnda).bad + " dB/km. É um apoio à decisão: a interpretação final é do analista.</div></div>";
      /* comparação */
      var sameSet = items.map(function (x, k) { return k; }).filter(function (k) { return k !== S.i && items[k].P.ok; });
      if (sameSet.length || (cfg.others || []).length || S.cmpP) {
        h += '<div class="sv-card"><div class="sv-lb">Comparar curvas</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="sv-cmp"><option value="">— escolher curva para comparar com ' + esc(it.name) + " —</option>" +
          (sameSet.length ? '<optgroup label="Neste teste (arquivos anexados)">' + sameSet.map(function (k) { return '<option value="i:' + k + '"' + (S.cmpSel === "i:" + k ? " selected" : "") + ">" + esc(items[k].name) + "</option>"; }).join("") + "</optgroup>" : "") +
          ((cfg.others || []).length ? '<optgroup label="Testes anteriores deste trecho">' + (cfg.others || []).map(function (o, k) { return '<option value="o:' + k + '"' + (S.cmpSel === "o:" + k ? " selected" : "") + ">" + esc(o.label) + "</option>"; }).join("") + "</optgroup>" : "") + "</select>" +
          (S.cmpP ? '<button class="sv-btn' + (S.showCmp ? " on" : "") + '" id="sv-cmpt">' + (S.showCmp ? "Sobreposição ligada" : "Sobreposição desligada") + "</button>" : "") + "</div>" +
          (S.cmpMsg ? '<div class="sv-note">' + esc(S.cmpMsg) + "</div>" : "") +
          (S.cmpRes ? '<div style="margin-top:10px">' + (S.cmpRes.length ? S.cmpRes.map(function (x) { return '<div class="sv-f" style="border-color:' + COR[x.sev] + '"' + (x.ev != null ? ' data-goev="' + x.ev + '"' : "") + "><b>" + esc(x.titulo) + "</b><i>" + esc(x.det) + "</i></div>"; }).join("") : "") + "</div>" : "") + "</div>";
      }
      /* gráfico */
      h += '<div class="sv-card"><div class="sv-lb">Curva (nível relativo ao início da fibra)</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button class="sv-btn" id="sv-zi">＋ Zoom</button><button class="sv-btn" id="sv-zo">－ Zoom</button><button class="sv-btn" id="sv-zr">Fibra</button><button class="sv-btn" id="sv-zf">Tudo (com ruído)</button><button class="sv-btn" id="sv-ccl">Limpar cursores</button><button class="sv-btn" id="sv-png">⬇ PNG</button><button class="sv-btn" id="sv-csvt">⬇ Curva CSV</button></div>' +
        "" + (S.cmpP ? '<div class="sv-ro" style="margin:0 0 8px"><span style="color:#0ea5e9"><b>━</b> ' + esc(it.name) + '</span><span style="color:#a78bfa"><b>┅</b> ' + esc(S.cmpName) + "</span></div>" : "") + '<div class="sv-cv"><canvas id="sv-cv"></canvas></div><div class="sv-ro" id="sv-ro"></div><div class="sv-note">Roda do mouse = zoom · arrastar = mover · clique = posiciona cursor A, depois B · duplo clique = voltar à fibra. Meça perda e atenuação entre A e B.</div></div>';
      /* eventos */
      var bi = null;
      if (items.length > 1) { var o = items[S.i === 0 ? 1 : 0]; if (o.P.ok && !S.cmpP) bi = bidir(P, o.P); }
      if (S.cmpP) h += cmpCard();
      else {
      h += '<div class="sv-card"><div class="sv-lb">Tabela de eventos</div><div class="sv-tbw"><table class="sv-tb"><thead><tr><th>#</th><th>Tipo</th><th>Posição (km)</th><th>Perda (dB)</th>' + (bi ? "<th>Média LR/RL (dB)</th>" : "") + "<th>Reflect. (dB)</th><th>Atenuação trecho seguinte (dB/km)</th><th>Status</th></tr></thead><tbody>" +
        P.events.map(function (e, k) {
          var sv = A.evSev[k] || "ok", sec = A.secoes.filter(function (x) { return x.de === e.n; })[0];
          return '<tr class="ev" data-ev="' + k + '"><td>' + e.n + "</td><td>" + tipoTxt(e) + "</td><td>" + e.dist.toFixed(3) + "</td><td>" + (e.fim_de_fibra ? "—" : e.perda.toFixed(2)) + "</td>" + (bi ? "<td>" + (bi[k] ? bi[k].media.toFixed(2) : "—") + "</td>" : "") + "<td>" + (e.natureza !== "nrefl" && e.refl ? e.refl.toFixed(1) : "—") + "</td><td>" + (sec ? sec.att.toFixed(3) : "—") + '</td><td><span class="sv-chip" style="color:' + COR[sv] + ";border-color:" + COR[sv] + '">' + (sv === "ok" ? "OK" : sv === "bad" ? "CRÍTICO" : sv === "warn" ? "ATENÇÃO" : "INFO") + "</span></td></tr>";
        }).join("") + "</tbody></table></div>" + (bi ? '<div class="sv-note">Média bidirecional calculada entre as duas curvas deste teste (posições espelhadas).</div>' : "") + '<div style="margin-top:8px"><button class="sv-btn" id="sv-csve">⬇ Eventos CSV</button></div></div>';
      }
      /* parâmetros */
      var pr = [
        ["Arquivo", it.name], ["Versão SOR", P.version], ["Data do ensaio", fmtData(f.data)], ["Comprimento de onda", (f.comprimentoOnda || "") + " nm"], ["Largura de pulso", f.pulso + " ns"],
        ["Alcance", f.alcance.toFixed(2) + " km"], ["Resolução", f.dxM.toFixed(2) + " m"], ["Pontos", P.trace.n], ["Índice de refração", f.ior.toFixed(5)], ["Médias", f.medias + (f.tempoMedia ? " (" + f.tempoMedia.toFixed(0) + " s)" : "")],
        ["Tipo de traço", f.tipoTraco], ["Limiar de perda", f.limPerda.toFixed(3) + " dB"], ["Limiar de reflexão", f.limRefl.toFixed(1) + " dB"], ["Limiar fim de fibra", f.limFim.toFixed(1) + " dB"],
        ["Cabo", g.cabo], ["Fibra", g.fibra], ["Local A", g.locA], ["Local B", g.locB], ["Operador", g.operador], ["Comentários", g.comentarios],
        ["Equipamento", [su.fornecedor, su.otdr].filter(Boolean).join(" ")], ["Série", su.otdrSerie], ["Módulo", su.modulo], ["Software", su.software]
      ].filter(function (r) { return r[1] !== "" && r[1] != null; });
      h += '<div class="sv-card"><div class="sv-lb">Dados do arquivo (leitura completa)</div><div class="sv-pg">' + pr.map(function (r) { return "<div><span>" + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b></div>"; }).join("") + "</div></div></div>";
      root.innerHTML = h; bind(); draw();
    }


    /* ----- comparação lado a lado ----- */
    function tipoCurto(e) { return e.fim_de_fibra ? "Fim" : e.natureza === "nrefl" ? "Emenda" : e.natureza === "refl" ? "Reflexão" : "Refl. satur."; }
    function pairRows() {
      var P = cur().P, C = S.cmpP, ea = P.events, eb = C.events, la = ea.length ? ea[ea.length - 1].dist : 0, lb = eb.length ? eb[eb.length - 1].dist : 0;
      var tol = Math.max(0.05, 0.005 * Math.max(la, lb)), used = {}, rows = [];
      ea.forEach(function (e, i) { var best = -1, bd = 1e9; eb.forEach(function (f, j) { var d = Math.abs(f.dist - e.dist); if (d < bd && !used[j]) { bd = d; best = j; } }); if (best >= 0 && bd <= tol) { used[best] = 1; rows.push({ a: e, b: eb[best], ai: i, bi: best }); } else rows.push({ a: e, b: null, ai: i, bi: -1 }); });
      eb.forEach(function (f, j) { if (!used[j]) rows.push({ a: null, b: f, ai: -1, bi: j }); });
      rows.sort(function (x, y) { return (x.a ? x.a.dist : x.b.dist) - (y.a ? y.a.dist : y.b.dist); });
      return { rows: rows, tol: tol };
    }
    function cellData(e, AA) {
      if (!e) return null;
      var sec = AA && AA.secoes.filter(function (x) { return x.de === e.n; })[0];
      return { n: e.n, tipo: tipoCurto(e), pos: e.dist, perda: e.fim_de_fibra ? null : e.perda, refl: e.natureza !== "nrefl" && e.refl ? e.refl : null, att: sec ? sec.att : null };
    }
    function cmpData() {
      var pr = pairRows(), A = cur().A;
      return { tol: pr.tol, rows: pr.rows.map(function (r) {
        var a = cellData(r.a, A), b = cellData(r.b, S.cmpA), dp = a && b && a.perda != null && b.perda != null ? a.perda - b.perda : null, dx = a && b ? (a.pos - b.pos) * 1000 : null;
        return { a: a, b: b, dp: dp, dx: dx, ai: r.ai };
      }) };
    }
    function f2c(v, d) { return v == null ? "—" : v.toFixed(d); }
    function sg2(v, d) { return v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(d); }
    function cmpCard() {
      var D = cmpData(), A = cur().A, na = cur().name, nb = S.cmpName, CA = "#0ea5e9", CB = "#a78bfa";
      function side(c, col) { return c ? "<td style='border-left:2px solid " + col + "'>" + c.tipo + " " + c.n + "</td><td>" + c.pos.toFixed(3) + "</td><td>" + f2c(c.perda, 2) + "</td><td>" + f2c(c.refl, 1) + "</td><td>" + f2c(c.att, 3) + "</td>" : "<td colspan='5' style='border-left:2px solid " + col + ";color:var(--mt);text-align:center'>— não encontrado nesta curva —</td>"; }
      var h = '<div class="sv-card"><div class="sv-lb">Tabela de eventos — lado a lado</div><div class="sv-tbw"><table class="sv-tb"><thead><tr><th style="border-bottom:3px solid ' + CA + ';color:' + CA + '" colspan="5">ATUAL · ' + esc(na) + '</th><th style="border-bottom:3px solid ' + CB + ';color:' + CB + ';border-left:2px solid ' + CB + '" colspan="5">COMPARADA · ' + esc(nb) + '</th><th colspan="2" style="border-left:2px solid var(--bd)">DIFERENÇA</th></tr>' +
        '<tr><th style="border-left:2px solid ' + CA + '">Evento</th><th>Pos. (km)</th><th>Perda (dB)</th><th>Refl. (dB)</th><th>Atenuação (dB/km)</th><th style="border-left:2px solid ' + CB + '">Evento</th><th>Pos. (km)</th><th>Perda (dB)</th><th>Refl. (dB)</th><th>Atenuação (dB/km)</th><th style="border-left:2px solid var(--bd)">Δ perda (dB)</th><th>Δ pos. (m)</th></tr></thead><tbody>' +
        D.rows.map(function (r) {
          var big = r.dp != null && Math.abs(r.dp) >= 0.15, c = big ? "#ca8a04" : "var(--tx)";
          return "<tr" + (r.ai >= 0 ? ' class="ev" data-ev="' + r.ai + '"' : "") + ">" + side(r.a, CA) + side(r.b, CB) + "<td style='border-left:2px solid var(--bd);font-weight:700;color:" + c + "'>" + sg2(r.dp, 2) + "</td><td>" + sg2(r.dx, 0) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<div class="sv-note">Δ = atual − comparada. Eventos pareados pela posição (tolerância ' + (D.tol * 1000).toFixed(0) + ' m). Diferenças de perda ≥ 0,15 dB ficam em amarelo.</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="sv-btn on" id="sv-shc">📤 Compartilhar tabela</button><button class="sv-btn" id="sv-pngc">⬇ PNG</button><button class="sv-btn" id="sv-csvc">⬇ CSV lado a lado</button><button class="sv-btn" id="sv-csve">⬇ Eventos CSV (atual)</button></div><div class="sv-note" id="sv-shm"></div></div>';
      return h;
    }
    function cmpCanvas() {
      var D = cmpData(), A = cur().A, Bm = S.cmpA, na = cur().name, nb = S.cmpName, W = 1500, M = 28, RH = 30, HH = 34;
      var rowsN = D.rows.length, H = M + 34 + 22 + 60 + HH * 2 + rowsN * RH + 54, dpr = 2;
      var cv = document.createElement("canvas"); cv.width = W * dpr; cv.height = H * dpr; var x = cv.getContext("2d"); x.scale(dpr, dpr);
      var CA = "#0284c7", CB = "#7c3aed", TX = "#13202b", MT = "#566679", BD = "#d3dce6";
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
      x.textBaseline = "middle"; x.fillStyle = TX; x.font = "800 22px Inter,system-ui,sans-serif"; x.textAlign = "left";
      x.fillText("Comparação de curvas OTDR — eventos lado a lado", M, M + 8);
      x.font = "500 13px Inter,system-ui,sans-serif"; x.fillStyle = MT; x.fillText((cfg.title || "") + "  ·  gerado em " + new Date().toLocaleString("pt-BR"), M, M + 34);
      var P = cur().P, C = S.cmpP, y0 = M + 62;
      function card(xx, w, col, nm, PP, AA) {
        x.fillStyle = col + "14"; x.fillRect(xx, y0, w, 54); x.fillStyle = col; x.fillRect(xx, y0, 4, 54);
        x.textAlign = "left"; x.font = "800 14px Inter,system-ui,sans-serif"; x.fillText(nm, xx + 14, y0 + 16);
        x.font = "500 12px Inter,system-ui,sans-serif"; x.fillStyle = TX;
        var m = AA.metricas; x.fillText((PP.fxd.comprimentoOnda || "") + " nm · pulso " + PP.fxd.pulso + " ns · " + m.comprimento.toFixed(3) + " km · perda total " + f2c(m.perdaTotal, 2) + " dB · " + (m.attMedia != null ? m.attMedia.toFixed(3) + " dB/km" : "—"), xx + 14, y0 + 38);
      }
      var cw = (W - 2 * M - 16) / 2; card(M, cw, CA, "ATUAL · " + na, P, A); card(M + cw + 16, cw, CB, "COMPARADA · " + nb, C, Bm);
      var ty = y0 + 54 + 14;
      var cols = [60, 80, 80, 80, 100, 60, 80, 80, 80, 100, 100, 80], tw = cols.reduce(function (a, b) { return a + b; }, 0), sc = (W - 2 * M) / tw; cols = cols.map(function (c) { return c * sc; });
      var xs = [M]; cols.forEach(function (c, i) { xs.push(xs[i] + c); });
      x.fillStyle = CA + "22"; x.fillRect(xs[0], ty, xs[5] - xs[0], HH); x.fillStyle = CB + "22"; x.fillRect(xs[5], ty, xs[10] - xs[5], HH); x.fillStyle = "#e9eef3"; x.fillRect(xs[10], ty, xs[12] - xs[10], HH);
      x.font = "800 12px Inter,system-ui,sans-serif"; x.textAlign = "center";
      x.fillStyle = CA; x.fillText("ATUAL", (xs[0] + xs[5]) / 2, ty + HH / 2); x.fillStyle = CB; x.fillText("COMPARADA", (xs[5] + xs[10]) / 2, ty + HH / 2); x.fillStyle = TX; x.fillText("DIFERENÇA (atual − comp.)", (xs[10] + xs[12]) / 2, ty + HH / 2);
      var hd = ["Evento", "Pos. (km)", "Perda (dB)", "Refl. (dB)", "Atenuação (dB/km)", "Evento", "Pos. (km)", "Perda (dB)", "Refl. (dB)", "Atenuação (dB/km)", "Δ perda (dB)", "Δ pos. (m)"];
      var ty2 = ty + HH; x.font = "700 11px Inter,system-ui,sans-serif"; x.fillStyle = MT;
      hd.forEach(function (t, i) { x.textAlign = "center"; x.fillText(t, (xs[i] + xs[i + 1]) / 2, ty2 + HH / 2); });
      x.strokeStyle = BD; x.lineWidth = 1; x.beginPath(); x.moveTo(M, ty2 + HH); x.lineTo(W - M, ty2 + HH); x.stroke();
      D.rows.forEach(function (r, k) {
        var yy = ty2 + HH + k * RH, mid = yy + RH / 2;
        if (k % 2) { x.fillStyle = "#f6f8fa"; x.fillRect(M, yy, W - 2 * M, RH); }
        function side(c, o) {
          x.textAlign = "center"; x.fillStyle = TX; x.font = "500 12px Inter,system-ui,sans-serif";
          if (!c) { x.fillStyle = MT; x.fillText("— não encontrado nesta curva —", (xs[o] + xs[o + 5]) / 2, mid); return; }
          var v = [c.tipo + " " + c.n, c.pos.toFixed(3), f2c(c.perda, 2), f2c(c.refl, 1), f2c(c.att, 3)];
          v.forEach(function (t, i) { x.fillText(t, (xs[o + i] + xs[o + i + 1]) / 2, mid); });
        }
        side(r.a, 0); side(r.b, 5);
        var big = r.dp != null && Math.abs(r.dp) >= 0.15; x.font = "800 12px Inter,system-ui,sans-serif"; x.fillStyle = big ? "#b45309" : TX; x.textAlign = "center"; x.fillText(sg2(r.dp, 2), (xs[10] + xs[11]) / 2, mid);
        x.font = "500 12px Inter,system-ui,sans-serif"; x.fillStyle = TX; x.fillText(sg2(r.dx, 0), (xs[11] + xs[12]) / 2, mid);
      });
      [0, 5, 10].forEach(function (i) { x.strokeStyle = i === 0 ? CA : i === 5 ? CB : BD; x.lineWidth = 2; x.beginPath(); x.moveTo(xs[i], ty); x.lineTo(xs[i], ty2 + HH + rowsN * RH); x.stroke(); });
      x.strokeStyle = BD; x.lineWidth = 1; x.beginPath(); x.moveTo(M, ty2 + HH + rowsN * RH); x.lineTo(W - M, ty2 + HH + rowsN * RH); x.stroke();
      x.textAlign = "left"; x.fillStyle = MT; x.font = "500 11px Inter,system-ui,sans-serif";
      x.fillText("Eventos pareados pela posição (tolerância " + (D.tol * 1000).toFixed(0) + " m). Diferenças de perda ≥ 0,15 dB em destaque. Análise de apoio — a interpretação final é do analista.", M, ty2 + HH + rowsN * RH + 22);
      return cv;
    }
    function cmpText() {
      var D = cmpData(), t = "Comparação de curvas OTDR\n" + (cfg.title || "") + "\nATUAL: " + cur().name + "\nCOMPARADA: " + S.cmpName + "\n\nPos(km) | Perda atual | Perda comp. | Δ\n";
      D.rows.forEach(function (r) { t += (r.a ? r.a.pos : r.b.pos).toFixed(3) + " | " + (r.a ? f2c(r.a.perda, 2) : "—") + " | " + (r.b ? f2c(r.b.perda, 2) : "—") + " | " + sg2(r.dp, 2) + "\n"; });
      return t;
    }
    function shareCmp(mode) {
      var msg = document.getElementById("sv-shm"); function say(t) { if (msg) msg.textContent = t; }
      var cv = cmpCanvas(), nome = "comparacao_curvas_" + cur().name.replace(/\.sor$/i, "") + "_x_" + S.cmpName.replace(/\.sor$/i, "") + ".png";
      cv.toBlob(function (bl) {
        if (!bl) { say("Não foi possível gerar a imagem."); return; }
        var file = null; try { file = new File([bl], nome, { type: "image/png" }); } catch (e) { }
        function save() { var a = document.createElement("a"), u = URL.createObjectURL(bl); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); say("Imagem baixada: " + nome); }
        if (mode === "share" && navigator.share && file && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "Comparação de curvas OTDR", text: cmpText() }).then(function () { say("Compartilhado."); }).catch(function (e) { if (e && e.name !== "AbortError") save(); });
        } else save();
      }, "image/png");
    }
    function csvCmp() {
      var D = cmpData(), t = "pos_atual_km;evento_atual;perda_atual_dB;refl_atual_dB;att_atual_dB_km;pos_comp_km;evento_comp;perda_comp_dB;refl_comp_dB;att_comp_dB_km;delta_perda_dB;delta_pos_m\n";
      function c(o) { return o ? [o.pos.toFixed(4), o.tipo + " " + o.n, f2c(o.perda, 3), f2c(o.refl, 2), f2c(o.att, 4)] : ["", "", "", "", ""]; }
      D.rows.forEach(function (r) { t += c(r.a).concat(c(r.b), [r.dp == null ? "" : r.dp.toFixed(3), r.dx == null ? "" : r.dx.toFixed(1)]).join(";") + "\n"; });
      dl("comparacao_" + cur().name.replace(/\.sor$/i, "") + "_x_" + S.cmpName.replace(/\.sor$/i, "") + ".csv", t);
    }
    /* ----- desenho ----- */
    var geo = null;
    function cssv(n, d) { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; } catch (e) { return d; } }
    function yRange(P, x0, x1) {
      var tr = P.trace, i0 = Math.max(0, Math.floor(x0 / tr.dx)), i1 = Math.min(tr.n - 1, Math.ceil(x1 / tr.dx)), lo = 1e9, hi = -1e9;
      for (var i = i0; i <= i1; i++) { var v = tr.y[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (S.showCmp && S.cmpP) { var t2 = S.cmpP.trace, j0 = Math.max(0, Math.floor(x0 / t2.dx)), j1 = Math.min(t2.n - 1, Math.ceil(x1 / t2.dx)); for (var j = j0; j <= j1; j++) { var w = t2.y[j]; if (w < lo) lo = w; if (w > hi) hi = w; } }
      if (!(hi > lo)) { lo = -1; hi = 1; }
      var pd = (hi - lo) * 0.06; return { y0: lo - pd, y1: hi + pd };
    }
    function drawTrace(ctx, tr, g, x0, x1, y0, y1, col, w, dash) {
      var px0 = g.l, pw = g.w, cx = function (x) { return g.l + (x - x0) / (x1 - x0) * g.w; }, cy = function (y) { return g.t + (1 - (y - y0) / (y1 - y0)) * g.h; };
      var i0 = Math.max(0, Math.floor(x0 / tr.dx)), i1 = Math.min(tr.n - 1, Math.ceil(x1 / tr.dx));
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []);
      var per = (i1 - i0 + 1) / pw;
      if (per <= 1.5) { for (var i = i0; i <= i1; i++) { var X = cx(i * tr.dx), Y = cy(tr.y[i]); i === i0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); } }
      else {
        for (var c = 0; c < pw; c++) {
          var a = i0 + Math.floor(c * per), b = Math.min(i1, i0 + Math.floor((c + 1) * per)), lo = 1e9, hi = -1e9, last = 0;
          if (a > i1) break;
          for (var k = a; k <= b; k++) { var v = tr.y[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
          var X2 = px0 + c + 0.5; ctx.moveTo(X2, cy(hi)); ctx.lineTo(X2, cy(lo));
        }
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    function draw() {
      var cv = document.getElementById("sv-cv"); if (!cv) return;
      var P = cur().P, A = cur().A, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      var ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
      var tx = cssv("--tx", "#e8ecf0"), mt = cssv("--mt", "#7a8a9e"), bd = cssv("--bd", "#2a3545");
      var g = { l: 52, t: 10, w: W - 52 - 12, h: H - 10 - 28 }; geo = g;
      var v = S.view, yr = yRange(P, v.x0, v.x1); S.yr = yr;
      var cx = function (x) { return g.l + (x - v.x0) / (v.x1 - v.x0) * g.w; }, cy = function (y) { return g.t + (1 - (y - yr.y0) / (yr.y1 - yr.y0)) * g.h; };
      ctx.font = "10px Inter,system-ui,sans-serif"; ctx.fillStyle = mt; ctx.strokeStyle = bd; ctx.lineWidth = 1;
      var tX = ticks(v.x0, v.x1, Math.max(3, Math.floor(g.w / 90))), tY = ticks(yr.y0, yr.y1, 6);
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      tX.v.forEach(function (x) { var X = Math.round(cx(x)) + 0.5; ctx.beginPath(); ctx.moveTo(X, g.t); ctx.lineTo(X, g.t + g.h); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(+x.toFixed(4) + "", X, g.t + g.h + 6); });
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      tY.v.forEach(function (y) { var Y = Math.round(cy(y)) + 0.5; ctx.beginPath(); ctx.moveTo(g.l, Y); ctx.lineTo(g.l + g.w, Y); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(+y.toFixed(3) + "", g.l - 6, Y); });
      ctx.textAlign = "left"; ctx.fillText("dB", 6, g.t + 4); ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText("km", W - 6, H - 2);
      ctx.save(); ctx.beginPath(); ctx.rect(g.l, g.t, g.w, g.h); ctx.clip();
      /* trechos com problema */
      A.secoes.forEach(function (s) { if (s.sev === "ok") return; ctx.fillStyle = COR[s.sev] + "22"; ctx.fillRect(cx(s.x0), g.t, cx(s.x1) - cx(s.x0), g.h); });
      if (S.showCmp && S.cmpP) drawTrace(ctx, S.cmpP.trace, g, v.x0, v.x1, yr.y0, yr.y1, "#a78bfa", 1.2, [5, 3]);
      drawTrace(ctx, P.trace, g, v.x0, v.x1, yr.y0, yr.y1, "#0ea5e9", 1.4);
      /* eventos */
      ctx.font = "bold 10px Inter,system-ui,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      P.events.forEach(function (e, k) {
        var X = cx(e.dist); if (X < g.l - 2 || X > g.l + g.w + 2) return;
        var c = COR[A.evSev[k] || "ok"], sel = S.selEv === k;
        ctx.strokeStyle = c; ctx.lineWidth = sel ? 2 : 1; ctx.globalAlpha = sel ? 1 : 0.7; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X, g.t); ctx.lineTo(X, g.t + g.h); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = c; ctx.fillRect(X - 8, g.t, 16, 13); ctx.fillStyle = "#fff"; ctx.fillText(String(e.n), X, g.t + 2);
      });
      /* cursores */
      [["a", S.ca, "#22c55e"], ["b", S.cb, "#f97316"]].forEach(function (c) {
        if (c[1] == null) return; var X = cx(c[1]); ctx.strokeStyle = c[2]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X, g.t); ctx.lineTo(X, g.t + g.h); ctx.stroke();
        ctx.fillStyle = c[2]; ctx.fillRect(X - 7, g.t + g.h - 14, 14, 14); ctx.fillStyle = "#fff"; ctx.fillText(c[0].toUpperCase(), X, g.t + g.h - 12);
      });
      if (S.hover != null) { var HX = cx(S.hover); ctx.strokeStyle = tx; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(HX, g.t); ctx.lineTo(HX, g.t + g.h); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.restore();
      readout();
    }
    function yAt(P, x) { var tr = P.trace, i = Math.max(0, Math.min(tr.n - 1, Math.round(x / tr.dx))); return tr.y[i]; }
    function readout() {
      var ro = document.getElementById("sv-ro"); if (!ro) return; var P = cur().P, C = S.showCmp ? S.cmpP : null, h = "";
      function sg(v) { return (v > 0 ? "+" : "") + v.toFixed(2); }
      function pt(lbl, x, col) {
        var y1 = yAt(P, x), t = '<span' + (col ? ' style="color:' + col + '"' : "") + ">" + lbl + x.toFixed(3) + " km · " + (C ? "atual " : "") + y1.toFixed(2) + " dB";
        if (C) { var y2 = yAt(C, x); t += ' · <span style="color:#a78bfa">comparada ' + y2.toFixed(2) + " dB</span> · Δ " + sg(y1 - y2) + " dB"; }
        return t + "</span>";
      }
      if (S.hover != null) h += pt("Cursor: ", S.hover);
      if (S.ca != null) h += pt("A: ", S.ca, "#22c55e");
      if (S.cb != null) h += pt("B: ", S.cb, "#f97316");
      if (S.ca != null && S.cb != null) {
        var d = Math.abs(S.cb - S.ca), sgn = S.cb < S.ca ? -1 : 1, L = sgn * (yAt(P, S.ca) - yAt(P, S.cb));
        h += "<span><b>A↔B: " + d.toFixed(3) + " km · perda " + (C ? "atual " : "") + L.toFixed(2) + " dB" + (d > 0 ? " · " + (L / d).toFixed(3) + " dB/km" : "") + "</b></span>";
        if (C) { var L2 = sgn * (yAt(C, S.ca) - yAt(C, S.cb)); h += '<span style="color:#a78bfa"><b>comparada ' + L2.toFixed(2) + " dB" + (d > 0 ? " · " + (L2 / d).toFixed(3) + " dB/km" : "") + "</b></span><span><b>Δ perda (atual − comparada): " + sg(L - L2) + " dB" + (d > 0 ? " · " + sg((L - L2) / d) + " dB/km" : "") + "</b></span>"; }
      }
      ro.innerHTML = h;
    }
    function zoom(f, c) {
      var v = S.view, tr = cur().P.trace, L = tr.n * tr.dx; if (c == null) c = (v.x0 + v.x1) / 2;
      var w = Math.max(tr.dx * 20, (v.x1 - v.x0) * f); w = Math.min(w, L);
      var r = (c - v.x0) / (v.x1 - v.x0), x0 = c - r * w, x1 = x0 + w;
      if (x0 < 0) { x1 -= x0; x0 = 0; } if (x1 > L) { x0 -= x1 - L; x1 = L; } S.view = { x0: Math.max(0, x0), x1: Math.min(L, x1) }; draw();
    }
    function goEv(k) {
      var e = cur().P.events[k]; if (!e) return; var tr = cur().P.trace, L = tr.n * tr.dx, w = Math.min(L, Math.max(0.6, L * 0.06));
      var x0 = Math.max(0, e.dist - w / 2), x1 = Math.min(L, x0 + w); S.view = { x0: Math.max(0, x1 - w), x1: x1 }; S.selEv = k; draw();
      var cv = document.getElementById("sv-cv"); if (cv) cv.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    function xFrom(ev) { var cv = document.getElementById("sv-cv"), r = cv.getBoundingClientRect(), px = ev.clientX - r.left; return S.view.x0 + (px - geo.l) / geo.w * (S.view.x1 - S.view.x0); }

    function bind() {
      function $(id) { return document.getElementById(id); }
      $("sv-x").onclick = close;
      Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { S.i = +b.getAttribute("data-tab"); S.cmpRes = null; S.cmpP = null; S.cmpSel = null; S.cmpMsg = ""; fit(); render(); }; });
      Array.prototype.forEach.call(root.querySelectorAll("[data-ev]"), function (r) { r.onclick = function () { goEv(+r.getAttribute("data-ev")); }; });
      Array.prototype.forEach.call(root.querySelectorAll("[data-goev]"), function (r) { r.style.cursor = "pointer"; r.onclick = function () { goEv(+r.getAttribute("data-goev")); }; });
      if (!cur().P.ok) return;
      $("sv-zi").onclick = function () { zoom(0.5); }; $("sv-zo").onclick = function () { zoom(2); };
      $("sv-zr").onclick = function () { fit(); draw(); }; $("sv-zf").onclick = function () { fit(true); draw(); }; $("sv-ccl").onclick = function () { S.ca = S.cb = null; S.next = "a"; draw(); };
      $("sv-png").onclick = function () { var cv = $("sv-cv"), a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = cur().name.replace(/\.sor$/i, "") + "_curva.png"; a.click(); };
      $("sv-csvt").onclick = function () { var P = cur().P, tr = P.trace, t = "km;dB\n"; for (var i = 0; i < tr.n; i++) t += (i * tr.dx).toFixed(5) + ";" + tr.y[i].toFixed(3) + "\n"; dl(cur().name.replace(/\.sor$/i, "") + "_curva.csv", t); };
      $("sv-csve").onclick = function () { var P = cur().P, t = "n;tipo;posicao_km;perda_dB;reflectancia_dB;inclinacao_dB_km;comentario\n"; P.events.forEach(function (e) { t += [e.n, e.tipo, e.dist.toFixed(4), e.perda.toFixed(3), e.refl.toFixed(3), e.inclinacao.toFixed(3), (e.comentario || "").replace(/;/g, ",")].join(";") + "\n"; }); dl(cur().name.replace(/\.sor$/i, "") + "_eventos.csv", t); };
      var sel = $("sv-cmp");
      if (sel) sel.onchange = function () {
        var k = sel.value; if (k === "") { S.cmpP = null; S.cmpRes = null; S.cmpSel = null; S.cmpMsg = ""; render(); return; }
        if (k.indexOf("i:") === 0) {
          var o = items[+k.slice(2)]; S.cmpSel = k; S.cmpP = o.P; S.cmpA = o.A || analyze(o.P, {}); S.cmpName = o.name; S.cmpRes = compare(cur().P, o.P, { neutral: true });
          S.cmpMsg = cur().name + " (azul) × " + o.name + " (tracejado roxo). Passe o mouse ou use os cursores A/B para ler as duas curvas no mesmo ponto."; render(); return;
        }
        S.cmpSel = k; S.cmpMsg = "Carregando curva anterior..."; render();
        cfg.others[+k.slice(2)].load().then(function (list) {
          var cands = (list || []).map(function (x) { return { name: x.name, P: parse(x.buf) }; }).filter(function (x) { return x.P.ok; });
          if (!cands.length) { S.cmpP = null; S.cmpRes = null; S.cmpMsg = "Esse teste não tem curva .SOR legível."; render(); return; }
          var pick = cands.filter(function (x) { return x.name === cur().name; })[0] || cands[Math.min(S.i, cands.length - 1)];
          S.cmpP = pick.P; S.cmpA = analyze(pick.P, {}); S.cmpName = pick.name; S.cmpRes = compare(cur().P, pick.P); S.cmpMsg = "Comparando com " + pick.name + " (tracejado roxo). Passe o mouse ou use os cursores A/B para ler as duas curvas no mesmo ponto."; render();
        }).catch(function (e) { S.cmpP = null; S.cmpRes = null; S.cmpMsg = "Erro ao carregar: " + (e && e.message || e); render(); });
      };
      var b1 = $("sv-shc"); if (b1) b1.onclick = function () { shareCmp("share"); };
      var b2 = $("sv-pngc"); if (b2) b2.onclick = function () { shareCmp("png"); };
      var b3 = $("sv-csvc"); if (b3) b3.onclick = csvCmp;
      var ct = $("sv-cmpt"); if (ct) ct.onclick = function () { S.showCmp = !S.showCmp; render(); };
      var cv = $("sv-cv"), moved = 0;
      cv.onwheel = function (e) { e.preventDefault(); zoom(e.deltaY > 0 ? 1.25 : 0.8, xFrom(e)); };
      cv.onmousemove = function (e) {
        if (S.drag) {
          var dx = (e.clientX - S.drag.px) / geo.w * (S.drag.v.x1 - S.drag.v.x0), L = cur().P.trace.n * cur().P.trace.dx, w = S.drag.v.x1 - S.drag.v.x0, x0 = S.drag.v.x0 - dx;
          x0 = Math.max(0, Math.min(L - w, x0)); S.view = { x0: x0, x1: x0 + w }; moved = Math.max(moved, Math.abs(e.clientX - S.drag.px)); draw(); return;
        }
        S.hover = xFrom(e); draw();
      };
      cv.onmouseleave = function () { S.hover = null; S.drag = null; draw(); };
      cv.onmousedown = function (e) { S.drag = { px: e.clientX, v: { x0: S.view.x0, x1: S.view.x1 } }; moved = 0; };
      cv.onmouseup = function (e) {
        var was = S.drag; S.drag = null; if (!was || moved > 4) return;
        var x = Math.max(0, xFrom(e)); if (S.next === "a") { S.ca = x; S.next = "b"; } else { S.cb = x; S.next = "a"; } draw();
      };
      cv.ondblclick = function () { fit(); draw(); };
      /* toque: arrastar com um dedo, pinça com dois */
      var tch = null;
      cv.ontouchstart = function (e) {
        if (e.touches.length === 2) tch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), v: { x0: S.view.x0, x1: S.view.x1 } };
        else tch = { px: e.touches[0].clientX, v: { x0: S.view.x0, x1: S.view.x1 }, t: Date.now(), m: 0, cx: e.touches[0].clientX };
      };
      cv.ontouchmove = function (e) {
        if (!tch) return; e.preventDefault(); var L = cur().P.trace.n * cur().P.trace.dx;
        if (e.touches.length === 2 && tch.d) {
          var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), f = tch.d / d, c = (tch.v.x0 + tch.v.x1) / 2, w = Math.min(L, Math.max(cur().P.trace.dx * 20, (tch.v.x1 - tch.v.x0) * f)), x0 = Math.max(0, Math.min(L - w, c - w / 2));
          S.view = { x0: x0, x1: x0 + w }; draw();
        } else if (tch.px != null) {
          var dx = (e.touches[0].clientX - tch.px) / geo.w * (tch.v.x1 - tch.v.x0), w2 = tch.v.x1 - tch.v.x0, x02 = Math.max(0, Math.min(L - w2, tch.v.x0 - dx)); tch.m = Math.max(tch.m, Math.abs(e.touches[0].clientX - tch.px)); S.view = { x0: x02, x1: x02 + w2 }; draw();
        }
      };
      cv.ontouchend = function (e) {
        if (tch && tch.px != null && tch.m < 6) { var x = Math.max(0, xFrom({ clientX: tch.cx })); if (S.next === "a") { S.ca = x; S.next = "b"; } else { S.cb = x; S.next = "a"; } draw(); }
        tch = null;
      };
    }
    window.addEventListener("resize", function () { if (root.isConnected) draw(); });
    items.forEach(function () { });
    fit(); render();
    return { close: close };
  }

  window.TBSOR = { parse: parse, analyze: analyze, compare: compare, bidir: bidir, open: open, LIM: LIM };
})();
