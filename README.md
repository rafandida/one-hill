# Tank Wars

A playable browser tribute to Kenny Morse’s 1990 MS-DOS shareware artillery game *Tank Wars* / *Tank Wars 2.5*. VGA palette, turn-based shots, wind, craters — not a pixel-perfect clone and not a modern 3D remake.

All graphics and sounds are original. Beeps are generated in the browser (Web Audio oscillators + noise). Nothing was copied from the DOS binaries.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 43721
```

Then visit `http://127.0.0.1:43721/`. No build step, no backend.

## Modes (title screen)

A match is a **best of 5**: first tank to **3 hill wins** takes the series (or the leader after five hills).

| Setting | Options |
| --- | --- |
| **MODE** | **1P vs CPU** — you against one AI tank · **HOTSEAT** — 2–4 humans, same keyboard |
| **DIFFICULTY** | (vs CPU) Easy / Normal / Hard — AI names *Rookie*, *Lobber*, *Windmaster* |
| **PLAYERS** | (hotseat) 2, 3, or 4 |
| **SOUND** | On / Off |

**← →** change the highlighted value · **↑ ↓** move between rows · **Enter** or **click** to start.

Hotseat opens on `P1 — LOOK AWAY` before the hill is shown, then blanks again before every later human turn. Press **Enter** when the keyboard has been passed.

## Battle controls

Each hill is a new map: **canyon**, **mesa**, or a **water gap** (shells that hit the lake sink). Tanks drop in, then you aim and fire through the wind.

**Mouse:** drag around your tank to set the angle, drag up or down to set power, click to fire. A short arc is always drawn so you can see the shot leave the barrel. **T** extends it all the way to the landing, and that spends one guidance charge. Click a weapon on the bottom strip to select it. Click during a CPU turn to skip to the shot.

A centered hit kills. A graze takes a chunk and prints the damage. An HE bomb on the hull ends the tank. Shots fly quickly, and the next turn starts as soon as the shell lands.

| Key | Action |
| --- | --- |
| **A / D** or **← →** | Swing the muzzle. Left aims left (the angle number rises; 0° is flat right, 180° is flat left). A tap steps it; hold to sweep |
| **W / S** or **↑ ↓** | Shot power. A tap steps by 4; hold to sweep |
| **Shift** | Nudge angle/power more slowly |
| **1–6** or **click a weapon button** | Choose weapon. The bottom bar names each one and describes the one you picked |
| **[ ]** | Cycle weapons that still have ammo |
| **Space** or **Enter** | Fire. During a CPU turn, skip straight to the shot |
| **T** | Toggle the dotted arc while you have guidance. Firing with it on spends one charge. With none left, the banner says NO GUIDANCE |
| **M** | Mute / unmute all sound |
| **Esc** | Back to the title (ends the series) |

A **READY?** banner flashes on each turn. A near miss prints **CLOSE!** and a shield prints **BLOCKED**. Wind is in the top bar (`<<<` west, `>>>` east). It changes every turn, sometimes completely, so an aim that hit last time usually needs adjusting. A big change flashes **WIND SHIFT**. Explosions bite craters; tanks fall if the dirt under them disappears. The bottom strip shows the map, series score, cash, shields, and guidance.

### Shop

Between hills, each tank spends cash. A hill win pays **$700**, a kill **$400**, surviving without the win **$150**. You start with **$250**.

| Item | Cost | What it does |
| --- | --- | --- |
| HE BOMB x2 | $400 | Wider craters |
| MIRV | $500 | Splits into three warheads |
| DIRT BOMB | $300 | Builds a mound where it lands |
| GUIDANCE | $200 | One dotted trajectory |
| SHIELD | $650 | Blocks the next hit, including a fall |
| NUKE | $1200 | Huge blast |

**↑ ↓** pick, **Enter** buy, **N** finished, or click a row. The CPU buys on its own. Ammo you do not fire carries to the next hill. Crates in a battle still drop extra rounds.

### Weapons

1. **SHELL** — standard HE, unlimited
2. **HE** — fat crater
3. **MIRV** — splits on the way down
4. **DIG** — burrows, then blows
5. **NUKE** — shop or crate
6. **DIRT** — piles dirt instead of digging it

Crew (top-right) is health. Damaged tanks cannot crank the cannon as hard.

### Sound

All SFX are synthesized (no audio files): fire, explosion, hit, death, splash, UI ticks while you adjust aim, crate and shop pickups, a light wind whoosh, and a win or lose jingle.

- **M** during play, or the **SOUND** row on the title screen
- HUD shows **MUTE** / **SND**

## Project layout

```
index.html      page chrome
styles.css      monitor bezel, pixel scaling
js/game.js      the whole game (palette, terrain, weapons, shop, AI, audio, HUD)
```

Add a weapon by appending to the `WEAPONS` array in `js/game.js` and, if it needs special flight, a new `kind` in `stepShots`. Shop entries live in the `SHOP` array.

## Credit

Inspired by *Tank Wars* (1990) by Kenny Morse. This is an independent fan demo, not the original shareware program.
