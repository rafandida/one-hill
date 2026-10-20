/**
 * Tank Wars — online transport.
 *
 * Browsers talk peer-to-peer over WebRTC data channels (PeerJS). The free
 * PeerJS cloud broker only introduces them: the host registers an ID built
 * from the invite code, guests dial that ID. PeerJS loads on first use, so
 * local modes never touch the network.
 *
 * Self-host the broker with `npx peer --port 9000` and open the game with
 * `?broker=your.host:9000` (the invite link carries it along).
 *
 * Exposes window.TankNet: makeCode, cleanCode, inviteLink, host, join.
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

  window.TankNet = {
    CODE_LEN: CODE_LEN,
    makeCode: makeCode,
    cleanCode: cleanCode,
    inviteLink: inviteLink,
    host: host,
    join: join,
  };
})();
