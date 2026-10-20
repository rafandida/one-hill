# Tank Wars

A playable browser tribute to Kenny Morse’s 1990 MS-DOS shareware artillery game *Tank Wars* / *Tank Wars 2.5*. VGA palette, turn-based shots, wind, craters — not a pixel-perfect clone and not a modern 3D remake.

All graphics and sounds are original. Beeps are generated in the browser (Web Audio oscillators + noise). Nothing was copied from the DOS binaries.

## Run it

Open `index.html` (the front page) or `play.html` (straight into the game) in a browser, or serve the folder:

```bash
python3 -m http.server 43721
```

Then visit `http://127.0.0.1:43721/`. No build step, no backend. Online play needs an internet connection (see below); everything else runs offline.

## Front page

`index.html` is a landing page built as a cross-section of the battlefield: a night sky and hill on top, then one soil layer per section down to bedrock, with the content in DOS-style text-mode windows.

- The hero is playable. Click or tap anywhere (or focus it and press Enter) to lob a shell at the logo. Go quiet and the CPU tank shoots it instead. The logo rebuilds itself a pixel at a time.
- The beige monitor runs the real game in attract mode (`play.html?demo`: three CPU tanks on HARD, muted). It only loads while it is on screen. With reduced motion turned on, a still frame (`img/demo.png`) is shown instead.
- The setup dialog, the invite-code box, and the blast-radius chart all link into the game. Keycaps on the page press down when you press the real key.
- Sound is off until the **SND** button in the menu bar turns it on.

Links that work on `play.html`:

| URL | Opens |
| --- | --- |
| `play.html?mode=cpu` / `hotseat` / `online` | the title screen with that mode picked |
| `play.html?host` | a new online room straight away |
| `play.html?room=K7Q4M` | the join screen, already dialling that room |
| `play.html?demo` | attract mode, CPU vs CPU |

A `?room=` link that lands on `index.html` is forwarded to the game.

## Modes (title screen)

A match is a **best of 5**: first tank to **3 hill wins** takes the series (or the leader after five hills).

| Setting | Options |
| --- | --- |
| **MODE** | **1P vs CPU** — you against 1–3 AI tanks · **HOTSEAT** — 2–4 humans, same keyboard · **ONLINE** — 2–4 players on their own screens |
| **DIFFICULTY** | (vs CPU) Easy / Normal / Hard — a lone AI is named *Rookie*, *Lobber*, or *Windmaster* |
| **CPU TANKS** | (vs CPU) 1, 2, or 3. With more than one it is a free-for-all: *Viper*, *Hammer*, and *Brutus* shoot whoever is closest, including each other |
| **PLAYERS** | (hotseat) 2, 3, or 4 |
| **ROOM** | (online) **HOST** opens a room and shows an invite code · **JOIN** asks for a friend's code |
| **SOUND** | On / Off |

**← →** change the highlighted value · **↑ ↓** move between rows · **Enter** or **click** to start.

Hotseat opens on `P1 — LOOK AWAY` before the hill is shown, then blanks again before every later human turn. Press **Enter** when the keyboard has been passed.

## Online play

1. One player picks **ONLINE → HOST**. The room screen shows a five-letter **invite code** (no I, O, 0 or 1, so it is easy to read out).
2. Friends either open the **invite link** (`…/play.html?room=K7Q4M`, copied with **C** or the **COPY LINK** button; phones get the share sheet) or pick **ONLINE → JOIN** and type the code. Pasting the code or the whole link works too.
3. The host can fill empty seats with **CPU TANKS** (and pick their difficulty), then presses **Enter** / **START**. Up to four tanks in total.

How it plays:

- Each player aims on their own screen. Everyone else watches the barrel swing live and sees the same shell, crater, and wind.
- Your tank wears a **YOU** tag. The top-right corner shows `YOUR SHOT 0:45` or `P2 AIMING 0:31`.
- Every turn has a **45-second shot clock**. When it runs out your current aim fires. If a player goes silent, the host fires their last aim shortly after.
- Between hills everyone shops at the same time. The next hill starts when all players press **DONE**.
- If a guest leaves, a bot takes over their tank (`P2-BOT`) and the series carries on. If the host leaves, the series ends for everyone. **Esc** leaves the room.
- A room cannot be joined once the series has started.

How it works: the browsers connect peer-to-peer over WebRTC using [PeerJS](https://peerjs.com/), which is loaded from a CDN only when you pick ONLINE. The free PeerJS cloud broker introduces the players; after that, game data goes directly between browsers (or through PeerJS's public relay when a strict NAT blocks a direct link). The host owns every random roll (maps, wind, crates, CPU aim) and sends a snapshot at the start of each turn. Shots travel as angle, power, and weapon. Every screen flies them itself on the same fixed 1/120 s step, so all screens see the same result, and the next snapshot corrects any rounding drift.

To run your own broker instead of the public one (for example if it is down, or you are on a LAN):

```bash
npx peer --port 9000
```

Then open the game with `?broker=your.host:9000` (use `https://…` for a TLS broker). Invite links carry the setting along.

## Sharing a result

When a series ends, the game builds a result card: a 1200×675 PNG of the final blow of the last hill, with who took the series, the score, and every tank's hills, kills, damage, and shots. A dialog opens a moment later:

- **SHARE…** hands the picture itself to any app (Instagram, WhatsApp, Messages, X…). It appears on phones and on browsers that can share files.
- **SAVE IMAGE** and **COPY IMAGE** for desktops.
- **POST TO X / FACEBOOK / WHATSAPP / REDDIT** opens a ready-made post with the text and a link to the front page. Those links can't attach the picture, so save or copy it first.

The card and text are told from each screen's player ("I won a Tank Wars series 3-1 against WINDMASTER…", "P2 beat me 3-0…"); online, everyone gets their own. **Esc** closes it; **S** or the **SHARE RESULT** button on the result panel brings it back.

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

**↑ ↓** pick, **Enter** buy, **N** finished, or click a row. CPU tanks buy on their own. Ammo you do not fire carries to the next hill. Crates in a battle still drop extra rounds.

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
index.html      front page
landing.css     front page styles (VGA palette, soil layers, text-mode windows)
js/landing.js   front page toys (shootable logo, attract monitor, join box, blast chart)
play.html       the game page
styles.css      game page: monitor bezel, pixel scaling
js/net.js       online transport (PeerJS loader, invite codes, peer links)
js/game.js      the whole game (palette, terrain, weapons, shop, AI, audio, HUD, online protocol)
favicon.svg     pixel tank icon
img/demo.png    a real frame from the game, used when motion is reduced
fonts/          VT323 (SIL Open Font License, see VT323-OFL.txt)
```

Add a weapon by appending to the `WEAPONS` array in `js/game.js` and, if it needs special flight, a new `kind` in `stepShots`. Shop entries live in the `SHOP` array.

## Credit

Inspired by *Tank Wars* (1990) by Kenny Morse. This is an independent fan demo, not the original shareware program.
