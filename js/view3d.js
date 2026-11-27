/**
 * One Hill — the 3D view. The same hill, tanks and shells as the flat game,
 * drawn as a diorama: the 640-wide battlefield becomes a slab of ground with a
 * cut front face, seen from a camera that leans toward the action.
 *
 * Only the picture is 3D. Everything still happens on the slab's centre line,
 * at the positions js/game.js computes, so the rules, the AI and online play
 * are untouched. Plain WebGL2, no dependencies. The picture is rendered to an
 * offscreen canvas that js/game.js draws under its HUD.
 */
(function () {
  "use strict";

  const DEPTH = 44; // half the slab's thickness, in game pixels
  const Z_BANDS = [-DEPTH, -15, 15, DEPTH]; // 3 strips: sculpted back flank, flat centre lane, sculpted front flank
  const FOV_TAN = Math.tan((15 * Math.PI) / 180);
  const PITCH = 0.3;
  const MARGIN = 1.07;
  const FLOATS = 8; // x y z, r g b a, lit

  const VERT =
    "#version 300 es\n" +
    "in vec3 aPos; in vec4 aCol; in float aLit;\n" +
    "uniform mat4 uVP;\n" +
    "out vec3 vPos; flat out vec4 vCol; flat out float vLit;\n" +
    "void main() { vPos = aPos; vCol = aCol; vLit = aLit; gl_Position = uVP * vec4(aPos, 1.0); }\n";

  // Face normals come from screen-space derivatives, so every polygon is flat
  // shaded and no normals are stored. 1990 snaps the light to a few bands.
  const FRAG =
    "#version 300 es\n" +
    "precision highp float;\n" +
    "in vec3 vPos; flat in vec4 vCol; flat in float vLit;\n" +
    "uniform vec3 uEye; uniform vec3 uLight; uniform float uAmbient; uniform float uBands;\n" +
    "out vec4 frag;\n" +
    "void main() {\n" +
    "  vec3 cp = cross(dFdx(vPos), dFdy(vPos));\n" +
    "  float cl = length(cp);\n" +
    "  vec3 n = cl > 1e-6 ? cp / cl : vec3(0.0, -1.0, 0.0);\n" +
    "  if (dot(n, uEye - vPos) < 0.0) n = -n;\n" +
    "  float l = uAmbient + (1.0 - uAmbient) * max(dot(n, uLight), 0.0);\n" +
    "  if (uBands > 0.0) l = floor(l * uBands + 0.5) / uBands;\n" +
    "  l = mix(1.0, l, vLit);\n" +
    "  frag = vec4(vCol.rgb * l * vCol.a, vCol.a);\n" +
    "}\n";

  const rgbCache = Object.create(null);
  function rgb(color) {
    let c = rgbCache[color];
    if (c) return c;
    let s = String(color).replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    c = isNaN(n) ? [0.5, 0.5, 0.5] : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    rgbCache[color] = c;
    return c;
  }

  // ---------------------------------------------------------------------------
  // Geometry: growable vertex lists and the few solids the scene is made of.
  // ---------------------------------------------------------------------------
  function Batch(verts) {
    this.a = new Float32Array(verts * FLOATS);
    this.n = 0;
  }

  Batch.prototype.reset = function () {
    this.n = 0;
  };

  Batch.prototype.vert = function (x, y, z, c, alpha, lit) {
    if (this.n + FLOATS > this.a.length) {
      const bigger = new Float32Array(this.a.length * 2);
      bigger.set(this.a);
      this.a = bigger;
    }
    const a = this.a;
    let n = this.n;
    a[n++] = x;
    a[n++] = y;
    a[n++] = z;
    a[n++] = c[0];
    a[n++] = c[1];
    a[n++] = c[2];
    a[n++] = alpha;
    a[n++] = lit;
    this.n = n;
  };

  Batch.prototype.quad = function (x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, c, alpha, lit) {
    this.vert(x0, y0, z0, c, alpha, lit);
    this.vert(x1, y1, z1, c, alpha, lit);
    this.vert(x2, y2, z2, c, alpha, lit);
    this.vert(x0, y0, z0, c, alpha, lit);
    this.vert(x2, y2, z2, c, alpha, lit);
    this.vert(x3, y3, z3, c, alpha, lit);
  };

  /** A box: centre, half sizes, and optionally a long axis (ux, uy) turned in the battlefield plane. */
  Batch.prototype.box = function (cx, cy, cz, hl, ht, hz, color, alpha, lit, ux, uy) {
    if (ux === undefined) {
      ux = 1;
      uy = 0;
    }
    const c = rgb(color);
    const a = alpha === undefined ? 1 : alpha;
    const l = lit === undefined ? 1 : lit;
    const lx = ux * hl;
    const ly = uy * hl;
    const tx = -uy * ht;
    const ty = ux * ht;
    const ax = cx - lx - tx;
    const ay = cy - ly - ty;
    const bx = cx + lx - tx;
    const by = cy + ly - ty;
    const ex = cx + lx + tx;
    const ey = cy + ly + ty;
    const dx = cx - lx + tx;
    const dy = cy - ly + ty;
    const z0 = cz - hz;
    const z1 = cz + hz;
    this.quad(ax, ay, z1, bx, by, z1, ex, ey, z1, dx, dy, z1, c, a, l);
    this.quad(ax, ay, z0, bx, by, z0, ex, ey, z0, dx, dy, z0, c, a, l);
    this.quad(ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z1, c, a, l);
    this.quad(dx, dy, z0, ex, ey, z0, ex, ey, z1, dx, dy, z1, c, a, l);
    this.quad(ax, ay, z0, dx, dy, z0, dx, dy, z1, ax, ay, z1, c, a, l);
    this.quad(bx, by, z0, ex, ey, z0, ex, ey, z1, bx, by, z1, c, a, l);
  };

  function makeSphereTable(rings, segs) {
    const rSin = [];
    const rCos = [];
    const sSin = [];
    const sCos = [];
    for (let i = 0; i <= rings; i++) {
      rSin.push(Math.sin((i / rings) * Math.PI));
      rCos.push(Math.cos((i / rings) * Math.PI));
    }
    for (let i = 0; i <= segs; i++) {
      sSin.push(Math.sin((i / segs) * Math.PI * 2));
      sCos.push(Math.cos((i / segs) * Math.PI * 2));
    }
    return { rings: rings, segs: segs, rSin: rSin, rCos: rCos, sSin: sSin, sCos: sCos };
  }
  const SPHERE_LO = makeSphereTable(4, 6);
  const SPHERE_HI = makeSphereTable(6, 10);

  Batch.prototype.ball = function (cx, cy, cz, r, color, alpha, lit, hi) {
    const c = rgb(color);
    const t = r <= 4 && !hi ? SPHERE_LO : SPHERE_HI;
    for (let i = 0; i < t.rings; i++) {
      const y0 = cy - t.rCos[i] * r;
      const y1 = cy - t.rCos[i + 1] * r;
      const r0 = t.rSin[i] * r;
      const r1 = t.rSin[i + 1] * r;
      for (let j = 0; j < t.segs; j++) {
        this.quad(
          cx + t.sCos[j] * r0, y0, cz + t.sSin[j] * r0,
          cx + t.sCos[j + 1] * r0, y0, cz + t.sSin[j + 1] * r0,
          cx + t.sCos[j + 1] * r1, y1, cz + t.sSin[j + 1] * r1,
          cx + t.sCos[j] * r1, y1, cz + t.sSin[j] * r1,
          c, alpha, lit
        );
      }
    }
  };

  /** Soft flat contact shadow resting just above the terrain slab (XZ plane). */
  const SHADOW_COL = [0.04, 0.04, 0.06];
  Batch.prototype.shadow = function (cx, cy, cz, rx, rz, alpha) {
    if (alpha <= 0.01) return;
    const y = cy - 0.25;
    this.quad(
      cx - rx, y, cz - rz,
      cx + rx, y, cz - rz,
      cx + rx, y, cz + rz,
      cx - rx, y, cz + rz,
      SHADOW_COL, alpha, 0
    );
  };

  /** Expanding 3D shockwave ring in the horizontal XZ plane. */
  const RING_SEGS = 14;
  const RING_COS_T = [];
  const RING_SIN_T = [];
  for (let i = 0; i <= RING_SEGS; i++) {
    const a = (i / RING_SEGS) * Math.PI * 2;
    RING_COS_T.push(Math.cos(a));
    RING_SIN_T.push(Math.sin(a));
  }
  Batch.prototype.ring = function (cx, cy, cz, rIn, rOut, color, alpha) {
    if (alpha <= 0.01 || rOut <= rIn) return;
    const c = rgb(color);
    for (let i = 0; i < RING_SEGS; i++) {
      const c0 = RING_COS_T[i];
      const s0 = RING_SIN_T[i];
      const c1 = RING_COS_T[i + 1];
      const s1 = RING_SIN_T[i + 1];
      this.quad(
        cx + c0 * rIn, cy, cz + s0 * rIn,
        cx + c1 * rIn, cy, cz + s1 * rIn,
        cx + c1 * rOut, cy, cz + s1 * rOut,
        cx + c0 * rOut, cy, cz + s0 * rOut,
        c, alpha, 0
      );
    }
  };

  /** A flat square on the battlefield plane, for trails. */
  Batch.prototype.dot = function (x, y, half, color, alpha) {
    const c = rgb(color);
    this.quad(x - half, y - half, 0, x + half, y - half, 0, x + half, y + half, 0, x - half, y + half, 0, c, alpha, 0);
  };

  // ---------------------------------------------------------------------------
  // One WebGL context. 1990 wants hard pixel edges and 2026 wants smooth ones,
  // and antialiasing is fixed when a context is made, so each era gets its own.
  // ---------------------------------------------------------------------------
  function Renderer(smooth) {
    const self = this;
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl2", {
      alpha: true,
      antialias: smooth,
      depth: true,
      premultipliedAlpha: true,
    });
    this.ok = false;
    this.landKey = "";
    if (!this.gl) return;
    this.canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      self.ok = false;
    });
    this.canvas.addEventListener("webglcontextrestored", function () {
      self.setup();
    });
    this.setup();
  }

  Renderer.prototype.setup = function () {
    const gl = this.gl;
    function shader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.bindAttribLocation(prog, 1, "aCol");
    gl.bindAttribLocation(prog, 2, "aLit");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    this.prog = prog;
    this.uVP = gl.getUniformLocation(prog, "uVP");
    this.uEye = gl.getUniformLocation(prog, "uEye");
    this.uLight = gl.getUniformLocation(prog, "uLight");
    this.uAmbient = gl.getUniformLocation(prog, "uAmbient");
    this.uBands = gl.getUniformLocation(prog, "uBands");
    this.land = this.mesh();
    this.solid = this.mesh();
    this.glass = this.mesh();
    this.landKey = "";
    this.ok = true;
  };

  Renderer.prototype.mesh = function () {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const stride = FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 28);
    gl.bindVertexArray(null);
    return { vao: vao, buf: buf, count: 0, cap: 0 };
  };

  Renderer.prototype.upload = function (mesh, batch, usage) {
    const gl = this.gl;
    mesh.count = batch.n / FLOATS;
    if (!batch.n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    if (batch.n > mesh.cap) {
      mesh.cap = Math.max(batch.n, mesh.cap * 2, 2048);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.cap * 4, usage);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.a.subarray(0, batch.n));
  };

  Renderer.prototype.drawMesh = function (mesh) {
    if (!mesh.count) return;
    this.gl.bindVertexArray(mesh.vao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, mesh.count);
  };

  // ---------------------------------------------------------------------------
  // The view: camera, scene building, and the two renderers.
  // ---------------------------------------------------------------------------
  function View(cfg) {
    this.W = cfg.W;
    this.H = cfg.H;
    this.floor = cfg.H + 70; // the slab runs on below the screen
    this.renderers = [null, null];
    this.landBatch = new Batch(28000);
    this.solidBatch = new Batch(4096);
    this.glassBatch = new Batch(4096);
    this.heights = new Float32Array(cfg.W);
    this.baseHeights = null;
    this.landStamp = "";
    this.landVersion = 0;
    this.yaw = 0;
    this.turn = 0; // the player's own Q/E turn, added to the camera's lean
    this.tilt = 1;
    this.loft = 0; // smooth vertical pull-back for high "from orbit" lobs
    this.kick = 0; // a great shot pulls the camera in toward kickX
    this.kickX = cfg.W / 2;
    this.last = 0;
    this.cam = null;
    this.vp = new Float32Array(16);
  }

  /** Start flat-on and tip back into the diorama. */
  View.prototype.enter = function (animate) {
    this.tilt = animate ? 0 : 1;
    this.yaw = 0;
  };

  /** Push in toward a spot on the field, then ease back out. */
  View.prototype.punch = function (x) {
    this.kick = 1;
    this.kickX = x;
  };

  View.prototype.renderer = function (smooth) {
    const i = smooth ? 1 : 0;
    if (!this.renderers[i]) this.renderers[i] = new Renderer(smooth);
    return this.renderers[i].ok ? this.renderers[i] : null;
  };

  View.prototype.aim = function (o, dt) {
    const reduce = !!o.reduceMotion;
    if (this.tilt < 1) this.tilt = reduce ? 1 : Math.min(1, this.tilt + dt / 0.7);
    if (o.turn) this.turn = Math.max(-0.6, Math.min(0.6, this.turn + o.turn * dt * 0.9));
    let want = 0;
    if (o.backdrop) want = reduce ? 0.12 : Math.sin(o.time * 0.28) * 0.2;
    else if (!reduce) want = ((o.focusX - this.W / 2) / (this.W / 2)) * 0.13;
    this.yaw += (want - this.yaw) * Math.min(1, dt * 2.2);

    const wantLoft = !o.backdrop && !reduce && o.focusY !== undefined
      ? Math.max(0, Math.min(1, (o.top + 35 - o.focusY) / 140))
      : 0;
    this.loft += (wantLoft - this.loft) * Math.min(1, dt * 3.5);

    const ease = this.tilt * this.tilt * (3 - 2 * this.tilt);
    const yaw = (this.yaw + (o.backdrop ? 0 : this.turn)) * ease;
    const pitch = PITCH * (1 - 0.28 * this.loft) * ease;
    const aspect = this.W / o.h;
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 1.1);
    const kick = this.kick * this.kick * (3 - 2 * this.kick);
    const dist =
      (o.h / 2 / FOV_TAN) *
      (1 + (MARGIN - 1) * ease) *
      (1 + Math.abs(yaw) * 0.22) *
      (1 + 0.12 * this.loft * ease) *
      (1 - 0.13 * kick);
    const tx = this.W / 2 + (this.kickX - this.W / 2) * 0.3 * kick;
    const ty = o.top + o.h / 2 + 4 * ease - 18 * this.loft * ease;
    const ex = tx + Math.sin(yaw) * Math.cos(pitch) * dist;
    const ey = ty - Math.sin(pitch) * dist;
    const ez = Math.cos(yaw) * Math.cos(pitch) * dist;

    // Game coordinates run y-down, so "up" on screen is -y.
    let fx = tx - ex;
    let fy = ty - ey;
    let fz = -ez;
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl;
    fy /= fl;
    fz /= fl;
    let rx = -fz;
    let rz = fx;
    const rl = Math.hypot(rx, rz);
    rx /= rl;
    rz /= rl;
    const ux = fy * rz;
    const uy = fz * rx - fx * rz;
    const uz = -fy * rx;

    const near = 40;
    const far = 4000;
    const sx = 1 / (FOV_TAN * aspect);
    const sy = 1 / FOV_TAN;
    const za = (far + near) / (far - near);
    const zb = (-2 * far * near) / (far - near);
    const er = rx * ex + rz * ez;
    const eu = ux * ex + uy * ey + uz * ez;
    const ef = fx * ex + fy * ey + fz * ez;
    const m = this.vp;
    m[0] = rx * sx;
    m[4] = 0;
    m[8] = rz * sx;
    m[12] = -er * sx;
    m[1] = ux * sy;
    m[5] = uy * sy;
    m[9] = uz * sy;
    m[13] = -eu * sy;
    m[2] = fx * za;
    m[6] = fy * za;
    m[10] = fz * za;
    m[14] = -ef * za + zb;
    m[3] = fx;
    m[7] = fy;
    m[11] = fz;
    m[15] = -ef;
    this.cam = {
      ex: ex, ey: ey, ez: ez,
      fx: fx, fy: fy, fz: fz,
      rx: rx, rz: rz,
      ux: ux, uy: uy, uz: uz,
      aspect: aspect, top: o.top, h: o.h,
    };
  };

  /** A point on the battlefield, as a position on the game's 640x400 screen. */
  View.prototype.project = function (x, y, z) {
    const m = this.vp;
    const c = this.cam;
    z = z || 0;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    const py = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    return { x: (px * 0.5 + 0.5) * this.W, y: c.top + (0.5 - py * 0.5) * c.h };
  };

  /** A position on the game's screen, as the battlefield point under it. */
  View.prototype.unproject = function (px, py) {
    const c = this.cam;
    const nx = ((px / this.W) * 2 - 1) * FOV_TAN * c.aspect;
    const ny = (1 - ((py - c.top) / c.h) * 2) * FOV_TAN;
    const dx = c.fx + c.rx * nx + c.ux * ny;
    const dy = c.fy + c.uy * ny;
    const dz = c.fz + c.rz * nx + c.uz * ny;
    const t = -c.ez / dz;
    return { x: c.ex + dx * t, y: c.ey + dy * t };
  };

  /** Colors changed (an era switch): rebuild the ground next frame. */
  View.prototype.invalidate = function () {
    this.landStamp = "";
  };

  View.prototype.buildLand = function (scene, o) {
    const W = this.W;
    const src = scene.height;
    const stamp = (o.modern ? "m" : "r") + o.pal.brown + o.charcoal;
    let same = stamp === this.landStamp;
    let changed = 0;
    for (let x = 0; x < W; x++) {
      if (this.heights[x] !== src[x]) {
        this.heights[x] = src[x];
        same = false;
        changed++;
      }
    }
    if (same) return;
    // Detect fresh map load (>35% columns jumped) so we capture un-cratered base silhouette.
    if (!this.baseHeights || changed > W * 0.35) {
      this.baseHeights = new Float32Array(src);
    }
    this.landStamp = stamp;
    this.landVersion++;

    const b = this.landBatch;
    b.reset();
    const floor = this.floor;
    const ys = new Float32Array(W);
    const rim = new Float32Array(W);
    const baseSrc = scene.baseHeight || this.baseHeights;
    const taps = [1, 2, 3, 4, 3, 2, 1];
    for (let x = 0; x < W; x++) {
      let y = src[x];
      let by = baseSrc[x];
      if (o.modern) {
        // The same light smoothing the flat 2026 hills get.
        y = 0;
        by = 0;
        for (let t = 0; t < taps.length; t++) {
          const xi = Math.max(0, Math.min(W - 1, x + t - 3));
          y += src[xi] * taps[t];
          by += baseSrc[xi] * taps[t];
        }
        y /= 16;
        by /= 16;
      }
      y = Math.min(y, floor - 30);
      by = Math.min(by, floor - 30);
      ys[x] = y;
      // Sculpt craters into 3D bowls (outer edges curve up toward original hill)
      // and dirt mounds into 3D piles (outer edges taper down toward original hill).
      const diff = y - by;
      if (diff > 1) rim[x] = y - Math.min(22, diff * 0.42);
      else if (diff < -1) rim[x] = y + Math.min(14, -diff * 0.3);
      else rim[x] = y;
    }

    const pal = o.pal;
    let top, edge, dirt, deep, cuts;
    if (o.modern) {
      top = [rgb("#45433f"), rgb("#3d3b38"), rgb("#4d4b46")];
      edge = [rgb(pal.black), rgb(pal.black)];
      dirt = [rgb(o.charcoal), rgb("#2f2e2b"), rgb(o.charcoal), rgb("#242321")];
      deep = dirt;
      cuts = [0, 1.6, 18];
    } else {
      top = [rgb(pal.green), rgb("#009000"), rgb(pal.yellow)];
      edge = [rgb(pal.green), rgb(pal.yellow)];
      dirt = [rgb(pal.brown), rgb(pal.dgray), rgb(pal.brown), rgb("#995000")];
      deep = [rgb("#774400"), rgb("#774400"), rgb("#553300"), rgb("#774400")];
      cuts = [0, 2, 18];
    }

    function strata(x, a, bnd) {
      const speck = (x * 17 + (a | 0) * 3) & 7;
      if (bnd === 0) return edge[speck === 1 ? 1 : 0];
      if (bnd === 1) return dirt[speck === 0 ? 1 : speck === 3 ? 3 : 0];
      return deep[speck === 2 ? 2 : 0];
    }

    const scorch = o.modern ? rgb("#262523") : rgb("#6a3b00");
    for (let x = 0; x < W - 1; x++) {
      const a = ys[x];
      const c = ys[x + 1];
      const ar = rim[x];
      const cr = rim[x + 1];
      const cratered = a - ar > 2.5 || c - cr > 2.5;
      // 3 top strips: back flank [-DEPTH..-15], flat centre lane [-15..15], front flank [15..DEPTH]
      for (let k = 0; k < 3; k++) {
        const z0 = Z_BANDS[k];
        const z1 = Z_BANDS[k + 1];
        const ay0 = k === 0 ? ar : a;
        const cy0 = k === 0 ? cr : c;
        const ay1 = k === 2 ? ar : a;
        const cy1 = k === 2 ? cr : c;
        const h = (x * 31 + k * 57 + ((x * x) >> 2) * 13 + ((x * k * 7) >> 1)) & 15;
        const col = cratered && k === 1 ? scorch : top[h === 0 ? 2 : h < 4 ? 1 : 0];
        b.quad(x, ay0, z0, x + 1, cy0, z0, x + 1, cy1, z1, x, ay1, z1, col, 1, 1);
      }
      // The cut face toward the camera: turf, topsoil, subsoil (connects cleanly to front rim).
      for (let s = 0; s < 3; s++) {
        const a0 = Math.min(floor, ar + cuts[s]);
        const c0 = Math.min(floor, cr + cuts[s]);
        const a1 = s === 2 ? floor : Math.min(floor, ar + cuts[s + 1]);
        const c1 = s === 2 ? floor : Math.min(floor, cr + cuts[s + 1]);
        b.quad(x, a0, DEPTH, x + 1, c0, DEPTH, x + 1, c1, DEPTH, x, a1, DEPTH, strata(x, ar, s), 1, 1);
      }
    }
    // The slab's two ends (3 Z-segments matching top profile).
    for (let e = 0; e < 2; e++) {
      const x = e ? W - 1 : 0;
      const a = ys[x];
      const ar = rim[x];
      for (let k = 0; k < 3; k++) {
        const z0 = Z_BANDS[k];
        const z1 = Z_BANDS[k + 1];
        const top0 = k === 0 ? ar : a;
        const top1 = k === 2 ? ar : a;
        for (let s = 0; s < 3; s++) {
          const y00 = Math.min(floor, top0 + cuts[s]);
          const y10 = Math.min(floor, top1 + cuts[s]);
          const y01 = s === 2 ? floor : Math.min(floor, top0 + cuts[s + 1]);
          const y11 = s === 2 ? floor : Math.min(floor, top1 + cuts[s + 1]);
          const col = s === 0 ? edge[0] : s === 1 ? dirt[0] : deep[0];
          b.quad(x, y00, z0, x, y10, z1, x, y11, z1, x, y01, z0, col, 1, 1);
        }
      }
    }
  };

  function addTank(solid, glass, tank, o) {
    const pal = o.pal;
    const x = tank.x;
    const y = tank.y;
    const m = o.modern;

    if (!tank.alive && tank.death > 0 && tank.bits) {
      const age = 1.15 - Math.min(1.15, tank.death);
      for (let i = 0; i < tank.bits.length; i++) {
        const bit = tank.bits[i];
        const z = (((i * 7) % 11) - 5) * 7 * age;
        solid.box(bit.x, bit.y, z, 1.2, 1.2, 1.2, bit.c);
      }
      if (m) {
        const k = age / 1.15;
        if (k < 0.45) glass.ball(x, y - 8, 0, 22 * (0.5 + 0.8 * k) * 0.8, pal.yellow, 1 - k / 0.45, 0);
        glass.ball(x, y - 8, 0, 22 * (0.5 + 0.8 * k), pal.black, 0.22 * (1 - k), 0);
      } else {
        glass.ball(x, y - 8, 0, 10 + age * 18, pal.yellow, Math.min(1, tank.death) * 0.9, 0);
      }
      return;
    }

    const body = tank.alive ? (tank.flash > 0 ? (m ? o.paper : pal.white) : tank.color) : pal.dgray;
    const dim = m ? pal.black : tank.alive ? tank.dim : pal.black;
    // Tracks, belly, hull, turret.
    solid.box(x, y - 2, 5.4, 8, 2, 1.7, dim);
    solid.box(x, y - 2, -5.4, 8, 2, 1.7, dim);
    solid.box(x, y - 2.6, 0, 7, 1.4, 3.8, body);
    solid.box(x, y - 5.6, 0, 6.2, 2.2, 5.2, body);
    solid.box(x, y - 9.4, 0, 4, 1.8, 3.6, m ? body : dim);
    solid.box(x + 0.5, y - 11.5, 0, 1.5, 0.5, 1.5, m ? pal.black : pal.dgray);

    if (tank.alive) {
      const rad = (tank.angle * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = -Math.sin(rad);
      solid.box(x + ux * 7.5, y - 8.6 + uy * 7.5, 0, 6.5, 1, 1, m ? pal.black : body, 1, 1, ux, uy);
      if (!m) solid.box(x + ux * 14, y - 8.6 + uy * 14, 0, 0.9, 1.2, 1.2, pal.white, 1, 0, ux, uy);
      if (tank.shields > 0) glass.ball(x, y - 6, 0, 13.5, m ? pal.black : pal.lcyan, m ? 0.16 : 0.28, m ? 0 : 0.6);
    } else if (m) {
      solid.box(x, y - 14.5, 0, 4, 0.8, 0.8, pal.yellow, 1, 0, Math.SQRT1_2, Math.SQRT1_2);
      solid.box(x, y - 14.5, 0, 4, 0.8, 0.8, pal.yellow, 1, 0, Math.SQRT1_2, -Math.SQRT1_2);
    } else {
      solid.box(x - 1, y - 14, 0, 1, 3, 1, pal.red);
      solid.box(x - 1, y - 15.5, 0, 3, 1, 1, pal.red);
    }
  }

  View.prototype.buildScene = function (scene, o) {
    const solid = this.solidBatch;
    const glass = this.glassBatch;
    const pal = o.pal;
    const m = o.modern;
    solid.reset();
    glass.reset();

    if (scene.water) {
      const w = scene.water;
      const mid = (w.x0 + w.x1) / 2;
      const half = (w.x1 - w.x0) / 2;
      const d = DEPTH + 0.4;
      glass.box(mid, (w.y + this.floor) / 2, 0, half, (this.floor - w.y) / 2, d, m ? pal.lcyan : pal.lblue, m ? 0.86 : 0.8, 1);
      // Wave caps: a row along the cut face and a few more across the surface.
      for (let row = 0; row < 4; row++) {
        const z = row === 0 ? d - 1 : d - row * 24;
        for (let x = w.x0 + (row % 2) * 3; x < w.x1 - 3; x += row === 0 ? 4 : 12) {
          if (m) {
            const y = w.y + Math.sin(x * 0.15 + scene.time * 3 + row) * 0.8;
            glass.box(x + 2, y, z, 2, 0.35, 1, o.paper, 0.75, 0);
          } else {
            const bob = ((x + row * 3 + Math.floor(scene.time * 18)) & 7) < 3 ? 1 : 0;
            glass.box(x + 1.5, w.y + bob, z, 1.5, 0.6, 1, pal.lcyan, 1, 0);
          }
        }
      }
    }
    if (o.backdrop) return;

    const hArr = this.heights;
    const maxX = this.W - 1;
    function groundAt(x) {
      const xi = x < 0 ? 0 : x > maxX ? maxX : x | 0;
      return hArr[xi];
    }

    for (let i = 0; i < scene.tanks.length; i++) {
      const t = scene.tanks[i];
      if (scene.mode === "drop" && !t.dropped && t.y < o.top) continue;
      if (t.alive || t.death <= 0) {
        const gy = groundAt(t.x);
        const alt = Math.max(0, gy - t.y);
        if (alt < 70) {
          const k = 1 - alt / 70;
          glass.shadow(t.x, gy, 0, 9.5 * (0.65 + 0.35 * k), 7.2 * (0.65 + 0.35 * k), (m ? 0.22 : 0.34) * k);
        }
      }
      addTank(solid, glass, t, o);
    }

    for (let i = 0; i < scene.crates.length; i++) {
      const c = scene.crates[i];
      const gy = groundAt(c.x);
      const alt = Math.max(0, gy - c.y);
      if (alt < 70) {
        const k = 1 - alt / 70;
        glass.shadow(c.x, gy, 0, 6.2 * (0.65 + 0.35 * k), 5.2 * (0.65 + 0.35 * k), (m ? 0.2 : 0.3) * k);
      }
      const flash = Math.floor(c.blink * 6) % 2 === 0;
      if (m) {
        solid.box(c.x, c.y - 2, 0, 5.5, 4.5, 4.5, o.paper);
        solid.box(c.x, c.y - 2, 0, 5.7, 0.5, 4.7, pal.black);
        solid.box(c.x, c.y - 2, 4.6, 2.4, 0.8, 0.3, pal.yellow, 1, 0);
        solid.box(c.x, c.y - 2, 4.6, 0.8, 2.4, 0.3, pal.yellow, 1, 0);
        if (flash) solid.ball(c.x + 4, c.y - 7.4, 0, 1.2, pal.yellow, 1, 0);
      } else {
        solid.box(c.x, c.y - 2, 0, 5, 4, 4, flash ? pal.yellow : pal.brown);
        solid.box(c.x, c.y - 2, 0, 3, 2, 4.4, pal.black);
        solid.box(c.x, c.y - 2, 0, 1, 1, 4.8, flash ? pal.lgreen : pal.white, 1, 0);
      }
    }

    for (let i = 0; i < scene.shots.length; i++) {
      const p = scene.shots[i];
      const n = p.trail.length;
      if (m) {
        for (let k = 0; k < n; k += 6) glass.dot(p.trail[k], p.trail[k + 1], 0.6, pal.black, (k / n) * 0.8);
      } else {
        for (let k = 0; k < n; k += 4) glass.dot(p.trail[k], p.trail[k + 1], 0.5, pal.dgray, 1);
      }
      const gy = groundAt(p.x);
      const alt = gy - p.y;
      if (alt > 2 && alt < 120) {
        const k = 1 - alt / 120;
        glass.shadow(p.x, gy, 0, 2.6 + (1 - k) * 2.5, 2.2 + (1 - k) * 2, (m ? 0.2 : 0.28) * k);
      }
      const digging = p.weapon.kind === "digger" && p.digging;
      solid.ball(p.x, p.y, 0, m ? 2 : 1.8, digging ? pal.brown : pal.yellow, 1, m ? 0.35 : 0);
      if (!m) glass.ball(p.x, p.y, 0, 0.8, pal.white, 1, 0);
    }

    for (let i = 0; i < scene.explosions.length; i++) {
      const e = scene.explosions[i];
      const k = e.t / e.life;
      const out = 1 - (1 - k) * (1 - k);
      const gy = Math.min(e.y, groundAt(e.x) - 0.5);
      if (m) {
        const r = e.r * (0.5 + 0.8 * k);
        glass.ball(e.x, e.y, 0, r, pal.black, 0.2 * (1 - k), 0);
        if (k < 0.45) glass.ball(e.x, e.y, 0, r * 0.8, pal.yellow, 1 - k / 0.45, 0);
        // Expanding 3D shockwave ring on the horizontal slab plane.
        const sr = e.r * (0.4 + 1.45 * out);
        glass.ring(e.x, gy, 0, sr * 0.82, sr, pal.yellow, 0.55 * (1 - k));
        if (e.big) glass.ring(e.x, gy - 1.5, 0, sr * 1.05, sr * 1.18, pal.black, 0.26 * (1 - k));
      } else {
        const r = e.r * (0.35 + 0.75 * k);
        const cols = [pal.white, pal.yellow, pal.lred, pal.red];
        glass.ball(e.x, e.y, 0, r, cols[Math.min(cols.length - 1, Math.floor(k * cols.length))], 0.9, 0);
        glass.ball(e.x, e.y, 0, r * 0.4, pal.white, 1, 0);
        const sr = e.r * (0.45 + 1.4 * out);
        glass.ring(e.x, gy, 0, sr * 0.8, sr, k < 0.4 ? pal.white : pal.yellow, 0.65 * (1 - k));
        if (e.big) glass.ring(e.x, gy - 1.5, 0, sr * 1.06, sr * 1.22, pal.lred, 0.45 * (1 - k));
      }
      // Rising smoke cube cluster for 3D depth on big blasts.
      if (e.big && k > 0.15) {
        const sk = (k - 0.15) / 0.85;
        const sa = 0.28 * (1 - sk);
        const sc = m ? pal.black : pal.dgray;
        for (let s = 0; s < 3; s++) {
          const a = s * 2.1 + e.x * 0.1;
          const off = e.r * 0.35 * sk;
          const sz = e.r * (0.14 + 0.1 * sk);
          glass.box(e.x + Math.cos(a) * off, e.y - sk * e.r * 0.9 - s * 3, Math.sin(a) * off, sz, sz, sz, sc, sa, 0.4);
        }
      }
    }

    for (let i = 0; i < scene.particles.length; i++) {
      const p = scene.particles[i];
      // Debris gets a sideways push of its own the first time it is seen.
      if (p.vz === undefined) p.vz = (Math.random() - 0.5) * 90;
      const half = Math.max(0.5, p.sz * (m ? 0.4 : 0.5));
      const color = m ? o.dust[p.c] || p.c : p.c;
      glass.box(p.x, p.y, p.vz * p.t, half, half, half, color, 1 - p.t / p.life, 0.5);
    }
  };

  /**
   * Draw the battlefield. Returns the canvas holding the picture (transparent
   * where the sky shows), or null if WebGL is not available right now.
   */
  View.prototype.render = function (scene, o) {
    const r = this.renderer(o.modern);
    if (!r || !scene.height) return null;
    const now = performance.now();
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.aim(o, dt);

    const gl = r.gl;
    const w = Math.round(this.W * o.scale);
    const h = Math.round(o.h * o.scale);
    if (r.canvas.width !== w || r.canvas.height !== h) {
      r.canvas.width = w;
      r.canvas.height = h;
    }

    this.buildLand(scene, o);
    if (r.landKey !== this.landVersion) {
      r.upload(r.land, this.landBatch, gl.DYNAMIC_DRAW);
      r.landKey = this.landVersion;
    }
    this.buildScene(scene, o);
    r.upload(r.solid, this.solidBatch, gl.STREAM_DRAW);
    r.upload(r.glass, this.glassBatch, gl.STREAM_DRAW);

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(r.prog);
    gl.uniformMatrix4fv(r.uVP, false, this.vp);
    gl.uniform3f(r.uEye, this.cam.ex, this.cam.ey, this.cam.ez);
    gl.uniform3f(r.uLight, -0.349, -0.848, 0.399);
    gl.uniform1f(r.uAmbient, o.modern ? 0.5 : 0.4);
    gl.uniform1f(r.uBands, o.modern ? 0 : 4);

    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    r.drawMesh(r.land);
    r.drawMesh(r.solid);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    r.drawMesh(r.glass);
    gl.depthMask(true);
    gl.bindVertexArray(null);
    return r.canvas;
  };

  let supported = false;
  try {
    supported = !!document.createElement("canvas").getContext("webgl2");
  } catch (e) {
    supported = false;
  }

  window.TankView3D = {
    supported: supported,
    create: function (cfg) {
      return new View(cfg);
    },
  };
})();
