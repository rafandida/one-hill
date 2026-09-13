# Tank Wars

A playable browser tribute to Kenny Morse’s 1990 MS-DOS shareware artillery game *Tank Wars* / *Tank Wars 2.5*. It aims for the feel of that VGA classic — turn-based shots, wind, craters, and a tiny weapon locker — not a pixel-perfect clone and not a modern 3D remake.

All graphics are original. Nothing was copied from the DOS binaries.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 43721
```

Then visit `http://127.0.0.1:43721/`.

## How to play

On the title screen:

- **← →** change the highlighted value
- **↑ ↓** switch between *TANKS* (2–4) and *HUMANS* (0–4, rest are CPU)
- **Enter** or **click** to start (default is 1 human vs 1 CPU)

In battle, tanks drop onto a new hillside. On your turn:

| Key | Action |
| --- | --- |
| **A / D** or **← →** | Aim angle (0° right, 90° up, 180° left) |
| **W / S** or **↑ ↓** | Shot power |
| **Shift** | Nudge angle/power more slowly |
| **1–4** | Choose weapon |
| **Space** or **Enter** | Fire |
| **M** | Mute PC-speaker-ish beeps |
| **Esc** | Back to the title |

Wind pushes the shell sideways. It is shown in the top bar (`<<<` west, `>>>` east) and drifts a little each turn. Explosions bite craters out of the dirt; tanks fall if the ground under them disappears, and a long drop hurts.

Last living tank wins. **Enter** starts another battle on fresh terrain.

### Weapons

1. **SHELL** — standard high-explosive, unlimited
2. **HE BOMB** — fat crater, heavy damage (5 rounds)
3. **MIRV** — splits into three warheads on the way down (3)
4. **DIGGER** — burrows through dirt, then blows (4)

Crew (top-right) is health. Damaged tanks cannot crank the cannon as hard.

Hotseat: set humans to 2–4 and pass the keyboard. CPU fill-ins aim with a simple ballistic search plus a bit of slop.

## Project layout

```
index.html      page chrome
styles.css      monitor bezel, pixel scaling
js/game.js      the whole game (VGA palette, terrain, weapons, AI, HUD)
```

`js/game.js` is sectioned so you can add a weapon by appending to the `WEAPONS` array and handling a new `kind` in `stepShots`.

## Credit

Inspired by *Tank Wars* (1990) by Kenny Morse. This is an independent fan demo, not the original shareware program.
