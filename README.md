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

| Setting | Options |
| --- | --- |
| **MODE** | **1P vs CPU** — you against one AI tank · **HOTSEAT** — 2–4 humans, same keyboard |
| **DIFFICULTY** | (vs CPU) Easy / Normal / Hard — AI names *Rookie*, *Lobber*, *Windmaster* |
| **PLAYERS** | (hotseat) 2, 3, or 4 |
| **SOUND** | On / Off |

**← →** change the highlighted value · **↑ ↓** move between rows · **Enter** or **click** to start.

## Battle controls

Tanks drop onto a new hillside. On your turn set angle and power, pick a weapon, and fire through the wind.

| Key | Action |
| --- | --- |
| **A / D** or **← →** | Aim angle (0° right, 90° up, 180° left) |
| **W / S** or **↑ ↓** | Shot power |
| **Shift** | Nudge angle/power more slowly |
| **1–5** | Choose weapon |
| **[ ]** | Cycle weapons that still have ammo |
| **Space** or **Enter** | Fire |
| **T** | Toggle dotted trajectory preview |
| **M** | Mute / unmute all sound |
| **Esc** | Back to the title |

A **READY?** banner flashes on each turn. Wind is in the top bar (`<<<` west, `>>>` east) and drifts a little every round. Explosions bite craters; tanks fall if the dirt under them disappears (long drops hurt). Last living tank wins. **Enter** starts another battle on fresh terrain.

### Weapons

Shown on the bottom strip. Limited rounds refill from **supply crates** that drop after kills (and sometimes between turns). Drive over a crate — or let it land on you — to collect it.

1. **SHELL** — standard HE, unlimited
2. **HE BOMB** — fat crater, heavy damage
3. **MIRV** — splits into three warheads on the way down
4. **DIGGER** — burrows through dirt, then blows
5. **NUKE** — rare crate prize; huge blast

Crew (top-right) is health. Damaged tanks cannot crank the cannon as hard.

### Sound

All SFX are synthesized (no audio files): fire, explosion, hit, death, UI ticks while you adjust aim, crate pickup, a light wind whoosh, and a win or lose jingle.

- **M** during play or the **SOUND** row on the title screen
- HUD shows **MUTE** / **SND**

## Project layout

```
index.html      page chrome
styles.css      monitor bezel, pixel scaling
js/game.js      the whole game (palette, terrain, weapons, AI, audio, HUD)
```

Add a weapon by appending to the `WEAPONS` array in `js/game.js` and, if it needs special flight, a new `kind` in `stepShots`.

## Credit

Inspired by *Tank Wars* (1990) by Kenny Morse. This is an independent fan demo, not the original shareware program.
