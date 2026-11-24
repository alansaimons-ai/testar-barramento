/* TESTAR BARRAMENTO — exportar um teste registrado (histórico) no padrão "Resumo dos 2 sentidos".
   window.TBHX.menu(registro, botao) abre o menu: Compartilhar · Imagem PNG · PowerPoint · Copiar texto.
   Desenha slides 16:9 (1920x1080) a partir de tb_testes (colunas + dados jsonb), sem depender da tela. */
(function () {
  var W = 1920, H = 1080, M = 48, FN = "Inter,system-ui,-apple-system,Arial,sans-serif";
  var F1 = "#22A861", F2 = "#3B82F6", AM = "#FFD919";

  function st(A) {
    var S = Math.abs(A);
    if (A < 0 && S >= 3) return S <= 5 ? { l: "Saturado", c: "#38bdf8", u: "TRECHO SATURADO", s: "Saturação leve (3–5 dB acima da referência)" } : { l: "Saturado", c: "#8b5cf6", u: "TRECHO SATURADO", s: "Saturação alta (> 5 dB acima da referência)" };
    if (S < 3) return { l: "Normal", c: "#16a34a", u: "NORMAL", s: "Dentro da tolerância (< 3 dB)" };
    if (S < 5) return { l: "Atenção", c: "#ca8a04", u: "TRECHO ATENUADO", s: "Atenção (3–5 dB abaixo da referência)" };
    if (S < 10) return { l: "Crítico P2", c: "#ea580c", u: "TRECHO ATENUADO", s: "Crítico P2 (5–10 dB abaixo da referência)" };
    return { l: "Crítico P1", c: "#dc2626", u: "TRECHO ATENUADO", s: "Crítico P1 (≥ 10 dB abaixo da referência)" };
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function sg(v) { v = num(v); return v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2); }
  function f2(v) { v = num(v); return v == null ? "—" : v.toFixed(2); }
  function fmt(d) { var x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString("pt-BR") + " " + x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function fd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (s || ""); }
  function atx(A) { return typeof A == "number" ? A.toFixed(2) + " dB" : (A || []).map(function (S) { return S.label + ": " + Number(S.v).toFixed(2) + " dB"; }).join(" | "); }
  function cmpTxt(A) { return A == null ? "" : A >= .1 ? "MELHORIA de " + A.toFixed(2) + " dB no pior caso" : A <= -.1 ? "PIORA de " + Math.abs(A).toFixed(2) + " dB no pior caso" : "SEM VARIAÇÃO relevante no pior caso (< 0,10 dB)"; }
  function dirColor(i, n, label, R) {
    /* FIBRA 1 = sentido LR (verde), FIBRA 2 = sentido RL (azul) */
    if (n >= 2) return i === 0 ? F1 : F2;
    var c = (R.dados || {}).comp; if (c && c.rows) { var r = c.rows.filter(function (x) { return x.label === label; })[0]; if (r) return r.dir === "rl" ? F2 : F1; }
    return F1;
  }
  function theme() {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    return light ? { bg: "#F4F5F9", sf: "#FFFFFF", sf2: "#F4F5F9", bd: "#DCDFE9", tx: "#2E2D39", mt: "#514F66", ac: "#694A00", logo: window.TBLOGO && window.TBLOGO.posBig, light: 1, g2: "#FFFFFF" }
      : { bg: "#24232D", sf: "#2E2D39", sf2: "#383747", bd: "#514F66", tx: "#F4F5F9", mt: "#A9ACC7", ac: "#FFD919", logo: window.TBLOGO && window.TBLOGO.negBig, light: 0, g2: "#C2C6D6" };
  }
  function loadImg(src) { return new Promise(function (ok) { if (!src) return ok(null); var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; }); }

  function slides(R, logo) {
    var T = theme(), D = R.dados || {}, dirs = D.dirs || [], eqs = D.eqs || [], out = [], worst = num(R.pior_dif) || 0, sw = st(worst);
    var bar = R.barramento || "", trc = String(R.trecho || "").replace(bar, "").trim() || R.trecho || "";
    var rows = []; eqs.forEach(function (E, ei) { (E.items || []).forEach(function (x) { rows.push({ e: E, ei: ei, x: x }); }); });
    function mk() { var cv = document.createElement("canvas"); cv.width = W; cv.height = H; var c = cv.getContext("2d"); c.fillStyle = T.bg; c.fillRect(0, 0, W, H); c.textBaseline = "middle"; return { cv: cv, c: c }; }
    function fit(c, t, w) { t = String(t == null ? "" : t); if (c.measureText(t).width <= w) return t; while (t.length > 1 && c.measureText(t + "…").width > w) t = t.slice(0, -1); return t + "…"; }
    function wrap(c, t, w) { var ln = []; String(t || "").split(/\n/).forEach(function (p) { var ws = p.split(/\s+/), cur = ""; ws.forEach(function (wd) { var tt = cur ? cur + " " + wd : wd; if (c.measureText(tt).width > w && cur) { ln.push(cur); cur = wd; } else cur = tt; }); ln.push(cur); }); return ln; }
    function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function card(c, x, y, w, h) { c.fillStyle = T.sf; rr(c, x, y, w, h, 14); c.fill(); c.strokeStyle = T.bd; c.lineWidth = 1.5; rr(c, x, y, w, h, 14); c.stroke(); }
    function pill(c, x, y, txt, col, size, align) {
      c.font = "800 " + size + "px " + FN; var w = c.measureText(txt).width + size * 1.4, h = size * 1.9; if (align === "center") x -= w / 2; else if (align === "right") x -= w;
      c.fillStyle = col + (T.light ? "22" : "2e"); rr(c, x, y, w, h, h / 2); c.fill(); c.strokeStyle = col; c.lineWidth = 2; rr(c, x, y, w, h, h / 2); c.stroke();
      c.fillStyle = T.light ? shade(col) : col; c.textAlign = "center"; c.fillText(txt, x + w / 2, y + h / 2 + 1); return w;
    }
    function shade(h) { var n = parseInt(h.slice(1), 16), r = (n >> 16) * .62, g = ((n >> 8) & 255) * .62, b = (n & 255) * .62; return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")"; }
    function head(c, pg, tot) {
      c.fillStyle = T.sf; c.fillRect(0, 0, W, 100);
      var gr = c.createLinearGradient(0, 0, W, 0); gr.addColorStop(.3, AM); gr.addColorStop(.75, T.g2); c.fillStyle = gr; c.fillRect(0, 100, W, 5);
      var x = M; if (logo) { var lh = 40, lw = logo.width * lh / logo.height; c.drawImage(logo, x, 30, lw, lh); x += lw + 24; c.fillStyle = T.bd; c.fillRect(x, 26, 2, 48); x += 24; }
      c.textAlign = "left"; c.fillStyle = T.tx; c.font = "700 28px " + FN; c.fillText("Testar Barramento", x, 40);
      c.fillStyle = T.mt; c.font = "500 17px " + FN; c.fillText("Resumo dos 2 sentidos · teste registrado", x, 70);
      c.textAlign = "right"; c.fillStyle = T.tx; c.font = "700 22px " + FN; c.fillText("Teste de " + fmt(R.created_at), W - M, 40);
      c.fillStyle = T.mt; c.font = "500 16px " + FN; c.fillText((D.protocolo ? D.protocolo.tipo + " " + D.protocolo.numero + "   ·   " : "") + "página " + pg + "/" + tot, W - M, 70);
    }
    function foot(c) { c.fillStyle = T.mt; c.font = "500 14px " + FN; c.textAlign = "left"; c.fillText("Perda = Pin(RX) − Pout(TX)   ·   Dif. = |Perda| − Referência   ·   Normal < 3 dB · Atenção 3–5 dB · Crítico P2 5–10 dB · Crítico P1 ≥ 10 dB", M, H - 26); c.textAlign = "right"; c.fillText("TESTAR BARRAMENTO · V.tal", W - M, H - 26); }

    /* tabela de equipamentos */
    var cols = [["Sentido", 200, "l"], ["TX → RX", 250, "l"], ["Ref", 70, "c"], ["Pout", 90, "c"], ["Pin", 90, "c"], ["Perda", 90, "c"], ["dB/km", 80, "c"], ["Dif", 90, "c"], ["Status", 0, "c"]];
    function table(c, x, y, w, list) {
      var fixed = cols.reduce(function (a, k) { return a + k[1]; }, 0); cols[8][1] = Math.max(150, w - fixed);
      c.fillStyle = T.sf2; c.fillRect(x, y, w, 36); var cx = x; c.font = "700 13px " + FN; c.fillStyle = T.mt;
      cols.forEach(function (k) { c.textAlign = k[2] === "l" ? "left" : "center"; c.fillText(k[0].toUpperCase(), k[2] === "l" ? cx + 12 : cx + k[1] / 2, y + 18); cx += k[1]; });
      y += 36;
      list.forEach(function (r, i) {
        var x2 = r.x, s = st(num(x2.dif) || 0), col = dirColor(r.ei, eqs.length, r.e.label, R);
        if (i % 2) { c.fillStyle = T.sf2; c.globalAlpha = .55; c.fillRect(x, y, w, 40); c.globalAlpha = 1; }
        c.fillStyle = col; c.fillRect(x, y + 6, 4, 28);
        var v = [r.e.label, x2.tx + " → " + x2.rx, String(x2.ref == null ? "—" : x2.ref), f2(x2.pout), f2(x2.pin), f2(x2.perda), f2(x2.dbkm), sg(x2.dif), x2.st || s.l];
        cx = x; cols.forEach(function (k, j) {
          c.textAlign = k[2] === "l" ? "left" : "center"; c.font = (j === 7 || j === 8 ? "800 " : j === 0 ? "700 " : "500 ") + "15px " + FN;
          c.fillStyle = j === 7 || j === 8 ? (T.light ? shade(s.c) : s.c) : j === 0 ? col : T.tx;
          c.fillText(fit(c, v[j], k[1] - 16), k[2] === "l" ? cx + 12 : cx + k[1] / 2, y + 20); cx += k[1];
        });
        c.strokeStyle = T.bd; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + 40); c.lineTo(x + w, y + 40); c.stroke();
        y += 40;
      });
      return y;
    }

    /* painel direito: conclusão, comparativo, melhorias, Raman, atenuador */
    function side(c, x, y, w, hMax) {
      var y0 = y;
      function sec(t) { c.textAlign = "left"; c.fillStyle = T.ac; c.font = "800 13px " + FN; c.fillText(t.toUpperCase(), x, y + 8); c.fillStyle = AM; c.fillRect(x, y + 20, 28, 3); y += 38; }
      function line(t, col, font) { c.font = font || "500 16px " + FN; wrap(c, t, w).forEach(function (l) { if (y > y0 + hMax - 20) return; c.textAlign = "left"; c.fillStyle = col || T.tx; c.fillText(l, x, y + 10); y += 24; }); }
      sec("Conclusão do teste"); line(sw.u + " — " + sw.s, sw.c && T.light ? shade(sw.c) : sw.c, "800 17px " + FN); line("Pior caso: " + sg(worst) + " dB", T.mt); y += 14;
      var C = D.comp;
      if (C) {
        sec("Antes × depois da atividade"); line("Medição anterior: " + (fd(C.data) || "data não informada"), T.mt);
        if (C.ganho != null && C.antes && C.depois) { var gc = C.ganho >= .1 ? "#16a34a" : C.ganho <= -.1 ? "#dc2626" : T.mt; line((C.ganho >= .1 ? "▼ " : C.ganho <= -.1 ? "▲ " : "= ") + cmpTxt(C.ganho), gc, "800 17px " + FN); line(C.antes.u + " (" + sg(C.antes.dif) + " dB) → " + C.depois.u + " (" + sg(C.depois.dif) + " dB)"); }
        (C.dirs || []).forEach(function (d) { line(d.label + ": " + (d.antes == null ? "—" : sg(d.antes)) + " → " + (d.depois == null ? "—" : sg(d.depois)) + " dB", T.mt, "500 15px " + FN); });
        y += 14;
      }
      if (D.melhorias) { sec("Melhorias realizadas"); line(D.melhorias); y += 14; }
      if ((D.raman || []).length) { sec("Raman"); D.raman.forEach(function (r) { line(r.label + ": projeto " + f2(r.proj) + " / real " + f2(r.real) + " dB — " + r.st, T.tx, "500 15px " + FN); }); y += 14; }
      if (D.aten != null && (typeof D.aten == "number" || D.aten.length)) { sec("Atenuador"); line(atx(D.aten), T.tx, "500 15px " + FN); }
    }

    /* paginação: página 1 = cabeçalho + cartões + até N linhas; demais = tabela */
    var LX = M, LW = 1180, RX = M + LW + 40, RW = W - M - RX, TOP = 130, BOT = H - 60;
    var first = Math.max(0, Math.floor((BOT - (TOP + 150 + 24 + 230 + 30 + 36)) / 40)), rest = Math.floor((BOT - TOP - 60 - 36) / 40);
    var pages = [rows.slice(0, first)]; for (var k = first; k < rows.length; k += rest) pages.push(rows.slice(k, k + rest));
    var tot = pages.length;
    pages.forEach(function (list, pi) {
      var S = mk(), c = S.c; head(c, pi + 1, tot);
      if (pi === 0) {
        /* faixa do trecho */
        card(c, LX, TOP, W - 2 * M, 150); c.fillStyle = sw.c; c.fillRect(LX, TOP + 14, 6, 122);
        c.textAlign = "left"; c.fillStyle = T.ac; c.font = "800 34px " + FN; c.fillText(fit(c, bar, 760), LX + 32, TOP + 52);
        var bw = c.measureText(fit(c, bar, 760)).width; c.fillStyle = T.tx; c.font = "700 30px " + FN; c.fillText(fit(c, trc, W - 2 * M - bw - 520), LX + 52 + bw, TOP + 52);
        c.fillStyle = T.mt; c.font = "500 19px " + FN; c.fillText("Distância: " + (R.distancia != null ? R.distancia : "—") + " km" + (D.protocolo ? "   ·   " + D.protocolo.tipo + " " + D.protocolo.numero : ""), LX + 32, TOP + 104);
        pill(c, W - M - 30, TOP + 30, (R.veredito || sw.u).toUpperCase(), sw.c, 26, "right");
        c.textAlign = "right"; c.fillStyle = T.mt; c.font = "600 17px " + FN; c.fillText("Pior caso: " + sg(worst) + " dB", W - M - 30, TOP + 112);
        /* cartões dos sentidos */
        var cy = TOP + 150 + 24, n = Math.max(1, dirs.length), gap = 24, cw = (LW - gap * (n - 1)) / n;
        if (!dirs.length) { card(c, LX, cy, LW, 230); c.fillStyle = T.mt; c.font = "500 18px " + FN; c.textAlign = "center"; c.fillText("Sem medição registrada por sentido.", LX + LW / 2, cy + 115); }
        dirs.forEach(function (d, i) {
          var x = LX + i * (cw + gap), col = dirColor(i, dirs.length, d.label, R), s = st(num(d.dif) || 0);
          card(c, x, cy, cw, 230); c.fillStyle = col; rr(c, x, cy, cw, 8, 4); c.fill();
          c.textAlign = "left"; c.fillStyle = col; c.font = "800 14px " + FN; c.fillText((col === F2 ? "FIBRA 2 · RL" : "FIBRA 1 · LR"), x + 24, cy + 36);
          c.fillStyle = T.tx; c.font = "700 20px " + FN; c.fillText(fit(c, d.label, cw - 48), x + 24, cy + 66);
          c.fillStyle = T.mt; c.font = "500 15px " + FN; c.fillText(fit(c, (d.tx ? "TX " + d.tx + " → RX " + d.rx : ""), cw - 48), x + 24, cy + 94);
          c.textAlign = "center"; c.fillStyle = T.light ? shade(s.c) : s.c; c.font = "800 52px " + FN; c.fillText(sg(d.dif) + " dB", x + cw / 2, cy + 142);
          c.fillStyle = T.mt; c.font = "500 16px " + FN; c.fillText("Perda " + f2(d.perda) + " dB  ·  " + f2(d.dbkm) + " dB/km", x + cw / 2, cy + 180);
          pill(c, x + cw / 2, cy + 194, d.st || s.l, s.c, 15, "center");
        });
        var ty = cy + 230 + 30;
        if (list.length) { c.textAlign = "left"; c.fillStyle = T.ac; c.font = "800 13px " + FN; c.fillText("MEDIÇÕES POR EQUIPAMENTO", LX, ty - 10); table(c, LX, ty + 4, LW, list); }
        else if (!rows.length) { c.textAlign = "left"; c.fillStyle = T.mt; c.font = "500 16px " + FN; c.fillText("Sem medições por equipamento neste registro.", LX, ty + 10); }
        else { c.textAlign = "left"; c.fillStyle = T.mt; c.font = "500 16px " + FN; c.fillText("Medições por equipamento na página seguinte.", LX, ty + 10); }
        card(c, RX, TOP + 150 + 24, RW, BOT - (TOP + 150 + 24));
        side(c, RX + 26, TOP + 150 + 24 + 24, RW - 52, BOT - (TOP + 150 + 24) - 40);
      } else {
        c.textAlign = "left"; c.fillStyle = T.tx; c.font = "700 24px " + FN; c.fillText(fit(c, bar + "  " + trc + "  —  medições por equipamento (continuação)", W - 2 * M), M, TOP + 20);
        table(c, M, TOP + 60, W - 2 * M, list);
      }
      foot(c); out.push(S.cv);
    });
    return out;
  }

  function texto(R) {
    var D = R.dados || {}, h = ["TESTAR BARRAMENTO — " + (R.trecho || ""), "Teste registrado em " + fmt(R.created_at) + (D.protocolo ? " · " + D.protocolo.tipo + " " + D.protocolo.numero : ""), "Distância: " + R.distancia + " km", "Conclusão: " + R.veredito + " (pior caso " + sg(R.pior_dif) + " dB)", ""];
    (D.dirs || []).forEach(function (d) { h.push(d.label + ": perda " + f2(d.perda) + " dB | " + f2(d.dbkm) + " dB/km | dif " + sg(d.dif) + " dB — " + d.st); });
    if ((D.eqs || []).length) { h.push("", "Medições por equipamento:"); D.eqs.forEach(function (E) { h.push(E.label); (E.items || []).forEach(function (x) { h.push("  TX " + x.tx + " → RX " + x.rx + ": Pout " + f2(x.pout) + " dBm | Pin " + f2(x.pin) + " dBm | perda " + f2(x.perda) + " dB | ref " + x.ref + " dB | dif " + sg(x.dif) + " dB — " + x.st); }); }); }
    if ((D.raman || []).length) { h.push("", "Situação do Raman:"); D.raman.forEach(function (r) { h.push(r.label + ": projeto " + f2(r.proj) + " dB | real " + f2(r.real) + " dB | dif " + sg(r.dif) + " dB — " + r.st); }); }
    if (D.aten != null && (typeof D.aten == "number" || D.aten.length)) h.push("", "Atenuador: " + atx(D.aten));
    var C = D.comp; if (C) {
      h.push("", "COMPARATIVO ANTES × DEPOIS DA ATIVIDADE (medição anterior: " + (fd(C.data) || "data não informada") + ")");
      (C.dirs || []).forEach(function (d) { h.push(d.label + ": antes " + (d.antes == null ? "—" : sg(d.antes)) + " dB → depois " + (d.depois == null ? "—" : sg(d.depois)) + " dB"); });
      if (C.ganho != null && C.antes && C.depois) h.push("Conclusão: " + cmpTxt(C.ganho) + " (" + C.antes.u + " " + sg(C.antes.dif) + " dB → " + C.depois.u + " " + sg(C.depois.dif) + " dB)");
    }
    if (D.melhorias) h.push("", "Melhorias realizadas: " + D.melhorias);
    return h.join("\n");
  }

  function nome(R) { var d = new Date(R.created_at), z = function (n) { return ("0" + n).slice(-2); }; return "resumo-" + String(R.trecho || R.barramento || "teste").replace(/[^\w-]+/g, "_").slice(0, 60) + (isNaN(d) ? "" : "-" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes())); }
  function save(bl, n) { var a = document.createElement("a"), u = URL.createObjectURL(bl); a.href = u; a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
  function blobs(cvs) { return Promise.all(cvs.map(function (c) { return new Promise(function (ok) { c.toBlob(ok, "image/png"); }); })); }
  function toast(t) { var d = document.createElement("div"); d.className = "tbhx-toast"; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3200); }
  function build(R) { var T = theme(); return loadImg(T.logo).then(function (lg) { return slides(R, lg); }); }

  var acts = {
    share: function (R) {
      return build(R).then(blobs).then(function (bs) {
        var n = nome(R), files = []; try { files = bs.map(function (b, i) { return new File([b], n + (bs.length > 1 ? "_" + (i + 1) : "") + ".png", { type: "image/png" }); }); } catch (e) { }
        var data = { title: "TESTAR BARRAMENTO — " + (R.trecho || ""), text: texto(R), files: files };
        if (navigator.share && files.length && navigator.canShare && navigator.canShare(data)) return navigator.share(data).catch(function () { });
        if (navigator.share) return navigator.share({ title: data.title, text: data.text }).catch(function () { });
        bs.forEach(function (b, i) { save(b, files[i] ? files[i].name : n + ".png"); }); toast("Seu navegador não compartilha daqui; a imagem foi baixada.");
      });
    },
    png: function (R) { return build(R).then(blobs).then(function (bs) { var n = nome(R); bs.forEach(function (b, i) { save(b, n + (bs.length > 1 ? "_" + (i + 1) : "") + ".png"); }); toast(bs.length > 1 ? bs.length + " imagens 16:9 baixadas." : "Imagem 16:9 baixada."); }); },
    pptx: function (R) {
      if (!window.PptxGenJS) { toast("Biblioteca de PowerPoint não carregada."); return Promise.resolve(); }
      return build(R).then(function (cvs) {
        var T = theme(), pp = new window.PptxGenJS(); pp.layout = "LAYOUT_WIDE";
        cvs.forEach(function (c) { var sl = pp.addSlide(); sl.background = { color: T.bg.slice(1) }; sl.addImage({ data: c.toDataURL("image/png"), x: 0, y: 0, w: 13.333, h: 7.5 }); });
        return pp.write({ outputType: "blob" }).then(function (b) {
          var f = null; try { f = new File([b], nome(R) + ".pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }); } catch (e) { }
          if (f && navigator.canShare && navigator.canShare({ files: [f] }) && window.matchMedia && matchMedia("(pointer:coarse)").matches) return navigator.share({ title: "TESTAR BARRAMENTO — " + (R.trecho || ""), files: [f] }).catch(function () { });
          save(b, nome(R) + ".pptx"); toast("PowerPoint gerado (" + cvs.length + " slide(s) 16:9).");
        });
      });
    },
    copy: function (R) {
      var t = texto(R);
      return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).catch(function () { var a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch (e) { } a.remove(); }).then(function () { toast("Resumo copiado como texto."); });
    }
  };

  var css = ".tbhx-m{position:absolute;z-index:200;min-width:220px;background:var(--sf);border:1px solid var(--bd);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.28);padding:6px;font-family:Inter,system-ui,sans-serif}" +
    ".tbhx-m button{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:0;border-radius:7px;background:transparent;color:var(--tx);font:600 13px Inter,system-ui,sans-serif;cursor:pointer;text-align:left}" +
    ".tbhx-m button:hover{background:var(--hv)}.tbhx-m small{display:block;padding:6px 12px 4px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--mt);font-weight:700}" +
    ".tbhx-m svg{width:16px;height:16px;flex:none;color:var(--mt)}" +
    ".tbhx-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:400;background:#2E2D39;color:#F4F5F9;padding:10px 16px;border-radius:8px;font:600 13px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)}" +
    ".tbhx-busy{opacity:.6;pointer-events:none}";
  var ic = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    png: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    pptx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4M8 21h8"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'
  };
  var menuEl = null;
  function close() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener("pointerdown", outside, true); } }
  function outside(e) { if (menuEl && !menuEl.contains(e.target)) close(); }
  function menu(R, btn) {
    if (!document.getElementById("tbhx-css")) { var s = document.createElement("style"); s.id = "tbhx-css"; s.textContent = css; document.head.appendChild(s); }
    if (menuEl) { var same = menuEl._btn === btn; close(); if (same) return; }
    var m = document.createElement("div"); m.className = "tbhx-m"; m._btn = btn;
    m.innerHTML = "<small>Exportar resumo deste teste</small>" + [["share", "Compartilhar"], ["png", "Imagem 16:9 (PNG)"], ["pptx", "PowerPoint (.pptx)"], ["copy", "Copiar texto"]].map(function (a) { return '<button type="button" data-a="' + a[0] + '">' + ic[a[0]] + "<span>" + a[1] + "</span></button>"; }).join("");
    m.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-a]"); if (!b) return; var a = b.getAttribute("data-a"); close();
      btn.classList.add("tbhx-busy"); var lb = btn.textContent; btn.textContent = "Gerando…";
      Promise.resolve().then(function () { return acts[a](R); }).catch(function (er) { toast("Não foi possível exportar: " + (er && er.message || er)); }).then(function () { btn.classList.remove("tbhx-busy"); btn.textContent = lb; });
    });
    document.body.appendChild(m); menuEl = m;
    var r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight, x = Math.min(window.scrollX + r.right - mw, window.scrollX + document.documentElement.clientWidth - mw - 8), y = window.scrollY + r.bottom + 6;
    if (r.bottom + mh + 12 > window.innerHeight) y = window.scrollY + r.top - mh - 6;
    m.style.left = Math.max(window.scrollX + 8, x) + "px"; m.style.top = y + "px";
    setTimeout(function () { document.addEventListener("pointerdown", outside, true); }, 0);
  }
  window.TBHX = { menu: menu, slides: function (R) { return build(R); }, texto: texto, acts: acts };
})();
