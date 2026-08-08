# Portfolio — the corridor

A first-person portfolio. You start outside a lit door with `PORTFOLIO` over it, scroll to
push through, and walk down a dark service corridor. Each section is a room behind a door
in the wall. Click a door, the hinges give, you step inside.

Everything you see is generated in code. There are no texture downloads, no 3D model files
and no audio files — the concrete, the rust, the ceiling tiles, the sub-bass drone under the
building and the footsteps on wet floor are all synthesised at load time. Total download is
about **330 kB gzipped**, which is less than one photograph.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
npm run preview  # serve the built output
```

---

## Putting your own content in

**Edit `src/content.js`. That is the only file you need to touch.**

The corridor builds itself from the `ROOMS` array. Add an entry and a new door appears in the
wall, alternating left and right, and the hallway gets longer. Delete one and it closes up.
Reorder them and the doors move.

Each room takes an `accent` colour, which is the colour of the light bleeding under its door,
the glow on its name plate, and the trim on its text panel. That is how a visitor tells the
doors apart from down the hall.

Content inside a room is a list of `blocks`:

| kind       | use it for                | shape                                            |
| ---------- | ------------------------- | ------------------------------------------------ |
| `text`     | a paragraph               | `{ body }`                                       |
| `list`     | bullets                   | `{ items: [...] }`                               |
| `cards`    | projects, writing         | `{ items: [{ title, meta, body, tags, href }] }`  |
| `bars`     | skills with levels        | `{ items: [{ label, value }] }` — value is 0–100 |
| `timeline` | jobs, education           | `{ items: [{ when, what, where, body }] }`        |
| `links`    | contact details           | `{ items: [{ label, value, href }] }`             |

Two things are not in `content.js`:

- **Your resume PDF** — drop it at `public/resume.pdf` for the download link to work.
- **In-room fittings** — `Dressing()` in `src/scene/Room.jsx` switches on the room `id`.
  The five built-in ids (`about`, `projects`, `skills`, `experience`, `contact`) each get their
  own furniture; anything else falls back to the desk. A new section works fine without
  touching this — it just gets the default room.

### The content is printed on the walls

There is no text overlay. Each room's blocks are laid out by `src/board.js` into boards that
hang on the far wall, and you read them by standing in the room and looking at them. Short
content becomes one big board with large type; long content spreads across up to three. The
layout engine picks whichever it needs and scales the type to fill it.

Anything with an `href` — project cards, contact links — gets an invisible quad floated over
it in 3D, so it stays clickable. Without that, putting contact details on a wall would mean
nobody could click them.

The cost of this is real and worth stating: wall text cannot be selected, zoomed, or read by
a screen reader, and it does not reflow on a phone. That is what the plain resume below is
for. Do not delete it.

---

## The escape hatch

A photoreal dark corridor is the wrong interface for someone skimming twelve portfolios in
an afternoon, and it is the wrong interface for a screen reader. So the same content is also
a plain document, reachable three ways: the link on the title card, the `PLAIN RESUME` chip in
the corner, and `?plain=1` in the URL. If the browser has no WebGL 2 it loads automatically.

Keep this. It costs you nothing and it is the version that gets read when someone is in a hurry.

---

## How it is put together

| Path                     | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `src/content.js`         | **your content**                                                    |
| `src/board.js`           | lays content out onto the wall boards, and emits their hotspots     |
| `src/layout.js`          | every dimension of the building, in metres                          |
| `src/textures.js`        | the procedural materials — seeded noise baked to canvas             |
| `src/audio.js`           | the whole soundtrack, synthesised — bed, footsteps, doors, reverb   |
| `src/store.js`           | state; per-frame values live in `nav`, deliberately outside React    |
| `src/scene/Rig.jsx`      | the camera: walking, running, strafing, door pull, entering a room  |
| `src/scene/Corridor.jsx` | walls, floor, ceiling, failing tubes, pipes, debris, signage        |
| `src/scene/Door.jsx`     | one steel fire door, hinged, with light leaking under it            |
| `src/scene/Room.jsx`     | the room shell, its wall boards and its fittings                    |
| `src/scene/Flashlight.jsx` | the torch, its lag, its dying battery, and the haze in the beam   |
| `src/scene/Effects.jsx`  | bloom, grain, fringing, vignette                                    |
| `src/ui/`                | title card, HUD, plain resume                                       |

### Tuning the building

`src/layout.js` holds the geometry. `spacing` is the distance between doors, `width` and
`height` the corridor section, `roomD`/`roomW` the room size. Change a number and everything
downstream — wall segments, door positions, corridor length, the scroll range — follows.

### Tuning the materials

Open **`/texcheck.html`** while `npm run dev` is running. It bakes every material and shows
its albedo, normal and roughness maps at 1:1, plus a 2×2 tile so you can check the seams.
Judging a concrete recipe there takes seconds; judging it by walking the corridor in the dark
takes minutes. It is a dev-only page — `vite build` bundles `index.html` only, so it never
ships.

Two things worth knowing before you edit `textures.js`, because both cost real time to
rediscover:

- **Cracks.** `pow(ridge(noise), k)` draws a band along the contour where the noise crosses
  its own mean, and that band is only as thin as the noise's gradient is steep. Low-frequency
  noise gives fat organic veins, not hairlines. Raise the base frequency, not the exponent.
- **Peeling paint.** The exposed substrate has to be *darker* than the paint over it, with a
  tight edge. Lighter and soft, and it stops reading as missing paint and starts reading as
  mould.

### Performance

Only the torch casts shadows. Every other light is limited by `distance` so it touches as
few fragments as possible. Devicepixel ratio is capped at 1.6. drei's `PerformanceMonitor`
watches the frame rate and, if it stays low, sets `lowSpec` — which halves the shadow map,
thins the dust, drops the beam haze and strips the composer back to tone mapping and
vignette.

### Debugging

In dev, `window.__portfolio` exposes `{ state, set, nav, three }`. Useful for jumping around
without scrolling:

```js
__portfolio.nav.target = 24                              // teleport down the corridor
__portfolio.set({ phase: 'entering', activeRoom: 2 })    // walk into room 3
__portfolio.set({ plain: true })                         // show the plain resume
__portfolio.three.gl.info                                // draw calls, triangles, programs
```

Stripped from production builds.

---

## Controls

| Input                      | Does                                                    |
| -------------------------- | ------------------------------------------------------- |
| Scroll / swipe up          | Walk forward                                            |
| Scroll hard                | Break into a run                                        |
| `W` `S` / arrows           | Walk, held                                              |
| `Shift`                    | Run                                                     |
| `A` `D` / swipe sideways   | Step across the corridor                                |
| Move mouse                 | Look                                                    |
| Walk up to a door          | You turn to face it and it lights up — nothing more     |
| **Click the door**         | The only way into a room                                |
| `Esc`                      | Leave the room                                          |

### Doors only open when clicked

Coming alongside a door turns the camera to face it, brightens its name plate and shows a
prompt. It does **not** open it. Rooms are entered by clicking the door and nothing else:
`enterRoom()` has exactly one caller, the click handler in `Door.jsx`.

The click target is the door leaf itself, sized to the opening. The name plate above the door
is a separate mesh with no handler, so it cannot be clicked into a room, and the HUD sits
under `pointer-events: none` except for its own buttons.

### Sound

Everything is synthesised at runtime and fed through a procedurally generated convolution
reverb, which is most of what makes it sound like a corridor rather than a set of beeps.

**The bed is deliberately almost silent.** Most of the time you hear room tone and air
movement and nothing else. The dissonant cluster sits at a level you cannot really pick out,
and only swells as you close on a door — measured at −19.8 dB at rest against −14.6 dB
standing beside one. Your pulse only starts when there is something to have a pulse about.

Events — knocks, metal groans, scrapes, whispers, a detuned music-box bell, someone crying a
long way off — are scheduled 34 to 150 seconds apart, averaging one every thirteen seconds or
so. **The gaps are the point.** An earlier version ran seven schedulers at five-to-fifteen
seconds each, which worked out at something happening every two seconds; that is not an
abandoned building, it is a haunted house ride, and a drone that never stops is a fatiguing
hum rather than dread.

Footsteps change character between walking and running, and running adds breathing on
alternate strides. Everything that comes from elsewhere in the building is panned off-centre;
the bed ducks under the loud events so they cut through.

**Two things worth knowing before you touch `audio.js`:**

- **Put the weight where speakers work.** The first version of the bed lived entirely between
  36 and 73 Hz on sine and triangle waves. On monitors that is a wall of dread; on the laptop
  and phone speakers people actually use — which roll off below roughly 150 Hz — it is
  silence. Use sawtooths and let the *harmonics* in the 200 Hz–3 kHz band carry it. There is a
  metering tap on the master bus (`getAnalyser()`) so this can be measured rather than
  guessed at.
- **Formants are what make something sound human.** The crying is a sawtooth — a vocal-fold
  buzz — pushed through three parallel bandpass filters tuned to the first three formants of
  a mid-open vowel. Filtered noise never reads as a person no matter how you shape it.

Sound is off until you ask for it. Browsers block audio without a gesture, and a portfolio
that makes noise unprompted is a portfolio people close.
