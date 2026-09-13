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
      ammo: 5,
      radius: 28,
      damage: 78,
      kind: "blast",
    },
    {
      id: "mirv",
      name: "MIRV",
      key: "3",
      ammo: 3,
      radius: 12,
      damage: 40,
      kind: "mirv",
    },
    {
      id: "digger",
      name: "DIGGER",
      key: "4",
      ammo: 4,
      radius: 18,
      damage: 58,
      kind: "digger",
    },
  ];

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

  function surfaceY(height, x) {
    const i = clamp(Math.round(x), 0, height.length - 1);
    return height[i];
  }

  /**
   * Carve a circular crater from a column heightmap.
   * Dirt is everything y >= height[x]. The circle removes dirt inside it,
   * so the new surface is the first remaining dirt pixel below the bite.
   */
  function excavate(height, cx, cy, radius) {
    const r = radius;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(height.length - 1, Math.ceil(cx + r));
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const inside = r * r - dx * dx;
      if (inside < 0) continue;
      const dy = Math.sqrt(inside);
      const top = cy - dy;
      const bot = cy + dy;
      const s = height[x];
      if (bot <= s) continue;
      if (top <= s + 0.5) {
        height[x] = Math.min(H - 4, Math.max(s, bot));
      } else {
        // Buried blast: punch down if the cavity reaches the current surface from below.
        height[x] = Math.min(H - 4, Math.max(s, bot));
      }
    }
  }

  function trench(height, x, y, r) {
    excavate(height, x, y, r);
  }

  // ---------------------------------------------------------------------------
  // Tiny PC-speaker-ish SFX
  // ---------------------------------------------------------------------------
  const Sfx = {
    ctx: null,
    muted: false,

    ensure: function () {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
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
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur);
    },

    fire: function () {
      this.beep(140, 0.12, "square", 0.06);
      this.beep(90, 0.18, "square", 0.04);
    },
    explode: function (big) {
      this.beep(big ? 70 : 110, big ? 0.35 : 0.2, "sawtooth", big ? 0.07 : 0.05);
    },
    hit: function () {
      this.beep(220, 0.08, "square", 0.05);
    },
    ui: function () {
      this.beep(660, 0.05, "square", 0.03);
    },
    win: function () {
      this.beep(523, 0.12, "square", 0.05);
      setTimeout(() => this.beep(659, 0.12, "square", 0.05), 120);
      setTimeout(() => this.beep(784, 0.2, "square", 0.05), 240);
    },
    fall: function () {
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
  // Weapons / projectiles
  // ---------------------------------------------------------------------------
  function maxPowerFor(tank) {
    return Math.round(42 + 58 * (tank.hp / MAX_HP));
  }

  function crewCount(tank) {
    return Math.max(0, Math.ceil((tank.hp / MAX_HP) * CREW_MAX));
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

  function applyBlast(game, cx, cy, weapon) {
    const r = weapon.radius;
    excavate(game.height, cx, cy, r);
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
        hurt(game, t, dmg);
      }
    }
    game.explosions.push({
      x: cx,
      y: cy,
      r: r,
      t: 0,
      life: 0.38,
      big: r > 20,
    });
    Sfx.explode(r > 20);
  }

  function hurt(game, tank, dmg) {
    if (!tank.alive) return;
    tank.hp = Math.max(0, tank.hp - dmg);
    tank.flash = 0.18;
    Sfx.hit();
    if (tank.hp <= 0) kill(game, tank);
  }

  function kill(game, tank) {
    tank.alive = false;
    tank.hp = 0;
    tank.death = 0.5;
    game.explosions.push({
      x: tank.x,
      y: tank.y - 4,
      r: 20,
      t: 0,
      life: 0.45,
      big: true,
    });
    excavate(game.height, tank.x, tank.y, 16);
    Sfx.explode(true);
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
        }

        if (p.armed) {
          for (let t = 0; t < game.tanks.length; t++) {
            if (tankHit(game.tanks[t], p.x, p.y, 1)) {
              applyBlast(game, p.x, p.y, p.weapon);
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
          p.digLeft -= sdt;
          if (p.digLeft <= 0) {
            applyBlast(game, p.x, p.y, p.weapon);
            p.dead = true;
          }
        } else if (inDirt) {
          applyBlast(game, p.x, p.y, p.weapon);
          p.dead = true;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // AI — sample trajectories, pick closest impact to a living foe
  // ---------------------------------------------------------------------------
  function simulateImpact(sx, sy, angle, power, wind, height, maxT) {
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

    const muz = muzzle(tank);
    const facingRight = target.x >= tank.x;
    const a0 = facingRight ? 12 : 100;
    const a1 = facingRight ? 80 : 168;
    const pMax = maxPowerFor(tank);

    let pick = { err: 1e9, angle: facingRight ? 45 : 135, power: 60 };
    for (let angle = a0; angle <= a1; angle += 4) {
      for (let power = 24; power <= pMax; power += 5) {
        const hit = simulateImpact(muz.x, muz.y, angle, power, game.wind, game.height);
        const err = Math.hypot(hit.x - target.x, hit.y - (target.y - 4));
        if (err < pick.err) pick = { err: err, angle: angle, power: power };
      }
    }
    for (let angle = pick.angle - 5; angle <= pick.angle + 5; angle++) {
      if (angle < 1 || angle > 179) continue;
      for (let power = pick.power - 5; power <= pick.power + 5; power++) {
        if (power < 10 || power > pMax) continue;
        const hit = simulateImpact(muz.x, muz.y, angle, power, game.wind, game.height);
        const err = Math.hypot(hit.x - target.x, hit.y - (target.y - 4));
        if (err < pick.err) pick = { err: err, angle: angle, power: power };
      }
    }

    pick.angle = clamp(pick.angle + irand(-5, 5), 1, 179);
    pick.power = clamp(pick.power + irand(-7, 7), 10, pMax);

    let w = 0;
    if (pick.err < 40 && tank.ammo[1] > 0) w = 1;
    else if (bestD > 180 && tank.ammo[2] > 0) w = 2;
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
    this.tankCount = 2;
    this.humanCount = 1;
    this.titleRow = 0;

    this.height = null;
    this.tanks = [];
    this.shots = [];
    this.explosions = [];
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

    this.rebuildStars();
  }

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

  Game.prototype.newBattle = function () {
    this.height = generateHeightmap(W, Math.random);
    this.rebuildStars();
    this.shots = [];
    this.explosions = [];
    this.winner = null;
    this.banner = "";
    this.wind = irand(-9, 9);
    if (this.wind === 0) this.wind = irand(0, 1) ? 1 : -1;

    const n = this.tankCount;
    const humans = this.humanCount;
    this.tanks = [];
    const margin = 46;
    for (let i = 0; i < n; i++) {
      const x = Math.round(margin + ((W - margin * 2) * (i + 0.5)) / n + irand(-8, 8));
      const human = i < humans;
      this.tanks.push({
        id: i,
        name: human ? "P" + (i + 1) : "CPU-" + String.fromCharCode(65 + i - humans),
        color: PLAYER_COLORS[i],
        dim: PLAYER_DIM[i],
        human: human,
        x: clamp(x, 20, W - 20),
        y: PLAY_TOP - 10,
        vy: 0,
        falling: true,
        fallAcc: 0,
        angle: x < W / 2 ? 45 : 135,
        power: 60,
        hp: MAX_HP,
        alive: true,
        weapon: 0,
        ammo: WEAPONS.map(function (w) {
          return w.ammo;
        }),
        flash: 0,
        death: 0,
        dropped: false,
      });
    }
    this.dropIndex = 0;
    this.dropWait = 0.15;
    this.turn = 0;
    this.ai = null;
    this.mode = "drop";
  };

  Game.prototype.nextTurn = function () {
    const living = this.living();
    if (living.length <= 1) {
      this.winner = living[0] || null;
      this.mode = "victory";
      Sfx.win();
      return;
    }
    this.wind = clamp(this.wind + irand(-3, 3), -12, 12);
    if (this.wind === 0) this.wind = Math.random() < 0.5 ? -1 : 1;

    let guard = 0;
    do {
      this.turn = (this.turn + 1) % this.tanks.length;
      guard++;
    } while (!this.tanks[this.turn].alive && guard < 8);

    const cur = this.current();
    cur.power = clamp(cur.power, 10, maxPowerFor(cur));
    this.ai = null;
    this.mode = "aim";
    this.banner = cur.name + "  READY";
    this.bannerT = 0.7;
    if (!cur.human) {
      const plan = aiChoose(this, cur);
      this.ai = {
        angle: plan.angle,
        power: plan.power,
        weapon: plan.weapon,
        think: 0.35,
      };
      cur.weapon = plan.weapon;
    }
  };

  Game.prototype.tryFire = function () {
    const tank = this.current();
    if (!tank || !tank.alive || this.mode !== "aim") return;
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
    Sfx.fire();
    this.mode = "fire";
    this.ai = null;
  };

  Game.prototype.settleTanks = function (dt) {
    let busy = false;
    for (let i = 0; i < this.tanks.length; i++) {
      const t = this.tanks[i];
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
    }
    return busy;
  };

  Game.prototype.handleAimInput = function (dt) {
    const tank = this.current();
    if (!tank || !tank.human) return;

    const angSpeed = (held("Shift") ? 40 : 70) * dt;
    const powSpeed = (held("Shift") ? 35 : 55) * dt;

    if (held("ArrowLeft") || held("a") || held("A")) tank.angle += angSpeed;
    if (held("ArrowRight") || held("d") || held("D")) tank.angle -= angSpeed;
    tank.angle = clamp(tank.angle, 0, 180);

    if (held("ArrowUp") || held("w") || held("W")) tank.power += powSpeed;
    if (held("ArrowDown") || held("s") || held("S")) tank.power -= powSpeed;
    tank.power = clamp(tank.power, 10, maxPowerFor(tank));

    if (consume("1")) tank.weapon = 0;
    if (consume("2")) tank.weapon = 1;
    if (consume("3")) tank.weapon = 2;
    if (consume("4")) tank.weapon = 3;
    if (consume(" ") || consume("Spacebar") || consume("Enter")) this.tryFire();
  };

  Game.prototype.handleTitleInput = function () {
    if (consume("ArrowLeft") || consume("a") || consume("A")) {
      if (this.titleRow === 0) this.tankCount = this.tankCount <= 2 ? 4 : this.tankCount - 1;
      else this.humanCount = Math.max(0, this.humanCount - 1);
      Sfx.ui();
    }
    if (consume("ArrowRight") || consume("d") || consume("D")) {
      if (this.titleRow === 0) this.tankCount = this.tankCount >= 4 ? 2 : this.tankCount + 1;
      else this.humanCount = Math.min(this.tankCount, this.humanCount + 1);
      Sfx.ui();
    }
    if (consume("ArrowUp") || consume("w") || consume("W")) {
      this.titleRow = 0;
      Sfx.ui();
    }
    if (consume("ArrowDown") || consume("s") || consume("S")) {
      this.titleRow = 1;
      Sfx.ui();
    }
    if (this.humanCount > this.tankCount) this.humanCount = this.tankCount;
    if (consume("Enter") || consume(" ") || consume("Spacebar")) {
      Sfx.ui();
      this.newBattle();
    }
    if (consume("m") || consume("M")) Sfx.muted = !Sfx.muted;
  };

  Game.prototype.tick = function (dt) {
    this.time += dt;
    if (this.bannerT > 0) this.bannerT -= dt;

    for (let i = 0; i < this.tanks.length; i++) {
      if (this.tanks[i].flash > 0) this.tanks[i].flash -= dt;
      if (this.tanks[i].death > 0) this.tanks[i].death -= dt;
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].t += dt;
      if (this.explosions[i].t >= this.explosions[i].life) this.explosions.splice(i, 1);
    }

    if (this.mode === "title") {
      this.handleTitleInput();
      return;
    }

    if (consume("Escape") || consume("Esc")) {
      this.mode = "title";
      flushTaps();
      return;
    }

    if (this.mode === "victory") {
      if (consume("Enter") || consume(" ") || consume("Spacebar")) this.newBattle();
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
            this.dropIndex++;
            this.dropWait = 0.22;
          }
        }
      } else {
        this.turn = -1;
        this.nextTurn();
      }
      return;
    }

    if (this.mode === "aim") {
      this.settleTanks(dt);
      if (this.ai) {
        const tank = this.current();
        this.ai.think -= dt;
        if (this.ai.think <= 0 && tank) {
          tank.angle += (this.ai.angle - tank.angle) * Math.min(1, dt * 4);
          tank.power += (this.ai.power - tank.power) * Math.min(1, dt * 4);
          tank.weapon = this.ai.weapon;
          if (Math.abs(tank.angle - this.ai.angle) < 0.6 && Math.abs(tank.power - this.ai.power) < 0.6) {
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
        if (living.length <= 1) {
          this.winner = living[0] || null;
          this.mode = "victory";
          Sfx.win();
        } else {
          this.nextTurn();
        }
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
      const speck = (x * 17 + (surface * 3)) & 7;
      ctx.fillStyle = speck === 0 ? C.dgray : speck === 3 ? "#995000" : C.brown;
      ctx.fillRect(x, surface, 1, H - surface);
      if (surface + 18 < H) {
        ctx.fillStyle = speck === 2 ? "#553300" : "#774400";
        ctx.fillRect(x, surface + 18, 1, H - surface - 18);
      }
      ctx.fillStyle = speck === 1 ? C.yellow : C.green;
      ctx.fillRect(x, surface, 1, 2);
    }
  };

  function drawTankSprite(ctx, tank) {
    const x = Math.round(tank.x);
    const y = Math.round(tank.y);
    const col = tank.alive ? (tank.flash > 0 ? C.white : tank.color) : C.dgray;
    const dim = tank.alive ? tank.dim : C.black;

    ctx.save();
    // treads
    ctx.fillStyle = dim;
    ctx.fillRect(x - 8, y - 4, 16, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x - 7, y - 3, 14, 2);
    // hull
    ctx.fillStyle = col;
    ctx.fillRect(x - 6, y - 8, 12, 5);
    ctx.fillStyle = dim;
    ctx.fillRect(x - 4, y - 11, 8, 4);
    // hatch
    ctx.fillStyle = C.dgray;
    ctx.fillRect(x - 1, y - 10, 3, 2);

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

    ctx.font = "12px \"Courier New\", Courier, monospace";
    ctx.textBaseline = "middle";

    const tank = this.current();
    const y = HUD / 2;

    if (!tank || this.mode === "title") {
      ctx.fillStyle = C.yellow;
      ctx.textAlign = "left";
      ctx.fillText("TANK WARS", 8, y);
      ctx.fillStyle = C.gray;
      ctx.fillText("SHAREWARE TRIBUTE", 120, y);
      return;
    }

    ctx.textAlign = "left";
    ctx.fillStyle = tank.color;
    ctx.fillText(tank.name, 8, y);

    ctx.fillStyle = C.white;
    ctx.fillText("ANG " + Math.round(tank.angle), 72, y);
    ctx.fillText("POW " + Math.round(tank.power), 148, y);

    const wpn = WEAPONS[tank.weapon];
    const ammo = wpn.ammo === Infinity ? "∞" : String(tank.ammo[tank.weapon]);
    ctx.fillStyle = C.yellow;
    ctx.fillText(wpn.name + " " + ammo, 228, y);

    ctx.fillStyle = this.wind < 0 ? C.lcyan : C.lmag;
    ctx.fillText("WIND " + windGlyph(this.wind), 360, y);

    ctx.fillStyle = C.lgreen;
    ctx.fillText("CREW " + crewCount(tank) + "/" + CREW_MAX, 500, y);

    ctx.fillStyle = tank.color;
    ctx.fillRect(590, 8, Math.round(42 * (tank.hp / MAX_HP)), 12);
    ctx.strokeStyle = C.white;
    ctx.strokeRect(590, 8, 42, 12);

    if (this.bannerT > 0 && this.banner) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(W / 2 - 90, PLAY_TOP + 10, 180, 18);
      ctx.fillStyle = C.yellow;
      ctx.textAlign = "center";
      ctx.fillText(this.banner, W / 2, PLAY_TOP + 19);
    }
  };

  Game.prototype.drawAimGuide = function (ctx) {
    if (this.mode !== "aim") return;
    const tank = this.current();
    if (!tank || !tank.human) return;
    const rad = (tank.angle * Math.PI) / 180;
    const m = muzzle(tank);
    ctx.strokeStyle = tank.color;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + Math.cos(rad) * 22, m.y - Math.sin(rad) * 22);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawTitle = function (ctx) {
    this.drawSky(ctx);
    if (this.height) this.drawTerrain(ctx);
    else {
      const tmp = generateHeightmap(W, function () {
        return 0.5;
      });
      const backup = this.height;
      this.height = tmp;
      this.drawTerrain(ctx);
      this.height = backup;
    }

    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(70, 48, 500, 300);

    ctx.strokeStyle = C.yellow;
    ctx.strokeRect(74, 52, 492, 292);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = C.yellow;
    ctx.font = "bold 36px \"Courier New\", Courier, monospace";
    ctx.fillText("TANK WARS", W / 2, 68);
    ctx.fillStyle = C.lcyan;
    ctx.font = "14px \"Courier New\", Courier, monospace";
    ctx.fillText("2.5    a shareware tribute", W / 2, 110);
    ctx.fillStyle = C.gray;
    ctx.font = "11px \"Courier New\", Courier, monospace";
    ctx.fillText("Inspired by Kenny Morse, 1990  ·  original graphics", W / 2, 132);

    ctx.font = "14px \"Courier New\", Courier, monospace";
    ctx.textAlign = "left";
    const rows = [
      { label: "TANKS", value: String(this.tankCount), hint: "2–4" },
      {
        label: "HUMANS",
        value: String(this.humanCount),
        hint: this.humanCount === 0 ? "all CPU" : this.humanCount === 1 ? "you vs CPU" : "hotseat",
      },
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = 172 + i * 32;
      const sel = this.titleRow === i;
      ctx.fillStyle = sel ? C.yellow : C.gray;
      ctx.fillText((sel ? "> " : "  ") + rows[i].label, 150, y);
      ctx.fillStyle = sel ? C.white : C.lcyan;
      ctx.fillText(rows[i].value, 300, y);
      ctx.fillStyle = C.dgray;
      ctx.fillText(rows[i].hint, 360, y);
    }

    ctx.fillStyle = C.white;
    ctx.font = "12px \"Courier New\", Courier, monospace";
    ctx.textAlign = "center";
    ctx.fillText("← → change    ↑ ↓ select row    ENTER start", W / 2, 250);
    ctx.fillStyle = C.gray;
    ctx.font = "11px \"Courier New\", Courier, monospace";
    ctx.fillText("A/D angle   W/S power   SPACE fire   1-4 weapons", W / 2, 278);
    ctx.fillText("SHELL  ·  HE BOMB  ·  MIRV  ·  DIGGER     M mute", W / 2, 298);
    ctx.fillStyle = C.dgray;
    ctx.fillText("Last tank standing wins. Wind drifts. Dirt caves in.", W / 2, 322);
  };

  Game.prototype.drawVictory = function (ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(140, 120, 360, 140);
    ctx.strokeStyle = C.yellow;
    ctx.strokeRect(144, 124, 352, 132);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 28px \"Courier New\", Courier, monospace";
    if (this.winner) {
      ctx.fillStyle = this.winner.color;
      ctx.fillText(this.winner.name + " WINS", W / 2, 170);
    } else {
      ctx.fillStyle = C.gray;
      ctx.fillText("DRAW", W / 2, 170);
    }
    ctx.font = "13px \"Courier New\", Courier, monospace";
    ctx.fillStyle = C.white;
    ctx.fillText("ENTER  next battle     ESC  title", W / 2, 214);
  };

  Game.prototype.draw = function () {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.clearRect(0, 0, W, H);

    if (this.mode === "title") {
      if (!this.height) {
        this.height = generateHeightmap(W, Math.random);
      }
      this.drawTitle(ctx);
      this.drawHud(ctx);
      return;
    }

    this.drawSky(ctx);
    this.drawTerrain(ctx);
    this.drawTanks(ctx);
    this.drawAimGuide(ctx);
    this.drawShots(ctx);
    this.drawExplosions(ctx);
    this.drawHud(ctx);
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

  canvas.addEventListener("mousedown", function () {
    Sfx.ensure();
    canvas.focus();
    if (game.mode === "title") game.newBattle();
    else if (game.mode === "victory") game.newBattle();
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
