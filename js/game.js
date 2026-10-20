/**
 * Tank Wars — browser tribute to Kenny Morse's 1990 MS-DOS artillery game.
 * Original graphics only (no proprietary assets). Vanilla canvas, no deps.
 *
 * Extend: add entries to WEAPONS, or hook new states in Game.tick / Game.draw.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // VGA 16-color palette & constants
  // ---------------------------------------------------------------------------
  const C = {
    black: "#000000",
    blue: "#0000AA",
    green: "#00AA00",
    cyan: "#00AAAA",
    red: "#AA0000",
    magenta: "#AA00AA",
    brown: "#AA5500",
    gray: "#AAAAAA",
    dgray: "#555555",
    lblue: "#5555FF",
    lgreen: "#55FF55",
    lcyan: "#55FFFF",
    lred: "#FF5555",
    lmag: "#FF55FF",
    yellow: "#FFFF55",
    white: "#FFFFFF",
  };

  const W = 640;
  const H = 400;
  const HUD = 28;
  const FOOT = 46;
  const PLAY_TOP = HUD;
  const PLAY_H = H - HUD;
  const GRAVITY = 240;
  const POWER_K = 4.35;
  const WIND_K = 16;
  const TANK_W = 16;
  const TANK_H = 10;
  const MAX_HP = 80;
  const CREW_MAX = 8;

  const PLAYER_COLORS = [C.lcyan, C.lmag, C.yellow, C.lgreen];
  const PLAYER_DIM = [C.cyan, C.magenta, C.brown, C.green];
  const DIFF_NAMES = ["ROOKIE", "LOBBER", "WINDMASTER"];
  const DIFF_LABELS = ["EASY", "NORMAL", "HARD"];
  const CPU_CALLSIGNS = ["VIPER", "HAMMER", "BRUTUS"];

  const WEAPONS = [
    {
      id: "shell",
      name: "SHELL",
      blurb: "SHELL — standard shot. Dead center kills.",
      key: "1",
      ammo: Infinity,
      radius: 14,
      damage: 62,
      kind: "blast",
    },
    {
      id: "bomb",
      name: "HE BOMB",
      blurb: "HE BOMB — wide crater. A solid hit kills.",
      key: "2",
      ammo: 2,
      radius: 28,
      damage: 96,
      kind: "blast",
    },
    {
      id: "mirv",
      name: "MIRV",
      blurb: "MIRV — splits into three shells on the way down.",
      key: "3",
      ammo: 1,
      radius: 12,
      damage: 36,
      kind: "mirv",
    },
    {
      id: "digger",
      name: "DIGGER",
      blurb: "DIGGER — burrows through the hill, then blows.",
      key: "4",
      ammo: 2,
      radius: 18,
      damage: 72,
      kind: "digger",
    },
    {
      id: "nuke",
      name: "NUKE",
      short: "NUKE",
      blurb: "NUKE — huge blast. Buy one, or catch a crate.",
      key: "5",
      ammo: 0,
      radius: 46,
      damage: 120,
      kind: "blast",
    },
    {
      id: "dirt",
      name: "DIRT",
      short: "DIRT",
      blurb: "DIRT — piles a mound where it lands.",
      key: "6",
      ammo: 1,
      radius: 26,
      damage: 0,
      kind: "mound",
    },
  ];

  WEAPONS[0].short = "SH";
  WEAPONS[1].short = "HE";
  WEAPONS[2].short = "MIRV";
  WEAPONS[3].short = "DIG";

  const SHOP = [
    { id: "bomb", name: "HE BOMB x2", cost: 400, blurb: "wide craters" },
    { id: "mirv", name: "MIRV", cost: 500, blurb: "splits three ways" },
    { id: "dirt", name: "DIRT BOMB", cost: 300, blurb: "piles a mound" },
    { id: "guide", name: "GUIDANCE", cost: 200, blurb: "full arc to the hit" },
    { id: "shield", name: "SHIELD", cost: 650, blurb: "blocks the next hit" },
    { id: "nuke", name: "NUKE", cost: 1200, blurb: "do not miss" },
  ];

  const MAPS = ["canyon", "mesa", "water"];
  const MAP_LABEL = { canyon: "CANYON", mesa: "MESA", water: "WATER GAP" };
  const WINS_TO_TAKE = 3;

  const CRATE_KINDS = ["bomb", "bomb", "mirv", "digger", "dirt", "nuke"];

  // Online play (transport lives in js/net.js).
  const NET_VERSION = 1;
  const MAX_TANKS = 4;
  const SHOT_CLOCK = 45;
  const CLOCK_GRACE = 12;
  const SYNC_PATIENCE = 4;
  const MENU_MODES = { title: true, lobby: true, join: true, netdown: true };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function irand(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  /** Layered sines + a few control peaks — works at any width, always hilly. */
  function generateHeightmap(width, rng) {
    const p0 = rng() * Math.PI * 2;
    const p1 = rng() * Math.PI * 2;
    const p2 = rng() * Math.PI * 2;
    const p3 = rng() * Math.PI * 2;
    const a0 = 0.16 + rng() * 0.1;
    const a1 = 0.07 + rng() * 0.07;
    const a2 = 0.03 + rng() * 0.03;
    const peaks = [];
    const peakN = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < peakN; i++) {
      peaks.push({
        x: 0.12 + rng() * 0.76,
        w: 0.06 + rng() * 0.1,
        h: (rng() < 0.45 ? -1 : 1) * (0.08 + rng() * 0.16),
      });
    }
    const out = new Float32Array(width);
    const base = PLAY_TOP + PLAY_H * 0.56;
    for (let x = 0; x < width; x++) {
      const t = x / (width - 1);
      let n =
        Math.sin(t * Math.PI * 2.15 + p0) * a0 +
        Math.sin(t * Math.PI * 4.7 + p1) * a1 +
        Math.sin(t * Math.PI * 9.3 + p2) * a2 +
        Math.sin(t * Math.PI * 17.0 + p3) * 0.012;
      for (let i = 0; i < peaks.length; i++) {
        const pk = peaks[i];
        const d = (t - pk.x) / pk.w;
        n += pk.h * Math.exp(-d * d);
      }
      out[x] = clamp(base + n * PLAY_H, PLAY_TOP + 74, H - 24);
    }
    const sm = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let acc = 0;
      let c = 0;
      for (let k = -2; k <= 2; k++) {
        acc += out[clamp(x + k, 0, width - 1)];
        c++;
      }
      sm[x] = acc / c;
    }
    return sm;
  }

  function mesaHeights(rng) {
    const p0 = rng() * Math.PI * 2;
    const p1 = rng() * Math.PI * 2;
    const out = new Float32Array(W);
    const base = PLAY_TOP + PLAY_H * 0.66;
    for (let x = 0; x < W; x++) {
      const t = x / (W - 1);
      const n = Math.sin(t * Math.PI * 2.2 + p0) * 0.03 + Math.sin(t * Math.PI * 7 + p1) * 0.012;
      out[x] = clamp(base + n * PLAY_H, PLAY_TOP + 100, H - FOOT - 16);
    }
    return out;
  }

  function generateMap(kind, rng) {
    if (kind === "mesa") return { height: mesaHeights(rng), water: null };
    if (kind === "water") {
      const banks = mesaHeights(rng);
      const height = new Float32Array(W);
      const x0 = 236;
      const x1 = 404;
      const lip = 26;
      const bed = H - FOOT - 8;
      const surface = Math.round(PLAY_TOP + PLAY_H * 0.6);
      for (let x = 0; x < W; x++) {
        const bank = Math.min(banks[x], surface - 40);
        if (x < x0 - lip || x > x1 + lip) height[x] = bank;
        else if (x >= x0 && x <= x1) height[x] = bed;
        else if (x < x0) {
          const u = (x - (x0 - lip)) / lip;
          height[x] = bank + (bed - bank) * u;
        } else {
          const u = ((x1 + lip) - x) / lip;
          const far = Math.min(banks[Math.min(W - 1, x1 + lip)], surface - 40);
          height[x] = far + (bed - far) * u;
        }
      }
      return { height: height, water: { x0: x0, x1: x1, y: surface } };
    }
    const height = generateHeightmap(W, rng);
    for (let x = 0; x < W; x++) {
      const t = (x / (W - 1) - 0.5) * 2;
      const valley = Math.exp(-(t * t) / 0.11);
      height[x] = clamp(height[x] + valley * 155 - 16, PLAY_TOP + 58, H - FOOT - 8);
    }
    return { height: height, water: null };
  }

  function inWater(water, x, y) {
    return !!(water && x >= water.x0 && x <= water.x1 && y >= water.y);
  }

  function mound(height, cx, radius, lift) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(height.length - 1, Math.ceil(cx + radius));
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / radius;
      const t = Math.cos(Math.min(1, Math.abs(dx)) * Math.PI * 0.5);
      if (t <= 0) continue;
      height[x] = Math.max(PLAY_TOP + 46, height[x] - lift * t);
    }
  }

  function surfaceY(height, x) {
    const i = clamp(Math.round(x), 0, height.length - 1);
    return height[i];
  }

  /**
   * Carve a circular crater from a column heightmap.
   * Dirt is everything y >= height[x]. Jitter the rim so bites look chunky.
   */
  function excavate(height, cx, cy, radius) {
    const x0 = Math.max(0, Math.floor(cx - radius - 2));
    const x1 = Math.min(height.length - 1, Math.ceil(cx + radius + 2));
    for (let x = x0; x <= x1; x++) {
      const wobble = 1 + Math.sin(x * 1.7 + cy * 0.05) * 0.1;
      const r = radius * wobble;
      const dx = x - cx;
      const inside = r * r - dx * dx;
      if (inside < 0) continue;
      const dy = Math.sqrt(inside);
      const top = cy - dy;
      const bot = cy + dy;
      const s = height[x];
      if (bot <= s) continue;
      if (top <= s + 1.5) {
        height[x] = Math.min(H - FOOT - 4, Math.max(s, bot));
      } else {
        height[x] = Math.min(H - FOOT - 4, Math.max(s, bot));
      }
    }
  }

  function trench(height, x, y, r) {
    excavate(height, x, y, r);
  }

  // ---------------------------------------------------------------------------
  // Retro SFX — oscillators + noise, no audio files
  // ---------------------------------------------------------------------------
  const Sfx = {
    ctx: null,
    muted: false,
    master: null,
    windNode: null,
    windGain: null,
    lastTick: 0,

    ensure: function () {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },

    out: function () {
      return this.master || this.ctx.destination;
    },

    beep: function (freq, dur, type, vol) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g);
      g.connect(this.out());
      o.start(t);
      o.stop(t + dur);
    },

    slide: function (from, to, dur, type, vol) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      g.gain.setValueAtTime(vol || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g);
      g.connect(this.out());
      o.start(t);
      o.stop(t + dur);
    },

    noise: function (dur, vol, hp) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(hp || 900, t);
      filter.frequency.exponentialRampToValueAtTime(180, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.out());
      src.start(t);
      src.stop(t + dur);
    },

    notes: function (freqs, step, dur, vol) {
      for (let i = 0; i < freqs.length; i++) {
        const f = freqs[i];
        setTimeout(() => this.beep(f, dur, "square", vol || 0.045), i * step);
      }
    },

    fire: function () {
      this.slide(220, 70, 0.16, "square", 0.07);
      this.noise(0.1, 0.08, 1400);
    },
    explode: function (big) {
      this.noise(big ? 0.42 : 0.22, big ? 0.2 : 0.12, big ? 700 : 1100);
      this.slide(big ? 140 : 180, 40, big ? 0.35 : 0.18, "sawtooth", big ? 0.06 : 0.04);
    },
    hit: function () {
      this.beep(310, 0.07, "square", 0.05);
      this.noise(0.08, 0.07, 1600);
    },
    death: function () {
      this.slide(260, 55, 0.5, "sawtooth", 0.07);
      this.noise(0.45, 0.16, 800);
      this.beep(80, 0.25, "square", 0.04);
    },
    ui: function () {
      this.beep(740, 0.045, "square", 0.03);
    },
    tick: function () {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.lastTick < 0.034) return;
      this.lastTick = now;
      this.beep(980, 0.025, "square", 0.018);
    },
    pickup: function () {
      this.notes([523, 784, 1046], 55, 0.07, 0.04);
    },
    whoosh: function (strength) {
      const s = Math.min(1, Math.abs(strength) / 12);
      this.noise(0.28, 0.03 + s * 0.05, 400 + s * 500);
    },
    win: function () {
      this.notes([523, 659, 784, 1046], 110, 0.14, 0.05);
    },
    lose: function () {
      this.notes([392, 330, 262, 196], 160, 0.18, 0.05);
    },
    fall: function () {
      this.slide(240, 110, 0.1, "square", 0.03);
    },
    splash: function () {
      this.noise(0.16, 0.08, 900);
      this.slide(500, 180, 0.12, "sine", 0.03);
    },
    deny: function () {
      this.beep(180, 0.06, "square", 0.03);
    },
  };

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const keys = Object.create(null);
  const taps = [];

  function onKeyDown(e) {
    Sfx.ensure();
    if (Share.isOpen()) return;
    // Leave browser shortcuts (copy, paste, reload) alone. AltGr reads as Ctrl+Alt.
    if (e.metaKey || (e.ctrlKey && !e.altKey)) return;
    const k = e.key;
    if (
      k === "ArrowUp" ||
      k === "ArrowDown" ||
      k === "ArrowLeft" ||
      k === "ArrowRight" ||
      k === " " ||
      k === "Spacebar"
    ) {
      e.preventDefault();
    }
    keys[k] = true;
    if (k.length === 1) keys[k.toLowerCase()] = true;
    taps.push(k);
  }

  function onKeyUp(e) {
    keys[e.key] = false;
    if (e.key.length === 1) keys[e.key.toLowerCase()] = false;
  }

  function consume(name) {
    const i = taps.indexOf(name);
    if (i >= 0) {
      taps.splice(i, 1);
      return true;
    }
    if (name.length === 1) {
      const lo = name.toLowerCase();
      const j = taps.findIndex((t) => t.toLowerCase() === lo);
      if (j >= 0) {
        taps.splice(j, 1);
        return true;
      }
    }
    return false;
  }

  function flushTaps() {
    taps.length = 0;
  }

  function held(name) {
    if (keys[name]) return true;
    if (name.length === 1 && keys[name.toLowerCase()]) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Particles / juice
  // ---------------------------------------------------------------------------
  function burst(game, x, y, n, opts) {
    const colors = opts.colors || [C.yellow, C.white];
    const spd = opts.spd || 90;
    const up = opts.up || 50;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = spd * (0.25 + Math.random());
      game.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - up * Math.random(),
        life: opts.life || 0.28 + Math.random() * 0.4,
        t: 0,
        c: colors[irand(0, colors.length - 1)],
        g: opts.g !== false,
        sz: opts.sz || irand(1, 2),
      });
    }
  }

  function stepParticles(game, dt) {
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.t += dt;
      if (p.g) p.vy += 380 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.t >= p.life || p.y > H + 8) game.particles.splice(i, 1);
    }
  }

  function addShake(game, mag) {
    game.shake = Math.max(game.shake, mag);
  }

  function callout(game, x, y, text, color) {
    game.callouts.push({ x: x, y: y, text: text, color: color || C.yellow, t: 0, life: 1.15 });
  }

  function stepCallouts(game, dt) {
    for (let i = game.callouts.length - 1; i >= 0; i--) {
      const c = game.callouts[i];
      c.t += dt;
      c.y -= 16 * dt;
      if (c.t >= c.life) game.callouts.splice(i, 1);
    }
  }

  function splash(game, x, y) {
    burst(game, x, y, 14, {
      colors: [C.lblue, C.lcyan, C.white, C.blue],
      spd: 55,
      up: 50,
      life: 0.45,
    });
    Sfx.splash();
    addShake(game, 1.6);
  }

  // ---------------------------------------------------------------------------
  // Weapons / projectiles
  // ---------------------------------------------------------------------------
  function maxPowerFor(tank) {
    return Math.round(42 + 58 * (tank.hp / MAX_HP));
  }

  function crewCount(tank) {
    return Math.max(0, Math.ceil((tank.hp / MAX_HP) * CREW_MAX));
  }

  function weaponIndex(id) {
    for (let i = 0; i < WEAPONS.length; i++) {
      if (WEAPONS[i].id === id) return i;
    }
    return 0;
  }

  function spawnShot(game, tank, weapon, ox, oy, angle, power, extra) {
    const rad = (angle * Math.PI) / 180;
    const v = power * POWER_K;
    const p = {
      x: ox,
      y: oy,
      vx: Math.cos(rad) * v,
      vy: -Math.sin(rad) * v,
      weapon: weapon,
      owner: tank,
      trail: [],
      armed: false,
      dist: 0,
      split: false,
      digging: false,
      digLeft: weapon.kind === "digger" ? 0.42 : 0,
      dead: false,
    };
    if (extra) Object.assign(p, extra);
    game.shots.push(p);
    return p;
  }

  function muzzle(tank) {
    const rad = (tank.angle * Math.PI) / 180;
    return {
      x: tank.x + Math.cos(rad) * 14,
      y: tank.y - 5 - Math.sin(rad) * 14,
    };
  }

  function tankHit(tank, x, y, pad) {
    if (!tank.alive) return false;
    const pr = pad || 0;
    return (
      x >= tank.x - TANK_W / 2 - pr &&
      x <= tank.x + TANK_W / 2 + pr &&
      y >= tank.y - TANK_H - pr &&
      y <= tank.y + 2 + pr
    );
  }

  function applyMound(game, cx, cy, weapon) {
    mound(game.height, cx, weapon.radius, 30);
    burst(game, cx, cy, 16, {
      colors: [C.brown, "#774400", C.yellow, C.green],
      spd: 40,
      up: 20,
      life: 0.4,
    });
    addShake(game, 3);
    Sfx.explode(false);
    callout(game, cx, cy - 16, "MOUND", C.green);
  }

  function applyBlast(game, cx, cy, weapon, owner) {
    const r = weapon.radius;
    excavate(game.height, cx, cy, r);
    burst(game, cx, cy, Math.round(10 + r * 0.7), {
      colors: [C.yellow, C.lred, C.white, C.brown],
      spd: 70 + r * 2,
      up: 70,
      sz: 2,
    });
    burst(game, cx, cy, Math.round(8 + r * 0.45), {
      colors: [C.brown, "#774400", C.dgray],
      spd: 50 + r,
      up: 30,
      life: 0.55,
      sz: 2,
    });
    addShake(game, r > 36 ? 10 : r > 20 ? 6 : 3.2);

    let punched = false;
    for (let i = 0; i < game.tanks.length; i++) {
      const t = game.tanks[i];
      if (!t.alive) continue;
      const tx = t.x;
      const ty = t.y - 4;
      const d = Math.hypot(tx - cx, ty - cy);
      const reach = r + 10;
      if (d < reach) {
        const falloff = 1 - d / reach;
        const direct = falloff > 0.82;
        let dmg = Math.round(weapon.damage * (0.35 + 0.65 * falloff));
        if (direct) dmg = Math.round(dmg * 1.35);
        const res = hurt(game, t, dmg, owner, direct);
        if (res === "hit") punched = true;
      } else if (d < reach + 40) {
        callout(game, t.x, t.y - 24, "CLOSE!", C.yellow);
        addShake(game, 2.4);
      }
    }
    if (punched) addShake(game, r > 20 ? 8 : 5);
    game.explosions.push({
      x: cx,
      y: cy,
      r: r,
      t: 0,
      life: r > 36 ? 0.32 : 0.2,
      big: r > 20,
    });
    Sfx.explode(r > 20);
  }

  function hurt(game, tank, dmg, owner, direct) {
    if (!tank.alive || dmg <= 0) return null;
    if (tank.shields > 0) {
      tank.shields--;
      tank.flash = 0.28;
      callout(game, tank.x, tank.y - 24, "BLOCKED", C.lcyan);
      burst(game, tank.x, tank.y - 8, 8, {
        colors: [C.lcyan, C.white],
        spd: 50,
        up: 20,
        g: false,
        life: 0.25,
      });
      addShake(game, 4);
      Sfx.hit();
      return "block";
    }
    const dealt = Math.min(dmg, tank.hp);
    tank.hp -= dealt;
    if (owner && owner !== tank) owner.roundDmg = (owner.roundDmg || 0) + dealt;
    tank.flash = 0.2;
    callout(game, tank.x, tank.y - 28, direct ? "DIRECT HIT" : "-" + dmg, direct ? C.yellow : C.lred);
    burst(game, tank.x, tank.y - 6, 8, {
      colors: [tank.color, C.white, C.yellow],
      spd: 80,
      up: 40,
      g: false,
      life: 0.25,
    });
    addShake(game, dmg >= 60 ? 11 : 7);
    Sfx.hit();
    if (tank.hp <= 0) kill(game, tank, owner);
    return "hit";
  }

  function kill(game, tank, owner) {
    if (!tank.alive && tank.hp <= 0 && tank.death > 0) return;
    tank.alive = false;
    tank.hp = 0;
    tank.death = 1.15;
    if (owner && owner !== tank) owner.roundKills = (owner.roundKills || 0) + 1;
    tank.bits = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 90;
      tank.bits.push({
        x: tank.x,
        y: tank.y - 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        c: i % 3 === 0 ? C.dgray : tank.color,
      });
    }
    burst(game, tank.x, tank.y - 4, 22, {
      colors: [C.white, C.yellow, C.lred, C.red, tank.color],
      spd: 130,
      up: 90,
      life: 0.6,
    });
    addShake(game, 9);
    game.explosions.push({
      x: tank.x,
      y: tank.y - 4,
      r: 22,
      t: 0,
      life: 0.55,
      big: true,
    });
    if (!inWater(game.water, tank.x, tank.y)) excavate(game.height, tank.x, tank.y, 16);
    Sfx.death();
    game.pendingCrate = true;
    if (game.living().length <= 1) game.captureIn = 0.14;
  }

  function grantLoot(tank, kind) {
    if (kind === "nuke") tank.ammo[weaponIndex("nuke")] += 1;
    else if (kind === "bomb") tank.ammo[weaponIndex("bomb")] += 2;
    else if (kind === "mirv") tank.ammo[weaponIndex("mirv")] += 1;
    else if (kind === "dirt") tank.ammo[weaponIndex("dirt")] += 1;
    else tank.ammo[weaponIndex("digger")] += 1;
  }

  function spawnCrate(game) {
    if (game.crates.length >= 2) return;
    let x = irand(36, W - 36);
    for (let tries = 0; tries < 8; tries++) {
      let clear = true;
      for (let i = 0; i < game.tanks.length; i++) {
        if (Math.abs(game.tanks[i].x - x) < 28) clear = false;
      }
      if (clear) break;
      x = irand(36, W - 36);
    }
    if (game.water && x > game.water.x0 - 8 && x < game.water.x1 + 8) return;
    game.crates.push({
      x: x,
      y: PLAY_TOP + 6,
      vy: 16,
      kind: CRATE_KINDS[irand(0, CRATE_KINDS.length - 1)],
      grounded: false,
      blink: 0,
    });
  }

  function stepCrates(game, dt) {
    for (let i = game.crates.length - 1; i >= 0; i--) {
      const c = game.crates[i];
      c.blink += dt;
      const ground = surfaceY(game.height, c.x) - 3;
      if (!c.grounded) {
        c.vy += GRAVITY * 0.7 * dt;
        c.y += c.vy * dt;
        if (c.y >= ground) {
          c.y = ground;
          c.grounded = true;
          c.vy = 0;
        }
      } else {
        c.y = ground;
      }
      for (let t = 0; t < game.tanks.length; t++) {
        const tank = game.tanks[t];
        if (!tank.alive) continue;
        if (Math.abs(tank.x - c.x) < 14 && Math.abs(tank.y - c.y) < 16) {
          grantLoot(tank, c.kind);
          burst(game, c.x, c.y, 10, {
            colors: [C.yellow, C.white, C.lgreen],
            spd: 60,
            up: 40,
            g: false,
            life: 0.3,
          });
          Sfx.pickup();
          game.banner = tank.name + "  +" + c.kind.toUpperCase();
          game.bannerT = 0.9;
          game.crates.splice(i, 1);
          break;
        }
      }
    }
  }

  function stepShots(game, dt) {
    dt *= 1.6;
    const sub = 6;
    const sdt = dt / sub;
    for (let i = game.shots.length - 1; i >= 0; i--) {
      const p = game.shots[i];
      if (p.dead) {
        game.shots.splice(i, 1);
        continue;
      }
      for (let s = 0; s < sub; s++) {
        if (p.dead) break;
        p.vx += game.wind * WIND_K * sdt;
        p.vy += GRAVITY * sdt;
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
        p.dist += Math.hypot(p.vx, p.vy) * sdt;
        if (!p.armed && p.dist > 16) p.armed = true;

        p.trail.push(p.x, p.y);
        if (p.trail.length > 48) p.trail.splice(0, 2);

        if (p.x < 0 || p.x >= W || p.y >= H) {
          p.dead = true;
          break;
        }
        if (p.y < PLAY_TOP - 80) continue;

        if (p.weapon.kind === "mirv" && !p.split && p.vy > 20 && p.y > PLAY_TOP + 20) {
          p.split = true;
          spawnShot(game, p.owner, WEAPONS[0], p.x, p.y, 0, 0, {
            vx: p.vx - 55,
            vy: p.vy + 8,
            armed: true,
            weapon: WEAPONS[0],
          });
          spawnShot(game, p.owner, WEAPONS[0], p.x, p.y, 0, 0, {
            vx: p.vx + 55,
            vy: p.vy + 8,
            armed: true,
            weapon: WEAPONS[0],
          });
          burst(game, p.x, p.y, 8, {
            colors: [C.white, C.lcyan],
            spd: 40,
            up: 10,
            g: false,
            life: 0.2,
          });
        }

        if (inWater(game.water, p.x, p.y)) {
          splash(game, p.x, game.water.y);
          p.dead = true;
          break;
        }

        if (p.armed) {
          for (let t = 0; t < game.tanks.length; t++) {
            if (tankHit(game.tanks[t], p.x, p.y, 1)) {
              if (p.weapon.kind === "mound") applyMound(game, p.x, p.y, p.weapon);
              else applyBlast(game, p.x, p.y, p.weapon, p.owner);
              p.dead = true;
              break;
            }
          }
          if (p.dead) break;
        }

        const ground = surfaceY(game.height, p.x);
        const inDirt = p.y >= ground;
        if (p.weapon.kind === "digger" && p.digLeft > 0 && (inDirt || p.digging)) {
          p.digging = true;
          p.vy = Math.max(p.vy, 90);
          p.vx *= 0.94;
          trench(game.height, p.x, p.y, 5);
          if (Math.random() < 0.35) {
            burst(game, p.x, p.y, 2, {
              colors: [C.brown, C.yellow],
              spd: 40,
              up: 20,
              life: 0.2,
            });
          }
          p.digLeft -= sdt;
          if (p.digLeft <= 0) {
            applyBlast(game, p.x, p.y, p.weapon, p.owner);
            p.dead = true;
          }
        } else if (inDirt) {
          if (p.weapon.kind === "mound") applyMound(game, p.x, p.y, p.weapon);
          else applyBlast(game, p.x, p.y, p.weapon, p.owner);
          p.dead = true;
        }
      }
    }
  }

  function previewArc(tank, wind, height, water) {
    const m = muzzle(tank);
    const rad = (tank.angle * Math.PI) / 180;
    const v = tank.power * POWER_K;
    let x = m.x;
    let y = m.y;
    let vx = Math.cos(rad) * v;
    let vy = -Math.sin(rad) * v;
    const pts = [];
    const dt = 0.032;
    for (let i = 0; i < 22; i++) {
      vx += wind * WIND_K * dt;
      vy += GRAVITY * dt;
      x += vx * dt;
      y += vy * dt;
      if (x < 0 || x >= W || y >= H) break;
      if (inWater(water, x, y)) break;
      if (y >= PLAY_TOP && y >= surfaceY(height, x)) break;
      if (i % 2 === 1) pts.push(x, y);
    }
    return pts;
  }

  // ---------------------------------------------------------------------------
  // AI — sample trajectories; slop depends on difficulty
  // ---------------------------------------------------------------------------
  function simulateImpact(sx, sy, angle, power, wind, height, water, maxT) {
    const rad = (angle * Math.PI) / 180;
    const v = power * POWER_K;
    let x = sx;
    let y = sy;
    let vx = Math.cos(rad) * v;
    let vy = -Math.sin(rad) * v;
    const dt = 1 / 40;
    const tMax = maxT || 6;
    for (let t = 0; t < tMax; t += dt) {
      vx += wind * WIND_K * dt;
      vy += GRAVITY * dt;
      x += vx * dt;
      y += vy * dt;
      if (x < 0 || x >= W || y >= H) return { x: x, y: y };
      if (inWater(water, x, y)) return { x: x, y: y };
      if (y >= PLAY_TOP && y >= surfaceY(height, x)) return { x: x, y: y };
    }
    return { x: x, y: y };
  }

  function aiChoose(game, tank) {
    const foes = game.tanks.filter(function (t) {
      return t.alive && t !== tank;
    });
    if (!foes.length) return { angle: tank.angle, power: tank.power, weapon: 0 };

    let target = foes[0];
    let bestD = Math.abs(target.x - tank.x);
    for (let i = 1; i < foes.length; i++) {
      const d = Math.abs(foes[i].x - tank.x);
      if (d < bestD) {
        bestD = d;
        target = foes[i];
      }
    }

    const diff = game.difficulty;
    const misread = [0, 1.6, 0.7][diff] * (Math.random() * 2 - 1);
    const windUse = game.wind * [0.2, 1, 1][diff] + misread;
    const coarse = [6, 4, 3][diff];
    const slopA = [16, 4, 2][diff];
    const slopP = [18, 6, 3][diff];

    const muz = muzzle(tank);
    const facingRight = target.x >= tank.x;
    const a0 = facingRight ? 12 : 100;
    const a1 = facingRight ? 80 : 168;
    const pMax = maxPowerFor(tank);

    let pick = { err: 1e9, angle: facingRight ? 45 : 135, power: 60 };
    for (let angle = a0; angle <= a1; angle += coarse) {
      for (let power = 24; power <= pMax; power += coarse + 1) {
        const hit = simulateImpact(muz.x, muz.y, angle, power, windUse, game.height, game.water);
        const err = Math.hypot(hit.x - target.x, hit.y - (target.y - 4));
        if (err < pick.err) pick = { err: err, angle: angle, power: power };
      }
    }
    if (diff > 0) {
      for (let angle = pick.angle - 5; angle <= pick.angle + 5; angle++) {
        if (angle < 1 || angle > 179) continue;
        for (let power = pick.power - 5; power <= pick.power + 5; power++) {
          if (power < 10 || power > pMax) continue;
          const hit = simulateImpact(muz.x, muz.y, angle, power, windUse, game.height, game.water);
          const err = Math.hypot(hit.x - target.x, hit.y - (target.y - 4));
          if (err < pick.err) pick = { err: err, angle: angle, power: power };
        }
      }
    }

    pick.angle = clamp(pick.angle + irand(-slopA, slopA), 1, 179);
    pick.power = clamp(pick.power + irand(-slopP, slopP), 10, pMax);

    let w = 0;
    if (diff === 0) {
      if (Math.random() < 0.2 && tank.ammo[1] > 0) w = 1;
    } else if (pick.err < 40 && tank.ammo[1] > 0) w = 1;
    else if (bestD > 180 && tank.ammo[2] > 0) w = 2;
    else if (tank.ammo[4] > 0 && pick.err < 55) w = 4;
    else if (tank.ammo[5] > 0 && Math.random() < 0.22) w = 5;
    else if (pick.err > 70 && tank.ammo[3] > 0 && Math.random() < 0.35) w = 3;
    pick.weapon = w;
    return pick;
  }

  // ---------------------------------------------------------------------------
  // Game object
  // ---------------------------------------------------------------------------
  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;

    this.mode = "title";
    this.playMode = "cpu";
    this.difficulty = 1;
    this.hotseatPlayers = 2;
    this.cpuCount = 1;
    this.titleRow = 0;

    this.height = null;
    this.tanks = [];
    this.shots = [];
    this.explosions = [];
    this.particles = [];
    this.crates = [];
    this.stars = [];
    this.wind = 0;
    this.turn = 0;
    this.dropIndex = 0;
    this.dropWait = 0;
    this.ai = null;
    this.banner = "";
    this.bannerT = 0;
    this.winner = null;
    this.time = 0;
    this.shake = 0;
    this.previewOn = true;
    this.pendingCrate = false;
    this.turnNumber = 0;
    this.humanLost = false;
    this.roster = null;
    this.round = 1;
    this.mapIndex = 0;
    this.mapKind = "canyon";
    this.water = null;
    this.callouts = [];
    this.seriesOver = false;
    this.roundScored = false;
    this.roundLines = [];
    this.shopPlayer = 0;
    this.shopCursor = 0;
    this.shopNote = "";
    this.shopCpu = 0;
    this.pointer = { down: false, dragged: false, x: 0, y: 0, sx: 0, sy: 0, power: 60, aim: false };
    this.weaponBoxes = [];
    this.handoffLock = 0;
    this.handoffKind = "";
    this.net = null;
    this.onlineRole = "host";
    this.netCpu = 0;
    this.lobbyRow = 0;
    this.lobbyBoxes = [];
    this.joinCode = "";
    this.joinError = "";
    this.turnSeq = 0;
    this.clock = 0;
    this.waitT = 0;
    this.shopReady = false;
    this.demo = false;
    this.demoT = 0;
    this.captureIn = 0;
    this.captureNext = false;
    this.finalFrame = null;
    this.finalFrameRound = 0;
    this.shareT = 0;
    this.shareBox = null;

    this.rebuildStars();
  }

  Game.prototype.titleRows = function () {
    return this.playMode === "cpu" ? 4 : 3;
  };

  Game.prototype.rebuildStars = function () {
    this.stars = [];
    for (let i = 0; i < 48; i++) {
      this.stars.push({
        x: irand(0, W - 1),
        y: irand(PLAY_TOP + 2, PLAY_TOP + 120),
        c: Math.random() < 0.2 ? C.white : C.gray,
      });
    }
  };

  Game.prototype.living = function () {
    return this.tanks.filter(function (t) {
      return t.alive;
    });
  };

  Game.prototype.current = function () {
    if (!this.tanks.length) return null;
    return this.tanks[this.turn % this.tanks.length];
  };

  Game.prototype.applyModeCounts = function () {
    if (this.demo) {
      this.tankCount = CPU_CALLSIGNS.length;
      this.humanCount = 0;
    } else if (this.net) {
      this.humanCount = this.net.seats.length;
      this.tankCount = Math.min(MAX_TANKS, this.humanCount + this.netCpu);
    } else if (this.playMode === "cpu") {
      this.tankCount = 1 + this.cpuCount;
      this.humanCount = 1;
    } else {
      this.tankCount = this.hotseatPlayers;
      this.humanCount = this.hotseatPlayers;
    }
  };

  Game.prototype.startSeries = function () {
    if (this.net) this.hostSeatSeries();
    this.applyModeCounts();
    const n = this.tankCount;
    const humans = this.humanCount;
    this.roster = [];
    for (let i = 0; i < n; i++) {
      const human = i < humans;
      this.roster.push({
        id: i,
        name: human
          ? "P" + (i + 1)
          : n - humans === 1
            ? DIFF_NAMES[this.difficulty]
            : CPU_CALLSIGNS[i - humans],
        color: PLAYER_COLORS[i],
        dim: PLAYER_DIM[i],
        human: human,
        cash: 250,
        wins: 0,
        ammo: WEAPONS.map(function (w) {
          return w.ammo === Infinity ? Infinity : w.ammo;
        }),
        shields: 0,
        guidance: 1,
        shots: 0,
        kills: 0,
        dmg: 0,
      });
    }
    this.round = 1;
    this.mapIndex = 0;
    this.seriesOver = false;
    this.shareT = 0;
    this.newBattle();
  };

  function slotX(i, n, kind) {
    if (kind === "water") {
      const leftN = Math.ceil(n / 2);
      if (i < leftN) return Math.round(28 + ((i + 0.5) * 170) / leftN);
      const j = i - leftN;
      const rightN = n - leftN;
      return Math.round(436 + ((j + 0.5) * 160) / rightN);
    }
    const margin = kind === "canyon" ? 34 : 48;
    return clamp(Math.round(margin + ((W - margin * 2) * (i + 0.5)) / n + irand(-6, 6)), 24, W - 24);
  }

  Game.prototype.newBattle = function () {
    if (!this.roster) {
      this.startSeries();
      return;
    }
    const kind = MAPS[this.mapIndex % MAPS.length];
    this.mapIndex++;
    const map = generateMap(kind, Math.random);
    let wind = irand(-9, 9);
    if (Math.abs(wind) < 2) wind = irand(0, 1) ? 2 : -2;
    const xs = [];
    for (let i = 0; i < this.roster.length; i++) xs.push(slotX(i, this.roster.length, kind));
    this.layBattle(kind, map, wind, xs);
    if (this.net) this.netSend({ t: "battle", s: this.battleSnapshot() });
  };

  /** Fresh hill from rolled (or received) map, wind, and tank slots. */
  Game.prototype.layBattle = function (kind, map, wind, xs) {
    this.mapKind = kind;
    this.height = map.height;
    this.water = map.water;
    this.rebuildStars();
    this.shots = [];
    this.explosions = [];
    this.particles = [];
    this.crates = [];
    this.callouts = [];
    this.winner = null;
    this.shake = 0;
    this.pendingCrate = false;
    this.turnNumber = 0;
    this.roundScored = false;
    this.roundLines = [];
    this.wind = wind;
    this.windShift = false;

    this.tanks = [];
    for (let i = 0; i < this.roster.length; i++) {
      const src = this.roster[i];
      const x = xs[i];
      this.tanks.push({
        id: src.id,
        name: src.name,
        color: src.color,
        dim: src.dim,
        human: src.human,
        x: x,
        y: PLAY_TOP - 10,
        vy: 0,
        falling: true,
        fallAcc: 0,
        angle: x < W / 2 ? 50 : 130,
        power: 58,
        hp: MAX_HP,
        alive: true,
        weapon: 0,
        ammo: src.ammo.map(function (n) {
          return n;
        }),
        shields: src.shields,
        guidance: src.guidance,
        roundKills: 0,
        roundDmg: 0,
        flash: 0,
        death: 0,
        bits: null,
        dropped: false,
      });
    }
    this.dropIndex = 0;
    this.dropWait = 0.04;
    this.turn = 0;
    this.ai = null;
    this.banner = MAP_LABEL[kind];
    this.bannerT = 0.8;
    if (this.humanCount > 1 && !this.net) {
      this.mode = "handoff";
      this.handoffKind = "open";
      this.handoffLock = 0.45;
      flushTaps();
    } else {
      this.handoffKind = "";
      this.mode = "drop";
    }
  };

  function seriesChamp(roster) {
    let best = roster[0];
    let tied = false;
    for (let i = 1; i < roster.length; i++) {
      if (roster[i].wins > best.wins) {
        best = roster[i];
        tied = false;
      } else if (roster[i].wins === best.wins) tied = true;
    }
    return tied ? null : best;
  }

  function leaderState(roster) {
    let best = 0;
    let count = 0;
    for (let i = 0; i < roster.length; i++) {
      if (roster[i].wins > best) {
        best = roster[i].wins;
        count = 1;
      } else if (roster[i].wins === best) count++;
    }
    return { best: best, count: count };
  }

  function applyBuy(roster, item) {
    if (roster.cash < item.cost) return false;
    roster.cash -= item.cost;
    if (item.id === "shield") roster.shields++;
    else if (item.id === "guide") roster.guidance++;
    else if (item.id === "bomb") roster.ammo[weaponIndex("bomb")] += 2;
    else if (item.id === "mirv") roster.ammo[weaponIndex("mirv")] += 1;
    else if (item.id === "dirt") roster.ammo[weaponIndex("dirt")] += 1;
    else if (item.id === "nuke") roster.ammo[weaponIndex("nuke")] += 1;
    return true;
  }

  function cpuPurchase(roster, difficulty) {
    const plans = [
      ["dirt", "bomb", "guide"],
      ["bomb", "mirv", "shield", "dirt"],
      ["nuke", "shield", "mirv", "bomb"],
    ];
    const plan = plans[difficulty] || plans[1];
    const bought = [];
    for (let n = 0; n < 3; n++) {
      let did = false;
      for (let i = 0; i < plan.length; i++) {
        const item = SHOP.filter(function (s) {
          return s.id === plan[i];
        })[0];
        if (item && applyBuy(roster, item)) {
          bought.push(item.name);
          did = true;
          break;
        }
      }
      if (!did) break;
    }
    return bought.length ? "BUYS " + bought.join(" + ") : "SAVES THE CASH";
  }

  Game.prototype.playVictoryJingle = function () {
    if (this.net) {
      const seat = this.net.seat;
      const mine = this.tanks.filter(function (t) {
        return t.id === seat;
      })[0];
      if (mine && mine.alive) Sfx.win();
      else Sfx.lose();
      return;
    }
    const humansAlive = this.tanks.some(function (t) {
      return t.alive && t.human;
    });
    const anyHuman = this.tanks.some(function (t) {
      return t.human;
    });
    if (anyHuman && !humansAlive) Sfx.lose();
    else Sfx.win();
  };

  Game.prototype.enterVictory = function () {
    if (this.roundScored) {
      this.mode = "victory";
      return;
    }
    this.roundScored = true;
    const living = this.living();
    this.winner = living.length === 1 ? living[0] : null;
    this.roundLines = [];
    for (let i = 0; i < this.tanks.length; i++) {
      const t = this.tanks[i];
      const r = this.roster[t.id];
      r.ammo = t.ammo.map(function (n) {
        return n;
      });
      r.shields = t.shields;
      r.guidance = t.guidance;
      r.kills = (r.kills || 0) + (t.roundKills || 0);
      r.dmg = (r.dmg || 0) + (t.roundDmg || 0);
      let pay = (t.roundKills || 0) * 400;
      const bits = [];
      if (t.roundKills) bits.push("+" + t.roundKills * 400 + " kills");
      if (this.winner && t.id === this.winner.id) {
        pay += 700;
        r.wins++;
        bits.push("+700 win");
      } else if (t.alive) {
        pay += 150;
        bits.push("+150 alive");
      }
      r.cash += pay;
      if (bits.length) this.roundLines.push({ name: r.name, color: r.color, text: bits.join("  ") });
    }
    const lead = leaderState(this.roster);
    this.seriesOver = lead.best >= WINS_TO_TAKE || (this.round >= 5 && lead.count === 1) || this.round >= 7;
    this.mode = "victory";
    this.playVictoryJingle();
    if (this.net) this.hostVictory();
    if (this.seriesOver) this.queueShare();
  };

  Game.prototype.leaveVictory = function () {
    if (!this.seriesOver) this.beginShop();
    else if (!this.isGuest()) this.startSeries();
  };

  Game.prototype.beginShop = function () {
    this.shopPlayer = 0;
    this.shopCursor = 0;
    this.shopNote = "";
    this.shopCpu = 0;
    this.mode = "shop";
    if (this.net) {
      // Everyone shops at once, each on their own screen.
      this.shopPlayer = this.net.seat;
      this.shopReady = false;
      return;
    }
    this.openShopPlayer();
  };

  Game.prototype.openShopPlayer = function () {
    if (this.shopPlayer >= this.roster.length) {
      this.round++;
      this.newBattle();
      return;
    }
    const r = this.roster[this.shopPlayer];
    this.shopCursor = 0;
    this.shopNote = "";
    if (!r.human) {
      this.shopNote = cpuPurchase(r, this.difficulty);
      this.shopCpu = this.demo ? 0.5 : 1.05;
      Sfx.ui();
    } else {
      this.shopCpu = 0;
    }
  };

  Game.prototype.advanceShop = function () {
    if (this.net) {
      if (this.shopReady) return;
      this.shopReady = true;
      this.shopNote = "";
      Sfx.ui();
      if (this.net.host) this.hostShopCheck();
      else this.netSend({ t: "shopdone" });
      return;
    }
    this.shopPlayer++;
    this.openShopPlayer();
  };

  Game.prototype.tryShopBuy = function () {
    const r = this.roster[this.shopPlayer];
    if (!r || !r.human || (this.net && this.shopReady)) return;
    if (this.shopCursor >= SHOP.length) {
      this.advanceShop();
      return;
    }
    const item = SHOP[this.shopCursor];
    if (applyBuy(r, item)) {
      this.shopNote = "BOUGHT " + item.name;
      Sfx.pickup();
      if (this.isGuest()) this.netSend({ t: "buy", id: item.id });
    } else {
      this.shopNote = "NEED $" + item.cost;
      Sfx.deny();
    }
  };

  Game.prototype.nextTurn = function (opts) {
    const living = this.living();
    if (living.length <= 1) {
      this.enterVictory();
      return;
    }
    // Shift hard enough that last turn's winning aim usually misses now.
    const before = this.wind;
    if (Math.random() < 0.25) this.wind = irand(-12, 12);
    else this.wind = clamp(this.wind + irand(-5, 5), -12, 12);
    if (Math.abs(this.wind) < 2) this.wind = this.wind < 0 ? -2 : 2;
    const windShift = Math.abs(this.wind - before) >= 5;
    this.windShift = windShift;
    if (Math.abs(this.wind) >= 4) Sfx.whoosh(this.wind);

    if (this.pendingCrate || (this.turnNumber > 0 && this.turnNumber % 3 === 0 && Math.random() < 0.65)) {
      spawnCrate(this);
      this.pendingCrate = false;
    }

    let guard = 0;
    do {
      this.turn = (this.turn + 1) % this.tanks.length;
      guard++;
    } while (!this.tanks[this.turn].alive && guard < 8);

    const cur = this.current();
    cur.power = clamp(cur.power, 10, maxPowerFor(cur));
    this.ai = null;
    this.turnNumber++;
    this.turnSeq++;
    this.announceTurn();
    if (!cur.human) {
      const plan = aiChoose(this, cur);
      this.ai = {
        angle: plan.angle,
        power: plan.power,
        weapon: plan.weapon,
        think: 0.05,
      };
      cur.weapon = plan.weapon;
      this.mode = "aim";
    } else if (this.humanCount > 1 && !this.net && !(opts && opts.skipHandoff)) {
      this.mode = "handoff";
      this.handoffKind = "turn";
      this.handoffLock = 0.4;
      flushTaps();
    } else {
      this.mode = "aim";
      Sfx.ui();
    }
    if (this.net) this.hostTurn();
  };

  Game.prototype.announceTurn = function () {
    const cur = this.current();
    const mine = this.net && this.isLocal(cur);
    const who = mine ? "YOUR TURN" : cur.name;
    this.banner = who + (this.windShift ? "  WIND SHIFT" : mine ? "" : "  READY?");
    this.bannerT = this.windShift || mine ? 0.9 : 0.55;
  };

  /** Tanks this screen's player steers. Offline that's every human tank. */
  Game.prototype.isLocal = function (tank) {
    if (!tank || !tank.human) return false;
    return !this.net || tank.id === this.net.seat;
  };

  Game.prototype.isGuest = function () {
    return !!(this.net && !this.net.host);
  };

  Game.prototype.releaseHandoff = function () {
    if (this.mode !== "handoff") return;
    if (this.handoffLock > 0) return;
    flushTaps();
    if (this.handoffKind === "open") {
      this.handoffKind = "";
      this.mode = "drop";
      return;
    }
    this.handoffKind = "";
    this.mode = "aim";
    this.banner = this.current().name + (this.windShift ? "  WIND SHIFT" : "  READY?");
    this.bannerT = 1.05;
    Sfx.ui();
  };

  /** Fire the current tank. `remote` replays a shot another screen already took. */
  Game.prototype.tryFire = function (remote) {
    const tank = this.current();
    if (!tank || !tank.alive || this.mode !== "aim") return;
    if (!remote && this.isGuest() && !this.isLocal(tank)) return;
    let guide;
    if (remote) {
      tank.angle = remote.a;
      tank.power = remote.p;
      tank.weapon = remote.w;
      guide = remote.g && tank.guidance > 0;
      if (WEAPONS[tank.weapon].ammo !== Infinity) tank.ammo[tank.weapon] = Math.max(0, tank.ammo[tank.weapon] - 1);
    } else {
      guide = this.isLocal(tank) && tank.guidance > 0 && this.previewOn;
      const w = WEAPONS[tank.weapon];
      if (w.ammo !== Infinity) {
        if (tank.ammo[tank.weapon] <= 0) {
          tank.weapon = 0;
        } else {
          tank.ammo[tank.weapon]--;
        }
      }
    }
    if (guide) tank.guidance--;
    const shooter = this.roster && this.roster[tank.id];
    if (shooter) shooter.shots = (shooter.shots || 0) + 1;
    if (this.net && !remote) {
      this.netSend({ t: "fire", seq: this.turnSeq, id: tank.id, a: tank.angle, p: tank.power, w: tank.weapon, g: guide });
    }
    const m = muzzle(tank);
    spawnShot(this, tank, WEAPONS[tank.weapon], m.x, m.y, tank.angle, tank.power);
    burst(this, m.x, m.y, 7, {
      colors: [C.yellow, C.white, C.lred],
      spd: 50,
      up: 10,
      g: false,
      life: 0.18,
    });
    addShake(this, 1.6);
    Sfx.fire();
    this.mode = "fire";
    this.ai = null;
  };

  Game.prototype.settleTanks = function (dt) {
    let busy = false;
    for (let i = 0; i < this.tanks.length; i++) {
      const t = this.tanks[i];
      if (t.death > 0) {
        t.death -= dt;
        if (t.bits) {
          for (let b = 0; b < t.bits.length; b++) {
            const bit = t.bits[b];
            bit.vy += GRAVITY * dt;
            bit.x += bit.vx * dt;
            bit.y += bit.vy * dt;
          }
        }
      }
      if (!t.alive && t.death <= 0) continue;
      const ground = surfaceY(this.height, t.x) - 1;
      if (t.y < ground - 0.4) {
        if (!t.falling) {
          t.falling = true;
          t.fallAcc = 0;
          t.vy = 0;
        }
        t.vy += GRAVITY * dt;
        t.y += t.vy * dt;
        t.fallAcc += t.vy * dt;
        busy = true;
        if (t.y >= ground) {
          t.y = ground;
          if (t.alive && t.fallAcc > 22) {
            hurt(this, t, Math.round((t.fallAcc - 22) * 0.55));
            Sfx.fall();
          }
          t.vy = 0;
          t.falling = false;
          t.fallAcc = 0;
        }
      } else {
        t.y = ground;
        t.vy = 0;
        t.falling = false;
      }
      if (t.alive && inWater(this.water, t.x, t.y - 2)) {
        splash(this, t.x, this.water.y);
        callout(this, t.x, this.water.y - 18, "SUNK", C.lblue);
        kill(this, t, null);
      }
    }
    return busy;
  };

  Game.prototype.cycleWeapon = function (tank, dir) {
    let w = tank.weapon;
    for (let i = 0; i < WEAPONS.length; i++) {
      w = (w + dir + WEAPONS.length) % WEAPONS.length;
      if (WEAPONS[w].ammo === Infinity || tank.ammo[w] > 0) {
        tank.weapon = w;
        Sfx.ui();
        return;
      }
    }
  };

  Game.prototype.handleAimInput = function (dt) {
    const tank = this.current();
    if (!this.isLocal(tank)) return;

    const prevA = Math.round(tank.angle);
    const prevP = Math.round(tank.power);
    const angSpeed = (held("Shift") ? 40 : 70) * dt;
    const powSpeed = (held("Shift") ? 35 : 55) * dt;

    // A tap always steps, even if keyup lands before the next frame.
    // Left swings the muzzle left (angle rises: 0° flat right, 180° flat left).
    if (consume("ArrowLeft") || consume("a") || consume("A")) tank.angle += 4;
    if (consume("ArrowRight") || consume("d") || consume("D")) tank.angle -= 4;
    if (consume("ArrowUp") || consume("w") || consume("W")) tank.power += 4;
    if (consume("ArrowDown") || consume("s") || consume("S")) tank.power -= 4;

    if (held("ArrowLeft") || held("a") || held("A")) tank.angle += angSpeed;
    if (held("ArrowRight") || held("d") || held("D")) tank.angle -= angSpeed;
    tank.angle = clamp(tank.angle, 0, 180);

    if (held("ArrowUp") || held("w") || held("W")) tank.power += powSpeed;
    if (held("ArrowDown") || held("s") || held("S")) tank.power -= powSpeed;
    tank.power = clamp(tank.power, 10, maxPowerFor(tank));

    if (Math.round(tank.angle) !== prevA || Math.round(tank.power) !== prevP) Sfx.tick();

    if (consume("1")) tank.weapon = 0;
    if (consume("2")) tank.weapon = tank.ammo[1] > 0 ? 1 : tank.weapon;
    if (consume("3")) tank.weapon = tank.ammo[2] > 0 ? 2 : tank.weapon;
    if (consume("4")) tank.weapon = tank.ammo[3] > 0 ? 3 : tank.weapon;
    if (consume("5")) tank.weapon = tank.ammo[4] > 0 ? 4 : tank.weapon;
    if (consume("6")) tank.weapon = tank.ammo[5] > 0 ? 5 : tank.weapon;
    if (consume("[") || consume("{")) this.cycleWeapon(tank, -1);
    if (consume("]") || consume("}")) this.cycleWeapon(tank, 1);
    if (consume("t") || consume("T")) {
      if (tank.guidance <= 0) {
        this.banner = "NO GUIDANCE";
        this.bannerT = 0.9;
        Sfx.deny();
      } else {
        this.previewOn = !this.previewOn;
        this.banner = this.previewOn ? "ARC ON" : "ARC OFF";
        this.bannerT = 0.7;
        Sfx.ui();
      }
    }
    if (consume(" ") || consume("Spacebar") || consume("Enter")) this.tryFire();
  };

  Game.prototype.nudgeTitle = function (dir) {
    if (this.titleRow === 0) {
      const modes = window.TankNet ? ["cpu", "hotseat", "online"] : ["cpu", "hotseat"];
      const i = modes.indexOf(this.playMode);
      this.playMode = modes[(i + dir + modes.length) % modes.length];
    } else if (this.titleRow === 1) {
      if (this.playMode === "cpu") {
        this.difficulty = (this.difficulty + dir + 3) % 3;
      } else if (this.playMode === "online") {
        this.onlineRole = this.onlineRole === "host" ? "join" : "host";
      } else {
        this.hotseatPlayers += dir;
        if (this.hotseatPlayers < 2) this.hotseatPlayers = 4;
        if (this.hotseatPlayers > 4) this.hotseatPlayers = 2;
      }
    } else if (this.titleRow === 2 && this.playMode === "cpu") {
      this.cpuCount += dir;
      if (this.cpuCount < 1) this.cpuCount = 3;
      if (this.cpuCount > 3) this.cpuCount = 1;
    } else {
      Sfx.muted = !Sfx.muted;
    }
    Sfx.ui();
  };

  Game.prototype.handleTitleInput = function () {
    if (consume("ArrowLeft") || consume("a") || consume("A")) this.nudgeTitle(-1);
    if (consume("ArrowRight") || consume("d") || consume("D")) this.nudgeTitle(1);
    if (consume("ArrowUp") || consume("w") || consume("W")) {
      this.titleRow = (this.titleRow + this.titleRows() - 1) % this.titleRows();
      Sfx.ui();
    }
    if (consume("ArrowDown") || consume("s") || consume("S")) {
      this.titleRow = (this.titleRow + 1) % this.titleRows();
      Sfx.ui();
    }
    if (consume("Enter") || consume(" ") || consume("Spacebar")) {
      Sfx.ui();
      this.startFromTitle();
    }
    if (consume("m") || consume("M")) {
      Sfx.muted = !Sfx.muted;
      Sfx.ui();
    }
  };

  Game.prototype.startFromTitle = function () {
    if (this.playMode !== "online") {
      this.startSeries();
    } else if (this.onlineRole === "host") {
      this.hostOnline();
    } else {
      this.mode = "join";
      this.joinError = "";
      flushTaps();
    }
  };

  Game.prototype.toTitle = function () {
    if (this.net) this.leaveOnline();
    this.roster = null;
    this.mode = "title";
    flushTaps();
  };

  Game.prototype.handleShopInput = function () {
    const r = this.roster[this.shopPlayer];
    if (!r || !r.human || this.shopCpu > 0 || (this.net && this.shopReady)) return;
    const rows = SHOP.length + 1;
    if (consume("ArrowUp") || consume("w") || consume("W")) {
      this.shopCursor = (this.shopCursor + rows - 1) % rows;
      Sfx.ui();
    }
    if (consume("ArrowDown") || consume("s") || consume("S")) {
      this.shopCursor = (this.shopCursor + 1) % rows;
      Sfx.ui();
    }
    if (consume("Enter")) this.tryShopBuy();
    if (consume("n") || consume("N") || consume("f") || consume("F")) this.advanceShop();
    if ((consume(" ") || consume("Spacebar")) && this.shopCursor >= SHOP.length) this.advanceShop();
  };

  Game.prototype.tick = function (dt) {
    this.time += dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.captureIn > 0) {
      this.captureIn -= dt;
      if (this.captureIn <= 0) this.captureNext = true;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);

    for (let i = 0; i < this.tanks.length; i++) {
      if (this.tanks[i].flash > 0) this.tanks[i].flash -= dt;
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].t += dt;
      if (this.explosions[i].t >= this.explosions[i].life) this.explosions.splice(i, 1);
    }
    stepParticles(this, dt);
    stepCallouts(this, dt);

    if (this.net) this.netTick(dt);

    if (this.mode === "title") {
      this.handleTitleInput();
      return;
    }

    if (this.mode === "join") {
      this.handleJoinInput();
      return;
    }

    if (this.mode === "netdown") {
      if (consume("Enter") || consume(" ") || consume("Spacebar") || consume("Escape") || consume("Esc")) {
        this.toTitle();
      }
      return;
    }

    if (consume("m") || consume("M")) {
      Sfx.muted = !Sfx.muted;
      Sfx.ui();
    }

    if (consume("Escape") || consume("Esc")) {
      this.toTitle();
      return;
    }

    if (this.mode === "lobby") {
      this.handleLobbyInput();
      return;
    }

    if (this.mode === "handoff") {
      if (this.handoffLock > 0) {
        this.handoffLock -= dt;
        flushTaps();
        return;
      }
      if (consume("Enter") || consume(" ") || consume("Spacebar")) this.releaseHandoff();
      return;
    }

    if (this.mode === "shop") {
      if (this.shopCpu > 0) {
        this.shopCpu -= dt;
        if (this.shopCpu <= 0) this.advanceShop();
      } else {
        this.handleShopInput();
      }
      return;
    }

    if (this.mode === "victory") {
      if (this.demo) {
        this.demoT += dt;
        if (this.demoT > 2.6) {
          this.demoT = 0;
          this.leaveVictory();
        }
      } else {
        if (this.shareT > 0) {
          this.shareT -= dt;
          if (this.shareT <= 0) Share.open(this);
        }
        if (this.seriesOver && (consume("s") || consume("S"))) Share.open(this);
        else if (consume("Enter") || consume(" ") || consume("Spacebar")) this.leaveVictory();
      }
      return;
    }

    if (this.mode === "drop") {
      if (this.dropIndex < this.tanks.length) {
        this.dropWait -= dt;
        if (this.dropWait <= 0) {
          const t = this.tanks[this.dropIndex];
          if (!t.dropped) {
            t.dropped = true;
            t.falling = true;
            t.vy = 140;
            Sfx.fall();
          }
          const ground = surfaceY(this.height, t.x) - 1;
          t.vy += GRAVITY * dt;
          t.y += t.vy * dt;
          if (t.y >= ground) {
            t.y = ground;
            t.vy = 0;
            t.falling = false;
            burst(this, t.x, t.y, 5, {
              colors: [C.brown, C.yellow],
              spd: 30,
              up: 20,
              life: 0.25,
            });
            this.dropIndex++;
            this.dropWait = 0.05;
          }
        }
      } else if (this.isGuest()) {
        this.mode = "netwait";
        this.waitT = 0;
      } else {
        this.turn = -1;
        this.nextTurn({ skipHandoff: this.humanCount > 1 });
      }
      return;
    }

    stepCrates(this, dt);

    if (this.mode === "netwait") {
      this.waitT += dt;
      this.settleTanks(dt);
      return;
    }

    if (this.mode === "aim") {
      this.settleTanks(dt);
      if (this.net && this.netClock(dt)) return;
      const guest = this.isGuest();
      if (this.ai) {
        const tank = this.current();
        if (guest) flushTaps();
        else if (consume(" ") || consume("Spacebar") || consume("Enter")) {
          if (tank) {
            tank.angle = this.ai.angle;
            tank.power = this.ai.power;
            tank.weapon = this.ai.weapon;
            this.tryFire();
          }
          return;
        }
        this.ai.think -= dt;
        if (this.ai.think <= 0 && tank) {
          tank.angle += (this.ai.angle - tank.angle) * Math.min(1, dt * 14);
          tank.power += (this.ai.power - tank.power) * Math.min(1, dt * 14);
          tank.weapon = this.ai.weapon;
          if (Math.abs(tank.angle - this.ai.angle) < 0.8 && Math.abs(tank.power - this.ai.power) < 0.8) {
            tank.angle = this.ai.angle;
            tank.power = this.ai.power;
            // A guest's CPU only mimes; the host's shot arrives over the wire.
            if (!guest) this.tryFire();
          }
        }
      } else if (this.isLocal(this.current())) {
        this.handleAimInput(dt);
        if (this.net && this.mode === "aim") this.netAimOut();
      } else if (this.net) {
        this.followNetAim(dt);
      }
      return;
    }

    if (this.mode === "fire") {
      stepShots(this, dt);
      this.settleTanks(dt);
      if (this.shots.length === 0 && this.explosions.length === 0) {
        this.mode = "settle";
      }
      return;
    }

    if (this.mode === "settle") {
      const busy = this.settleTanks(dt);
      stepShots(this, dt);
      if (!busy && this.shots.length === 0 && this.explosions.length === 0) {
        const living = this.living();
        if (this.isGuest()) {
          this.mode = "netwait";
          this.waitT = 0;
        } else if (living.length <= 1) this.enterVictory();
        else this.nextTurn();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Online play — host-authoritative. The host rolls everything random (maps,
  // wind, crates, CPU aim) and opens each turn with a snapshot. Shots travel as
  // angle/power/weapon; every screen flies them itself on the same fixed step,
  // and the next snapshot wipes out any drift.
  // ---------------------------------------------------------------------------
  const TANK_SYNC = [
    "name",
    "human",
    "x",
    "y",
    "vy",
    "falling",
    "fallAcc",
    "angle",
    "power",
    "hp",
    "alive",
    "weapon",
    "shields",
    "guidance",
    "roundKills",
    "roundDmg",
  ];

  function packAmmo(ammo) {
    return ammo.map(function (n) {
      return n === Infinity ? -1 : n;
    });
  }

  function unpackAmmo(ammo) {
    return ammo.map(function (n) {
      return n < 0 ? Infinity : n;
    });
  }

  /** Terrain travels in 1/16 px steps. The host snaps its own copy too, so every screen holds the same hill. */
  function packHeight(height) {
    const out = new Array(height.length);
    for (let x = 0; x < height.length; x++) {
      out[x] = Math.round(height[x] * 16);
      height[x] = out[x] / 16;
    }
    return out;
  }

  function unpackHeight(height, packed) {
    for (let x = 0; x < height.length; x++) height[x] = packed[x] / 16;
  }

  function packRoster(r) {
    return {
      id: r.id,
      name: r.name,
      human: r.human,
      cash: r.cash,
      wins: r.wins,
      ammo: packAmmo(r.ammo),
      shields: r.shields,
      guidance: r.guidance,
      shots: r.shots || 0,
      kills: r.kills || 0,
      dmg: r.dmg || 0,
    };
  }

  function unpackRoster(s) {
    return {
      id: s.id,
      name: s.name,
      color: PLAYER_COLORS[s.id],
      dim: PLAYER_DIM[s.id],
      human: s.human,
      cash: s.cash,
      wins: s.wins,
      ammo: unpackAmmo(s.ammo),
      shields: s.shields,
      guidance: s.guidance,
      shots: s.shots || 0,
      kills: s.kills || 0,
      dmg: s.dmg || 0,
    };
  }

  function packTank(t) {
    const s = { id: t.id, ammo: packAmmo(t.ammo) };
    for (let i = 0; i < TANK_SYNC.length; i++) s[TANK_SYNC[i]] = t[TANK_SYNC[i]];
    return s;
  }

  function seatName(i, humans, cpu, difficulty) {
    if (i < humans) return "P" + (i + 1);
    return cpu === 1 ? DIFF_NAMES[difficulty] : CPU_CALLSIGNS[i - humans];
  }

  Game.prototype.hostOnline = function () {
    const self = this;
    const net = {
      host: true,
      seat: 0,
      code: "",
      room: null,
      seats: [{ link: null, gone: false }],
      inbox: [],
      error: "",
      note: "",
      noteT: 0,
      shopDone: {},
      waiting: [],
      aimKey: "",
      aimAt: 0,
      playing: false,
    };
    this.net = net;
    this.mode = "lobby";
    this.lobbyRow = 0;
    this.netCpu = Math.min(this.netCpu, MAX_TANKS - 1);
    TankNet.host({
      join: function () {},
      message: function (link, m) {
        self.netPost(net, link, m);
      },
      leave: function (link) {
        self.netPost(net, link, { t: "_leave" });
      },
    }).then(
      function (room) {
        if (self.net !== net) {
          room.close();
          return;
        }
        net.room = room;
        net.code = room.code;
        Sfx.pickup();
      },
      function (err) {
        if (self.net === net) net.error = err.message;
      }
    );
  };

  Game.prototype.joinOnline = function (code) {
    const self = this;
    const net = {
      host: false,
      seat: -1,
      code: code,
      link: null,
      humans: 0,
      cpu: 0,
      inbox: [],
      note: "",
      noteT: 0,
      waiting: [],
      aimKey: "",
      aimAt: 0,
      playing: false,
    };
    this.net = net;
    this.joinError = "";
    this.mode = "join";
    TankNet.join(code, {
      message: function (link, m) {
        self.netPost(net, link, m);
      },
      leave: function (link) {
        self.netPost(net, link, { t: "_leave" });
      },
    }).then(
      function (link) {
        if (self.net !== net) {
          link.close();
          return;
        }
        net.link = link;
        link.send({ t: "hello", v: NET_VERSION });
      },
      function (err) {
        if (self.net !== net) return;
        self.net = null;
        self.joinError = err.message;
        Sfx.deny();
      }
    );
  };

  Game.prototype.leaveOnline = function () {
    const net = this.net;
    this.net = null;
    if (/[?&]room=/.test(location.search)) {
      const q = new URLSearchParams(location.search);
      q.delete("room");
      const rest = q.toString();
      history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
    }
    if (!net) return;
    if (net.room) net.room.close();
    if (net.link) net.link.close();
  };

  Game.prototype.netDown = function (why) {
    this.leaveOnline();
    this.roster = null;
    this.netDownWhy = why;
    this.mode = "netdown";
    Sfx.lose();
  };

  Game.prototype.lobbyNote = function (text) {
    this.net.note = text;
    this.net.noteT = 2.6;
  };

  /** Queue a message; the game loop applies it in order. */
  Game.prototype.netPost = function (net, link, m) {
    if (this.net !== net || !m || typeof m.t !== "string") return;
    net.inbox.push({ link: link, m: m, wait: 0 });
    if (this.onNetActivity) this.onNetActivity();
  };

  /** Host: tell every guest (but `except`). Guest: tell the host. */
  Game.prototype.netSend = function (m, except) {
    const net = this.net;
    if (!net) return;
    if (net.host) {
      if (net.room) net.room.broadcast(m, except);
    } else if (net.link) net.link.send(m);
  };

  Game.prototype.netTick = function (dt) {
    const net = this.net;
    if (net.noteT > 0) net.noteT -= dt;
    while (this.net === net && net.inbox.length) {
      const item = net.inbox[0];
      const done = net.host ? this.hostHandle(item.link, item.m) : this.guestHandle(item.m, item.wait);
      if (!done) {
        // Head-of-line: later messages belong to the turn this one opens.
        item.wait += dt;
        break;
      }
      net.inbox.shift();
    }
  };

  Game.prototype.hostHandle = function (link, m) {
    const net = this.net;
    let seat = -1;
    for (let i = 1; i < net.seats.length; i++) {
      if (net.seats[i].link === link && !net.seats[i].gone) seat = i;
    }
    if (m.t === "hello") {
      if (seat < 0) this.hostAdmit(link, m);
      return true;
    }
    if (seat < 0) return true;
    if (m.t === "_leave") this.hostLost(seat);
    else if (m.t === "aim") this.netAimIn(m, seat, link);
    else if (m.t === "fire") this.hostFireIn(m, seat, link);
    else if (m.t === "buy") {
      const item = SHOP.filter(function (s) {
        return s.id === m.id;
      })[0];
      const r = this.roster && this.roster[seat];
      if (item && r && r.human && (this.mode === "victory" || this.mode === "shop")) applyBuy(r, item);
    } else if (m.t === "shopdone") {
      net.shopDone[seat] = true;
      this.hostShopCheck();
    }
    return true;
  };

  Game.prototype.hostAdmit = function (link, m) {
    const net = this.net;
    let why = "";
    if (m.v !== NET_VERSION) why = "DIFFERENT GAME VERSION · RELOAD";
    else if (net.playing) why = "THAT GAME ALREADY STARTED";
    else if (net.seats.length >= MAX_TANKS) why = "THAT ROOM IS FULL";
    if (why) {
      link.send({ t: "reject", why: why });
      setTimeout(link.close, 400);
      return;
    }
    net.seats.push({ link: link, gone: false });
    this.netCpu = Math.min(this.netCpu, MAX_TANKS - net.seats.length);
    this.lobbyNote("P" + net.seats.length + " JOINED");
    Sfx.pickup();
    this.sendLobby();
  };

  Game.prototype.sendLobby = function () {
    const net = this.net;
    for (let i = 1; i < net.seats.length; i++) {
      const s = net.seats[i];
      if (s.gone) continue;
      s.link.send({
        t: "lobby",
        you: i,
        humans: net.seats.length,
        cpu: this.netCpu,
        diff: this.difficulty,
        code: net.code,
      });
    }
  };

  /** Seat whoever is still here; seat index doubles as roster id. */
  Game.prototype.hostSeatSeries = function () {
    const net = this.net;
    net.seats = net.seats.filter(function (s) {
      return !s.gone;
    });
    if (net.seats.length + this.netCpu < 2) this.netCpu = 1;
    this.netCpu = Math.min(this.netCpu, MAX_TANKS - net.seats.length);
    net.playing = true;
    net.shopDone = {};
    net.waiting = [];
    this.sendLobby();
  };

  Game.prototype.hostLost = function (seat) {
    const net = this.net;
    const label = "P" + (seat + 1);
    Sfx.deny();
    if (!net.playing) {
      net.seats.splice(seat, 1);
      this.lobbyNote(label + " LEFT");
      this.sendLobby();
      return;
    }
    net.seats[seat].gone = true;
    const r = this.roster && this.roster[seat];
    if (!r || !r.human) return;
    r.human = false;
    r.name = label + "-BOT";
    const t = this.tanks.filter(function (tk) {
      return tk.id === seat;
    })[0];
    if (t) {
      t.human = false;
      t.name = r.name;
      t.netAim = null;
    }
    this.banner = label + " LEFT · BOT DRIVES";
    this.bannerT = 1.6;
    this.netSend({ t: "left", id: seat, name: r.name });
    if (t && t.alive && this.mode === "aim" && this.current() === t && !this.ai) {
      const plan = aiChoose(this, t);
      this.ai = { angle: plan.angle, power: plan.power, weapon: plan.weapon, think: 0.4 };
      t.weapon = plan.weapon;
    }
    if (this.mode === "victory" || this.mode === "shop") {
      cpuPurchase(r, this.difficulty);
      net.shopDone[seat] = true;
      this.hostShopCheck();
    }
  };

  /** Next hill starts once every player still here has pressed DONE. */
  Game.prototype.hostShopCheck = function () {
    const net = this.net;
    const waiting = [];
    for (let i = 0; i < net.seats.length; i++) {
      const done = i === 0 ? this.mode === "shop" && this.shopReady : net.seats[i].gone || net.shopDone[i];
      if (!done) waiting.push("P" + (i + 1));
    }
    net.waiting = waiting;
    if (waiting.length) {
      this.netSend({ t: "wait", names: waiting });
      return;
    }
    this.round++;
    this.newBattle();
  };

  Game.prototype.hostVictory = function () {
    this.net.shopDone = {};
    this.shopReady = false;
    for (let i = 0; i < this.roster.length; i++) {
      if (!this.roster[i].human) cpuPurchase(this.roster[i], this.difficulty);
    }
    const s = this.fieldSnapshot();
    s.roster = this.roster.map(packRoster);
    s.winner = this.winner ? this.winner.id : -1;
    s.lines = this.roundLines;
    s.seriesOver = this.seriesOver;
    s.round = this.round;
    this.netSend({ t: "victory", s: s });
  };

  Game.prototype.hostTurn = function () {
    this.clock = SHOT_CLOCK;
    for (let i = 0; i < this.tanks.length; i++) this.tanks[i].netAim = null;
    flushTaps();
    const ai = this.ai ? { angle: this.ai.angle, power: this.ai.power, weapon: this.ai.weapon } : null;
    this.netSend({ t: "turn", seq: this.turnSeq, s: this.fieldSnapshot(), ai: ai });
  };

  Game.prototype.hostFireIn = function (m, seat, link) {
    const t = this.current();
    if (this.mode !== "aim" || m.seq !== this.turnSeq || !t || t.id !== seat || !t.human) return;
    const shot = {
      t: "fire",
      seq: m.seq,
      id: seat,
      a: clamp(+m.a || 0, 0, 180),
      p: clamp(+m.p || 0, 10, maxPowerFor(t)),
      w: clamp(m.w | 0, 0, WEAPONS.length - 1),
      g: !!m.g,
    };
    this.tryFire(shot);
    this.netSend(shot, link);
  };

  Game.prototype.battleSnapshot = function () {
    return {
      roster: this.roster.map(packRoster),
      round: this.round,
      mapIndex: this.mapIndex,
      mapKind: this.mapKind,
      difficulty: this.difficulty,
      height: packHeight(this.height),
      water: this.water,
      wind: this.wind,
      xs: this.tanks.map(function (t) {
        return t.x;
      }),
    };
  };

  Game.prototype.fieldSnapshot = function () {
    return {
      height: packHeight(this.height),
      tanks: this.tanks.map(packTank),
      crates: this.crates.map(function (c) {
        return { x: c.x, y: c.y, vy: c.vy, kind: c.kind, grounded: c.grounded };
      }),
      wind: this.wind,
      windShift: !!this.windShift,
      turn: this.turn,
    };
  };

  Game.prototype.guestHandle = function (m, wait) {
    const net = this.net;
    if (m.t === "_leave") {
      if (this.mode === "join") {
        this.leaveOnline();
        this.joinError = "COULD NOT JOIN";
      } else this.netDown(net.playing ? "HOST LEFT THE GAME" : "HOST CLOSED THE ROOM");
    } else if (m.t === "reject") {
      this.leaveOnline();
      this.mode = "join";
      this.joinError = String(m.why || "COULD NOT JOIN");
      Sfx.deny();
    } else if (m.t === "lobby") {
      net.seat = m.you;
      net.humans = m.humans;
      net.cpu = m.cpu;
      net.code = m.code;
      this.difficulty = m.diff;
      if (this.mode === "join") {
        this.mode = "lobby";
        Sfx.pickup();
      }
    } else if (m.t === "battle") {
      this.applyBattle(m.s);
    } else if (m.t === "turn" || m.t === "victory") {
      // Let this screen finish flying the last shot before jumping ahead.
      if (this.mode !== "netwait" && wait < SYNC_PATIENCE) return false;
      if (m.t === "turn") this.applyTurn(m);
      else this.applyVictory(m.s);
    } else if (m.t === "fire") {
      const t = this.current();
      if (this.mode === "aim" && m.seq === this.turnSeq && t && t.id === m.id) this.tryFire(m);
    } else if (m.t === "aim") {
      this.netAimIn(m, -1, null);
    } else if (m.t === "left") {
      this.guestLost(m);
    } else if (m.t === "wait") {
      net.waiting = m.names || [];
    }
    return true;
  };

  Game.prototype.guestLost = function (m) {
    const r = this.roster && this.roster[m.id];
    if (r) {
      r.human = false;
      r.name = m.name;
    }
    const t = this.tanks.filter(function (tk) {
      return tk.id === m.id;
    })[0];
    if (t) {
      t.human = false;
      t.name = m.name;
      t.netAim = null;
    }
    this.banner = "P" + (m.id + 1) + " LEFT · BOT DRIVES";
    this.bannerT = 1.6;
    Sfx.deny();
  };

  Game.prototype.applyBattle = function (s) {
    this.roster = s.roster.map(unpackRoster);
    this.round = s.round;
    this.mapIndex = s.mapIndex;
    this.difficulty = s.difficulty;
    this.seriesOver = false;
    this.tankCount = this.roster.length;
    this.humanCount = this.roster.filter(function (r) {
      return r.human;
    }).length;
    this.net.playing = true;
    this.net.waiting = [];
    this.shopReady = false;
    const height = new Float32Array(W);
    unpackHeight(height, s.height);
    this.layBattle(s.mapKind, { height: height, water: s.water }, s.wind, s.xs);
  };

  Game.prototype.syncField = function (s) {
    this.shots = [];
    unpackHeight(this.height, s.height);
    for (let i = 0; i < s.tanks.length; i++) {
      const src = s.tanks[i];
      const t = this.tanks[i];
      if (!t || t.id !== src.id) continue;
      if (t.alive && !src.alive) t.death = 0;
      for (let k = 0; k < TANK_SYNC.length; k++) t[TANK_SYNC[k]] = src[TANK_SYNC[k]];
      t.ammo = unpackAmmo(src.ammo);
      t.dropped = true;
      t.netAim = null;
    }
    this.crates = s.crates.map(function (c) {
      return { x: c.x, y: c.y, vy: c.vy, kind: c.kind, grounded: c.grounded, blink: 0 };
    });
    this.wind = s.wind;
    this.windShift = s.windShift;
    this.turn = s.turn;
  };

  Game.prototype.applyTurn = function (m) {
    this.syncField(m.s);
    this.turnSeq = m.seq;
    this.clock = SHOT_CLOCK;
    const cur = this.current();
    this.ai = m.ai ? { angle: m.ai.angle, power: m.ai.power, weapon: m.ai.weapon, think: 0.05 } : null;
    if (this.ai) cur.weapon = this.ai.weapon;
    if (Math.abs(this.wind) >= 4) Sfx.whoosh(this.wind);
    this.announceTurn();
    this.mode = "aim";
    if (cur.human) Sfx.ui();
    flushTaps();
  };

  Game.prototype.applyVictory = function (s) {
    this.syncField(s);
    this.roster = s.roster.map(unpackRoster);
    this.winner = null;
    for (let i = 0; i < this.tanks.length; i++) {
      if (this.tanks[i].id === s.winner) this.winner = this.tanks[i];
    }
    this.roundLines = s.lines || [];
    this.seriesOver = s.seriesOver;
    this.round = s.round;
    this.roundScored = true;
    this.shopReady = false;
    this.net.waiting = [];
    this.mode = "victory";
    this.playVictoryJingle();
    if (this.seriesOver) this.queueShare();
  };

  /** Mirror the shooter's barrel while they aim on their own screen. */
  Game.prototype.netAimIn = function (m, seat, link) {
    const t = this.current();
    if (this.mode !== "aim" || m.seq !== this.turnSeq || !t || !t.human || t.id !== m.id || this.isLocal(t)) return;
    if (this.net.host && t.id !== seat) return;
    t.netAim = { a: +m.a, p: +m.p };
    if (WEAPONS[m.w | 0]) t.weapon = m.w | 0;
    if (this.net.host) this.netSend(m, link);
  };

  Game.prototype.netAimOut = function () {
    const net = this.net;
    const t = this.current();
    const key = Math.round(t.angle * 2) + ":" + Math.round(t.power * 2) + ":" + t.weapon;
    if (key === net.aimKey || this.time - net.aimAt < 0.07) return;
    net.aimKey = key;
    net.aimAt = this.time;
    this.netSend({ t: "aim", seq: this.turnSeq, id: t.id, a: t.angle, p: t.power, w: t.weapon });
  };

  Game.prototype.followNetAim = function (dt) {
    flushTaps();
    const t = this.current();
    if (!t || !t.netAim) return;
    const k = Math.min(1, dt * 12);
    t.angle += (t.netAim.a - t.angle) * k;
    t.power += (t.netAim.p - t.power) * k;
  };

  /** Online turns run on a shot clock so nobody can stall the hill. */
  Game.prototype.netClock = function (dt) {
    const t = this.current();
    if (!t || !t.human || this.ai) return false;
    const before = this.clock;
    this.clock -= dt;
    if (this.isLocal(t)) {
      if (this.clock < 10 && Math.ceil(this.clock) !== Math.ceil(before)) Sfx.beep(520, 0.05, "square", 0.03);
      if (this.clock > 0) return false;
      this.banner = "TIME!";
      this.bannerT = 0.8;
      this.tryFire();
      return true;
    }
    // Host backstop for a player who went quiet: fire their last aim.
    if (this.net.host && this.clock <= -CLOCK_GRACE) {
      if (t.netAim) {
        t.angle = t.netAim.a;
        t.power = t.netAim.p;
      }
      this.banner = t.name + " TIMED OUT";
      this.bannerT = 0.9;
      this.tryFire();
      return true;
    }
    return false;
  };

  Game.prototype.handleLobbyInput = function () {
    if (!this.net.host) {
      flushTaps();
      return;
    }
    if (consume("c") || consume("C")) this.shareInvite();
    if (consume("ArrowUp") || consume("w") || consume("W") || consume("ArrowDown") || consume("s") || consume("S")) {
      this.lobbyRow = 1 - this.lobbyRow;
      Sfx.ui();
    }
    if (consume("ArrowLeft") || consume("a") || consume("A")) this.nudgeLobby(-1);
    if (consume("ArrowRight") || consume("d") || consume("D")) this.nudgeLobby(1);
    if (consume("Enter") || consume(" ") || consume("Spacebar")) this.hostStart();
  };

  Game.prototype.nudgeLobby = function (dir) {
    if (this.lobbyRow === 0) {
      const open = MAX_TANKS - this.net.seats.length;
      this.netCpu = (this.netCpu + dir + open + 1) % (open + 1);
    } else {
      this.difficulty = (this.difficulty + dir + 3) % 3;
    }
    Sfx.ui();
    this.sendLobby();
  };

  Game.prototype.hostStart = function () {
    const net = this.net;
    if (!net.room) return;
    if (net.seats.length + this.netCpu < 2) {
      this.lobbyNote("INVITE A FRIEND OR ADD A CPU");
      Sfx.deny();
      return;
    }
    Sfx.ui();
    this.startSeries();
  };

  /** Phones get the share sheet; everyone else gets the link on the clipboard. */
  Game.prototype.shareInvite = function () {
    const net = this.net;
    if (!net || !net.code) return;
    const self = this;
    const url = TankNet.inviteLink(net.code);
    function note(text) {
      if (self.net === net) self.lobbyNote(text);
    }
    Sfx.ui();
    if (url && navigator.share && window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
      navigator.share({ title: "Tank Wars", text: "Join my Tank Wars hill: " + net.code, url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url || net.code).then(
        function () {
          note(url ? "INVITE LINK COPIED" : "CODE COPIED");
        },
        function () {
          note("COPY BLOCKED · READ OUT THE CODE");
        }
      );
    } else {
      note("COPY BLOCKED · READ OUT THE CODE");
    }
  };

  Game.prototype.lobbyClick = function (p) {
    for (let i = 0; i < this.lobbyBoxes.length; i++) {
      const b = this.lobbyBoxes[i];
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      if (b.id === "share") this.shareInvite();
      else if (b.id === "start") this.hostStart();
      else if (b.id === "leave") this.toTitle();
      else {
        this.lobbyRow = b.id === "cpu" ? 0 : 1;
        this.nudgeLobby(1);
      }
      return;
    }
  };

  Game.prototype.handleJoinInput = function () {
    if (consume("Escape") || consume("Esc")) {
      this.toTitle();
      return;
    }
    if (this.net) {
      flushTaps();
      return;
    }
    while (taps.length) {
      const k = taps.shift();
      if (k === "Backspace" || k === "Delete") {
        this.joinCode = this.joinCode.slice(0, -1);
      } else if (k === "Enter") {
        this.tryJoin();
        break;
      } else if (k.length === 1) {
        const c = TankNet.cleanCode(k);
        if (c && this.joinCode.length < TankNet.CODE_LEN) {
          this.joinCode += c;
          this.joinError = "";
          Sfx.tick();
        }
      }
    }
  };

  Game.prototype.tryJoin = function () {
    if (this.joinCode.length === TankNet.CODE_LEN) {
      Sfx.ui();
      this.joinOnline(this.joinCode);
    } else {
      this.joinError = "THE CODE IS " + TankNet.CODE_LEN + " CHARACTERS";
      Sfx.deny();
    }
  };

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  Game.prototype.drawSky = function (ctx) {
    const g = ctx.createLinearGradient(0, PLAY_TOP, 0, H);
    g.addColorStop(0, "#000055");
    g.addColorStop(0.45, C.blue);
    g.addColorStop(1, "#000033");
    ctx.fillStyle = g;
    ctx.fillRect(0, PLAY_TOP, W, PLAY_H);
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, 1, 1);
    }
    if (this.wind) {
      const dir = this.wind < 0 ? -1 : 1;
      const span = 10 + Math.abs(this.wind) * 2;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = this.wind < 0 ? C.lcyan : C.lmag;
      for (let i = 0; i < 4; i++) {
        // Positive modulo: a negative dividend would push west-wind streaks off-screen for good.
        const wrap = W + 80;
        const travel = (((this.time * 70 + i * 160) % wrap) + wrap) % wrap;
        const x = dir < 0 ? W + 40 - travel : travel - 40;
        ctx.fillRect(x, PLAY_TOP + 30 + i * 36, span, 1);
      }
      ctx.globalAlpha = 1;
    }
  };

  Game.prototype.drawTerrain = function (ctx) {
    const h = this.height;
    for (let x = 0; x < W; x++) {
      const surface = h[x] | 0;
      if (surface >= H) continue;
      const speck = (x * 17 + surface * 3) & 7;
      ctx.fillStyle = speck === 0 ? C.dgray : speck === 3 ? "#995000" : C.brown;
      ctx.fillRect(x, surface, 1, H - surface);
      if (surface + 18 < H) {
        ctx.fillStyle = speck === 2 ? "#553300" : "#774400";
        ctx.fillRect(x, surface + 18, 1, H - surface - 18);
      }
      ctx.fillStyle = speck === 1 ? C.yellow : C.green;
      ctx.fillRect(x, surface, 1, 2);
    }
    if (this.water) {
      const wtr = this.water;
      ctx.fillStyle = C.blue;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(wtr.x0, wtr.y, wtr.x1 - wtr.x0, H - wtr.y);
      ctx.fillStyle = C.lcyan;
      ctx.globalAlpha = 1;
      for (let x = wtr.x0; x < wtr.x1; x += 4) {
        const bob = ((x + Math.floor(this.time * 18)) & 7) < 3 ? 1 : 0;
        ctx.fillRect(x, wtr.y + bob, 3, 2);
      }
    }
  };

  function drawTankSprite(ctx, tank) {
    const x = Math.round(tank.x);
    const y = Math.round(tank.y);

    if (!tank.alive && tank.death > 0 && tank.bits) {
      for (let i = 0; i < tank.bits.length; i++) {
        const b = tank.bits[i];
        ctx.fillStyle = b.c;
        ctx.fillRect(b.x | 0, b.y | 0, 2, 2);
      }
      ctx.fillStyle = C.yellow;
      ctx.globalAlpha = Math.min(1, tank.death);
      ctx.beginPath();
      ctx.arc(tank.x, tank.y - 8, 10 + (1.15 - tank.death) * 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    const col = tank.alive ? (tank.flash > 0 ? C.white : tank.color) : C.dgray;
    const dim = tank.alive ? tank.dim : C.black;

    ctx.save();
    ctx.fillStyle = dim;
    ctx.fillRect(x - 8, y - 4, 16, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x - 7, y - 3, 14, 2);
    ctx.fillStyle = col;
    ctx.fillRect(x - 6, y - 8, 12, 5);
    ctx.fillStyle = dim;
    ctx.fillRect(x - 4, y - 11, 8, 4);
    ctx.fillStyle = C.dgray;
    ctx.fillRect(x - 1, y - 10, 3, 2);

    if (tank.alive && tank.shields > 0) {
      ctx.save();
      ctx.strokeStyle = C.lcyan;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 11, y - 16, 22, 18);
      ctx.restore();
    }

    if (tank.alive) {
      const rad = (tank.angle * Math.PI) / 180;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + Math.cos(rad) * 13, y - 8 - Math.sin(rad) * 13);
      ctx.stroke();
      ctx.fillStyle = C.white;
      ctx.fillRect(Math.round(x + Math.cos(rad) * 13), Math.round(y - 8 - Math.sin(rad) * 13), 2, 2);
    } else {
      ctx.fillStyle = C.red;
      ctx.fillRect(x - 2, y - 14, 2, 6);
      ctx.fillRect(x - 4, y - 16, 6, 2);
    }
    ctx.restore();
  }

  Game.prototype.drawTanks = function (ctx) {
    for (let i = 0; i < this.tanks.length; i++) {
      const t = this.tanks[i];
      if (this.mode === "drop" && !t.dropped && t.y < PLAY_TOP) continue;
      drawTankSprite(ctx, t);
      if (this.net && t.alive && t.id === this.net.seat) {
        const myTurn = this.mode === "aim" && this.current() === t;
        if (myTurn && Math.floor(this.time * 4) % 2) continue;
        ctx.font = 'bold 9px "Courier New", Courier, monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = t.color;
        ctx.fillText("YOU", Math.round(t.x), Math.round(t.y) - 24);
      }
    }
  };

  Game.prototype.drawCrates = function (ctx) {
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      const flash = Math.floor(c.blink * 6) % 2 === 0;
      ctx.fillStyle = flash ? C.yellow : C.brown;
      ctx.fillRect((c.x | 0) - 5, (c.y | 0) - 6, 10, 8);
      ctx.fillStyle = C.black;
      ctx.fillRect((c.x | 0) - 3, (c.y | 0) - 4, 6, 4);
      ctx.fillStyle = flash ? C.lgreen : C.white;
      ctx.fillRect((c.x | 0) - 1, (c.y | 0) - 3, 2, 2);
    }
  };

  Game.prototype.drawShots = function (ctx) {
    for (let i = 0; i < this.shots.length; i++) {
      const p = this.shots[i];
      ctx.fillStyle = C.dgray;
      for (let k = 0; k < p.trail.length; k += 2) {
        if (k % 4 === 0) ctx.fillRect(p.trail[k] | 0, p.trail[k + 1] | 0, 1, 1);
      }
      ctx.fillStyle = p.weapon.kind === "digger" && p.digging ? C.brown : C.yellow;
      ctx.fillRect((p.x | 0) - 1, (p.y | 0) - 1, 3, 3);
      ctx.fillStyle = C.white;
      ctx.fillRect(p.x | 0, p.y | 0, 1, 1);
    }
  };

  Game.prototype.drawExplosions = function (ctx) {
    for (let i = 0; i < this.explosions.length; i++) {
      const e = this.explosions[i];
      const k = e.t / e.life;
      const rad = e.r * (0.35 + 0.75 * k);
      const cols = [C.white, C.yellow, C.lred, C.red];
      ctx.fillStyle = cols[Math.min(cols.length - 1, Math.floor(k * cols.length))];
      ctx.beginPath();
      ctx.arc(e.x, e.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.white;
      ctx.beginPath();
      ctx.arc(e.x, e.y, rad * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  Game.prototype.drawParticles = function (ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const fade = 1 - p.t / p.life;
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x | 0, p.y | 0, p.sz, p.sz);
    }
    ctx.globalAlpha = 1;
  };

  function windGlyph(wind) {
    const n = Math.min(6, Math.max(1, Math.round(Math.abs(wind) / 2)));
    if (wind < 0) return Array(n + 1).join("<") + " " + Math.abs(wind);
    return Math.abs(wind) + " " + Array(n + 1).join(">");
  }

  Game.prototype.drawHud = function (ctx) {
    ctx.fillStyle = C.dgray;
    ctx.fillRect(0, 0, W, HUD);
    ctx.fillStyle = C.gray;
    ctx.fillRect(0, HUD - 1, W, 1);

    ctx.font = '12px "Courier New", Courier, monospace';
    ctx.textBaseline = "middle";

    const tank = this.current();
    const y = HUD / 2;

    if (!tank || MENU_MODES[this.mode]) {
      ctx.fillStyle = C.yellow;
      ctx.textAlign = "left";
      ctx.fillText("TANK WARS", 8, y);
      ctx.fillStyle = C.gray;
      ctx.fillText("SHAREWARE TRIBUTE", 120, y);
      ctx.fillStyle = Sfx.muted ? C.lred : C.lgreen;
      ctx.textAlign = "right";
      ctx.fillText(Sfx.muted ? "MUTE" : "SND", W - 10, y);
      return;
    }

    ctx.textAlign = "left";
    ctx.fillStyle = tank.color;
    ctx.fillText(tank.name, 8, y);

    ctx.fillStyle = C.white;
    ctx.fillText("ANG " + Math.round(tank.angle), 80, y);
    ctx.fillText("POW " + Math.round(tank.power), 154, y);

    const wpn = WEAPONS[tank.weapon];
    const ammo = wpn.ammo === Infinity ? "∞" : String(tank.ammo[tank.weapon]);
    ctx.fillStyle = C.yellow;
    ctx.fillText(wpn.name + " " + ammo, 228, y);

    ctx.fillStyle = this.wind < 0 ? C.lcyan : C.lmag;
    ctx.fillText("WIND " + windGlyph(this.wind), 348, y);

    ctx.fillStyle = C.lgreen;
    ctx.fillText("CREW " + crewCount(tank) + "/" + CREW_MAX, 478, y);

    ctx.fillStyle = tank.color;
    ctx.fillRect(558, 8, Math.round(36 * (tank.hp / MAX_HP)), 12);
    ctx.strokeStyle = C.white;
    ctx.strokeRect(558, 8, 36, 12);

    if (Sfx.muted) {
      ctx.fillStyle = C.lred;
      ctx.font = '10px "Courier New", Courier, monospace';
      ctx.fillText("M", 600, y);
    }
  };

  Game.prototype.drawWeaponBar = function (ctx) {
    if (this.mode === "title" || this.mode === "handoff" || this.mode === "shop") return;
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, H - FOOT, W, FOOT);
    ctx.fillStyle = C.dgray;
    ctx.fillRect(0, H - FOOT, W, 1);

    const tank = this.current();
    this.weaponBoxes = [];
    if (!tank) return;

    const n = WEAPONS.length;
    const gap = 3;
    const bw = Math.floor((W - 8 - gap * (n - 1)) / n);
    const by = H - FOOT + 3;
    const bh = 18;
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (let i = 0; i < n; i++) {
      const w = WEAPONS[i];
      const x = 4 + i * (bw + gap);
      const ammo = w.ammo === Infinity ? "∞" : String(tank.ammo[i]);
      const empty = w.ammo !== Infinity && tank.ammo[i] <= 0;
      const sel = tank.weapon === i;
      if (sel) {
        ctx.fillStyle = tank.color;
        ctx.fillRect(x, by, bw, bh);
        ctx.fillStyle = C.black;
      } else {
        ctx.fillStyle = empty ? "#2a2a2a" : "#3a3a3a";
        ctx.fillRect(x, by, bw, bh);
        ctx.fillStyle = empty ? C.dgray : C.white;
      }
      ctx.fillText(i + 1 + " " + w.name + " " + ammo, x + bw / 2, by + bh / 2);
      this.weaponBoxes.push({ i: i, x: x, w: bw, y: by, h: bh });
    }

    const chosen = WEAPONS[tank.weapon];
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = tank.color;
    ctx.fillText(chosen.blurb || chosen.name, 6, H - 10);

    ctx.textAlign = "right";
    let status = MAP_LABEL[this.mapKind] + " R" + this.round + "  ";
    for (let i = 0; i < this.roster.length; i++) status += this.roster[i].wins + (i < this.roster.length - 1 ? "-" : "");
    const purse = this.roster[tank.id];
    status += "  $" + (purse ? purse.cash : 0);
    status += "  SH" + tank.shields + " GD" + tank.guidance;
    ctx.fillStyle = C.gray;
    ctx.fillText(status, W - 6, H - 10);
  };

  Game.prototype.drawAimGuide = function (ctx) {
    if (this.mode !== "aim") return;
    const tank = this.current();
    if (!this.isLocal(tank)) return;
    const rad = (tank.angle * Math.PI) / 180;
    const m = muzzle(tank);
    ctx.strokeStyle = tank.color;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + Math.cos(rad) * 22, m.y - Math.sin(rad) * 22);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const pts = previewArc(tank, this.wind, this.height, this.water);
    const full = this.previewOn && tank.guidance > 0;
    const limit = full ? pts.length : Math.min(pts.length, 8);
    for (let i = 0; i < limit; i += 2) {
      ctx.globalAlpha = full ? 0.45 + (i / pts.length) * 0.5 : 0.35;
      ctx.fillStyle = full ? C.white : tank.color;
      ctx.fillRect((pts[i] | 0) - 1, (pts[i + 1] | 0) - 1, full ? 3 : 2, full ? 3 : 2);
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawBanner = function (ctx) {
    if (this.bannerT <= 0 || !this.banner || this.mode === "title") return;
    const flash = Math.floor(this.time * 8) % 2 === 0;
    const w = 240;
    const h = 28;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(W / 2 - w / 2, PLAY_TOP + 16, w, h);
    ctx.strokeStyle = flash ? C.yellow : C.white;
    ctx.strokeRect(W / 2 - w / 2 + 2, PLAY_TOP + 18, w - 4, h - 4);
    ctx.font = 'bold 16px "Courier New", Courier, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = flash ? C.yellow : C.white;
    ctx.fillText(this.banner, W / 2, PLAY_TOP + 30);
  };

  Game.prototype.drawMenuPanel = function (ctx) {
    if (!this.height) this.height = generateHeightmap(W, Math.random);
    this.drawSky(ctx);
    this.drawTerrain(ctx);
    ctx.fillStyle = "rgba(0,0,0,0.66)";
    ctx.fillRect(70, 44, 500, 312);
    ctx.strokeStyle = C.yellow;
    ctx.strokeRect(74, 48, 492, 304);
  };

  Game.prototype.drawTitle = function (ctx) {
    this.drawMenuPanel(ctx);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = C.yellow;
    ctx.font = 'bold 36px "Courier New", Courier, monospace';
    ctx.fillText("TANK WARS", W / 2, 60);
    ctx.fillStyle = C.lcyan;
    ctx.font = '14px "Courier New", Courier, monospace';
    ctx.fillText("2.5    a shareware tribute", W / 2, 102);
    ctx.fillStyle = C.gray;
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.fillText("Inspired by Kenny Morse, 1990  ·  original graphics", W / 2, 124);

    const modeVal = { cpu: "1P vs CPU", hotseat: "HOTSEAT", online: "ONLINE" }[this.playMode];
    let row1;
    if (this.playMode === "cpu") {
      row1 = { label: "DIFFICULTY", value: DIFF_LABELS[this.difficulty], hint: DIFF_NAMES[this.difficulty] };
    } else if (this.playMode === "online") {
      const hosting = this.onlineRole === "host";
      row1 = { label: "ROOM", value: hosting ? "HOST" : "JOIN", hint: hosting ? "get a code" : "use their code" };
    } else {
      row1 = { label: "PLAYERS", value: String(this.hotseatPlayers), hint: "same keyboard" };
    }
    let modeHint = "2–4 humans";
    if (this.playMode === "online") modeHint = "invite friends";
    else if (this.playMode === "cpu") modeHint = this.cpuCount === 1 ? "you vs AI" : "free-for-all";
    const rows = [{ label: "MODE", value: modeVal, hint: modeHint }, row1];
    if (this.playMode === "cpu") {
      rows.push({
        label: "CPU TANKS",
        value: String(this.cpuCount),
        hint: this.cpuCount + 1 + " tanks on the hill",
      });
    }
    rows.push({ label: "SOUND", value: Sfx.muted ? "OFF" : "ON", hint: "M mutes anytime" });

    ctx.font = '14px "Courier New", Courier, monospace';
    ctx.textAlign = "left";
    const rowGap = rows.length > 3 ? 24 : 30;
    for (let i = 0; i < rows.length; i++) {
      const y = 152 + i * rowGap;
      const sel = this.titleRow === i;
      ctx.fillStyle = sel ? C.yellow : C.gray;
      ctx.fillText((sel ? "> " : "  ") + rows[i].label, 130, y);
      ctx.fillStyle = sel ? C.white : C.lcyan;
      ctx.fillText(rows[i].value, 280, y);
      ctx.fillStyle = C.dgray;
      ctx.fillText(rows[i].hint, 400, y);
    }

    ctx.fillStyle = C.white;
    ctx.font = '12px "Courier New", Courier, monospace';
    ctx.textAlign = "center";
    ctx.fillText("← → change    ↑ ↓ select row    ENTER start", W / 2, 258);
    ctx.fillStyle = C.gray;
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.fillText("Drag to aim. A short arc is free.  A clean hit ends a tank.", W / 2, 278);
    ctx.fillText("A/D angle  W/S power  SPACE fire  1-6 weapons  T arc  M mute", W / 2, 298);
    ctx.fillStyle = C.dgray;
    ctx.fillText("Kills pay. Shop between hills. Water swallows shells.", W / 2, 322);
  };

  Game.prototype.drawVictory = function (ctx) {
    const extra = this.seriesOver && !this.demo ? 34 : 0;
    const tall = 168 + this.roundLines.length * 16 + extra;
    const top = Math.max(70, 200 - tall / 2);
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(90, top, 460, tall);
    ctx.strokeStyle = C.yellow;
    ctx.strokeRect(94, top + 4, 452, tall - 8);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = 'bold 26px "Courier New", Courier, monospace';
    const champ = this.seriesOver ? seriesChamp(this.roster) : null;
    if (this.seriesOver && champ) {
      ctx.fillStyle = champ.color;
      ctx.fillText(champ.name + " TAKES THE SERIES", W / 2, top + 32);
    } else if (this.seriesOver) {
      ctx.fillStyle = C.gray;
      ctx.fillText("SERIES DRAWN", W / 2, top + 32);
    } else if (this.winner) {
      ctx.fillStyle = this.winner.color;
      ctx.fillText(this.winner.name + " TAKES THE HILL", W / 2, top + 32);
    } else {
      ctx.fillStyle = C.gray;
      ctx.fillText("DRAWN HILL", W / 2, top + 32);
    }
    ctx.font = '12px "Courier New", Courier, monospace';
    let y = top + 58;
    for (let i = 0; i < this.roundLines.length; i++) {
      ctx.fillStyle = this.roundLines[i].color;
      ctx.fillText(this.roundLines[i].name + "  " + this.roundLines[i].text, W / 2, y);
      y += 16;
    }
    ctx.font = '13px "Courier New", Courier, monospace';
    let score = "SERIES  ";
    for (let i = 0; i < this.roster.length; i++) {
      score += this.roster[i].name + " " + this.roster[i].wins + "   ";
    }
    ctx.fillStyle = C.white;
    ctx.fillText(score, W / 2, top + tall - 48 - extra);
    this.shareBox = null;
    if (extra) {
      const box = { x: W / 2 - 74, y: top + tall - 74, w: 148, h: 24 };
      ctx.fillStyle = C.lgreen;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = C.black;
      ctx.font = 'bold 13px "Courier New", Courier, monospace';
      ctx.fillText("SHARE RESULT", W / 2, box.y + box.h / 2 + 1);
      this.shareBox = box;
    }
    ctx.fillStyle = C.white;
    ctx.font = '13px "Courier New", Courier, monospace';
    let keysLine = this.seriesOver ? "ENTER  rematch   S  share   ESC  title" : "ENTER  shop     ESC  title";
    if (this.net && !this.seriesOver) keysLine = "ENTER  shop     ESC  leave";
    else if (this.net && this.net.host) keysLine = "ENTER  rematch   S  share   ESC  close";
    else if (this.net) keysLine = "S  share   ESC  leave   HOST CALLS THE REMATCH";
    if (this.demo) keysLine = "";
    ctx.fillText(keysLine, W / 2, top + tall - 26);
  };

  Game.prototype.drawHandoff = function (ctx) {
    const tank = this.current();
    ctx.fillStyle = "#000033";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = tank ? tank.color : C.yellow;
    ctx.strokeRect(80, 90, 480, 200);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = 'bold 28px "Courier New", Courier, monospace';
    ctx.fillStyle = tank ? tank.color : C.white;
    ctx.fillText((tank ? tank.name : "NEXT") + "  —  LOOK AWAY", W / 2, 150);
    ctx.font = '14px "Courier New", Courier, monospace';
    ctx.fillStyle = C.yellow;
    ctx.fillText("pass the keyboard", W / 2, 190);
    ctx.fillStyle = C.white;
    ctx.fillText("ENTER when only you can see the screen", W / 2, 230);
    ctx.fillStyle = C.dgray;
    ctx.font = '12px "Courier New", Courier, monospace';
    ctx.fillText(MAP_LABEL[this.mapKind] + "   round " + this.round, W / 2, 262);
  };

  Game.prototype.drawShop = function (ctx) {
    this.drawSky(ctx);
    if (this.height) this.drawTerrain(ctx);
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(36, 36, 568, 328);
    ctx.strokeStyle = C.yellow;
    ctx.strokeRect(40, 40, 560, 320);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = C.yellow;
    ctx.font = 'bold 20px "Courier New", Courier, monospace';
    ctx.fillText("SUPPLY  ·  ROUND " + this.round + " CLEARED", 56, 52);
    ctx.font = '12px "Courier New", Courier, monospace';
    const labels = this.roster.map(function (r) {
      return r.name + " $" + r.cash + "  W" + r.wins;
    });
    const widthAll = labels.reduce(function (s, l) {
      return s + ctx.measureText(l).width + 16;
    }, 0);
    if (widthAll > 536) ctx.font = '10px "Courier New", Courier, monospace';
    let lx = 56;
    for (let i = 0; i < this.roster.length; i++) {
      ctx.fillStyle = this.roster[i].color;
      ctx.fillText(labels[i], lx, 80);
      lx += ctx.measureText(labels[i]).width + 12;
    }
    const buyer = this.roster[this.shopPlayer];
    const ready = !!(this.net && this.shopReady);
    ctx.fillStyle = buyer ? buyer.color : C.white;
    ctx.font = 'bold 16px "Courier New", Courier, monospace';
    ctx.fillText(buyer ? buyer.name + (ready ? " READY" : " BUYING") : "", 56, 108);
    let note = this.shopNote;
    if (ready) {
      const waiting = this.net.waiting;
      note = waiting.length ? "WAITING FOR " + waiting.join(" ") : "WAITING FOR THE OTHERS";
    }
    if (note) {
      ctx.fillStyle = ready ? C.yellow : C.lgreen;
      ctx.font = '12px "Courier New", Courier, monospace';
      ctx.fillText(note, 250, 112);
    }
    ctx.font = '14px "Courier New", Courier, monospace';
    this.shopBoxes = [];
    for (let i = 0; i < SHOP.length; i++) {
      const item = SHOP[i];
      const y = 140 + i * 26;
      const sel = this.shopCursor === i && buyer && buyer.human && this.shopCpu <= 0 && !ready;
      ctx.fillStyle = sel ? C.yellow : C.gray;
      const have = stockLabel(buyer, item.id);
      ctx.fillText((sel ? "> " : "  ") + item.name, 64, y);
      ctx.fillStyle = sel ? C.white : C.lcyan;
      ctx.fillText("$" + item.cost, 280, y);
      ctx.fillStyle = C.dgray;
      ctx.fillText(item.blurb + "   have " + have, 350, y);
      this.shopBoxes.push({ i: i, y: y, h: 24 });
    }
    const doneY = 140 + SHOP.length * 26 + 6;
    const doneSel = this.shopCursor >= SHOP.length && buyer && buyer.human && this.shopCpu <= 0 && !ready;
    ctx.fillStyle = doneSel ? C.yellow : C.white;
    ctx.fillText((doneSel ? "> " : "  ") + (this.net ? "DONE  —  ready" : "DONE  —  next tank"), 64, doneY);
    this.shopBoxes.push({ i: SHOP.length, y: doneY, h: 24 });
    ctx.fillStyle = C.dgray;
    ctx.font = '11px "Courier New", Courier, monospace';
    const quit = this.net ? "ESC leaves the game" : "ESC quits the series";
    ctx.fillText("↑↓ pick    ENTER buy    N done    " + quit, 56, 336);
  };

  Game.prototype.drawLobby = function (ctx) {
    const net = this.net;
    this.drawMenuPanel(ctx);
    this.lobbyBoxes = [];
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = C.yellow;
    ctx.font = 'bold 22px "Courier New", Courier, monospace';
    ctx.fillText(net.host ? "ONLINE ROOM" : "JOINED ROOM", W / 2, 58);

    if (net.error) {
      ctx.fillStyle = C.lred;
      ctx.font = 'bold 16px "Courier New", Courier, monospace';
      ctx.fillText(net.error, W / 2, 150);
      ctx.fillStyle = C.gray;
      ctx.font = '12px "Courier New", Courier, monospace';
      ctx.fillText("Online play needs the internet. Local modes still work.", W / 2, 184);
      ctx.fillStyle = C.white;
      ctx.fillText("ESC  back", W / 2, 300);
      return;
    }
    if (!net.code) {
      ctx.fillStyle = Math.floor(this.time * 3) % 2 ? C.yellow : C.white;
      ctx.font = 'bold 16px "Courier New", Courier, monospace';
      ctx.fillText("OPENING ROOM…", W / 2, 150);
      ctx.fillStyle = C.white;
      ctx.font = '12px "Courier New", Courier, monospace';
      ctx.fillText("ESC  back", W / 2, 300);
      return;
    }

    ctx.fillStyle = C.gray;
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.fillText("INVITE CODE", W / 2, 86);
    ctx.fillStyle = C.lcyan;
    ctx.font = 'bold 40px "Courier New", Courier, monospace';
    for (let i = 0; i < net.code.length; i++) {
      ctx.fillText(net.code[i], W / 2 + (i - (net.code.length - 1) / 2) * 34, 100);
    }
    const url = TankNet.inviteLink(net.code);
    ctx.font = '11px "Courier New", Courier, monospace';
    if (net.noteT > 0) {
      ctx.fillStyle = C.lgreen;
      ctx.fillText(net.note, W / 2, 148);
    } else if (net.host) {
      ctx.fillStyle = C.dgray;
      ctx.fillText(url ? (url.length > 64 ? "…" + url.slice(-63) : url) : "read this code to a friend", W / 2, 148);
    }

    const humans = net.host ? net.seats.length : net.humans;
    const cpu = net.host ? this.netCpu : net.cpu;
    ctx.textAlign = "left";
    ctx.font = '13px "Courier New", Courier, monospace';
    for (let i = 0; i < MAX_TANKS; i++) {
      const y = 170 + i * 17;
      const filled = i < humans + cpu;
      ctx.fillStyle = filled ? PLAYER_COLORS[i] : C.dgray;
      ctx.fillText(filled ? seatName(i, humans, cpu, this.difficulty) : "--", 170, y);
      let status = "open seat";
      if (i === 0) status = "host";
      else if (i < humans) status = "ready";
      else if (filled) status = "cpu · " + DIFF_LABELS[this.difficulty].toLowerCase();
      if (i === net.seat) status += "  (you)";
      ctx.fillStyle = filled ? C.white : C.dgray;
      ctx.fillText(status, 290, y);
    }

    if (net.host) {
      const rows = [
        { id: "cpu", label: "CPU TANKS", value: String(this.netCpu) },
        { id: "diff", label: "DIFFICULTY", value: DIFF_LABELS[this.difficulty] },
      ];
      ctx.font = '13px "Courier New", Courier, monospace';
      for (let i = 0; i < rows.length; i++) {
        const y = 246 + i * 18;
        const sel = this.lobbyRow === i;
        ctx.fillStyle = sel ? C.yellow : C.gray;
        ctx.fillText((sel ? "> " : "  ") + rows[i].label, 170, y);
        ctx.fillStyle = sel ? C.white : C.lcyan;
        ctx.fillText("< " + rows[i].value + " >", 330, y);
        this.lobbyBoxes.push({ id: rows[i].id, x: 160, y: y - 2, w: 320, h: 17 });
      }
      this.drawLobbyButton(ctx, "share", url ? "COPY LINK" : "COPY CODE", 196, C.lcyan);
      const canStart = humans + cpu >= 2;
      this.drawLobbyButton(ctx, "start", "START", 330, canStart ? C.lgreen : C.dgray);
      ctx.textAlign = "center";
      ctx.fillStyle = C.gray;
      ctx.font = '11px "Courier New", Courier, monospace';
      ctx.fillText("↑ ↓ ← → set CPU    C copy link    ENTER start    ESC close", W / 2, 330);
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = Math.floor(this.time * 2) % 2 ? C.yellow : C.white;
      ctx.font = 'bold 13px "Courier New", Courier, monospace';
      ctx.fillText("WAITING FOR THE HOST TO START", W / 2, 254);
      this.drawLobbyButton(ctx, "leave", "LEAVE", 263, C.lred);
      ctx.fillStyle = C.gray;
      ctx.font = '11px "Courier New", Courier, monospace';
      ctx.fillText("ESC  leave", W / 2, 330);
    }
  };

  Game.prototype.drawLobbyButton = function (ctx, id, label, x, color) {
    const y = 290;
    const w = 114;
    const h = 22;
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = color;
    ctx.font = 'bold 12px "Courier New", Courier, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    this.lobbyBoxes.push({ id: id, x: x, y: y, w: w, h: h });
  };

  Game.prototype.drawJoin = function (ctx) {
    this.drawMenuPanel(ctx);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = C.yellow;
    ctx.font = 'bold 22px "Courier New", Courier, monospace';
    ctx.fillText("JOIN A GAME", W / 2, 58);
    ctx.fillStyle = C.white;
    ctx.font = '13px "Courier New", Courier, monospace';
    ctx.fillText("TYPE THE INVITE CODE", W / 2, 96);

    const n = TankNet.CODE_LEN;
    const bw = 44;
    const gap = 10;
    const x0 = W / 2 - (n * bw + (n - 1) * gap) / 2;
    ctx.font = 'bold 32px "Courier New", Courier, monospace';
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (bw + gap);
      const ch = this.joinCode[i] || "";
      const cursor = !this.net && i === this.joinCode.length && Math.floor(this.time * 3) % 2 === 0;
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(x, 124, bw, 48);
      ctx.strokeStyle = cursor ? C.yellow : ch ? C.lcyan : C.dgray;
      ctx.strokeRect(x + 0.5, 124.5, bw - 1, 47);
      ctx.fillStyle = C.lcyan;
      ctx.fillText(ch, x + bw / 2, 150);
    }

    ctx.textBaseline = "top";
    ctx.font = 'bold 13px "Courier New", Courier, monospace';
    if (this.net) {
      ctx.fillStyle = Math.floor(this.time * 3) % 2 ? C.yellow : C.white;
      ctx.fillText(this.net.link ? "JOINING ROOM…" : "CONNECTING…", W / 2, 192);
    } else if (this.joinError) {
      ctx.fillStyle = C.lred;
      ctx.fillText(this.joinError, W / 2, 192);
    }
    ctx.fillStyle = C.gray;
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.fillText("Paste works too, code or whole invite link.", W / 2, 226);
    ctx.fillText("A friend's link drops you straight in.", W / 2, 242);
    ctx.fillStyle = C.white;
    ctx.font = '12px "Courier New", Courier, monospace';
    ctx.fillText("ENTER  join     BACKSPACE  fix     ESC  back", W / 2, 300);
  };

  Game.prototype.drawNetDown = function (ctx) {
    this.drawMenuPanel(ctx);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.lred;
    ctx.font = 'bold 22px "Courier New", Courier, monospace';
    ctx.fillText(this.netDownWhy || "CONNECTION LOST", W / 2, 160);
    ctx.fillStyle = C.gray;
    ctx.font = '12px "Courier New", Courier, monospace';
    ctx.fillText("The series ends here.", W / 2, 196);
    ctx.fillStyle = C.white;
    ctx.font = '13px "Courier New", Courier, monospace';
    ctx.fillText("ENTER  back to title", W / 2, 260);
  };

  /** Shot clock and sync state, top-right of the field. */
  Game.prototype.drawNetStatus = function (ctx) {
    let text = "";
    let color = C.gray;
    const cur = this.current();
    if (this.mode === "aim" && cur && cur.human && !this.ai) {
      const secs = Math.max(0, Math.ceil(this.clock));
      const mine = this.isLocal(cur);
      text = (mine ? "YOUR SHOT " : cur.name + " AIMING ") + "0:" + (secs < 10 ? "0" : "") + secs;
      color = secs <= 10 && Math.floor(this.time * 4) % 2 ? C.lred : cur.color;
    } else if (this.mode === "netwait" && this.waitT > 1.5) {
      text = "WAITING FOR HOST…";
    }
    if (!text) return;
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, W - 6, PLAY_TOP + 9);
  };

  function stockLabel(roster, id) {
    if (!roster) return "0";
    if (id === "shield") return String(roster.shields);
    if (id === "guide") return String(roster.guidance);
    return String(roster.ammo[weaponIndex(id)] || 0);
  }

  Game.prototype.drawCallouts = function (ctx) {
    ctx.font = 'bold 12px "Courier New", Courier, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < this.callouts.length; i++) {
      const c = this.callouts[i];
      ctx.globalAlpha = 1 - c.t / c.life;
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.x, c.y);
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.draw = function () {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.clearRect(0, 0, W, H);

    if (MENU_MODES[this.mode]) {
      if (this.mode === "title") this.drawTitle(ctx);
      else if (this.mode === "lobby") this.drawLobby(ctx);
      else if (this.mode === "join") this.drawJoin(ctx);
      else this.drawNetDown(ctx);
      this.drawHud(ctx);
      return;
    }

    if (this.mode === "handoff") {
      this.drawHandoff(ctx);
      return;
    }

    if (this.mode === "shop") {
      this.drawShop(ctx);
      return;
    }

    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, PLAY_TOP, W, H - PLAY_TOP - FOOT);
    ctx.clip();
    ctx.translate(sx, sy);
    this.drawSky(ctx);
    this.drawTerrain(ctx);
    this.drawCrates(ctx);
    this.drawTanks(ctx);
    this.drawAimGuide(ctx);
    this.drawShots(ctx);
    this.drawExplosions(ctx);
    this.drawParticles(ctx);
    this.drawCallouts(ctx);
    ctx.restore();
    // The share card's photo: playfield only, before the HUD and banners.
    if (this.captureNext) {
      this.captureNext = false;
      this.grabFrame();
    }

    this.drawHud(ctx);
    this.drawWeaponBar(ctx);
    if (this.net) this.drawNetStatus(ctx);
    this.drawBanner(ctx);
    if (this.mode === "victory") this.drawVictory(ctx);
  };

  // ---------------------------------------------------------------------------
  // Sharing — when a series ends: a 1200x675 card built from a photo of the
  // last hill's final blow, and a dialog to send it somewhere.
  // ---------------------------------------------------------------------------
  const CARD_W = 1200;
  const CARD_H = 675;
  const CARD_FONT = '"Courier New", Courier, monospace';

  /** The front page, which is what a stranger should land on. */
  function siteUrl() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return "";
    return location.origin + location.pathname.replace(/[^/]*$/, "");
  }

  function listNames(names) {
    if (names.length < 2) return names.join("");
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  Game.prototype.grabFrame = function () {
    if (this.demo) return;
    if (!this.finalFrame) {
      this.finalFrame = document.createElement("canvas");
      this.finalFrame.width = W;
      this.finalFrame.height = H;
    }
    this.finalFrame.getContext("2d").drawImage(this.canvas, 0, 0);
    this.finalFrameRound = this.round;
  };

  Game.prototype.queueShare = function () {
    if (this.demo) return;
    // No final blow caught on this hill: use the aftermath instead.
    if (this.finalFrameRound !== this.round) this.grabFrame();
    this.shareT = 1.3;
  };

  /** Result, score, and the words to post, told from this screen's player. */
  Game.prototype.shareInfo = function () {
    const roster = this.roster;
    const rows = roster.slice().sort(function (a, b) {
      return b.wins - a.wins || (b.kills || 0) - (a.kills || 0) || a.id - b.id;
    });
    const champ = seriesChamp(roster);
    let me = null;
    if (this.net) me = roster[this.net.seat] || null;
    else if (this.playMode === "cpu") me = roster[0];
    const score = rows
      .map(function (r) {
        return r.wins;
      })
      .join("-");
    let mode = "HOTSEAT · " + roster.length + " PLAYERS";
    if (this.net) mode = "ONLINE · " + roster.length + " TANKS";
    else if (this.playMode === "cpu") mode = "1P VS CPU · " + DIFF_LABELS[this.difficulty];
    let headline = champ ? champ.name + " TAKES THE SERIES" : "SERIES DRAWN";
    let text;
    if (!champ) {
      text = "A drawn series of Tank Wars, " + score + ". Nobody could read the wind.";
    } else if (me && champ.id === me.id) {
      headline = "YOU TAKE THE SERIES";
      const foes = roster
        .filter(function (r) {
          return r.id !== me.id;
        })
        .map(function (r) {
          return r.name;
        });
      const kills = me.kills || 0;
      let tally = kills + (kills === 1 ? " kill" : " kills");
      if (me.dmg) tally += ", " + me.dmg + " damage";
      text =
        "I won a Tank Wars series " + score + " against " + listNames(foes) + ": " + tally + ". Think you can read the wind?";
    } else if (me) {
      text = champ.name + " beat me " + score + " in Tank Wars. I want a rematch.";
    } else {
      text = champ.name + " won a " + roster.length + "-player hotseat series of Tank Wars, " + score + ".";
    }
    return {
      rows: rows,
      me: me,
      score: score,
      mode: mode,
      headline: headline,
      text: text,
      alt: "Tank Wars result card: " + headline + ", " + score + ", " + mode + ", over the final shot of the series.",
    };
  };

  function wrapLines(ctx, text, maxW) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
      const next = line ? line + " " + words[i] : words[i];
      if (line && ctx.measureText(next).width > maxW) {
        lines.push(line);
        line = words[i];
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function renderShareCard(frame, info, url) {
    const c = document.createElement("canvas");
    c.width = CARD_W;
    c.height = CARD_H;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.black;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // The battlefield (playfield only, no HUD) blown up with hard pixels.
    const bar = 64;
    if (frame) ctx.drawImage(frame, 0, PLAY_TOP, W, H - PLAY_TOP - FOOT, 0, bar, CARD_W, CARD_H - bar);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    for (let y = bar; y < CARD_H; y += 3) ctx.fillRect(0, y, CARD_W, 1);

    ctx.fillStyle = C.blue;
    ctx.fillRect(0, 0, CARD_W, bar);
    ctx.fillStyle = C.white;
    ctx.fillRect(0, bar - 8, CARD_W, 2);
    ctx.fillRect(0, bar - 4, CARD_W, 2);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "bold 36px " + CARD_FONT;
    ctx.fillStyle = C.yellow;
    ctx.fillText("TANK WARS", 30, 28);
    ctx.textAlign = "right";
    ctx.font = "bold 22px " + CARD_FONT;
    ctx.fillStyle = C.lcyan;
    ctx.fillText(info.mode, CARD_W - 30, 29);

    // Result window, text-mode style.
    const x = 40;
    const y = 104;
    const w = 580;
    ctx.font = "bold 42px " + CARD_FONT;
    const head = wrapLines(ctx, info.headline, w - 72);
    const h = 70 + head.length * 46 + 70 + 34 + info.rows.length * 34 + 22;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x + 14, y + 14, w, h);
    ctx.fillStyle = C.blue;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 11, y + 11, w - 22, h - 22);
    ctx.strokeRect(x + 17, y + 17, w - 34, h - 34);
    ctx.font = "bold 20px " + CARD_FONT;
    ctx.textAlign = "center";
    const title = " SERIES OVER ";
    const tw = ctx.measureText(title).width;
    ctx.fillStyle = C.blue;
    ctx.fillRect(x + w / 2 - tw / 2, y + 4, tw, 22);
    ctx.fillStyle = C.white;
    ctx.fillText(title, x + w / 2, y + 15);

    let cy = y + 62;
    ctx.textAlign = "left";
    ctx.font = "bold 42px " + CARD_FONT;
    ctx.fillStyle = C.yellow;
    for (let i = 0; i < head.length; i++) {
      ctx.fillText(head[i], x + 36, cy);
      cy += 46;
    }
    ctx.font = "bold 56px " + CARD_FONT;
    ctx.fillStyle = C.white;
    ctx.fillText(info.score, x + 36, cy + 12);
    cy += 70;

    const cols = [
      { label: "HILLS", key: "wins", right: x + 300 },
      { label: "KILLS", key: "kills", right: x + 380 },
      { label: "DMG", key: "dmg", right: x + 456 },
      { label: "SHOTS", key: "shots", right: x + 544 },
    ];
    ctx.font = "bold 18px " + CARD_FONT;
    ctx.fillStyle = C.gray;
    ctx.fillText("TANK", x + 36, cy);
    ctx.textAlign = "right";
    for (let i = 0; i < cols.length; i++) ctx.fillText(cols[i].label, cols[i].right, cy);
    cy += 34;
    ctx.font = "bold 24px " + CARD_FONT;
    for (let i = 0; i < info.rows.length; i++) {
      const r = info.rows[i];
      const mine = info.me && r.id === info.me.id;
      if (mine) {
        ctx.fillStyle = C.cyan;
        ctx.fillRect(x + 26, cy - 15, w - 52, 30);
      }
      ctx.textAlign = "left";
      ctx.fillStyle = mine ? C.black : r.color;
      ctx.fillText(r.name + (mine ? " (YOU)" : ""), x + 36, cy);
      ctx.textAlign = "right";
      ctx.fillStyle = mine ? C.black : C.white;
      for (let k = 0; k < cols.length; k++) ctx.fillText(String(r[cols[k].key] || 0), cols[k].right, cy);
      cy += 34;
    }

    const where = url ? "PLAY FREE AT " + url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "TANK WARS · A 1990 TRIBUTE";
    ctx.font = "bold 22px " + CARD_FONT;
    ctx.textAlign = "right";
    const ww = ctx.measureText(where).width;
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(CARD_W - ww - 56, CARD_H - 58, ww + 32, 38);
    ctx.fillStyle = C.yellow;
    ctx.fillText(where, CARD_W - 40, CARD_H - 38);
    return c;
  }

  const Share = {
    dialog: null,
    game: null,
    blob: null,
    file: null,
    imgUrl: "",
    text: "",
    url: "",

    isOpen: function () {
      return !!(this.dialog && this.dialog.open);
    },

    build: function () {
      const self = this;
      const d = document.createElement("dialog");
      d.className = "share";
      d.setAttribute("aria-labelledby", "share-title");
      d.innerHTML =
        '<p class="share-title" id="share-title" tabindex="-1">SERIES OVER</p>' +
        '<img class="share-card" width="1200" height="675" alt="" />' +
        '<p class="share-text"></p>' +
        '<div class="share-row">' +
        '<button type="button" data-act="native" hidden>SHARE…</button>' +
        '<button type="button" data-act="save">SAVE IMAGE</button>' +
        '<button type="button" data-act="copy">COPY IMAGE</button>' +
        "</div>" +
        '<p class="share-links">POST TO' +
        ' <a data-net="x" target="_blank" rel="noopener">X</a>' +
        ' <a data-net="facebook" target="_blank" rel="noopener">FACEBOOK</a>' +
        ' <a data-net="whatsapp" target="_blank" rel="noopener">WHATSAPP</a>' +
        ' <a data-net="reddit" target="_blank" rel="noopener">REDDIT</a></p>' +
        '<p class="share-tip">Links can\'t carry the picture. Save or copy it first, then attach it to your post.</p>' +
        '<p class="share-note" role="status"></p>' +
        '<div class="share-row share-foot">' +
        '<button type="button" data-act="rematch">REMATCH</button>' +
        '<button type="button" data-act="close">CLOSE</button>' +
        "</div>";
      document.body.appendChild(d);
      d.addEventListener("click", function (e) {
        const b = e.target.closest("[data-act]");
        if (b) self.act(b.dataset.act);
      });
      d.addEventListener("close", function () {
        flushTaps();
        if (self.game) self.game.canvas.focus();
      });
      this.dialog = d;
    },

    note: function (text) {
      this.dialog.querySelector(".share-note").textContent = text;
    },

    open: function (game) {
      if (!window.HTMLDialogElement) return;
      if (!this.dialog) this.build();
      const self = this;
      const d = this.dialog;
      const info = game.shareInfo();
      const url = siteUrl();
      const full = url ? info.text + " " + url : info.text;
      game.shareT = 0;
      flushTaps();
      this.game = game;
      this.text = info.text;
      this.url = url;
      this.blob = null;
      this.file = null;
      this.note("");
      d.querySelector(".share-text").textContent = full;
      const img = d.querySelector(".share-card");
      img.alt = info.alt;
      d.querySelector('[data-act="native"]').hidden = true;
      d.querySelector('[data-act="copy"]').hidden = !(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
      d.querySelector('[data-act="rematch"]').hidden = game.isGuest();
      const enc = encodeURIComponent;
      const links = {
        x: "https://twitter.com/intent/tweet?text=" + enc(info.text) + (url ? "&url=" + enc(url) : ""),
        facebook: url ? "https://www.facebook.com/sharer/sharer.php?u=" + enc(url) : "",
        whatsapp: "https://wa.me/?text=" + enc(full),
        reddit: url ? "https://www.reddit.com/submit?url=" + enc(url) + "&title=" + enc(info.text) : "",
      };
      const anchors = d.querySelectorAll("[data-net]");
      for (let i = 0; i < anchors.length; i++) {
        const href = links[anchors[i].dataset.net];
        anchors[i].hidden = !href;
        if (href) anchors[i].href = href;
      }
      renderShareCard(game.finalFrame, info, url).toBlob(function (blob) {
        if (!blob) return;
        self.blob = blob;
        if (self.imgUrl) URL.revokeObjectURL(self.imgUrl);
        self.imgUrl = URL.createObjectURL(blob);
        img.src = self.imgUrl;
        try {
          self.file = new File([blob], "tank-wars-series.png", { type: "image/png" });
        } catch (e) {
          self.file = null;
        }
        // Phones (and some desktops) can hand the picture itself to any app.
        const native = !!(self.file && navigator.canShare && navigator.canShare({ files: [self.file] }));
        d.querySelector('[data-act="native"]').hidden = !native;
        d.querySelector(".share-tip").hidden = native;
      }, "image/png");
      if (!d.open) d.showModal();
      d.querySelector(".share-title").focus();
    },

    act: function (what) {
      const self = this;
      if (what === "close") {
        this.dialog.close();
        return;
      }
      if (what === "rematch") {
        this.dialog.close();
        this.game.leaveVictory();
        return;
      }
      if (!this.blob) {
        this.note("STILL DEVELOPING THE PHOTO…");
        return;
      }
      if (what === "native") {
        navigator.share({ files: [this.file], title: "Tank Wars", text: this.url ? this.text + " " + this.url : this.text }).then(
          function () {
            self.note("SHARED. GOOD SHOOTING.");
          },
          function (err) {
            if (!err || err.name !== "AbortError") self.note("SHARING FAILED. SAVE THE IMAGE INSTEAD.");
          }
        );
      } else if (what === "save") {
        const a = document.createElement("a");
        a.href = this.imgUrl;
        a.download = "tank-wars-series.png";
        this.dialog.appendChild(a);
        a.click();
        a.remove();
        this.note("SAVED AS tank-wars-series.png");
      } else if (what === "copy") {
        navigator.clipboard.write([new ClipboardItem({ "image/png": this.blob })]).then(
          function () {
            self.note("IMAGE COPIED. PASTE IT INTO YOUR POST.");
          },
          function () {
            self.note("COPY BLOCKED. SAVE THE IMAGE INSTEAD.");
          }
        );
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById("game");
  const game = new Game(canvas);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", function () {
    for (const k in keys) keys[k] = false;
  });

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  }

  Game.prototype.onPointerDown = function (p, e) {
    this.pointer.down = true;
    this.pointer.dragged = false;
    this.pointer.sx = p.x;
    this.pointer.sy = p.y;
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.aim = false;
    if (e && canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    if (this.mode === "aim") {
      const tank = this.current();
      if (this.isLocal(tank) && p.y < H - FOOT && p.y > HUD) {
        this.pointer.aim = true;
        this.pointer.power = tank.power;
      }
    }
  };

  Game.prototype.onPointerMove = function (p) {
    if (!this.pointer.down) return;
    const dx = p.x - this.pointer.sx;
    const dy = p.y - this.pointer.sy;
    if (dx * dx + dy * dy > 64) this.pointer.dragged = true;
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    if (!this.pointer.aim || this.mode !== "aim") return;
    const tank = this.current();
    if (!this.isLocal(tank)) return;
    const prevA = Math.round(tank.angle);
    const prevP = Math.round(tank.power);
    const pivotY = tank.y - 8;
    let ang = (Math.atan2(pivotY - p.y, p.x - tank.x) * 180) / Math.PI;
    if (ang < 0) ang = p.x < tank.x ? 180 : 0;
    tank.angle = clamp(ang, 0, 180);
    tank.power = clamp(this.pointer.power + (this.pointer.sy - p.y) * 0.55, 10, maxPowerFor(tank));
    if (Math.round(tank.angle) !== prevA || Math.round(tank.power) !== prevP) Sfx.tick();
  };

  Game.prototype.onPointerUp = function (p) {
    const dragged = this.pointer.dragged;
    const aim = this.pointer.aim;
    this.pointer.down = false;
    this.pointer.aim = false;
    if (this.mode === "title") {
      this.startFromTitle();
      return;
    }
    if (this.mode === "lobby") {
      this.lobbyClick(p);
      return;
    }
    if (this.mode === "netdown") {
      this.toTitle();
      return;
    }
    if (this.mode === "join") return;
    if (this.mode === "handoff") {
      this.releaseHandoff();
      return;
    }
    if (this.mode === "victory") {
      const b = this.shareBox;
      if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) Share.open(this);
      else this.leaveVictory();
      return;
    }
    if (this.mode === "shop") {
      const buyer = this.roster[this.shopPlayer];
      if (!buyer || !buyer.human || this.shopCpu > 0 || (this.net && this.shopReady)) return;
      const boxes = this.shopBoxes || [];
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (p.y >= b.y - 4 && p.y <= b.y + b.h && p.x > 50 && p.x < 600) {
          this.shopCursor = b.i;
          this.tryShopBuy();
          return;
        }
      }
      return;
    }
    if (this.mode === "aim" && this.ai && !dragged && !this.isGuest()) {
      const cpu = this.current();
      if (cpu) {
        cpu.angle = this.ai.angle;
        cpu.power = this.ai.power;
        cpu.weapon = this.ai.weapon;
        this.tryFire();
      }
      return;
    }
    if (this.mode === "aim" && !dragged) {
      if (p.y >= H - FOOT) {
        const boxes = this.weaponBoxes || [];
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (p.x >= b.x && p.x <= b.x + b.w) {
            const tank = this.current();
            if (!this.isLocal(tank)) return;
            const w = WEAPONS[b.i];
            if (w.ammo === Infinity || tank.ammo[b.i] > 0) {
              tank.weapon = b.i;
              this.banner = w.name;
              this.bannerT = 0.45;
              Sfx.ui();
            } else {
              this.banner = "NO " + w.name;
              this.bannerT = 0.6;
              Sfx.deny();
            }
            return;
          }
        }
        return;
      }
      if (aim) this.tryFire();
    }
  };

  canvas.addEventListener("pointerdown", function (e) {
    Sfx.ensure();
    canvas.focus();
    game.onPointerDown(canvasPoint(e), e);
  });
  canvas.addEventListener("pointermove", function (e) {
    game.onPointerMove(canvasPoint(e));
  });
  canvas.addEventListener("pointerup", function (e) {
    game.onPointerUp(canvasPoint(e));
  });
  canvas.addEventListener("pointercancel", function () {
    game.pointer.down = false;
    game.pointer.aim = false;
  });
  canvas.tabIndex = 0;

  // Landing-page shortcuts: ?demo (attract mode for the embedded monitor),
  // ?host (open a room straight away), ?mode=cpu|hotseat|online (preselect).
  const params = new URLSearchParams(location.search);
  if (params.has("demo")) {
    game.demo = true;
    game.demoT = 0;
    game.difficulty = 2;
    Sfx.muted = true;
    document.body.classList.add("demo");
    game.startSeries();
  } else {
    canvas.focus();
    const preset = params.get("mode");
    if (preset === "cpu" || preset === "hotseat" || (preset === "online" && window.TankNet)) game.playMode = preset;
    if (params.has("host") && window.TankNet) {
      params.delete("host");
      const rest = params.toString();
      history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
      game.playMode = "online";
      game.onlineRole = "host";
      game.hostOnline();
    }
  }

  window.addEventListener("paste", function (e) {
    if (game.mode !== "join" || game.net) return;
    const text = (e.clipboardData && e.clipboardData.getData("text")) || "";
    const room = /room=([A-Za-z0-9]+)/.exec(text);
    game.joinCode = TankNet.cleanCode(room ? room[1] : text);
    game.joinError = "";
    e.preventDefault();
  });

  // Fixed step: every screen in an online game flies a shell through the same
  // sequence of positions, whatever its refresh rate.
  const STEP = 1 / 120;
  let last = performance.now();
  let acc = 0;
  let ticking = false;
  function advance(now, cap) {
    if (ticking) return;
    ticking = true;
    acc += clamp((now - last) / 1000, 0, cap);
    last = now;
    while (acc >= STEP) {
      game.tick(STEP);
      acc -= STEP;
    }
    ticking = false;
  }
  function frame(now) {
    advance(now, 0.05);
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Hidden tabs get no animation frames. Keep an online match moving anyway,
  // e.g. while the host is off pasting the invite link into a chat.
  function backgroundPump() {
    if (document.hidden && game.net) advance(performance.now(), 1);
  }
  setInterval(backgroundPump, 250);
  game.onNetActivity = backgroundPump;

  const invite = window.TankNet && new URLSearchParams(location.search).get("room");
  if (invite) {
    game.playMode = "online";
    game.onlineRole = "join";
    game.joinCode = TankNet.cleanCode(invite);
    game.mode = "join";
    if (game.joinCode.length === TankNet.CODE_LEN) game.joinOnline(game.joinCode);
  }
})();
