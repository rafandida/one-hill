/**
 * One Hill (a Tank Wars tribute) — online transport.
 *
 * Browsers talk peer-to-peer over WebRTC data channels (PeerJS). The free
 * PeerJS cloud broker only introduces them: the host registers an ID built
 * from the invite code, guests dial that ID. PeerJS loads on first use, so
 * local modes never touch the network.
 *
 * Self-host the broker with `npx peer --port 9000` and open the game with
 * `?broker=your.host:9000` (the invite link carries it along).
 *
 * Public rooms have no server either. One browser holds the list: whoever
 * first registers the well-known lobby ID. Everyone else dials that ID to read
 * the list or to add their room to it. When the holder leaves, the others
 * notice the dropped link and one of them takes the ID over; hosts then put
 * their rooms back. See lobby() below.
 *
 * Exposes window.TankNet: makeCode, cleanCode, inviteLink, host, join, lobby.
 */
(function () {
  "use strict";

  const PEERJS_URLS = [
    "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js",
    "https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js",
  ];
  const ID_PREFIX = "tankwars90s-";
  // No I, O, 0 or 1: codes get read aloud and typed from phones.
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const CODE_LEN = 5;
  const PING_MS = 2000;
  const DEAD_MS = 9000;
  const DIAL_MS = 15000;
  const LOBBY_ID = ID_PREFIX + "lobby";
  // The broker takes about five seconds to say that nobody holds an ID.
  const LOBBY_DIAL_MS = 9000;
  const LOBBY_MAX = 30;

  const params = new URLSearchParams(location.search);

  function makeCode() {
    let s = "";
    const buf = new Uint32Array(CODE_LEN);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
    for (let i = 0; i < CODE_LEN; i++) {
      const r = buf[i] || Math.floor(Math.random() * 1e9);
      s += ALPHABET[r % ALPHABET.length];
    }
    return s;
  }

  function cleanCode(raw) {
    let s = "";
    const up = String(raw || "").toUpperCase();
    for (let i = 0; i < up.length && s.length < CODE_LEN; i++) {
      if (ALPHABET.indexOf(up[i]) >= 0) s += up[i];
    }
    return s;
  }

  function inviteLink(code) {
    if (location.protocol !== "http:" && location.protocol !== "https:") return "";
    const q = new URLSearchParams();
    q.set("room", code);
    if (params.get("broker")) q.set("broker", params.get("broker"));
    return location.origin + location.pathname + "?" + q.toString();
  }

  function brokerOptions() {
    const opts = { debug: 0 };
    const raw = params.get("broker");
    if (!raw) return opts;
    try {
      const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : "http://" + raw);
      opts.host = u.hostname;
      opts.secure = u.protocol === "https:";
      opts.port = Number(u.port) || (opts.secure ? 443 : 80);
      opts.path = u.pathname || "/";
    } catch (e) {
      /* fall back to the cloud broker */
    }
    return opts;
  }

  let loading = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      let i = 0;
      (function next() {
        if (i >= PEERJS_URLS.length) {
          loading = null;
          reject(failure("load"));
          return;
        }
        const s = document.createElement("script");
        s.src = PEERJS_URLS[i++];
        s.async = true;
        s.onload = function () {
          if (window.Peer) resolve(window.Peer);
          else next();
        };
        s.onerror = function () {
          s.remove();
          next();
        };
        document.head.appendChild(s);
      })();
    });
    return loading;
  }

  const WHY = {
    load: "CAN'T LOAD THE NET CODE",
    "peer-unavailable": "NO ROOM WITH THAT CODE",
    "browser-incompatible": "THIS BROWSER CAN'T PLAY ONLINE",
    network: "MATCHMAKER UNREACHABLE",
    "server-error": "MATCHMAKER UNREACHABLE",
    "socket-error": "MATCHMAKER UNREACHABLE",
    "socket-closed": "MATCHMAKER UNREACHABLE",
    "unavailable-id": "ROOM CODE TAKEN, TRY AGAIN",
    timeout: "COULD NOT CONNECT",
  };

  function failure(type) {
    const e = new Error(WHY[type] || "CONNECTION FAILED");
    e.type = type;
    return e;
  }

  /**
   * One open data channel. Pings keep idle links honest: a tab that vanishes
   * without closing cleanly is dropped after DEAD_MS of silence.
   */
  function wrap(conn, onMessage, onClose) {
    const link = { peer: conn.peer, open: true, last: Date.now() };
    const timer = setInterval(function () {
      if (Date.now() - link.last > DEAD_MS) finish();
      else link.send({ t: "~" });
    }, PING_MS);
    function finish() {
      if (!link.open) return;
      link.open = false;
      clearInterval(timer);
      try {
        conn.close();
      } catch (e) {
        /* already gone */
      }
      onClose(link);
    }
    link.send = function (msg) {
      if (!link.open) return;
      try {
        conn.send(msg);
      } catch (e) {
        finish();
      }
    };
    link.close = finish;
    conn.on("data", function (msg) {
      link.last = Date.now();
      if (msg && msg.t !== "~") onMessage(link, msg);
    });
    conn.on("close", finish);
    conn.on("error", finish);
    return link;
  }

  /**
   * Open a room. Resolves once the broker has registered the code.
   * on: { join(link), message(link, msg), leave(link) }
   */
  function host(on) {
    return loadPeer().then(function (Peer) {
      return new Promise(function (resolve, reject) {
        let tries = 0;
        (function attempt() {
          const code = makeCode();
          const peer = new Peer(ID_PREFIX + code, brokerOptions());
          const links = [];
          let opened = false;
          const room = {
            code: code,
            send: function (link, msg) {
              link.send(msg);
            },
            broadcast: function (msg, except) {
              for (let i = 0; i < links.length; i++) {
                if (links[i] !== except) links[i].send(msg);
              }
            },
            close: function () {
              links.slice().forEach(function (l) {
                l.close();
              });
              peer.destroy();
            },
          };
          peer.on("open", function () {
            opened = true;
            resolve(room);
          });
          peer.on("connection", function (conn) {
            conn.on("open", function () {
              const link = wrap(conn, on.message, function (l) {
                const i = links.indexOf(l);
                if (i >= 0) links.splice(i, 1);
                on.leave(l);
              });
              links.push(link);
              on.join(link);
            });
          });
          peer.on("disconnected", function () {
            // Lost the broker; open games keep running peer-to-peer.
            if (!peer.destroyed) peer.reconnect();
          });
          peer.on("error", function (err) {
            if (opened) return;
            peer.destroy();
            if (err.type === "unavailable-id" && ++tries < 4) attempt();
            else reject(failure(err.type));
          });
        })();
      });
    });
  }

  /**
   * Dial a room by code. Resolves with an open link to the host.
   * on: { message(link, msg), leave(link) }
   */
  function join(code, on) {
    return loadPeer().then(function (Peer) {
      return new Promise(function (resolve, reject) {
        const peer = new Peer(brokerOptions());
        let link = null;
        const timer = setTimeout(function () {
          if (link) return;
          peer.destroy();
          reject(failure("timeout"));
        }, DIAL_MS);
        peer.on("open", function () {
          const conn = peer.connect(ID_PREFIX + code, { reliable: true, serialization: "json" });
          conn.on("open", function () {
            clearTimeout(timer);
            link = wrap(conn, on.message, function (l) {
              peer.destroy();
              on.leave(l);
            });
            resolve(link);
          });
        });
        peer.on("disconnected", function () {
          if (link && !peer.destroyed) peer.reconnect();
        });
        peer.on("error", function (err) {
          if (link) return;
          clearTimeout(timer);
          peer.destroy();
          reject(failure(err.type));
        });
      });
    });
  }

  /** A room as the list carries it, or null if it is not a well-formed one. */
  function cleanRoom(r) {
    if (!r || typeof r !== "object") return null;
    const code = cleanCode(r.code);
    if (code.length !== CODE_LEN || code !== r.code) return null;
    function whole(v, lo, hi) {
      v = Math.floor(Number(v));
      return v >= lo && v <= hi ? v : lo;
    }
    return { code: code, humans: whole(r.humans, 1, 4), cpu: whole(r.cpu, 0, 3), diff: whole(r.diff, 0, 2) };
  }

  function cleanRooms(list) {
    const out = [];
    const seen = {};
    if (!Array.isArray(list)) return out;
    for (let i = 0; i < list.length && out.length < LOBBY_MAX; i++) {
      const r = cleanRoom(list[i]);
      if (!r || seen[r.code]) continue;
      seen[r.code] = true;
      out.push(r);
    }
    return out;
  }

  /**
   * The public room list. Watches it, and optionally lists a room of your own.
   * on: { rooms(list), state("connecting" | "live" | "down") }
   * Returns { publish(room or null), close() }. A room is
   * { code, humans, cpu, diff }; publish(null) takes it off the list.
   *
   * Whoever holds LOBBY_ID keeps the list and sends it to every link whenever
   * it changes. A room lives exactly as long as its host's link to the holder.
   * Entries are untrusted (any browser can post one), so they are checked on
   * the way in and again on the way out, and a made-up code just fails to dial.
   */
  function lobby(on) {
    let closed = false;
    let peer = null;
    let link = null; // to the holder, when that is someone else
    let held = null; // { links, rooms } when this browser is the holder
    let mine = null;
    let timer = 0;
    let state = "";

    function setState(s) {
      if (s === state || closed) return;
      state = s;
      if (on.state) on.state(s);
    }

    function show(list) {
      if (!closed && on.rooms) on.rooms(cleanRooms(list));
    }

    function drop() {
      clearTimeout(timer);
      const p = peer;
      peer = null;
      link = null;
      held = null;
      if (p && !p.destroyed) p.destroy();
    }

    /** Try again after a pause. The spread keeps a crowd from all claiming the ID at once. */
    function again(slow) {
      if (closed) return;
      drop();
      show([]);
      timer = setTimeout(dial, (slow ? 4000 : 300) + Math.random() * (slow ? 4000 : 1500));
    }

    function heldRooms() {
      const list = mine ? [mine] : [];
      for (let i = 0; i < held.links.length; i++) {
        if (held.links[i].room) list.push(held.links[i].room);
      }
      return cleanRooms(list);
    }

    function pushHeld() {
      const list = heldRooms();
      for (let i = 0; i < held.links.length; i++) held.links[i].send({ t: "rooms", rooms: list });
      show(list);
    }

    function dial() {
      if (closed) return;
      loadPeer().then(
        function (Peer) {
          if (closed) return;
          setState("connecting");
          const p = new Peer(brokerOptions());
          peer = p;
          let up = false;
          timer = setTimeout(function () {
            if (!up && peer === p) again(true);
          }, LOBBY_DIAL_MS);
          p.on("open", function () {
            const conn = p.connect(LOBBY_ID, { reliable: true, serialization: "json" });
            conn.on("open", function () {
              if (peer !== p) return;
              up = true;
              clearTimeout(timer);
              link = wrap(
                conn,
                function (l, m) {
                  if (m.t === "rooms") show(m.rooms);
                },
                function () {
                  if (peer === p) again(false);
                }
              );
              setState("live");
              if (mine) link.send({ t: "room", room: mine });
            });
          });
          p.on("error", function (err) {
            if (up || peer !== p) return;
            if (err.type === "peer-unavailable") {
              // Nobody holds the list. Hold it.
              drop();
              claim(Peer);
            } else {
              setState("down");
              again(true);
            }
          });
        },
        function () {
          setState("down");
        }
      );
    }

    function claim(Peer) {
      if (closed) return;
      const p = new Peer(LOBBY_ID, brokerOptions());
      peer = p;
      let up = false;
      p.on("open", function () {
        if (peer !== p) return;
        up = true;
        held = { links: [] };
        setState("live");
        pushHeld();
      });
      p.on("connection", function (conn) {
        conn.on("open", function () {
          if (peer !== p || !held) {
            conn.close();
            return;
          }
          const l = wrap(
            conn,
            function (from, m) {
              if (m.t !== "room" || !held) return;
              from.room = cleanRoom(m.room);
              pushHeld();
            },
            function (gone) {
              if (!held) return;
              const i = held.links.indexOf(gone);
              if (i >= 0) held.links.splice(i, 1);
              if (gone.room) pushHeld();
            }
          );
          l.room = null;
          held.links.push(l);
          l.send({ t: "rooms", rooms: heldRooms() });
        });
      });
      p.on("disconnected", function () {
        if (peer === p && !p.destroyed) p.reconnect();
      });
      p.on("error", function (err) {
        if (up || peer !== p) return;
        // "unavailable-id": someone else took it a moment ago. Go and dial them.
        if (err.type !== "unavailable-id") setState("down");
        again(err.type !== "unavailable-id");
      });
    }

    // Leaving the page frees the ID straight away instead of when the broker notices.
    function leave() {
      api.close();
    }
    window.addEventListener("pagehide", leave);

    const api = {
      publish: function (room) {
        mine = room ? cleanRoom(room) : null;
        if (closed) return;
        if (held) pushHeld();
        else if (link) link.send({ t: "room", room: mine });
      },
      close: function () {
        if (closed) return;
        closed = true;
        window.removeEventListener("pagehide", leave);
        drop();
      },
    };
    dial();
    return api;
  }

  window.TankNet = {
    CODE_LEN: CODE_LEN,
    makeCode: makeCode,
    cleanCode: cleanCode,
    inviteLink: inviteLink,
    host: host,
    join: join,
    lobby: lobby,
  };
})();
