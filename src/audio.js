/* ============================================================================
 * PROCEDURAL AUDIO
 * ----------------------------------------------------------------------------
 * No audio files. Everything is synthesised with WebAudio: the sub-bass under
 * the building, ventilation hiss, an evolving pad, distant structural knocks
 * and metal groans, whispers you are not quite sure you heard, footsteps on wet
 * concrete at walking and running pace, breathing when you run, fluorescent
 * ticks, and doors that open like they weigh eighty kilos.
 *
 * Everything is fed through a procedurally generated convolution reverb, which
 * is what actually makes it sound like a corridor rather than a set of beeps.
 *
 * Browsers refuse to start audio without a gesture, so nothing exists until
 * start() is called from a click.
 * ========================================================================== */

let ctx = null
let master = null // everything lands here
let dry = null // straight to the limiter
let wet = null // via the convolver
let limiter = null
let noiseBuf = null
let running = false
let bedBuilt = false

/* Handles the bed keeps hold of, so tension and ducking can move them. */
let bed = null
let tension = 0

/* Brown-ish noise: integrate white and leak. Heavier and less hissy than white,
 * which is what most of these sounds actually need. */
function noiseBuffer() {
  if (noiseBuf) return noiseBuf
  const len = ctx.sampleRate * 3
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    d[i] = last * 3.5
  }
  return noiseBuf
}

/* A corridor impulse response: a few discrete early reflections off the walls,
 * then an exponentially decaying noise tail. */
function impulse(seconds = 2.4, decay = 3.0) {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / len
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay)
    }
    // early reflections — the parallel walls of a narrow corridor
    for (const [ms, amp] of [
      [11, 0.5],
      [19, 0.38],
      [31, 0.3],
      [47, 0.22],
      [67, 0.16],
      [96, 0.1],
    ]) {
      const i = Math.floor((ms / 1000) * rate) + (ch ? 37 : 0)
      if (i < len) d[i] += amp * (Math.random() > 0.5 ? 1 : -1)
    }
  }
  return buf
}

const now = () => ctx.currentTime

export function isRunning() {
  return running
}

/* Metering tap on the master bus. Exists so the mix can be measured rather
 * than guessed at — the first version of the bed sat entirely below 150 Hz and
 * was therefore inaudible on the speakers most people have, which is not
 * something you can catch by listening on good headphones. */
let analyser = null
export function getAnalyser() {
  if (!ctx || !master) return null
  if (!analyser) {
    analyser = ctx.createAnalyser()
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0.6
    master.connect(analyser)
  }
  return analyser
}

export function start() {
  if (running) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  if (!ctx) {
    // interactive: smallest buffer the device will give us, so a footstep
    // fires when the foot lands rather than 100ms later
    ctx = new AC({ latencyHint: 'interactive' })

    // a limiter on the end, so the bed can sit loud without anything clipping
    limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 4
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.22

    master = ctx.createGain()
    master.gain.value = 0
    master.connect(limiter)
    limiter.connect(ctx.destination)

    dry = ctx.createGain()
    dry.gain.value = 1
    dry.connect(master)

    const convolver = ctx.createConvolver()
    convolver.buffer = impulse()
    wet = ctx.createGain()
    wet.gain.value = 0.34
    wet.connect(convolver)
    convolver.connect(master)
  }
  ctx.resume()
  running = true
  master.gain.cancelScheduledValues(now())
  master.gain.setTargetAtTime(1.6, now(), 1.4)
  if (!bedBuilt) {
    buildBed()
    bedBuilt = true
  }
}

export function stop() {
  if (!ctx || !running) return
  running = false
  master.gain.cancelScheduledValues(now())
  master.gain.setTargetAtTime(0, now(), 0.4)
}

export function toggle() {
  if (running) stop()
  else start()
  return running
}

/* Route a node to both the direct path and the reverb, with a per-sound
 * balance. Close, dry things (footsteps) send little; big things (doors) send
 * a lot, which is what makes them sound like they are in a large space.
 *
 * `pan` is -1 to 1. Everything arriving from somewhere else in the building is
 * placed off-centre — a noise with no position reads as being inside your head
 * rather than down the corridor, and that alone stops it being frightening. */
function out(node, send = 0.25, pan = 0) {
  let src = node
  if (pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    node.connect(p)
    src = p
  }
  src.connect(dry)
  const s = ctx.createGain()
  s.gain.value = send
  src.connect(s)
  s.connect(wet)
}

/* Somewhere off to one side, never dead centre. */
const offCentre = () => (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5)

/* ---- the permanent bed --------------------------------------------------- */

/* The first version of this put everything between 36 and 73 Hz, on sine and
 * triangle waves, behind a 190 Hz lowpass. On studio monitors that is a wall of
 * dread. On the laptop and phone speakers everyone actually uses — which roll
 * off hard below about 150 Hz — it is very nearly silence, which is why it did
 * not sound like anything at all.
 *
 * So: the weight is carried by HARMONICS in the 200 Hz to 3 kHz band, where
 * small drivers actually work. The low fundamentals are still there for anyone
 * on headphones, but nothing depends on hearing them. */
function buildBed() {
  bed = {}

  /* One submix for the whole bed, so it can be EQ'd as a unit and ducked out
   * of the way when something actually happens. Mixing each layer straight to
   * the master is what makes a soundtrack sound like a pile of loops rather
   * than one thing. */
  const bus = ctx.createGain()
  bus.gain.value = 1
  bed.bus = bus

  // 32 Hz highpass: nothing musical lives down there, but the rumble was
  // eating limiter headroom and making everything else quieter
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 32
  // and a dip where the drone and the knocks were fighting for the same space
  const mud = ctx.createBiquadFilter()
  mud.type = 'peaking'
  mud.frequency.value = 340
  mud.Q.value = 1.1
  mud.gain.value = -3.5
  bus.connect(hp).connect(mud)
  out(mud, 0.5)

  /* 1. the engine. Sawtooth, not sine — a 55 Hz saw puts real energy at 110,
   *    165 and 220 Hz, so it reads as a heavy machine even through a speaker
   *    that cannot reproduce 55 Hz at all. */
  const engine = ctx.createGain()
  engine.gain.value = 0.11
  engine.connect(bus)
  const engineFilter = ctx.createBiquadFilter()
  engineFilter.type = 'bandpass'
  engineFilter.frequency.value = 210
  engineFilter.Q.value = 0.9
  engineFilter.connect(engine)
  for (const [freq, gain, type] of [
    [55, 0.5, 'sawtooth'],
    [55.6, 0.42, 'sawtooth'], // 0.6 Hz apart: a slow, queasy beat
    [110, 0.2, 'triangle'],
    [36.7, 0.5, 'sine'], // for headphones only
  ]) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = gain
    o.connect(g).connect(engineFilter)
    o.start()
  }

  /* 2. the dread cluster. Bb3 against B3 is a minor second — they beat against
   *    each other about fourteen times a second, which the ear reads as
   *    roughness rather than pitch. The tritone on top is the actual horror
   *    interval. This is the layer doing the emotional work. */
  /* Near silent by default. A dissonant chord that never stops is not dread,
   * it is a fatiguing hum — the corridor should mostly be an empty room, and
   * this should only rise as you close on a door. */
  const cluster = ctx.createGain()
  cluster.gain.value = 0.008
  bed.cluster = cluster
  cluster.connect(bus)
  const clusterFilter = ctx.createBiquadFilter()
  clusterFilter.type = 'lowpass'
  clusterFilter.frequency.value = 1400
  clusterFilter.Q.value = 1.2
  clusterFilter.connect(cluster)
  for (const [freq, gain, type] of [
    [233.08, 0.3, 'triangle'], // Bb3
    [246.94, 0.26, 'triangle'], // B3 — the minor second
    [329.63, 0.16, 'sine'], // E4 — tritone against Bb
    [466.16, 0.07, 'sawtooth'], // Bb4, adds bite
  ]) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = gain
    o.connect(g).connect(clusterFilter)
    o.start()
  }
  const sweep = ctx.createOscillator()
  sweep.type = 'sine'
  sweep.frequency.value = 0.026
  const sweepAmt = ctx.createGain()
  sweepAmt.gain.value = 700
  sweep.connect(sweepAmt).connect(clusterFilter.frequency)
  sweep.start()

  /* 3. shimmer — a thin high tone that drifts. Sits where tinnitus sits, and
   *    the drift stops your ear filing it away as part of the room. */
  const shimmer = ctx.createGain()
  shimmer.gain.value = 0.0035
  bed.shimmer = shimmer
  shimmer.connect(bus)
  const sh = ctx.createOscillator()
  sh.type = 'sine'
  sh.frequency.value = 2640
  sh.connect(shimmer)
  sh.start()
  const drift = ctx.createOscillator()
  drift.type = 'sine'
  drift.frequency.value = 0.047
  const driftAmt = ctx.createGain()
  driftAmt.gain.value = 190
  drift.connect(driftAmt).connect(sh.frequency)
  drift.start()

  /* 4. Room tone. With everything else pulled back this is the constant, so it
   *    has to move — a static hiss stops registering within seconds, and then
   *    the corridor sounds like nothing at all rather than like somewhere. Two
   *    slow LFOs on level and colour are enough to keep the ear listening. */
  const air = ctx.createBufferSource()
  air.buffer = noiseBuffer()
  air.loop = true
  const airFilter = ctx.createBiquadFilter()
  airFilter.type = 'bandpass'
  airFilter.frequency.value = 780
  airFilter.Q.value = 0.45
  const airGain = ctx.createGain()
  airGain.gain.value = 0.14
  air.connect(airFilter).connect(airGain).connect(bus)
  air.start()

  const airLfo = ctx.createOscillator()
  airLfo.type = 'sine'
  airLfo.frequency.value = 0.031
  const airLfoAmt = ctx.createGain()
  airLfoAmt.gain.value = 0.055
  airLfo.connect(airLfoAmt).connect(airGain.gain)
  airLfo.start()

  const airColour = ctx.createOscillator()
  airColour.type = 'sine'
  airColour.frequency.value = 0.019
  const airColourAmt = ctx.createGain()
  airColourAmt.gain.value = 320
  airColour.connect(airColourAmt).connect(airFilter.frequency)
  airColour.start()

  /* 5. a slow irregular swell, like the building drawing breath */
  const swellPump = () => {
    if (running) swell()
    setTimeout(swellPump, 20000 + Math.random() * 24000)
  }
  setTimeout(swellPump, 9000)

  /* Your pulse, but only when there is something to have a pulse about. A
   * heartbeat every 1.7 seconds forever was a metronome, and a metronome is
   * the opposite of tense. */
  const beat = () => {
    if (running && tension > 0.45) {
      thump(96, 0.09, 0.26)
      setTimeout(() => running && thump(84, 0.07, 0.19), 290)
    }
    setTimeout(beat, 1400 + Math.random() * 500)
  }
  setTimeout(beat, 3500)

  /* Sparse on purpose. Seven schedulers at five-to-fifteen seconds each meant
   * something happened roughly every two seconds — which is not an abandoned
   * building, it is a haunted house ride. These average out to something every
   * fifteen seconds or so, and the gaps between are the point. */
  scheduleRandom(knock, 34000, 80000)
  scheduleRandom(groan, 48000, 105000)
  scheduleRandom(whisper, 38000, 90000)
  scheduleRandom(scrape, 52000, 115000)
  scheduleRandom(bell, 70000, 150000)
  scheduleRandom(cry, 55000, 130000)
}

function scheduleRandom(fn, min, max) {
  const go = () => {
    setTimeout(() => {
      if (running) fn()
      go()
    }, min + Math.random() * (max - min))
  }
  go()
}

/* Pull the bed down for a moment so something else can be heard over it. This
 * is the single biggest difference between a mix that sounds produced and one
 * where every layer just plays at once and the loud things get lost. */
function duck(amount = 0.5, hold = 0.1, release = 0.55) {
  if (!bed || !bed.bus || !ctx) return
  const t = now()
  const g = bed.bus.gain
  g.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  g.linearRampToValueAtTime(amount, t + 0.035)
  g.setValueAtTime(amount, t + hold)
  g.linearRampToValueAtTime(1, t + hold + release)
}

/* Rises as you close on a door. Drives the cluster and the shimmer, so the room
 * gets audibly worse the nearer you get to going into it. */
export function setTension(v) {
  tension = Math.max(0, Math.min(1, v))
  if (!bed || !ctx || !running) return
  bed.cluster.gain.setTargetAtTime(0.008 + tension * 0.17, now(), 0.3)
  bed.shimmer.gain.setTargetAtTime(0.0035 + tension * 0.042, now(), 0.35)
}

/* Filtered noise rising and falling — non-pitched, so it reads as air moving
 * rather than as a note. */
function swell() {
  const t = now()
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.6
  bp.frequency.setValueAtTime(260, t)
  bp.frequency.linearRampToValueAtTime(900, t + 2.1)
  bp.frequency.linearRampToValueAtTime(240, t + 4.4)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.1, t + 2.0)
  g.gain.linearRampToValueAtTime(0.0001, t + 4.4)
  src.connect(bp).connect(g)
  out(g, 0.6)
  src.start(t, Math.random() * 2)
  src.stop(t + 4.6)
}

/* Metal dragged over concrete, somewhere behind you. */
function scrape() {
  const t = now()
  const pan = offCentre()
  const dur = 0.5 + Math.random() * 0.9
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 0.5 + Math.random() * 0.6
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 14
  bp.frequency.setValueAtTime(900 + Math.random() * 700, t)
  bp.frequency.linearRampToValueAtTime(1700 + Math.random() * 1400, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.16, t + 0.1)
  g.gain.linearRampToValueAtTime(0.09, t + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(g)
  out(g, 0.9, pan)
  src.start(t, Math.random() * 2)
  src.stop(t + dur + 0.1)
}

/* ---------------------------------------------------------------------------
 * Someone crying, a long way off.
 *
 * Filtered noise never reads as a person. What makes a sound human is formants:
 * fixed resonant peaks that the vocal tract imposes on a buzzing vocal fold,
 * independent of the pitch being sung. So this is a sawtooth — the buzz — fed
 * through three parallel bandpass filters tuned to the first three formants of
 * a mid-open vowel, which is the shape a mouth makes while sobbing.
 *
 * The rest is behaviour: sobs come in irregular bursts, pitch sags across the
 * phrase and lifts inside each sob, vibrato widens as it gets worse, and there
 * is an audible catch of breath between them. It sits almost entirely in the
 * reverb so it is always somewhere else in the building, never next to you.
 * ------------------------------------------------------------------------- */
function cry() {
  const t = now()
  const pan = offCentre()
  duck(0.55, 1.6, 1.2)
  const base = 250 + Math.random() * 85
  const sobs = 3 + Math.floor(Math.random() * 4)

  const voice = ctx.createGain()
  voice.gain.value = 0.0001

  // the buzz
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(base, t)

  // breathiness — real crying is not a clean tone
  const air = ctx.createBufferSource()
  air.buffer = noiseBuffer()
  air.loop = true
  const airGain = ctx.createGain()
  airGain.gain.value = 0.28

  // vibrato, widening as the phrase goes on
  const vib = ctx.createOscillator()
  vib.type = 'sine'
  vib.frequency.value = 5.4 + Math.random() * 1.4
  const vibAmt = ctx.createGain()
  vibAmt.gain.setValueAtTime(6, t)
  vib.connect(vibAmt).connect(osc.frequency)
  vib.start(t)

  // three formants of a mid-open vowel
  const bus = ctx.createGain()
  osc.connect(bus)
  air.connect(airGain).connect(bus)
  for (const [freq, q, gain] of [
    [780, 9, 1.0],
    [1180, 11, 0.6],
    [2750, 13, 0.22],
  ]) {
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq * (0.94 + Math.random() * 0.12)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = gain
    bus.connect(f).connect(g).connect(voice)
  }

  // sob envelope
  let at = t
  let pitch = base
  for (let i = 0; i < sobs; i++) {
    const dur = 0.17 + Math.random() * 0.19
    const gap = 0.09 + Math.random() * 0.2
    const peak = 0.09 + Math.random() * 0.06

    // each sob lifts then collapses; the phrase as a whole sags
    osc.frequency.setValueAtTime(pitch, at)
    osc.frequency.linearRampToValueAtTime(pitch * 1.11, at + dur * 0.35)
    osc.frequency.linearRampToValueAtTime(pitch * 0.9, at + dur)
    vibAmt.gain.linearRampToValueAtTime(6 + i * 4, at + dur)

    voice.gain.linearRampToValueAtTime(peak, at + dur * 0.3)
    voice.gain.linearRampToValueAtTime(peak * 0.55, at + dur * 0.75)
    voice.gain.linearRampToValueAtTime(0.004, at + dur)

    // the catch of breath before the next one
    const gasp = ctx.createBufferSource()
    gasp.buffer = noiseBuffer()
    gasp.playbackRate.value = 1.5
    const gf = ctx.createBiquadFilter()
    gf.type = 'bandpass'
    gf.Q.value = 2.2
    gf.frequency.setValueAtTime(500, at + dur)
    gf.frequency.linearRampToValueAtTime(1500, at + dur + gap * 0.8)
    const gg = ctx.createGain()
    gg.gain.setValueAtTime(0.0001, at + dur)
    gg.gain.linearRampToValueAtTime(0.032, at + dur + gap * 0.5)
    gg.gain.exponentialRampToValueAtTime(0.0001, at + dur + gap)
    gasp.connect(gf).connect(gg)
    out(gg, 0.9, pan)
    gasp.start(at + dur, Math.random() * 2)
    gasp.stop(at + dur + gap + 0.05)

    at += dur + gap
    pitch *= 0.965
  }
  voice.gain.linearRampToValueAtTime(0.0001, at + 0.3)

  // mostly reverb, little direct sound: it is never in the room with you
  const far = ctx.createGain()
  far.gain.value = 0.5
  voice.connect(far)
  out(far, 2.2, pan)
  osc.start(t)
  osc.stop(at + 0.4)
  air.start(t, Math.random() * 2)
  air.stop(at + 0.4)
  vib.stop(at + 0.4)
}

/* Two notes of something like a music box, a semitone out of tune with itself.
 * Nothing says wrong quite as economically. */
function bell() {
  const t = now()
  const root = 523.25 * (Math.random() < 0.5 ? 1 : 0.75)
  const notes = [root, root * 1.1892] // a flat minor third
  notes.forEach((f, i) => {
    const at = t + i * (0.42 + Math.random() * 0.2)
    for (const [mult, amp, dec] of [
      [1, 0.12, 2.6],
      [2.76, 0.05, 1.7],
      [5.4, 0.02, 1.1],
    ]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f * mult * (1 + (Math.random() - 0.5) * 0.012)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(amp, at + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, at + dec)
      o.connect(g)
      out(g, 1.0)
      o.start(at)
      o.stop(at + dec + 0.1)
    }
  })
}

/* There used to be a dropout effect here that cut the bed for a second and a
 * half. It earned its place when the bed was a wall of sound; against a bed
 * that is already near silence there is nothing to take away. */

function thump(freq, dur, amp) {
  const t = now()
  const o = ctx.createOscillator()
  // triangle, not sine: the odd harmonics are what carry a low thump through
  // a speaker that cannot reproduce the fundamental
  o.type = 'triangle'
  o.frequency.setValueAtTime(freq, t)
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(amp, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 3)
  o.connect(g)
  out(g, 0.2)
  o.start(t)
  o.stop(t + dur * 3.2)
}

/* Something heavy shifting, a long way off. The noise transient is what makes
 * it audible on a small speaker; the falling tone underneath gives it weight
 * for anyone on headphones. */
function knock() {
  const t = now()
  const pan = offCentre()
  duck(0.7, 0.05, 0.4)

  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 0.9
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 420
  bp.Q.value = 2.2
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.34, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  src.connect(bp).connect(ng)
  out(ng, 0.9, pan)
  src.start(t, Math.random() * 2)
  src.stop(t + 0.35)

  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(140, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.26)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
  o.connect(g)
  out(g, 0.85, pan)
  o.start(t)
  o.stop(t + 0.7)
}

/* Metal under load, somewhere in the structure. */
function groan() {
  const t = now()
  const pan = offCentre()
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  const base = 60 + Math.random() * 50
  o.frequency.setValueAtTime(base, t)
  o.frequency.linearRampToValueAtTime(base * 1.35, t + 2.2)
  o.frequency.linearRampToValueAtTime(base * 0.9, t + 3.6)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 300
  bp.Q.value = 11
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.16, t + 0.9)
  g.gain.linearRampToValueAtTime(0.11, t + 2.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8)
  o.connect(bp).connect(g)
  out(g, 0.9, pan)
  o.start(t)
  o.stop(t + 4)
}

/* Not words. Just enough formant movement that your ear tries to make them. */
function whisper() {
  const t = now()
  const pan = offCentre()
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 0.7 + Math.random() * 0.5
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 7
  bp.frequency.setValueAtTime(700, t)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  // syllables
  const n = 4 + Math.floor(Math.random() * 4)
  let tt = t
  for (let i = 0; i < n; i++) {
    const dur = 0.09 + Math.random() * 0.13
    bp.frequency.setValueAtTime(520 + Math.random() * 1500, tt)
    g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, tt + dur * 0.4)
    g.gain.linearRampToValueAtTime(0.004, tt + dur)
    tt += dur + Math.random() * 0.05
  }
  g.gain.linearRampToValueAtTime(0.0001, tt + 0.2)
  src.connect(bp).connect(g)
  out(g, 1.0, pan)
  src.start(t, Math.random() * 2)
  src.stop(tt + 0.3)
}

/* ---- footsteps ----------------------------------------------------------- */

/* One boot on wet concrete. Running is not just faster — it is a harder heel
 * strike, more scuff, and more of the room. */
export function footstep(velocity = 1, sprint = false) {
  if (!running || !ctx) return
  const t = now()
  const v = Math.min(1, Math.max(0.2, velocity))
  const power = sprint ? 1.55 : 1

  // heel scuff
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = (sprint ? 1.1 : 0.8) + Math.random() * 0.5
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = (sprint ? 1300 : 900) + Math.random() * 700
  bp.Q.value = sprint ? 0.8 : 1.1
  const g = ctx.createGain()
  const dur = sprint ? 0.1 : 0.14
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.34 * v * power, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(g)
  out(g, sprint ? 0.3 : 0.2)
  src.start(t, Math.random() * 2)
  src.stop(t + dur + 0.06)

  // body of the step
  const o = ctx.createOscillator()
  o.type = 'sine'
  const f0 = sprint ? 190 : 150
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(sprint ? 55 : 62, t + 0.1)
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.0001, t)
  og.gain.exponentialRampToValueAtTime(0.3 * v * power, t + 0.007)
  og.gain.exponentialRampToValueAtTime(0.0001, t + (sprint ? 0.2 : 0.17))
  o.connect(og)
  out(og, 0.25)
  o.start(t)
  o.stop(t + 0.24)

  // running adds a slap of grit being kicked forward
  if (sprint) {
    const gr = ctx.createBufferSource()
    gr.buffer = noiseBuffer()
    gr.playbackRate.value = 2.2
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3200
    const gg = ctx.createGain()
    gg.gain.setValueAtTime(0.1 * v, t + 0.02)
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    gr.connect(hp).connect(gg)
    out(gg, 0.35)
    gr.start(t + 0.02, Math.random())
    gr.stop(t + 0.14)
  }
}

/* In and out, through the teeth. Called on alternate strides while sprinting. */
export function breath(inhale = true) {
  if (!running || !ctx) return
  const t = now()
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 1.4
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(inhale ? 700 : 480, t)
  bp.frequency.linearRampToValueAtTime(inhale ? 1250 : 320, t + 0.32)
  bp.Q.value = 1.4
  const g = ctx.createGain()
  const peak = inhale ? 0.13 : 0.1
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + (inhale ? 0.14 : 0.06))
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
  src.connect(bp).connect(g)
  out(g, 0.3)
  src.start(t, Math.random() * 2)
  src.stop(t + 0.42)
}

/* ---- doors --------------------------------------------------------------- */

/* Deliberately the loudest thing in the build: a latch letting go, eighty kilos
 * of steel swinging on dry hinges, and the whole corridor answering. */
export function doorOpen() {
  if (!running || !ctx) return
  const t = now()
  duck(0.35, 0.5, 1.1)

  // latch mechanism — bright, mechanical, immediate
  for (const [off, freq, amp] of [
    [0, 2600, 0.5],
    [0.035, 1800, 0.36],
    [0.07, 3400, 0.28],
  ]) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer()
    src.playbackRate.value = 2.6
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq
    bp.Q.value = 3
    const g = ctx.createGain()
    g.gain.setValueAtTime(amp, t + off)
    g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.06)
    src.connect(bp).connect(g)
    out(g, 0.6)
    src.start(t + off, Math.random())
    src.stop(t + off + 0.09)
  }

  // the hinge — stuttered pitch is what reads as metal grinding on metal
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1400
  bp.Q.value = 8
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t + 0.06)
  g.gain.linearRampToValueAtTime(0.3, t + 0.3)
  g.gain.linearRampToValueAtTime(0.2, t + 1.1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
  for (let i = 0; i < 34; i++) {
    const tt = t + 0.06 + i * 0.045
    o.frequency.setValueAtTime(110 + Math.random() * 320 + i * 11, tt)
  }
  o.connect(bp).connect(g)
  out(g, 0.85)
  o.start(t)
  o.stop(t + 1.7)

  // the leaf hitting its stop, and the corridor behind it
  const bt = t + 1.25
  const th = ctx.createOscillator()
  th.type = 'sine'
  th.frequency.setValueAtTime(85, bt)
  th.frequency.exponentialRampToValueAtTime(28, bt + 0.5)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.0001, bt)
  tg.gain.exponentialRampToValueAtTime(0.9, bt + 0.012)
  tg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.9)
  th.connect(tg)
  out(tg, 1.0)
  th.start(bt)
  th.stop(bt + 1)

  const cl = ctx.createBufferSource()
  cl.buffer = noiseBuffer()
  cl.playbackRate.value = 1.1
  const clf = ctx.createBiquadFilter()
  clf.type = 'lowpass'
  clf.frequency.value = 1800
  const clg = ctx.createGain()
  clg.gain.setValueAtTime(0.55, bt)
  clg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.4)
  cl.connect(clf).connect(clg)
  out(clg, 1.0)
  cl.start(bt, Math.random())
  cl.stop(bt + 0.5)
}

/* Pulled shut behind you. */
export function doorClose() {
  if (!running || !ctx) return
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(34, t + 0.35)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
  o.connect(g)
  out(g, 0.9)
  o.start(t)
  o.stop(t + 0.8)
}

/* ---- incidentals --------------------------------------------------------- */

/* Dry electrical tick when a failing tube strikes. */
export function tick() {
  if (!running || !ctx) return
  const t = now()
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 2.4
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2600
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.2, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  src.connect(hp).connect(g)
  out(g, 0.45)
  src.start(t, Math.random())
  src.stop(t + 0.07)
}

/* Low swell when you cross a threshold. */
export function stinger() {
  if (!running || !ctx) return
  const t = now()
  duck(0.45, 0.6, 1.4)
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(30, t)
  o.frequency.exponentialRampToValueAtTime(19, t + 2.4)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(700, t)
  lp.frequency.exponentialRampToValueAtTime(90, t + 2.4)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.5, t + 0.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
  o.connect(lp).connect(g)
  out(g, 0.7)
  o.start(t)
  o.stop(t + 2.7)
}
