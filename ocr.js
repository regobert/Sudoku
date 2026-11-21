/* Sudoku Schrift — gratis tekstherkenning op het apparaat zelf.
   Zoekt het sudoku-raster in een foto, trekt het recht, knipt het in 81 vakjes
   en leest elk cijfer met Tesseract (vendor/tesseract). Geen internet of API-sleutel nodig.
   Gebruik: const r = await SudokuOCR.read(blob, {onProgress}) →
   {found, rows[9], kinds[9], unsure:[cell indexes], stars:null, difficultyText:null, title:null} */
(function () {
  "use strict";
  const BASE = "vendor/tesseract/";
  const CELL = 56, SIZE = CELL * 9;
  let workerPromise = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.Tesseract) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("Tekstherkenning kon niet worden geladen."));
      document.head.appendChild(s);
    });
  }

  async function getWorker(onProgress) {
    if (!workerPromise) {
      workerPromise = (async () => {
        await loadScript(BASE + "tesseract.min.js");
        const abs = (p) => new URL(BASE + p, document.baseURI).href;
        const w = await Tesseract.createWorker("eng", 1 /* LSTM */, {
          workerPath: abs("worker.min.js"),
          corePath: abs("core"),
          langPath: abs("lang"),
          gzip: true,
          logger: (m) => { if (onProgress && m.status && typeof m.progress === "number" && /load|initializ/i.test(m.status)) onProgress("Herkenning laden…", m.progress * 0.3); }
        });
        await w.setParameters({
          tessedit_char_whitelist: "123456789",
          tessedit_pageseg_mode: "10" /* één teken */
        });
        return w;
      })().catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  /* ---------- beeldbewerking ---------- */
  async function toCanvas(blob, max = 1400) {
    const bmp = await createImageBitmap(blob);
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }
  function grayOf(rgba, n) {
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    return g;
  }
  /* Adaptieve drempel: donker als duidelijk donkerder dan de omgeving (werkt bij schaduw). */
  function adaptive(g, w, h, rad, C) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - rad), y1 = Math.min(h, y + rad + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - rad), x1 = Math.min(w, x + rad + 1);
        const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        out[y * w + x] = g[y * w + x] < mean - C ? 1 : 0;
      }
    }
    return out;
  }
  /* Samenhangende vlekken (8-buren) met grootte en omkadering. */
  function components(bin, w, h, x0 = 0, y0 = 0, x1 = w, y1 = h) {
    const lab = new Int32Array(w * h).fill(-1), comps = [], stack = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x; if (!bin[i] || lab[i] >= 0) continue;
      const c = { n: 0, minx: x, maxx: x, miny: y, maxy: y, pts: [] }; const id = comps.length; comps.push(c);
      lab[i] = id; stack.push(i);
      while (stack.length) {
        const j = stack.pop(), jx = j % w, jy = (j / w) | 0;
        c.n++; c.pts.push(j);
        if (jx < c.minx) c.minx = jx; if (jx > c.maxx) c.maxx = jx; if (jy < c.miny) c.miny = jy; if (jy > c.maxy) c.maxy = jy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = jx + dx, ny = jy + dy; if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
          const k = ny * w + nx; if (bin[k] && lab[k] < 0) { lab[k] = id; stack.push(k); }
        }
      }
    }
    return comps;
  }
  /* Homografie: berekent H zodat bron = H(doel). */
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = dst[i], [u, v] = src[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let i = 0; i < 8; i++) {
      let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = 0; r < 8; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    return b.map((v, i) => v / A[i][i]).concat(1);
  }
  function warp(rgba, w, h, H) {
    const out = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const d = H[6] * x + H[7] * y + 1, sx = (H[0] * x + H[1] * y + H[2]) / d, sy = (H[3] * x + H[4] * y + H[5]) / d;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, o = (y * SIZE + x) * 4;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; continue; }
      for (let ch = 0; ch < 3; ch++) {
        const a = rgba[(y0 * w + x0) * 4 + ch], b2 = rgba[(y0 * w + x0 + 1) * 4 + ch], c = rgba[((y0 + 1) * w + x0) * 4 + ch], e = rgba[((y0 + 1) * w + x0 + 1) * 4 + ch];
        out[o + ch] = (a * (1 - fx) + b2 * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
      }
      out[o + 3] = 255;
    }
    return out;
  }

  /* Hoe goed lijkt een vlek op een sudoku-raster? Lijnen op 0/9..9/9 van de breedte
     moeten donker zijn, de middens van de vakjes juist niet. */
  function gridScore(bin, w, h, c) {
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1, tol = Math.max(2, Math.round(Math.min(bw, bh) / 120));
    const cov = (vertical, frac) => {
      let hit = 0, tot = 0;
      if (vertical) { const x = Math.round(c.minx + frac * (bw - 1)); for (let y = c.miny; y <= c.maxy; y += 2) { tot++; for (let d = -tol; d <= tol; d++) { const xx = x + d; if (xx >= 0 && xx < w && bin[y * w + xx]) { hit++; break; } } } }
      else { const y = Math.round(c.miny + frac * (bh - 1)); for (let x = c.minx; x <= c.maxx; x += 2) { tot++; for (let d = -tol; d <= tol; d++) { const yy = y + d; if (yy >= 0 && yy < h && bin[yy * w + x]) { hit++; break; } } } }
      return tot ? hit / tot : 0;
    };
    let lines = 0, mids = 0;
    for (let k = 0; k <= 9; k++) lines += cov(true, k / 9) + cov(false, k / 9);
    for (let k = 0; k < 9; k++) mids += cov(true, (k + 0.5) / 9) + cov(false, (k + 0.5) / 9);
    return { lines: lines / 20, mids: mids / 18 };
  }
  /* Houdt alleen lange rechte stukken over (rasterlijnen), zodat sterren, tekst en houtnerf wegvallen. */
  function lineMask(bin, w, h, L) {
    const m = new Uint8Array(w * h), gap = 2;
    for (let y = 0; y < h; y++) { let start = -1, last = -1;
      for (let x = 0; x <= w; x++) { const on = x < w && bin[y * w + x];
        if (on) { if (start < 0 || x - last > gap + 1) { if (start >= 0 && last - start + 1 >= L) for (let k = start; k <= last; k++) m[y * w + k] = 1; start = x; } last = x; }
        else if (x === w && start >= 0 && last - start + 1 >= L) for (let k = start; k <= last; k++) m[y * w + k] = 1; } }
    for (let x = 0; x < w; x++) { let start = -1, last = -1;
      for (let y = 0; y <= h; y++) { const on = y < h && bin[y * w + x];
        if (on) { if (start < 0 || y - last > gap + 1) { if (start >= 0 && last - start + 1 >= L) for (let k = start; k <= last; k++) m[k * w + x] = 1; start = y; } last = y; }
        else if (y === h && start >= 0 && last - start + 1 >= L) for (let k = start; k <= last; k++) m[k * w + x] = 1; } }
    return m;
  }
  /* Zoekt de vier hoeken van de vlek die het meest op een sudoku-raster lijkt. */
  function findGrid(bin0, w, h) {
    const minSide = Math.min(w, h), bin = lineMask(bin0, w, h, Math.round(minSide / 14)), comps = components(bin, w, h);
    let best = null, bestScore = 0;
    for (const c of comps) {
      const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1, ratio = bw / bh;
      if (ratio < 0.6 || ratio > 1.6 || Math.min(bw, bh) < minSide * 0.25 || c.n < (bw + bh) * 2) continue;
      const fill = c.n / (bw * bh); if (fill > 0.5) continue;
      const g = gridScore(bin, w, h, c); if (g.lines < 0.55) continue;
      const score = (g.lines - g.mids) * Math.sqrt(bw * bh);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) return null;
    let tl, tr, bl, br, s1 = Infinity, s2 = -Infinity, d1 = -Infinity, d2 = Infinity;
    for (const i of best.pts) {
      const x = i % w, y = (i / w) | 0;
      if (x + y < s1) { s1 = x + y; tl = [x, y]; } if (x + y > s2) { s2 = x + y; br = [x, y]; }
      if (x - y > d1) { d1 = x - y; tr = [x, y]; } if (x - y < d2) { d2 = x - y; bl = [x, y]; }
    }
    return [tl, tr, br, bl];
  }

  function rgbToSat(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }

  /* Haalt per vakje het cijfer eruit als klein zwart-op-wit plaatje. */
  function extractCells(warped) {
    const g = grayOf(warped, SIZE * SIZE), bin = adaptive(g, SIZE, SIZE, 14, 14), cells = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const m = Math.round(CELL * 0.12), x0 = c * CELL + m, y0 = r * CELL + m, x1 = (c + 1) * CELL - m, y1 = (r + 1) * CELL - m;
      const comps = components(bin, SIZE, SIZE, x0, y0, x1, y1);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      let digit = null;
      for (const k of comps) {
        const bw = k.maxx - k.minx + 1, bh = k.maxy - k.miny + 1;
        const touches = k.minx <= x0 || k.maxx >= x1 - 1 || k.miny <= y0 || k.maxy >= y1 - 1;
        if (bh < CELL * 0.28 || bw > CELL * 0.75 || k.n < 12) continue;      // te klein of een lijn
        if (touches && (bw > CELL * 0.6 || bh > CELL * 0.72)) continue;      // restje rasterlijn
        const dist = Math.hypot((k.minx + k.maxx) / 2 - cx, (k.miny + k.maxy) / 2 - cy);
        if (dist > CELL * 0.3) continue;
        if (!digit || k.n > digit.n) digit = k;
      }
      if (!digit) { cells.push(null); continue; }
      // voeg losse stukjes binnen het kader toe (gebroken handschrift)
      const pts = digit.pts.slice();
      for (const k of comps) if (k !== digit && k.n >= 4 && k.minx >= digit.minx - 3 && k.maxx <= digit.maxx + 3 && k.miny >= digit.miny - 3 && k.maxy <= digit.maxy + 3) pts.push(...k.pts);
      let darkSum = 0, satSum = 0;
      for (const i of pts) { const o = i * 4; darkSum += g[i]; satSum += rgbToSat(warped[o], warped[o + 1], warped[o + 2]); }
      const bw = digit.maxx - digit.minx + 1, bh = digit.maxy - digit.miny + 1, target = 48, sc = target / bh, pad = 20;
      const cv = document.createElement("canvas"); cv.width = Math.round(bw * sc) + pad * 2; cv.height = target + pad * 2;
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      const small = document.createElement("canvas"); small.width = bw; small.height = bh;
      const sctx = small.getContext("2d"), id = sctx.createImageData(bw, bh);
      for (let i = 0; i < bw * bh; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = 255; }
      for (const i of pts) { const x = (i % SIZE) - digit.minx, y = ((i / SIZE) | 0) - digit.miny; if (x < 0 || y < 0 || x >= bw || y >= bh) continue; const o = (y * bw + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = 0; }
      sctx.putImageData(id, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(small, pad, pad, Math.round(bw * sc), target);
      cells.push({ canvas: cv, dark: darkSum / pts.length, sat: satSum / pts.length });
    }
    return cells;
  }

  async function readOnce(blob, opts = {}) {
    const onProgress = opts.onProgress || (() => {});
    onProgress("Raster zoeken…", 0.02);
    const cv = await toCanvas(blob), w = cv.width, h = cv.height;
    const rgba = cv.getContext("2d").getImageData(0, 0, w, h).data;
    const g = grayOf(rgba, w * h), bin = adaptive(g, w, h, Math.max(8, Math.round(Math.min(w, h) / 60)), 10);
    const corners = findGrid(bin, w, h);
    if (opts.debug) { const dc = document.createElement("canvas"); dc.width = w; dc.height = h; const di = dc.getContext("2d").createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = bin[i] ? 0 : 255; di.data[i * 4] = di.data[i * 4 + 1] = di.data[i * 4 + 2] = v; di.data[i * 4 + 3] = 255; } dc.getContext("2d").putImageData(di, 0, 0); opts.debug.bin = dc.toDataURL(); opts.debug.corners = corners; opts.debug.size = [w, h]; }
    if (!corners) return { found: false };
    const H = homography(corners, [[0, 0], [SIZE, 0], [SIZE, SIZE], [0, SIZE]]);
    const warped = warp(rgba, w, h, H);
    const cells = extractCells(warped);
    if (opts.debug) { const dc = document.createElement("canvas"); dc.width = dc.height = SIZE; dc.getContext("2d").putImageData(new ImageData(warped, SIZE, SIZE), 0, 0); opts.debug.warped = dc.toDataURL(); opts.debug.cells = cells.map((c) => c && c.canvas.toDataURL()); }
    const filled = cells.filter(Boolean);
    if (filled.length < 8) return { found: false };
    const worker = await getWorker(onProgress);
    const digits = Array(81).fill("."), kinds = Array(81).fill("."), unsure = [];
    // ingevuld (handschrift/andere kleur) herkennen: duidelijk gekleurd of veel lichter dan gedrukt
    const darks = filled.map((c) => c.dark).sort((a, b) => a - b), medDark = darks[Math.floor(darks.length / 2)];
    let done = 0;
    for (let i = 0; i < 81; i++) {
      const c = cells[i]; if (!c) continue;
      let { data } = await worker.recognize(c.canvas);
      let txt = (data.text || "").replace(/[^1-9]/g, ""), conf = data.confidence || 0;
      if (!txt) { // tweede poging: als woord/regel lezen (helpt vooral bij de 9)
        for (const psm of ["8", "13", "7"]) {
          await worker.setParameters({ tessedit_pageseg_mode: psm });
          ({ data } = await worker.recognize(c.canvas));
          txt = (data.text || "").replace(/[^1-9]/g, ""); conf = Math.min(conf || 100, data.confidence || 0);
          if (txt) break;
        }
        await worker.setParameters({ tessedit_pageseg_mode: "10" });
      }
      if (txt.length >= 1) {
        digits[i] = txt[0];
        kinds[i] = c.sat > 0.28 || c.dark > medDark + 45 ? "H" : "P";
        if (conf < 60 || txt.length > 1) unsure.push(i);
      } else unsure.push(i);
      done++; onProgress("Cijfers lezen…", 0.3 + 0.7 * (done / filled.length));
    }
    const rows = [], krows = [];
    for (let r = 0; r < 9; r++) { rows.push(digits.slice(r * 9, r * 9 + 9).join("")); krows.push(kinds.slice(r * 9, r * 9 + 9).join("")); }
    return { found: true, rows, kinds: krows, unsure, filled: filled.length, stars: null, difficultyText: null, title: null, engine: "free" };
  }

  /* Leest de foto; is bijna alles onzeker, dan staat de foto waarschijnlijk scheef
     en proberen we hem een kwart, half en driekwart gedraaid. */
  async function read(blob, opts = {}) {
    const onProgress = opts.onProgress || (() => {});
    let best = await readOnce(blob, opts), b = blob;
    const bad = (r) => !r.found || r.unsure.length > Math.max(2, r.filled * 0.3);
    if (!bad(best)) return best;
    for (let turn = 1; turn <= 3; turn++) {
      onProgress("Foto draaien en opnieuw lezen…", 0.05);
      b = await rotate(b);
      const r = await readOnce(b, { onProgress });
      if (r.found && (!best.found || r.unsure.length < best.unsure.length)) best = r;
      if (!bad(best)) break;
    }
    return best;
  }

  /* Draait een foto een kwartslag met de klok mee. */
  async function rotate(blob) {
    const bmp = await createImageBitmap(blob), c = document.createElement("canvas");
    c.width = bmp.height; c.height = bmp.width;
    const ctx = c.getContext("2d"); ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(bmp, 0, 0);
    return new Promise((r) => c.toBlob((b) => r(b || blob), "image/jpeg", 0.92));
  }

  window.SudokuOCR = { read, rotate, preload: () => getWorker() };
})();
