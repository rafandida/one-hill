/**
 * Tank Wars — the 1990 / 2026 switch, shared by the front page and the game.
 *
 * Loaded in <head>, before the stylesheets apply, so the page paints in the
 * right era from its first frame. The choice is remembered, a ?era=2026 link
 * picks it too, and other tabs (and the front page's attract-mode monitor)
 * follow along when it changes.
 */
(function () {
  "use strict";

  const KEY = "tankwars-era";
  const ERAS = ["1990", "2026"];
  const THEME_COLOR = { 1990: "#0000AA", 2026: "#070a1c" };

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null; /* private mode or blocked storage: 1990 it is */
    }
  }

  function store(era) {
    try {
      localStorage.setItem(KEY, era);
    } catch (e) {
      /* the switch still works for this page */
    }
  }

  const fromUrl = new URLSearchParams(location.search).get("era");
  let era = "1990";
  if (ERAS.indexOf(fromUrl) >= 0) {
    era = fromUrl;
    store(era);
  } else if (ERAS.indexOf(stored()) >= 0) {
    era = stored();
  }

  const root = document.documentElement;
  const listeners = [];
  root.dataset.era = era;

  function paint() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[era]);
    const picks = document.querySelectorAll("[data-era-pick]");
    for (let i = 0; i < picks.length; i++) {
      picks[i].setAttribute("aria-pressed", picks[i].dataset.eraPick === era ? "true" : "false");
    }
  }

  function apply(next, save) {
    if (ERAS.indexOf(next) < 0 || next === era) return;
    era = next;
    root.dataset.era = era;
    if (save) store(era);
    paint();
    for (let i = 0; i < listeners.length; i++) listeners[i](era);
  }

  // Another tab (or the page around an iframe) flipped the switch.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY && e.newValue) apply(e.newValue, false);
  });

  document.addEventListener("DOMContentLoaded", function () {
    const picks = document.querySelectorAll("[data-era-pick]");
    for (let i = 0; i < picks.length; i++) {
      picks[i].addEventListener("click", function () {
        apply(picks[i].dataset.eraPick, true);
      });
    }
    paint();
  });

  window.TankEra = {
    get: function () {
      return era;
    },
    set: function (next) {
      apply(next, true);
    },
    onChange: function (fn) {
      listeners.push(fn);
    },
  };
})();
