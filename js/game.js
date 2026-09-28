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
  const FOOT = 34;
  const PLAY_TOP = HUD;
  const PLAY_H = H - HUD;
  const GRAVITY = 240;
  const POWER_K = 4.35;
  const WIND_K = 16;
  const TANK_W = 16;
  const TANK_H = 10;
  const MAX_HP = 100;
  const CREW_MAX = 8;

  const PLAYER_COLORS = [C.lcyan, C.lmag, C.yellow, C.lgreen];
  const PLAYER_DIM = [C.cyan, C.magenta, C.brown, C.green];
  const DIFF_NAMES = ["ROOKIE", "LOBBER", "WINDMASTER"];
  const DIFF_LABELS = ["EASY", "NORMAL", "HARD"];

  const WEAPONS = [
    {
      id: "shell",
      name: "SHELL",
      key: "1",
      ammo: Infinity,
      radius: 14,
      damage: 46,
      kind: "blast",
    },
    {
      id: "bomb",
      name: "HE BOMB",
      key: "2",
      ammo: 2,
      radius: 28,
      damage: 78,
      kind: "blast",
    },
    {
      id: "mirv",
      name: "MIRV",
      key: "3",
      ammo: 1,
      radius: 12,
      damage: 40,
      kind: "mirv",
    },
    {
      id: "digger",
      name: "DIGGER",
      key: "4",
      ammo: 2,
      radius: 18,
      damage: 58,
      kind: "digger",
    },
    {
      id: "nuke",
      name: "NUKE",
      short: "NUKE",
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
    { id: "guide", name: "GUIDANCE", cost: 200, blurb: "one dotted arc" },
    { id: "shield", name: "SHIELD", cost: 650, blurb: "blocks the next hit" },
    { id: "nuke", name: "NUKE", cost: 1200, blurb: "do not miss" },
  ];

  const MAPS = ["canyon", "mesa", "water"];
  const MAP_LABEL = { canyon: "CANYON", mesa: "MESA", water: "WATER GAP" };
  const WINS_TO_TAKE = 3;

  const CRATE_KINDS = ["bomb", "bomb", "mirv", "digger", "dirt", "nuke"];

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
        const dmg = Math.round(weapon.damage * (0.35 + 0.65 * falloff));
        const res = hurt(game, t, dmg, owner);
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
      life: r > 36 ? 0.55 : 0.38,
      big: r > 20,
    });
    Sfx.explode(r > 20);
  }

  function hurt(game, tank, dmg, owner) {
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
    tank.hp = Math.max(0, tank.hp - dmg);
    tank.flash = 0.2;
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
    const windUse = game.wind * [0.2, 1, 1][diff];
    const coarse = [6, 4, 3][diff];
    const slopA = [16, 5, 1][diff];
    const slopP = [18, 7, 2][diff];

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

    this.rebuildStars();
  }

  Game.prototype.titleRows = function () {
    if (this.playMode === "cpu") return 3;
    return 3;
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
    if (this.playMode === "cpu") {
      this.tankCount = 2;
      this.humanCount = 1;
    } else {
      this.tankCount = this.hotseatPlayers;
      this.humanCount = this.hotseatPlayers;
    }
  };

  Game.prototype.startSeries = function () {
    this.applyModeCounts();
    const n = this.tankCount;
    const humans = this.humanCount;
    this.roster = [];
    for (let i = 0; i < n; i++) {
      const human = i < humans;
      this.roster.push({
        id: i,
        name: human ? "P" + (i + 1) : DIFF_NAMES[this.difficulty],
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
      });
    }
    this.round = 1;
    this.mapIndex = 0;
    this.seriesOver = false;
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
    this.mapKind = kind;
    const map = generateMap(kind, Math.random);
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
    this.wind = irand(-9, 9);
    if (this.wind === 0) this.wind = irand(0, 1) ? 1 : -1;

    this.tanks = [];
    for (let i = 0; i < this.roster.length; i++) {
      const src = this.roster[i];
      const x = slotX(i, this.roster.length, kind);
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
        flash: 0,
        death: 0,
        bits: null,
        dropped: false,
      });
    }
    this.dropIndex = 0;
    this.dropWait = 0.15;
    this.turn = 0;
    this.ai = null;
    this.banner = MAP_LABEL[kind];
    this.bannerT = 1.5;
    if (this.humanCount > 1) {
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
  };

  Game.prototype.beginShop = function () {
    this.shopPlayer = 0;
    this.shopCursor = 0;
    this.shopNote = "";
    this.shopCpu = 0;
    this.mode = "shop";
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
      this.shopCpu = 1.05;
      Sfx.ui();
    } else {
      this.shopCpu = 0;
    }
  };

  Game.prototype.advanceShop = function () {
    this.shopPlayer++;
    this.openShopPlayer();
  };

  Game.prototype.tryShopBuy = function () {
    const r = this.roster[this.shopPlayer];
    if (!r || !r.human) return;
    if (this.shopCursor >= SHOP.length) {
      this.advanceShop();
      return;
    }
    const item = SHOP[this.shopCursor];
    if (applyBuy(r, item)) {
      this.shopNote = "BOUGHT " + item.name;
      Sfx.pickup();
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
    this.wind = clamp(this.wind + irand(-3, 3), -12, 12);
    if (this.wind === 0) this.wind = Math.random() < 0.5 ? -1 : 1;
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
    this.banner = cur.name + "  READY?";
    this.bannerT = 1.15;
    if (!cur.human) {
      const plan = aiChoose(this, cur);
      this.ai = {
        angle: plan.angle,
        power: plan.power,
        weapon: plan.weapon,
        think: 0.18,
      };
      cur.weapon = plan.weapon;
      this.mode = "aim";
    } else if (this.humanCount > 1 && !(opts && opts.skipHandoff)) {
      this.mode = "handoff";
      this.handoffKind = "turn";
      this.handoffLock = 0.4;
      flushTaps();
    } else {
      this.mode = "aim";
      Sfx.ui();
    }
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
    this.banner = this.current().name + "  READY?";
    this.bannerT = 1.05;
    Sfx.ui();
  };

  Game.prototype.tryFire = function () {
    const tank = this.current();
    if (!tank || !tank.alive || this.mode !== "aim") return;
    if (this.bannerT > 0.85 && tank.human) return;
    if (tank.human && tank.guidance > 0 && this.previewOn) tank.guidance--;
    const w = WEAPONS[tank.weapon];
    if (w.ammo !== Infinity) {
      if (tank.ammo[tank.weapon] <= 0) {
        tank.weapon = 0;
      } else {
        tank.ammo[tank.weapon]--;
      }
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
        busy = true;
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
    if (!tank || !tank.human) return;

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
      this.playMode = this.playMode === "cpu" ? "hotseat" : "cpu";
    } else if (this.titleRow === 1) {
      if (this.playMode === "cpu") {
        this.difficulty = (this.difficulty + dir + 3) % 3;
      } else {
        this.hotseatPlayers += dir;
        if (this.hotseatPlayers < 2) this.hotseatPlayers = 4;
        if (this.hotseatPlayers > 4) this.hotseatPlayers = 2;
      }
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
      this.startSeries();
    }
    if (consume("m") || consume("M")) {
      Sfx.muted = !Sfx.muted;
      Sfx.ui();
    }
  };

  Game.prototype.handleShopInput = function () {
    const r = this.roster[this.shopPlayer];
    if (!r || !r.human || this.shopCpu > 0) return;
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

    if (this.mode === "title") {
      this.handleTitleInput();
      return;
    }

    if (consume("m") || consume("M")) {
      Sfx.muted = !Sfx.muted;
      Sfx.ui();
    }

    if (consume("Escape") || consume("Esc")) {
      this.roster = null;
      this.mode = "title";
      flushTaps();
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
      if (consume("Enter") || consume(" ") || consume("Spacebar")) {
        if (this.seriesOver) this.startSeries();
        else this.beginShop();
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
            t.vy = 20;
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
            this.dropWait = 0.22;
          }
        }
      } else {
        this.turn = -1;
        this.nextTurn({ skipHandoff: this.humanCount > 1 });
      }
      return;
    }

    stepCrates(this, dt);

    if (this.mode === "aim") {
      this.settleTanks(dt);
      if (this.ai) {
        const tank = this.current();
        if (consume(" ") || consume("Spacebar") || consume("Enter")) {
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
            this.tryFire();
          }
        }
      } else {
        this.handleAimInput(dt);
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
      if (!busy && this.shots.length === 0 && this.explosions.length === 0 && this.particles.length < 8) {
        const living = this.living();
        if (living.length <= 1) this.enterVictory();
        else this.nextTurn();
      }
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

    if (!tank || this.mode === "title") {
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
    ctx.fillStyle = "#222222";
    ctx.fillRect(0, H - FOOT, W, FOOT);
    ctx.fillStyle = C.dgray;
    ctx.fillRect(0, H - FOOT, W, 1);

    const tank = this.current();
    this.weaponBoxes = [];
    if (!tank) return;
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let x = 4;
    const rowY = H - FOOT + 8;
    for (let i = 0; i < WEAPONS.length; i++) {
      const w = WEAPONS[i];
      const ammo = w.ammo === Infinity ? "∞" : String(tank.ammo[i]);
      const empty = w.ammo !== Infinity && tank.ammo[i] <= 0;
      const sel = tank.weapon === i;
      const label = i + 1 + " " + (w.short || w.name) + " " + ammo;
      const tw = ctx.measureText(label).width + 8;
      if (sel) {
        ctx.fillStyle = tank.color;
        ctx.fillRect(x, H - FOOT + 2, tw, 14);
        ctx.fillStyle = C.black;
      } else {
        ctx.fillStyle = empty ? C.dgray : C.gray;
      }
      ctx.fillText(label, x + 4, rowY);
      this.weaponBoxes.push({ i: i, x: x, w: tw });
      x += tw + 4;
    }

    ctx.font = '10px "Courier New", Courier, monospace';
    const y2 = H - 8;
    ctx.fillStyle = C.lcyan;
    ctx.fillText(MAP_LABEL[this.mapKind] + "  R" + this.round, 6, y2);
    let sx = 118;
    for (let i = 0; i < this.roster.length; i++) {
      const r = this.roster[i];
      ctx.fillStyle = r.color;
      const bit = r.wins + (i < this.roster.length - 1 ? "-" : "");
      ctx.fillText(bit, sx, y2);
      sx += ctx.measureText(bit).width;
    }
    const purse = this.roster[tank.id];
    ctx.fillStyle = C.yellow;
    ctx.fillText("$" + (purse ? purse.cash : 0), sx + 10, y2);
    ctx.fillStyle = tank.shields > 0 ? C.lcyan : C.dgray;
    ctx.fillText("SH " + tank.shields, sx + 70, y2);
    ctx.fillStyle = tank.guidance > 0 ? C.lgreen : C.dgray;
    ctx.fillText("GD " + tank.guidance, sx + 112, y2);
    ctx.fillStyle = tank.guidance <= 0 ? C.dgray : this.previewOn ? C.lgreen : C.yellow;
    ctx.textAlign = "right";
    const arcLabel = tank.guidance <= 0 ? "NO ARC" : this.previewOn ? "ARC ON" : "ARC OFF";
    ctx.fillText(arcLabel, W - 6, y2);
  };

  Game.prototype.drawAimGuide = function (ctx) {
    if (this.mode !== "aim") return;
    const tank = this.current();
    if (!tank || !tank.human) return;
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

    if (!this.previewOn || tank.guidance <= 0) return;
    const pts = previewArc(tank, this.wind, this.height, this.water);
    ctx.fillStyle = C.white;
    for (let i = 0; i < pts.length; i += 2) {
      ctx.globalAlpha = 0.45 + (i / pts.length) * 0.5;
      ctx.fillRect((pts[i] | 0) - 1, (pts[i + 1] | 0) - 1, 3, 3);
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

  Game.prototype.drawTitle = function (ctx) {
    this.drawSky(ctx);
    if (this.height) this.drawTerrain(ctx);

    ctx.fillStyle = "rgba(0,0,0,0.66)";
    ctx.fillRect(70, 44, 500, 312);
    ctx.strokeStyle = C.yellow;
    ctx.strokeRect(74, 48, 492, 304);

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

    const modeVal = this.playMode === "cpu" ? "1P vs CPU" : "HOTSEAT";
    const row1 =
      this.playMode === "cpu"
        ? { label: "DIFFICULTY", value: DIFF_LABELS[this.difficulty], hint: DIFF_NAMES[this.difficulty] }
        : { label: "PLAYERS", value: String(this.hotseatPlayers), hint: "same keyboard" };
    const rows = [
      { label: "MODE", value: modeVal, hint: this.playMode === "cpu" ? "you vs AI" : "2–4 humans" },
      row1,
      { label: "SOUND", value: Sfx.muted ? "OFF" : "ON", hint: "M mutes anytime" },
    ];

    ctx.font = '14px "Courier New", Courier, monospace';
    ctx.textAlign = "left";
    for (let i = 0; i < rows.length; i++) {
      const y = 158 + i * 30;
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
    ctx.fillText("Drag to aim, click to fire.  Keys still work.  Best of 5.", W / 2, 278);
    ctx.fillText("A/D angle  W/S power  SPACE fire  1-6 weapons  T arc  M mute", W / 2, 298);
    ctx.fillStyle = C.dgray;
    ctx.fillText("Kills pay. Shop between hills. Water swallows shells.", W / 2, 322);
  };

  Game.prototype.drawVictory = function (ctx) {
    const tall = 168 + this.roundLines.length * 16;
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
    ctx.fillText(score, W / 2, top + tall - 48);
    ctx.font = '13px "Courier New", Courier, monospace';
    ctx.fillText(this.seriesOver ? "ENTER  rematch     ESC  title" : "ENTER  shop     ESC  title", W / 2, top + tall - 26);
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
    let lx = 56;
    for (let i = 0; i < this.roster.length; i++) {
      const r = this.roster[i];
      ctx.fillStyle = r.color;
      const label = r.name + " $" + r.cash + "  W" + r.wins;
      ctx.fillText(label, lx, 80);
      lx += ctx.measureText(label).width + 16;
    }
    const buyer = this.roster[this.shopPlayer];
    ctx.fillStyle = buyer ? buyer.color : C.white;
    ctx.font = 'bold 16px "Courier New", Courier, monospace';
    ctx.fillText(buyer ? buyer.name + " BUYING" : "", 56, 108);
    if (this.shopNote) {
      ctx.fillStyle = C.lgreen;
      ctx.font = '12px "Courier New", Courier, monospace';
      ctx.fillText(this.shopNote, 250, 112);
    }
    ctx.font = '14px "Courier New", Courier, monospace';
    this.shopBoxes = [];
    for (let i = 0; i < SHOP.length; i++) {
      const item = SHOP[i];
      const y = 140 + i * 26;
      const sel = this.shopCursor === i && buyer && buyer.human && this.shopCpu <= 0;
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
    const doneSel = this.shopCursor >= SHOP.length && buyer && buyer.human && this.shopCpu <= 0;
    ctx.fillStyle = doneSel ? C.yellow : C.white;
    ctx.fillText((doneSel ? "> " : "  ") + "DONE  —  next tank", 64, doneY);
    this.shopBoxes.push({ i: SHOP.length, y: doneY, h: 24 });
    ctx.fillStyle = C.dgray;
    ctx.font = '11px "Courier New", Courier, monospace';
    ctx.fillText("↑↓ pick    ENTER buy    N done    ESC quits the series", 56, 336);
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

    if (this.mode === "title") {
      if (!this.height) this.height = generateHeightmap(W, Math.random);
      this.drawTitle(ctx);
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

    this.drawHud(ctx);
    this.drawWeaponBar(ctx);
    this.drawBanner(ctx);
    if (this.mode === "victory") this.drawVictory(ctx);
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
      if (tank && tank.human && p.y < H - FOOT && p.y > HUD) {
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
    if (!tank || !tank.human) return;
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
      this.startSeries();
      return;
    }
    if (this.mode === "handoff") {
      this.releaseHandoff();
      return;
    }
    if (this.mode === "victory") {
      if (this.seriesOver) this.startSeries();
      else this.beginShop();
      return;
    }
    if (this.mode === "shop") {
      const buyer = this.roster[this.shopPlayer];
      if (!buyer || !buyer.human || this.shopCpu > 0) return;
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
    if (this.mode === "aim" && this.ai && !dragged) {
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
            if (!tank || !tank.human) return;
            const w = WEAPONS[b.i];
            if (w.ammo === Infinity || tank.ammo[b.i] > 0) {
              tank.weapon = b.i;
              Sfx.ui();
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
  canvas.focus();

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    game.tick(dt);
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
