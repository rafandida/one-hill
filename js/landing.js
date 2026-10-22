/**
 * One Hill (a Tank Wars tribute) — front page toys.
 *
 * The hero is a little hill you can shell: the logo is the target, a CPU tank
 * shoots back when you go quiet, and the logo slowly rebuilds itself. Below
 * that: the live attract-mode monitor, the setup dialog, the join box, the
 * blast-radius chart, and keycaps that light up when you press them.
 */
(function () {
  "use strict";

  const VGA = {
    black: "#000000",
    blue: "#0000AA",
    green: "#00AA00",
    cyan: "#00AAAA",
    red: "#AA0000",
    magenta: "#AA00AA",
    brown: "#AA5500",
    gray: "#AAAAAA",
    dgray: "#555555",
    lcyan: "#55FFFF",
    lred: "#FF5555",
    lmag: "#FF55FF",
    yellow: "#FFFF55",
    white: "#FFFFFF",
  };
  // 2026: VGA colors as the industrial palette sees them (see js/era.js).
  // Your tank goes signal orange, the CPU blue; the logo's inks go to ink.
  const MODERN = {
    "#000000": "#111111",
    "#0000AA": "#1f4fff",
    "#00AA00": "#00a36c",
    "#00AAAA": "#c43c00",
    "#AA0000": "#5f5c56",
    "#AA00AA": "#1438b8",
    "#AA5500": "#3a3835",
    "#AAAAAA": "#9a968e",
    "#555555": "#5f5c56",
    "#55FFFF": "#ff4f00",
    "#FF5555": "#ff4f00",
    "#FF55FF": "#1f4fff",
    "#FFFF55": "#111111",
    "#FFFFFF": "#111111",
    "#774400": "#2a2927",
  };
  const HW = { paper: "#f4f3ef", ink: "#111111", signal: "#ff4f00" };
  const MODERN_FONT = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function isModern() {
    return !!(window.TankEra && window.TankEra.get() === "2026");
  }

  function modern(color) {
    return MODERN[color] || color;
  }

  /** ctx.roundRect where it exists, a plain rect where it doesn't. */
  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function irand(a, b) {
    return Math.floor(rand(a, b + 1));
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function remember(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {
      /* private mode or blocked storage: the page works without it */
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Sound — same oscillator-and-noise recipe as the game, off until asked for
  // ---------------------------------------------------------------------------
  const Snd = {
    on: false,
    ctx: null,

    wake: function () {
      if (!this.on) return false;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return true;
    },

    slide: function (from, to, dur, type, vol) {
      if (!this.wake()) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur);
    },

    noise: function (dur, vol, cutoff) {
      if (!this.wake()) return;
      const t = this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(cutoff, t);
      f.frequency.exponentialRampToValueAtTime(180, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.ctx.destination);
      src.start(t);
      src.stop(t + dur);
    },

    // 2026 swaps square and sawtooth beeps for rounder sine and triangle
    // tones, deeper booms, and softer clicks.
    fire: function () {
      if (isModern()) {
        this.slide(190, 58, 0.2, "triangle", 0.09);
        this.noise(0.14, 0.05, 900);
        return;
      }
      this.slide(220, 70, 0.16, "square", 0.06);
      this.noise(0.1, 0.07, 1400);
    },

    boom: function (big) {
      if (isModern()) {
        this.slide(big ? 95 : 120, 28, big ? 0.6 : 0.34, "sine", big ? 0.2 : 0.13);
        this.noise(big ? 0.55 : 0.3, big ? 0.14 : 0.09, big ? 520 : 760);
        this.slide(1400, 380, 0.22, "sine", 0.012);
        return;
      }
      this.noise(big ? 0.4 : 0.22, big ? 0.18 : 0.11, big ? 700 : 1100);
      this.slide(big ? 140 : 180, 40, big ? 0.32 : 0.18, "sawtooth", 0.04);
    },

    blip: function () {
      if (isModern()) {
        this.slide(1046, 1318, 0.07, "sine", 0.035);
        return;
      }
      this.slide(740, 740, 0.05, "square", 0.03);
    },
  };

  // ---------------------------------------------------------------------------
  // Hero: the logo is a target
  // ---------------------------------------------------------------------------
  const GLYPHS = {
    T: ["######", "######", "  ##  ", "  ##  ", "  ##  ", "  ##  ", "  ##  "],
    A: ["  ##  ", " #### ", "##  ##", "##  ##", "######", "##  ##", "##  ##"],
    N: ["##   ##", "###  ##", "#### ##", "## ####", "##  ###", "##   ##", "##   ##"],
    K: ["##  ##", "## ## ", "####  ", "###   ", "####  ", "## ## ", "##  ##"],
    W: ["##   ##", "##   ##", "##   ##", "## # ##", "#######", "### ###", "##   ##"],
    R: ["##### ", "##  ##", "##  ##", "##### ", "## ## ", "##  ##", "##  ##"],
    S: [" #####", "##    ", "##    ", " #### ", "    ##", "    ##", "##### "],
    O: [" #### ", "##  ##", "##  ##", "##  ##", "##  ##", "##  ##", " #### "],
    E: ["######", "##    ", "##    ", "##### ", "##    ", "##    ", "######"],
    H: ["##  ##", "##  ##", "##  ##", "######", "##  ##", "##  ##", "##  ##"],
    I: ["##", "##", "##", "##", "##", "##", "##"],
    L: ["##    ", "##    ", "##    ", "##    ", "##    ", "##    ", "######"],
  };
  const ROWS = 7;
  // Logo cells: 1 shine, 2 upper face, 3 lower face, 4 extrusion, 5 outline.
  const INK = [null, VGA.white, VGA.yellow, VGA.lred, VGA.red, VGA.black];
  const INK32 = INK.map(function (hex) {
    if (!hex) return 0;
    const n = parseInt(hex.slice(1), 16);
    // ImageData is RGBA in memory; on little-endian that reads as ABGR.
    return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255);
  });

  function wordWidth(word) {
    let n = 0;
    for (let i = 0; i < word.length; i++) n += (i ? 1 : 0) + (word[i] === " " ? 3 : GLYPHS[word[i]][0].length);
    return n;
  }

  function logoBox(lines, s) {
    const k = Math.max(1, Math.round(s / 2));
    const d = Math.max(2, Math.round(s * 0.8));
    const cells = Math.max.apply(null, lines.map(wordWidth));
    return {
      s: s,
      k: k,
      d: d,
      cells: cells,
      w: cells * s + (ROWS - 1) * k + d + 2,
      h: lines.length * ROWS * s + (lines.length - 1) * 2 * s + d + 2,
    };
  }

  /** Italic pixel letters with a shine line, a two-tone face, an extruded side, and a black outline. */
  function buildLogo(lines, s) {
    const box = logoBox(lines, s);
    const W = box.w;
    const H = box.h;
    const grid = new Uint8Array(W * H);
    for (let li = 0; li < lines.length; li++) {
      const word = lines[li];
      const top = 1 + li * (ROWS + 2) * s;
      let x0 = 1 + Math.round(((box.cells - wordWidth(word)) * s) / 2);
      for (let c = 0; c < word.length; c++) {
        if (word[c] === " ") {
          x0 += 4 * s;
          continue;
        }
        const g = GLYPHS[word[c]];
        for (let r = 0; r < ROWS; r++) {
          const shear = (ROWS - 1 - r) * box.k;
          for (let col = 0; col < g[r].length; col++) {
            if (g[r][col] !== "#") continue;
            for (let yy = 0; yy < s; yy++) {
              const band = (r * s + yy) / (ROWS * s);
              const ink = band < 0.09 ? 1 : band < 0.52 ? 2 : 3;
              for (let xx = 0; xx < s; xx++) grid[(top + r * s + yy) * W + x0 + shear + col * s + xx] = ink;
            }
          }
        }
        x0 += (g[0].length + 1) * s;
      }
    }
    const face = grid.slice();
    for (let i = 1; i <= box.d; i++) {
      for (let y = 0; y < H - i; y++) {
        for (let x = 0; x < W - i; x++) {
          if (face[y * W + x] && !grid[(y + i) * W + x + i]) grid[(y + i) * W + x + i] = 4;
        }
      }
    }
    const solid = grid.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (solid[y * W + x]) continue;
        const near =
          (x > 0 && solid[y * W + x - 1]) ||
          (x < W - 1 && solid[y * W + x + 1]) ||
          (y > 0 && solid[(y - 1) * W + x]) ||
          (y < H - 1 && solid[(y + 1) * W + x]);
        if (near) grid[y * W + x] = 5;
      }
    }
    return { w: W, h: H, grid: grid, orig: grid.slice() };
  }

  function Field(canvas, hud) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hud = hud;
    this.tag = canvas.parentNode.querySelector(".hero-tag");
    this.wind = irand(2, 6) * (Math.random() < 0.5 ? -1 : 1);
    this.time = 0;
    this.running = false;
    this.visible = true;
    this.aim = null;
    this.layout();
  }

  Field.prototype.layout = function () {
    const cssW = this.canvas.clientWidth || 800;
    const cssH = this.canvas.clientHeight || 500;
    const px = cssW >= 1100 ? 4 : cssW >= 680 ? 3 : 2;
    const w = Math.max(140, Math.ceil(cssW / px));
    const h = Math.max(140, Math.ceil(cssH / px));
    this.px = px;
    this.w = w;
    this.h = h;
    this.cssW = cssW;
    this.cssH = cssH;
    // 2026 keeps the same little world but draws it with clean shapes at
    // screen resolution: k backing pixels per world pixel.
    this.modern = isModern();
    this.k = this.modern ? Math.min(px * (window.devicePixelRatio || 1), 2400 / w) : 1;
    this.canvas.width = Math.round(w * this.k);
    this.canvas.height = Math.round(h * this.k);
    this.top = Math.ceil(36 / px);
    this.gravity = h * 0.95;

    this.shells = [];
    this.debris = [];
    this.blasts = [];
    this.sparks = [];
    this.holes = [];
    this.shake = 0;
    this.healAcc = 0;
    this.lastHit = -10;
    this.lastYou = -10;
    this.lastCpu = this.time;

    // Hills: low at the edges where the tanks sit, a rise in the middle.
    this.ground = new Float32Array(w);
    const p0 = rand(0, 6.3);
    const p1 = rand(0, 6.3);
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      const mid = Math.exp(-Math.pow((t - 0.5) / 0.17, 2));
      const y = h * 0.8 + Math.sin(t * Math.PI * 2.3 + p0) * h * 0.05 + Math.sin(t * Math.PI * 5.3 + p1) * h * 0.02 - mid * h * 0.11;
      this.ground[x] = clamp(y, h * 0.6, h - 10);
    }
    this.you = this.placeTank(Math.round(w * 0.1), VGA.lcyan, VGA.cyan, 50);
    this.cpu = this.placeTank(Math.round(w * 0.9), VGA.lmag, VGA.magenta, 130);

    // Biggest logo that fits; two lines when that is bigger (phones).
    const maxW = w * 0.88;
    const maxH = h * 0.4;
    function fit(lines) {
      let s = 1;
      for (;;) {
        const b = logoBox(lines, s + 1);
        if (b.w > maxW || b.h > maxH) return s;
        s++;
      }
    }
    const one = fit(["ONE HILL"]);
    const two = fit(["ONE", "HILL"]);
    const logo = two > one ? buildLogo(["ONE", "HILL"], two) : buildLogo(["ONE HILL"], one);
    logo.x = Math.round((w - logo.w) / 2);
    logo.y = this.top + Math.round((h * 0.56 - this.top - logo.h) / 2);
    logo.canvas = document.createElement("canvas");
    logo.canvas.width = logo.w;
    logo.canvas.height = logo.h;
    logo.img = logo.canvas.getContext("2d").createImageData(logo.w, logo.h);
    logo.px32 = new Uint32Array(logo.img.data.buffer);
    for (let i = 0; i < logo.grid.length; i++) logo.px32[i] = INK32[logo.grid[i]];
    logo.dirty = true;
    logo.total = 0;
    for (let i = 0; i < logo.grid.length; i++) if (logo.grid[i]) logo.total++;
    this.logo = logo;

    if (this.modern) {
      this.paintModernLogo();
      this.paintModernPaper();
    } else {
      this.paintSky();
    }
    // The "a Tank Wars tribute" line sits just under the logo, wherever it landed.
    if (this.tag) this.tag.style.top = Math.round((logo.y + logo.h) * (cssH / h) + 10) + "px";
    this.updateHud();
  };

  // ---------------------------------------------------------------------------
  // 2026 hero: the logo on a dot-matrix display, hills on dot-grid paper
  // ---------------------------------------------------------------------------
  Field.prototype.paintModernLogo = function () {
    const L = this.logo;
    const K = Math.max(2, Math.round(this.k));
    L.K = K;
    L.dots = document.createElement("canvas");
    L.dots.width = L.w * K;
    L.dots.height = L.h * K;
    L.dotsCtx = L.dots.getContext("2d");
    for (let i = 0; i < L.grid.length; i++) this.modernCell(i);
  };

  /**
   * Repaint one dot of the 2026 logo after it was shot out or grew back. Lit
   * letters are ink, the old extrusion is a gray shadow, and every other cell
   * is an unlit dot, like the panel of a real display.
   */
  Field.prototype.modernCell = function (i) {
    const L = this.logo;
    const K = L.K;
    const x = i % L.w;
    const y = Math.floor(i / L.w);
    const ctx = L.dotsCtx;
    ctx.clearRect(x * K, y * K, K, K);
    const ink = L.grid[i];
    let color = "#e4e1db";
    let r = K * 0.3;
    if (ink >= 1 && ink <= 3) {
      color = HW.ink;
      r = K * 0.44;
    } else if (ink === 4) {
      color = "#bdb9b1";
      r = K * 0.38;
    }
    ctx.fillStyle = color;
    // Under 4 pixels a cell, round dots blur to gray: draw solid cells and skip the unlit ones.
    if (K < 4) {
      if (ink >= 1 && ink <= 4) ctx.fillRect(x * K, y * K, K, K);
      return;
    }
    ctx.beginPath();
    ctx.arc(x * K + K / 2, y * K + K / 2, r, 0, Math.PI * 2);
    ctx.fill();
  };

  /** Off-white paper with a dot grid, plus the dot texture used inside the hills. */
  Field.prototype.paintModernPaper = function () {
    const k = this.k;
    const w = this.w;
    const h = this.h;
    function sheet(bg, dot, step, r) {
      const c = document.createElement("canvas");
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      const ctx = c.getContext("2d");
      ctx.scale(k, k);
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = dot;
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return c;
    }
    this.sky = sheet(HW.paper, "#d9d6cf", 8, 0.35);
    this.grain = sheet(null, "#2c2b29", 3, 0.35);
    this.stars = [];
  };

  Field.prototype.placeTank = function (x, color, dim, angle) {
    for (let dx = -10; dx <= 10; dx++) {
      const i = clamp(x + dx, 0, this.w - 1);
      this.ground[i] = this.ground[x];
    }
    return { x: x, y: this.ground[x] - 1, vy: 0, color: color, dim: dim, angle: angle, flash: 0 };
  };

  /** Banded VGA night sky, painted once per layout. */
  Field.prototype.paintSky = function () {
    const sky = document.createElement("canvas");
    sky.width = this.w;
    sky.height = this.h;
    const ctx = sky.getContext("2d");
    const stops = [
      [0, [0, 0, 0x55]],
      [0.45, [0, 0, 0xaa]],
      [1, [0, 0, 0x33]],
    ];
    for (let y = 0; y < this.h; y++) {
      const t = y / (this.h - 1);
      const a = t < 0.45 ? stops[0] : stops[1];
      const b = t < 0.45 ? stops[1] : stops[2];
      const u = (t - a[0]) / (b[0] - a[0]);
      const blue = Math.round((a[1][2] + (b[1][2] - a[1][2]) * u) / 17) * 17;
      ctx.fillStyle = "rgb(0,0," + blue + ")";
      ctx.fillRect(0, y, this.w, 1);
    }
    this.sky = sky;
    this.stars = [];
    const n = Math.round((this.w * this.h) / 420);
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: irand(0, this.w - 1),
        y: irand(this.top + 1, Math.round(this.h * 0.6)),
        c: Math.random() < 0.2 ? VGA.white : VGA.gray,
        ph: rand(0, 6.3),
        sp: rand(0.6, 2.2),
      });
    }
  };

  Field.prototype.toField = function (e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * this.w,
      y: ((e.clientY - r.top) / r.height) * this.h,
    };
  };

  Field.prototype.logoAt = function (x, y) {
    const L = this.logo;
    const lx = Math.floor(x) - L.x;
    const ly = Math.floor(y) - L.y;
    if (lx < 0 || ly < 0 || lx >= L.w || ly >= L.h) return false;
    return L.grid[ly * L.w + lx] !== 0;
  };

  Field.prototype.randomLogoPixel = function () {
    const L = this.logo;
    for (let tries = 0; tries < 60; tries++) {
      const i = irand(0, L.grid.length - 1);
      const c = L.grid[i];
      if (c >= 1 && c <= 3) return { x: L.x + (i % L.w) + 0.5, y: L.y + Math.floor(i / L.w) + 0.5 };
    }
    return { x: L.x + L.w / 2, y: L.y + L.h / 2 };
  };

  /** Launch velocity that lands on (tx, ty) after a flight time that grows with distance, wind included. */
  Field.prototype.solve = function (tank, tx, ty) {
    const ox = tank.x;
    const oy = tank.y - 8;
    const ax = this.wind * this.h * 0.006;
    const dx = tx - ox;
    const dy = ty - oy;
    const T = clamp(0.7 + (Math.abs(dx) / this.w) * 0.8, 0.7, 1.5);
    const vx = (dx - 0.5 * ax * T * T) / T;
    const vy = (dy - 0.5 * this.gravity * T * T) / T;
    let angle = (Math.atan2(-vy, vx) * 180) / Math.PI;
    if (angle < 0) angle = vx < 0 ? 180 : 0;
    return { vx: vx, vy: vy, ax: ax, angle: angle, power: Math.hypot(vx, vy) / (this.h * 0.022) };
  };

  Field.prototype.fire = function (tank, tx, ty, big) {
    const v = this.solve(tank, tx, ty);
    tank.angle = v.angle;
    const rad = (v.angle * Math.PI) / 180;
    const mx = tank.x + Math.cos(rad) * 13;
    const my = tank.y - 8 - Math.sin(rad) * 13;
    this.shells.push({
      x: mx,
      y: my,
      vx: v.vx,
      vy: v.vy,
      ax: v.ax,
      r: big ? 11 : 7,
      owner: tank,
      trail: [],
      age: 0,
    });
    this.burst(mx, my, 6, [VGA.yellow, VGA.white, VGA.lred], 40, 0.18);
    Snd.fire();
  };

  Field.prototype.playerFire = function (tx, ty) {
    let mine = 0;
    for (let i = 0; i < this.shells.length; i++) if (this.shells[i].owner === this.you) mine++;
    if (mine >= 5) return;
    this.lastYou = this.time;
    this.fire(this.you, tx, ty, false);
    this.updateHud(this.solve(this.you, tx, ty));
    this.start();
  };

  Field.prototype.burst = function (x, y, n, colors, spd, life) {
    for (let i = 0; i < n && this.debris.length < 1400; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = spd * rand(0.3, 1.2);
      this.debris.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - spd * 0.5,
        c: colors[irand(0, colors.length - 1)],
        t: 0,
        life: life * rand(0.7, 1.4),
        rest: false,
      });
    }
  };

  Field.prototype.explode = function (x, y, r) {
    const L = this.logo;
    const reach = r + 1;
    for (let yy = -reach; yy <= reach; yy++) {
      for (let xx = -reach; xx <= reach; xx++) {
        const d2 = xx * xx + yy * yy;
        if (d2 > r * r * rand(0.75, 1.25)) continue;
        const lx = Math.floor(x + xx) - L.x;
        const ly = Math.floor(y + yy) - L.y;
        if (lx < 0 || ly < 0 || lx >= L.w || ly >= L.h) continue;
        const i = ly * L.w + lx;
        const c = L.grid[i];
        if (!c) continue;
        L.grid[i] = 0;
        L.px32[i] = 0;
        L.dirty = true;
        if (this.modern) this.modernCell(i);
        this.holes.push(i);
        // Some of the letter falls as rubble; the rest is vaporised.
        if (this.debris.length < 1400 && c !== 5 && Math.random() < 0.45) {
          const d = Math.sqrt(d2) || 1;
          const sp = rand(10, 40) * (this.h / 180);
          this.debris.push({
            x: L.x + lx,
            y: L.y + ly,
            vx: (xx / d) * sp,
            vy: (yy / d) * sp - rand(8, 30),
            c: INK[c],
            t: 0,
            life: rand(1.1, 1.9),
            rest: false,
          });
        }
      }
    }
    // Same column bite as the game's excavate().
    for (let cx = Math.max(0, Math.floor(x - r)); cx <= Math.min(this.w - 1, Math.ceil(x + r)); cx++) {
      const dx = cx - x;
      const inside = r * r - dx * dx;
      if (inside < 0) continue;
      const bot = y + Math.sqrt(inside);
      if (bot > this.ground[cx]) this.ground[cx] = Math.min(this.h - 3, bot);
    }
    const tanks = [this.you, this.cpu];
    for (let i = 0; i < tanks.length; i++) {
      if (Math.hypot(tanks[i].x - x, tanks[i].y - 5 - y) < r + 6) tanks[i].flash = 0.25;
    }
    this.blasts.push({ x: x, y: y, r: r, t: 0, life: r > 9 ? 0.32 : 0.22 });
    this.burst(x, y, Math.round(8 + r * 1.4), [VGA.yellow, VGA.lred, VGA.white], 50 + r * 6, 0.45);
    this.burst(x, y, Math.round(4 + r), [VGA.brown, "#774400", VGA.dgray], 30 + r * 3, 0.6);
    if (!reduceMotion) this.shake = Math.max(this.shake, r * 0.35);
    this.lastHit = this.time;
    // The wind wanders between shots, like on the real hill.
    this.wind = clamp(this.wind + irand(-3, 3), -9, 9) || 2;
    this.updateHud();
    Snd.boom(r > 9);
  };

  Field.prototype.step = function (dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);

    const sub = 4;
    const sdt = dt / sub;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const p = this.shells[i];
      let dead = false;
      for (let k = 0; k < sub && !dead; k++) {
        p.vx += p.ax * sdt;
        p.vy += this.gravity * sdt;
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
        p.age += sdt;
        if (p.x < 0 || p.x >= this.w || p.y >= this.h) {
          dead = true;
        } else if (p.y >= 0) {
          const foe = p.owner === this.you ? this.cpu : this.you;
          const hitTank = p.age > 0.08 && Math.abs(p.x - foe.x) <= 8 && p.y >= foe.y - 11 && p.y <= foe.y + 1;
          if (hitTank || this.logoAt(p.x, p.y) || p.y >= this.ground[Math.floor(p.x)]) {
            this.explode(p.x, p.y, p.r);
            dead = true;
          }
        }
      }
      p.trail.push(p.x, p.y);
      if (p.trail.length > 36) p.trail.splice(0, 2);
      if (dead) this.shells.splice(i, 1);
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (!d.rest) {
        d.vy += this.gravity * 0.8 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const gx = Math.floor(d.x);
        if (gx >= 0 && gx < this.w && d.y >= this.ground[gx]) {
          d.y = this.ground[gx] - 1;
          d.rest = true;
        }
      }
      if (d.t >= d.life || d.x < -4 || d.x > this.w + 4 || d.y > this.h) this.debris.splice(i, 1);
    }

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].t += dt;
      if (this.blasts[i].t >= this.blasts[i].life) this.blasts.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      this.sparks[i].t += dt;
      if (this.sparks[i].t > 0.35) this.sparks.splice(i, 1);
    }

    const tanks = [this.you, this.cpu];
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (t.flash > 0) t.flash -= dt;
      const ground = this.ground[t.x] - 1;
      if (t.y < ground) {
        t.vy += this.gravity * dt;
        t.y = Math.min(ground, t.y + t.vy * dt);
      } else {
        t.y = ground;
        t.vy = 0;
      }
    }

    if (this.aim && this.time - this.lastYou > 0.25) {
      const v = this.solve(this.you, this.aim.x, this.aim.y);
      this.you.angle += (v.angle - this.you.angle) * Math.min(1, dt * 12);
    }

    this.heal(dt);

    // Go quiet and the CPU starts lobbing shells at the logo (and now and then at you).
    if (!reduceMotion && this.time - this.lastYou > 3.2 && this.time - this.lastCpu > 2.6 && !this.shells.length) {
      this.lastCpu = this.time;
      const atYou = Math.random() < 0.15;
      const t = atYou ? { x: this.you.x, y: this.you.y - 4 } : this.randomLogoPixel();
      this.fire(this.cpu, t.x + (atYou ? rand(-10, 10) : 0), t.y, Math.random() < 0.2);
    }
  };

  /** The logo rebuilds itself a pixel at a time once the shooting stops for a moment. */
  Field.prototype.heal = function (dt) {
    const L = this.logo;
    if (!this.holes.length || this.time - this.lastHit < 1.4) return;
    this.healAcc += dt * (26 + this.holes.length * 0.45);
    while (this.healAcc >= 1 && this.holes.length) {
      this.healAcc -= 1;
      const j = irand(0, this.holes.length - 1);
      const i = this.holes[j];
      this.holes[j] = this.holes[this.holes.length - 1];
      this.holes.pop();
      L.grid[i] = L.orig[i];
      L.px32[i] = INK32[L.grid[i]];
      L.dirty = true;
      if (this.modern) this.modernCell(i);
      if (Math.random() < 0.12) this.sparks.push({ x: L.x + (i % L.w), y: L.y + Math.floor(i / L.w), t: 0 });
    }
    if (!this.holes.length || Math.random() < 0.1) this.updateHud();
  };

  Field.prototype.updateHud = function (shot) {
    const h = this.hud;
    if (!h) return;
    const v = shot || (this.aim ? this.solve(this.you, this.aim.x, this.aim.y) : null);
    if (v) {
      h.ang.textContent = String(Math.round(v.angle)).padStart(3, "0");
      h.pow.textContent = String(clamp(Math.round(v.power), 10, 100)).padStart(3, "0");
    }
    const n = Math.min(6, Math.max(1, Math.round(Math.abs(this.wind) / 2)));
    h.wind.textContent = this.wind < 0 ? "<".repeat(n) + " " + -this.wind : this.wind + " " + ">".repeat(n);
    h.windBox.classList.toggle("west", this.wind < 0);
    const L = this.logo;
    h.logo.textContent = Math.round(100 - (this.holes.length / L.total) * 100) + "%";
  };

  Field.prototype.drawTank = function (ctx, t) {
    const x = Math.round(t.x);
    const y = Math.round(t.y);
    const col = t.flash > 0 ? VGA.white : t.color;
    ctx.fillStyle = t.dim;
    ctx.fillRect(x - 8, y - 4, 16, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x - 7, y - 3, 14, 2);
    ctx.fillRect(x - 6, y - 8, 12, 5);
    ctx.fillStyle = t.dim;
    ctx.fillRect(x - 4, y - 11, 8, 4);
    const rad = (t.angle * Math.PI) / 180;
    for (let i = 2; i <= 13; i++) {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + Math.cos(rad) * i), Math.round(y - 8 - Math.sin(rad) * i), 2, 2);
    }
    ctx.fillStyle = VGA.white;
    ctx.fillRect(Math.round(x + Math.cos(rad) * 13), Math.round(y - 8 - Math.sin(rad) * 13), 2, 2);
  };

  Field.prototype.draw = function () {
    if (this.modern) {
      this.drawModern();
      return;
    }
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.sky, 0, 0);
    if (this.shake > 0) ctx.translate(Math.round(rand(-1, 1) * this.shake), Math.round(rand(-1, 1) * this.shake));

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const lit = reduceMotion || Math.sin(this.time * s.sp + s.ph) > -0.6;
      if (!lit) continue;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, 1, 1);
    }

    // Wind streaks drift the way the wind blows.
    const dir = this.wind < 0 ? -1 : 1;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = this.wind < 0 ? VGA.lcyan : VGA.lmag;
    for (let i = 0; i < 4; i++) {
      const span = w + 40;
      const travel = (((this.time * 35 * (Math.abs(this.wind) / 5 + 0.4) + i * (w / 3.2)) % span) + span) % span;
      const x = dir > 0 ? travel - 20 : w + 20 - travel;
      ctx.fillRect(Math.round(x), Math.round(this.top + 10 + i * h * 0.12), 5 + Math.abs(this.wind), 1);
    }
    ctx.globalAlpha = 1;

    const L = this.logo;
    if (L.dirty) {
      L.canvas.getContext("2d").putImageData(L.img, 0, 0);
      L.dirty = false;
    }
    ctx.drawImage(L.canvas, L.x, L.y);

    // Dirt drawn column by column, the way the game does it.
    for (let x = 0; x < w; x++) {
      const top = this.ground[x] | 0;
      const speck = (x * 17 + top * 3) & 7;
      ctx.fillStyle = speck === 0 ? VGA.dgray : speck === 3 ? "#995000" : VGA.brown;
      ctx.fillRect(x, top, 1, h - top);
      ctx.fillStyle = speck === 2 ? "#5a3300" : "#774400";
      ctx.fillRect(x, top + 6, 1, h - top - 6);
      ctx.fillStyle = speck === 1 ? VGA.yellow : VGA.green;
      ctx.fillRect(x, top, 1, 1);
    }

    this.drawTank(ctx, this.you);
    this.drawTank(ctx, this.cpu);

    // Short aim arc from your barrel, like the game's free preview.
    if (this.aim && !this.shells.some((p) => p.owner === this.you)) {
      const v = this.solve(this.you, this.aim.x, this.aim.y);
      const rad = (v.angle * Math.PI) / 180;
      let x = this.you.x + Math.cos(rad) * 13;
      let y = this.you.y - 8 - Math.sin(rad) * 13;
      let vx = v.vx;
      let vy = v.vy;
      ctx.fillStyle = VGA.lcyan;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 9; i++) {
        vx += v.ax * 0.03;
        vy += this.gravity * 0.03;
        x += vx * 0.03;
        y += vy * 0.03;
        if (i % 2) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < this.shells.length; i++) {
      const p = this.shells[i];
      ctx.fillStyle = VGA.dgray;
      for (let k = 0; k < p.trail.length; k += 4) ctx.fillRect(p.trail[k] | 0, p.trail[k + 1] | 0, 1, 1);
      ctx.fillStyle = VGA.yellow;
      ctx.fillRect((p.x | 0) - 1, (p.y | 0) - 1, 2, 2);
    }

    const ring = [VGA.white, VGA.yellow, VGA.lred, VGA.red];
    for (let i = 0; i < this.blasts.length; i++) {
      const b = this.blasts[i];
      const k = b.t / b.life;
      ctx.fillStyle = ring[Math.min(3, Math.floor(k * 4))];
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (0.35 + 0.75 * k), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = VGA.white;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (0.35 + 0.75 * k) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      ctx.globalAlpha = d.rest ? Math.max(0, 1 - (d.t - d.life * 0.6) / (d.life * 0.4)) : 1;
      ctx.fillStyle = d.c;
      ctx.fillRect(d.x | 0, d.y | 0, 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = VGA.white;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      const arm = s.t < 0.18 ? 1 : 0;
      ctx.fillRect(s.x, s.y, 1, 1);
      if (arm) {
        ctx.fillRect(s.x - 1, s.y, 3, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 3);
      }
    }
  };

  /** A light 7-tap blur of a heightmap, for drawing only: crater edges read as curves. */
  function smoothed(height, x) {
    const n = height.length;
    const taps = [1, 2, 3, 4, 3, 2, 1];
    let y = 0;
    for (let t = 0; t < taps.length; t++) y += height[clamp(x + t - 3, 0, n - 1)] * taps[t];
    return y / 16;
  }

  function drawModernTank(ctx, t) {
    const x = t.x;
    const y = t.y;
    const col = modern(t.color);
    ctx.fillStyle = HW.ink;
    ctx.beginPath();
    roundRect(ctx, x - 8, y - 4.4, 16, 4.4, 2.2);
    ctx.fill();
    ctx.fillStyle = t.flash > 0 ? HW.paper : col;
    ctx.strokeStyle = HW.ink;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    roundRect(ctx, x - 6.5, y - 8.2, 13, 4.2, 1.2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 8, 3.4, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const rad = (t.angle * Math.PI) / 180;
    ctx.strokeStyle = HW.ink;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rad) * 3, y - 8 - Math.sin(rad) * 3);
    ctx.lineTo(x + Math.cos(rad) * 13, y - 8 - Math.sin(rad) * 13);
    ctx.stroke();
    ctx.fillStyle = HW.paper;
    for (let i = -5; i <= 5; i += 3.3) {
      ctx.beginPath();
      ctx.arc(x + i, y - 2.2, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  Field.prototype.drawModern = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.sky, 0, 0, w, h);
    if (this.shake > 0) ctx.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);

    // Wind: three short dashes drifting the way it blows.
    const dir = this.wind < 0 ? -1 : 1;
    ctx.strokeStyle = HW.ink;
    ctx.lineWidth = 0.6;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 4; i++) {
      const span = w + 40;
      const travel = (((this.time * 35 * (Math.abs(this.wind) / 5 + 0.4) + i * (w / 3.2)) % span) + span) % span;
      const x = dir > 0 ? travel - 20 : w + 20 - travel;
      const y = this.top + 10 + i * h * 0.12;
      for (let d = 0; d < 3; d++) {
        const x0 = x - dir * d * 4;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 - dir * 2.2, y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    const L = this.logo;
    ctx.drawImage(L.dots, L.x, L.y, L.w, L.h);

    // Hills: solid charcoal with a fine dot grain.
    const hill = new Path2D();
    hill.moveTo(0, h);
    for (let x = 0; x < w; x++) hill.lineTo(x + 0.5, smoothed(this.ground, x));
    hill.lineTo(w, h);
    hill.closePath();
    ctx.fillStyle = "#1c1c1a";
    ctx.fill(hill);
    ctx.save();
    ctx.clip(hill);
    ctx.drawImage(this.grain, 0, 0, w, h);
    ctx.restore();

    drawModernTank(ctx, this.you);
    drawModernTank(ctx, this.cpu);

    if (this.aim && !this.shells.some((p) => p.owner === this.you)) {
      const v = this.solve(this.you, this.aim.x, this.aim.y);
      const rad = (v.angle * Math.PI) / 180;
      let x = this.you.x + Math.cos(rad) * 13;
      let y = this.you.y - 8 - Math.sin(rad) * 13;
      let vx = v.vx;
      let vy = v.vy;
      ctx.fillStyle = HW.ink;
      for (let i = 0; i < 9; i++) {
        vx += v.ax * 0.03;
        vy += this.gravity * 0.03;
        x += vx * 0.03;
        y += vy * 0.03;
        ctx.globalAlpha = 0.7 - i * 0.06;
        ctx.beginPath();
        ctx.arc(x, y, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < this.shells.length; i++) {
      const p = this.shells[i];
      ctx.fillStyle = HW.ink;
      for (let k = 0; k < p.trail.length; k += 6) {
        ctx.globalAlpha = (k / p.trail.length) * 0.8;
        ctx.beginPath();
        ctx.arc(p.trail[k], p.trail[k + 1], 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = HW.signal;
      ctx.strokeStyle = HW.ink;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Blasts: an orange flash, then rings spreading out.
    for (let i = 0; i < this.blasts.length; i++) {
      const b = this.blasts[i];
      const k = b.t / b.life;
      const rr = b.r * (0.5 + 0.8 * k);
      if (k < 0.45) {
        ctx.globalAlpha = 1 - k / 0.45;
        ctx.fillStyle = HW.signal;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rr * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = HW.ink;
      ctx.lineWidth = 0.7;
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, rr * (1 - ring * 0.28), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      ctx.globalAlpha = d.rest ? Math.max(0, 1 - (d.t - d.life * 0.6) / (d.life * 0.4)) : 1;
      ctx.fillStyle = modern(d.c);
      ctx.fillRect(d.x - 0.45, d.y - 0.45, 0.9, 0.9);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = HW.signal;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      ctx.globalAlpha = 1 - s.t / 0.35;
      ctx.beginPath();
      ctx.arc(s.x + 0.5, s.y + 0.5, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /** Flip between the 1990 and 2026 looks: a fresh hill drawn the new way. */
  Field.prototype.setEra = function () {
    this.layout();
    this.draw();
  };

  Field.prototype.start = function () {
    if (this.running || !this.visible) return;
    this.running = true;
    const self = this;
    let last = performance.now();
    function frame(now) {
      if (!self.visible) {
        self.running = false;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      self.step(dt);
      self.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  function setupHero() {
    const canvas = document.querySelector(".field");
    if (!canvas || !canvas.getContext) return;
    const hud = {
      ang: document.querySelector('[data-hud="ang"]'),
      pow: document.querySelector('[data-hud="pow"]'),
      wind: document.querySelector('[data-hud="wind"]'),
      windBox: document.querySelector(".hud-wind"),
      logo: document.querySelector('[data-hud="logo"]'),
    };
    const field = new Field(canvas, hud);
    field.draw();
    field.start();
    if (window.TankEra) {
      window.TankEra.onChange(function () {
        field.setEra();
      });
    }

    canvas.addEventListener("pointermove", function (e) {
      field.aim = field.toField(e);
      field.updateHud();
    });
    canvas.addEventListener("pointerleave", function () {
      field.aim = null;
    });
    canvas.addEventListener("click", function (e) {
      const p = field.toField(e);
      field.playerFire(p.x, p.y);
    });
    canvas.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const t = field.randomLogoPixel();
      field.playerFire(t.x, t.y);
    });

    // Rebuild on real size changes only, not when a phone's URL bar slides.
    let pending = 0;
    window.addEventListener("resize", function () {
      clearTimeout(pending);
      pending = setTimeout(function () {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === field.cssW && Math.abs(h - field.cssH) < field.cssH * 0.15) return;
        field.layout();
        field.draw();
      }, 150);
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        field.visible = entries[0].isIntersecting;
        if (field.visible) field.start();
      }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () {
      field.visible = !document.hidden;
      if (field.visible) field.start();
    });
  }

  // ---------------------------------------------------------------------------
  // Attract-mode monitor: the real game, CPU vs CPU, only while it's on screen
  // ---------------------------------------------------------------------------
  function setupMonitor() {
    const live = document.querySelector(".crt-live");
    if (!live || reduceMotion || !("IntersectionObserver" in window)) return;
    live.addEventListener("load", function () {
      if (live.getAttribute("src")) live.classList.add("on");
    });
    new IntersectionObserver(
      function (entries) {
        if (entries[0].isIntersecting) {
          if (!live.getAttribute("src")) live.src = live.dataset.src;
        } else if (live.getAttribute("src")) {
          live.classList.remove("on");
          live.removeAttribute("src");
        }
      },
      { rootMargin: "200px 0px" }
    ).observe(live);
  }

  // ---------------------------------------------------------------------------
  // Game setup dialog
  // ---------------------------------------------------------------------------
  function setupDialog() {
    const form = document.querySelector(".win-setup");
    if (!form) return;
    const radios = form.querySelectorAll('input[name="mode"]');
    const panes = form.querySelectorAll("[data-mode]");
    const status = form.querySelector(".setup-status");
    function show() {
      const mode = form.querySelector('input[name="mode"]:checked').value;
      for (let i = 0; i < panes.length; i++) panes[i].hidden = panes[i].dataset.mode !== mode;
      for (let i = 0; i < radios.length; i++) radios[i].parentNode.classList.toggle("on", radios[i].checked);
      status.textContent = "";
    }
    for (let i = 0; i < radios.length; i++) radios[i].addEventListener("change", show);
    show();
    const refusals = ["THERE IS NO RETREAT.", "NICE TRY.", "THE HILL IS WAITING.", "CANCEL? IN THIS WIND?"];
    let n = 0;
    form.querySelector("[data-cancel]").addEventListener("click", function () {
      status.textContent = refusals[n++ % refusals.length];
    });
  }

  // ---------------------------------------------------------------------------
  // Join box: same alphabet as the game's invite codes
  // ---------------------------------------------------------------------------
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function cleanCode(raw) {
    const link = /room=([A-Za-z0-9]+)/.exec(raw);
    const up = String(link ? link[1] : raw).toUpperCase();
    let s = "";
    for (let i = 0; i < up.length && s.length < 5; i++) {
      if (CODE_ALPHABET.indexOf(up[i]) >= 0) s += up[i];
    }
    return s;
  }

  function setupJoin() {
    const form = document.querySelector(".join");
    if (!form) return;
    const input = form.querySelector("input");
    const help = form.querySelector(".join-help");
    const helpText = help.textContent;
    function ok() {
      form.classList.remove("bad");
      help.textContent = helpText;
    }
    input.addEventListener("input", function () {
      const v = cleanCode(input.value);
      if (v !== input.value) input.value = v;
      ok();
    });
    // A pasted invite link is longer than the box; read the code out of it first.
    input.addEventListener("paste", function (e) {
      const text = e.clipboardData && e.clipboardData.getData("text");
      if (!text) return;
      e.preventDefault();
      input.value = cleanCode(text);
      ok();
    });
    form.addEventListener("submit", function (e) {
      input.value = cleanCode(input.value);
      if (input.value.length === 5) return;
      e.preventDefault();
      form.classList.add("bad");
      help.textContent = "THE CODE IS 5 CHARACTERS. NO I, O, 0 OR 1.";
      input.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // Terminal: types itself out when it scrolls into view
  // ---------------------------------------------------------------------------
  function setupTerminal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    const bodies = document.querySelectorAll(".term-body");
    for (let i = 0; i < bodies.length; i++) typeOut(bodies[i]);
  }

  /** Types the first line, then reveals the rest, once the terminal is in view. */
  function typeOut(body) {
    const lines = body.querySelectorAll(".t-line");
    const first = lines[0];
    const command = first.textContent;
    // Everything up to the prompt (C:\ONEHILL> or ~/onehill $) appears at once.
    const m = /^.*?[>$] ?/.exec(command);
    const prompt = m ? m[0].length : 0;
    for (let i = 0; i < lines.length; i++) lines[i].classList.add("hide");
    const pauses = [0, 380, 520, 640, 560, 700, 900, 820, 520];
    function reveal(i) {
      if (i >= lines.length) return;
      setTimeout(function () {
        lines[i].classList.remove("hide");
        reveal(i + 1);
      }, pauses[i] || 500);
    }
    function type() {
      first.textContent = "";
      first.classList.remove("hide");
      let n = 0;
      (function next() {
        n = n === 0 ? prompt : n + 1;
        first.textContent = command.slice(0, n);
        if (n < command.length) setTimeout(next, 55);
        else reveal(1);
      })();
    }
    // A hidden era's terminal has no box, so it never intersects until its era is on.
    const io = new IntersectionObserver(
      function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        setTimeout(type, 400);
      },
      { threshold: 0.5 }
    );
    io.observe(body);
  }

  // ---------------------------------------------------------------------------
  // Arsenal: crater sizes at the game's real radii
  // ---------------------------------------------------------------------------
  const CRATERS = [
    { label: "SHELL", x: 44, r: 14 },
    { label: "HE", x: 126, r: 28 },
    { label: "MIRV", x: 232, r: 12, spread: 26 },
    { label: "DIGGER", x: 330, r: 18, dig: 30 },
    { label: "NUKE", x: 452, r: 46 },
    { label: "DIRT", x: 580, r: 26, mound: true },
  ];

  function excavate(height, cx, cy, radius) {
    for (let x = Math.max(0, Math.floor(cx - radius - 2)); x <= Math.min(height.length - 1, Math.ceil(cx + radius + 2)); x++) {
      const r = radius * (1 + Math.sin(x * 1.7 + cy * 0.05) * 0.1);
      const dx = x - cx;
      const inside = r * r - dx * dx;
      if (inside < 0) continue;
      const bot = cy + Math.sqrt(inside);
      if (bot > height[x]) height[x] = bot;
    }
  }

  const CHART_W = 640;
  const CHART_H = 150;
  const CHART_SURFACE = 72;
  const CHART_STARS = [[30, 12], [96, 30], [170, 9], [212, 40], [300, 18], [388, 8], [520, 26], [612, 14], [560, 44], [350, 50]];

  function drawBlastChart(canvas, focus, blinkOn) {
    if (isModern()) {
      drawModernBlastChart(canvas, focus, blinkOn);
      return;
    }
    if (canvas.width !== CHART_W) {
      canvas.width = CHART_W;
      canvas.height = CHART_H;
    }
    const ctx = canvas.getContext("2d");
    const W = CHART_W;
    const H = CHART_H;
    const surface = CHART_SURFACE;
    for (let y = 0; y < H; y++) {
      const t = Math.min(1, y / surface);
      ctx.fillStyle = "rgb(0,0," + Math.round((0x55 + (0xaa - 0x55) * t) / 17) * 17 + ")";
      ctx.fillRect(0, y, W, 1);
    }
    ctx.fillStyle = VGA.gray;
    const stars = CHART_STARS;
    for (let i = 0; i < stars.length; i++) ctx.fillRect(stars[i][0], stars[i][1], 1, 1);

    const height = chartHeights();
    for (let x = 0; x < W; x++) {
      const top = height[x] | 0;
      const speck = (x * 17 + top * 3) & 7;
      ctx.fillStyle = speck === 0 ? VGA.dgray : speck === 3 ? "#995000" : VGA.brown;
      ctx.fillRect(x, top, 1, H - top);
      ctx.fillStyle = speck === 2 ? "#553300" : "#774400";
      ctx.fillRect(x, top + 18, 1, H - top - 18);
      ctx.fillStyle = speck === 1 ? VGA.yellow : VGA.green;
      ctx.fillRect(x, top, 1, 2);
    }

    ctx.font = '16px "VT323", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let i = 0; i < CRATERS.length; i++) {
      const c = CRATERS[i];
      const on = focus === i;
      if (on && blinkOn) {
        ctx.strokeStyle = VGA.yellow;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const span = c.spread ? c.spread + c.r + 4 : c.r + 5;
        ctx.arc(c.x, surface + (c.mound ? -10 : 0), span, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = on ? VGA.yellow : VGA.white;
      ctx.fillText(c.label, c.x, H - 18);
      ctx.fillStyle = on ? VGA.yellow : "#f3dcb6";
      ctx.fillText(c.mound ? "+mound" : c.spread ? "3 × r" + c.r : "r" + c.r, c.x, H - 4);
    }
  }

  /** 2026: a spec-sheet drawing. Charcoal ground on dot-grid paper, mono labels. */
  function drawModernBlastChart(canvas, focus, blinkOn) {
    if (canvas.width !== CHART_W * 2) {
      canvas.width = CHART_W * 2;
      canvas.height = CHART_H * 2;
    }
    const ctx = canvas.getContext("2d");
    const W = CHART_W;
    const H = CHART_H;
    const surface = CHART_SURFACE;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = HW.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#d9d6cf";
    for (let y = 4; y < H; y += 8) {
      for (let x = 4; x < W; x += 8) {
        ctx.beginPath();
        ctx.arc(x, y, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const height = chartHeights();
    const ground = new Path2D();
    ground.moveTo(0, H);
    for (let x = 0; x < W; x++) ground.lineTo(x + 0.5, smoothed(height, x));
    ground.lineTo(W, H);
    ground.closePath();
    ctx.fillStyle = "#1c1c1a";
    ctx.fill(ground);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let i = 0; i < CRATERS.length; i++) {
      const c = CRATERS[i];
      const on = focus === i;
      if (on) {
        const span = c.spread ? c.spread + c.r + 4 : c.r + 5;
        ctx.strokeStyle = HW.signal;
        ctx.globalAlpha = blinkOn ? 1 : 0.35;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, surface + (c.mound ? -10 : 0), span, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.font = "600 11px " + MODERN_FONT;
      ctx.fillStyle = on ? HW.signal : HW.paper;
      ctx.fillText(c.label, c.x, H - 20);
      ctx.font = "400 10px " + MODERN_FONT;
      ctx.fillStyle = on ? HW.signal : "#9a968e";
      ctx.fillText(c.mound ? "+mound" : c.spread ? "3 × r" + c.r : "r" + c.r, c.x, H - 7);
    }
  }

  /** The chart's ground after every weapon has left its mark. */
  function chartHeights() {
    const W = CHART_W;
    const surface = CHART_SURFACE;
    const height = new Float32Array(W);
    for (let x = 0; x < W; x++) height[x] = surface + Math.sin(x * 0.05) * 1.5;
    for (let i = 0; i < CRATERS.length; i++) {
      const c = CRATERS[i];
      if (c.mound) {
        for (let x = Math.floor(c.x - c.r); x <= Math.ceil(c.x + c.r); x++) {
          const t = Math.cos(Math.min(1, Math.abs((x - c.x) / c.r)) * Math.PI * 0.5);
          height[x] -= 30 * t;
        }
      } else if (c.spread) {
        for (let k = -1; k <= 1; k++) excavate(height, c.x + k * c.spread, height[c.x + k * c.spread], c.r);
      } else if (c.dig) {
        for (let d = 0; d < c.dig; d += 3) excavate(height, c.x - 6 + d * 0.3, surface + d, 5);
        excavate(height, c.x + 3, surface + c.dig, c.r);
      } else {
        excavate(height, c.x, height[c.x], c.r);
      }
    }
    return height;
  }

  function setupArsenal() {
    const canvas = document.querySelector(".blast-canvas");
    if (!canvas || !canvas.getContext) return;
    let focus = -1;
    let blinkOn = true;
    let timer = 0;
    function paint() {
      drawBlastChart(canvas, focus, blinkOn);
    }
    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
    if (window.TankEra) {
      window.TankEra.onChange(function () {
        paint();
        // The 2026 labels are in IBM Plex Mono, which may only now be loading.
        if (document.fonts && document.fonts.load) document.fonts.load("600 11px " + MODERN_FONT).then(paint);
      });
    }
    const rows = document.querySelectorAll(".price li[data-blast]");
    for (let i = 0; i < rows.length; i++) {
      rows[i].addEventListener("mouseenter", function () {
        focus = Number(rows[i].dataset.blast);
        blinkOn = true;
        paint();
        clearInterval(timer);
        if (!reduceMotion) {
          timer = setInterval(function () {
            blinkOn = !blinkOn;
            paint();
          }, 300);
        }
      });
      rows[i].addEventListener("mouseleave", function () {
        focus = -1;
        clearInterval(timer);
        paint();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Keycaps that press down when you press the real key
  // ---------------------------------------------------------------------------
  const KEY_ALIAS = { arrowleft: "a", arrowright: "d", arrowup: "w", arrowdown: "s", esc: "escape" };

  function setupKeycaps() {
    const caps = document.querySelectorAll("kbd[data-key]");
    if (!caps.length) return;
    function find(e) {
      const k = KEY_ALIAS[e.key.toLowerCase()] || e.key.toLowerCase();
      for (let i = 0; i < caps.length; i++) if (caps[i].dataset.key === k) return caps[i];
      return null;
    }
    document.addEventListener("keydown", function (e) {
      if (e.target.closest && e.target.closest("input, textarea, select")) return;
      const cap = find(e);
      if (cap) cap.classList.add("down");
    });
    document.addEventListener("keyup", function (e) {
      const cap = find(e);
      if (cap) cap.classList.remove("down");
    });
    window.addEventListener("blur", function () {
      for (let i = 0; i < caps.length; i++) caps[i].classList.remove("down");
    });
  }

  function setupSound() {
    const btn = document.querySelector(".menubar-snd");
    if (!btn) return;
    function set(on) {
      Snd.on = on;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "SND ON" : "SND OFF";
      remember("tankwars-landing-sound", on ? "1" : "0");
    }
    set(remember("tankwars-landing-sound") === "1");
    btn.addEventListener("click", function () {
      set(!Snd.on);
      Snd.blip();
    });
  }

  setupSound();
  setupHero();
  setupMonitor();
  setupDialog();
  setupJoin();
  setupTerminal();
  setupArsenal();
  setupKeycaps();
})();
